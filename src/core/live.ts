// Turns the house's state into the files the site reads. Pure: no disk, no
// network, so the same function serves the scheduled agent and the tests.

import { Call, Grade, State } from './agent';
import { Dealt, NAMES, OpenBoard, Standing, Tonight } from './board';
import { HOUR, windows } from './calendar';
import { Entry } from './ledger';
import { Market, view } from './market';
import { scale } from './rules';

/**
 * Which calls were live. A call is live when a scheduled run saw it before its
 * outcome existed; everything already graded the first time it was seen is
 * replay. `frozen` is how many ledger entries are replay: they never change.
 */
export interface Seen { started: number; frozen: number; live: Record<string, number> }

export function markSeen(seen: Seen | null, state: State, now: number): Seen {
  const out: Seen = seen ? { ...seen, live: { ...seen.live } } : { started: now, frozen: -1, live: {} };
  for (const c of state.open) if (!(c.id in out.live) && now < c.gradeAt) out.live[c.id] = now;
  if (out.frozen < 0) {
    const first = state.ledger.findIndex((e) => (e.body as { id: string }).id in out.live);
    // nothing live yet: the boundary is set the first time something is
    out.frozen = first === -1 ? (Object.keys(out.live).length ? state.ledger.length : -1) : first;
  }
  return out;
}

const round = (x: number, d = 6) => +x.toFixed(d);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export interface Tally { boards: number; coverage: number; held: number; points: number }
export const tally = (list: Dealt[]): Tally => ({
  boards: list.length, coverage: round(mean(list.map((b) => (b.inRange ? 1 : 0))), 4), held: round(mean(list.map((b) => (b.held ? 1 : 0))), 4), points: round(mean(list.map((b) => b.housePoints)), 3),
});

export interface Summary {
  name: string; updatedAt: number; asOf: number; source: string; from: number; contracts: string[];
  threshold: number; minPrior: number; calls: number; graded: number; windows: number;
  house: Tally; replay: Tally; live: Tally & { since: number | null; open: number };
  ledger: { entries: number; frozen: number; tail: string | null };
}

export interface LiveFiles {
  summary: Summary;
  tonight: Tonight;
  boards: Dealt[];
  boardsLive: Dealt[];
  record: Entry[];
  recordLive: Entry[];
  /** what the league needs to grade a call without loading every board */
  league: { updatedAt: number; open: { id: string; ticker: string; bell: number; gradeAt: number }[]; graded: Record<string, { held: boolean; house: number | null }> };
}

function dealt(market: Market, call: Call, grade: Grade, hash: string): Dealt {
  const path: (number | null)[] = [];
  for (let t = call.close; t <= call.gradeAt; t += HOUR) path.push(market[call.symbol].get(t - HOUR)?.c ?? null);
  const f = call.forecast!;
  return {
    id: call.id, ticker: call.symbol.replace(/USDT$/, ''), kind: call.kind, at: call.at, close: call.close, bell: call.bell, gradeAt: call.gradeAt,
    c0: call.c0, s: round(call.s), m: round(call.m), price: call.price, path, now: (call.at - call.close) / HOUR,
    forecast: { cls: f.cls, n: f.n, pHold: round(f.pHold, 4), q: round(f.q, 4), lo: round(f.lo, 2), hi: round(f.hi, 2), plan: f.plan },
    out: grade.out!, y: round(grade.y!), retained: round(grade.retained!, 4), held: grade.held!, housePoints: round(grade.points!, 3), inRange: grade.inRange!, callHash: hash.slice(0, 16),
  };
}

export function buildLive(market: Market, state: State, seen: Seen, now: number, meta: { source: string; threshold: number; minPrior: number }): LiveFiles {
  const symbols = Object.keys(market);
  const last = state.cursor;
  const hashOf = new Map(state.ledger.filter((e) => e.kind === 'call').map((e) => [(e.body as { id: string }).id, e.hash]));
  const isLive = (id: string) => id in seen.live;

  const boards: Dealt[] = [], boardsLive: Dealt[] = [];
  const graded: LiveFiles['league']['graded'] = {};
  for (const { call, grade } of state.graded) {
    if (isLive(call.id) && !grade.void) graded[call.id] = { held: grade.held!, house: grade.points ?? null };
    if (grade.void || !call.forecast) continue;
    (isLive(call.id) ? boardsLive : boards).push(dealt(market, call, grade, hashOf.get(call.id)!));
  }

  // the round in play at the latest closed hour, if the cash market is shut
  const v = view(market, last);
  const w = windows(last - 6 * 24 * HOUR, last).filter((x) => x.close <= last && last < x.grade).at(-1) ?? null;
  const tonight: Tonight = { asOf: last, window: w && { id: w.id, kind: w.kind, close: w.close, bell: w.bell, grade: w.grade }, standings: [], calls: [] };
  if (w) {
    for (const symbol of symbols) {
      const c0 = v.closeAt(symbol, w.close), price = v.closeAt(symbol, last), s = scale(view(market, w.close), symbol, w.d);
      if (c0 === undefined || price === undefined || s === undefined) continue;
      const row: Standing = { symbol, ticker: symbol.replace(/USDT$/, ''), name: NAMES[symbol] ?? symbol, c0, s: round(s), last: price, m: round(price / c0 - 1), called: state.open.some((c) => c.id === `${w.id}:${symbol}`) };
      tonight.standings.push(row);
    }
    for (const call of state.open.filter((c) => c.window === w.id)) {
      const path: (number | null)[] = [];
      for (let t = call.close; t <= last; t += HOUR) path.push(market[call.symbol].get(t - HOUR)?.c ?? null);
      const board: OpenBoard = { ...call, s: round(call.s), m: round(call.m), ticker: call.symbol.replace(/USDT$/, ''), name: NAMES[call.symbol] ?? call.symbol, path, now: (call.at - call.close) / HOUR, callHash: hashOf.get(call.id)! };
      tonight.calls.push(board);
    }
  }

  const frozen = seen.frozen < 0 ? state.ledger.length : seen.frozen;
  const first = Math.min(...symbols.map((s) => Math.min(...market[s].keys())));
  const everything = [...boards, ...boardsLive];
  return {
    summary: {
      name: 'Bellwether', updatedAt: now, asOf: last, source: meta.source, from: first, contracts: symbols.map((s) => s.replace(/USDT$/, '')),
      threshold: meta.threshold, minPrior: meta.minPrior,
      calls: state.graded.length + state.open.length, graded: state.graded.filter((g) => !g.grade.void).length, windows: new Set(state.graded.map((g) => g.call.window)).size,
      house: tally(everything), replay: tally(boards), live: { ...tally(boardsLive), since: Object.keys(seen.live).length ? seen.started : null, open: state.open.filter((c) => isLive(c.id)).length },
      ledger: { entries: state.ledger.length, frozen, tail: state.ledger.at(-1)?.hash ?? null },
    },
    tonight, boards, boardsLive,
    record: state.ledger.slice(0, frozen), recordLive: state.ledger.slice(frozen),
    league: { updatedAt: now, open: state.open.map((c) => ({ id: c.id, ticker: c.symbol.replace(/USDT$/, ''), bell: c.bell, gradeAt: c.gradeAt })), graded },
  };
}
