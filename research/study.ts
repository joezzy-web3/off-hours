// THE STUDY. Runs the frozen house over the recorded candles and tests the three
// claims fixed in research/PREREGISTRATION.md, on the test set only. Nothing in
// here changes an engine; it calls the same functions the app calls.
//
//   tsx research/study.ts      writes research/results.json, research/events.csv, research/quiet.csv

import fs from 'node:fs';
import { Config, start, tick } from '../src/core/agent';
import { loadMarket } from '../src/core/files';
import { firstBreak } from '../src/core/ledger';
import { span } from '../src/core/market';
import { MIN_PRIOR, THRESHOLD } from '../src/core/rules';
import { HOUR } from '../src/core/calendar';
import { stdev } from '../src/core/rules';
import { B, byMonth, claim1, claim2, claim3, clustered, Row, rows, SEED, TEST_END } from '../src/core/study';

// ---- the run ---------------------------------------------------------------------

function main() {
  // the recorded history only: hours appended later belong to the forward test
  const market = loadMarket(undefined, false);
  const symbols = Object.keys(market);
  const { first, last } = span(market);
  const run = (cfg: Partial<Config>) => tick(market, start(first), last, { symbols, ...cfg });
  const base = run({});
  if (firstBreak(base.ledger) !== -1) throw new Error('ledger does not verify');
  const { rows: all, voided } = rows(market, base.graded);
  const test = all.filter((r) => r.set === 'test'), expl = all.filter((r) => r.set === 'after');
  const quietTest = base.quiet.filter((q) => q.gradeAt <= TEST_END);
  const w = (r: { window: string }) => r.window;
  const y = (r: Row) => r.y;

  const claim1Test = claim1(test, quietTest);

  // breakdowns: every one fixed in advance, each with a plain 95% interval and one widened for the number shown
  const cuts: { group: string; name: string; set: Row[]; value?: (r: Row) => number }[] = [
    ...['overnight', 'weekend'].map((k) => ({ group: 'Kind of window', name: k === 'weekend' ? 'weekend or holiday' : k, set: test.filter((r) => r.kind === k) })),
    { group: 'Direction', name: 'up moves', set: test.filter((r) => r.m > 0) },
    { group: 'Direction', name: 'down moves', set: test.filter((r) => r.m < 0) },
    ...(['after-hours', 'dead hours', 'pre-market'] as const).map((p) => ({ group: 'When it was called', name: p, set: test.filter((r) => r.phase === p) })),
    { group: 'Crypto-linked', name: 'MSTR and COIN', set: test.filter((r) => /^(MSTR|COIN)/.test(r.symbol)) },
    { group: 'Crypto-linked', name: 'the other contracts', set: test.filter((r) => !/^(MSTR|COIN)/.test(r.symbol)) },
    ...symbols.map((s) => ({ group: 'Contract', name: s.replace('USDT', ''), set: test.filter((r) => r.symbol === s) })),
    { group: 'Outcome measured', name: '30 minutes after the bell', set: test.filter((r) => r.y30 !== null), value: (r: Row) => r.y30! },
    { group: 'Outcome measured', name: 'at the cash close', set: test.filter((r) => r.yClose !== null), value: (r: Row) => r.yClose! },
  ];
  for (const [name, cfg] of [['1 x scale', { threshold: 1 }], ['1.5 x scale', { threshold: 1.5 }], ['2 x scale', { threshold: 2 }], ['a flat 2%', { flat: 0.02 }]] as [string, Partial<Config>][]) {
    cuts.push({ group: 'Threshold', name, set: rows(market, run(cfg).graded).rows.filter((r) => r.set === 'test') });
  }
  const k = cuts.length;
  const breakdowns = cuts.map((c) => {
    const v = c.value ?? y;
    return { group: c.group, name: c.name, plain: clustered(c.set, w, v), adjusted: clustered(c.set, w, v, 0.05 / k), extended: c.set.length ? c.set.filter((r) => v(r) > 0).length / c.set.length : NaN };
  });

  const fc = test.filter((r) => r.forecast);

  // ---- added after an independent review of the first draft; none of this was fixed in advance ----
  // Until early 2026 these contracts did not trade from Friday's close to Sunday evening New York.
  // The recorder shows it as runs of bars with no volume. Find them, and split the results around them.
  const halts: Record<string, { zeroVolumeBars: number; longHalts: number; lastHaltEnds: number | null }> = {};
  let weekendTradingFrom = 0;
  for (const s of symbols) {
    const bars = [...market[s].values()].sort((a, b) => a.t - b.t);
    let run = 0, zero = 0, long = 0, lastEnd: number | null = null;
    for (const b of bars) {
      if (b.v === 0) { zero++; run++; continue; }
      if (run >= 24) { long++; lastEnd = b.t; }
      run = 0;
    }
    halts[s.replace('USDT', '')] = { zeroVolumeBars: zero, longHalts: long, lastHaltEnds: lastEnd };
    if (lastEnd && lastEnd > weekendTradingFrom) weekendTradingFrom = lastEnd;
  }
  const early = test.filter((r) => r.at < weekendTradingFrom), late = test.filter((r) => r.at >= weekendTradingFrom);
  const cov = (set: Row[]) => clustered(set.filter((r) => r.forecast), w, (r) => (r.inRange ? 1 : 0));
  const posthoc = {
    halts, weekendTradingFrom,
    eligibleSessions: claim1Test.difference!.windows,
    periods: [['before weekend trading began', early], ['since weekend trading began', late]].map(([name, set]) => ({
      name, events: (set as Row[]).length, y: clustered(set as Row[], w, y), held: clustered(set as Row[], w, (r) => (r.held ? 1 : 0)), coverage: cov(set as Row[]),
      weekend: { events: (set as Row[]).filter((r) => r.kind === 'weekend').length, y: clustered((set as Row[]).filter((r) => r.kind === 'weekend'), w, y), coverage: cov((set as Row[]).filter((r) => r.kind === 'weekend')) },
    })),
    coverageBySize: ['small', 'large'].map((size) => ({ size, ...cov(test.filter((r) => r.size === size)) })),
    afterHalt: { events: test.filter((r) => r.afterHalt).length, weekend: test.filter((r) => r.afterHalt && r.kind === 'weekend').length },
    thin: { under10k: test.filter((r) => r.volume !== null && r.volume < 10_000).length, under1k: test.filter((r) => r.volume !== null && r.volume < 1_000).length },
    size: { meanMoveBp: test.reduce((a, r) => a + Math.abs(r.m), 0) / test.length, meanOfScale: test.reduce((a, r) => a + Math.abs(r.m) / r.s, 0) / test.length, shareAtLeastOneScale: test.filter((r) => Math.abs(r.m) >= r.s).length / test.length, sdOfY: stdev(test.map(y)) },
    hoursOfHistory: Math.round((last - first) / HOUR),
    firstBars: Object.fromEntries(symbols.map((s) => [s.replace('USDT', ''), Math.min(...market[s].keys())])),
  };

  const results = {
    generated: 'tsx research/study.ts', seed: SEED, resamples: B, threshold: THRESHOLD, minPrior: MIN_PRIOR,
    data: { from: first, to: last, contracts: symbols.map((s) => s.replace('USDT', '')), testEnd: TEST_END, voided },
    sets: { test: { events: test.length, windows: new Set(test.map(w)).size, quiet: quietTest.length }, exploration: { events: expl.length, windows: new Set(expl.map(w)).size }, all: { events: all.length, windows: new Set(all.map(w)).size } },
    claim1: claim1Test, breakdowns, breakdownCount: k, claim2: claim2(test), claim3: claim3(test),
    exploration: claim1(expl), everything: claim1(all), months: byMonth(test), posthoc,
    ledger: { entries: base.ledger.length, tail: base.ledger.at(-1)!.hash },
  };
  fs.writeFileSync('research/results.json', JSON.stringify(results, null, 1) + '\n');
  const head = 'id,set,window,symbol,kind,at,phase,c0,s,m,price,out,y,retained,held,y30,yClose,forecast,pHold,lo,hi,plan,inRange,points,t,baseLo,baseHi';
  fs.writeFileSync('research/events.csv', [head, ...all.map((r) => [r.id, r.set, r.window, r.symbol, r.kind, r.at, r.phase, r.c0, r.s, r.m, r.price, r.out, r.y, r.retained, r.held ? 1 : 0, r.y30 ?? '', r.yClose ?? '', r.forecast ? 1 : 0, r.pHold ?? '', r.lo ?? '', r.hi ?? '', r.plan ?? '', r.inRange === null ? '' : r.inRange ? 1 : 0, r.points ?? '', r.t ?? '', r.baseLo, r.baseHi].join(','))].join('\n') + '\n');
  fs.writeFileSync('research/quiet.csv', ['window,symbol,kind,gradeAt,set,s,m,y', ...base.quiet.map((q) => [q.window, q.symbol, q.kind, q.gradeAt, q.gradeAt <= TEST_END ? 'test' : 'after', q.s, q.m, q.y].join(','))].join('\n') + '\n');
  console.log(`test set: ${test.length} events in ${results.sets.test.windows} windows, ${fc.length} with a forecast; ${voided} void`);
}

if (process.argv[1]?.endsWith('study.ts')) main();
