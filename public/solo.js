const { PHASES, STATUSES, ACTIONS, OBJECTIVES_TO_WIN } = window.SoloGameTypes;
const CardUtils = window.SoloCardUtils;
const Bosses = window.SoloBosses;
const Game = window.SoloGameReducer;
const PLAYER_AREA_PADDING = 12;

let cardsBySlug = new Map();
let state = null;
let presentationalLookup = new Map();
let ui = {
  hoveredCard: null,
  hoveredCardId: null,
  hoveredTargetId: null,
  interactionPointer: { x: 0, y: 0 },
  dragging: null,
  enteringCardIds: new Set(),
  exitingCardIds: new Set(),
  gigPulseIds: new Set(),
  logOpen: false,
  alertPulse: false,
  suppressClickId: null,
  areaPositions: {
    playerCards: {},
    eddies: {},
  },
};

const elements = {
  alertDisplay: document.getElementById('alert-display'),
  objectiveProgress: document.getElementById('objective-progress'),
  phaseDisplay: document.getElementById('phase-display'),
  phaseChips: {
    setup: document.getElementById('phase-chip-setup'),
    playerMain: document.getElementById('phase-chip-player-main'),
    playerAttack: document.getElementById('phase-chip-player-attack'),
    bossTurn: document.getElementById('phase-chip-boss-turn'),
    gameOver: document.getElementById('phase-chip-game-over'),
  },
  bossCore: document.getElementById('boss-core'),
  bossBoard: document.getElementById('boss-board'),
  objectiveZone: document.getElementById('objective-zone'),
  playerArea: document.getElementById('player-area'),
  eddieSummary: document.getElementById('eddie-summary'),
  playerHand: document.getElementById('player-hand'),
  statusGrid: document.getElementById('status-grid'),
  turnLog: document.getElementById('turn-log'),
  turnLogDrawer: document.getElementById('turn-log-drawer'),
  logToggleBtn: document.getElementById('log-toggle-btn'),
  logCloseBtn: document.getElementById('log-close-btn'),
  cardPreview: document.getElementById('card-preview'),
  cardPreviewOverlay: document.getElementById('card-preview-overlay'),
  previewTitle: document.getElementById('preview-title'),
  previewZoom: document.getElementById('preview-zoom'),
  previewZoomImage: document.getElementById('preview-zoom-image'),
  nextMovePopup: document.getElementById('next-move-popup'),
  nextMoveTitle: document.getElementById('next-move-title'),
  nextMoveText: document.getElementById('next-move-text'),
  runSummary: document.getElementById('run-summary'),
  startBtn: document.getElementById('start-btn'),
  playBtn: document.getElementById('play-btn'),
  sellEddieBtn: document.getElementById('sell-eddie-btn'),
  endPhaseBtn: document.getElementById('end-phase-btn'),
  endTurnBtn: document.getElementById('end-turn-btn'),
  attackBtn: document.getElementById('attack-btn'),
  confirmTargetBtn: document.getElementById('confirm-target-btn'),
  resetBtn: document.getElementById('reset-btn'),
  restartRunBtn: document.getElementById('restart-run-btn'),
  gameOverOverlay: document.getElementById('game-over-overlay'),
  gameOverTitle: document.getElementById('game-over-title'),
  gameOverText: document.getElementById('game-over-text'),
  deckChoiceOverlay: document.getElementById('deck-choice-overlay'),
  deckChoiceList: document.getElementById('deck-choice-list'),
  deckChoiceConfirmBtn: document.getElementById('deck-choice-confirm-btn'),
  soloBoard: document.getElementById('solo-board'),
  playerZone: document.getElementById('player-zone'),
  playerRail: document.querySelector('.player-rail'),
  interactionLines: document.getElementById('interaction-lines'),
  attackLine: document.getElementById('attack-line'),
};

async function chooseSoloDeck() {
  const deckState = window.DeckStore.getState();
  const decks = Array.isArray(deckState.decks) ? deckState.decks : [];
  if (decks.length === 0) return;

  let selectedDeckId = deckState.currentDeckId && decks.some(deck => deck.id === deckState.currentDeckId)
    ? deckState.currentDeckId
    : decks[0].id;

  const deckCountLabel = deck => `${Object.values(deck.cards || {}).reduce((sum, qty) => sum + (Number(qty) || 0), 0)} cards`;
  const renderChoices = () => {
    elements.deckChoiceList.innerHTML = decks.map(deck => `
      <button class="deck-choice-item ${deck.id === selectedDeckId ? 'active' : ''}" type="button" data-deck-id="${deck.id}">
        <span>${deck.name}</span>
        <span>${deckCountLabel(deck)}</span>
      </button>
    `).join('');
  };

  return new Promise(resolve => {
    const closeModal = async () => {
      await window.DeckStore.save({ decks, currentDeckId: selectedDeckId });
      elements.deckChoiceOverlay.classList.add('is-hidden');
      elements.deckChoiceOverlay.setAttribute('aria-hidden', 'true');
      resolve();
    };

    renderChoices();
    elements.deckChoiceOverlay.classList.remove('is-hidden');
    elements.deckChoiceOverlay.setAttribute('aria-hidden', 'false');

    elements.deckChoiceList.onclick = event => {
      const choice = event.target.closest('[data-deck-id]');
      if (!choice) return;
      selectedDeckId = choice.dataset.deckId;
      renderChoices();
    };

    elements.deckChoiceConfirmBtn.onclick = () => {
      closeModal().catch(console.error);
    };
  });
}

function typeClass(type) {
  return type ? `type-${type.toLowerCase()}` : '';
}

function statChip(label, value, cls) {
  if (value === null || value === undefined) return '';
  return `<div class="stat ${cls}"><span class="stat-label">${label}</span><span class="stat-value">${value}</span></div>`;
}

function renderStatePills(card) {
  const pills = [`<span class="state-pill">HP ${Math.max(0, card.currentHp)} / ${card.maxHp}</span>`];
  if (!card.ready) pills.push('<span class="state-pill">Spent</span>');
  return pills.join('');
}

function cardIsSelected(cardId) {
  return state.selectedCardId === cardId || state.selectedAttackerId === cardId || state.selectedTargetId === cardId;
}

function selectedTargetIsGig(gigId) {
  return state.selectedTargetId === gigId;
}

function legalTargetIds() {
  return Game.legalTargetIds(state);
}

