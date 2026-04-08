const CONCURRENCY = 5;
const OL_BASE = 'https://openlibrary.org/search.json';
const FIELDS = 'title,author_name,isbn,ratings_average,ratings_count';
const USER_AGENT = 'kobo-ratings-app/1.0 (https://github.com/phillips-jordan/ideal-octo-giggle)';

const log = (msg) => console.log(`[ratings] ${msg}`);

export async function enrichWithRatings(books) {
  const total = books.length;
  const batchCount = Math.ceil(total / CONCURRENCY);
  log(`Starting: ${total} book${total !== 1 ? 's' : ''} across ${batchCount} batch${batchCount !== 1 ? 'es' : ''} (concurrency=${CONCURRENCY})`);

  const results = [];
  let matched = 0;
  const startTime = Date.now();

  for (let i = 0; i < books.length; i += CONCURRENCY) {
    const chunk = books.slice(i, i + CONCURRENCY);
    const batchNum = Math.floor(i / CONCURRENCY) + 1;
    log(`Batch ${batchNum}/${batchCount}: [${chunk.map(b => b.title).join(', ')}]`);

    const settled = await Promise.allSettled(chunk.map(fetchRating));

    settled.forEach((result, idx) => {
      const book = chunk[idx];
      if (result.status === 'fulfilled') {
        const { ratingsAverage, ratingsCount } = result.value;
        if (ratingsAverage != null) {
          matched++;
          log(`  ✓ "${book.title}" → ${ratingsAverage.toFixed(2)} ★ (${ratingsCount.toLocaleString()} ratings)`);
        } else {
          log(`  – "${book.title}" → found on OL but no rating data`);
        }
        results.push({ ...book, ...result.value });
      } else {
        log(`  ✗ "${book.title}" → ${result.reason?.message ?? 'unknown error'}`);
        results.push({ ...book, ratingsAverage: null, ratingsCount: 0, olTitle: null });
      }
    });
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log(`Done: ${matched}/${total} books matched with ratings in ${elapsed}s`);

  return results;
}

async function fetchRating(book) {
  const data = book.isbn
    ? await searchByIsbn(book.isbn)
    : await searchByTitleAuthor(book.title, book.author);

  return {
    ratingsAverage: data?.ratings_average ?? null,
    ratingsCount: data?.ratings_count ?? 0,
    olTitle: data?.title ?? null,
  };
}

async function searchByIsbn(isbn) {
  const url = `${OL_BASE}?isbn=${encodeURIComponent(isbn)}&limit=1&fields=${FIELDS}`;
  return fetchFirstDoc(url);
}

async function searchByTitleAuthor(title, author) {
  const params = new URLSearchParams({ limit: '1', fields: FIELDS });
  params.set('title', title);
  if (author) params.set('author', author);
  return fetchFirstDoc(`${OL_BASE}?${params}`);
}

async function fetchFirstDoc(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) throw new Error(`Open Library API returned ${res.status}`);

  const json = await res.json();
  return json.docs?.[0] ?? null;
}
