const PLAYER_HP = 18;
const STARTING_HAND = 5;
const OBJECTIVES_TO_WIN = 3;
const BOARD_LIMIT = 5;
const MAX_LOG = 18;

const bossDefinition = {
  id: 'arasaka-lockdown',
  name: 'Arasaka Lockdown',
  title: 'Defensive corporate security system',
  thresholds: [3, 6, 9, 10],
  lowSpawn: {
    slug: 'boss-firewall-drone',
    name: 'Firewall Drone',
    subtitle: 'Checkpoint Defender',
    type: 'UNIT',
    cost: 0,
    power: 2,
    ram: 0,
    abilities: ['BLOCKER. Built to intercept the first clean line into the district core.'],
    image: null,
    placeholder: true,
  },
  highSpawn: {
    slug: 'boss-lockdown-enforcer',
    name: 'Lockdown Enforcer',
    subtitle: 'Corporate Riot Frame',
    type: 'UNIT',
    cost: 0,
    power: 5,
    ram: 0,
    abilities: ['Heavy defender. Prioritizes holding the line over trading down.'],
    image: null,
    placeholder: true,
  },
};

let cardsBySlug = new Map();
let state = null;
let ui = {
  hoveredCard: null,
  logOpen: false,
};
let presentationalLookup = new Map();

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
  bossMeta: document.getElementById('boss-meta'),
  objectiveMeta: document.getElementById('objective-meta'),
  playerMeta: document.getElementById('player-meta'),
  handMeta: document.getElementById('hand-meta'),
  bossCore: document.getElementById('boss-core'),
  bossBoard: document.getElementById('boss-board'),
  objectiveZone: document.getElementById('objective-zone'),
  playerBoard: document.getElementById('player-board'),
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
  runSummary: document.getElementById('run-summary'),
  startBtn: document.getElementById('start-btn'),
  endPhaseBtn: document.getElementById('end-phase-btn'),
  endTurnBtn: document.getElementById('end-turn-btn'),
  attackBtn: document.getElementById('attack-btn'),
  confirmTargetBtn: document.getElementById('confirm-target-btn'),
  resetBtn: document.getElementById('reset-btn'),
};

function typeClass(type) {
  return type ? `type-${type.toLowerCase()}` : '';
}

function statChip(label, value, cls) {
  if (value === null || value === undefined) return '';
  return `<div class="stat ${cls}"><span class="stat-label">${label}</span><span class="stat-value">${value}</span></div>`;
}

function cardImageSrc(card) {
  return card.image || card.imageUrl || null;
}

function abilityText(card) {
  return (card.abilities || []).filter(Boolean).join(' ');
}

function cloneCard(card) {
  return JSON.parse(JSON.stringify(card));
}

function getCardData(card) {
  return card.data || card;
}

function makeCardInstance(card, owner, overrides = {}) {
  return {
    instanceId: overrides.instanceId || `${owner}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    owner,
    baseSlug: card.slug,
    data: cloneCard(card),
    ready: overrides.ready ?? false,
    damage: overrides.damage ?? 0,
    powerBonus: overrides.powerBonus ?? 0,
    tempPowerBonus: overrides.tempPowerBonus ?? 0,
    attachedGear: overrides.attachedGear ?? [],
    summonTurn: overrides.summonTurn ?? 0,
    enteredAtTurn: overrides.enteredAtTurn ?? 0,
    flash: overrides.flash ?? '',
  };
}

function getCardPower(card) {
  const data = getCardData(card);
  return Math.max(0, (data.power || 0) + (card.powerBonus || 0) + (card.tempPowerBonus || 0));
}

function getCardHealth(card) {
  // Solo prototype rule: units use a lightweight durability track so the board can persist.
  return Math.max(1, Math.ceil(Math.max(1, getCardPower(card)) / 2));
}

function isBoardCard(card) {
  const type = (card.type || '').toUpperCase();
  return type === 'UNIT' || type === 'LEGEND';
}

function isGear(card) {
  return (card.type || '').toUpperCase() === 'GEAR';
}

function isProgram(card) {
  return (card.type || '').toUpperCase() === 'PROGRAM';
}

function isAffordableBoardCard(card, credits) {
  return isBoardCard(card) && ((card.cost || 0) <= credits);
}

function currentDeckRecord() {
  const decks = JSON.parse(localStorage.getItem('cyberpunk-decks') || '[]');
  const currentDeckId = localStorage.getItem('cyberpunk-current-deck');
  return decks.find(deck => deck.id === currentDeckId) || null;
}

function buildFallbackDeck() {
  const preferred = [
    'v-streetkid',
    'royce-psycho-on-the-edge',
    'jackie-welles-ride-or-die-choom',
    't-bug-amateur-philosopher',
    'swordwise-huscle',
    'secondhand-bombus',
    'ruthless-lowlife',
    'kerry-eurodyne-the-last-rockerboy',
    'meredith-stout-stone-cold-corpo',
    'mantis-blades',
    'kiroshi-optics',
    'dying-night-v-s-pistol',
    'reboot-optics',
    'corporate-surveillance',
    'industrial-assembly',
    'afterparty-at-lizzie-s',
    'sandevistan',
    'gorilla-arms',
  ];

  return preferred
    .map(slug => cardsBySlug.get(slug))
    .filter(Boolean)
    .map(card => cloneCard(card));
}

function buildPlayerDeck() {
  const savedDeck = currentDeckRecord();
  if (savedDeck) {
    const cards = [];
    Object.entries(savedDeck.cards || {}).forEach(([slug, quantity]) => {
      const baseCard = cardsBySlug.get(slug);
      if (!baseCard) return;
      for (let i = 0; i < quantity; i += 1) {
        cards.push(cloneCard(baseCard));
      }
    });
    if (cards.length > 0) {
      return { name: savedDeck.name, cards, source: 'saved' };
    }
  }
  return { name: 'Fallback Runner Stack', cards: buildFallbackDeck(), source: 'fallback' };
}

function shuffle(array) {
  const clone = [...array];
  for (let i = clone.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [clone[i], clone[j]] = [clone[j], clone[i]];
  }
  return clone;
}

function createObjectives() {
  return [
    { id: 'gig-1', name: 'Hijack Security Keys', reward: 'Bypass gate cache', claimedBy: null },
    { id: 'gig-2', name: 'Extract Asset Ledger', reward: 'Leak the payout routing', claimedBy: null },
    { id: 'gig-3', name: 'Ghost the Patrol Grid', reward: 'Blank the district sweep', claimedBy: null },
  ];
}

function demoCard(slug, owner, overrides = {}) {
  const base = cardsBySlug.get(slug);
  if (!base) return null;
  const instance = makeCardInstance(base, owner, overrides);
  instance.demo = true;
  return instance;
}

function demoBossCard(template, instanceId, overrides = {}) {
  const instance = makeCardInstance(template, 'boss', { ...overrides, instanceId });
  instance.demo = true;
  return instance;
}

function createDemoState() {
  const handCards = [
    'v-streetkid',
    'mantis-blades',
    'reboot-optics',
    'jackie-welles-ride-or-die-choom',
    'sandevistan',
  ].map((slug, index) => {
    const base = cardsBySlug.get(slug);
    if (!base) return null;
    return {
      ...cloneCard(base),
      instanceId: `demo-hand-${index}`,
      demo: true,
    };
  }).filter(Boolean);

  const playerBoard = [
    demoCard('t-bug-amateur-philosopher', 'player', { ready: true, tempPowerBonus: 2, instanceId: 'demo-player-1' }),
    demoCard('royce-psycho-on-the-edge', 'player', { ready: false, attachedGear: ['mantis-blades'], powerBonus: 2, damage: 1, instanceId: 'demo-player-2' }),
  ].filter(Boolean);

  const bossBoard = [
    demoBossCard(bossDefinition.lowSpawn, 'demo-boss-1', { ready: true }),
    demoBossCard(bossDefinition.highSpawn, 'demo-boss-2', { ready: false, damage: 1 }),
  ];

  return {
    handCards,
    playerBoard,
    bossBoard,
  };
}

function pushLog(stateDraft, title, text) {
  stateDraft.log.unshift({
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    text,
  });
  stateDraft.log = stateDraft.log.slice(0, MAX_LOG);
}

function createInitialState() {
  const demo = createDemoState();
  return {
    mode: 'pregame',
    status: 'idle',
    gameOverReason: '',
    phase: 'setup',
    turn: 0,
    player: {
      name: '',
      source: '',
      hp: PLAYER_HP,
      credits: 4,
      deck: buildFallbackDeck(),
      hand: demo.handCards,
      discard: [],
      board: demo.playerBoard,
      attackAttemptsThisTurn: 0,
    },
    boss: {
      alert: 4,
      board: demo.bossBoard,
      lockDownActive: false,
      spawnedAt3: false,
      spawnedAt6: false,
    },
    objectives: createObjectives(),
    selectedCardId: null,
    selectedTargetId: null,
    pendingAction: null,
    log: [],
    lastPreviewCard: null,
  };
}

function drawCardsInto(stateDraft, amount) {
  for (let i = 0; i < amount; i += 1) {
    if (stateDraft.player.deck.length === 0) {
      stateDraft.status = 'lost';
      stateDraft.phase = 'game-over';
      stateDraft.gameOverReason = 'Your deck ran dry during the run.';
      pushLog(stateDraft, 'System', 'The runner stack is empty. Arasaka closes the district.');
      break;
    }

    const card = stateDraft.player.deck.shift();
    stateDraft.player.hand.push({
      ...card,
      instanceId: `hand-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    });
  }
}

