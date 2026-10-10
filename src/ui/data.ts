// Everything the screens show comes from the files the scheduled agent
// publishes. The page asks GitHub for the newest copy and falls back to the
// copy it was built with, so it always opens, and says which one it is showing.

import { useSyncExternalStore } from 'react';
import type { Context, Study } from '../core/ask';
import { NAMES } from '../core/board';
import type { Dealt, Tonight } from '../core/board';
import type { Cost } from '../core/book';
import type { Entry } from '../core/ledger';
import type { Summary } from '../core/live';
import type { MonthRow } from '../core/study';
import { FEED } from './config';

export interface Iv { mean: number; lo: number; hi: number; n: number; windows: number }
export interface Claims {
  claim1: { y: Iv; extended: Iv; held: Iv; medianRetained: number; quiet?: Iv; difference?: Iv };
  claim2: { events: number; noForecast: number; coverage: Iv; points: Iv; brier: number; bands: { band: string; n: number; said: number; held: number }[]; width: Iv; baselineWidth: Iv; baselineCoverage: Iv; pinballDifference: Iv };
  claim3: { events: number; plans: { now: number; split: number; bell: number }; vsSplit: Iv; vsNow: Iv; vsBell: Iv };
}
export interface StudyFile extends Claims {
  updatedAt: number; from: number; through: number; events: number; windows: number; months: MonthRow[];
  fixed: (Claims & { events: number; windows: number; breakdowns: { group: string; name: string; plain: Iv; adjusted: Iv; extended: number }[]; breakdownCount: number; baseRate?: { events: number; lowestForecast: number; houseHit: number; alwaysHoldsHit: number; housePoints: Iv; runningPoints: Iv; difference: Iv } | null }) | null;
}
export interface Full extends Summary { model: { name: string | null; calls: number; graded: number; points: number; pending: number }; study: (Study & { testEnd: number }) | null }

export interface Data {
  summary?: Full; tonight?: Tonight; cost?: Cost; model?: Entry[]; study?: StudyFile;
  boards?: Dealt[]; byId?: Map<string, Dealt>;
  /** "live" when the newest files came from GitHub, "snapshot" when the page fell back to its own copy */
  source?: 'live' | 'snapshot';
  failed?: string;
}

let state: Data = {};
const listeners = new Set<() => void>();
const set = (patch: Partial<Data>) => { state = { ...state, ...patch }; listeners.forEach((f) => f()); };
export const useData = (): Data => useSyncExternalStore((f) => { listeners.add(f); return () => listeners.delete(f); }, () => state);

async function json<T>(url: string, ms: number): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(ms) });
  if (!res.ok) throw new Error(`${res.status}`);
  return (await res.json()) as T;
}
let useSnapshot = false;
/** One published file: the newest from GitHub, or the copy this page was built with. */
export async function file<T>(name: string): Promise<T> {
  if (!useSnapshot) {
    try { return await json<T>(`${FEED}/${name}`, 8000); } catch { useSnapshot = true; }
  }
  return json<T>(`live/${name}`, 20_000);
}

async function small() {
  const [summary, tonight, cost, model, study] = await Promise.all([file<Full>('summary.json'), file<Tonight>('tonight.json'), file<Cost>('cost.json'), file<Entry[]>('model.json'), file<StudyFile>('study.json')]);
  set({ summary, tonight, cost, model, study, source: useSnapshot ? 'snapshot' : 'live' });
}

let started = false;
export function boot() {
  if (started) return;
  started = true;
  small()
    .then(async () => {
      const [replay, live] = await Promise.all([file<Dealt[]>('boards.json'), file<Dealt[]>('boards-live.json')]);
      const boards = [...replay, ...live.map((b) => ({ ...b, live: true }))];
      set({ boards, byId: new Map(boards.map((b) => [b.id, b])) });
    })
    .catch((e: Error) => set({ failed: `The record could not be loaded (${e.message}). Check your connection and reload.` }));
  // the round in play changes every hour; keep it fresh while the page is open
  setInterval(() => { small().catch(() => undefined); }, 5 * 60_000);
}

export const nameOf = (ticker: string) => NAMES[`${ticker}USDT`] ?? ticker;
export const isLive = (b: Dealt) => Boolean((b as Dealt & { live?: boolean }).live);
export const context = (d: Data): Context | null => (d.summary && d.tonight && d.boards ? { now: Date.now(), summary: d.summary, tonight: d.tonight, boards: d.boards, cost: d.cost } : null);

/** A call to this site's own server. Null when there is none, as in a static preview. */
export async function api<T>(route: string, body?: unknown): Promise<T | null> {
  try {
    const res = await fetch(`api/${route}`, body === undefined ? { signal: AbortSignal.timeout(15_000) } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000) });
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('json')) return null;
    return (await res.json()) as T;
  } catch { return null; }
}
