import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { start, tick } from '../src/core/agent';
import { DAY } from '../src/core/calendar';
import { loadMarket } from '../src/core/files';
import { Market, span } from '../src/core/market';

// These run on the recorded Bitget candles in data/hourly, so they are skipped where that folder is absent.
const have = fs.existsSync('data/hourly/NVDAUSDT.csv');

test('NO LOOK-AHEAD on the recorded candles: cutting the history short changes no earlier entry', { skip: !have }, () => {
  const market = loadMarket('data', false);
  const symbols = Object.keys(market);
  const { first, last } = span(market);
  const full = tick(market, start(first), last, { symbols });
  assert.ok(full.ledger.length > 2000);
  for (const days of [90, 200, 330]) {
    const cut = first + days * DAY;
    // a market that ends at the cut: every later bar does not exist
    const shorter: Market = {};
    for (const s of symbols) shorter[s] = new Map([...market[s]].filter(([t]) => t < cut));
    const part = tick(shorter, start(first), cut, { symbols });
    const before = full.ledger.filter((e) => e.at <= cut);
    assert.ok(before.length > 50, `${before.length} entries before day ${days}`);
    assert.deepEqual(part.ledger.map((e) => e.hash), before.map((e) => e.hash));
    assert.deepEqual(part.quiet, full.quiet.filter((q) => q.gradeAt <= cut));
  }
});

test('the published study figures are the ones the frozen house produces', { skip: !have || !fs.existsSync('research/results.json') }, () => {
  const r = JSON.parse(fs.readFileSync('research/results.json', 'utf8'));
  const market = loadMarket('data', false);
  const { first, last } = span(market);
  const state = tick(market, start(first), last, { symbols: Object.keys(market) });
  assert.equal(state.ledger.at(-1)!.hash, r.ledger.tail);
  assert.equal(state.graded.length, r.sets.all.events);
  assert.equal(r.resamples, 10_000); // as fixed in research/PREREGISTRATION.md
});
