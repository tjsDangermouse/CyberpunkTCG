# CyberpunkTCG

A small Cyberpunk-themed trading card game utility that scrapes card data, cleans it up, and serves a web-based viewer.

## Project Structure

- `scraper.js` - Scrapes card data from the source site.
- `cleanup.js` - Cleans and normalizes scraped data.
- `server.js` - Serves the viewer and card data over HTTP.
- `public/` - Static web assets for browsing cards.
  - `index.html` - Main card viewer page.
  - `print.html` - Printable card layout.
  - `print.js` - Print view logic.
  - `style.css` - Viewer styles.
  - `viewer.js` - Card viewer front-end logic.
  - `cards.json` - Generated card data used by the viewer.
  - `images/` - Card image assets.

## Requirements

- Node.js 18+ (or compatible)

## Installation

```bash
npm install
```

## Usage

### Scrape and prepare data

```bash
npm run scrape
```

This runs `scraper.js` then `cleanup.js` and should update `public/cards.json`.

### Run the viewer

```bash
npm run serve
```

Then open the served page in your browser.

## Notes

- The scraper uses Playwright (`playwright`) for automated browsing.
- `public/cards.json` is the generated data file consumed by the viewer.
