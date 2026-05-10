(() => {
  const {
    PLAYER_HP,
    STARTING_HAND,
    OBJECTIVES_TO_WIN,
    BOARD_LIMIT,
    MAX_LOG,
    ALERT_LOSE_AT,
    PHASES,
    STATUSES,
    ACTIONS,
  } = window.SoloGameTypes;

  const Bosses = window.SoloBosses;
  const CardUtils = window.SoloCardUtils;
  const ALERT_SPAWN_RULES = {
    1: ['firewallDrone'],
    3: ['firewallDrone'],
    5: ['lockdownEnforcer'],
    7: ['firewallDrone', 'lockdownEnforcer'],
    9: ['lockdownEnforcer'],
  };

  function pushLog(state, title, text) {
    state.log.unshift({
      id: CardUtils.createInstanceId('log'),
      title,
      text,
    });
    state.log = state.log.slice(0, MAX_LOG);
  }

  function clearSelections(state) {
    state.selectedCardId = null;
    state.selectedAttackerId = null;
    state.selectedTargetId = null;
    state.selectedGigId = null;
  }

  function clearBoardFlashes(state) {
    state.player.board.forEach(card => {
      card.flash = '';
    });
    state.boss.board.forEach(card => {
      card.flash = '';
    });
  }

  function recordCombat(state, attackerId, targetId) {
    state.combatCounter = Number(state.combatCounter || 0) + 1;
    state.lastCombat = {
      seq: state.combatCounter,
      attackerId,
      targetId,
    };
  }

  function readyEddies(state) {
    return state.eddieArea.filter(eddie => !eddie.isSpent);
  }

  function countReadyEddies(state) {
    return readyEddies(state).length;
  }

  function canSellCard(card) {
    if (!card) return false;
    // TODO: Replace this prototype check with Sell Tag validation.
    return CardUtils.getCardType(card) !== 'LEGEND';
  }

  function createInitialState(cardsBySlug) {
    return {
      mode: 'pregame',
      status: STATUSES.IDLE,
      phase: PHASES.SETUP,
      currentPhase: 'setup',
      turn: 0,
      eddieArea: [],
      hasSoldThisTurn: false,
      player: {
        name: '',
        source: '',
        hp: PLAYER_HP,
        deck: [],
        hand: [],
        discard: [],
        board: [],
      },
      boss: {
        definition: Bosses.bossDefinition,
        templates: Bosses.resolveBossTemplates(cardsBySlug),
        alert: 0,
        board: [],
        lockdownActive: false,
      },
      gigs: Bosses.createContestedGigs(),
      selectedCardId: null,
      selectedAttackerId: null,
      selectedTargetId: null,
      selectedGigId: null,
      combatCounter: 0,
      lastCombat: null,
      gameResult: '',
      gameOverReason: '',
      log: [],
    };
  }

  function startRun(cardsBySlug) {
    const deckInfo = CardUtils.buildPlayerDeck(cardsBySlug);
    const next = createInitialState(cardsBySlug);
    next.mode = 'active';
    next.status = STATUSES.PLAYING;
    next.phase = PHASES.PLAYER_MAIN;
    next.currentPhase = 'play';
    next.turn = 1;
    next.player.name = deckInfo.name;
    next.player.source = deckInfo.source;
    next.player.deck = CardUtils.shuffle(deckInfo.cards);

    drawCards(next, STARTING_HAND);
    pushLog(next, 'Run Started', `${deckInfo.name} enters the district. Secure 3 gigs before Alert 10.`);
    if (deckInfo.source === 'fallback') {
      pushLog(next, 'Deck Source', 'No saved deck was active, so Solo Mode assembled a fallback runner stack.');
    }
    return next;
  }

  function cloneState(state) {
    return JSON.parse(JSON.stringify(state));
  }

  function drawCards(state, amount) {
    for (let count = 0; count < amount; count += 1) {
      const topCard = state.player.deck.shift();
      if (!topCard) {
        pushLog(state, 'Deck Empty', 'No cards remained to draw.');
        break;
      }
      state.player.hand.push(CardUtils.createHandCard(topCard));
    }
  }

  function findHandCard(state, cardId) {
    return state.player.hand.find(card => card.instanceId === cardId) || null;
  }

  function findBoardCard(state, cardId) {
    return state.player.board.find(card => card.instanceId === cardId)
      || state.boss.board.find(card => card.instanceId === cardId)
      || null;
  }

  function removeBoardCard(board, cardId) {
    const index = board.findIndex(card => card.instanceId === cardId);
    if (index === -1) return null;
    return board.splice(index, 1)[0];
  }

  function discardBoardCard(state, card) {
    if (!card || card.owner !== 'player') return;
    state.player.discard.push(CardUtils.deckCardFromInstance(card));
  }

  function securedGigCount(state) {
    return state.gigs.filter(gig => gig.isSecured).length;
  }

  function openGigTargets(state) {
    return state.gigs.filter(gig => !gig.isSecured).map(gig => gig.id);
  }

  function bossHasActiveDefenders(state) {
    return state.boss.board.length > 0;
  }

  function legalTargetIds(state) {
    if (state.phase !== PHASES.PLAYER_ATTACK || !state.selectedAttackerId) return [];
    if (bossHasActiveDefenders(state)) return state.boss.board.map(card => card.instanceId);
    return openGigTargets(state);
  }

  function canPlayCard(state, card) {
    if (!card || state.phase !== PHASES.PLAYER_MAIN || state.status !== STATUSES.PLAYING) return false;
    if (!CardUtils.isSupportedBoardCard(card)) return false;
    return CardUtils.getCardCost(card) <= countReadyEddies(state);
  }

  function spendEddies(state, amount) {
    const eddiesToSpend = readyEddies(state).slice(0, Math.max(0, amount));
    if (eddiesToSpend.length < amount) return false;
    eddiesToSpend.forEach(eddie => {
      eddie.isSpent = true;
    });
    return true;
  }

  function sellCardForEddie(state, cardId) {
    if (state.phase !== PHASES.PLAYER_MAIN || state.status !== STATUSES.PLAYING || state.hasSoldThisTurn) return;
    const handIndex = state.player.hand.findIndex(card => card.instanceId === cardId);
    if (handIndex === -1) return;
    const card = state.player.hand[handIndex];
    if (!canSellCard(card)) return;

    state.player.hand.splice(handIndex, 1);
    state.eddieArea.push({
      id: CardUtils.createInstanceId('eddie'),
      originalCardId: card.instanceId,
      originalCardName: CardUtils.getCardName(card),
      isSpent: false,
      createdTurn: state.turn,
    });
    state.hasSoldThisTurn = true;
    clearSelections(state);
    pushLog(state, 'Eddie Sold', `Sold ${CardUtils.getCardName(card)} for 1 Eddie.`);
  }

  function playCard(state, cardId) {
    const handIndex = state.player.hand.findIndex(card => card.instanceId === cardId);
    if (handIndex === -1) return;
    const card = state.player.hand[handIndex];
    if (!canPlayCard(state, card)) return;

    const cost = CardUtils.getCardCost(card);
    state.player.hand.splice(handIndex, 1);

    if (state.player.board.length >= BOARD_LIMIT) {
      state.player.hand.splice(handIndex, 0, card);
      return;
    }

    if (!spendEddies(state, cost)) {
      state.player.hand.splice(handIndex, 0, card);
      return;
    }

    state.player.board.push(CardUtils.createBoardCard(card, 'player', {
      ready: false,
      exhausted: true,
      enteredTurn: state.turn,
      flash: 'new-card',
    }));
    pushLog(state, 'Deploy', `${CardUtils.getCardName(card)} enters play exhausted.`);

    clearSelections(state);
  }

  function canAttackWithUnit(state, attacker) {
    return Boolean(
      attacker
      && attacker.ready
      && attacker.currentHp > 0
      && attacker.enteredTurn < state.turn
    );
  }

  function beginAttack(state, attackerId) {
    if (state.phase !== PHASES.PLAYER_ATTACK || state.status !== STATUSES.PLAYING) {
      pushLog(state, 'Invalid Attack', 'Attack attempts are only valid during the Attack Phase.');
      return;
    }
    const attacker = state.player.board.find(card => card.instanceId === attackerId);
    if (!attacker) {
      pushLog(state, 'Invalid Attack', 'Selected attacker is no longer on the field.');
      return;
    }
    if (!canAttackWithUnit(state, attacker)) {
      pushLog(state, 'Invalid Attack', `${CardUtils.getCardName(attacker)} cannot attack an open Gig right now.`);
      return;
    }
    state.selectedAttackerId = attackerId;
    state.selectedCardId = attackerId;
    state.selectedTargetId = null;
  }

  function markDefeat(state, card, board) {
    const removed = removeBoardCard(board, card.instanceId);
    discardBoardCard(state, removed);
  }

  function spawnBossDefender(state, templateKey) {
    const template = state.boss.templates[templateKey];
    if (!template) return false;
    const instance = CardUtils.createBoardCard(template, 'boss', {
      ready: true,
      exhausted: false,
      enteredTurn: state.turn,
      spawnedThisTurn: true,
      flash: 'new-card',
    });
    state.boss.board.push(instance);
    pushLog(state, 'Arasaka Deploys', `Arasaka deployed ${CardUtils.getCardName(template)}.`);
    return true;
  }

  function isSpentPlayerUnit(card) {
    return Boolean(card && card.currentHp > 0 && card.ready === false);
  }

  function eligibleBossAttackers(state) {
    return state.boss.board.filter(card => (
      card
      && card.currentHp > 0
      && card.ready
      && !card.spawnedThisTurn
    ));
  }

  function chooseBossTarget(state) {
    const spentUnits = state.player.board.filter(isSpentPlayerUnit);
    if (spentUnits.length === 0) return null;

    return spentUnits
      .slice()
      .sort((left, right) => {
        const powerGap = CardUtils.getCardPower(right) - CardUtils.getCardPower(left);
        if (powerGap !== 0) return powerGap;
        const turnGap = (left.enteredTurn ?? 0) - (right.enteredTurn ?? 0);
        if (turnGap !== 0) return turnGap;
        return state.player.board.findIndex(card => card.instanceId === left.instanceId)
          - state.player.board.findIndex(card => card.instanceId === right.instanceId);
      })[0];
  }

  function resolveBossAttack(state, attacker, target) {
    if (!attacker || !target) return;

    const attackPower = Math.max(1, CardUtils.getCardPower(attacker));
    const defendPower = Math.max(1, CardUtils.getCardPower(target));
    recordCombat(state, attacker.instanceId, target.instanceId);
    attacker.ready = false;
    attacker.exhausted = true;
    attacker.flash = 'blocked-card';
    target.flash = 'hit-card';

    pushLog(state, 'Boss Attack', `${CardUtils.getCardName(attacker)} attacked ${CardUtils.getCardName(target)}.`);

    target.currentHp -= attackPower;
    attacker.currentHp -= defendPower;
    pushLog(state, 'Damage Dealt', `${CardUtils.getCardName(attacker)} deals ${attackPower} to ${CardUtils.getCardName(target)}. ${CardUtils.getCardName(target)} deals ${defendPower} back.`);

    if (target.currentHp <= 0) {
      pushLog(state, 'Unit Defeated', `${CardUtils.getCardName(target)} was defeated.`);
      markDefeat(state, target, state.player.board);
    }
    if (attacker.currentHp <= 0) {
      pushLog(state, 'Defender Defeated', `${CardUtils.getCardName(attacker)} was defeated.`);
      removeBoardCard(state.boss.board, attacker.instanceId);
    }
  }

  function resolveBossAttackPhase(state) {
    pushLog(state, 'Boss Attack', 'Arasaka attack phase started.');

    if (!chooseBossTarget(state)) {
      pushLog(state, 'Boss Attack', 'Arasaka found no exposed targets.');
      return;
    }

    const attackers = eligibleBossAttackers(state);
    if (attackers.length === 0) return;

    let foundTarget = false;
    attackers.forEach(attacker => {
      const liveAttacker = state.boss.board.find(card => card.instanceId === attacker.instanceId);
      if (!liveAttacker || !liveAttacker.ready || liveAttacker.spawnedThisTurn || liveAttacker.currentHp <= 0) return;

      const target = chooseBossTarget(state);
      if (!target) return;
      foundTarget = true;
      clearBoardFlashes(state);
      resolveBossAttack(state, liveAttacker, target);
    });

    if (!foundTarget) {
      pushLog(state, 'Boss Attack', 'Arasaka found no exposed targets.');
    }
  }

  function resolveAlertSpawns(state) {
    const spawnQueue = [];
    const specificRule = ALERT_SPAWN_RULES[state.boss.alert] || [];

    if (state.boss.alert === 1 && state.boss.board.length === 0) {
      spawnQueue.push('firewallDrone');
    } else {
      spawnQueue.push(...specificRule);
    }

    spawnQueue.forEach(templateKey => {
      spawnBossDefender(state, templateKey);
    });

    if (state.boss.alert === 9 && !state.boss.lockdownActive) {
      state.boss.lockdownActive = true;
      pushLog(state, 'Lockdown Protocol', 'LOCKDOWN PROTOCOL ACTIVE.');
    }

    if (state.boss.board.length === 0) {
      spawnBossDefender(state, 'firewallDrone');
    }
  }

  function checkAlertLoss(state) {
    if (state.status !== STATUSES.PLAYING || state.boss.alert < ALERT_LOSE_AT) return;
    state.status = STATUSES.LOST;
    state.phase = PHASES.GAME_OVER;
    state.currentPhase = 'over';
    state.gameOverReason = 'Alert 10 triggered total lockdown.';
    pushLog(state, 'Alert 10', 'Alert reached 10. The run is lost.');
  }

  function winIfEnoughGigs(state) {
    if (securedGigCount(state) < OBJECTIVES_TO_WIN) return;
    state.status = STATUSES.WON;
    state.phase = PHASES.GAME_OVER;
    state.currentPhase = 'over';
    state.gameResult = 'win';
    state.gameOverReason = 'Run complete. You escaped with the Gigs.';
    pushLog(state, 'Run Complete', 'Run complete. You escaped with the Gigs.');
  }

  function secureGig(state, gigId, logText) {
    if (state.status !== STATUSES.PLAYING) return;
    const gig = state.gigs.find(entry => entry.id === gigId && !entry.isSecured);
    if (!gig) return;
    gig.isSecured = true;
    gig.securedTurn = state.turn;
    gig.flash = 'secured';
    pushLog(state, 'Gig Secured', logText || `Secured Gig: ${gig.name}.`);
    winIfEnoughGigs(state);
  }

  function resolveAttack(state, targetId) {
    const attacker = state.player.board.find(card => card.instanceId === state.selectedAttackerId);
    if (!canAttackWithUnit(state, attacker)) {
      pushLog(state, 'Invalid Attack', 'Selected Unit is not eligible to attack an open Gig.');
      clearSelections(state);
      return;
    }

    pushLog(state, 'Attack Declared', `${CardUtils.getCardName(attacker)} attacks ${CardUtils.getCardName(findBoardCard(state, targetId) || state.gigs.find(entry => entry.id === targetId) || { name: 'target' })}.`);

    if (bossHasActiveDefenders(state)) {
      const defender = state.boss.board.find(card => card.instanceId === targetId);
      if (!defender) {
        pushLog(state, 'Invalid Attack', 'Defenders block access to the Gig.');
        clearSelections(state);
        return;
      }

      const attackPower = Math.max(1, CardUtils.getCardPower(attacker));
      const defendPower = Math.max(1, CardUtils.getCardPower(defender));
      recordCombat(state, attacker.instanceId, defender.instanceId);
      attacker.ready = false;
      attacker.exhausted = true;
      attacker.flash = 'hit-card';
      defender.currentHp -= attackPower;
      attacker.currentHp -= defendPower;
      defender.flash = 'hit-card';
      pushLog(state, 'Damage Dealt', `${CardUtils.getCardName(attacker)} deals ${attackPower} to ${CardUtils.getCardName(defender)}. ${CardUtils.getCardName(defender)} deals ${defendPower} back.`);

      if (defender.currentHp <= 0) {
        pushLog(state, 'Defender Defeated', `${CardUtils.getCardName(defender)} was removed from the Boss Field.`);
        removeBoardCard(state.boss.board, defender.instanceId);
      }
      if (attacker.currentHp <= 0) {
        pushLog(state, 'Unit Defeated', `${CardUtils.getCardName(attacker)} was defeated and moved to discard.`);
        markDefeat(state, attacker, state.player.board);
      }

      clearSelections(state);
      return;
    }

    const gig = state.gigs.find(entry => entry.id === targetId && !entry.isSecured);
    if (!gig) {
      pushLog(state, 'Invalid Attack', 'Selected Gig is no longer a valid open objective.');
      clearSelections(state);
      return;
    }

    attacker.ready = false;
    attacker.exhausted = true;
    attacker.flash = 'hit-card';
    secureGig(state, gig.id, `${CardUtils.getCardName(attacker)} secured ${gig.name}.`);

    clearSelections(state);
  }

  function bossTurn(state) {
    state.phase = PHASES.BOSS_TURN;
    state.currentPhase = 'boss';
    state.boss.alert += 1;
    pushLog(state, 'Boss Turn', `Alert increased to ${state.boss.alert}.`);
    resolveAlertSpawns(state);
    resolveBossAttackPhase(state);
    checkAlertLoss(state);
  }

  function refreshTurn(state) {
    if (state.status !== STATUSES.PLAYING) return;
    state.turn += 1;
    state.phase = PHASES.PLAYER_MAIN;
    state.currentPhase = 'play';
    state.hasSoldThisTurn = false;
    state.eddieArea.forEach(eddie => {
      eddie.isSpent = false;
    });
    state.player.board.forEach(card => {
      card.ready = true;
      card.exhausted = false;
      card.spawnedThisTurn = false;
      card.flash = '';
    });
    state.boss.board.forEach(card => {
      card.ready = true;
      card.exhausted = false;
      card.spawnedThisTurn = false;
      card.flash = '';
    });
    state.gigs.forEach(gig => {
      gig.flash = '';
    });
    drawCards(state, 1);
    clearSelections(state);
    pushLog(state, 'Refresh', `Turn ${state.turn}. Draw 1, ready your board, and refresh Eddies.`);
  }

  function buildBossTurnSequence(currentState) {
    if (!currentState || currentState.phase !== PHASES.PLAYER_ATTACK || currentState.status !== STATUSES.PLAYING) {
      return [];
    }

    const sequence = [];
    const next = cloneState(currentState);
    clearSelections(next);
    clearBoardFlashes(next);
    next.phase = PHASES.BOSS_TURN;
    next.currentPhase = 'boss';
    next.boss.alert += 1;
    pushLog(next, 'Boss Turn', `Alert increased to ${next.boss.alert}.`);
    sequence.push({ kind: 'alert', state: cloneState(next) });

    resolveAlertSpawns(next);
    sequence.push({ kind: 'spawn', state: cloneState(next) });

    pushLog(next, 'Boss Attack', 'Arasaka attack phase started.');
    sequence.push({ kind: 'attack-start', state: cloneState(next) });

    const attackers = eligibleBossAttackers(next);
    let foundTarget = false;
    attackers.forEach(attacker => {
      const liveAttacker = next.boss.board.find(card => card.instanceId === attacker.instanceId);
      if (!liveAttacker || !liveAttacker.ready || liveAttacker.spawnedThisTurn || liveAttacker.currentHp <= 0) return;
      const target = chooseBossTarget(next);
      if (!target) return;
      foundTarget = true;
      clearBoardFlashes(next);
      resolveBossAttack(next, liveAttacker, target);
      sequence.push({ kind: 'attack', state: cloneState(next) });
    });

    if (!foundTarget) {
      pushLog(next, 'Boss Attack', 'Arasaka found no exposed targets.');
      sequence.push({ kind: 'no-targets', state: cloneState(next) });
    }

    checkAlertLoss(next);
    if (next.status === STATUSES.LOST) {
      sequence.push({ kind: 'game-over', state: cloneState(next) });
      return sequence;
    }

    refreshTurn(next);
    sequence.push({ kind: 'refresh', state: cloneState(next) });
    return sequence;
  }

  function selectCard(state, cardId) {
    const handCard = findHandCard(state, cardId);
    if (handCard) {
      state.selectedCardId = cardId;
      state.selectedGigId = null;
      state.selectedTargetId = null;
      if (state.phase !== PHASES.PLAYER_ATTACK) state.selectedAttackerId = null;
      return;
    }

    const playerCard = state.player.board.find(card => card.instanceId === cardId);
    if (playerCard) {
      if (state.phase === PHASES.PLAYER_ATTACK) {
        beginAttack(state, cardId);
      } else {
        state.selectedCardId = cardId;
        state.selectedGigId = null;
      }
      return;
    }

    const bossCard = state.boss.board.find(card => card.instanceId === cardId);
    if (bossCard) {
      state.selectedCardId = cardId;
      state.selectedGigId = null;
    }
  }

  function selectTarget(state, targetId, immediate) {
    if (!legalTargetIds(state).includes(targetId)) return;
    state.selectedTargetId = targetId;
    if (immediate) resolveAttack(state, targetId);
  }

  function attemptBlockedGig(state, gigId) {
    if (state.phase !== PHASES.PLAYER_ATTACK || !bossHasActiveDefenders(state)) return;
    const gig = state.gigs.find(entry => entry.id === gigId && !entry.isSecured);
    if (!gig) return;
    pushLog(state, 'Gig Blocked', 'Defenders block access to the Gig.');
  }

  function selectGig(state, gigId) {
    const gig = state.gigs.find(entry => entry.id === gigId);
    if (!gig || gig.isSecured) return;
    state.selectedCardId = null;
    state.selectedGigId = gigId;
    state.selectedTargetId = null;
    if (state.phase !== PHASES.PLAYER_ATTACK) state.selectedAttackerId = null;
  }

  function soloGameReducer(currentState, action, context) {
    if (!currentState || action.type === ACTIONS.RESET_PROTOTYPE) {
      return createInitialState(context.cardsBySlug);
    }
    if (action.type === ACTIONS.START_RUN) {
      return startRun(context.cardsBySlug);
    }

    const next = cloneState(currentState);

    switch (action.type) {
      case ACTIONS.SELECT_CARD:
        selectCard(next, action.cardId);
        break;
      case ACTIONS.SELECT_GIG:
        selectGig(next, action.gigId);
        break;
      case ACTIONS.PLAY_CARD:
        if (next.status === STATUSES.PLAYING) playCard(next, action.cardId || next.selectedCardId);
        break;
      case ACTIONS.SELL_FOR_EDDIE:
        if (next.status === STATUSES.PLAYING) sellCardForEddie(next, action.cardId || next.selectedCardId);
        break;
      case ACTIONS.SECURE_SELECTED_GIG:
        break;
      case ACTIONS.SPAWN_FIREWALL_DRONE:
        if (next.status === STATUSES.PLAYING) spawnBossDefender(next, 'firewallDrone');
        break;
      case ACTIONS.SPAWN_LOCKDOWN_ENFORCER:
        if (next.status === STATUSES.PLAYING) spawnBossDefender(next, 'lockdownEnforcer');
        break;
      case ACTIONS.ATTEMPT_BLOCKED_GIG:
        attemptBlockedGig(next, action.gigId);
        break;
      case ACTIONS.BEGIN_ATTACK:
        beginAttack(next, action.cardId || next.selectedCardId);
        break;
      case ACTIONS.SELECT_TARGET:
        selectTarget(next, action.targetId, action.immediate);
        break;
      case ACTIONS.CONFIRM_ATTACK:
        if (next.selectedTargetId) resolveAttack(next, next.selectedTargetId);
        break;
      case ACTIONS.END_PHASE:
        if (next.phase === PHASES.PLAYER_MAIN && next.status === STATUSES.PLAYING) {
          clearSelections(next);
          next.phase = PHASES.PLAYER_ATTACK;
          next.currentPhase = 'attack';
          pushLog(next, 'Attack Phase', 'Select a ready Unit that was not played this turn, then pick an open Gig.');
        }
        break;
      case ACTIONS.END_TURN:
        if (next.phase === PHASES.PLAYER_ATTACK && next.status === STATUSES.PLAYING) {
          clearSelections(next);
          bossTurn(next);
          refreshTurn(next);
        }
        break;
      default:
        break;
    }

    return next;
  }

  window.SoloGameReducer = {
    createInitialState,
    soloGameReducer,
    buildBossTurnSequence,
    legalTargetIds,
    canPlayCard,
    canAttackWithUnit,
    securedGigCount,
    canSellCard,
    countReadyEddies,
  };
})();