function stripRuntimeFields(card) {
  const clone = cloneCard(card);
  delete clone.instanceId;
  delete clone.ready;
  delete clone.damage;
  delete clone.powerBonus;
  delete clone.tempPowerBonus;
  delete clone.attachedGear;
  delete clone.summonTurn;
  delete clone.enteredAtTurn;
  delete clone.flash;
  return clone;
}

function ensureOpeningPlayableBoardCard(stateDraft) {
  if (stateDraft.player.hand.some(card => isAffordableBoardCard(card, stateDraft.player.credits))) return;

  const deckIndex = stateDraft.player.deck.findIndex(card => isAffordableBoardCard(card, stateDraft.player.credits));
  if (deckIndex === -1) return;

  const replacement = stateDraft.player.deck.splice(deckIndex, 1)[0];
  const swapIndex = stateDraft.player.hand.findIndex(card => !isAffordableBoardCard(card, stateDraft.player.credits));
  if (swapIndex === -1) return;

  const returnedCard = stateDraft.player.hand[swapIndex];
  stateDraft.player.hand[swapIndex] = {
    ...replacement,
    instanceId: `hand-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
  };
  stateDraft.player.deck.push(stripRuntimeFields(returnedCard));
}

function startRun() {
  const deckInfo = buildPlayerDeck();
  const next = createInitialState();
  next.mode = 'active';
  next.status = 'playing';
  next.turn = 1;
  next.phase = 'player-main';
  next.player.name = deckInfo.name;
  next.player.source = deckInfo.source;
  next.player.deck = shuffle(deckInfo.cards);
  next.player.credits = 3;
  drawCardsInto(next, STARTING_HAND);
  ensureOpeningPlayableBoardCard(next);
  pushLog(next, 'Run Started', `${deckInfo.name} enters the district. Secure ${OBJECTIVES_TO_WIN} gigs before Alert 10.`);
  if (deckInfo.source === 'fallback') {
    pushLog(next, 'Deck Source', 'No saved deck was active, so Solo Mode built a fallback runner stack from the current card pool.');
  }
  return next;
}

function nextObjectiveIndex(stateDraft) {
  return stateDraft.objectives.findIndex(objective => objective.claimedBy !== 'player');
}

function claimObjective(stateDraft, sourceName) {
  const index = nextObjectiveIndex(stateDraft);
  if (index === -1) return false;
  const objective = stateDraft.objectives[index];
  objective.claimedBy = 'player';
  pushLog(stateDraft, 'Gig Secured', `${sourceName} breaks through the district shell and secures ${objective.name}.`);
  if (stateDraft.objectives.filter(item => item.claimedBy === 'player').length >= OBJECTIVES_TO_WIN) {
    stateDraft.status = 'won';
    stateDraft.phase = 'game-over';
    stateDraft.gameOverReason = 'All required gigs have been secured.';
    pushLog(stateDraft, 'Run Complete', 'Arasaka Lockdown collapses. The district is yours.');
  }
  return true;
}

function clearTransientState(stateDraft) {
  stateDraft.selectedCardId = null;
  stateDraft.selectedTargetId = null;
  stateDraft.pendingAction = null;
}

function resetTurnBuffs(board) {
  board.forEach(card => {
    card.tempPowerBonus = 0;
    card.flash = '';
  });
}

function refreshReadyUnits(board) {
  board.forEach(card => {
    card.ready = true;
    card.flash = '';
  });
}

function spendCard(card) {
  if (card) card.ready = false;
}

function markFlash(card, flashType) {
  if (card) card.flash = flashType;
}

function removeBoardCard(board, instanceId) {
  const index = board.findIndex(card => card.instanceId === instanceId);
  if (index === -1) return null;
  return board.splice(index, 1)[0];
}

function findBoardCard(stateDraft, instanceId) {
  return stateDraft.player.board.find(card => card.instanceId === instanceId)
    || stateDraft.boss.board.find(card => card.instanceId === instanceId)
    || null;
}

function hasReadyBossUnit(stateDraft) {
  return stateDraft.boss.board.some(card => card.ready);
}

function strongestReady(board) {
  return board.filter(card => card.ready).sort((a, b) => getCardPower(b) - getCardPower(a))[0] || null;
}

function discardBoardCard(stateDraft, card) {
  if (!card) return;
  if (card.owner === 'player') stateDraft.player.discard.push(cloneCard(card.data));
}

function resolveCombat(stateDraft, attacker, defender, context) {
  const attackerPower = Math.max(1, getCardPower(attacker));
  const defenderPower = Math.max(1, getCardPower(defender));
  defender.damage += attackerPower;
  attacker.damage += defenderPower;
  spendCard(attacker);
  markFlash(attacker, context.flash || 'hit-card');
  markFlash(defender, context.flash || 'hit-card');

  pushLog(
    stateDraft,
    context.title,
    `${context.attackerName || attacker.data.name} clashes with ${context.defenderName || defender.data.name} (${attackerPower} vs ${defenderPower}).`
  );

  if (attacker.damage >= getCardHealth(attacker)) {
    removeBoardCard(attacker.owner === 'player' ? stateDraft.player.board : stateDraft.boss.board, attacker.instanceId);
    discardBoardCard(stateDraft, attacker);
  }

  if (defender.damage >= getCardHealth(defender)) {
    removeBoardCard(defender.owner === 'player' ? stateDraft.player.board : stateDraft.boss.board, defender.instanceId);
    discardBoardCard(stateDraft, defender);
  }
}

function reduceAlert(stateDraft, amount) {
  stateDraft.boss.alert = Math.max(0, stateDraft.boss.alert - amount);
  stateDraft.boss.lockDownActive = stateDraft.boss.alert >= 9;
}

function resolvePendingTarget(stateDraft, targetId) {
  if (!stateDraft.pendingAction) return;
  const targetCard = findBoardCard(stateDraft, targetId);
  if (!targetCard) return;

  if (stateDraft.pendingAction.type === 'play-gear') {
    if (targetCard.owner !== 'player') return;
    targetCard.attachedGear.push(stateDraft.pendingAction.card.slug);
    targetCard.powerBonus += stateDraft.pendingAction.card.power || 0;
    pushLog(stateDraft, 'Gear Equipped', `${stateDraft.pendingAction.card.name} attaches to ${targetCard.data.name} for +${stateDraft.pendingAction.card.power || 0} power.`);
    clearTransientState(stateDraft);
    return;
  }

  if (stateDraft.pendingAction.type === 'program-friendly-buff') {
    if (targetCard.owner !== 'player') return;
    targetCard.tempPowerBonus += 4;
    pushLog(stateDraft, 'Program Resolved', `${stateDraft.pendingAction.card.name} gives ${targetCard.data.name} +4 power this turn.`);
    clearTransientState(stateDraft);
    return;
  }

  if (stateDraft.pendingAction.type === 'program-spend-rival') {
    if (targetCard.owner !== 'boss') return;
    targetCard.ready = false;
    markFlash(targetCard, 'blocked-card');
    pushLog(stateDraft, 'Program Resolved', `${stateDraft.pendingAction.card.name} spends ${targetCard.data.name}.`);
    clearTransientState(stateDraft);
    return;
  }

  if (stateDraft.pendingAction.type === 'program-bounce-spent') {
    if (targetCard.ready) return;
    if (targetCard.owner === 'boss') {
      removeBoardCard(stateDraft.boss.board, targetCard.instanceId);
      pushLog(stateDraft, 'Program Resolved', `${stateDraft.pendingAction.card.name} returns ${targetCard.data.name} to the reserve.`);
    } else {
      removeBoardCard(stateDraft.player.board, targetCard.instanceId);
      stateDraft.player.hand.push({
        ...cloneCard(targetCard.data),
        instanceId: `hand-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      });
      pushLog(stateDraft, 'Program Resolved', `${stateDraft.pendingAction.card.name} returns ${targetCard.data.name} to your hand.`);
    }
    clearTransientState(stateDraft);
  }
}

