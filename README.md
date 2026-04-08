# Kobo Library Ratings

Rank your Kobo eReader library by community ratings from [Open Library](https://openlibrary.org). Upload your device's database file and instantly see your books sorted by their average rating.

![Screenshot showing books ranked by rating in a sortable table](https://placehold.co/800x400?text=Kobo+Library+Ratings)

## What it does

1. You upload the `KoboReader.sqlite` file from your Kobo device
2. The app extracts your library (title, author, ISBN, read status, progress)
3. It looks up community ratings for each book via the Open Library API
4. Your library is displayed in a sortable, filterable table — ranked by rating by default

**Your file is deleted from the server immediately after processing. Nothing is stored.**

## Quick start with Docker

The easiest way to run the app. Requires [Docker](https://docs.docker.com/get-docker/) with the Compose plugin.

```bash
git clone https://github.com/phillips-jordan/ideal-octo-giggle.git
cd ideal-octo-giggle
docker compose up
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

To stop the app:

```bash
docker compose down
```

## Local setup (without Docker)

**Prerequisites:** [Node.js](https://nodejs.org) 18 or later.

```bash
git clone https://github.com/phillips-jordan/ideal-octo-giggle.git
cd ideal-octo-giggle
npm install
npm start
```

For development with auto-restart on file changes:

```bash
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Testing with mock data

A mock database with 20 books is included at `mocks/KoboReader.sqlite` so you can try the app without a real Kobo device. Upload it from the browser like any other file.

To regenerate it (e.g. after changing the book list):

```bash
node mocks/generate.js
```

## How to find your KoboReader.sqlite file

1. Connect your Kobo to your computer via USB
2. Open the Kobo drive in your file manager
3. Navigate to the `.kobo` folder (it's hidden — see below)
4. Upload the `KoboReader.sqlite` file found inside

**Showing hidden files:**
- **Windows:** In File Explorer, open the View menu and enable "Show hidden items"
- **Mac:** In Finder, press `Cmd + Shift + .` (period) to toggle hidden files
- **Linux:** Press `Ctrl + H` in your file manager, or use `ls -a` in the terminal

## Features

- **Sort** by rating, title, author, read status, or % read — click any column header
- **Filter** by read status: All / Unread / Reading / Finished
- **Color-coded ratings:** green (≥ 4.0), amber (≥ 3.0), red (< 3.0)
- **Read status badges** and progress bars for each book
- Books with no rating data on Open Library sort to the bottom

## How it works

```
Browser → POST /api/upload (KoboReader.sqlite)
  ↓
parser.js   — opens the SQLite file, queries the content table for epub books
  ↓
ratings.js  — fetches ratings from Open Library in batches of 5 concurrent requests
              (by ISBN when available, title + author fallback)
  ↓
router.js   — deletes the uploaded file, returns enriched book list as JSON
  ↓
Browser     — renders a sortable/filterable table
```

**Tech stack:** Node.js · Express · [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) · [multer](https://github.com/expressjs/multer) · vanilla HTML/CSS/JS

## Configuration

| Environment variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the server listens on |

To change the port with Docker Compose, edit the `ports` mapping in `docker-compose.yml`. For local runs, set the variable before starting:

```bash
PORT=8080 npm start
```

## Privacy

- Your `KoboReader.sqlite` file is uploaded only to the server you're running locally
- The file is deleted from disk immediately after the book list is extracted
- Book titles, authors, and ISBNs are sent to the [Open Library API](https://openlibrary.org/developers) to fetch ratings
- No data is stored, logged, or shared beyond those API calls
