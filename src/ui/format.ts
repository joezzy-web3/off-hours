import { dayOf, HOUR, isDaylight } from '../core/calendar';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A UTC instant as New York wall-clock parts. */
function ny(t: number) {
  const d = new Date(t - (isDaylight(dayOf(t)) ? 4 : 5) * HOUR);
  return { day: DAYS[d.getUTCDay()], date: d.getUTCDate(), month: MONTHS[d.getUTCMonth()], hh: String(d.getUTCHours()).padStart(2, '0'), mm: String(d.getUTCMinutes()).padStart(2, '0') };
}
export const nyTime = (t: number) => { const x = ny(t); return `${x.hh}:${x.mm}`; };
export const nyDay = (t: number) => { const x = ny(t); return `${x.day} ${x.date} ${x.month}`; };
export const pct = (x: number, d = 2) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x * 100).toFixed(d)}%`;
export const px = (x: number) => x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const signed = (x: number, d = 0) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(d)}`;
export const bps = (x: number) => `${signed(x * 1e4, 0)} bps`;
export function span(ms: number): string {
  const h = Math.floor(ms / HOUR), m = Math.round((ms % HOUR) / 60000);
  return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : m ? `${h}h ${m}m` : `${h}h`;
}
