import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { start, State, tick } from '../src/core/agent';
import { closeOf, DAY, HOUR, isDaylight, isTradingDay, MIN, openOf, windows } from '../src/core/calendar';
import { append, canonical, Entry, firstBreak } from '../src/core/ledger';
import { Bars, Market, parseCsv, view } from '../src/core/market';
import { forecast, outcome, Past, planFor, points, quantile, scale, stdev, timing } from '../src/core/rules';
import { deal, rng } from '../src/core/season';
import { sha256 } from '../src/core/sha256';

const day = (s: string) => Date.parse(`${s}T00:00:00Z`);
const at = (s: string) => Date.parse(`${s}:00Z`);

/** A seeded random walk, hourly, for a few contracts. */
function walk(seed: number, from: number, hours: number, symbols = ['AAAUSDT', 'BBBUSDT', 'CCCUSDT']): Market {
  const r = rng(seed);
  const market: Market = {};
  for (const s of symbols) {
    const bars: Bars = new Map();
    let p = 100 + 50 * r();
    for (let i = 0; i < hours; i++) {
      const o = p;
      p = +(p * (1 + (r() - 0.5) * 0.012)).toFixed(2);
      bars.set(from + i * HOUR, { t: from + i * HOUR, o, h: Math.max(o, p), l: Math.min(o, p), c: p });
    }
    market[s] = bars;
  }
  return market;
}
const FROM = day('2026-03-02');
const HOURS = 70 * 24;
const CFG = { symbols: ['AAAUSDT', 'BBBUSDT', 'CCCUSDT'], minPrior: 12 };

test('sha256 matches node:crypto', () => {
  for (const s of ['', 'abc', 'off-hours', 'ü€🔔', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), 'y'.repeat(1000)]) {
    assert.equal(sha256(s), createHash('sha256').update(s).digest('hex'));
  }
});

test('calendar: New York hours in UTC, summer and winter', () => {
  assert.equal(isDaylight(day('2026-03-06')), false);
  assert.equal(isDaylight(day('2026-03-09')), true);
  assert.equal(isDaylight(day('2026-10-30')), true);
  assert.equal(isDaylight(day('2026-11-02')), false);
  assert.equal(openOf(day('2026-09-15')), at('2026-09-15T13:30'));
  assert.equal(closeOf(day('2026-09-15')), at('2026-09-15T20:00'));
  assert.equal(openOf(day('2026-02-10')), at('2026-02-10T14:30'));
  assert.equal(closeOf(day('2026-02-10')), at('2026-02-10T21:00'));
  assert.equal(isTradingDay(day('2026-09-07')), false); // Labor Day
  assert.equal(isTradingDay(day('2026-09-05')), false); // Saturday
  assert.throws(() => isTradingDay(day('2030-01-02')));
  // 2025, from the first listing: Labor Day shut, clocks back on 2 November, half day after Thanksgiving left out
  assert.equal(isTradingDay(day('2025-09-01')), false);
  assert.equal(closeOf(day('2025-10-31')), at('2025-10-31T20:00'));
  assert.equal(closeOf(day('2025-11-03')), at('2025-11-03T21:00'));
  assert.deepEqual(windows(at('2025-11-25T00:00'), at('2025-12-01T00:00')).map((x) => x.id), ['2025-11-25']);
});

