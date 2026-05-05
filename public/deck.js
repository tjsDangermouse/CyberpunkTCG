let allCards = [];
let decks = [];
let currentDeck = null;

// DOM elements
const deckList = document.getElementById('deck-list');
const deckHeader = document.getElementById('deck-header');
const deckTitle = document.getElementById('deck-title');
const deckCardCount = document.getElementById('deck-card-count');
const deckContent = document.getElementById('deck-content');
const createDeckBtn = document.getElementById('create-deck-btn');
const editDeckBtn = document.getElementById('edit-deck-btn');
const deleteDeckBtn = document.getElementById('delete-deck-btn');

// Modals
const createDeckModal = document.getElementById('create-deck-modal');
const editDeckModal = document.getElementById('edit-deck-modal');
const deckNameInput = document.getElementById('deck-name-input');
const editDeckNameInput = document.getElementById('edit-deck-name-input');
const cancelCreateBtn = document.getElementById('cancel-create-btn');
const confirmCreateBtn = document.getElementById('confirm-create-btn');
const cancelEditBtn = document.getElementById('cancel-edit-btn');
const confirmEditBtn = document.getElementById('confirm-edit-btn');

// ── Helpers ───────────────────────────────────────────────────
function typeClass(type) {
  if (!type) return '';
  return 'type-' + type.toLowerCase();
}

function cardImageSrc(card) {
  if (card.image) return card.image;
  return null;
}

function saveDecks() {
  localStorage.setItem('cyberpunk-decks', JSON.stringify(decks));
}

function loadDecks() {
  const saved = localStorage.getItem('cyberpunk-decks');
  if (saved) {
    decks = JSON.parse(saved);
  }
}

function generateDeckId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// ── Deck management ───────────────────────────────────────────
function createDeck(name) {
  const deck = {
    id: generateDeckId(),
    name: name,
    cards: {} // slug -> quantity
  };
  decks.push(deck);
  saveDecks();
  renderDeckList();
  selectDeck(deck.id);
}

function selectDeck(deckId) {
  currentDeck = decks.find(d => d.id === deckId);
  if (currentDeck) {
    localStorage.setItem('cyberpunk-current-deck', deckId);
    renderDeckHeader();
    renderDeckContent();
  }
}

function updateDeckName(deckId, newName) {
  const deck = decks.find(d => d.id === deckId);
  if (deck) {
    deck.name = newName;
    saveDecks();
    renderDeckList();
    if (currentDeck && currentDeck.id === deckId) {
      renderDeckHeader();
    }
  }
}

function deleteDeck(deckId) {
  decks = decks.filter(d => d.id !== deckId);
  saveDecks();
  renderDeckList();
  if (currentDeck && currentDeck.id === deckId) {
    localStorage.removeItem('cyberpunk-current-deck');
    currentDeck = null;
    deckHeader.style.display = 'none';
    deckContent.innerHTML = `
      <div class="no-deck">
        <div style="font-size:3rem">🃏</div>
        <p>Select a deck from the sidebar or create a new one.</p>
      </div>`;
  }
}

function addCardToDeck(cardSlug, quantity = 1) {
  if (!currentDeck) return;
  currentDeck.cards[cardSlug] = (currentDeck.cards[cardSlug] || 0) + quantity;
  saveDecks();
  renderDeckContent();
  renderDeckHeader();
}

function updateCardQuantity(cardSlug, quantity) {
  if (!currentDeck) return;
  if (quantity <= 0) {
    delete currentDeck.cards[cardSlug];
  } else {
    currentDeck.cards[cardSlug] = quantity;
  }
  saveDecks();
  renderDeckContent();
  renderDeckHeader();
}

function removeCardFromDeck(cardSlug) {
  if (!currentDeck) return;
  delete currentDeck.cards[cardSlug];
  saveDecks();
  renderDeckContent();
  renderDeckHeader();
}

// ── Rendering ─────────────────────────────────────────────────
function renderDeckList() {
  deckList.innerHTML = '';
  decks.forEach(deck => {
    const item = document.createElement('div');
    item.className = 'deck-item' + (currentDeck && currentDeck.id === deck.id ? ' active' : '');
    item.onclick = () => selectDeck(deck.id);

    const cardCount = Object.values(deck.cards).reduce((sum, qty) => sum + qty, 0);

    item.innerHTML = `
      <div class="deck-name">${deck.name}</div>
      <div class="deck-meta">${cardCount} cards</div>
    `;
    deckList.appendChild(item);
  });
}

