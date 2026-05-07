(() => {
  const SUPPORTED_BOARD_TYPES = new Set(['UNIT', 'LEGEND']);

  function cloneCard(card) {
    return JSON.parse(JSON.stringify(card));
  }

  function sanitizedRawCard(card) {
    const clone = cloneCard(card || {});
    delete clone.instanceId;
    delete clone.owner;
    delete clone.currentHp;
    delete clone.maxHp;
    delete clone.ready;
    delete clone.exhausted;
    delete clone.enteredTurn;
    delete clone.flash;
    delete clone.powerModifier;
    delete clone.data;
    return clone;
  }

  function rawCard(card) {
    return card && card.data ? sanitizedRawCard(card.data) : sanitizedRawCard(card);
  }

  function getCardName(card) {
    const source = rawCard(card);
    return source.name || source.title || source.slug || 'Unknown Asset';
  }

  function getCardSubtitle(card) {
    return rawCard(card).subtitle || '';
  }

  function getCardType(card) {
    const source = rawCard(card);
    return String(source.type || source.cardType || source.kind || '').toUpperCase();
  }

  function getCardCost(card) {
    const source = rawCard(card);
    const value = source.cost ?? source.creditCost ?? source.resourceCost;
    return Number.isFinite(Number(value)) ? Number(value) : 0;
  }

  function getBaseCardPower(card) {
    const source = rawCard(card);
    const value = source.power ?? source.attack ?? source.strength;
    if (Number.isFinite(Number(value))) return Math.max(0, Number(value));
    // Prototype fallback: unsupported source data should still produce a playable unit.
    return SUPPORTED_BOARD_TYPES.has(getCardType(source)) ? 1 : 0;
  }

  function getCardPower(card) {
    const source = rawCard(card);
    const modifier = Number(card?.powerModifier || 0);
    return Math.max(0, getBaseCardPower(source) + modifier);
  }

  function getBaseCardHP(card) {
    const source = rawCard(card);
    const value = source.hp ?? source.health ?? source.durability;
    if (Number.isFinite(Number(value))) return Math.max(1, Number(value));
    // Prototype fallback: if a unit has no HP field, derive a small durability track from power.
    return SUPPORTED_BOARD_TYPES.has(getCardType(source))
      ? Math.max(1, Math.ceil(getBaseCardPower(source) / 2))
      : 1;
  }

  function getCardHP(card) {
    if (Number.isFinite(Number(card?.maxHp))) return Math.max(1, Number(card.maxHp));
    return getBaseCardHP(card);
  }

  function getCardArt(card) {
    const source = rawCard(card);
    return source.image || source.imageUrl || source.art || null;
  }

  function getCardText(card) {
    const source = rawCard(card);
    if (Array.isArray(source.abilities)) return source.abilities.filter(Boolean).join(' ');
    return source.text || source.rulesText || '';
  }

  function isSupportedBoardCard(card) {
    return SUPPORTED_BOARD_TYPES.has(getCardType(card));
  }

  function createInstanceId(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function createHandCard(card, owner = 'player') {
    return {
      ...cloneCard(rawCard(card)),
      owner,
      instanceId: createInstanceId(`${owner}-hand`),
    };
  }

  function createBoardCard(card, owner, overrides = {}) {
    const source = rawCard(card);
    const maxHp = getBaseCardHP(source);
    return {
      instanceId: overrides.instanceId || createInstanceId(`${owner}-board`),
      owner,
      data: cloneCard(source),
      currentHp: overrides.currentHp ?? maxHp,
      maxHp,
      ready: overrides.ready ?? false,
      exhausted: overrides.exhausted ?? !overrides.ready,
      enteredTurn: overrides.enteredTurn ?? 0,
      flash: overrides.flash || '',
      powerModifier: overrides.powerModifier || 0,
    };
  }

  function deckCardFromInstance(card) {
    return cloneCard(rawCard(card));
  }

  function shuffle(cards) {
    const clone = [...cards];
    for (let index = clone.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [clone[index], clone[swapIndex]] = [clone[swapIndex], clone[index]];
    }
    return clone;
  }

  function currentDeckRecord() {
    const state = window.DeckStore?.getState?.() || {};
    const decks = Array.isArray(state.decks) ? state.decks : [];
    const currentDeckId = state.currentDeckId || null;
    return decks.find(deck => deck.id === currentDeckId) || null;
  }

  function buildFallbackDeck(cardsBySlug) {
    const preferred = [
      'v-streetkid',
      'ruthless-lowlife',
      'swordwise-huscle',
      'kerry-eurodyne-the-last-rockerboy',
      'jackie-welles-ride-or-die-choom',
      't-bug-amateur-philosopher',
      'secondhand-bombus',
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
      'royce-psycho-on-the-edge',
    ];

    return preferred
      .map(slug => cardsBySlug.get(slug))
      .filter(Boolean)
      .map(cloneCard);
  }

  function buildPlayerDeck(cardsBySlug) {
    const savedDeck = currentDeckRecord();
    if (savedDeck) {
      const cards = [];
      Object.entries(savedDeck.cards || {}).forEach(([slug, quantity]) => {
        const baseCard = cardsBySlug.get(slug);
        if (!baseCard) return;
        for (let index = 0; index < quantity; index += 1) cards.push(cloneCard(baseCard));
      });
      if (cards.length > 0) {
        return { name: savedDeck.name, cards, source: 'saved' };
      }
    }

    return {
      name: 'Fallback Runner Stack',
      cards: buildFallbackDeck(cardsBySlug),
      source: 'fallback',
    };
  }

  window.SoloCardUtils = {
    cloneCard,
    rawCard,
    getCardName,
    getCardSubtitle,
    getCardType,
    getCardCost,
    getCardPower,
    getCardHP,
    getCardArt,
    getCardText,
    isSupportedBoardCard,
    createHandCard,
    createBoardCard,
    deckCardFromInstance,
    shuffle,
    buildPlayerDeck,
    createInstanceId,
  };
})();