function canPlaySelected() {
  const selectedCard = state.player.hand.find(card => card.instanceId === state.selectedCardId);
  return Boolean(selectedCard && Game.canPlayCard(state, selectedCard));
}

function canSellSelected() {
  const selectedCard = state.player.hand.find(card => card.instanceId === state.selectedCardId);
  return Boolean(
    selectedCard
    && state.phase === PHASES.PLAYER_MAIN
    && state.status === STATUSES.PLAYING
    && !state.hasSoldThisTurn
    && Game.canSellCard(selectedCard)
  );
}

function canBeginAttack(cardId) {
  if (state.phase !== PHASES.PLAYER_ATTACK || state.status !== STATUSES.PLAYING) return false;
  const card = state.player.board.find(entry => entry.instanceId === cardId);
  return Boolean(card && card.ready);
}

function rebuildPresentationalLookup() {
  presentationalLookup = new Map();
  [...state.player.hand, ...state.player.board, ...state.boss.board].forEach(card => {
    if (card?.instanceId) presentationalLookup.set(card.instanceId, card);
  });
}

function renderCard(card, options = {}) {
  const imgSrc = CardUtils.getCardArt(card);
  const isBoardRuntimeCard = Number.isFinite(card?.currentHp) && Number.isFinite(card?.maxHp);
  const classes = [
    'solo-card',
    options.hand ? 'hand-card' : '',
    card.owner === 'boss' ? 'boss-asset-card' : '',
    !options.hand && card.ready === false ? 'exhausted' : '',
    isBoardRuntimeCard && card.currentHp < card.maxHp ? 'damaged' : '',
    card.flash || '',
    options.selected ? 'selected' : '',
    options.targetable ? 'targetable' : '',
    options.canAttack ? 'can-attack' : '',
    options.entering ? 'entering' : '',
  ].filter(Boolean).join(' ');
  const fanOffset = options.fanOffset ?? 0;
  const cardIdAttr = ` data-card-id="${card.instanceId}"`;
  const tabIndexAttr = ' tabindex="0"';
  const handStyle = `--fan-offset:${fanOffset};--fan-lift:${Math.abs(fanOffset) * 2}px;--fan-layer:${100 + (options.handIndex || 0)};--fan-overlap:${Math.max(0, 42 - (options.handCount || 0) * 2)}px;`;
  const styleAttr = options.inlineStyle || options.hand
    ? ` style="${options.hand ? handStyle : ''}${options.inlineStyle || ''}"`
    : '';

  if (options.hand || options.artOnly) {
    return `
      <article class="${classes}"${cardIdAttr}${tabIndexAttr}${styleAttr}>
        <div class="solo-card-art hand-card-art">
          ${imgSrc
            ? `<img src="${imgSrc}" alt="${CardUtils.getCardName(card)}" loading="lazy" draggable="false" onerror="this.parentElement.innerHTML='<div class=&quot;solo-card-placeholder&quot;>No Art</div>'">`
            : `<div class="solo-card-placeholder">No Art</div>`}
        </div>
      </article>
    `;
  }

  return `
    <article class="${classes}"${cardIdAttr}${tabIndexAttr}>
      <div class="solo-card-art">
        ${imgSrc
          ? `<img src="${imgSrc}" alt="${CardUtils.getCardName(card)}" loading="lazy" draggable="false" onerror="this.parentElement.innerHTML='<div class=&quot;solo-card-placeholder&quot;>No Art</div>'">`
          : `<div class="solo-card-placeholder">${card.owner === 'boss' ? 'Boss Asset' : 'No Art'}</div>`}
        <div class="card-state-row">${renderStatePills(card)}</div>
      </div>
      <div class="solo-card-body">
        <div>
          <h3>${CardUtils.getCardName(card)}</h3>
          <div class="solo-card-sub">${CardUtils.getCardSubtitle(card) || '&nbsp;'}</div>
        </div>
        ${CardUtils.getCardType(card) ? `<span class="type-badge ${typeClass(CardUtils.getCardType(card))}">${CardUtils.getCardType(card)}</span>` : ''}
        <div class="solo-card-footer">
          <div class="card-stats">
            ${statChip('COST', CardUtils.getCardCost(card), 'stat-cost')}
            ${statChip('PWR', CardUtils.getCardPower(card), 'stat-power')}
            ${statChip('HP', card.currentHp, 'stat-ram')}
          </div>
        </div>
        <p class="solo-card-text">${CardUtils.getCardText(card) || 'Prototype solo asset.'}</p>
      </div>
    </article>
  `;
}

function renderZoneCards(container, cards, options = {}) {
  if (cards.length === 0) {
    container.innerHTML = `<div class="empty-zone">${options.emptyText || 'No cards in this zone.'}</div>`;
    return;
  }

  container.innerHTML = cards.map((card, index) => renderCard(card, {
    hand: options.hand,
    artOnly: options.artOnly,
    selected: cardIsSelected(card.instanceId),
    targetable: legalTargetIds().includes(card.instanceId),
    canAttack: canBeginAttack(card.instanceId),
    entering: ui.enteringCardIds.has(card.instanceId),
    handIndex: index,
    handCount: cards.length,
    fanOffset: options.hand ? index - ((cards.length - 1) / 2) : 0,
  })).join('');
}

function renderBossCore() {
  const alertWidth = `${(state.boss.alert / 10) * 100}%`;
  elements.bossCore.className = `boss-core ${state.boss.lockdownActive ? 'lockdown-active' : ''}`.trim();
  elements.bossCore.innerHTML = `
    <div class="boss-core-title">
      <div>
        <p class="zone-label">Boss</p>
        <h3>${Bosses.bossDefinition.name}</h3>
        <p class="solo-card-sub">${Bosses.bossDefinition.title}</p>
      </div>
      <span class="state-pill">Alert ${state.boss.alert} / 10</span>
    </div>
    <div class="alert-meter">
      <div class="alert-bar"><div class="alert-fill ${ui.alertPulse ? 'alert-pulse' : ''}" style="width:${alertWidth}"></div></div>
      <div class="alert-thresholds">
        ${Bosses.bossDefinition.thresholds.map(value => `
          <span class="threshold-pill ${state.boss.alert >= value ? 'reached' : ''}">
            ${value === 9 ? '9 Lock' : value === 10 ? '10 Lose' : `${value} Spawn`}
          </span>
        `).join('')}
      </div>
    </div>
    <div class="boss-rules">
      <div>${state.boss.lockdownActive ? 'Lockdown active.' : 'Lockdown begins at Alert 9.'}</div>
      <div>${state.boss.board.length > 0 ? `${state.boss.board.length} defenders online.` : 'No defenders currently deployed.'}</div>
    </div>
  `;
}