test('calendar: windows, decision hours and the grading time', () => {
  const ws = windows(at('2026-09-01T00:00'), at('2026-09-12T00:00'));
  assert.deepEqual(ws.map((w) => w.id), ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11']);
  const tue = ws[0];
  assert.equal(tue.kind, 'overnight');
  assert.equal(tue.close, at('2026-09-01T20:00'));
  assert.equal(tue.bell, at('2026-09-02T13:30'));
  assert.equal(tue.grade, at('2026-09-02T15:00'));
  assert.equal(tue.decisions[0], at('2026-09-01T21:00'));
  assert.equal(tue.decisions.at(-1), at('2026-09-02T12:00')); // 90 minutes before the bell
  assert.equal(tue.decisions.length, 16);
  const longWeekend = ws[3];
  assert.equal(longWeekend.kind, 'weekend');
  assert.equal(longWeekend.bell, at('2026-09-08T13:30')); // the Monday is a holiday
  // winter: everything an hour later, still on the hour
  const w = windows(at('2026-02-10T00:00'), at('2026-02-10T23:00'))[0];
  assert.equal(w.decisions[0], at('2026-02-10T22:00'));
  assert.equal(w.decisions.at(-1), at('2026-02-11T13:00'));
  assert.equal(w.grade, at('2026-02-11T16:00'));
  // a session that closes early is left out, on both sides
  assert.deepEqual(windows(at('2026-11-24T00:00'), at('2026-11-30T00:00')).map((x) => x.id), ['2026-11-24']);
  for (const x of windows(at('2026-02-01T00:00'), at('2026-12-31T00:00'))) {
    assert.ok(x.decisions.every((t) => t % HOUR === 0) && x.grade % HOUR === 0);
    assert.ok(x.bell - x.decisions.at(-1)! === 90 * MIN);
  }
});

test('the view refuses a bar that has not closed', () => {
  const market: Market = { X: parseCsv('3600000,1,2,1,2,,\n7200000,2,3,2,3,5,15\n') };
  assert.equal(view(market, 2 * HOUR).closeAt('X', 2 * HOUR), 2);
  assert.equal(view(market, 2 * HOUR).closeAt('X', 3 * HOUR), undefined); // closes at 03:00, it is only 02:00
  assert.equal(view(market, 3 * HOUR - 1).closeAt('X', 3 * HOUR), undefined);
  assert.equal(view(market, 3 * HOUR).closeAt('X', 3 * HOUR), 3);
  assert.equal(view(market, 9 * HOUR).closeAt('X', 5 * HOUR), undefined); // missing stays missing
  assert.equal(market.X.get(7200000)!.v, 15);
});

test('rules: quantile, scale, points, plan and timing', () => {
  assert.equal(quantile([1, 2, 3, 4, 5], 0.5), 3);
  assert.ok(Math.abs(quantile([1, 2, 3, 4, 5], 0.1) - 1.4) < 1e-12);
  assert.ok(Math.abs(stdev([1, 2, 3, 4]) - 1.2909944487358056) < 1e-12);
  assert.equal(points(0.5, true), 0);
  assert.equal(points(0.5, false), 0);
  assert.equal(points(1, true), 25);
  assert.equal(points(1, false), -75);
  assert.ok(points(0.8, true) > points(0.6, true) && points(0.8, false) < points(0.6, false));
  assert.deepEqual([0.6, 0.59, 0.41, 0.4].map(planFor), [1, 0.5, 0.5, 0]);
  const t = timing(1, 0.01);
  assert.ok(Math.abs(t.vsSplit - 0.005) < 1e-15 && t.vsNow === 0 && t.vsBell === 0.01);
  assert.ok(Math.abs(timing(0, 0.01).vsSplit + 0.005) < 1e-15);
  // a fall of 2% that ends 0.9% down has 45% of it standing: not held
  const o = outcome(100, -0.02, 98, 99.1);
  assert.equal(o.held, false);
  assert.ok(Math.abs(o.retained - 0.45) < 1e-9 && o.y < 0);
  assert.equal(outcome(100, -0.02, 98, 99).held, true); // exactly half
});

test('rules: scale needs ten returns and reads nothing after the day', () => {
  const market = walk(7, FROM, HOURS);
  const d = day('2026-03-20');
  const s = scale(view(market, closeOf(d)), 'AAAUSDT', d)!;
  assert.ok(s > 0);
  assert.equal(scale(view(market, closeOf(d) + 30 * DAY), 'AAAUSDT', d), s); // later bars change nothing
  assert.equal(scale(view(market, closeOf(day('2026-03-10'))), 'AAAUSDT', day('2026-03-10')), undefined); // only six returns so far
});

test('rules: forecast falls back to all events, then to none', () => {
  const past = (kind: Past['kind'], y: number, held: boolean): Past => ({ window: 'w', kind, size: 'small', s: 0.02, y, held });
  const prior = [...Array(20).fill(0).map((_, i) => past('overnight', (i - 8) * 0.001, i % 4 !== 0)), ...Array(5).fill(0).map(() => past('weekend', 0.004, true))];
  assert.equal(forecast(prior.slice(0, 9), 'overnight', -0.012, 0.02, 98.8, 10), null);
  const own = forecast(prior, 'overnight', -0.012, 0.02, 98.8, 10)!;
  assert.equal(own.cls, 'overnight/small');
  assert.equal(own.n, 20);
  assert.equal(own.pHold, 0.75);
  assert.ok(own.lo < own.hi && own.lo < 98.8 && own.hi > 98.8);
  const pooled = forecast(prior, 'weekend', 0.012, 0.02, 101.2, 10)!;
  assert.equal(pooled.cls, 'all');
  assert.equal(pooled.n, 25);
  // the same history gives a mirrored range for a rise and a fall
  const up = forecast(prior, 'overnight', 0.012, 0.02, 100, 10)!, down = forecast(prior, 'overnight', -0.012, 0.02, 100, 10)!;
  assert.ok(Math.abs(up.hi - 100 - (100 - down.lo)) < 1e-9);
});

test('the house calls a move at the hour it reaches the threshold, and grades it after the bell', () => {
  // the price steps by 0.8% at each day's closing bar and is flat in between, so the scale is
  // about 0.8% and nothing moves while the market is shut; then a 1% fall three hours after one close
  const bars: Bars = new Map();
  const from = day('2026-06-01');
  const fall = at('2026-06-25T22:00'); // the bar that ends 23:00
  for (let t = from; t < from + 35 * DAY; t += HOUR) {
    const level = Math.floor((t - 19 * HOUR) / DAY) % 2 ? 100.4 : 99.6;
    const c = t >= fall && t < at('2026-06-26T19:00') ? level * 0.99 : level;
    bars.set(t, { t, o: c, h: c, l: c, c });
  }
  const st = tick({ ZZZUSDT: bars }, start(from), from + 35 * DAY, { symbols: ['ZZZUSDT'] });
  const hit = st.graded.find((g) => g.call.window === '2026-06-25')!;
  assert.equal(hit.call.at, at('2026-06-25T23:00'));
  assert.ok(Math.abs(hit.call.m + 0.01) < 1e-9);
  assert.equal(hit.call.forecast, null); // nothing earlier to forecast from
  assert.equal(hit.call.gradeAt, at('2026-06-26T15:00'));
  assert.equal(hit.grade.held, true);
  assert.ok(Math.abs(hit.grade.y!) < 1e-9); // it stayed where it was
  const entries = st.ledger.filter((e) => (e.body as { id: string }).id === hit.call.id);
  assert.deepEqual(entries.map((e) => [e.kind, e.at]), [['call', hit.call.at], ['grade', hit.call.gradeAt]]);
});

test('NO LOOK-AHEAD: changing any later bar changes no earlier ledger entry', () => {
  const market = walk(11, FROM, HOURS);
  const base = tick(market, start(FROM), FROM + HOURS * HOUR, CFG);
  assert.ok(base.ledger.length > 100, `only ${base.ledger.length} entries`);
  assert.ok(base.graded.some((g) => g.call.forecast), 'no forecasts were made');
  for (const cut of [FROM + 500 * HOUR, FROM + 901 * HOUR, FROM + 1300 * HOUR]) {
    const changed: Market = {};
    const r = rng(cut);
    for (const [s, bars] of Object.entries(market)) {
      changed[s] = new Map([...bars].map(([t, b]) => [t, t >= cut ? { ...b, c: +(b.c * (0.7 + 0.6 * r())).toFixed(2) } : b]));
    }
    const other = tick(changed, start(FROM), FROM + HOURS * HOUR, CFG);
    const before = base.ledger.filter((e) => e.at <= cut);
    assert.ok(before.length > 10);
    assert.deepEqual(other.ledger.slice(0, before.length).map((e) => e.hash), before.map((e) => e.hash));
    assert.notDeepEqual(other.ledger.map((e) => e.hash), base.ledger.map((e) => e.hash)); // and the change did matter afterwards
  }
});

test('live and replay are the same loop: one hour at a time through JSON gives the same ledger', () => {
  const market = walk(23, FROM, HOURS);
  const once = tick(market, start(FROM), FROM + HOURS * HOUR, CFG);
  let st: State = start(FROM);
  for (let t = FROM + HOUR; t <= FROM + HOURS * HOUR; t += HOUR) st = tick(market, JSON.parse(JSON.stringify(st)), t, CFG);
  st = tick(market, st, FROM + HOURS * HOUR, CFG);
  assert.deepEqual(st.ledger.map((e) => e.hash), once.ledger.map((e) => e.hash));
  assert.equal(st.quiet.length, once.quiet.length);
  // every call is written before its grade, and no contract is called twice in a window
  const seen = new Map<string, Entry>();
  for (const e of once.ledger) {
    const id = (e.body as { id: string }).id;
    if (e.kind === 'call') { assert.ok(!seen.has(id)); seen.set(id, e); } else assert.ok(seen.get(id)!.at < e.at);
  }
  // a forecast uses only events graded before the call was made
  for (const g of once.graded) if (g.call.forecast) assert.ok(g.call.forecast.n <= once.ledger.filter((e) => e.kind === 'grade' && e.at <= g.call.at).length);
});

test('ledger: any edit, removal or reordering is detected', () => {
  const ledger: Entry[] = [];
  for (let i = 0; i < 6; i++) append(ledger, 1000 + i, i % 2 ? 'grade' : 'call', { id: `c${i >> 1}`, n: i / 3 });
  assert.equal(firstBreak(ledger), -1);
  const copy = (): Entry[] => JSON.parse(JSON.stringify(ledger));
  const edited = copy(); (edited[2].body as { n: number }).n = 9;
  assert.equal(firstBreak(edited), 2);
  const removed = copy(); removed.splice(3, 1);
  assert.equal(firstBreak(removed), 3);
  const swapped = copy(); [swapped[1], swapped[2]] = [swapped[2], swapped[1]];
  assert.equal(firstBreak(swapped), 1);
  const backdated = copy(); backdated[4].at = 5;
  assert.equal(firstBreak(backdated), 4);
  assert.equal(canonical({ b: 1, a: [2, { d: 1, c: undefined }] }), '{"a":[2,{"d":1}],"b":1}');
});

test('season: the same seed deals the same boards', () => {
  const boards = Array.from({ length: 40 }, (_, i) => i);
  assert.deepEqual(deal(boards, 4821), deal(boards, 4821));
  assert.notDeepEqual(deal(boards, 4821), deal(boards, 4822));
  assert.equal(new Set(deal(boards, 4821)).size, 10);
  assert.equal(deal(boards.slice(0, 6), 1).length, 6);
});
