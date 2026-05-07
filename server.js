const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const DECKS_PATH = path.join(DATA_DIR, 'decks.json');

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function ensureDeckStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DECKS_PATH)) {
    fs.writeFileSync(DECKS_PATH, JSON.stringify({ decks: [], currentDeckId: null }, null, 2));
  }
}

function readDeckState() {
  ensureDeckStore();
  try {
    const raw = fs.readFileSync(DECKS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const decks = Array.isArray(parsed?.decks) ? parsed.decks : [];
    const currentDeckId = typeof parsed?.currentDeckId === 'string' ? parsed.currentDeckId : null;
    return { decks, currentDeckId };
  } catch {
    return { decks: [], currentDeckId: null };
  }
}

function writeDeckState(nextState) {
  ensureDeckStore();
  fs.writeFileSync(DECKS_PATH, JSON.stringify(nextState, null, 2));
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

const server = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/api/decks') {
    if (req.method === 'GET') {
      sendJson(res, 200, readDeckState());
      return;
    }

    if (req.method === 'PUT') {
      let body = '';
      req.on('data', chunk => {
        body += chunk;
      });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body || '{}');
          const decks = Array.isArray(parsed?.decks) ? parsed.decks : null;
          const currentDeckId = parsed?.currentDeckId === null || typeof parsed?.currentDeckId === 'string'
            ? parsed.currentDeckId
            : undefined;

          if (!decks || currentDeckId === undefined) {
            sendJson(res, 400, { error: 'Invalid deck payload' });
            return;
          }

          const sanitizedDecks = decks
            .filter(deck => deck && typeof deck === 'object')
            .map(deck => ({
              id: String(deck.id || ''),
              name: String(deck.name || 'Untitled Deck'),
              cards: deck.cards && typeof deck.cards === 'object' ? deck.cards : {},
            }))
            .filter(deck => deck.id.length > 0);

          const state = { decks: sanitizedDecks, currentDeckId };
          writeDeckState(state);
          sendJson(res, 200, state);
        } catch {
          sendJson(res, 400, { error: 'Invalid JSON' });
        }
      });
      return;
    }

    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.join(PUBLIC_DIR, urlPath);

  // Prevent path traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Kill the existing process with:\n  lsof -ti :${PORT} | xargs kill`);
  } else {
    console.error('Server error:', err.message);
  }
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`Cyberpunk TCG viewer running at http://localhost:${PORT}`);
  console.log(`  Card viewer: http://localhost:${PORT}/index.html`);
  console.log(`  Print page:  http://localhost:${PORT}/print.html`);
});