function approximateCardHeight(width) {
  return width * (88 / 63);
}

function defaultEddiePosition(index) {
  const width = 74;
  const height = approximateCardHeight(width);
  return {
    x: PLAYER_AREA_PADDING + (index * 26),
    y: Math.max(PLAYER_AREA_PADDING, 96 - (height / 2)),
    z: 20 + index,
  };
}

function defaultPlayerCardPosition(index, total) {
  const width = 96;
  const height = approximateCardHeight(width);
  const spread = 110;
  const centerOffset = (index - ((Math.max(total, 1) - 1) / 2)) * spread;
  return {
    x: 240 + centerOffset,
    y: Math.max(PLAYER_AREA_PADDING, 112 - (height / 2)),
    z: 120 + index,
  };
}

function clampAreaPosition(position, bounds, width, height) {
  const maxX = Math.max(PLAYER_AREA_PADDING, bounds.width - width - PLAYER_AREA_PADDING);
  const maxY = Math.max(PLAYER_AREA_PADDING, bounds.height - height - PLAYER_AREA_PADDING);
  return {
    x: Math.min(Math.max(PLAYER_AREA_PADDING, position.x), maxX),
    y: Math.min(Math.max(PLAYER_AREA_PADDING, position.y), maxY),
    z: position.z,
  };
}

function playerAreaBounds() {
  return {
    width: elements.playerArea?.clientWidth || 560,
    height: elements.playerArea?.clientHeight || 220,
  };
}

function syncPlayerAreaPositions() {
  const bounds = playerAreaBounds();
  const nextPlayerCards = {};
  const nextEddies = {};

  state.eddieArea.forEach((eddie, index) => {
    const width = 74;
    const height = approximateCardHeight(width);
    const existing = ui.areaPositions.eddies[eddie.id] || defaultEddiePosition(index);
    nextEddies[eddie.id] = clampAreaPosition(existing, bounds, width, height);
  });

  state.player.board.forEach((card, index) => {
    const width = 96;
    const height = approximateCardHeight(width);
    const existing = ui.areaPositions.playerCards[card.instanceId] || defaultPlayerCardPosition(index, state.player.board.length);
    nextPlayerCards[card.instanceId] = clampAreaPosition(existing, bounds, width, height);
  });

  ui.areaPositions = {
    playerCards: nextPlayerCards,
    eddies: nextEddies,
  };
}

function areaCardStyle(position, width, extra = '') {
  return `left:${position.x}px;top:${position.y}px;z-index:${position.z};width:${width}px;min-width:${width}px;${extra}`;
}

function renderEddieCard(eddie, position) {
  return `
    <article
      class="solo-card eddie-card area-card ${eddie.isSpent ? 'eddie-spent' : 'eddie-ready'}"
      data-eddie-id="${eddie.id}"
      tabindex="-1"
      aria-label="Face-down Eddie"
      style="${areaCardStyle(position, 74)}"
    >
      <div class="eddie-card-back">
        <div class="eddie-card-mark">EDDIE</div>
      </div>
    </article>
  `;
}

function renderPlayerArea() {
  const total = state.eddieArea.length;
  const available = Game.countReadyEddies(state);
  const spent = total - available;
  elements.eddieSummary.textContent = `${total} total · ${available} ready · ${spent} spent`;
  syncPlayerAreaPositions();

  if (total === 0 && state.player.board.length === 0) {
    elements.playerArea.innerHTML = '<div class="empty-zone player-area-empty">Sell a hand card for an Eddie or drag a playable card in from hand.</div>';
    return;
  }

  const eddieMarkup = state.eddieArea.map(eddie => renderEddieCard(eddie, ui.areaPositions.eddies[eddie.id])).join('');
  const boardMarkup = state.player.board.map((card, index) => renderCard(card, {
    artOnly: true,
    selected: cardIsSelected(card.instanceId),
    targetable: legalTargetIds().includes(card.instanceId),
    canAttack: canBeginAttack(card.instanceId),
    entering: ui.enteringCardIds.has(card.instanceId),
    inlineStyle: areaCardStyle(
      ui.areaPositions.playerCards[card.instanceId],
      96,
      `height:${approximateCardHeight(96)}px;`
    ),
    handIndex: index,
    handCount: state.player.board.length,
  }).replace('class="solo-card', 'class="solo-card area-card player-area-card')).join('');

  elements.playerArea.innerHTML = `${eddieMarkup}${boardMarkup}`;
}

function renderObjectives() {
  const legalGigs = new Set(legalTargetIds());
  elements.objectiveZone.innerHTML = state.gigs.map((gig, index) => `
    <article
      class="objective-card ${gig.claimedBy === 'player' ? 'player' : ''} ${legalGigs.has(gig.id) ? 'targetable' : ''} ${selectedTargetIsGig(gig.id) ? 'selected' : ''} ${ui.gigPulseIds.has(gig.id) ? 'gig-pulse' : ''}"
      data-gig-id="${gig.id}"
      tabindex="0"
    >
      <p class="zone-label">Gig ${index + 1}</p>
      <h3>${gig.name}</h3>
      <p class="solo-card-text">${gig.reward}</p>
      <div class="objective-status">
        <span>${gig.claimedBy === 'player' ? 'Secured by player' : 'Still protected by Arasaka'}</span>
        <strong>${gig.claimedBy === 'player' ? 'Claimed' : 'Open'}</strong>
      </div>
    </article>
  `).join('');
}

