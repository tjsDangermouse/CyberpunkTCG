let allCards = [];
let filtered = [];

const grid = document.getElementById('card-grid');
const countEl = document.getElementById('count');
const searchEl = document.getElementById('search');
const costFilter = document.getElementById('cost-filter');
const costVal = document.getElementById('cost-val');
const pwrFilter = document.getElementById('pwr-filter');
const pwrVal = document.getElementById('pwr-val');
const typeFilters = document.getElementById('type-filters');
const setFilters  = document.getElementById('set-filters');
const resetBtn = document.getElementById('reset-btn');
const overlay = document.getElementById('modal-overlay');
const modalImg = document.getElementById('modal-img');
const modalContent = document.getElementById('modal-content');

// ── Helpers ───────────────────────────────────────────────────
function typeClass(type) {
  if (!type) return '';
  return 'type-' + type.toLowerCase();
}

function statChip(label, value, cls) {
  if (value === null || value === undefined) return '';
  return `<div class="stat ${cls}"><span class="stat-label">${label}</span><span class="stat-value">${value}</span></div>`;
}

function cardImageSrc(card) {
  if (card.image) return card.image;
  return null;
}

// ── Card rendering ────────────────────────────────────────────
function renderCard(card) {
  const imgSrc = cardImageSrc(card);
  const imgHtml = imgSrc
    ? `<img src="${imgSrc}" alt="${card.name}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=card-img-placeholder>⚡</div>'">`
    : `<div class="card-img-placeholder">⚡</div>`;

  return `
    <div class="card" data-slug="${card.slug}" tabindex="0" role="button" aria-label="${card.name}">
      <div class="card-img-wrap">${imgHtml}</div>
      <div class="card-body">
        <div class="card-name">${card.name || card.slug}</div>
        ${card.subtitle ? `<div class="card-sub">${card.subtitle}</div>` : ''}
        ${card.type ? `<span class="type-badge ${typeClass(card.type)}">${card.type}</span>` : ''}
        <div class="card-stats">
          ${statChip('COST', card.cost, 'stat-cost')}
          ${statChip('PWR', card.power, 'stat-power')}
          ${statChip('RAM', card.ram, 'stat-ram')}
        </div>
      </div>
    </div>`;
}

function renderGrid() {
  if (filtered.length === 0) {
    grid.innerHTML = `<div class="no-results"><div style="font-size:3rem">⚡</div><p>No cards match your filters.</p></div>`;
  } else {
    grid.innerHTML = filtered.map(renderCard).join('');
  }
  countEl.textContent = filtered.length;

  // Attach click listeners
  grid.querySelectorAll('.card').forEach(el => {
    el.addEventListener('click', () => openModal(el.dataset.slug));
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') openModal(el.dataset.slug); });
  });
}

// ── Filtering ─────────────────────────────────────────────────
function applyFilters() {
  const query = searchEl.value.toLowerCase().trim();
  const activeType = typeFilters.querySelector('.chip.active')?.dataset.type || 'ALL';
  const activeSet  = setFilters.querySelector('.chip.active')?.dataset.set   || 'ALL';
  const maxCost = parseInt(costFilter.value);
  const minPwr = parseInt(pwrFilter.value);

  filtered = allCards.filter(card => {
    if (query && !(
      (card.name || '').toLowerCase().includes(query) ||
      (card.subtitle || '').toLowerCase().includes(query) ||
      (card.type || '').toLowerCase().includes(query) ||
      (card.abilities || []).join(' ').toLowerCase().includes(query)
    )) return false;

    if (activeType !== 'ALL' && (card.type || '').toUpperCase() !== activeType) return false;

    if (activeSet !== 'ALL' && (card.set || '') !== activeSet) return false;

    if (card.cost !== null && card.cost !== undefined && maxCost < 10 && card.cost > maxCost) return false;
    if (card.power !== null && card.power !== undefined && minPwr > 0 && card.power < minPwr) return false;

    return true;
  });

  renderGrid();
}

