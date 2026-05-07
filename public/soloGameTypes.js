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
    PLAY_CARD: 'play-card',
    BEGIN_ATTACK: 'begin-attack',
    SELECT_TARGET: 'select-target',
    CONFIRM_ATTACK: 'confirm-attack',
    END_PHASE: 'end-phase',
    END_TURN: 'end-turn',
  };

  window.SoloGameTypes = {
    PLAYER_HP: 18,
    STARTING_HAND: 5,
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