function renderStatus() {
  const selected = state.selectedAttackerId
    ? `Attacker: ${CardUtils.getCardName(presentationalLookup.get(state.selectedAttackerId))}`
    : state.selectedCardId
      ? `Selected: ${CardUtils.getCardName(presentationalLookup.get(state.selectedCardId))}`
      : 'Selected: None';

  elements.statusGrid.innerHTML = `
    <div class="status-item"><span>Runner HP</span><strong>${state.player.hp}</strong></div>
    <div class="status-item"><span>Total Eddies</span><strong>${state.eddieArea.length}</strong></div>
    <div class="status-item"><span>Available Eddies</span><strong>${Game.countReadyEddies(state)}</strong></div>
    <div class="status-item"><span>Spent Eddies</span><strong>${state.eddieArea.length - Game.countReadyEddies(state)}</strong></div>
    <div class="status-item"><span>Turn</span><strong>${state.turn}</strong></div>
    <div class="status-item"><span>Alert</span><strong>${state.boss.alert}</strong></div>
    <div class="status-item"><span>Deck</span><strong>${state.player.deck.length}</strong></div>
    <div class="status-item"><span>Hand</span><strong>${state.player.hand.length}</strong></div>
    <div class="status-item"><span>Gigs</span><strong>${Game.securedGigCount(state)} / ${OBJECTIVES_TO_WIN}</strong></div>
    <div class="status-item"><span>Discard</span><strong>${state.player.discard.length}</strong></div>
    <div class="status-item"><span>Focus</span><strong>${selected.replace(/^Selected: |^Attacker: /, '')}</strong></div>
  `;
}

function renderLog() {
  elements.turnLogDrawer.classList.toggle('is-open', ui.logOpen);
  elements.logToggleBtn.textContent = ui.logOpen ? 'Hide Log' : 'Log';
  elements.turnLog.innerHTML = state.log.length
    ? state.log.map(entry => `<div class="log-entry"><strong>${entry.title}</strong><p>${entry.text}</p></div>`).join('')
    : '<div class="empty-zone">No events yet.</div>';
}

function getPreviewCard() {
  if (ui.hoveredCard) return ui.hoveredCard;
  if (state.selectedCardId) return presentationalLookup.get(state.selectedCardId) || null;
  if (state.selectedAttackerId) return presentationalLookup.get(state.selectedAttackerId) || null;
  return null;
}

function hidePreviewZoom() {
  elements.previewZoom.classList.remove('is-visible');
  elements.previewZoom.setAttribute('aria-hidden', 'true');
  elements.previewZoomImage.removeAttribute('src');
}

function fitPreviewHeaderTitle() {
  const title = elements.previewTitle;
  if (!title) return;

  title.style.fontSize = '';
  title.style.whiteSpace = '';

  const computed = window.getComputedStyle(title);
  const initialSize = Number.parseFloat(computed.fontSize) || 16;
  const minSize = 10;
  let size = initialSize;

  title.style.whiteSpace = 'nowrap';
  title.style.fontSize = `${initialSize}px`;

  while (title.scrollWidth > title.clientWidth && size > minSize) {
    size -= 0.5;
    title.style.fontSize = `${size}px`;
  }
}

function fitBossAssetText() {
  const bossCards = elements.bossBoard ? [...elements.bossBoard.querySelectorAll('.solo-card.boss-asset-card')] : [];
  bossCards.forEach(card => {
    const body = card.querySelector('.solo-card-body');
    const name = card.querySelector('.solo-card-body h3');
    const sub = card.querySelector('.solo-card-sub');
    const text = card.querySelector('.solo-card-text');
    if (!body || !name || !sub || !text) return;

    name.style.fontSize = '';
    sub.style.fontSize = '';
    text.style.fontSize = '';
    text.style.lineHeight = '';

    let nameSize = Number.parseFloat(window.getComputedStyle(name).fontSize) || 13.5;
    let subSize = Number.parseFloat(window.getComputedStyle(sub).fontSize) || 10;
    let textSize = Number.parseFloat(window.getComputedStyle(text).fontSize) || 10;
    let lineHeight = 1.2;
    let guard = 0;

    while (body.scrollHeight > body.clientHeight && guard < 20) {
      if (nameSize > 10.5) nameSize -= 0.4;
      if (subSize > 8.8) subSize -= 0.25;
      if (textSize > 8.4) textSize -= 0.25;
      if (lineHeight > 1.05) lineHeight -= 0.03;
      name.style.fontSize = `${nameSize}px`;
      sub.style.fontSize = `${subSize}px`;
      text.style.fontSize = `${textSize}px`;
      text.style.lineHeight = `${lineHeight}`;
      guard += 1;
    }
  });
}

function applyAdaptiveSizing() {
  const viewportHeight = window.innerHeight || 900;
  const bossCards = elements.bossBoard ? [...elements.bossBoard.querySelectorAll('.solo-card')] : [];
  if (bossCards.length > 0 && elements.bossBoard) {
    const targetCardHeight = Math.max(112, Math.min(186, viewportHeight * 0.22));
    const targetCardWidth = targetCardHeight * (63 / 88);
    const boardWidth = Math.max(0, elements.bossBoard.clientWidth - 16);
    const perCardWidth = boardWidth > 0 ? (boardWidth / bossCards.length) * 0.86 : targetCardWidth;
    const cardWidth = Math.max(80, Math.min(targetCardWidth, perCardWidth));
    bossCards.forEach(card => {
      card.style.width = `${cardWidth}px`;
      card.style.minWidth = `${cardWidth}px`;
    });
    fitBossAssetText();
  }

  const frame = elements.cardPreview ? elements.cardPreview.querySelector('.preview-image-frame') : null;
  if (frame && elements.cardPreviewOverlay) {
    const overlayRect = elements.cardPreviewOverlay.getBoundingClientRect();
    const previewHead = elements.cardPreviewOverlay.querySelector('.preview-head');
    const headHeight = previewHead ? previewHead.offsetHeight : 0;
    const viewportRoom = Math.max(140, window.innerHeight - overlayRect.top - 14);
    const previewBodyRoom = Math.max(140, elements.cardPreview ? elements.cardPreview.clientHeight : 140);
    let frameHeight = Math.max(140, Math.min(viewportRoom - headHeight - 8, previewBodyRoom, 560));
    let frameWidth = frameHeight * (63 / 88);

    const previewImg = frame.querySelector('img');
    if (previewImg && previewImg.naturalWidth > 0 && previewImg.naturalHeight > 0) {
      const dpr = window.devicePixelRatio || 1;
      const maxCssWidthFromSource = previewImg.naturalWidth / dpr;
      const maxCssHeightFromSource = previewImg.naturalHeight / dpr;
      frameWidth = Math.min(frameWidth, maxCssWidthFromSource);
      frameHeight = Math.min(frameHeight, maxCssHeightFromSource);
    }

    const dpr = window.devicePixelRatio || 1;
    const snapCssPx = value => Math.max(1, Math.floor(value * dpr) / dpr);
    frameWidth = snapCssPx(frameWidth);
    frameHeight = snapCssPx(frameHeight);

    frame.style.height = `${frameHeight}px`;
    frame.style.maxHeight = `${frameHeight}px`;
    frame.style.width = `${frameWidth}px`;
  }
}

