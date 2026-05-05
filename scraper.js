const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://cyberpunktcg.com';
const PUBLIC_DIR = path.join(__dirname, 'public');
const IMAGES_DIR = path.join(PUBLIC_DIR, 'images');

function ensureDirs() {
  [PUBLIC_DIR, IMAGES_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });
}

async function downloadImage(requestContext, url, slug) {
  const ext = url.includes('.webp') ? 'webp' : url.includes('.png') ? 'png' : 'jpg';
  const filename = `${slug}.${ext}`;
  const filepath = path.join(IMAGES_DIR, filename);
  if (fs.existsSync(filepath)) {
    console.log(`  [skip] image already exists: ${filename}`);
    return `images/${filename}`;
  }
  try {
    const response = await requestContext.get(url);
    if (!response.ok()) throw new Error(`HTTP ${response.status()}`);
    const buffer = await response.body();
    fs.writeFileSync(filepath, buffer);
    console.log(`  [img]  saved ${filename} (${Math.round(buffer.length / 1024)}kb)`);
    return `images/${filename}`;
  } catch (err) {
    console.error(`  [err]  failed to download image for ${slug}: ${err.message}`);
    return null;
  }
}

async function scrapeCardPage(page, slug) {
  const url = `${BASE_URL}/cards/${slug}`;
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  } catch {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
  }

  return await page.evaluate(() => {
    const getText = (sel, root = document) => root.querySelector(sel)?.textContent?.trim() || null;
    const getAttr = (sel, attr, root = document) => root.querySelector(sel)?.getAttribute(attr) || null;

    // Grab every text node from the page for fuzzy field extraction
    const allText = Array.from(document.querySelectorAll('*'))
      .filter(el => el.children.length === 0 && el.textContent.trim().length > 0)
      .map(el => el.textContent.trim());

    const data = {};

    // Image
    const img = document.querySelector('img[src*="cloudfront"], img[src*="cyberpunk"]');
    data.imageUrl = img?.src || null;

    // Name - largest heading on page
    const h1 = document.querySelector('h1');
    const h2 = document.querySelector('h2');
    data.name = h1?.textContent?.trim() || h2?.textContent?.trim() || null;

    // Try to find structured card stats
    const statPatterns = {
      subtitle: /^[A-Z][a-z].{2,40}$/,
      type: /^(UNIT|GEAR|PROGRAM|LEGEND|HERO|EVENT|LOCATION)$/i,
      rarity: /^(COMMON|UNCOMMON|RARE|LEGEND|LEGENDARY)$/i,
      cost: /^COST\s*:?\s*(\d+)$|^(\d+)$/,
      power: /^PWR\s*:?\s*(\d+)$/i,
      ram: /^RAM\s*:?\s*(\d+)$/i,
    };

    // Parse structured stat containers (often table rows or definition lists)
    document.querySelectorAll('[class*="stat"], [class*="card-"], dl, table tr, [class*="detail"]').forEach(el => {
      const text = el.textContent.trim();
      const label = el.querySelector('dt, th, [class*="label"], strong, b')?.textContent?.trim()?.toLowerCase();
      const value = el.querySelector('dd, td, [class*="value"]')?.textContent?.trim();
      if (label && value) {
        data[label.replace(/[^a-z0-9]/g, '_')] = value;
      }
    });

    // Scan all text for known patterns
    allText.forEach(t => {
      const upper = t.toUpperCase();
      if (!data.type && /^(UNIT|GEAR|PROGRAM|LEGEND|HERO|EVENT|LOCATION)$/.test(upper)) data.type = upper;
      if (!data.rarity && /^(COMMON|UNCOMMON|RARE|LEGENDARY)$/.test(upper)) data.rarity = upper;
      const costMatch = t.match(/^COST\s*:?\s*(\d+)$/i);
      if (costMatch && !data.cost) data.cost = parseInt(costMatch[1]);
      const pwrMatch = t.match(/^PWR\s*:?\s*(\d+)$/i);
      if (pwrMatch && !data.power) data.power = parseInt(pwrMatch[1]);
      const ramMatch = t.match(/^RAM\s*:?\s*(\d+)$/i);
      if (ramMatch && !data.ram) data.ram = parseInt(ramMatch[1]);
    });

    // Look for description/flavor text blocks (longer paragraphs)
    const paragraphs = Array.from(document.querySelectorAll('p, [class*="description"], [class*="flavor"], [class*="text"], [class*="ability"]'))
      .map(el => el.textContent.trim())
      .filter(t => t.length > 20 && t.length < 2000 && !t.includes('©') && !/^(UNIT|GEAR|PROGRAM|LEGEND)$/i.test(t));

    data.abilities = paragraphs.length > 0 ? paragraphs : null;

    // Keywords
    const keywordEls = Array.from(document.querySelectorAll('[class*="keyword"], [class*="tag"], [class*="badge"]'))
      .map(el => el.textContent.trim()).filter(Boolean);
    data.keywords = keywordEls.length > 0 ? keywordEls : null;

    // Set / card number
    const setMatch = document.body.textContent.match(/Set\s*:?\s*([^\n\r,]+)/i);
    if (setMatch) data.set = setMatch[1].trim();
    const numMatch = document.body.textContent.match(/#\s*(\d+)\s*\/\s*(\d+)/);
    if (numMatch) data.cardNumber = numMatch[0];

    return data;
  });
}

