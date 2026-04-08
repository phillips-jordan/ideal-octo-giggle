import * as cheerio from 'cheerio';

const GR_BASE = 'https://www.goodreads.com';
const DELAY_MS = 2000;

const log = (msg) => console.log(`[goodreads] ${msg}`);

// Browser-like headers to avoid immediate 403s
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
};

/**
 * Scrape Goodreads rating data for a single book.
 * @param {{ title: string, author: string|null, isbn: string|null }} book
 * @returns {{ grRating: number|null, grRatingsCount: number, grReviewsCount: number, error?: string }}
 */
export async function scrapeBook(book) {
  try {
    const bookUrl = await findBookUrl(book);
    if (!bookUrl) {
      log(`  – "${book.title}" → no search result found`);
      return { grRating: null, grRatingsCount: 0, grReviewsCount: 0, error: 'not found' };
    }

    const data = await scrapeBookPage(bookUrl, book.title);
    if (data.grRating != null) {
      log(`  ✓ "${book.title}" → ${data.grRating.toFixed(2)} ★ (${data.grRatingsCount.toLocaleString()} ratings, ${data.grReviewsCount.toLocaleString()} reviews)`);
    } else {
      log(`  – "${book.title}" → page found but no rating data`);
    }
    return data;
  } catch (err) {
    log(`  ✗ "${book.title}" → ${err.message}`);
    return { grRating: null, grRatingsCount: 0, grReviewsCount: 0, error: err.message };
  }
}

async function findBookUrl(book) {
  // Prefer ISBN search — more precise
  const query = book.isbn
    ? book.isbn
    : [book.title, book.author].filter(Boolean).join(' ');

  const searchUrl = `${GR_BASE}/search?q=${encodeURIComponent(query)}`;
  log(`  Searching: ${searchUrl}`);

  const html = await fetchHtml(searchUrl);
  const $ = cheerio.load(html);

  // Try search results table first
  const firstResult = $('table#searchResults tr.bookTitle a').first().attr('href')
    || $('a.bookTitle').first().attr('href');

  if (!firstResult) return null;

  // href is relative like /book/show/4671 — make absolute
  return firstResult.startsWith('http') ? firstResult : `${GR_BASE}${firstResult}`;
}

async function scrapeBookPage(url, title) {
  log(`  Fetching: ${url}`);
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  // ── Strategy 1: JSON-LD structured data (most reliable) ──────────
  const ldJson = extractJsonLd($);
  if (ldJson?.aggregateRating?.ratingValue != null) {
    const ag = ldJson.aggregateRating;
    return {
      grRating: parseFloat(ag.ratingValue),
      grRatingsCount: parseInt(ag.ratingCount ?? ag.reviewCount ?? 0, 10),
      grReviewsCount: parseInt(ag.reviewCount ?? 0, 10),
    };
  }

  // ── Strategy 2: DOM selectors (newer Goodreads layout) ───────────
  const domRating = parseFloat(
    $('div.RatingStatistics__rating').first().text().trim()
    || $('[data-testid="ratingsCount"] span').first().text().trim()
  );

  if (!isNaN(domRating)) {
    const countText = $('[data-testid="ratingsCount"]').text().replace(/,/g, '');
    const reviewText = $('[data-testid="reviewsCount"]').text().replace(/,/g, '');
    return {
      grRating: domRating,
      grRatingsCount: parseInt(countText.match(/\d+/)?.[0] ?? '0', 10),
      grReviewsCount: parseInt(reviewText.match(/\d+/)?.[0] ?? '0', 10),
    };
  }

  // ── Strategy 3: Legacy itemprop selectors ────────────────────────
  const legacyRating = parseFloat($('span[itemprop="ratingValue"]').first().text().trim());
  if (!isNaN(legacyRating)) {
    const legacyCount = parseInt(
      $('meta[itemprop="ratingCount"]').attr('content')
      || $('span[itemprop="ratingCount"]').text().replace(/,/g, '') || '0',
      10
    );
    const legacyReviews = parseInt(
      $('meta[itemprop="reviewCount"]').attr('content')
      || $('span[itemprop="reviewCount"]').text().replace(/,/g, '') || '0',
      10
    );
    return { grRating: legacyRating, grRatingsCount: legacyCount, grReviewsCount: legacyReviews };
  }

  return { grRating: null, grRatingsCount: 0, grReviewsCount: 0 };
}

function extractJsonLd($) {
  let result = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (result) return;
    try {
      const parsed = JSON.parse($(el).html());
      // May be an array or a single object
      const entries = Array.isArray(parsed) ? parsed : [parsed];
      for (const entry of entries) {
        if (entry['@type'] === 'Book' || entry.aggregateRating) {
          result = entry;
          return false; // break cheerio .each()
        }
      }
    } catch {
      // malformed JSON-LD — skip
    }
  });
  return result;
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: HEADERS,
    signal: AbortSignal.timeout(10000),
    redirect: 'follow',
  });

  if (res.status === 403) throw new Error('Goodreads blocked the request (403)');
  if (res.status === 429) throw new Error('Goodreads rate-limited (429)');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  return res.text();
}

export function delay(ms = DELAY_MS) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