function raiseAreaItem(itemType, id) {
  const collection = itemType === 'eddie' ? ui.areaPositions.eddies : ui.areaPositions.playerCards;
  const maxZ = Math.max(
    0,
    ...Object.values(ui.areaPositions.eddies).map(position => Number(position.z) || 0),
    ...Object.values(ui.areaPositions.playerCards).map(position => Number(position.z) || 0),
  );
  if (collection[id]) collection[id].z = maxZ + 1;
}

function wirePreviewZoom() {
  const frame = elements.cardPreview.querySelector('.preview-image-frame');
  const img = frame ? frame.querySelector('img') : null;
  if (!frame || !img) return;

  frame.onmouseenter = () => {
    const src = img.getAttribute('src');
    if (!src) return;
    elements.previewZoomImage.src = src;
    elements.previewZoom.classList.add('is-visible');
    elements.previewZoom.setAttribute('aria-hidden', 'false');
  };
  frame.onmouseleave = hidePreviewZoom;
}

function renderPreview() {
  const preview = getPreviewCard();
  if (!preview) {
    elements.cardPreviewOverlay.classList.add('is-hidden');
    elements.previewTitle.textContent = 'Hover a card';
    elements.cardPreview.innerHTML = '<div class="empty-preview">Card art appears here when you hover or select a card.</div>';
    hidePreviewZoom();
    return;
  }

  const imgSrc = CardUtils.getCardArt(preview);
  elements.cardPreviewOverlay.classList.remove('is-hidden');
  elements.previewTitle.textContent = CardUtils.getCardName(preview);
  elements.cardPreview.innerHTML = `
    <div class="preview-image-frame">
      ${imgSrc
        ? `<img src="${imgSrc}" alt="${CardUtils.getCardName(preview)}" loading="lazy" draggable="false" onerror="this.parentElement.innerHTML='<div class=&quot;solo-card-placeholder preview-placeholder&quot;>No Art</div>'">`
        : '<div class="solo-card-placeholder preview-placeholder">No Art</div>'}
    </div>
  `;
  const previewImg = elements.cardPreview.querySelector('.preview-image-frame img');
  if (previewImg) previewImg.addEventListener('load', applyAdaptiveSizing, { once: true });
  fitPreviewHeaderTitle();
  applyAdaptiveSizing();
  wirePreviewZoom();
}

function renderMeta() {
  const progress = Game.securedGigCount(state);
  elements.alertDisplay.textContent = `${state.boss.alert} / 10`;
  elements.objectiveProgress.textContent = `${progress} / ${OBJECTIVES_TO_WIN}`;
  elements.phaseDisplay.textContent = state.phase
    .replace('player-main', 'Player Main')
    .replace('player-attack', 'Player Attack')
    .replace('boss-turn', 'Boss Turn')
    .replace('game-over', 'Game Over');

  if (state.status === STATUSES.WON || state.status === STATUSES.LOST) {
    elements.runSummary.textContent = state.gameOverReason;
  } else if (state.mode === 'pregame') {
    elements.runSummary.textContent = 'Start a run, deploy units, secure three gigs, and survive the lockdown.';
  } else if (state.phase === PHASES.PLAYER_ATTACK) {
    elements.runSummary.textContent = state.boss.board.length > 0
      ? 'Defenders are up. Pick a ready unit and attack through the board first.'
      : 'No defenders remain. A clean hit secures an open gig.';
  } else {
    elements.runSummary.textContent = 'Sell one hand card for an Eddie during Play, spend ready Eddies to deploy units, and manage Alert before the boss turn.';
  }

  Object.values(elements.phaseChips).forEach(chip => chip.classList.remove('active'));
  if (state.phase === PHASES.SETUP) elements.phaseChips.setup.classList.add('active');
  if (state.phase === PHASES.PLAYER_MAIN) elements.phaseChips.playerMain.classList.add('active');
  if (state.phase === PHASES.PLAYER_ATTACK) elements.phaseChips.playerAttack.classList.add('active');
  if (state.phase === PHASES.BOSS_TURN) elements.phaseChips.bossTurn.classList.add('active');
  if (state.phase === PHASES.GAME_OVER) elements.phaseChips.gameOver.classList.add('active');
}

function deriveNextMove() {
  if (state.mode === 'pregame') {
    return {
      title: 'Start the run',
      text: 'Press Start Run to shuffle your deck, draw five cards, and begin the encounter.',
    };
  }

  if (state.status === STATUSES.WON) {
    return {
      title: 'Run complete',
      text: 'You secured all three gigs. Press Restart Run to play again.',
    };
  }

  if (state.status === STATUSES.LOST) {
    return {
      title: 'Run failed',
      text: 'The encounter is over. Press Restart Run to reset the board and try again.',
    };
  }

  if (state.phase === PHASES.PLAYER_MAIN) {
    const playableSelected = state.player.hand.find(card => card.instanceId === state.selectedCardId && Game.canPlayCard(state, card));
    const sellableSelected = state.player.hand.find(card => card.instanceId === state.selectedCardId && Game.canSellCard(card) && !state.hasSoldThisTurn);
    const affordableBoardCard = state.player.hand.find(card => Game.canPlayCard(state, card));
    const sellableCard = state.player.hand.find(card => Game.canSellCard(card) && !state.hasSoldThisTurn);

    if (playableSelected) {
      return {
        title: 'Play selected card',
        text: `Press Play to spend ${CardUtils.getCardCost(playableSelected)} Eddie and deploy ${CardUtils.getCardName(playableSelected)} exhausted.`,
      };
    }

    if (sellableSelected) {
      return {
        title: 'Sell selected card',
        text: `Press Sell for 1 Eddie to move ${CardUtils.getCardName(sellableSelected)} into the Eddie Area face-down.`,
      };
    }

    if (affordableBoardCard || sellableCard) {
      return {
        title: 'Choose a hand card',
        text: state.hasSoldThisTurn
          ? 'Click a card in your hand, then press Play if you have enough ready Eddies to cover its cost.'
          : 'Click a card in your hand, then either Play it by spending ready Eddies or Sell it for 1 Eddie.',
      };
    }

    if (state.player.hand.length > 0) {
      return {
        title: 'Advance the turn',
        text: 'You do not currently have a playable card. Press End Main to move into the attack phase.',
      };
    }

    return {
      title: 'End main phase',
      text: 'Your hand is empty. Press End Main to move into the attack phase.',
    };
  }

  if (state.phase === PHASES.PLAYER_ATTACK) {
    const legalTargets = legalTargetIds();
    if (!state.selectedAttackerId) {
      const readyUnit = state.player.board.find(card => card.ready);
      if (readyUnit) {
        return {
          title: 'Choose an attacker',
          text: legalTargets.length > 0 && state.boss.board.length > 0
            ? 'Click a ready unit on your board, then click a glowing defender to attack it.'
            : 'Click a ready unit on your board. If no defenders remain, that unit can secure a glowing open gig.',
        };
      }
      return {
        title: 'No attacks available',
        text: 'You have no ready units. Press End Turn to hand play to Arasaka.',
      };
    }

    const attacker = presentationalLookup.get(state.selectedAttackerId);
    if (attacker && !state.selectedTargetId) {
      return {
        title: 'Choose a target',
        text: state.boss.board.length > 0
          ? `Click a glowing defender to attack with ${CardUtils.getCardName(attacker)}.`
          : `Click a glowing open gig to secure it with ${CardUtils.getCardName(attacker)}.`,
      };
    }

    if (state.selectedTargetId) {
      return {
        title: 'Resolve the attack',
        text: 'Press Confirm Target to resolve the selected attack, or choose a different legal target.',
      };
    }
  }

  if (state.phase === PHASES.BOSS_TURN) {
    return {
      title: 'Boss resolving',
      text: 'Arasaka is executing its defense step. Wait for the board to refresh back to your main phase.',
    };
  }

  return {
    title: 'Continue the encounter',
    text: 'Follow the enabled controls to advance the run.',
  };
}

