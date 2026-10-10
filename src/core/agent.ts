// The house. One loop, used both to replay history and to run live: walk
// forward an hour at a time, and at each hour (1) grade the calls whose bell
// has rung and (2) look for new moves and call them.
//
// At hour t the loop holds a View fixed at t, so it cannot read a bar that had
// not closed. tests/core.test.ts proves it: change any later bar and every
// earlier ledger entry keeps its hash.

import { HOUR, Kind, Window, windows } from './calendar';
import { append, Entry } from './ledger';
import { Market, view } from './market';
import { Forecast, forecast, MIN_PRIOR, outcome, Outcome, Past, points, scale, Size, sizeOf, THRESHOLD, timing } from './rules';

export interface Call {
  id: string;
  window: string;
  symbol: string;
  kind: Kind;
  /** when the move was called */
  at: number;
  close: number;
  bell: number;
  gradeAt: number;
  /** price at the cash close */
  c0: number;
  /** the contract's scale: one normal day's move */
  s: number;
  /** move since the close at the moment of the call */
  m: number;
  /** price at the moment of the call */
  price: number;
  size: Size;
  forecast: Forecast | null;
}

export interface Grade extends Partial<Outcome> {
  id: string;
  /** the price bar needed to grade was missing */
  void: boolean;
  /** the house's points for its hold forecast */
  points?: number;
  inRange?: boolean;
  /** the house plan's timing gain over half and half */
  timing?: number;
}

/** A window in which a contract never reached the threshold: the study's baseline. */
export interface Quiet { window: string; symbol: string; kind: Kind; gradeAt: number; s: number; m: number; y: number }

export interface State {
  /** last hour processed */
  cursor: number;
  open: Call[];
  prior: Past[];
  ledger: Entry[];
  /** contracts already called in the windows still in play, as "window:symbol" */
  called: string[];
  graded: { call: Call; grade: Grade }[];
  quiet: Quiet[];
}

export interface Config {
  symbols: string[];
  /** a move counts at this many times the contract's scale */
  threshold?: number;
  /** or, when set, at this flat move whatever the scale (used only by the study's breakdowns) */
  flat?: number;
  minPrior?: number;
}

export const start = (cursor: number): State => ({ cursor: Math.floor(cursor / HOUR) * HOUR, open: [], prior: [], ledger: [], called: [], graded: [], quiet: [] });

/** Advance the house to `now`. Deterministic: the same market and state give the same ledger. */
export function tick(market: Market, state: State, now: number, cfg: Config): State {
  const threshold = cfg.threshold ?? THRESHOLD, minPrior = cfg.minPrior ?? MIN_PRIOR;
  const end = Math.floor(now / HOUR) * HOUR;
  if (end <= state.cursor) return state;
  const wins = windows(state.cursor - 6 * 24 * HOUR, end);
  const decideAt = new Map<number, Window>(), gradeAt = new Map<number, Window>();
  for (const w of wins) { for (const t of w.decisions) decideAt.set(t, w); gradeAt.set(w.grade, w); }
  const called = new Set(state.called);
  const scales = new Map<string, number | undefined>();

  for (let t = state.cursor + HOUR; t <= end; t += HOUR) {
    const v = view(market, t);

    // 1. the bell has rung: grade what was called, and note the quiet contracts
    const due = state.open.filter((c) => c.gradeAt <= t);
    if (due.length) {
      state.open = state.open.filter((c) => c.gradeAt > t);
      for (const call of due) {
        const out = v.closeAt(call.symbol, call.gradeAt);
        let grade: Grade;
        if (out === undefined) grade = { id: call.id, void: true };
        else {
          const o = outcome(call.c0, call.m, call.price, out);
          grade = { id: call.id, void: false, ...o };
          if (call.forecast) {
            grade.points = points(call.forecast.pHold, o.held);
            grade.inRange = out >= call.forecast.lo && out <= call.forecast.hi;
            grade.timing = timing(call.forecast.plan, o.y).vsSplit;
          }
          state.prior.push({ window: call.window, kind: call.kind, size: call.size, s: call.s, y: o.y, held: o.held });
        }
        append(state.ledger, t, 'grade', grade);
        state.graded.push({ call, grade });
      }
    }
    const gw = gradeAt.get(t);
    if (gw) {
      const lastDecision = gw.decisions[gw.decisions.length - 1];
      for (const symbol of cfg.symbols) {
        const key = `${gw.id}:${symbol}`;
        if (called.has(key)) { called.delete(key); continue; }
        const c0 = v.closeAt(symbol, gw.close), p = v.closeAt(symbol, lastDecision), out = v.closeAt(symbol, gw.grade);
        const s = scale(view(market, gw.close), symbol, gw.d);
        if (c0 === undefined || p === undefined || out === undefined || s === undefined) continue;
        const m = p / c0 - 1;
        state.quiet.push({ window: gw.id, symbol, kind: gw.kind, gradeAt: gw.grade, s, m, y: Math.sign(m) * (out / p - 1) });
      }
    }

    // 2. the market is shut: call any contract whose move has just reached the threshold
    const w = decideAt.get(t);
    if (w) {
      for (const symbol of cfg.symbols) {
        const key = `${w.id}:${symbol}`;
        if (called.has(key)) continue;
        if (!scales.has(key)) scales.set(key, scale(view(market, w.close), symbol, w.d));
        const s = scales.get(key);
        const c0 = v.closeAt(symbol, w.close), price = v.closeAt(symbol, t);
        if (s === undefined || c0 === undefined || price === undefined) continue;
        const m = price / c0 - 1;
        if (Math.abs(m) < (cfg.flat ?? threshold * s)) continue;
        const call: Call = { id: key, window: w.id, symbol, kind: w.kind, at: t, close: w.close, bell: w.bell, gradeAt: w.grade, c0, s, m, price, size: sizeOf(m, s), forecast: forecast(state.prior, w.kind, m, s, price, minPrior) };
        append(state.ledger, t, 'call', call);
        state.open.push(call);
        called.add(key);
      }
    }
    state.cursor = t;
  }
  state.called = [...called];
  return state;
}
