(() => {
  const {
    PLAYER_HP,
    STARTING_HAND,
    OBJECTIVES_TO_WIN,
    BOARD_LIMIT,
    MAX_LOG,
    BASE_CREDITS,
    CREDIT_CAP,
    ALERT_LOSE_AT,
    PHASES,
    STATUSES,
    ACTIONS,
  } = window.SoloGameTypes;

  const Bosses = window.SoloBosses;
  const CardUtils = window.SoloCardUtils;

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
  }

  function createInitialState(cardsBySlug) {
    return {
      mode: 'pregame',
      status: STATUSES.IDLE,
      phase: PHASES.SETUP,
      turn: 0,
      player: {
        name: '',
        source: '',
        hp: PLAYER_HP,
        credits: BASE_CREDITS,
        maxCredits: BASE_CREDITS,
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
        spawnedAt3: false,
        spawnedAt6: false,
        activatedAt9: false,
      },
      gigs: Bosses.createContestedGigs(),
      selectedCardId: null,
      selectedAttackerId: null,
      selectedTargetId: null,
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
    next.turn = 1;
    next.player.name = deckInfo.name;
    next.player.source = deckInfo.source;
    next.player.deck = CardUtils.shuffle(deckInfo.cards);
    next.player.credits = BASE_CREDITS;
    next.player.maxCredits = BASE_CREDITS;

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
    return state.gigs.filter(gig => gig.claimedBy === 'player').length;
  }

  function openGigTargets(state) {
    return state.gigs.filter(gig => !gig.claimedBy).map(gig => gig.id);
  }

  function legalTargetIds(state) {
    if (state.phase !== PHASES.PLAYER_ATTACK || !state.selectedAttackerId) return [];
    if (state.boss.board.length > 0) return state.boss.board.map(card => card.instanceId);
    return openGigTargets(state);
  }

  function canPlayCard(state, card) {
    if (!card || state.phase !== PHASES.PLAYER_MAIN || state.status !== STATUSES.PLAYING) return false;
    return CardUtils.getCardCost(card) <= state.player.credits;
  }

  function playCard(state, cardId) {
    const handIndex = state.player.hand.findIndex(card => card.instanceId === cardId);
    if (handIndex === -1) return;
    const card = state.player.hand[handIndex];
    if (!canPlayCard(state, card)) return;

    const cost = CardUtils.getCardCost(card);
    const type = CardUtils.getCardType(card);
    state.player.hand.splice(handIndex, 1);

    if (CardUtils.isSupportedBoardCard(card)) {
      if (state.player.board.length >= BOARD_LIMIT) {
        state.player.hand.splice(handIndex, 0, card);
        return;
      }
      state.player.credits -= cost;
      state.player.board.push(CardUtils.createBoardCard(card, 'player', {
        ready: false,
        exhausted: true,
        enteredTurn: state.turn,
        flash: 'new-card',
      }));
      pushLog(state, 'Deploy', `${CardUtils.getCardName(card)} enters play exhausted.`);
    } else {
      state.player.discard.push(CardUtils.deckCardFromInstance(card));
      state.player.credits = Math.min(CREDIT_CAP, state.player.credits + 1);
      pushLog(state, 'Prototype Action', `${CardUtils.getCardName(card)} was discarded for +1 credit.`);
    }

    clearSelections(state);
  }

  function beginAttack(state, attackerId) {
    if (state.phase !== PHASES.PLAYER_ATTACK || state.status !== STATUSES.PLAYING) return;
    const attacker = state.player.board.find(card => card.instanceId === attackerId);
    if (!attacker || !attacker.ready) return;
    state.selectedAttackerId = attackerId;
    state.selectedCardId = attackerId;
    state.selectedTargetId = null;
  }

  function markDefeat(state, card, board) {
    const removed = removeBoardCard(board, card.instanceId);
    discardBoardCard(state, removed);
  }

  function winIfEnoughGigs(state) {
    if (securedGigCount(state) < OBJECTIVES_TO_WIN) return;
    state.status = STATUSES.WON;
    state.phase = PHASES.GAME_OVER;
    state.gameOverReason = 'All required gigs have been secured.';
    pushLog(state, 'Run Complete', 'Arasaka Lockdown collapses. The district is yours.');
  }

  function resolveAttack(state, targetId) {
    const attacker = state.player.board.find(card => card.instanceId === state.selectedAttackerId);
    if (!attacker || !attacker.ready) return;

    const defenderIds = state.boss.board.map(card => card.instanceId);
    const hasDefenders = defenderIds.length > 0;
    attacker.ready = false;
    attacker.exhausted = true;
    attacker.flash = 'hit-card';

    if (hasDefenders) {
      const defender = state.boss.board.find(card => card.instanceId === targetId);
      if (!defender) return;
      const attackPower = Math.max(1, CardUtils.getCardPower(attacker));
      const defendPower = Math.max(1, CardUtils.getCardPower(defender));
      defender.currentHp -= attackPower;
      attacker.currentHp -= defendPower;
      defender.flash = 'hit-card';
      pushLog(state, 'Attack', `${CardUtils.getCardName(attacker)} hits ${CardUtils.getCardName(defender)} (${attackPower} vs ${defendPower}).`);

      if (defender.currentHp <= 0) {
        pushLog(state, 'Defeated', `${CardUtils.getCardName(defender)} was removed from the defense grid.`);
        markDefeat(state, defender, state.boss.board);
      }
      if (attacker.currentHp <= 0) {
        pushLog(state, 'Defeated', `${CardUtils.getCardName(attacker)} was lost in the exchange.`);
        markDefeat(state, attacker, state.player.board);
      }
    } else {
      const gig = state.gigs.find(entry => entry.id === targetId && !entry.claimedBy);
      if (!gig) return;
      gig.claimedBy = 'player';
      gig.flash = 'secured';
      pushLog(state, 'Gig Secured', `${CardUtils.getCardName(attacker)} breaches the district and secures ${gig.name}.`);
      winIfEnoughGigs(state);
    }

    clearSelections(state);
  }

  function spawnBossCard(state, template, title) {
    if (state.boss.board.length >= BOARD_LIMIT) return;
    const instance = CardUtils.createBoardCard(template, 'boss', {
      ready: false,
      exhausted: false,
      enteredTurn: state.turn,
      flash: 'new-card',
    });
    state.boss.board.push(instance);
    pushLog(state, title, `${CardUtils.getCardName(template)} deploys to the defense grid.`);
  }

  function applyBossThresholds(state) {
    if (state.boss.alert >= 3 && !state.boss.spawnedAt3) {
      spawnBossCard(state, state.boss.templates.firewallDrone, 'Alert 3');
      state.boss.spawnedAt3 = true;
    }
    if (state.boss.alert >= 6 && !state.boss.spawnedAt6) {
      spawnBossCard(state, state.boss.templates.lockdownEnforcer, 'Alert 6');
      state.boss.spawnedAt6 = true;
    }
    if (state.boss.alert >= 9 && !state.boss.activatedAt9) {
      state.boss.lockdownActive = true;
      state.boss.activatedAt9 = true;
      pushLog(state, 'Alert 9', 'Lockdown is active. The district is fully hardened.');
    }
  }

  function bossTurn(state) {
    state.phase = PHASES.BOSS_TURN;
    state.boss.alert += 1;
    pushLog(state, 'Boss Turn', `Alert rises to ${state.boss.alert}.`);
    applyBossThresholds(state);

    if (state.boss.board.length === 0) {
      spawnBossCard(state, state.boss.templates.firewallDrone, 'Boss Priority');
    }

    state.boss.board.forEach(card => {
      const newlySpawnedThisTurn = card.enteredTurn === state.turn;
      if (newlySpawnedThisTurn || state.status !== STATUSES.PLAYING) return;
      const damage = Math.max(1, CardUtils.getCardPower(card));
      state.player.hp -= damage;
      card.flash = 'hit-card';
      pushLog(state, 'Boss Attack', `${CardUtils.getCardName(card)} hits the runner for ${damage}.`);
      if (state.player.hp <= 0) {
        state.status = STATUSES.LOST;
        state.phase = PHASES.GAME_OVER;
        state.gameOverReason = 'Runner HP reached 0.';
        pushLog(state, 'Runner Down', 'Arasaka flatlined the run.');
      }
    });

    if (state.status === STATUSES.PLAYING && state.boss.alert >= ALERT_LOSE_AT) {
      state.status = STATUSES.LOST;
      state.phase = PHASES.GAME_OVER;
      state.gameOverReason = 'Alert 10 triggered total lockdown.';
      pushLog(state, 'Lockdown Complete', 'Alert 10 was reached at the end of the boss turn.');
    }
  }

  function refreshTurn(state) {
    if (state.status !== STATUSES.PLAYING) return;
    state.turn += 1;
    state.phase = PHASES.PLAYER_MAIN;
    state.player.maxCredits = Math.min(CREDIT_CAP, BASE_CREDITS + state.turn - 1);
    state.player.credits = state.player.maxCredits;
    state.player.board.forEach(card => {
      card.ready = true;
      card.exhausted = false;
      card.flash = '';
    });
    state.boss.board.forEach(card => {
      card.ready = true;
      card.flash = '';
    });
    state.gigs.forEach(gig => {
      gig.flash = '';
    });
    drawCards(state, 1);
    clearSelections(state);
    pushLog(state, 'Refresh', `Turn ${state.turn}. Draw 1 and refresh the board.`);
  }

  function selectCard(state, cardId) {
    const handCard = findHandCard(state, cardId);
    if (handCard) {
      state.selectedCardId = cardId;
      state.selectedTargetId = null;
      if (state.phase !== PHASES.PLAYER_ATTACK) state.selectedAttackerId = null;
      return;
    }

    const playerCard = state.player.board.find(card => card.instanceId === cardId);
    if (playerCard) {
      if (state.phase === PHASES.PLAYER_ATTACK && playerCard.ready) {
        beginAttack(state, cardId);
      } else {
        state.selectedCardId = cardId;
      }
      return;
    }

    const bossCard = state.boss.board.find(card => card.instanceId === cardId);
    if (bossCard) state.selectedCardId = cardId;
  }

  function selectTarget(state, targetId, immediate) {
    if (!legalTargetIds(state).includes(targetId)) return;
    state.selectedTargetId = targetId;
    if (immediate) resolveAttack(state, targetId);
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
      case ACTIONS.PLAY_CARD:
        if (next.status === STATUSES.PLAYING) playCard(next, action.cardId || next.selectedCardId);
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
          pushLog(next, 'Attack Phase', 'Select a ready unit, then pick a legal target.');
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
    legalTargetIds,
    canPlayCard,
    securedGigCount,
  };
})();
