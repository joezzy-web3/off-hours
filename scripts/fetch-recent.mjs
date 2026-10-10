// Appends the hours that have closed since the last run to data/recent/<SYMBOL>.csv.
// The history in data/hourly is never rewritten, so the study's inputs cannot change.
//
//   node scripts/fetch-recent.mjs

import fs from 'node:fs';
import path from 'node:path';
import { check, get, STOCKS } from './fetch-history.mjs';

const OUT = process.env.DATA_DIR || 'data';
const HOUR = 3_600_000;

const lastOf = (file) => {
  if (!fs.existsSync(file)) return null;
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
  const t = Number(lines[lines.length - 1].split(',')[0]);
  return Number.isFinite(t) ? t : null;
};

/** Closed 1H bars that opened after `since`, oldest first. */
export async function since(symbol, sinceT, now) {
  const byTime = new Map();
  let end = Math.floor(now / HOUR) * HOUR;
  for (let page = 0; page < 40 && end > sinceT + HOUR; page++) {
    const rows = await get(`/api/v2/mix/market/history-candles?symbol=${symbol}&productType=USDT-FUTURES&granularity=1H&endTime=${end}&limit=200`);
    if (!rows?.length) break;
    for (const r of rows) {
      const t = Number(r[0]);
      if (t > sinceT && t + HOUR <= now) byTime.set(t, [t, r[1], r[2], r[3], r[4], r[5], r[6]]);
    }
    const oldest = Math.min(...rows.map((r) => Number(r[0])));
    if (oldest >= end) break;
    end = oldest;
  }
  return [...byTime.values()].sort((a, b) => a[0] - b[0]);
}

async function main() {
  const now = Date.now();
  fs.mkdirSync(path.join(OUT, 'recent'), { recursive: true });
  let added = 0;
  for (const symbol of STOCKS) {
    const recent = path.join(OUT, 'recent', `${symbol}.csv`);
    const last = lastOf(recent) ?? lastOf(path.join(OUT, 'hourly', `${symbol}.csv`));
    if (last === null) { console.log(`${symbol}: no history on file, skipped`); continue; }
    let bars;
    try { bars = await since(symbol, last, now); } catch (e) { console.log(`${symbol}: ${e.message}`); continue; }
    if (!bars.length) continue;
    check(symbol, bars); // throws on a bad number, so a broken response is never appended
    if (bars[0][0] !== last + HOUR) console.log(`${symbol}: ${(bars[0][0] - last) / HOUR - 1} hours missing after ${new Date(last).toISOString()}`);
    fs.appendFileSync(recent, bars.map((b) => b.join(',')).join('\n') + '\n');
    added += bars.length;
  }
  console.log(`${added} bars appended`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