function renderDeckHeader() {
  if (!currentDeck) return;

  deckTitle.textContent = currentDeck.name;
  const cardCount = Object.values(currentDeck.cards).reduce((sum, qty) => sum + qty, 0);
  deckCardCount.textContent = `${cardCount} cards`;
  deckHeader.style.display = 'flex';
}

function renderDeckContent() {
  if (!currentDeck) return;

  const cardEntries = Object.entries(currentDeck.cards);
  if (cardEntries.length === 0) {
    deckContent.innerHTML = `
      <div class="no-deck">
        <div style="font-size:3rem">📭</div>
        <p>This deck is empty. Add cards from the <a href="index.html">card database</a>.</p>
      </div>`;
    return;
  }

  const cardsHtml = cardEntries.map(([slug, quantity]) => {
    const card = allCards.find(c => c.slug === slug);
    if (!card) return '';

    const imgSrc = cardImageSrc(card);
    const imgHtml = imgSrc
      ? `<img src="${imgSrc}" alt="${card.name}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=card-img-placeholder>⚡</div>'">`
      : `<div class="card-img-placeholder">⚡</div>`;

    return `
      <div class="deck-card">
        <div class="deck-card-img-wrap">${imgHtml}</div>
        <div class="deck-card-quantity">${quantity}</div>
        <div class="deck-card-body">
          <div class="deck-card-name">${card.name || card.slug}</div>
          <div class="deck-card-controls">
            <button class="quantity-btn" onclick="updateCardQuantity('${slug}', ${quantity - 1})">-</button>
            <span style="font-size: 0.8rem; color: var(--text-dim); min-width: 20px; text-align: center;">${quantity}</span>
            <button class="quantity-btn" onclick="updateCardQuantity('${slug}', ${quantity + 1})">+</button>
            <button class="remove-btn" onclick="removeCardFromDeck('${slug}')">Remove</button>
          </div>
        </div>
      </div>`;
  }).join('');

  deckContent.innerHTML = `<div id="deck-grid">${cardsHtml}</div>`;
}

// ── Modal handling ────────────────────────────────────────────
function openModal(modal) {
  modal.classList.add('open');
}

function closeModal(modal) {
  modal.classList.remove('open');
}

// ── Event listeners ───────────────────────────────────────────
createDeckBtn.addEventListener('click', () => {
  deckNameInput.value = '';
  openModal(createDeckModal);
});

confirmCreateBtn.addEventListener('click', () => {
  const name = deckNameInput.value.trim();
  if (name) {
    createDeck(name);
    closeModal(createDeckModal);
  }
});

cancelCreateBtn.addEventListener('click', () => {
  closeModal(createDeckModal);
});

editDeckBtn.addEventListener('click', () => {
  if (!currentDeck) return;
  editDeckNameInput.value = currentDeck.name;
  openModal(editDeckModal);
});

confirmEditBtn.addEventListener('click', () => {
  const name = editDeckNameInput.value.trim();
  if (name && currentDeck) {
    updateDeckName(currentDeck.id, name);
    closeModal(editDeckModal);
  }
});

cancelEditBtn.addEventListener('click', () => {
  closeModal(editDeckModal);
});

deleteDeckBtn.addEventListener('click', () => {
  if (!currentDeck) return;
  if (confirm(`Are you sure you want to delete "${currentDeck.name}"?`)) {
    deleteDeck(currentDeck.id);
  }
});

// Close modals when clicking outside
createDeckModal.addEventListener('click', e => {
  if (e.target === createDeckModal) closeModal(createDeckModal);
});

editDeckModal.addEventListener('click', e => {
  if (e.target === editDeckModal) closeModal(editDeckModal);
});

// ── Load data ─────────────────────────────────────────────────
fetch('cards.json')
  .then(r => {
    if (!r.ok) throw new Error('cards.json not found — run npm run scrape first');
    return r.json();
  })
  .then(data => {
    allCards = data;
    loadDecks();
    renderDeckList();
  })
  .catch(err => {
    deckContent.innerHTML = `
      <div class="no-results">
        <div style="font-size:3rem">⚠</div>
        <p style="color:var(--accent2);font-weight:bold">${err.message}</p>
        <p style="margin-top:0.5rem;font-size:0.85rem">Run <code style="color:var(--accent)">npm install && npm run scrape</code> to download card data.</p>
      </div>`;
  });

// ── Global functions for inline onclick handlers ──────────────
window.updateCardQuantity = updateCardQuantity;
window.removeCardFromDeck = removeCardFromDeck;