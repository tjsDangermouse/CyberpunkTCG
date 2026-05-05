// Post-processing pass to clean up scraped card data
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'public', 'cards.json');
const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));

const TYPES = ['LEGEND', 'UNIT', 'GEAR', 'PROGRAM', 'HERO', 'EVENT', 'LOCATION'];
const FOOTER_PATTERNS = [
  /STAY IN THE LOOP/i, /Subscribe to updates/i, /privacy policy/i,
  /terms of service/i, /GET STARTED/i, /Produced by Weird Co/i,
  /© 20\d\d/i, /CD PROJEKT RED/i, /powered by Netdeck/i,
  /follow us on socials/i,
];

function isFooter(text) {
  return FOOTER_PATTERNS.some(p => p.test(text));
}

function cleanSubtitle(raw, name, type) {
  if (!raw) return null;
  // Remove trailing stats like COST4PWR3RAM2, COST6PWR6RAM2, etc.
  let s = raw.replace(/COST\s*\d+/gi, '').replace(/PWR\s*\d+/gi, '').replace(/RAM\s*\d+/gi, '');
  // Remove type keyword
  TYPES.forEach(t => { s = s.replace(new RegExp(t, 'g'), ''); });
  // Remove leading card name (sometimes duplicated)
  if (name) {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    s = s.replace(new RegExp('^' + escapedName, 'i'), '');
  }
  return s.trim() || null;
}

function cleanAbilities(abilities) {
  if (!abilities || !abilities.length) return null;

  const cleaned = abilities
    .map(a => a.replace(/^RULES TEXT\s*/i, '').trim())
    .filter(a => a.length > 5 && !isFooter(a));

  // Remove entries that are just SET info (will be parsed separately)
  const setPattern = /^SET:\s*.+NUMBER:\s*[\w\dα]+/i;
  const nonSet = cleaned.filter(a => !setPattern.test(a) && !a.startsWith('SET:') && !a.startsWith('NUMBER:') && !a.startsWith('ILLUSTRATED BY:'));

  return nonSet.length > 0 ? nonSet : null;
}

function extractSetInfo(abilities, existingSet) {
  if (!abilities) return { set: existingSet || null, cardNumber: null, artist: null };

  let set = existingSet || null;
  let cardNumber = null;
  let artist = null;

  abilities.forEach(a => {
    const setMatch = a.match(/SET:\s*([^N\n]+?)(?:NUMBER:|$)/i);
    if (setMatch) set = setMatch[1].replace(/\([\w]+\)/, '').trim();

    const numMatch = a.match(/NUMBER:\s*([\w\dα\/]+)/i);
    if (numMatch) cardNumber = numMatch[1].trim();

    const artistMatch = a.match(/ILLUSTRATED BY:\s*(.+?)(?:\n|$)/i);
    if (artistMatch) artist = artistMatch[1].trim();

    // Also try combined pattern
    const combined = a.match(/SET:\s*(.+?)\s*\([\w]+\)NUMBER:\s*([\w\dα]+)(?:ILLUSTRATED BY:\s*(.+?))?(?:STAY|$)/i);
    if (combined) {
      set = combined[1].trim();
      cardNumber = combined[2].trim();
      if (combined[3]) artist = combined[3].trim();
    }
  });

  return { set, cardNumber, artist };
}

const cleaned = raw.map(card => {
  const subtitle = cleanSubtitle(card.subtitle, card.name, card.type);
  const abilities = cleanAbilities(card.abilities);
  const { set, cardNumber, artist } = extractSetInfo(card.abilities, card.set);

  return {
    slug: card.slug,
    name: card.name,
    subtitle,
    type: card.type || null,
    cost: card.cost ?? null,
    power: card.power ?? null,
    ram: card.ram ?? null,
    abilities,
    keywords: card.keywords || null,
    set: set ? set.replace(/\s+/g, ' ').trim() : null,
    cardNumber: cardNumber || null,
    artist: artist || null,
    image: card.image,
    url: card.url,
  };
});

fs.writeFileSync(filePath, JSON.stringify(cleaned, null, 2));
console.log(`Cleaned ${cleaned.length} cards`);

// Summary
const withAbilities = cleaned.filter(c => c.abilities?.length).length;
const withSubtitle = cleaned.filter(c => c.subtitle).length;
const withSet = cleaned.filter(c => c.set).length;
console.log(`  With abilities: ${withAbilities}`);
console.log(`  With subtitle:  ${withSubtitle}`);
console.log(`  With set info:  ${withSet}`);
console.log('\nSample:');
cleaned.slice(0, 3).forEach(c => {
  console.log(`  ${c.name} | ${c.subtitle} | ${c.type} | COST:${c.cost} PWR:${c.power} RAM:${c.ram} | Set:${c.set} #${c.cardNumber}`);
  if (c.abilities) console.log(`    -> ${c.abilities[0]?.substring(0, 80)}`);
});
