// Records what it costs to trade right now: one line per contract with the best
// bid and ask, the spread, and how much sits within 10, 25 and 50 basis points
// of the mid price on each side. Appends to data/book/<UTC date>.jsonl.
//
//   node scripts/record-book.mjs
//
// Candles cannot show a spread, so this is the only record of off-hours trading
// cost. It starts the day this repository is created and cannot be back-filled.

import fs from 'node:fs';
import path from 'node:path';
import { STOCKS, CRYPTO, get } from './fetch-history.mjs';

const OUT = process.env.DATA_DIR || 'data';
const PRODUCT = 'USDT-FUTURES';
const BANDS = [10, 25, 50];

/** USDT resting within `bps` of the mid on one side of the book. */
export function depthWithin(levels, mid, bps) {
  let usdt = 0;
  for (const [p, s] of levels) {
    const price = Number(p);
    if (Math.abs(price / mid - 1) * 10_000 <= bps) usdt += price * Number(s);
  }
  return Math.round(usdt);
}

/** How far from the mid the furthest level on the thinner side reaches, in basis points. */
export function coverage(book, mid) {
  const far = (levels) => (levels?.length ? Math.abs(Number(levels[levels.length - 1][0]) / mid - 1) * 10_000 : 0);
  return Math.min(far(book.bids), far(book.asks));
}

/**
 * One line for one contract. `books` are the same book at Bitget's price steps
 * from finest to coarsest; the spread comes from the finest, and each depth band
 * from the finest book that reaches that far (a 100-level book at one-cent steps
 * does not reach 50 bps on a 700-dollar contract). A band no book reaches is null.
 */
export function summarise(symbol, books, ticker, now) {
  const bid = Number(books[0]?.bids?.[0]?.[0]), ask = Number(books[0]?.asks?.[0]?.[0]);
  if (!(bid > 0 && ask > 0 && ask >= bid)) throw new Error(`${symbol}: no usable book`);
  const mid = (bid + ask) / 2;
  const row = { t: now, symbol, bid, ask, spreadBps: +((ask - bid) / mid * 10_000).toFixed(3) };
  for (const bps of BANDS) {
    const book = books.find((b) => coverage(b, mid) >= bps);
    row[`bid${bps}`] = book ? depthWithin(book.bids, mid, bps) : null;
    row[`ask${bps}`] = book ? depthWithin(book.asks, mid, bps) : null;
  }
  if (ticker) Object.assign(row, { last: Number(ticker.lastPr), index: Number(ticker.indexPrice), mark: Number(ticker.markPrice), funding: Number(ticker.fundingRate) });
  return row;
}

/** The book at successively coarser price steps, stopping once the widest band is reached. */
async function books(symbol) {
  const out = [];
  for (const precision of ['scale0', 'scale1', 'scale2', 'scale3']) {
    const book = await get(`/api/v2/mix/market/merge-depth?symbol=${symbol}&productType=${PRODUCT}&precision=${precision}&limit=max`);
    out.push(book);
    const bid = Number(out[0].bids?.[0]?.[0]), ask = Number(out[0].asks?.[0]?.[0]);
    if (!(bid > 0 && ask > 0) || coverage(book, (bid + ask) / 2) >= BANDS[BANDS.length - 1]) break;
  }
  return out;
}

async function main() {
  const now = Date.now();
  const tickers = Object.fromEntries((await get(`/api/v2/mix/market/tickers?productType=${PRODUCT}`)).map((t) => [t.symbol, t]));
  const lines = [];
  for (const symbol of [...STOCKS, ...CRYPTO]) {
    if (!tickers[symbol]) continue;
    try {
      lines.push(JSON.stringify(summarise(symbol, await books(symbol), tickers[symbol], now)));
    } catch (e) { lines.push(JSON.stringify({ t: now, symbol, error: e.message })); }
  }
  const dir = path.join(OUT, 'book');
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, `${new Date(now).toISOString().slice(0, 10)}.jsonl`), lines.join('\n') + '\n');
  console.log(`${lines.length} contracts recorded`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