function performProgram(stateDraft, handIndex, programCard) {
  const text = abilityText(programCard).toLowerCase();
  stateDraft.player.credits -= programCard.cost || 0;
  stateDraft.player.hand.splice(handIndex, 1);
  stateDraft.player.discard.push(cloneCard(programCard));

  if (text.includes('friendly unit +4 power')) {
    stateDraft.pendingAction = { type: 'program-friendly-buff', card: programCard };
    pushLog(stateDraft, 'Program Loaded', `${programCard.name} is queued. Choose a friendly unit to overclock.`);
    return;
  }

  if (text.includes('spend a rival unit')) {
    stateDraft.pendingAction = { type: 'program-spend-rival', card: programCard };
    pushLog(stateDraft, 'Program Loaded', `${programCard.name} is queued. Choose a rival unit to spend.`);
    return;
  }

  if (text.includes('return a spent unit')) {
    stateDraft.pendingAction = { type: 'program-bounce-spent', card: programCard };
    pushLog(stateDraft, 'Program Loaded', `${programCard.name} is queued. Choose a spent unit to bounce.`);
    return;
  }

  if (text.includes('increase a friendly gig') || text.includes('adjust a rival gig')) {
    claimObjective(stateDraft, programCard.name);
    reduceAlert(stateDraft, 1);
    pushLog(stateDraft, 'Program Resolved', `${programCard.name} manipulates the district objective network and drops Alert by 1.`);
    clearTransientState(stateDraft);
    return;
  }

  if (text.includes('equipped unit +2 power')) {
    const gearedUnit = stateDraft.player.board.find(card => card.attachedGear.length > 0);
    if (gearedUnit) {
      const amount = gearedUnit.attachedGear.length * 2;
      gearedUnit.tempPowerBonus += amount;
      pushLog(stateDraft, 'Program Resolved', `${programCard.name} surges ${gearedUnit.data.name} for +${amount} power this turn.`);
    } else {
      drawCardsInto(stateDraft, 1);
      pushLog(stateDraft, 'Program Resolved', `${programCard.name} scans for a better line. Draw 1 card.`);
    }
    clearTransientState(stateDraft);
    return;
  }

  drawCardsInto(stateDraft, 1);
  reduceAlert(stateDraft, 1);
  pushLog(stateDraft, 'Program Resolved', `${programCard.name} buys time. Draw 1 card and reduce Alert by 1.`);
  clearTransientState(stateDraft);
}

