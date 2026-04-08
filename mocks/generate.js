/**
 * Generates a mock KoboReader.sqlite file with 20 books for local testing.
 * Run with: node mocks/generate.js
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, unlinkSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'KoboReader.sqlite');

if (existsSync(OUT)) unlinkSync(OUT);

const db = new Database(OUT);

// Minimal Kobo content table schema — includes all columns the parser queries
db.exec(`
  CREATE TABLE content (
    ContentID       TEXT PRIMARY KEY,
    ContentType     INTEGER,
    MimeType        TEXT,
    Title           TEXT,
    Attribution     TEXT,
    Publisher       TEXT,
    ISBN            TEXT,
    ReadStatus      INTEGER DEFAULT 0,
    ___PercentRead  REAL    DEFAULT 0,
    DateCreated     TEXT,
    DateLastRead    TEXT
  );
`);

const books = [
  {
    title: 'The Great Gatsby',
    author: 'F. Scott Fitzgerald',
    isbn: '9780743273565',
    readStatus: 2,
    percentRead: 100,
  },
  {
    title: 'To Kill a Mockingbird',
    author: 'Harper Lee',
    isbn: '9780061935466',
    readStatus: 2,
    percentRead: 100,
  },
  {
    title: 'Nineteen Eighty-Four',
    author: 'George Orwell',
    isbn: '9780451524935',
    readStatus: 2,
    percentRead: 100,
  },
  {
    title: 'Pride and Prejudice',
    author: 'Jane Austen',
    isbn: '9780141439518',
    readStatus: 1,
    percentRead: 62,
  },
  {
    title: "The Hitchhiker's Guide to the Galaxy",
    author: 'Douglas Adams',
    isbn: '9780345391803',
    readStatus: 2,
    percentRead: 100,
  },
  {
    title: 'Dune',
    author: 'Frank Herbert',
    isbn: '9780441013593',
    readStatus: 1,
    percentRead: 41,
  },
  {
    title: 'Neuromancer',
    author: 'William Gibson',
    isbn: '9780441569595',
    readStatus: 0,
    percentRead: 0,
  },
  {
    title: 'The Name of the Wind',
    author: 'Patrick Rothfuss',
    isbn: '9780756404079',
    readStatus: 2,
    percentRead: 100,
  },
  {
    title: 'Sapiens: A Brief History of Humankind',
    author: 'Yuval Noah Harari',
    isbn: '9780062316097',
    readStatus: 1,
    percentRead: 78,
  },
  {
    title: 'The Martian',
    author: 'Andy Weir',
    isbn: '9780804139021',
    readStatus: 2,
    percentRead: 100,
  },
  {
    title: 'Project Hail Mary',
    author: 'Andy Weir',
    isbn: '9780593135204',
    readStatus: 0,
    percentRead: 0,
  },
  {
    title: 'Recursion',
    author: 'Blake Crouch',
    isbn: '9781524759773',
    readStatus: 1,
    percentRead: 55,
  },
  {
    title: 'The Three-Body Problem',
    author: 'Liu Cixin',
    isbn: '9780765382030',
    readStatus: 2,
    percentRead: 100,
  },
  {
    title: 'Piranesi',
    author: 'Susanna Clarke',
    isbn: '9781635575637',
    readStatus: 0,
    percentRead: 0,
  },
  {
    title: 'The Invisible Life of Addie LaRue',
    author: 'V. E. Schwab',
    isbn: '9780765387561',
    readStatus: 1,
    percentRead: 33,
  },
  {
    title: 'A Short History of Nearly Everything',
    author: 'Bill Bryson',
    isbn: '9780767908184',
    readStatus: 0,
    percentRead: 0,
  },
  {
    title: 'Educated',
    author: 'Tara Westover',
    isbn: '9780399590504',
    readStatus: 2,
    percentRead: 100,
  },
  {
    title: 'The Midnight Library',
    author: 'Matt Haig',
    isbn: '9780525559474',
    readStatus: 1,
    percentRead: 88,
  },
  {
    title: 'Klara and the Sun',
    author: 'Kazuo Ishiguro',
    isbn: '9780571364886',
    readStatus: 0,
    percentRead: 0,
  },
  {
    title: 'The House in the Cerulean Sea',
    author: 'TJ Klune',
    isbn: '9781250217288',
    readStatus: 2,
    percentRead: 100,
  },
];

const insert = db.prepare(`
  INSERT INTO content
    (ContentID, ContentType, MimeType, Title, Attribution, ISBN, ReadStatus, ___PercentRead, DateCreated)
  VALUES
    (@contentId, 6, 'application/epub+zip', @title, @author, @isbn, @readStatus, @percentRead, @dateCreated)
`);

const insertAll = db.transaction((rows) => {
  for (const book of rows) {
    insert.run({
      contentId: `file:///mnt/onboard/${book.author.replace(/\s+/g, '_')}/${book.title.replace(/\s+/g, '_')}.epub`,
      title: book.title,
      author: book.author,
      isbn: book.isbn,
      readStatus: book.readStatus,
      percentRead: book.percentRead,
      dateCreated: new Date(
        Date.now() - Math.floor(Math.random() * 365 * 24 * 60 * 60 * 1000)
      ).toISOString(),
    });
  }
});

insertAll(books);
db.close();

console.log(`Created ${OUT} with ${books.length} books.`);
