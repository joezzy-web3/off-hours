// Runs both recorders against a local stand-in for Bitget shaped like the real responses.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOUR = 3_600_000;
const LISTED = ['NVDAUSDT', 'SPYUSDT', 'BTCUSDT'];
const FIRST = Math.floor(Date.now() / HOUR) * HOUR - 450 * HOUR; // 450 bars of history, 3 pages
const px = (t, base) => +(base * (1 + 0.02 * Math.sin(t / HOUR / 7))).toFixed(2);
const baseOf = { NVDAUSDT: 230, SPYUSDT: 700, BTCUSDT: 84000 };
const ok = (data) => JSON.stringify({ code: '00000', msg: 'success', requestTime: Date.now(), data });

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); const q = u.searchParams; const sym = q.get('symbol');
  res.setHeader('content-type', 'application/json');
  if (u.pathname.endsWith('/contracts')) return res.end(ok(LISTED.map((s) => ({ symbol: s, isRwa: s === 'BTCUSDT' ? 'NO' : 'YES', maxLever: '100' })).concat([{ symbol: 'XAUUSDT', isRwa: 'YES' }, { symbol: 'DOGEUSDT', isRwa: 'NO' }])));
  if (u.pathname.endsWith('/history-candles')) {
    const end = Number(q.get('endTime')); const rows = [];
    for (let t = end - 200 * HOUR; t < end; t += HOUR) {
      if (t < FIRST) continue;
      if (sym === 'SPYUSDT' && t === FIRST + 100 * HOUR) continue; // one missing hour
      const o = px(t - HOUR, baseOf[sym]), c = px(t, baseOf[sym]);
      rows.push([String(t), String(o), String(Math.max(o, c) + 0.5), String(Math.min(o, c) - 0.5), String(c), '12.5', '2875.1']);
    }
    return res.end(ok(rows));
  }
  if (u.pathname.endsWith('/history-fund-rate')) return res.end(ok(q.get('pageNo') === '1' ? [{ symbol: sym, fundingRate: '0.000167', fundingTime: String(FIRST + 8 * HOUR) }, { symbol: sym, fundingRate: '0', fundingTime: String(FIRST) }] : []));
  if (u.pathname.endsWith('/tickers')) return res.end(ok(LISTED.map((s) => ({ symbol: s, lastPr: String(baseOf[s]), indexPrice: String(baseOf[s] + 0.1), markPrice: String(baseOf[s]), fundingRate: '0.0001' }))));
  if (u.pathname.endsWith('/merge-depth')) {
    const step = { scale0: 0.01, scale1: 0.1, scale2: 1, scale3: 10 }[q.get('precision')] * (sym === 'BTCUSDT' ? 10 : 1);
    const mid = baseOf[sym];
    const side = (dir) => Array.from({ length: 100 }, (_, i) => [(mid + dir * step * (i + 0.5)).toFixed(3), String(2 * Math.round(step / 0.01))]);
    return res.end(ok({ asks: side(1), bids: side(-1), ts: String(Date.now()), precision: q.get('precision') }));
  }
  res.statusCode = 404; res.end(JSON.stringify({ code: '40404', msg: 'not found' }));
});
await new Promise((r) => server.listen(0, r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-'));

test('fetch-history pages back to the first bar, keeps a gap as a gap, skips unlisted contracts', async () => {
  // execFileSync would block the mock server in this process, so run it async
  const { execFile } = await import('node:child_process');
  await new Promise((res, rej) => execFile('node', [path.join(KIT, 'scripts', 'fetch-history.mjs')], { env: { ...process.env, BITGET_BASE: BASE, DATA_DIR: DATA } }, (e, out) => (e ? rej(e) : (console.log(out), res()))));
  const m = JSON.parse(fs.readFileSync(path.join(DATA, 'manifest.json'), 'utf8'));
  assert.deepEqual(Object.keys(m.symbols).sort(), [...LISTED].sort());
  assert.equal(m.symbols.NVDAUSDT.bars, 450);
  assert.equal(m.symbols.NVDAUSDT.gaps.length, 0);
  assert.equal(m.symbols.SPYUSDT.bars, 449);
  assert.deepEqual(m.symbols.SPYUSDT.gaps.map((g) => g.missingHours), [1]);
  assert.ok(m.notListed.includes('TSLAUSDT'));
  assert.equal(m.rwaContractsListed, 3);
  const rows = fs.readFileSync(path.join(DATA, 'hourly', 'NVDAUSDT.csv'), 'utf8').trim().split('\n');
  assert.equal(rows.length, 450);
  assert.equal(Number(rows[0].split(',')[0]), FIRST);
  assert.equal(rows[0].split(',').length, 7);
  assert.equal(fs.readFileSync(path.join(DATA, 'funding', 'NVDAUSDT.csv'), 'utf8').trim().split('\n').length, 2);
  const kept = JSON.parse(fs.readFileSync(path.join(DATA, 'contracts.json'), 'utf8')).map((c) => c.symbol);
  assert.ok(kept.includes('XAUUSDT') && !kept.includes('DOGEUSDT'));
});

test('record-book writes one line per listed contract and reaches 50 bps on a high-priced contract', async () => {
  const { execFile } = await import('node:child_process');
  await new Promise((res, rej) => execFile('node', [path.join(KIT, 'scripts', 'record-book.mjs')], { env: { ...process.env, BITGET_BASE: BASE, DATA_DIR: DATA } }, (e) => (e ? rej(e) : res())));
  const file = fs.readdirSync(path.join(DATA, 'book'))[0];
  const rows = fs.readFileSync(path.join(DATA, 'book', file), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(rows.length, 3);
  const spy = rows.find((r) => r.symbol === 'SPYUSDT');
  assert.ok(!spy.error, spy.error);
  assert.ok(Math.abs(spy.spreadBps - 0.143) < 0.01);
  assert.ok(spy.bid10 > 0 && spy.bid50 > spy.bid10, JSON.stringify(spy)); // one-cent steps stop at 14 bps; the coarser book must supply 50
  assert.equal(spy.index, 700.1);
  server.close();
});
