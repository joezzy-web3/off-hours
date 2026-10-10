// The study's arithmetic, as pure functions: one row per graded call, intervals
// from resampling whole closed windows, and the three claims fixed in
// research/PREREGISTRATION.md. Used on the frozen test set by research/study.ts
// and, unchanged, on everything recorded since by the hourly agent.

import { Call, Grade, Quiet } from './agent';
import { closeOf, HOUR, MIN } from './calendar';
import { Market, view } from './market';
import { timing } from './rules';
import { rng } from './season';

export const TEST_END = closeOf(Date.UTC(2026, 7, 28)); // cash close of 28 August 2026
export const SEED = 20261010;
export const B = 10_000; // as fixed in research/PREREGISTRATION.md

export interface Row {
  id: string; window: string; symbol: string; kind: string; set: 'test' | 'after';
  at: number; phase: 'after-hours' | 'dead hours' | 'pre-market';
  c0: number; s: number; m: number; price: number; out: number; y: number; retained: number; held: boolean;
  y30: number | null; yClose: number | null;
  forecast: boolean; pHold: number | null; lo: number | null; hi: number | null; plan: number | null;
  inRange: boolean | null; points: number | null; t: number | null;
  baseLo: number; baseHi: number;
  size: string;
  /** quote volume of the hourly bar the call was made on, when the recorder has it */
  volume: number | null;
  /** the bar before the call had no trades: the call was made as trading resumed after a halt */
  afterHalt: boolean;
}

const Z80 = 1.2815515655446004;

export function rows(market: Market, graded: { call: Call; grade: Grade }[]): { rows: Row[]; voided: number } {
  const v = view(market, Infinity);
  const out: Row[] = [];
  let voided = 0;
  for (const { call, grade } of graded) {
    if (grade.void) { voided++; continue; }
    const sign = Math.sign(call.m);
    const p30 = v.closeAt(call.symbol, call.bell + 30 * MIN);
    const pClose = v.closeAt(call.symbol, closeOf(Math.floor(call.bell / (24 * HOUR)) * 24 * HOUR));
    const hours = (call.gradeAt - call.at) / HOUR;
    const sd = call.s * Math.sqrt(hours / 24);
    const f = call.forecast;
    out.push({
      id: call.id, window: call.window, symbol: call.symbol, kind: call.kind, set: call.gradeAt <= TEST_END ? 'test' : 'after',
      at: call.at, phase: call.at - call.close <= 4 * HOUR ? 'after-hours' : call.at >= call.bell - 5.5 * HOUR ? 'pre-market' : 'dead hours',
      c0: call.c0, s: call.s, m: call.m, price: call.price, out: grade.out!, y: grade.y!, retained: grade.retained!, held: grade.held!,
      y30: p30 === undefined ? null : sign * (p30 / call.price - 1), yClose: pClose === undefined ? null : sign * (pClose / call.price - 1),
      forecast: Boolean(f), pHold: f?.pHold ?? null, lo: f?.lo ?? null, hi: f?.hi ?? null, plan: f?.plan ?? null,
      inRange: grade.inRange ?? null, points: grade.points ?? null, t: f ? timing(f.plan, grade.y!).vsSplit : null,
      baseLo: call.price * (1 - Z80 * sd), baseHi: call.price * (1 + Z80 * sd),
      size: call.size, volume: market[call.symbol].get(call.at - HOUR)?.v ?? null, afterHalt: market[call.symbol].get(call.at - 2 * HOUR)?.v === 0,
    });
  }
  return { rows: out, voided };
}

// ---- statistics ------------------------------------------------------------------

export interface Stat { mean: number; lo: number; hi: number; n: number; windows: number }

/**
 * Mean of `value` over items, with a percentile interval from resampling whole
 * closed windows (every item in a window is drawn together). `level` is the
 * two-sided miss rate: 0.05 gives a 95% interval.
 */
export function clustered<T>(items: T[], windowOf: (x: T) => string, value: (x: T) => number, level = 0.05, seed = SEED): Stat {
  const by = new Map<string, { sum: number; n: number }>();
  for (const it of items) {
    const w = by.get(windowOf(it)) ?? { sum: 0, n: 0 };
    w.sum += value(it); w.n += 1;
    by.set(windowOf(it), w);
  }
  const groups = [...by.values()];
  const total = groups.reduce((a, g) => a + g.sum, 0), n = items.length;
  if (!n) return { mean: NaN, lo: NaN, hi: NaN, n: 0, windows: 0 };
  const r = rng(seed);
  const means = new Float64Array(B);
  for (let b = 0; b < B; b++) {
    let s = 0, c = 0;
    for (let i = 0; i < groups.length; i++) { const g = groups[Math.floor(r() * groups.length)]; s += g.sum; c += g.n; }
    means[b] = s / c;
  }
  means.sort();
  const at = (p: number) => means[Math.min(B - 1, Math.max(0, Math.round(p * (B - 1))))];
  return { mean: total / n, lo: at(level / 2), hi: at(1 - level / 2), n, windows: groups.length };
}

