// Cards per page for each paper/orientation config
const LAYOUTS = {
  'a4-portrait':       { cols: 3, rows: 3, label: 'A4 Portrait' },
  'a4-landscape':      { cols: 4, rows: 2, label: 'A4 Landscape' },
  'letter-portrait':   { cols: 3, rows: 3, label: 'US Letter Portrait' },
  'letter-landscape':  { cols: 4, rows: 2, label: 'US Letter Landscape' },
};

// Physical page dimensions in mm
const PAGE_DIMS = {
  'a4-portrait':       { w: 210,   h: 297   },
  'a4-landscape':      { w: 297,   h: 210   },
  'letter-portrait':   { w: 215.9, h: 279.4 },
  'letter-landscape':  { w: 279.4, h: 215.9 },
};

let allCards = [];
let selectedCounts = new Map();
let decks = [];
let cardSearch = '';

const paperSizeEl  = document.getElementById('paper-size');
const scaleEl      = document.getElementById('preview-scale');
const showMarksEl  = document.getElementById('show-marks');
const printBtn     = document.getElementById('print-btn');
const pagesRoot    = document.getElementById('pages-root');
const selectGrid   = document.getElementById('select-grid');
const selCount     = document.getElementById('sel-count');
const pageCountEl  = document.getElementById('page-count');
const cardSearchEl = document.getElementById('card-search');
const deckSelectEl = document.getElementById('deck-select');
const loadDeckBtn  = document.getElementById('load-deck-btn');

function getTotalSelectedCopies() {
  let total = 0;
  selectedCounts.forEach(qty => { total += qty; });
  return total;
}

function buildSelectedCardsWithQuantities() {
  const selected = [];
  allCards.forEach(card => {
    const qty = Math.max(0, Number(selectedCounts.get(card.slug) || 0));
    for (let i = 0; i < qty; i++) selected.push(card);
  });
  return selected;
}

function loadDeckOptions() {
  const saved = localStorage.getItem('cyberpunk-decks');
  if (!saved) return;
  try {
    decks = JSON.parse(saved) || [];
  } catch {
    decks = [];
  }

  if (!Array.isArray(decks)) decks = [];

  const options = decks.map(deck => {
    const count = Object.values(deck.cards || {}).reduce((sum, qty) => sum + (Number(qty) || 0), 0);
    return `<option value="${deck.id}">${deck.name} (${count} cards)</option>`;
  }).join('');

  deckSelectEl.innerHTML = `<option value="">Manual selection</option>${options}`;

  const currentDeckId = localStorage.getItem('cyberpunk-current-deck');
  if (currentDeckId && decks.some(d => d.id === currentDeckId)) {
    deckSelectEl.value = currentDeckId;
  }
}

function applyDeckSelection(deckId) {
  const deck = decks.find(d => d.id === deckId);
  if (!deck) return;

  selectedCounts.clear();
  Object.entries(deck.cards || {}).forEach(([slug, qty]) => {
    const count = Math.max(0, Number(qty) || 0);
    if (count > 0) selectedCounts.set(slug, count);
  });
  renderSelector();
}

// ── Card selector ─────────────────────────────────────────────
function renderSelector() {
  const q = cardSearch.toLowerCase();
  const visible = allCards.filter(c =>
    (c.name || c.slug).toLowerCase().includes(q) ||
    (c.type || '').toLowerCase().includes(q)
  );

  selectGrid.innerHTML = visible.map(card => {
    const qty = selectedCounts.get(card.slug) || 0;
    const checked = qty > 0;
    const imgSrc = card.image || null;
    return `
      <label class="select-item${checked ? ' selected' : ''}" data-slug="${card.slug}">
        <input type="checkbox" ${checked ? 'checked' : ''} data-slug="${card.slug}">
        ${imgSrc
          ? `<img class="select-item-img" src="${imgSrc}" alt="${card.name}" loading="lazy">`
          : `<div class="select-item-img" style="background:var(--surface2);display:flex;align-items:center;justify-content:center;color:var(--text-dim)">⚡</div>`
        }
        <span class="select-item-name">${card.name || card.slug}</span>
        <span class="select-item-type">${card.type || ''}</span>
        ${qty > 1 ? `<span class="select-item-type">x${qty}</span>` : ''}
      </label>`;
  }).join('');

  selCount.textContent = getTotalSelectedCopies();
  renderPages();
}