function performPlayCard(stateDraft, handIndex) {
  const card = stateDraft.player.hand[handIndex];
  if (!card) return;
  const cost = card.cost || 0;
  if (cost > stateDraft.player.credits) return;

  if (isBoardCard(card)) {
    if (stateDraft.player.board.length >= BOARD_LIMIT) return;
    stateDraft.player.hand.splice(handIndex, 1);
    stateDraft.player.credits -= cost;
    stateDraft.player.board.push(makeCardInstance(card, 'player', {
      ready: false,
      summonTurn: stateDraft.turn,
      enteredAtTurn: stateDraft.turn,
      flash: 'new-card',
    }));
    pushLog(stateDraft, 'Deploy', `${card.name} hits the table exhausted.`);
    clearTransientState(stateDraft);
    return;
  }

  if (isGear(card)) {
    stateDraft.player.hand.splice(handIndex, 1);
    stateDraft.player.credits -= cost;
    stateDraft.pendingAction = { type: 'play-gear', card };
    pushLog(stateDraft, 'Gear Ready', `${card.name} is waiting for a friendly unit to equip.`);
    return;
  }

  if (isProgram(card)) {
    performProgram(stateDraft, handIndex, card);
  }
}

function canAttack(stateDraft, instanceId) {
  if (stateDraft.phase !== 'player-attack' || stateDraft.status !== 'playing') return false;
  const card = stateDraft.player.board.find(entry => entry.instanceId === instanceId);
  return Boolean(card && card.ready);
}

function canTargetPending(stateDraft, card) {
  if (!stateDraft.pendingAction || !card) return false;
  if (stateDraft.pendingAction.type === 'play-gear') return card.owner === 'player';
  if (stateDraft.pendingAction.type === 'program-friendly-buff') return card.owner === 'player';
  if (stateDraft.pendingAction.type === 'program-spend-rival') return card.owner === 'boss';
  if (stateDraft.pendingAction.type === 'program-bounce-spent') return !card.ready;
  return false;
}

function beginAttackSelection(stateDraft) {
  if (!stateDraft.selectedCardId || !canAttack(stateDraft, stateDraft.selectedCardId)) return;
  stateDraft.pendingAction = { type: 'attack', attackerId: stateDraft.selectedCardId };
  stateDraft.selectedTargetId = null;
  pushLog(stateDraft, 'Attack Line', 'Choose a rival unit or the district core, then confirm the attack.');
}

function resolvePlayerAttack(stateDraft) {
  if (!stateDraft.pendingAction || stateDraft.pendingAction.type !== 'attack' || !stateDraft.selectedTargetId) return;
  const attacker = stateDraft.player.board.find(card => card.instanceId === stateDraft.pendingAction.attackerId);
  if (!attacker || !attacker.ready) return;

  if (stateDraft.boss.lockDownActive && stateDraft.player.attackAttemptsThisTurn === 0 && hasReadyBossUnit(stateDraft)) {
    stateDraft.player.attackAttemptsThisTurn += 1;
    spendCard(attacker);
    markFlash(attacker, 'blocked-card');
    pushLog(stateDraft, 'Lockdown', `Arasaka Lockdown blanks ${attacker.data.name}'s first attack this turn.`);
    clearTransientState(stateDraft);
    return;
  }

  stateDraft.player.attackAttemptsThisTurn += 1;

  if (stateDraft.selectedTargetId === 'boss-core') {
    const blocker = strongestReady(stateDraft.boss.board);
    if (blocker) {
      markFlash(blocker, 'blocked-card');
      pushLog(stateDraft, 'Intercept', `${blocker.data.name} steps in to protect the core.`);
      resolveCombat(stateDraft, attacker, blocker, { title: 'Fight', flash: 'blocked-card' });
      clearTransientState(stateDraft);
      return;
    }

    spendCard(attacker);
    markFlash(attacker, 'hit-card');
    claimObjective(stateDraft, attacker.data.name);
    clearTransientState(stateDraft);
    return;
  }

  const defender = stateDraft.boss.board.find(card => card.instanceId === stateDraft.selectedTargetId);
  if (!defender) return;
  resolveCombat(stateDraft, attacker, defender, { title: 'Fight' });
  clearTransientState(stateDraft);
}

function spawnBossUnit(stateDraft, template, title) {
  if (stateDraft.boss.board.length >= BOARD_LIMIT) return false;
  stateDraft.boss.board.push(makeCardInstance(template, 'boss', {
    ready: true,
    enteredAtTurn: stateDraft.turn,
    flash: 'new-card',
  }));
  pushLog(stateDraft, title, `${template.name} deploys to the defense grid.`);
  return true;
}

function ensureBossDefender(stateDraft) {
  if (stateDraft.boss.board.length === 0) {
    spawnBossUnit(stateDraft, bossDefinition.lowSpawn, 'Boss Priority');
  }
}

