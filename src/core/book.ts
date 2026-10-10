// What it costs to trade: spread and resting depth, from Bitget's order book.
// Candles hold neither, so these figures exist only from the day the recorder started.

import { isCashOpen } from './calendar';

export interface BookRow {
  t: number; symbol: string; bid: number; ask: number; spreadBps: number;
  bid10: number | null; ask10: number | null; bid25: number | null; ask25: number | null; bid50: number | null; ask50: number | null;
  last?: number; index?: number; mark?: number; funding?: number; error?: string;
}
export interface Book { bids: [string, string][]; asks: [string, string][] }
const BANDS = [10, 25, 50] as const;

/** USDT resting within `bps` of the mid on one side of the book. */
export function depthWithin(levels: [string, string][], mid: number, bps: number): number {
  let usdt = 0;
  for (const [p, s] of levels) { const price = Number(p); if (Math.abs(price / mid - 1) * 10_000 <= bps) usdt += price * Number(s); }
  return Math.round(usdt);
}
/** How far from the mid the furthest level on the thinner side reaches, in basis points. */
export function reach(book: Book, mid: number): number {
  const far = (levels: [string, string][]) => (levels?.length ? Math.abs(Number(levels[levels.length - 1][0]) / mid - 1) * 10_000 : 0);
  return Math.min(far(book.bids), far(book.asks));
}
/** One row for one contract from its book at successively coarser price steps (finest first). */
export function summarise(symbol: string, books: Book[], ticker: Record<string, string> | undefined, now: number): BookRow {
  const bid = Number(books[0]?.bids?.[0]?.[0]), ask = Number(books[0]?.asks?.[0]?.[0]);
  if (!(bid > 0 && ask > 0 && ask >= bid)) throw new Error(`${symbol}: no usable book`);
  const mid = (bid + ask) / 2;
  const row = { t: now, symbol, bid, ask, spreadBps: +(((ask - bid) / mid) * 10_000).toFixed(3) } as BookRow;
  for (const bps of BANDS) {
    const book = books.find((b) => reach(b, mid) >= bps);
    row[`bid${bps}`] = book ? depthWithin(book.bids, mid, bps) : null;
    row[`ask${bps}`] = book ? depthWithin(book.asks, mid, bps) : null;
  }
  if (ticker) Object.assign(row, { last: Number(ticker.lastPr), index: Number(ticker.indexPrice), mark: Number(ticker.markPrice), funding: Number(ticker.fundingRate) });
  return row;
}

const med = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
const thin = (r: BookRow, bps: 10 | 25 | 50) => { const b = r[`bid${bps}`], a = r[`ask${bps}`]; return b === null || a === null ? null : Math.min(b, a); };

export interface Regime { snapshots: number; spreadBps: number | null; depth25: number | null }
export interface CostRow {
  ticker: string; t: number; spreadBps: number; depth10: number | null; depth25: number | null; depth50: number | null;
  /** how far the perp sits from the index, in basis points */
  premiumBps: number | null;
  closed: Regime; cash: Regime;
}
export interface Cost { updatedAt: number; since: number | null; snapshots: number; rows: CostRow[] }

/** The latest book for each contract, with its typical spread and depth while New York is shut and while it trades. */
export function costPanel(rows: BookRow[], now: number): Cost {
  const ok = rows.filter((r) => !r.error && r.spreadBps >= 0);
  const by = new Map<string, BookRow[]>();
  for (const r of ok) by.set(r.symbol, [...(by.get(r.symbol) ?? []), r]);
  const regime = (list: BookRow[]): Regime => ({ snapshots: list.length, spreadBps: med(list.map((r) => r.spreadBps)), depth25: med(list.map((r) => thin(r, 25)).filter((x): x is number => x !== null)) });
  const out: CostRow[] = [];
  for (const [symbol, list] of by) {
    list.sort((a, b) => a.t - b.t);
    const last = list[list.length - 1];
    out.push({
      ticker: symbol.replace(/USDT$/, ''), t: last.t, spreadBps: last.spreadBps, depth10: thin(last, 10), depth25: thin(last, 25), depth50: thin(last, 50),
      premiumBps: last.last && last.index ? +(((last.last / last.index) - 1) * 10_000).toFixed(2) : null,
      closed: regime(list.filter((r) => !isCashOpen(r.t))), cash: regime(list.filter((r) => isCashOpen(r.t))),
    });
  }
  return { updatedAt: now, since: ok.length ? Math.min(...ok.map((r) => r.t)) : null, snapshots: new Set(ok.map((r) => r.t)).size, rows: out };
}