function renderNextMove() {
  const instruction = deriveNextMove();
  elements.nextMoveTitle.textContent = instruction.title;
  elements.nextMoveText.textContent = instruction.text;
}

function renderControls() {
  const selectedBoardCard = state.player.board.find(card => card.instanceId === state.selectedCardId);
  const selectedTargetLegal = legalTargetIds().includes(state.selectedTargetId);

  elements.startBtn.disabled = state.mode !== 'pregame';
  elements.playBtn.disabled = !canPlaySelected();
  elements.sellEddieBtn.disabled = !canSellSelected();
  elements.endPhaseBtn.disabled = !(state.phase === PHASES.PLAYER_MAIN && state.status === STATUSES.PLAYING);
  elements.endTurnBtn.disabled = !(state.phase === PHASES.PLAYER_ATTACK && state.status === STATUSES.PLAYING);
  elements.attackBtn.disabled = !(selectedBoardCard && canBeginAttack(selectedBoardCard.instanceId));
  elements.confirmTargetBtn.disabled = !(state.selectedAttackerId && selectedTargetLegal);
}

function renderGameOverOverlay() {
  const visible = state.status === STATUSES.WON || state.status === STATUSES.LOST;
  elements.gameOverOverlay.classList.toggle('is-hidden', !visible);
  elements.gameOverOverlay.setAttribute('aria-hidden', visible ? 'false' : 'true');
  if (!visible) return;
  elements.gameOverTitle.textContent = state.status === STATUSES.WON ? 'Run Complete' : 'Run Failed';
  elements.gameOverText.textContent = state.gameOverReason;
}

function cardCenterInBoard(cardId) {
  if (!elements.soloBoard || !cardId) return null;
  const targetNode = document.querySelector(`[data-card-id="${cardId}"]`) || document.querySelector(`[data-gig-id="${cardId}"]`);
  if (!targetNode) return null;
  const boardRect = elements.soloBoard.getBoundingClientRect();
  const rect = targetNode.getBoundingClientRect();
  return {
    x: rect.left + (rect.width / 2) - boardRect.left,
    y: rect.top + (rect.height / 2) - boardRect.top,
  };
}

function updateInteractionLine() {
  if (!elements.interactionLines || !elements.attackLine || !elements.soloBoard) return;
  const boardRect = elements.soloBoard.getBoundingClientRect();
  elements.interactionLines.setAttribute('viewBox', `0 0 ${boardRect.width} ${boardRect.height}`);

  if (state.phase !== PHASES.PLAYER_ATTACK || !state.selectedAttackerId) {
    elements.interactionLines.classList.remove('active');
    return;
  }

  const from = cardCenterInBoard(state.selectedAttackerId);
  const targetId = state.selectedTargetId || ui.hoveredTargetId;
  const to = targetId ? cardCenterInBoard(targetId) : ui.interactionPointer;
  if (!from || !to) {
    elements.interactionLines.classList.remove('active');
    return;
  }

  elements.attackLine.setAttribute('x1', `${from.x}`);
  elements.attackLine.setAttribute('y1', `${from.y}`);
  elements.attackLine.setAttribute('x2', `${to.x}`);
  elements.attackLine.setAttribute('y2', `${to.y}`);
  elements.interactionLines.classList.add('active');
}

function applyHoverSpread(cardId) {
  const handNodes = [...document.querySelectorAll('#player-hand [data-card-id]')];
  handNodes.forEach(node => node.classList.remove('hovering', 'neighbor-left', 'neighbor-right'));
  if (!cardId) return;
  const index = handNodes.findIndex(node => node.dataset.cardId === cardId);
  if (index === -1) return;
  handNodes[index].classList.add('hovering');
  if (handNodes[index - 1]) handNodes[index - 1].classList.add('neighbor-left');
  if (handNodes[index + 1]) handNodes[index + 1].classList.add('neighbor-right');
}

function updateDropHighlight(pointerX, pointerY) {
  if (!elements.playerArea) return false;
  const zone = elements.playerArea.getBoundingClientRect();
  const legal = (
    state.phase === PHASES.PLAYER_MAIN
    && state.status === STATUSES.PLAYING
    && pointerX >= zone.left
    && pointerX <= zone.right
    && pointerY >= zone.top
    && pointerY <= zone.bottom
  );
  elements.playerRail.classList.toggle('legal-drop-zone', legal);
  return legal;
}