function maybeSpawnThresholdUnits(stateDraft) {
  if (stateDraft.boss.alert >= 3 && !stateDraft.boss.spawnedAt3) {
    spawnBossUnit(stateDraft, bossDefinition.lowSpawn, 'Alert 3');
    stateDraft.boss.spawnedAt3 = true;
  }
  if (stateDraft.boss.alert >= 6 && !stateDraft.boss.spawnedAt6) {
    spawnBossUnit(stateDraft, bossDefinition.highSpawn, 'Alert 6');
    stateDraft.boss.spawnedAt6 = true;
  }
  stateDraft.boss.lockDownActive = stateDraft.boss.alert >= 9;
  if (stateDraft.boss.alert === 9) {
    pushLog(stateDraft, 'Alert 9', 'Lockdown is active. The first player attack each turn is blocked if a ready defender remains.');
  }
}

function maybeAutoBlockPlayer(stateDraft, attacker) {
  const blockers = stateDraft.player.board.filter(card => card.ready);
  if (blockers.length === 0) return null;
  const incoming = Math.max(1, Math.ceil(getCardPower(attacker) / 2));
  const lethal = stateDraft.player.hp <= incoming;
  return blockers
    .filter(card => lethal || getCardPower(card) >= getCardPower(attacker))
    .sort((a, b) => getCardPower(b) - getCardPower(a))[0] || null;
}

function startNextPlayerTurn(stateDraft) {
  stateDraft.turn += 1;
  stateDraft.phase = 'player-main';
  stateDraft.player.credits = Math.min(10, 2 + stateDraft.turn);
  stateDraft.player.attackAttemptsThisTurn = 0;
  refreshReadyUnits(stateDraft.player.board);
  refreshReadyUnits(stateDraft.boss.board);
  resetTurnBuffs(stateDraft.player.board);
  resetTurnBuffs(stateDraft.boss.board);
  drawCardsInto(stateDraft, 1);
  clearTransientState(stateDraft);
  pushLog(stateDraft, 'Player Turn', `Turn ${stateDraft.turn}. Draw 1 and refresh the crew.`);
}

function bossTakeTurn(stateDraft) {
  if (stateDraft.status !== 'playing') return;
  stateDraft.phase = 'boss-turn';
  pushLog(stateDraft, 'Boss Turn', 'Arasaka executes its district defense script.');

  stateDraft.boss.alert += 1;
  pushLog(stateDraft, 'Alert Rising', `Alert increases to ${stateDraft.boss.alert}.`);
  maybeSpawnThresholdUnits(stateDraft);
  ensureBossDefender(stateDraft);

  stateDraft.boss.board.forEach(unit => {
    if (!unit.ready || stateDraft.status !== 'playing') return;
    const readyPlayerUnits = stateDraft.player.board.filter(card => card.ready);
    const highestPlayerPower = Math.max(0, ...readyPlayerUnits.map(getCardPower));
    const safePressure = readyPlayerUnits.length === 0 || getCardPower(unit) > highestPlayerPower;

    if (!safePressure) {
      pushLog(stateDraft, 'Boss Priority', `${unit.data.name} holds position to protect the district core.`);
      return;
    }

    const blocker = maybeAutoBlockPlayer(stateDraft, unit);
    if (blocker) {
      pushLog(stateDraft, 'Auto Block', `${blocker.data.name} intercepts ${unit.data.name}.`);
      resolveCombat(stateDraft, unit, blocker, { title: 'Boss Attack' });
      return;
    }

    spendCard(unit);
    const damage = Math.max(1, Math.ceil(getCardPower(unit) / 2));
    stateDraft.player.hp -= damage;
    markFlash(unit, 'hit-card');
    pushLog(stateDraft, 'Boss Attack', `${unit.data.name} pressures the runner for ${damage} damage.`);
    if (stateDraft.player.hp <= 0) {
      stateDraft.status = 'lost';
      stateDraft.phase = 'game-over';
      stateDraft.gameOverReason = 'Your runner was flatlined by the defense grid.';
    }
  });

  if (stateDraft.status !== 'playing') return;

  if (stateDraft.boss.alert >= 10) {
    stateDraft.status = 'lost';
    stateDraft.phase = 'game-over';
    stateDraft.gameOverReason = 'Alert 10 triggered total lockdown.';
    pushLog(stateDraft, 'Lockdown Complete', 'District-wide quarantine seals the run at the end of the boss turn.');
    return;
  }

  startNextPlayerTurn(stateDraft);
}

function updateSelectedCard(stateDraft, cardId) {
  if (stateDraft.pendingAction && stateDraft.pendingAction.type === 'attack') {
    if (cardId === 'boss-core' || stateDraft.boss.board.some(card => card.instanceId === cardId)) {
      stateDraft.selectedTargetId = cardId;
      return;
    }
  }

  if (stateDraft.pendingAction && stateDraft.pendingAction.type !== 'attack') {
    const targetCard = findBoardCard(stateDraft, cardId);
    if (canTargetPending(stateDraft, targetCard)) {
      stateDraft.selectedTargetId = cardId;
      return;
    }
  }

  stateDraft.selectedCardId = cardId;
}

function reduceState(currentState, action) {
  const next = JSON.parse(JSON.stringify(currentState));

  if (action.type === 'reset') return createInitialState();
  if (action.type === 'start') return startRun();
  if (currentState.status === 'won' || currentState.status === 'lost') return next;

  switch (action.type) {
    case 'select-card':
      updateSelectedCard(next, action.cardId);
      break;
    case 'play-card':
      if (next.phase === 'player-main') performPlayCard(next, action.handIndex);
      break;
    case 'resolve-target':
      resolvePendingTarget(next, action.targetId);
      break;
    case 'end-phase':
      if (next.phase === 'player-main' && !next.pendingAction) {
        next.phase = 'player-attack';
        clearTransientState(next);
        pushLog(next, 'Attack Phase', 'Units with a clean line can now attack.');
      }
      break;
    case 'begin-attack':
      beginAttackSelection(next);
      break;
    case 'confirm-attack':
      resolvePlayerAttack(next);
      break;
    case 'end-turn':
      if (next.phase === 'player-attack' && !next.pendingAction) {
        clearTransientState(next);
        bossTakeTurn(next);
      }
      break;
    default:
      break;
  }

  return next;
}

