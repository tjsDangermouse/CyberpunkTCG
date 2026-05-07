(() => {
  const bossDefinition = {
    id: 'arasaka-lockdown',
    name: 'Arasaka Lockdown',
    title: 'Defensive corporate security system',
    thresholds: [3, 6, 9, 10],
  };

  const fallbackFirewallDrone = {
    slug: 'boss-firewall-drone',
    name: 'Firewall Drone',
    subtitle: 'Checkpoint Defender',
    type: 'UNIT',
    cost: 0,
    power: 1,
    hp: 1,
    ram: 0,
    abilities: ['Checkpoint Defender'],
    image: null,
    placeholder: true,
  };

  const fallbackLockdownEnforcer = {
    slug: 'boss-lockdown-enforcer',
    name: 'Lockdown Enforcer',
    subtitle: 'Corporate Riot Frame',
    type: 'UNIT',
    cost: 0,
    power: 2,
    hp: 3,
    ram: 0,
    abilities: ['Corporate Riot Frame'],
    image: null,
    placeholder: true,
  };

  function createContestedGigs() {
    return [
      { id: 'gig-1', name: 'Hijack Security Keys', reward: 'Bypass gate cache', claimedBy: null },
      { id: 'gig-2', name: 'Extract Asset Ledger', reward: 'Leak the payout routing', claimedBy: null },
      { id: 'gig-3', name: 'Ghost the Patrol Grid', reward: 'Blank the district sweep', claimedBy: null },
    ];
  }

  function matchExistingCard(cardsBySlug, query) {
    if (!cardsBySlug || typeof cardsBySlug.values !== 'function') return null;
    const lookup = query.toLowerCase();
    return [...cardsBySlug.values()].find(card => {
      const slug = String(card.slug || '').toLowerCase();
      const name = String(card.name || '').toLowerCase();
      return slug.includes(lookup) || name.includes(lookup);
    }) || null;
  }

  function resolveBossTemplates(cardsBySlug) {
    return {
      firewallDrone: matchExistingCard(cardsBySlug, 'firewall-drone') || fallbackFirewallDrone,
      lockdownEnforcer: matchExistingCard(cardsBySlug, 'lockdown-enforcer') || fallbackLockdownEnforcer,
    };
  }

  window.SoloBosses = {
    bossDefinition,
    createContestedGigs,
    resolveBossTemplates,
  };
})();
