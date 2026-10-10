// Hourly bars, and the only door the engine may read them through: a view that
// refuses any bar that had not closed by "now". That refusal is the whole of
// the no-look-ahead rule, so it lives in one place.

import { HOUR } from './calendar';

export interface Bar { t: number; o: number; h: number; l: number; c: number; v?: number }
export type Bars = Map<number, Bar>;
export type Market = Record<string, Bars>;

/** The recorder's CSV: t,open,high,low,close,baseVolume,quoteVolume. */
export function parseCsv(text: string): Bars {
  const bars: Bars = new Map();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const [t, o, h, l, c, , qv] = line.split(',');
    const bar: Bar = { t: Number(t), o: Number(o), h: Number(h), l: Number(l), c: Number(c) };
    if (qv !== undefined && qv !== '') bar.v = Number(qv);
    if (![bar.t, bar.o, bar.h, bar.l, bar.c].every(Number.isFinite)) throw new Error(`bad row: ${line}`);
    bars.set(bar.t, bar);
  }
  return bars;
}

export interface View {
  now: number;
  /** Close of the hourly bar that ENDS at `end`, or undefined if missing or not yet closed. */
  closeAt(symbol: string, end: number): number | undefined;
}

export function view(market: Market, now: number): View {
  return {
    now,
    closeAt(symbol, end) {
      if (end > now) return undefined; // that bar has not closed yet
      return market[symbol]?.get(end - HOUR)?.c;
    },
  };
}

export function span(market: Market): { first: number; last: number } {
  let first = Infinity, last = -Infinity;
  for (const bars of Object.values(market)) for (const t of bars.keys()) { if (t < first) first = t; if (t > last) last = t; }
  return { first, last: last + HOUR };
}