function animateCardExits(previousState, nextState) {
  if (!previousState) return;
  const previousIds = new Set([...previousState.player.board, ...previousState.boss.board].map(card => card.instanceId));
  const nextIds = new Set([...nextState.player.board, ...nextState.boss.board].map(card => card.instanceId));
  [...previousIds].filter(id => !nextIds.has(id)).forEach(id => {
    const node = document.querySelector(`[data-card-id="${id}"]`);
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const ghost = node.cloneNode(true);
    ghost.classList.add('exiting');
    ghost.style.position = 'fixed';
    ghost.style.left = `${rect.left}px`;
    ghost.style.top = `${rect.top}px`;
    ghost.style.width = `${rect.width}px`;
    ghost.style.minWidth = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    ghost.style.margin = '0';
    ghost.style.zIndex = '920';
    ghost.removeAttribute('data-card-id');
    document.body.appendChild(ghost);
    window.setTimeout(() => ghost.remove(), 220);
  });
}

function captureTransitionPulses(previousState, nextState) {
  const previousBoardIds = new Set(previousState ? [...previousState.player.board, ...previousState.boss.board].map(card => card.instanceId) : []);
  const nextBoardIds = [...nextState.player.board, ...nextState.boss.board].map(card => card.instanceId);
  ui.enteringCardIds = new Set(nextBoardIds.filter(id => !previousBoardIds.has(id)));
  if (ui.enteringCardIds.size > 0) {
    window.setTimeout(() => {
      ui.enteringCardIds.clear();
      render();
    }, 220);
  }

  ui.gigPulseIds = new Set();
  if (previousState) {
    nextState.gigs.forEach((gig, index) => {
      if (gig.claimedBy === 'player' && previousState.gigs[index]?.claimedBy !== 'player') {
        ui.gigPulseIds.add(gig.id);
      }
    });
  }
  if (ui.gigPulseIds.size > 0) {
    window.setTimeout(() => {
      ui.gigPulseIds.clear();
      render();
    }, 420);
  }

  ui.alertPulse = Boolean(previousState && nextState.boss.alert > previousState.boss.alert);
  if (ui.alertPulse) {
    window.setTimeout(() => {
      ui.alertPulse = false;
      render();
    }, 360);
  }
}

function dispatch(action) {
  const previousState = state;
  const nextState = Game.soloGameReducer(state, action, { cardsBySlug });
  animateCardExits(previousState, nextState);
  captureTransitionPulses(previousState, nextState);
  state = nextState;
  render();
}

function beginPlayerAreaDrag(node, itemType, id, event) {
  if (event.button !== 0 || !elements.playerArea) return;

  const areaRect = elements.playerArea.getBoundingClientRect();
  const nodeRect = node.getBoundingClientRect();
  const key = itemType === 'eddie' ? 'eddies' : 'playerCards';
  const entry = ui.areaPositions[key][id];
  if (!entry) return;

  let dragged = false;
  const startX = event.clientX;
  const startY = event.clientY;
  const width = nodeRect.width;
  const height = nodeRect.height;
  raiseAreaItem(itemType, id);

  node.setPointerCapture(event.pointerId);

  const move = moveEvent => {
    const deltaX = moveEvent.clientX - startX;
    const deltaY = moveEvent.clientY - startY;
    if (!dragged && Math.hypot(deltaX, deltaY) > 4) {
      dragged = true;
      node.classList.add('dragging-in-area');
    }
    if (!dragged) return;

    const nextPosition = clampAreaPosition({
      x: moveEvent.clientX - areaRect.left - (width / 2),
      y: moveEvent.clientY - areaRect.top - (height / 2),
      z: entry.z,
    }, { width: areaRect.width, height: areaRect.height }, width, height);
    ui.areaPositions[key][id] = nextPosition;
    node.style.left = `${nextPosition.x}px`;
    node.style.top = `${nextPosition.y}px`;
    node.style.zIndex = `${nextPosition.z}`;
  };

  const finish = () => {
    node.classList.remove('dragging-in-area');
    if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId);
    if (dragged) {
      ui.suppressClickId = `${itemType}:${id}`;
      window.setTimeout(() => {
        if (ui.suppressClickId === `${itemType}:${id}`) ui.suppressClickId = null;
      }, 0);
    }
    node.onpointermove = null;
    node.onpointerup = null;
    node.onpointercancel = null;
  };

  node.onpointermove = move;
  node.onpointerup = finish;
  node.onpointercancel = finish;
}