/** Difference of two means (a - b) with windows resampled jointly. */
export function clusteredDiff<A, C>(a: A[], wa: (x: A) => string, va: (x: A) => number, c: C[], wc: (x: C) => string, vc: (x: C) => number, seed = SEED): Stat {
  const by = new Map<string, { as: number; an: number; cs: number; cn: number }>();
  const get = (w: string) => { let g = by.get(w); if (!g) { g = { as: 0, an: 0, cs: 0, cn: 0 }; by.set(w, g); } return g; };
  for (const x of a) { const g = get(wa(x)); g.as += va(x); g.an++; }
  for (const x of c) { const g = get(wc(x)); g.cs += vc(x); g.cn++; }
  const groups = [...by.values()];
  const point = groups.reduce((s, g) => s + g.as, 0) / a.length - groups.reduce((s, g) => s + g.cs, 0) / c.length;
  const r = rng(seed);
  const diffs = new Float64Array(B);
  for (let b = 0; b < B; b++) {
    let as = 0, an = 0, cs = 0, cn = 0;
    for (let i = 0; i < groups.length; i++) { const g = groups[Math.floor(r() * groups.length)]; as += g.as; an += g.an; cs += g.cs; cn += g.cn; }
    diffs[b] = as / (an || 1) - cs / (cn || 1);
  }
  diffs.sort();
  return { mean: point, lo: diffs[Math.round(0.025 * (B - 1))], hi: diffs[Math.round(0.975 * (B - 1))], n: a.length, windows: groups.length };
}

export const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
export const pinball = (tau: number, q: number, r: number) => (r >= q ? (r - q) * tau : (q - r) * (1 - tau));


const w = (r: { window: string }) => r.window;

/** Claim 1 on a set of rows: what the move did after it was called. */
export function claim1(set: Row[], quiet: Quiet[] = []) {
  const y = (r: Row) => r.y;
  return {
    y: clustered(set, w, y), extended: clustered(set, w, (r) => (r.y > 0 ? 1 : 0)), held: clustered(set, w, (r) => (r.held ? 1 : 0)),
    medianRetained: set.length ? median(set.map((r) => r.retained)) : NaN,
    ...(quiet.length ? { quiet: clustered<Quiet>(quiet, w, (q) => q.y), difference: clusteredDiff(set, w, y, quiet, w, (q: Quiet) => q.y) } : {}),
  };
}

/** Claim 2: is the forecast calibrated, and how does its range compare with a plain one? */
export function claim2(set: Row[]) {
  const fc = set.filter((r) => r.forecast);
  const bands: { band: string; n: number; said: number; held: number }[] = [];
  for (let lo = 0; lo < 100; lo += 10) {
    const b = fc.filter((r) => r.pHold! * 100 >= lo && (r.pHold! * 100 < lo + 10 || lo === 90));
    if (b.length) bands.push({ band: `${lo}% to ${lo + 10}%`, n: b.length, said: b.reduce((a, r) => a + r.pHold!, 0) / b.length, held: b.filter((r) => r.held).length / b.length });
  }
  const ret = (r: Row) => r.out / r.price - 1;
  const pinF = (r: Row) => (pinball(0.1, r.lo! / r.price - 1, ret(r)) + pinball(0.9, r.hi! / r.price - 1, ret(r))) / 2;
  const pinB = (r: Row) => (pinball(0.1, r.baseLo / r.price - 1, ret(r)) + pinball(0.9, r.baseHi / r.price - 1, ret(r))) / 2;
  return {
    events: fc.length, noForecast: set.length - fc.length,
    coverage: clustered(fc, w, (r) => (r.inRange ? 1 : 0)),
    points: clustered(fc, w, (r) => r.points!),
    brier: fc.length ? fc.reduce((a, r) => a + (r.pHold! - (r.held ? 1 : 0)) ** 2, 0) / fc.length : NaN,
    bands,
    width: clustered(fc, w, (r) => (r.hi! - r.lo!) / r.price),
    baselineWidth: clustered(fc, w, (r) => (r.baseHi - r.baseLo) / r.price),
    baselineCoverage: clustered(fc, w, (r) => (r.out >= r.baseLo && r.out <= r.baseHi ? 1 : 0)),
    pinball: clustered(fc, w, pinF), baselinePinball: clustered(fc, w, pinB),
    pinballDifference: clustered(fc, w, (r) => pinF(r) - pinB(r)),
  };
}

/** Claim 3: does the order rule add timing value before costs? */
export function claim3(set: Row[]) {
  const fc = set.filter((r) => r.forecast);
  return {
    events: fc.length,
    plans: { now: fc.filter((r) => r.plan === 1).length, split: fc.filter((r) => r.plan === 0.5).length, bell: fc.filter((r) => r.plan === 0).length },
    vsSplit: clustered(fc, w, (r) => r.t!),
    vsNow: clustered(fc, w, (r) => timing(r.plan!, r.y).vsNow),
    vsBell: clustered(fc, w, (r) => timing(r.plan!, r.y).vsBell),
  };
}

export interface MonthRow { month: string; events: number; windows: number; held: number; extended: number; y: number; forecasts: number; coverage: number | null; points: number | null }

/** The same figures month by month, to show whether the pattern is drifting. No intervals: a month is small. */
export function byMonth(set: Row[]): MonthRow[] {
  const months = new Map<string, Row[]>();
  for (const r of set) { const m = r.window.slice(0, 7); months.set(m, [...(months.get(m) ?? []), r]); }
  return [...months.entries()].sort().map(([month, rs]) => {
    const fc = rs.filter((r) => r.forecast);
    return {
      month, events: rs.length, windows: new Set(rs.map(w)).size, held: rs.filter((r) => r.held).length / rs.length, extended: rs.filter((r) => r.y > 0).length / rs.length,
      y: rs.reduce((a, r) => a + r.y, 0) / rs.length, forecasts: fc.length,
      coverage: fc.length ? fc.filter((r) => r.inRange).length / fc.length : null, points: fc.length ? fc.reduce((a, r) => a + r.points!, 0) / fc.length : null,
    };
  });
}