selectGrid.addEventListener('change', e => {
  const cb = e.target;
  if (cb.type !== 'checkbox') return;
  const slug = cb.dataset.slug;
  if (cb.checked) selectedCounts.set(slug, Math.max(1, Number(selectedCounts.get(slug) || 1)));
  else selectedCounts.delete(slug);
  cb.closest('.select-item').classList.toggle('selected', cb.checked);
  selCount.textContent = getTotalSelectedCopies();
  renderPages();
});

document.getElementById('select-all-btn').addEventListener('click', () => {
  allCards.forEach(c => selectedCounts.set(c.slug, 1));
  renderSelector();
});

document.getElementById('select-none-btn').addEventListener('click', () => {
  selectedCounts.clear();
  renderSelector();
});

loadDeckBtn.addEventListener('click', () => {
  if (!deckSelectEl.value) {
    alert('Choose a deck first.');
    return;
  }
  applyDeckSelection(deckSelectEl.value);
});

cardSearchEl.addEventListener('input', () => {
  cardSearch = cardSearchEl.value;
  renderSelector();
});

// ── Print pages ───────────────────────────────────────────────
function makeCardSlotHtml(card) {
  const imgSrc = card?.image || null;
  const inner = card
    ? (imgSrc
        ? `<img src="${imgSrc}" alt="${card.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
        : '')
      + `<div class="card-face" style="${imgSrc ? 'display:none' : ''}">
           <div class="cf-type">${card.type || ''}</div>
           <div class="cf-name">${card.name || card.slug}</div>
           ${card.subtitle ? `<div class="cf-type" style="color:#aaa">${card.subtitle}</div>` : ''}
           <div class="cf-stats">${
             [card.cost != null ? `COST ${card.cost}` : null,
              card.power != null ? `PWR ${card.power}` : null,
              card.ram != null ? `RAM ${card.ram}` : null]
             .filter(Boolean).join(' · ')
           }</div>
         </div>`
    : '';

  return `
    <div class="card-slot${card ? '' : ' empty'}">
      <div class="print-card">${inner}</div>
      <span class="mark-br"></span>
      <span class="mark-bl"></span>
    </div>`;
}

function renderPages() {
  const paper = paperSizeEl.value;
  const layout = LAYOUTS[paper] || LAYOUTS['a4-portrait'];
  const dims = PAGE_DIMS[paper] || PAGE_DIMS['a4-portrait'];
  const cardsPerPage = layout.cols * layout.rows;
  const scale = parseFloat(scaleEl.value) || 0.5;
  const showMarks = showMarksEl.value === '1';
  const sizeClass = `size-${paper}`;

  const selected = buildSelectedCardsWithQuantities();

  if (selected.length === 0) {
    pagesRoot.innerHTML = `<div class="empty-state" style="color:var(--text-dim)"><div style="font-size:3rem">⬛</div><p>Select cards above to preview</p></div>`;
    pageCountEl.textContent = '';
    return;
  }

  const totalPages = Math.ceil(selected.length / cardsPerPage);
  const padded = [...selected];
  while (padded.length % cardsPerPage !== 0) padded.push(null);

  // Scaled wrapper dimensions — the wrapper reserves exactly the visual footprint
  // of the scaled page so subsequent pages stack without drifting.
  const wrapW = (dims.w * scale).toFixed(2);
  const wrapH = (dims.h * scale).toFixed(2);

  let pagesHtml = '';
  for (let p = 0; p < totalPages; p++) {
    const pageCards = padded.slice(p * cardsPerPage, (p + 1) * cardsPerPage);

    let rowsHtml = '';
    for (let r = 0; r < layout.rows; r++) {
      const rowCards = pageCards.slice(r * layout.cols, (r + 1) * layout.cols);
      rowsHtml += `<div class="card-row">${rowCards.map(makeCardSlotHtml).join('')}</div>`;
    }

    // Wrapper is sized to the visual (scaled) dimensions → no layout drift.
    // The inner print-page is scaled from its top-left corner to fill the wrapper.
    // @media print resets both to natural size for correct PDF output.
    pagesHtml += `
      <div class="page-preview-wrapper" style="width:${wrapW}mm;height:${wrapH}mm;">
        <div class="print-page ${sizeClass}${showMarks ? '' : ' no-marks'}" style="transform:scale(${scale});">
          <div class="card-rows">${rowsHtml}</div>
        </div>
      </div>
      ${p < totalPages - 1 ? `<div class="no-print preview-label" style="margin:1rem 0">— Page ${p + 2} —</div>` : ''}`;
  }

  pagesRoot.innerHTML = pagesHtml;
  pageCountEl.textContent = `${totalPages} page${totalPages !== 1 ? 's' : ''} · ${selected.length} card${selected.length !== 1 ? 's' : ''}`;
}

// ── Print button ──────────────────────────────────────────────
printBtn.addEventListener('click', () => {
  const paper = paperSizeEl.value;
  const layout = LAYOUTS[paper] || LAYOUTS['a4-portrait'];
  const cardsPerPage = layout.cols * layout.rows;
  const sizeClass = `size-${paper}`;
  const showMarks = showMarksEl.value === '1';
  const selected = buildSelectedCardsWithQuantities();

  if (selected.length === 0) {
    alert('No cards selected.');
    return;
  }

  // Set @page size
  const sizeMap = {
    'a4-portrait':       'A4 portrait',
    'a4-landscape':      'A4 landscape',
    'letter-portrait':   'letter portrait',
    'letter-landscape':  'letter landscape',
  };
  let styleEl = document.getElementById('print-page-size-style');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'print-page-size-style';
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = `@media print { @page { size: ${sizeMap[paper] || 'A4 portrait'}; margin: 0; } }`;

  // Build a flat list of .print-page divs with no wrappers and no transforms.
  // This is the only reliable way to get consistent card placement across pages
  // in Chrome's print engine — any scaling wrapper causes cumulative drift.
  const padded = [...selected];
  while (padded.length % cardsPerPage !== 0) padded.push(null);
  const totalPages = Math.ceil(selected.length / cardsPerPage);

  let html = '';
  for (let p = 0; p < totalPages; p++) {
    const pageCards = padded.slice(p * cardsPerPage, (p + 1) * cardsPerPage);
    let rowsHtml = '';
    for (let r = 0; r < layout.rows; r++) {
      const rowCards = pageCards.slice(r * layout.cols, (r + 1) * layout.cols);
      rowsHtml += `<div class="card-row">${rowCards.map(makeCardSlotHtml).join('')}</div>`;
    }
    html += `<div class="print-page ${sizeClass}${showMarks ? '' : ' no-marks'}"><div class="card-rows">${rowsHtml}</div></div>`;
  }

  const printArea = document.getElementById('print-area');
  printArea.innerHTML = html;

  window.print();

  // Clear after the dialog closes so it doesn't linger in the DOM
  setTimeout(() => { printArea.innerHTML = ''; }, 2000);
});

// ── Control listeners ─────────────────────────────────────────
paperSizeEl.addEventListener('change', renderPages);
scaleEl.addEventListener('change', renderPages);
showMarksEl.addEventListener('change', renderPages);

// ── Load data ─────────────────────────────────────────────────
fetch('cards.json')
  .then(r => {
    if (!r.ok) throw new Error('cards.json not found — run npm run scrape first');
    return r.json();
  })
  .then(data => {
    allCards = data;
    // Pre-select all cards
    data.forEach(c => selectedCounts.set(c.slug, 1));
    loadDeckOptions();
    renderSelector();
  })
  .catch(err => {
    selectGrid.innerHTML = `<div style="color:var(--accent2);padding:1rem">${err.message}<br><small>Run <code>npm install && npm run scrape</code></small></div>`;
    pagesRoot.innerHTML = '';
  });
