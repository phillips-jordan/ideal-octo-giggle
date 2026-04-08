import { Router } from 'express';
import multer from 'multer';
import { mkdirSync, unlink } from 'fs';
import { parseKoboDb } from './parser.js';
import { enrichWithRatings } from './ratings.js';

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

// Handle multer errors (e.g. wrong file type, file too large)
// eslint-disable-next-line no-unused-vars
router.use((err, _req, res, _next) => {
  res.status(400).json({ error: err.message || 'File upload failed.' });
});

export default router;
