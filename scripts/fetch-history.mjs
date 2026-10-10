// Records Bitget's public market history into data/. No key, no dependencies.
//
//   node scripts/fetch-history.mjs
//
// For each contract in the fixed list below it pages backwards through
// GET /api/v2/mix/market/history-candles (1H, 200 bars a page) until Bitget
// has nothing older, checks every bar, and writes data/hourly/<SYMBOL>.csv.
// It also saves the contract specifications and the funding-rate history.
// Nothing is filled in or smoothed: a missing hour is listed in
// data/manifest.json and left missing.

import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BITGET_BASE || 'https://api.bitget.com';
const OUT = process.env.DATA_DIR || 'data';
const HOUR = 3_600_000;
const PRODUCT = 'USDT-FUTURES';

// The universe is fixed here, before any result exists (research/PREREGISTRATION.md).
export const STOCKS = ['NVDAUSDT', 'TSLAUSDT', 'AAPLUSDT', 'MSFTUSDT', 'METAUSDT', 'AMZNUSDT', 'GOOGLUSDT', 'MSTRUSDT', 'COINUSDT', 'PLTRUSDT', 'QQQUSDT', 'SPYUSDT'];
export const CRYPTO = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function get(pathAndQuery, tries = 4) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(BASE + pathAndQuery, { headers: { locale: 'en-US' }, signal: AbortSignal.timeout(20_000) });
      const json = await res.json();
      if (res.ok && json.code === '00000') return json.data;
      last = new Error(`${pathAndQuery}: HTTP ${res.status} ${json.code} ${json.msg}`);
      if (res.status !== 429 && res.status < 500) break; // a refusal will not change on retry
    } catch (e) { last = e; }
    await sleep(800 * (i + 1));
  }
  throw last;
}

/** Every closed 1H bar Bitget holds for a contract, oldest first. */
export async function hourly(symbol, now) {
  const byTime = new Map();
  let end = Math.floor(now / HOUR) * HOUR; // bars that opened before this hour have closed
  for (let page = 0; page < 400; page++) {
    const rows = await get(`/api/v2/mix/market/history-candles?symbol=${symbol}&productType=${PRODUCT}&granularity=1H&endTime=${end}&limit=200`);
    if (!rows?.length) break;
    for (const r of rows) {
      const t = Number(r[0]);
      if (t + HOUR <= now) byTime.set(t, [t, r[1], r[2], r[3], r[4], r[5], r[6]]);
    }
    const oldest = Math.min(...rows.map((r) => Number(r[0])));
    if (oldest >= end) break; // no progress
    end = oldest;
    await sleep(120);
  }
  return [...byTime.values()].sort((a, b) => a[0] - b[0]);
}

/** Problems found in a contract's bars. Bad numbers are fatal; gaps and jumps are reported. */
export function check(symbol, bars) {
  const gaps = [], jumps = [];
  bars.forEach((b, i) => {
    const [t, o, h, l, c] = b.map(Number);
    if (![o, h, l, c].every((x) => Number.isFinite(x) && x > 0)) throw new Error(`${symbol}: bad number at ${new Date(t).toISOString()}`);
    if (h < Math.max(o, c) || l > Math.min(o, c)) throw new Error(`${symbol}: range does not hold open and close at ${new Date(t).toISOString()}`);
    if (!i) return;
    const prev = bars[i - 1];
    if (t - prev[0] !== HOUR) gaps.push({ after: new Date(prev[0]).toISOString(), before: new Date(t).toISOString(), missingHours: (t - prev[0]) / HOUR - 1 });
    else if (Math.abs(o / Number(prev[4]) - 1) > 0.005) jumps.push({ at: new Date(t).toISOString(), previousClose: Number(prev[4]), open: o });
  });
  return { gaps, jumps };
}

async function funding(symbol) {
  const rows = [];
  for (let pageNo = 1; pageNo <= 60; pageNo++) {
    const page = await get(`/api/v2/mix/market/history-fund-rate?symbol=${symbol}&productType=${PRODUCT}&pageSize=100&pageNo=${pageNo}`);
    if (!page?.length) break;
    for (const r of page) rows.push([Number(r.fundingTime), r.fundingRate]);
    if (page.length < 100) break;
    await sleep(120);
  }
  return rows.sort((a, b) => a[0] - b[0]);
}

async function main() {
  const now = Date.now();
  fs.mkdirSync(path.join(OUT, 'hourly'), { recursive: true });
  fs.mkdirSync(path.join(OUT, 'funding'), { recursive: true });
  const manifest = { recordedAt: new Date(now).toISOString(), source: `${BASE}/api/v2/mix/market/history-candles`, granularity: '1H', columns: 't,open,high,low,close,baseVolume,quoteVolume', symbols: {}, notListed: [], errors: [] };

  let contracts = [];
  try {
    contracts = await get(`/api/v2/mix/market/contracts?productType=${PRODUCT}`);
    const wanted = new Set([...STOCKS, ...CRYPTO]);
    const keep = contracts.filter((c) => c.isRwa === 'YES' || wanted.has(c.symbol));
    fs.writeFileSync(path.join(OUT, 'contracts.json'), JSON.stringify(keep, null, 1) + '\n');
    manifest.rwaContractsListed = contracts.filter((c) => c.isRwa === 'YES').length;
  } catch (e) { manifest.errors.push(`contracts: ${e.message}`); }
  const listed = new Set(contracts.map((c) => c.symbol));

  for (const symbol of [...STOCKS, ...CRYPTO]) {
    if (contracts.length && !listed.has(symbol)) { manifest.notListed.push(symbol); console.log(`${symbol}: not listed, skipped`); continue; }
    let bars;
    try { bars = await hourly(symbol, now); } catch (e) { manifest.errors.push(`${symbol}: ${e.message}`); console.log(`${symbol}: ${e.message}`); continue; }
    if (!bars.length) { manifest.notListed.push(symbol); console.log(`${symbol}: no bars`); continue; }
    const { gaps, jumps } = check(symbol, bars);
    fs.writeFileSync(path.join(OUT, 'hourly', `${symbol}.csv`), bars.map((b) => b.join(',')).join('\n') + '\n');
    manifest.symbols[symbol] = { bars: bars.length, first: new Date(bars[0][0]).toISOString(), last: new Date(bars[bars.length - 1][0]).toISOString(), gaps, jumps };
    console.log(`${symbol}: ${bars.length} bars from ${manifest.symbols[symbol].first}, ${gaps.length} gaps, ${jumps.length} jumps`);
    try {
      const f = await funding(symbol);
      if (f.length) fs.writeFileSync(path.join(OUT, 'funding', `${symbol}.csv`), f.map((r) => r.join(',')).join('\n') + '\n');
      manifest.symbols[symbol].fundingRows = f.length;
    } catch (e) { manifest.errors.push(`${symbol} funding: ${e.message}`); }
  }
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
  if (!Object.keys(manifest.symbols).length) { console.error('No contract returned any bars.', manifest.errors); process.exit(1); }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