// ── Modal ─────────────────────────────────────────────────────
function openModal(slug) {
  const card = allCards.find(c => c.slug === slug);
  if (!card) return;

  const imgSrc = cardImageSrc(card);
  modalImg.innerHTML = imgSrc
    ? `<img src="${imgSrc}" alt="${card.name}">`
    : `<div style="padding:2rem;text-align:center;color:var(--text-dim);font-size:4rem">⚡</div>`;

  const abilitiesHtml = card.abilities?.length
    ? `<div class="modal-section"><h4>Abilities</h4>${card.abilities.map(a => `<p>${a}</p>`).join('')}</div>`
    : '';

  const keywordsHtml = card.keywords?.length
    ? `<div class="modal-section"><h4>Keywords</h4><div class="modal-keywords">${card.keywords.map(k => `<span class="modal-keyword">${k}</span>`).join('')}</div></div>`
    : '';

  // Extra fields beyond core ones
  const coreFields = new Set(['slug','name','subtitle','type','cost','power','ram','abilities','keywords','set','cardNumber','image','url','imageUrl']);
  const extraFields = Object.entries(card)
    .filter(([k, v]) => !coreFields.has(k) && v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `<tr><td style="color:var(--text-dim);padding-right:1rem;white-space:nowrap">${k}</td><td>${Array.isArray(v) ? v.join(', ') : v}</td></tr>`)
    .join('');

  modalContent.innerHTML = `
    <div class="modal-name">${card.name || card.slug}</div>
    ${card.subtitle ? `<div class="modal-sub">${card.subtitle}</div>` : ''}
    ${card.type ? `<span class="type-badge ${typeClass(card.type)}" style="margin-bottom:0.75rem;display:inline-block">${card.type}</span>` : ''}
    <div class="modal-stats">
      ${statChip('COST', card.cost ?? '—', 'stat-cost')}
      ${statChip('PWR', card.power ?? '—', 'stat-power')}
      ${statChip('RAM', card.ram ?? '—', 'stat-ram')}
    </div>
    ${abilitiesHtml}
    ${keywordsHtml}
    ${extraFields ? `<div class="modal-section"><h4>Details</h4><table style="font-size:0.8rem;line-height:1.8">${extraFields}</table></div>` : ''}
    <div class="modal-meta" style="margin-top:1rem">
      ${card.set ? `Set: ${card.set}` : ''}
      ${card.cardNumber ? ` · ${card.cardNumber}` : ''}
      ${card.url ? `<br><a href="${card.url}" target="_blank" rel="noopener">View on cyberpunktcg.com ↗</a>` : ''}
    </div>
    <div style="margin-top:1rem;">
      <button class="btn" onclick="addToDeck('${card.slug}')">Add to Deck</button>
    </div>`;

  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  overlay.classList.remove('open');
  document.body.style.overflow = '';
}

async function addToDeck(cardSlug) {
  await window.DeckStore.init();
  const deckState = window.DeckStore.getState();
  const decks = deckState.decks || [];
  const currentDeckId = deckState.currentDeckId;

  if (!currentDeckId || !decks.find(d => d.id === currentDeckId)) {
    alert('No deck selected. Please go to the Decks page and select or create a deck first.');
    return;
  }

  const deck = decks.find(d => d.id === currentDeckId);
  deck.cards[cardSlug] = (deck.cards[cardSlug] || 0) + 1;
  await window.DeckStore.save({ decks, currentDeckId });

  alert(`Added ${allCards.find(c => c.slug === cardSlug)?.name || cardSlug} to ${deck.name}`);
}

function typeClass(type) {
  if (!type) return '';
  return 'type-' + type.toLowerCase();
}

// ── Event listeners ───────────────────────────────────────────
searchEl.addEventListener('input', applyFilters);

costFilter.addEventListener('input', () => {
  costVal.textContent = costFilter.value == 10 ? 'Any' : costFilter.value;
  applyFilters();
});

pwrFilter.addEventListener('input', () => {
  pwrVal.textContent = pwrFilter.value == 0 ? 'Any' : pwrFilter.value;
  applyFilters();
});

typeFilters.addEventListener('click', e => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  typeFilters.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
  applyFilters();
});

setFilters.addEventListener('click', e => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  setFilters.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
  applyFilters();
});

resetBtn.addEventListener('click', () => {
  searchEl.value = '';
  costFilter.value = 10; costVal.textContent = 'Any';
  pwrFilter.value = 0;  pwrVal.textContent = 'Any';
  typeFilters.querySelectorAll('.chip').forEach((c, i) => c.classList.toggle('active', i === 0));
  setFilters.querySelectorAll('.chip').forEach((c, i) => c.classList.toggle('active', i === 0));
  applyFilters();
});

document.getElementById('modal-close').addEventListener('click', closeModal);
overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

document.getElementById('grid-view-btn').addEventListener('click', () => {
  grid.classList.remove('list-view');
  document.getElementById('grid-view-btn').classList.add('active');
  document.getElementById('list-view-btn').classList.remove('active');
});

document.getElementById('list-view-btn').addEventListener('click', () => {
  grid.classList.add('list-view');
  document.getElementById('list-view-btn').classList.add('active');
  document.getElementById('grid-view-btn').classList.remove('active');
});

// ── Load data ─────────────────────────────────────────────────
fetch('cards.json')
  .then(r => {
    if (!r.ok) throw new Error('cards.json not found — run npm run scrape first');
    return r.json();
  })
  .then(data => {
    allCards = data;
    filtered = data;

    // Build set chips from the actual data
    const sets = [...new Set(data.map(c => c.set).filter(Boolean))].sort();
    sets.forEach(set => {
      const btn = document.createElement('button');
      btn.className = 'chip';
      btn.dataset.set = set;
      btn.textContent = set;
      setFilters.appendChild(btn);
    });

    applyFilters();
  })
  .catch(err => {
    grid.innerHTML = `
      <div class="no-results">
        <div style="font-size:3rem">⚠</div>
        <p style="color:var(--accent2);font-weight:bold">${err.message}</p>
        <p style="margin-top:0.5rem;font-size:0.85rem">Run <code style="color:var(--accent)">npm install && npm run scrape</code> to download card data.</p>
      </div>`;
  });
