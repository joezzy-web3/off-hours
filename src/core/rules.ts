// The rules of the game, as pure functions. Each one is a line of
// research/PREREGISTRATION.md turned into code; none of them reads a price
// except through a View, and none of them involves a language model.

import { closeOf, DAY, Kind, tradingDays } from './calendar';
import { View } from './market';

export const THRESHOLD = 0.5; // a move counts once it reaches half the contract's scale
export const MIN_PRIOR = 30; // earlier graded events a forecast needs
export const HOLD_SHARE = 0.5; // a move "held" if at least half of it is still standing
export const PLAN_HIGH = 0.6;
export const PLAN_LOW = 0.4;

const CALENDAR_START = Date.UTC(2025, 7, 1);

export function stdev(xs: number[]): number {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1));
}

/** Linear-interpolation quantile (the common "type 7"). */
export function quantile(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * p;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

/**
 * A contract's scale on trading day d: the standard deviation of its last 20
 * cash-close to cash-close returns ending at d. Undefined with fewer than 10.
 */
export function scale(v: View, symbol: string, d: number): number | undefined {
  const days = tradingDays(Math.max(d - 45 * DAY, CALENDAR_START), d);
  const closes = days.map((day) => v.closeAt(symbol, closeOf(day)));
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const a = closes[i - 1], b = closes[i];
    if (a !== undefined && b !== undefined) returns.push(b / a - 1);
  }
  const last = returns.slice(-20);
  return last.length >= 10 ? stdev(last) : undefined;
}

export type Size = 'small' | 'large';
export const sizeOf = (m: number, s: number): Size => (Math.abs(m) < s ? 'small' : 'large');

/** What the forecaster remembers of a graded event. */
export interface Past { window: string; kind: Kind; size: Size; s: number; y: number; held: boolean }

export interface Forecast {
  /** the class the forecast was drawn from, or "all" after the fallback */
  cls: string;
  /** earlier events in that class */
  n: number;
  /** share of them in which the move held */
  pHold: number;
  /** share of them in which the move went further after the trigger */
  q: number;
  /** 80% range for the price 90 minutes after the bell */
  lo: number;
  hi: number;
  /** share of an order to do at once: 1, 0.5 or 0 */
  plan: number;
}

/** Share of an order (in the direction of the move) to do at the trigger. */
export const planFor = (q: number): number => (q >= PLAN_HIGH ? 1 : q <= PLAN_LOW ? 0 : 0.5);

export function forecast(prior: Past[], kind: Kind, m: number, s: number, price: number, minPrior = MIN_PRIOR): Forecast | null {
  const size = sizeOf(m, s);
  let cls = `${kind}/${size}`;
  let pool = prior.filter((p) => p.kind === kind && p.size === size);
  if (pool.length < minPrior) { pool = prior; cls = 'all'; }
  if (pool.length < minPrior) return null;
  const v = pool.map((p) => p.y / p.s);
  const sign = Math.sign(m);
  const a = price * (1 + sign * quantile(v, 0.1) * s), b = price * (1 + sign * quantile(v, 0.9) * s);
  const q = pool.filter((p) => p.y > 0).length / pool.length;
  return { cls, n: pool.length, pHold: pool.filter((p) => p.held).length / pool.length, q, lo: Math.min(a, b), hi: Math.max(a, b), plan: planFor(q) };
}

export interface Outcome {
  /** price 90 minutes after the bell */
  out: number;
  /** how far the move went after the trigger, in its own direction */
  y: number;
  /** share of the move still standing */
  retained: number;
  held: boolean;
}

export function outcome(c0: number, m: number, price: number, out: number): Outcome {
  const y = Math.sign(m) * (out / price - 1);
  const retained = (out / c0 - 1) / m;
  return { out, y, retained, held: retained >= HOLD_SHARE };
}

/** Points for saying "p that it holds". 50% always scores 0; certainty scores +25 right, -75 wrong. */
export const points = (p: number, held: boolean): number => 100 * (0.25 - (p - (held ? 1 : 0)) ** 2);

/**
 * Timing gain of doing share f of an order at the trigger and the rest 90
 * minutes after the bell, against three plain plans. Order in the direction of
 * the move; for an order against it, f means the share left for the bell.
 * Hourly closes, no trading cost.
 */
export function timing(f: number, y: number): { vsSplit: number; vsNow: number; vsBell: number } {
  return { vsSplit: (f - 0.5) * y, vsNow: (f - 1) * y, vsBell: f * y };
}
