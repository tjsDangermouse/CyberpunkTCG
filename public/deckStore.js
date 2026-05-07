(() => {
  const DECKS_CACHE_KEY = 'cyberpunk-decks';
  const CURRENT_DECK_CACHE_KEY = 'cyberpunk-current-deck';

  let state = { decks: [], currentDeckId: null };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function sanitizeState(nextState) {
    const decks = Array.isArray(nextState?.decks) ? nextState.decks : [];
    const currentDeckId = typeof nextState?.currentDeckId === 'string' ? nextState.currentDeckId : null;
    return { decks, currentDeckId };
  }

  function cacheState(nextState) {
    state = sanitizeState(nextState);
    localStorage.setItem(DECKS_CACHE_KEY, JSON.stringify(state.decks));
    if (state.currentDeckId) localStorage.setItem(CURRENT_DECK_CACHE_KEY, state.currentDeckId);
    else localStorage.removeItem(CURRENT_DECK_CACHE_KEY);
    return clone(state);
  }

  async function init() {
    try {
      const response = await fetch('/api/decks');
      if (!response.ok) throw new Error('Failed to load decks');
      const remote = await response.json();
      return cacheState(remote);
    } catch {
      const cachedDecks = JSON.parse(localStorage.getItem(DECKS_CACHE_KEY) || '[]');
      const cachedCurrent = localStorage.getItem(CURRENT_DECK_CACHE_KEY);
      return cacheState({
        decks: Array.isArray(cachedDecks) ? cachedDecks : [],
        currentDeckId: cachedCurrent || null,
      });
    }
  }

  async function save(nextState) {
    const payload = sanitizeState(nextState);
    const response = await fetch('/api/decks', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error('Failed to save decks');
    const remote = await response.json();
    return cacheState(remote);
  }

  function getState() {
    return clone(state);
  }

  window.DeckStore = {
    init,
    save,
    getState,
  };
})();