function attachInteractions() {
  document.querySelectorAll('[data-card-id]').forEach(node => {
    node.onmouseenter = () => {
      const cardId = node.dataset.cardId;
      ui.hoveredCardId = cardId;
      ui.hoveredCard = presentationalLookup.get(cardId) || null;
      if (ui.hoveredCard) renderPreview();
      if (node.closest('#player-hand')) applyHoverSpread(cardId);
      if (legalTargetIds().includes(cardId)) ui.hoveredTargetId = cardId;
      updateInteractionLine();
    };

    node.onmouseleave = () => {
      if (ui.hoveredCardId === node.dataset.cardId) {
        ui.hoveredCardId = null;
        ui.hoveredCard = null;
      }
      if (ui.hoveredTargetId === node.dataset.cardId) ui.hoveredTargetId = null;
      if (node.closest('#player-hand')) applyHoverSpread(null);
      renderPreview();
      updateInteractionLine();
    };

    node.onclick = () => {
      const cardId = node.dataset.cardId;
      if (ui.suppressClickId === `card:${cardId}`) {
        ui.suppressClickId = null;
        return;
      }
      const handCard = state.player.hand.find(card => card.instanceId === cardId);
      if (handCard) {
        dispatch({ type: ACTIONS.SELECT_CARD, cardId });
        return;
      }

      const legalTargets = legalTargetIds();
      if (legalTargets.includes(cardId)) {
        dispatch({ type: ACTIONS.SELECT_TARGET, targetId: cardId, immediate: true });
        return;
      }

      const playerBoardCard = state.player.board.find(card => card.instanceId === cardId);
      if (playerBoardCard && canBeginAttack(cardId)) {
        dispatch({ type: ACTIONS.BEGIN_ATTACK, cardId });
        return;
      }

      dispatch({ type: ACTIONS.SELECT_CARD, cardId });
    };

    if (node.closest('#player-area')) {
      node.onpointerdown = event => beginPlayerAreaDrag(node, 'card', node.dataset.cardId, event);
    }

    if (node.closest('#player-hand')) {
      node.onpointerdown = event => {
        if (event.button !== 0) return;
        const cardId = node.dataset.cardId;
        const handCard = state.player.hand.find(card => card.instanceId === cardId);
        if (!handCard || !Game.canPlayCard(state, handCard) || !CardUtils.isSupportedBoardCard(handCard)) return;

        const rect = node.getBoundingClientRect();
        ui.dragging = {
          cardId,
          offsetX: event.clientX - rect.left,
          offsetY: event.clientY - rect.top,
          canDrop: false,
        };
        node.classList.add('dragging', 'drag-source');
        node.setPointerCapture(event.pointerId);

        const move = moveEvent => {
          if (!ui.dragging || ui.dragging.cardId !== cardId) return;
          const x = moveEvent.clientX - ui.dragging.offsetX;
          const y = moveEvent.clientY - ui.dragging.offsetY;
          node.style.setProperty('--drag-x', `${x}px`);
          node.style.setProperty('--drag-y', `${y}px`);
          ui.dragging.canDrop = updateDropHighlight(moveEvent.clientX, moveEvent.clientY);
        };

        const finish = upEvent => {
          if (!ui.dragging || ui.dragging.cardId !== cardId) return;
          node.classList.remove('dragging', 'drag-source');
          node.style.removeProperty('--drag-x');
          node.style.removeProperty('--drag-y');
          if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId);
          const shouldPlay = updateDropHighlight(upEvent.clientX, upEvent.clientY) && ui.dragging.canDrop;
          ui.dragging = null;
          updateDropHighlight(-1, -1);
          if (shouldPlay) dispatch({ type: ACTIONS.PLAY_CARD, cardId });
        };

        node.onpointermove = move;
        node.onpointerup = eventUp => {
          node.onpointermove = null;
          node.onpointerup = null;
          node.onpointercancel = null;
          finish(eventUp);
        };
        node.onpointercancel = cancelEvent => {
          node.onpointermove = null;
          node.onpointerup = null;
          node.onpointercancel = null;
          finish(cancelEvent);
        };
      };
    }
  });

  document.querySelectorAll('[data-eddie-id]').forEach(node => {
    node.onpointerdown = event => beginPlayerAreaDrag(node, 'eddie', node.dataset.eddieId, event);
    node.onclick = () => {
      const eddieId = node.dataset.eddieId;
      if (ui.suppressClickId === `eddie:${eddieId}`) {
        ui.suppressClickId = null;
      }
    };
  });

  document.querySelectorAll('[data-gig-id]').forEach(node => {
    node.onmouseenter = () => {
      const gigId = node.dataset.gigId;
      if (legalTargetIds().includes(gigId)) ui.hoveredTargetId = gigId;
      updateInteractionLine();
    };
    node.onmouseleave = () => {
      if (ui.hoveredTargetId === node.dataset.gigId) ui.hoveredTargetId = null;
      updateInteractionLine();
    };
    node.onclick = () => {
      const gigId = node.dataset.gigId;
      if (legalTargetIds().includes(gigId)) {
        dispatch({ type: ACTIONS.SELECT_TARGET, targetId: gigId, immediate: true });
      }
    };
  });

  elements.soloBoard.onpointermove = event => {
    const boardRect = elements.soloBoard.getBoundingClientRect();
    ui.interactionPointer.x = event.clientX - boardRect.left;
    ui.interactionPointer.y = event.clientY - boardRect.top;
    updateInteractionLine();
  };
}

function render() {
  rebuildPresentationalLookup();
  renderMeta();
  renderBossCore();
  renderObjectives();
  renderPlayerArea();
  renderZoneCards(elements.bossBoard, state.boss.board, { emptyText: 'No defenders online.' });
  renderZoneCards(elements.playerHand, state.player.hand, { hand: true, emptyText: 'No cards in hand.' });
  renderStatus();
  renderControls();
  renderLog();
  renderPreview();
  renderNextMove();
  renderGameOverOverlay();
  applyAdaptiveSizing();
  attachInteractions();
  updateInteractionLine();
}

function wireControls() {
  elements.startBtn.onclick = () => dispatch({ type: ACTIONS.START_RUN });
  elements.playBtn.onclick = () => dispatch({ type: ACTIONS.PLAY_CARD, cardId: state.selectedCardId });
  elements.sellEddieBtn.onclick = () => dispatch({ type: ACTIONS.SELL_FOR_EDDIE, cardId: state.selectedCardId });
  elements.endPhaseBtn.onclick = () => dispatch({ type: ACTIONS.END_PHASE });
  elements.attackBtn.onclick = () => dispatch({ type: ACTIONS.BEGIN_ATTACK, cardId: state.selectedCardId });
  elements.confirmTargetBtn.onclick = () => dispatch({ type: ACTIONS.CONFIRM_ATTACK });
  elements.endTurnBtn.onclick = () => dispatch({ type: ACTIONS.END_TURN });
  elements.resetBtn.onclick = () => dispatch({ type: ACTIONS.RESET_PROTOTYPE });
  elements.restartRunBtn.onclick = () => dispatch({ type: ACTIONS.START_RUN });
  elements.logToggleBtn.onclick = () => {
    ui.logOpen = !ui.logOpen;
    renderLog();
  };
  elements.logCloseBtn.onclick = () => {
    ui.logOpen = false;
    renderLog();
  };
  window.onresize = () => {
    hidePreviewZoom();
    render();
  };
}

function exposeDebugApi() {
  window.__soloDebug = {
    dispatch,
    getState: () => JSON.parse(JSON.stringify(state)),
    setState: nextState => {
      state = JSON.parse(JSON.stringify(nextState));
      render();
    },
    cardsBySlug: () => cardsBySlug,
  };
}

fetch('cards.json')
  .then(response => {
    if (!response.ok) throw new Error('cards.json not found');
    return response.json();
  })
  .then(async cards => {
    await window.DeckStore.init();
    await chooseSoloDeck();
    cardsBySlug = new Map(cards.map(card => [card.slug, card]));
    state = Game.createInitialState(cardsBySlug);
    wireControls();
    exposeDebugApi();
    render();
  })
  .catch(error => {
    document.querySelector('.solo-shell').innerHTML = `
      <section class="panel-card" style="margin: 1rem;">
        <div class="panel-header">
          <p class="zone-label">Solo Mode</p>
          <h2>Load Error</h2>
        </div>
        <p class="panel-copy">${error.message}. Run <code>npm run scrape</code> if card data is missing.</p>
      </section>
    `;
  });