function dispatch(action) {
  state = reduceState(state, action);
  render();
}

function boardStatePills(card) {
  if (!card.data) return '';
  const pills = [];
  const health = getCardHealth(card);
  pills.push(`<span class="state-pill">HP ${Math.max(0, health - card.damage)} / ${health}</span>`);
  if (card.tempPowerBonus > 0) pills.push(`<span class="state-pill">+${card.tempPowerBonus} turn</span>`);
  if (card.attachedGear.length > 0) pills.push(`<span class="state-pill">${card.attachedGear.length} gear</span>`);
  return pills.join('');
}

function renderCard(card, options = {}) {
  const data = getCardData(card);
  const imgSrc = cardImageSrc(data);
  const maxHealth = getCardHealth(card);
  const classes = [
    'solo-card',
    options.bossZone ? 'boss-asset-card' : '',
    options.hand ? 'hand-card' : '',
    card.ready === false ? 'exhausted' : '',
    card.damage > 0 && maxHealth > 0 ? 'damaged' : '',
    card.owner === 'boss' && data.placeholder ? 'hidden-boss' : '',
    options.selected ? 'selected' : '',
    options.targetable ? 'targetable' : '',
    options.canAttack ? 'can-attack' : '',
    options.canBlock ? 'can-block' : '',
    card.flash || '',
  ].filter(Boolean).join(' ');
  const fanOffset = options.fanOffset ?? 0;
  const cardIdAttr = options.preview ? '' : ` data-card-id="${card.instanceId || ''}"`;
  const tabIndexAttr = options.preview ? '' : ' tabindex="0"';

  if (options.hand || options.artOnly) {
    return `
      <article class="${classes}"${cardIdAttr}${tabIndexAttr} style="--fan-offset:${fanOffset};--fan-lift:${Math.abs(fanOffset) * 2}px;--fan-layer:${100 + (options.handIndex || 0)};--fan-overlap:${Math.max(0, 42 - (options.handCount || 0) * 2)}px;">
        <div class="solo-card-art hand-card-art">
          ${imgSrc
            ? `<img src="${imgSrc}" alt="${data.name}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=&quot;solo-card-placeholder&quot;>No Art</div>'">`
            : `<div class="solo-card-placeholder">${data.placeholder ? 'Boss Asset' : 'No Art'}</div>`}
        </div>
      </article>
    `;
  }

  return `
    <article class="${classes}"${cardIdAttr}${tabIndexAttr} style="--fan-offset:${fanOffset};--fan-lift:${options.hand ? Math.abs(fanOffset) * 2 : 0}px;--fan-layer:${options.hand ? 100 + (options.handIndex || 0) : 1};--fan-overlap:${options.hand ? Math.max(0, 42 - (options.handCount || 0) * 2) : 0}px;">
      <div class="solo-card-art">
        ${imgSrc
          ? `<img src="${imgSrc}" alt="${data.name}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=&quot;solo-card-placeholder&quot;>No Art</div>'">`
          : `<div class="solo-card-placeholder">${data.placeholder ? 'Boss Asset' : 'No Art'}</div>`}
        <div class="card-state-row">${boardStatePills(card)}</div>
      </div>
      <div class="solo-card-body">
        <div>
          <h3>${data.name || data.slug}</h3>
          <div class="solo-card-sub">${data.subtitle || '&nbsp;'}</div>
        </div>
        ${data.type ? `<span class="type-badge ${typeClass(data.type)}">${data.type}</span>` : ''}
        <div class="solo-card-footer">
          <div class="card-stats">
            ${statChip('COST', data.cost, 'stat-cost')}
            ${statChip('PWR', getCardPower(card), 'stat-power')}
            ${statChip('RAM', data.ram, 'stat-ram')}
          </div>
        </div>
        <div class="attached-gear">${(card.attachedGear || []).map(slug => `<span class="gear-tag">${cardsBySlug.get(slug)?.name || slug}</span>`).join('')}</div>
        <p class="solo-card-text">${abilityText(data) || 'No rules text loaded for this asset.'}</p>
      </div>
    </article>
  `;
}

function renderBossCore() {
  const alertWidth = `${(state.boss.alert / 10) * 100}%`;
  const targetable = state.pendingAction?.type === 'attack' ? 'targetable' : '';
  const selected = state.selectedTargetId === 'boss-core' ? 'selected' : '';
  elements.bossCore.className = `boss-core ${state.boss.lockDownActive ? 'lockdown-active' : ''} ${targetable} ${selected}`.trim();
  elements.bossCore.innerHTML = `
    <div class="boss-core-title">
      <div>
        <p class="zone-label">Boss</p>
        <h3>${bossDefinition.name}</h3>
        <p class="solo-card-sub">${bossDefinition.title}</p>
      </div>
      <span class="state-pill">Alert ${state.boss.alert} / 10</span>
    </div>
    <div class="alert-meter">
      <div class="alert-bar"><div class="alert-fill" style="width:${alertWidth}"></div></div>
      <div class="alert-thresholds">
        ${bossDefinition.thresholds.map(value => `
          <span class="threshold-pill ${state.boss.alert >= value ? 'reached' : ''}">
            ${value === 9 ? '9 Lock' : value === 10 ? '10 Lose' : `${value} Spawn`}
          </span>
        `).join('')}
      </div>
    </div>
    <div class="boss-rules">
      <div>${state.boss.lockDownActive ? 'Lockdown active.' : 'Lockdown begins at Alert 9.'}</div>
    </div>
  `;
}

function renderObjectives() {
  elements.objectiveZone.innerHTML = state.objectives.map((objective, index) => `
    <article class="objective-card ${objective.claimedBy === 'player' ? 'player' : ''} ${state.boss.lockDownActive && objective.claimedBy !== 'player' ? 'locked' : ''}">
      <p class="zone-label">Gig ${index + 1}</p>
      <h3>${objective.name}</h3>
      <p class="solo-card-text">${objective.reward}</p>
      <div class="objective-status">
        <span>${objective.claimedBy === 'player' ? 'Secured by player' : 'Still protected by Arasaka'}</span>
        <strong>${objective.claimedBy === 'player' ? 'Claimed' : 'Open'}</strong>
      </div>
    </article>
  `).join('');
}

