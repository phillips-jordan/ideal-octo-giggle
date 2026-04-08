import { Router } from 'express';
import { json } from 'express';
import multer from 'multer';
import { mkdirSync, unlink } from 'fs';
import { parseKoboDb } from './parser.js';
import { enrichWithRatings } from './ratings.js';
import { scrapeBook, delay } from './goodreads.js';

mkdirSync('uploads', { recursive: true });

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.originalname.endsWith('.sqlite')) {
      cb(null, true);
    } else {
      cb(new Error('Only .sqlite files are accepted.'));
    }
  },
});

const router = Router();

// ── POST /upload ──────────────────────────────────────────────────────
router.post('/upload', upload.single('db'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No valid .sqlite file uploaded.' });
  }

  const filePath = req.file.path;

  try {
    const books = parseKoboDb(filePath);

    if (books.length === 0) {
      return res.json({ books: [] });
    }

    const enriched = await enrichWithRatings(books);
    res.json({ books: enriched });
  } catch (err) {
    const status = err.message.includes('KoboReader') || err.message.includes('SQLite') ? 400 : 500;
    res.status(status).json({ error: err.message });
  } finally {
    unlink(filePath, () => {});
  }
});

// ── POST /goodreads  (SSE stream) ─────────────────────────────────────
router.post('/goodreads', json(), async (req, res) => {
  const books = req.body?.books;

  if (!Array.isArray(books) || books.length === 0) {
    return res.status(400).json({ error: 'Request body must include a non-empty books array.' });
  }

  // Establish SSE connection
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (payload) => res.write(`data: ${JSON.stringify(payload)}\n\n`);

  const total = books.length;
  let matched = 0;

  console.log(`[goodreads] Starting scrape for ${total} book${total !== 1 ? 's' : ''}`);

  try {
    for (let i = 0; i < books.length; i++) {
      const book = books[i];
      const result = await scrapeBook(book);

      send({ title: book.title, isbn: book.isbn ?? null, ...result });

      if (result.grRating != null) matched++;

      // Delay between requests, but not after the last one
      if (i < books.length - 1) await delay();
    }
  } finally {
    console.log(`[goodreads] Done: ${matched}/${total} matched`);
    send({ done: true, matched, total });
    res.end();
  }
});

// ── Multer error handler ──────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
router.use((err, _req, res, _next) => {
  res.status(400).json({ error: err.message || 'File upload failed.' });
});

export default router;
