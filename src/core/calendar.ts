// The New York cash session, in UTC. Everything the engine calls "closed" or
// "the bell" comes from here. Rules: research/PREREGISTRATION.md, "Definitions".

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

/** NYSE full-day closures. */
const HOLIDAYS = new Set([
  '2025-09-01', '2025-11-27', '2025-12-25',
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
  '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24',
]);
/** Sessions that close at 13:00 New York time. Windows touching them are left out. */
const EARLY_CLOSE = new Set(['2025-11-28', '2025-12-24', '2026-11-27', '2026-12-24', '2027-11-26']);
/** 2025 is covered from August only: the first contract listed on 19 August 2025. */
const COVERED = [2025, 2026, 2027];

export const iso = (day: number) => new Date(day).toISOString().slice(0, 10);
export const dayOf = (t: number) => Math.floor(t / DAY) * DAY;

/** n-th Sunday of a month, as UTC midnight. */
function nthSunday(year: number, month: number, n: number): number {
  const first = Date.UTC(year, month, 1);
  const offset = (7 - new Date(first).getUTCDay()) % 7;
  return first + (offset + 7 * (n - 1)) * DAY;
}

/** US daylight time runs from the second Sunday of March to the first Sunday of November. */
export function isDaylight(day: number): boolean {
  const y = new Date(day).getUTCFullYear();
  return day >= nthSunday(y, 2, 2) && day < nthSunday(y, 10, 1);
}

export function isTradingDay(day: number): boolean {
  const d = new Date(day);
  if (!COVERED.includes(d.getUTCFullYear())) throw new Error(`calendar does not cover ${iso(day)}`);
  const wd = d.getUTCDay();
  return wd !== 0 && wd !== 6 && !HOLIDAYS.has(iso(day));
}

export const isEarlyClose = (day: number) => EARLY_CLOSE.has(iso(day));
/** 09:30 New York. */
export const openOf = (day: number) => day + (isDaylight(day) ? 13 * HOUR + 30 * MIN : 14 * HOUR + 30 * MIN);
/** 16:00 New York, or 13:00 on an early close. */
export const closeOf = (day: number) => day + (isDaylight(day) ? 20 : 21) * HOUR - (isEarlyClose(day) ? 3 * HOUR : 0);

export function tradingDays(from: number, to: number): number[] {
  const out: number[] = [];
  for (let d = dayOf(from); d <= to; d += DAY) if (isTradingDay(d)) out.push(d);
  return out;
}

export type Kind = 'overnight' | 'weekend';

/** One stretch with the cash market shut: from the close of `d` to the open of `n`. */
export interface Window {
  id: string;
  d: number;
  n: number;
  kind: Kind;
  /** cash close of d */
  close: number;
  /** cash open of n: the bell */
  bell: number;
  /** when calls are graded: 90 minutes after the bell */
  grade: number;
  /** hours at which a call may be made: one hour after the close up to 90 minutes before the bell */
  decisions: number[];
}

/** Every closed window whose close falls in [from, to]. Windows touching an early-close session are left out. */
export function windows(from: number, to: number): Window[] {
  const days = tradingDays(from - 6 * DAY, to + 6 * DAY);
  const out: Window[] = [];
  for (let i = 0; i + 1 < days.length; i++) {
    const d = days[i], n = days[i + 1];
    const close = closeOf(d), bell = openOf(n);
    if (close < from || close > to || isEarlyClose(d) || isEarlyClose(n)) continue;
    const decisions: number[] = [];
    for (let t = close + HOUR; t <= bell - 90 * MIN; t += HOUR) decisions.push(t);
    out.push({ id: iso(d), d, n, kind: n - d === DAY ? 'overnight' : 'weekend', close, bell, grade: bell + 90 * MIN, decisions });
  }
  return out;
}

/** True while the New York cash session is trading. */
export function isCashOpen(t: number): boolean {
  const d = dayOf(t);
  return isTradingDay(d) && t >= openOf(d) && t < closeOf(d);
}
