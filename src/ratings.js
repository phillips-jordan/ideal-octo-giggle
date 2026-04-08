const CONCURRENCY = 5;
const OL_BASE = 'https://openlibrary.org/search.json';
const OL_FIELDS = 'title,author_name,isbn,ratings_average,ratings_count';
const GB_BASE = 'https://www.googleapis.com/books/v1/volumes';
const USER_AGENT = 'kobo-ratings-app/1.0 (https://github.com/phillips-jordan/ideal-octo-giggle)';

const log = (msg) => console.log(`[ratings] ${msg}`);

export async function enrichWithRatings(books) {
  const total = books.length;
  const batchCount = Math.ceil(total / CONCURRENCY);
  const gbKey = process.env.GOOGLE_BOOKS_API_KEY;
  log(`Starting: ${total} book${total !== 1 ? 's' : ''} across ${batchCount} batch${batchCount !== 1 ? 'es' : ''} (concurrency=${CONCURRENCY})`);
  log(`Primary: Google Books API ${gbKey ? '(with API key)' : '(no API key — set GOOGLE_BOOKS_API_KEY to raise quota)'}`);
  log(`Fallback: Open Library`);

  const results = [];
  let olMatched = 0;
  let gbMatched = 0;
  const startTime = Date.now();

  for (let i = 0; i < books.length; i += CONCURRENCY) {
    const chunk = books.slice(i, i + CONCURRENCY);
    const batchNum = Math.floor(i / CONCURRENCY) + 1;
    log(`Batch ${batchNum}/${batchCount}: [${chunk.map(b => b.title).join(', ')}]`);

    const settled = await Promise.allSettled(chunk.map(b => fetchRating(b, gbKey)));

    settled.forEach((result, idx) => {
      const book = chunk[idx];
      if (result.status === 'fulfilled') {
        const { ratingsAverage, ratingsCount, ratingSource } = result.value;
        if (ratingsAverage != null) {
          const source = ratingSource === 'google' ? 'Google Books' : 'Open Library';
          if (ratingSource === 'google') gbMatched++; else olMatched++;
          log(`  ✓ "${book.title}" → ${ratingsAverage.toFixed(2)} ★ (${ratingsCount.toLocaleString()} ratings) [${source}]`);
        } else {
          log(`  – "${book.title}" → no rating found on Google Books or Open Library`);
        }
        results.push({ ...book, ...result.value });
      } else {
        log(`  ✗ "${book.title}" → ${result.reason?.message ?? 'unknown error'}`);
        results.push({ ...book, ratingsAverage: null, ratingsCount: 0, olTitle: null, ratingSource: null });
      }
    });
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const total_matched = olMatched + gbMatched;
  log(`Done: ${total_matched}/${total} matched (${olMatched} Open Library, ${gbMatched} Google Books) in ${elapsed}s`);

  return results;
}

async function fetchRating(book, gbKey) {
  // ── Step 1: Google Books (primary) ────────────────────────────────
  try {
    const gbData = await fetchGoogleBooksRating(book, gbKey);
    if (gbData != null) {
      return {
        ratingsAverage: gbData.ratingsAverage,
        ratingsCount: gbData.ratingsCount,
        olTitle: null,
        ratingSource: 'google',
      };
    }
  } catch (err) {
    log(`  ! Google Books lookup failed for "${book.title}": ${err.message}`);
  }

  // ── Step 2: Open Library fallback ────────────────────────────────
  const olData = book.isbn
    ? await searchOlByIsbn(book.isbn)
    : await searchOlByTitleAuthor(book.title, book.author);

  if (olData?.ratings_average != null) {
    return {
      ratingsAverage: olData.ratings_average,
      ratingsCount: olData.ratings_count ?? 0,
      olTitle: olData.title ?? null,
      ratingSource: 'openlibrary',
    };
  }

  return {
    ratingsAverage: null,
    ratingsCount: 0,
    olTitle: olData?.title ?? null,
    ratingSource: null,
  };
}

// ── Open Library ──────────────────────────────────────────────────────

async function searchOlByIsbn(isbn) {
  const url = `${OL_BASE}?isbn=${encodeURIComponent(isbn)}&limit=1&fields=${OL_FIELDS}`;
  return fetchOlFirstDoc(url);
}

async function searchOlByTitleAuthor(title, author) {
  const params = new URLSearchParams({ limit: '1', fields: OL_FIELDS });
  params.set('title', title);
  if (author) params.set('author', author);
  return fetchOlFirstDoc(`${OL_BASE}?${params}`);
}

async function fetchOlFirstDoc(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Open Library API returned ${res.status}`);
  const json = await res.json();
  return json.docs?.[0] ?? null;
}

// ── Google Books ──────────────────────────────────────────────────────

async function fetchGoogleBooksRating(book, apiKey) {
  const keyParam = apiKey ? `&key=${encodeURIComponent(apiKey)}` : '';
  const fields = 'fields=items(volumeInfo/averageRating,volumeInfo/ratingsCount)';

  let query;
  if (book.isbn) {
    query = `isbn:${encodeURIComponent(book.isbn)}`;
  } else {
    query = `intitle:${encodeURIComponent(book.title)}`;
    if (book.author) query += `+inauthor:${encodeURIComponent(book.author)}`;
  }

  const url = `${GB_BASE}?q=${query}&maxResults=1&${fields}${keyParam}`;

  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) throw new Error(`Google Books API returned ${res.status}`);

  const json = await res.json();
  const info = json.items?.[0]?.volumeInfo;

  if (info?.averageRating == null) return null;

  return {
    ratingsAverage: info.averageRating,
    ratingsCount: info.ratingsCount ?? 0,
  };
}