function renderZoneCards(container, cards, options = {}) {
  if (cards.length === 0) {
    container.innerHTML = `<div class="empty-zone">${options.emptyText || 'No cards in this zone.'}</div>`;
    return;
  }

  container.innerHTML = cards.map((card, index) => renderCard(card, {
    hand: options.hand,
    artOnly: options.artOnly,
    bossZone: options.bossZone,
    selected: state.selectedCardId === card.instanceId || state.selectedTargetId === card.instanceId,
    targetable: options.targetCheck ? options.targetCheck(card) : false,
    canAttack: options.canAttackCheck ? options.canAttackCheck(card) : false,
    canBlock: options.canBlockCheck ? options.canBlockCheck(card) : false,
    handIndex: index,
    handCount: cards.length,
    fanOffset: options.hand ? index - ((cards.length - 1) / 2) : 0,
  })).join('');
}

function deriveTargetCheck(card) {
  if (state.pendingAction?.type === 'attack') return card.owner === 'boss';
  return canTargetPending(state, card);
}

function rebuildPresentationalLookup() {
  presentationalLookup = new Map();
  [...state.player.hand, ...state.player.board, ...state.boss.board].forEach(card => {
    if (card?.instanceId) presentationalLookup.set(card.instanceId, card);
  });
}

function renderStatus() {
  const progress = state.objectives.filter(objective => objective.claimedBy === 'player').length;
  elements.statusGrid.innerHTML = `
    <div class="status-item"><span>Runner HP</span><strong>${state.player.hp}</strong></div>
    <div class="status-item"><span>Credits</span><strong>${state.player.credits}</strong></div>
    <div class="status-item"><span>Turn</span><strong>${state.turn}</strong></div>
    <div class="status-item"><span>Alert</span><strong>${state.boss.alert}</strong></div>
    <div class="status-item"><span>Deck</span><strong>${state.player.deck.length}</strong></div>
    <div class="status-item"><span>Hand</span><strong>${state.player.hand.length}</strong></div>
    <div class="status-item"><span>Gigs</span><strong>${progress} / ${OBJECTIVES_TO_WIN}</strong></div>
  `;
}

function renderLog() {
  elements.turnLogDrawer.classList.toggle('is-open', ui.logOpen);
  elements.logToggleBtn.textContent = ui.logOpen ? 'Hide Log' : 'Log';
  elements.turnLog.innerHTML = state.log.length
    ? state.log.map(entry => `<div class="log-entry"><strong>${entry.title}</strong><p>${entry.text}</p></div>`).join('')
    : `<div class="empty-zone">No events yet.</div>`;
}

