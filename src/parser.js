import Database from 'better-sqlite3';

export function parseKoboDb(filePath) {
  let db;
  try {
    db = new Database(filePath, { readonly: true });
  } catch (err) {
    throw new Error('Could not open file as a SQLite database. Is this a KoboReader.sqlite file?');
  }

  let rows;
  try {
    rows = db.prepare(`
      SELECT
        Title,
        Attribution  AS author,
        ISBN,
        ReadStatus,
        ___PercentRead AS percentRead
      FROM content
      WHERE ContentType = 6
        AND MimeType = 'application/epub+zip'
        AND Title IS NOT NULL
        AND Title != ''
    `).all();
  } catch (err) {
    if (err.message.includes('no such table')) {
      throw new Error('This doesn\'t appear to be a KoboReader.sqlite file — the expected table structure was not found.');
    }
    throw err;
  } finally {
    db.close();
  }

  return rows.map(row => ({
    title: row.Title.trim(),
    author: row.author ? row.author.trim() : null,
    isbn: normalizeIsbn(row.ISBN),
    readStatus: row.ReadStatus ?? 0,
    percentRead: row.percentRead ?? 0,
  }));
}

function normalizeIsbn(raw) {
  if (!raw) return null;
  const cleaned = raw.replace(/[\s\-]/g, '');
  return (cleaned.length === 13 || cleaned.length === 10) ? cleaned : null;
}
