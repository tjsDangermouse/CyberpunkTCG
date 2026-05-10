(() => {
  const PHASES = {
    SETUP: 'setup',
    PLAYER_MAIN: 'player-main',
    PLAYER_ATTACK: 'player-attack',
    BOSS_TURN: 'boss-turn',
    GAME_OVER: 'game-over',
  };

  const STATUSES = {
    IDLE: 'idle',
    PLAYING: 'playing',
    WON: 'won',
    LOST: 'lost',
  };

  const ACTIONS = {
    RESET_PROTOTYPE: 'reset-prototype',
    START_RUN: 'start-run',
    SELECT_CARD: 'select-card',
    SELECT_GIG: 'select-gig',
    PLAY_CARD: 'play-card',
    SELL_FOR_EDDIE: 'sell-for-eddie',
    SECURE_SELECTED_GIG: 'secure-selected-gig',
    SPAWN_FIREWALL_DRONE: 'spawn-firewall-drone',
    SPAWN_LOCKDOWN_ENFORCER: 'spawn-lockdown-enforcer',
    ATTEMPT_BLOCKED_GIG: 'attempt-blocked-gig',
    BEGIN_ATTACK: 'begin-attack',
    SELECT_TARGET: 'select-target',
    CONFIRM_ATTACK: 'confirm-attack',
    END_PHASE: 'end-phase',
    END_TURN: 'end-turn',
  };

  window.SoloGameTypes = {
    PLAYER_HP: 18,
    STARTING_HAND: 6,
    OBJECTIVES_TO_WIN: 3,
    BOARD_LIMIT: 5,
    MAX_LOG: 18,
    BASE_CREDITS: 3,
    CREDIT_CAP: 8,
    ALERT_LOSE_AT: 10,
    PHASES,
    STATUSES,
    ACTIONS,
  };
})();
