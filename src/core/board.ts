// A board is one graded call with the price path around it: what a player
// sees, what the house said, and what happened.

import { Call, Grade, State } from './agent';
import { HOUR } from './calendar';
import { Market } from './market';

export const NAMES: Record<string, string> = {
  NVDAUSDT: 'NVIDIA', TSLAUSDT: 'Tesla', AAPLUSDT: 'Apple', MSFTUSDT: 'Microsoft', METAUSDT: 'Meta', AMZNUSDT: 'Amazon', GOOGLUSDT: 'Alphabet',
  MSTRUSDT: 'Strategy', COINUSDT: 'Coinbase', PLTRUSDT: 'Palantir', QQQUSDT: 'Nasdaq 100 ETF', SPYUSDT: 'S&P 500 ETF',
};

/** The twelve stock and ETF contracts, fixed in research/PREREGISTRATION.md. */
export const STOCKS = Object.keys(NAMES);

export interface Board extends Call {
  ticker: string;
  name: string;
  /** hourly closes from the cash close to the grading hour; null where Bitget has no bar */
  path: (number | null)[];
  /** index in `path` of the hour the call was made */
  now: number;
  out: number;
  y: number;
  retained: number;
  held: boolean;
  housePoints: number;
  inRange: boolean;
  /** ledger hashes of the house's call and of its grade */
  callHash: string;
  gradeHash: string;
}

/** A board as the app ships it: the fields the screens use. */
export type Dealt = Pick<Board, 'id' | 'ticker' | 'kind' | 'at' | 'close' | 'bell' | 'gradeAt' | 'c0' | 's' | 'm' | 'price' | 'path' | 'now' | 'out' | 'y' | 'retained' | 'held' | 'housePoints' | 'inRange' | 'callHash'> & { forecast: NonNullable<Board['forecast']> };

/** Every graded call that came with a forecast, as a playable board. */
export function boards(market: Market, state: State): Board[] {
  const hashes = new Map<string, { call?: string; grade?: string }>();
  for (const e of state.ledger) {
    const id = (e.body as { id: string }).id;
    hashes.set(id, { ...hashes.get(id), [e.kind]: e.hash });
  }
  const out: Board[] = [];
  for (const { call, grade } of state.graded as { call: Call; grade: Grade }[]) {
    if (grade.void || !call.forecast) continue;
    const path: (number | null)[] = [];
    for (let t = call.close; t <= call.gradeAt; t += HOUR) path.push(market[call.symbol].get(t - HOUR)?.c ?? null);
    const h = hashes.get(call.id)!;
    out.push({
      ...call, ticker: call.symbol.replace(/USDT$/, ''), name: NAMES[call.symbol] ?? call.symbol, path, now: (call.at - call.close) / HOUR,
      out: grade.out!, y: grade.y!, retained: grade.retained!, held: grade.held!, housePoints: grade.points!, inRange: grade.inRange!, callHash: h.call!, gradeHash: h.grade!,
    });
  }
  return out;
}

/** A call the house has made in the round still in play: no outcome yet. */
export interface OpenBoard extends Call {
  ticker: string;
  name: string;
  /** hourly closes from the cash close to the latest closed hour */
  path: (number | null)[];
  now: number;
  callHash: string;
}

/** One contract's standing in the round still in play. */
export interface Standing { symbol: string; ticker: string; name: string; c0: number; s: number; last: number; m: number; called: boolean }

export interface Tonight {
  /** the latest closed hour on file */
  asOf: number;
  window: { id: string; kind: Call['kind']; close: number; bell: number; grade: number } | null;
  standings: Standing[];
  calls: OpenBoard[];
}