function getPreviewCard() {
  if (ui.hoveredCard) return ui.hoveredCard;
  if (state.selectedCardId) {
    return presentationalLookup.get(state.selectedCardId)
      || null;
  }
  return state.lastPreviewCard || null;
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

function hidePreviewZoom() {
  if (!elements.previewZoom || !elements.previewZoomImage) return;
  elements.previewZoom.classList.remove('is-visible');
  elements.previewZoom.setAttribute('aria-hidden', 'true');
  elements.previewZoomImage.removeAttribute('src');
  elements.previewZoomImage.alt = '';
}

function wirePreviewZoom() {
  const frame = elements.cardPreview ? elements.cardPreview.querySelector('.preview-image-frame') : null;
  const img = frame ? frame.querySelector('img') : null;
  if (!frame || !img || !elements.previewZoom || !elements.previewZoomImage) {
    hidePreviewZoom();
    return;
  }

  frame.addEventListener('mouseenter', () => {
    const src = img.getAttribute('src');
    if (!src) return;
    elements.previewZoomImage.src = src;
    elements.previewZoomImage.alt = img.getAttribute('alt') || '';
    elements.previewZoom.classList.add('is-visible');
    elements.previewZoom.setAttribute('aria-hidden', 'false');
  });

  frame.addEventListener('mouseleave', hidePreviewZoom);
}

function applyAdaptiveSizing() {
  const viewportHeight = window.innerHeight || 900;

  // Fit boss asset cards by viewport height and available row width.
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

  // Fit preview frame to available viewport/container height.
  const frame = elements.cardPreview ? elements.cardPreview.querySelector('.preview-image-frame') : null;
  if (frame && elements.cardPreviewOverlay) {
    const overlayRect = elements.cardPreviewOverlay.getBoundingClientRect();
    const previewHead = elements.cardPreviewOverlay.querySelector('.preview-head');
    const headHeight = previewHead ? previewHead.offsetHeight : 0;
    const viewportRoom = Math.max(140, window.innerHeight - overlayRect.top - 14);
    const previewBodyRoom = Math.max(140, elements.cardPreview ? elements.cardPreview.clientHeight : 140);
    const frameHeight = Math.max(140, Math.min(viewportRoom - headHeight - 8, previewBodyRoom, 560));
    const frameWidth = frameHeight * (63 / 88);
    frame.style.height = `${frameHeight}px`;
    frame.style.maxHeight = `${frameHeight}px`;
    frame.style.width = `min(100%, ${frameWidth}px)`;
  }
}

function renderPreview() {
  const preview = getPreviewCard();
  if (!preview) {
    elements.cardPreviewOverlay.classList.add('is-hidden');
    elements.previewTitle.textContent = 'Hover a card';
    elements.cardPreview.innerHTML = `<div class="empty-preview">Card art appears here when you hover or select a card.</div>`;
    hidePreviewZoom();
    return;
  }

  const data = preview.data || preview;
  const imgSrc = cardImageSrc(data);
  elements.cardPreviewOverlay.classList.remove('is-hidden');
  elements.previewTitle.textContent = data.name || data.slug;
  elements.cardPreview.innerHTML = `
    <div class="preview-image-frame">
      ${imgSrc
        ? `<img src="${imgSrc}" alt="${data.name || data.slug}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=&quot;solo-card-placeholder preview-placeholder&quot;>No Art</div>'">`
        : `<div class="solo-card-placeholder preview-placeholder">${data.placeholder ? 'Boss Asset' : 'No Art'}</div>`}
    </div>
  `;
  fitPreviewHeaderTitle();
  applyAdaptiveSizing();
  wirePreviewZoom();
}

function renderMeta() {
  const progress = state.objectives.filter(objective => objective.claimedBy === 'player').length;
  elements.alertDisplay.textContent = `${state.boss.alert} / 10`;
  elements.objectiveProgress.textContent = `${progress} / ${OBJECTIVES_TO_WIN}`;
  elements.phaseDisplay.textContent = state.phase.replace('player-main', 'Player Main').replace('player-attack', 'Player Attack').replace('boss-turn', 'Boss Turn').replace('game-over', 'Game Over');
  if (elements.bossMeta) elements.bossMeta.textContent = `${state.boss.board.length} defenders online`;
  if (elements.objectiveMeta) elements.objectiveMeta.textContent = `${OBJECTIVES_TO_WIN - progress} gigs remaining`;
  if (elements.playerMeta) elements.playerMeta.textContent = `${state.player.board.length} units in play`;
  if (elements.handMeta) elements.handMeta.textContent = `${state.player.hand.length} cards in hand`;

  if (state.status === 'won' || state.status === 'lost') {
    elements.runSummary.textContent = state.gameOverReason;
  } else if (state.mode === 'pregame') {
    elements.runSummary.textContent = 'Use your saved deck or the fallback runner stack.';
  } else {
    elements.runSummary.textContent = 'Deploy, attack, end turn.';
  }

  Object.values(elements.phaseChips).forEach(chip => chip?.classList.remove('active'));
  if (state.phase === 'setup') elements.phaseChips.setup?.classList.add('active');
  if (state.phase === 'player-main') elements.phaseChips.playerMain?.classList.add('active');
  if (state.phase === 'player-attack') elements.phaseChips.playerAttack?.classList.add('active');
  if (state.phase === 'boss-turn') elements.phaseChips.bossTurn?.classList.add('active');
  if (state.phase === 'game-over') elements.phaseChips.gameOver?.classList.add('active');
}

function renderControls() {
  const selectedBoardCard = state.player.board.find(card => card.instanceId === state.selectedCardId);
  elements.startBtn.disabled = state.mode !== 'pregame';
  elements.endPhaseBtn.disabled = !(state.phase === 'player-main' && state.status === 'playing' && !state.pendingAction);
  elements.endTurnBtn.disabled = !(state.phase === 'player-attack' && state.status === 'playing' && !state.pendingAction);
  elements.attackBtn.disabled = !(selectedBoardCard && canAttack(state, selectedBoardCard.instanceId) && !state.pendingAction);
  elements.confirmTargetBtn.disabled = !(
    state.pendingAction
    && state.selectedTargetId
  );
}

function attachInteractions() {
  document.querySelectorAll('[data-card-id]').forEach(node => {
    node.addEventListener('mouseenter', () => {
      const cardId = node.dataset.cardId;
      const card = presentationalLookup.get(cardId) || null;
      if (card) {
        ui.hoveredCard = card;
        state.lastPreviewCard = card;
        renderPreview();
      }
    });

    node.addEventListener('mouseleave', () => {
      ui.hoveredCard = null;
      renderPreview();
    });

    node.addEventListener('click', () => {
      const cardId = node.dataset.cardId;
      if (!cardId) return;

      const handIndex = state.player.hand.findIndex(card => card.instanceId === cardId);
      if (handIndex !== -1) {
        if (state.phase === 'player-main' && !state.pendingAction) {
          dispatch({ type: 'play-card', handIndex });
        } else {
          state.selectedCardId = cardId;
          render();
        }
        return;
      }

      if (state.pendingAction && state.pendingAction.type !== 'attack' && canTargetPending(state, findBoardCard(state, cardId))) {
        state.selectedTargetId = cardId;
        render();
        return;
      }

      dispatch({ type: 'select-card', cardId });
    });
  });

  elements.bossCore.onclick = () => {
    if (state.pendingAction?.type === 'attack') {
      state.selectedTargetId = 'boss-core';
      render();
    }
  };
}

function render() {
  rebuildPresentationalLookup();
  renderMeta();
  renderBossCore();
  renderObjectives();
  renderZoneCards(elements.bossBoard, state.boss.board, {
    bossZone: true,
    emptyText: 'No defenders online.',
    targetCheck: deriveTargetCheck,
    canBlockCheck: card => card.ready,
  });
  renderZoneCards(elements.playerBoard, state.player.board, {
    emptyText: 'Deploy units here from your hand.',
    artOnly: true,
    targetCheck: deriveTargetCheck,
    canAttackCheck: card => canAttack(state, card.instanceId),
    canBlockCheck: card => card.ready,
  });
  renderZoneCards(elements.playerHand, state.player.hand, {
    hand: true,
    emptyText: 'No cards in hand.',
  });
  renderStatus();
  renderControls();
  renderLog();
  renderPreview();
  applyAdaptiveSizing();
  attachInteractions();
}

function wireControls() {
  elements.startBtn.addEventListener('click', () => dispatch({ type: 'start' }));
  elements.endPhaseBtn.addEventListener('click', () => dispatch({ type: 'end-phase' }));
  elements.endTurnBtn.addEventListener('click', () => dispatch({ type: 'end-turn' }));
  elements.attackBtn.addEventListener('click', () => dispatch({ type: 'begin-attack' }));
  elements.confirmTargetBtn.addEventListener('click', () => {
    if (state.pendingAction?.type === 'attack') {
      dispatch({ type: 'confirm-attack' });
    } else if (state.selectedTargetId) {
      dispatch({ type: 'resolve-target', targetId: state.selectedTargetId });
    }
  });
  elements.resetBtn.addEventListener('click', () => dispatch({ type: 'reset' }));
  elements.logToggleBtn.addEventListener('click', () => {
    ui.logOpen = !ui.logOpen;
    renderLog();
  });
  elements.logCloseBtn.addEventListener('click', () => {
    ui.logOpen = false;
    renderLog();
  });

  window.addEventListener('resize', () => {
    fitPreviewHeaderTitle();
    applyAdaptiveSizing();
    hidePreviewZoom();
  });
}

fetch('cards.json')
  .then(response => {
    if (!response.ok) throw new Error('cards.json not found');
    return response.json();
  })
  .then(cards => {
    cardsBySlug = new Map(cards.map(card => [card.slug, card]));
    state = createInitialState();
    wireControls();
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
