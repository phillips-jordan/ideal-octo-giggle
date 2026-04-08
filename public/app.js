(function () {
  'use strict';

  const OL_COVER = 'https://covers.openlibrary.org/b/isbn';

  // ── State ──────────────────────────────────────────────────────────
  let allBooks = [];
  let sortCol = 'ratingsAverage';
  let sortDesc = true;
  let filterStatus = '';

  // ── Elements ───────────────────────────────────────────────────────
  const uploadSection  = document.getElementById('upload-section');
  const loadingSection = document.getElementById('loading-section');
  const resultsSection = document.getElementById('results-section');
  const dropZone       = document.getElementById('drop-zone');
  const fileInput      = document.getElementById('file-input');
  const uploadError    = document.getElementById('upload-error');
  const filterStatus$  = document.getElementById('filter-status');
  const bookCount      = document.getElementById('book-count');
  const newUploadBtn   = document.getElementById('new-upload-btn');
  const clearBtn       = document.getElementById('clear-btn');
  const grBtn          = document.getElementById('gr-btn');
  const grProgress     = document.getElementById('gr-progress');
  const tbody          = document.getElementById('books-tbody');
  const ths            = document.querySelectorAll('th[data-col]');

  // ── Upload / Drag-Drop ─────────────────────────────────────────────
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) handleFile(fileInput.files[0]);
  });

  async function handleFile(file) {
    if (!file.name.endsWith('.sqlite')) {
      showError('Please select a .sqlite file (KoboReader.sqlite).');
      return;
    }

    showLoading();

    const formData = new FormData();
    formData.append('db', file);

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();

      if (!res.ok) {
        showUpload();
        showError(data.error || 'An unexpected error occurred.');
        return;
      }

      allBooks = data.books;
      renderTable();
      showResults();
    } catch (err) {
      showUpload();
      showError('Could not reach the server. Is it running?');
    }
  }

  // ── Goodreads scrape ───────────────────────────────────────────────
  grBtn.addEventListener('click', fetchGoodreadsRatings);

  async function fetchGoodreadsRatings() {
    if (allBooks.length === 0) return;

    const total = allBooks.length;
    let done = 0;

    grBtn.disabled = true;
    grBtn.textContent = 'Fetching…';
    grProgress.textContent = `0 / ${total}`;
    grProgress.hidden = false;

    const books = allBooks.map(b => ({ title: b.title, author: b.author, isbn: b.isbn }));

    try {
      const res = await fetch('/api/goodreads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ books }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Server error ${res.status}`);
      }

      // Read SSE stream line by line
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep incomplete last line

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let payload;
          try { payload = JSON.parse(line.slice(6)); } catch { continue; }

          if (payload.done) {
            grBtn.textContent = `Goodreads done (${payload.matched}/${payload.total} matched)`;
            grBtn.disabled = false;
            grProgress.hidden = true;
            renderTable(); // final re-sort with all GR data in place
            return;
          }

          // Merge GR data into the matching book
          applyGrResult(payload);
          done++;
          grProgress.textContent = `${done} / ${total}`;

          // Re-render only the affected row for smooth progressive updates
          rerenderBookRow(payload.title, payload.isbn);
        }
      }
    } catch (err) {
      grBtn.textContent = 'Fetch Goodreads Ratings';
      grBtn.disabled = false;
      grProgress.hidden = true;
      console.error('[goodreads]', err.message);
    }
  }

  function applyGrResult(payload) {
    // Match by ISBN first (exact), fall back to title
    const book = allBooks.find(b =>
      (payload.isbn && b.isbn === payload.isbn) || b.title === payload.title
    );
    if (!book || payload.error) return;

    book.ratingsAverage = payload.grRating ?? book.ratingsAverage;
    book.ratingsCount   = payload.grRatingsCount ?? book.ratingsCount;
    book.grReviewsCount = payload.grReviewsCount ?? 0;
    if (payload.grRating != null) book.ratingSource = 'goodreads';
  }

  function rerenderBookRow(title, isbn) {
    const book = allBooks.find(b =>
      (isbn && b.isbn === isbn) || b.title === title
    );
    if (!book) return;

    // Find the existing <tr> in the current DOM and replace it in-place
    const rows = tbody.querySelectorAll('tr');
    for (const row of rows) {
      const titleCell = row.querySelector('td.col-title');
      if (titleCell && titleCell.textContent === book.title) {
        row.replaceWith(renderRow(book));
        return;
      }
    }
  }

  // ── Filter & Sort ──────────────────────────────────────────────────
  filterStatus$.addEventListener('change', () => {
    filterStatus = filterStatus$.value;
    renderTable();
  });

  function resetToUpload() {
    allBooks = [];
    filterStatus = '';
    sortCol = 'ratingsAverage';
    sortDesc = true;
    filterStatus$.value = '';
    fileInput.value = '';
    uploadError.hidden = true;
    grBtn.textContent = 'Fetch Goodreads Ratings';
    grBtn.disabled = false;
    grProgress.hidden = true;
    updateSortHeaders();
    showUpload();
  }

  newUploadBtn.addEventListener('click', resetToUpload);
  clearBtn.addEventListener('click', resetToUpload);

  ths.forEach((th) => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (col === sortCol) {
        sortDesc = !sortDesc;
      } else {
        sortCol = col;
        sortDesc = true;
      }
      updateSortHeaders();
      renderTable();
    });
  });

  function updateSortHeaders() {
    ths.forEach((th) => {
      th.classList.remove('active-sort', 'asc', 'desc');
      if (th.dataset.col === sortCol) {
        th.classList.add('active-sort', sortDesc ? 'desc' : 'asc');
      }
    });
  }

  // ── Render ─────────────────────────────────────────────────────────
  function renderTable() {
    let books = filterStatus === ''
      ? allBooks
      : allBooks.filter(b => String(b.readStatus) === filterStatus);

    books = [...books].sort((a, b) => compareBooks(a, b, sortCol, sortDesc));

    const count = books.length;
    bookCount.textContent = `${count} book${count !== 1 ? 's' : ''}`;

    if (count === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No books match the current filter.</td></tr>';
      return;
    }

    const frag = document.createDocumentFragment();
    books.forEach((book) => frag.appendChild(renderRow(book)));
    tbody.replaceChildren(frag);
  }

  function compareBooks(a, b, col, desc) {
    let av = a[col];
    let bv = b[col];

    // Always sort nulls/undefined to the end regardless of direction
    const aNull = av == null;
    const bNull = bv == null;
    if (aNull && bNull) return 0;
    if (aNull) return 1;
    if (bNull) return -1;

    if (typeof av === 'string') av = av.toLowerCase();
    if (typeof bv === 'string') bv = bv.toLowerCase();

    if (av < bv) return desc ? 1 : -1;
    if (av > bv) return desc ? -1 : 1;
    return 0;
  }

  function renderRow(book) {
    const tr = document.createElement('tr');

    tr.appendChild(makeCoverCell(book.isbn));
    tr.appendChild(makeRatingCell(book.ratingsAverage, book.ratingsCount, book.ratingSource, book.grReviewsCount));
    tr.appendChild(makeTextCell(book.title, 'col-title'));
    tr.appendChild(makeTextCell(book.author || '—', 'col-author'));
    tr.appendChild(makeStatusCell(book.readStatus));
    tr.appendChild(makePercentCell(book.percentRead));

    return tr;
  }

  function makeCoverCell(isbn) {
    const td = document.createElement('td');
    td.className = 'col-cover';

    if (isbn) {
      const img = document.createElement('img');
      img.src = `${OL_COVER}/${isbn}-M.jpg`;
      img.className = 'cover-img';
      img.alt = '';
      img.loading = 'lazy';
      // Open Library returns a 1×1 transparent gif when no cover exists
      img.addEventListener('load', () => {
        if (img.naturalWidth <= 1) img.replaceWith(makePlaceholder());
      });
      img.addEventListener('error', () => {
        img.replaceWith(makePlaceholder());
      });
      td.appendChild(img);
    } else {
      td.appendChild(makePlaceholder());
    }

    return td;
  }

  function makePlaceholder() {
    const div = document.createElement('div');
    div.className = 'cover-placeholder';
    div.textContent = '📖';
    return div;
  }

  function makeRatingCell(avg, count, source, reviewsCount) {
    const td = document.createElement('td');
    td.className = 'col-rating';

    if (avg == null) {
      const span = document.createElement('span');
      span.className = 'rating-value rating-none';
      span.textContent = '—';
      td.appendChild(span);
      return td;
    }

    const ratingClass = avg >= 4 ? 'rating-high' : avg >= 3 ? 'rating-mid' : 'rating-low';

    const stars = document.createElement('span');
    stars.className = 'stars';
    stars.textContent = renderStars(avg);

    const valueRow = document.createElement('span');
    valueRow.className = 'rating-value-row';

    const value = document.createElement('span');
    value.className = `rating-value ${ratingClass}`;
    value.textContent = avg.toFixed(2);
    valueRow.appendChild(value);

    if (source) {
      const badge = document.createElement('span');
      badge.className = `rating-source rating-source-${source}`;
      badge.title = sourceName(source);
      badge.textContent = sourceBadgeLabel(source);
      valueRow.appendChild(badge);
    }

    td.appendChild(stars);
    td.appendChild(valueRow);

    if (count > 0) {
      const ratingCount = document.createElement('span');
      ratingCount.className = 'rating-count';
      ratingCount.textContent = `${formatNumber(count)} ratings`;
      td.appendChild(ratingCount);
    }

    // Show GR review count when available
    if (source === 'goodreads' && reviewsCount > 0) {
      const reviewCount = document.createElement('span');
      reviewCount.className = 'rating-count';
      reviewCount.textContent = `${formatNumber(reviewsCount)} reviews`;
      td.appendChild(reviewCount);
    }

    return td;
  }

  function sourceBadgeLabel(source) {
    if (source === 'goodreads') return 'GR';
    if (source === 'google') return 'GB';
    return 'OL';
  }

  function sourceName(source) {
    if (source === 'goodreads') return 'Goodreads';
    if (source === 'google') return 'Google Books';
    return 'Open Library';
  }

  function renderStars(avg) {
    const full = Math.floor(avg);
    const half = avg - full >= 0.5 ? 1 : 0;
    const empty = 5 - full - half;
    return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty);
  }

  function makeTextCell(text, className) {
    const td = document.createElement('td');
    td.className = className;
    td.textContent = text;
    return td;
  }

  function makeStatusCell(status) {
    const td = document.createElement('td');
    td.className = 'col-status';
    const badge = document.createElement('span');
    badge.className = 'status-badge ' + statusClass(status);
    badge.textContent = statusLabel(status);
    td.appendChild(badge);
    return td;
  }

  function makePercentCell(pct) {
    const td = document.createElement('td');
    td.className = 'col-percent';

    const wrap = document.createElement('div');
    wrap.className = 'percent-wrap';

    const bar = document.createElement('div');
    bar.className = 'percent-bar';
    const fill = document.createElement('div');
    fill.className = 'percent-fill';
    fill.style.width = `${pct}%`;
    bar.appendChild(fill);

    const label = document.createElement('span');
    label.className = 'percent-label';
    label.textContent = `${pct}%`;

    wrap.appendChild(bar);
    wrap.appendChild(label);
    td.appendChild(wrap);
    return td;
  }

  function statusClass(s) {
    if (s === 2) return 'status-finished';
    if (s === 1) return 'status-reading';
    return 'status-unread';
  }

  function statusLabel(s) {
    if (s === 2) return 'Finished';
    if (s === 1) return 'Reading';
    return 'Unread';
  }

  function formatNumber(n) {
    return n.toLocaleString();
  }

  // ── Section visibility ─────────────────────────────────────────────
  function showUpload() {
    uploadSection.hidden  = false;
    loadingSection.hidden = true;
    resultsSection.hidden = true;
  }

  function showLoading() {
    uploadSection.hidden  = true;
    loadingSection.hidden = false;
    resultsSection.hidden = true;
  }

  function showResults() {
    uploadSection.hidden  = true;
    loadingSection.hidden = true;
    resultsSection.hidden = false;
  }

  function showError(msg) {
    uploadError.textContent = msg;
    uploadError.hidden = false;
  }
})();