async function scrapeListingPage(page) {
  console.log('Loading card listing…');
  try {
    await page.goto(`${BASE_URL}/cards`, { waitUntil: 'networkidle', timeout: 30000 });
  } catch {
    await page.goto(`${BASE_URL}/cards`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);
  }

  // Wait for cards to render
  try {
    await page.waitForSelector('a[href*="/cards/"]', { timeout: 15000 });
  } catch {
    console.log('Fallback: waiting for any link...');
    await page.waitForTimeout(5000);
  }

  return await page.evaluate((baseUrl) => {
    const cards = [];
    const seen = new Set();

    document.querySelectorAll('a[href*="/cards/"]').forEach(a => {
      const href = a.getAttribute('href');
      if (!href || href === '/cards' || href === '/cards/') return;
      const slug = href.replace('/cards/', '').replace(/\/$/, '').trim();
      if (!slug || seen.has(slug)) return;
      seen.add(slug);

      const img = a.querySelector('img');
      const headings = a.querySelectorAll('h1, h2, h3, h4');
      const spans = a.querySelectorAll('span, p, div');

      const name = headings[0]?.textContent?.trim() || img?.alt || slug;
      const imageUrl = img?.src || null;

      // Collect all text from the card link element
      const texts = Array.from(spans).map(s => s.textContent.trim()).filter(Boolean);

      let subtitle = null, type = null, cost = null, power = null, ram = null;
      texts.forEach(t => {
        const u = t.toUpperCase();
        if (/^(UNIT|GEAR|PROGRAM|LEGEND|HERO|EVENT|LOCATION)$/.test(u)) type = u;
        else if (/^COST\s*\d+$/.test(u)) cost = parseInt(t.replace(/\D/g, ''));
        else if (/^PWR\s*\d+$/i.test(t)) power = parseInt(t.replace(/\D/g, ''));
        else if (/^RAM\s*\d+$/i.test(t)) ram = parseInt(t.replace(/\D/g, ''));
        else if (!subtitle && t.length > 3 && t.length < 60 && !/^\d+$/.test(t)) subtitle = t;
      });

      cards.push({ slug, name, subtitle, type, cost, power, ram, imageUrl });
    });

    return cards;
  }, BASE_URL);
}

async function main() {
  ensureDirs();

  const outputPath = path.join(PUBLIC_DIR, 'cards.json');
  let existingCards = [];
  if (fs.existsSync(outputPath)) {
    try {
      existingCards = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
      console.log(`Found ${existingCards.length} existing cards in cards.json`);
    } catch { /* ignore */ }
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  try {
    // Step 1: Get card list
    const listCards = await scrapeListingPage(page);
    console.log(`Found ${listCards.length} cards on listing page`);

    if (listCards.length === 0) {
      console.error('No cards found – the page may require authentication or has changed structure.');
      await browser.close();
      return;
    }

    // Step 2: Scrape each card's detail page
    const cards = [];
    for (let i = 0; i < listCards.length; i++) {
      const card = listCards[i];
      console.log(`[${i + 1}/${listCards.length}] Scraping: ${card.slug}`);

      // Download image from listing (signed URL is fresh)
      let localImagePath = null;
      if (card.imageUrl) {
        localImagePath = await downloadImage(context.request, card.imageUrl, card.slug);
      }

      // Get additional metadata from individual card page
      let detailData = {};
      try {
        detailData = await scrapeCardPage(page, card.slug);
        // Use detail image URL as fallback if listing image failed
        if (!localImagePath && detailData.imageUrl) {
          localImagePath = await downloadImage(context.request, detailData.imageUrl, card.slug);
        }
      } catch (err) {
        console.error(`  [err]  failed to scrape ${card.slug}: ${err.message}`);
      }

      // Merge listing data with detail data (listing data takes priority for core fields)
      const merged = {
        slug: card.slug,
        name: card.name || detailData.name,
        subtitle: card.subtitle || detailData.subtitle,
        type: card.type || detailData.type,
        cost: card.cost ?? detailData.cost ?? null,
        power: card.power ?? detailData.power ?? null,
        ram: card.ram ?? detailData.ram ?? null,
        abilities: detailData.abilities || null,
        keywords: detailData.keywords || null,
        set: detailData.set || null,
        cardNumber: detailData.cardNumber || null,
        image: localImagePath,
        url: `${BASE_URL}/cards/${card.slug}`,
      };

      // Include any extra fields from detail page that aren't already covered
      Object.entries(detailData).forEach(([k, v]) => {
        if (!merged[k] && v && k !== 'imageUrl') merged[k] = v;
      });

      cards.push(merged);

      // Small delay to be polite to the server
      await page.waitForTimeout(500);
    }

    // Save JSON
    fs.writeFileSync(outputPath, JSON.stringify(cards, null, 2));
    console.log(`\nDone! Saved ${cards.length} cards to public/cards.json`);
    console.log(`Images saved to public/images/`);

  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
