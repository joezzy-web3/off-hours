import { points } from '../core/rules';
import { signed } from './format';
import mark from './mark.svg';

/** The Bellwether mark: a bell with the night's move drawn on it, and the price that has to hold as its clapper. */
export function Mark({ size = 30 }: { size?: number }) {
  return <span className="logo" style={{ width: size, height: size }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: mark }} />;
}

export function Bell() {
  return (
    <svg className="bell" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.5a1.6 1.6 0 0 1 1.6 1.6v.5a6.4 6.4 0 0 1 4.8 6.2v3.6l1.9 3.1a.9.9 0 0 1-.8 1.4H4.5a.9.9 0 0 1-.8-1.4l1.9-3.1v-3.6a6.4 6.4 0 0 1 4.8-6.2v-.5A1.6 1.6 0 0 1 12 2.5Z" fill="currentColor" />
      <circle cx="12" cy="21" r="1.8" fill="currentColor" />
    </svg>
  );
}

export function Loading({ what }: { what: string }) {
  return <main className="page page-narrow"><p className="empty glass" role="status">Loading {what}…</p></main>;
}

/** The slider every call is made with, and what the call is worth either way. */
export function Chance({ id, value, onChange }: { id: string; value: number; onChange: (v: number) => void }) {
  return (
    <>
      <div className="slider">
        <span>Fades</span>
        <input id={id} type="range" min="0" max="100" step="5" value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label="Your chance that the move holds, in percent" />
        <span>Holds</span>
      </div>
      <p className="stake"><b>{value}%</b> it holds. <span>If it holds <b className="good">{signed(points(value / 100, true))}</b></span> <span>If it fades <b className="bad">{signed(points(value / 100, false))}</b></span></p>
    </>
  );
}

export const PLANS: [number, string, string][] = [[1, 'now', 'All now'], [0.5, 'split', 'Half and half'], [0, 'bell', 'Wait for the bell']];
export const planName = (f: number) => PLANS.find((x) => x[0] === f)![2].toLowerCase();

export function Plans({ value, onChange, name = 'plan' }: { value: number; onChange: (v: number) => void; name?: string }) {
  return (
    <div className="plans" role="radiogroup" aria-label="When to trade">
      {PLANS.map(([v, key, label]) => (
        <label key={key} className={value === v ? 'is-on' : ''}>
          <input type="radio" name={name} id={`${name}-${key}`} checked={value === v} onChange={() => onChange(v)} /> {label}
        </label>
      ))}
    </div>
  );
}

/**
 * An estimate with its margin, drawn to scale: the bar is the 95% interval, the
 * dot the estimate, and the tall line the value it is being tested against.
 */
export function Interval({ lo, hi, mean, min, max, mark, label }: { lo: number; hi: number; mean: number; min: number; max: number; mark: number; label: string }) {
  const x = (v: number) => `${Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100))}%`;
  return (
    <span className="interval" role="img" aria-label={label} title={label}>
      <u style={{ left: x(mark) }} />
      <i style={{ left: x(lo), width: `calc(${x(hi)} - ${x(lo)})` }} />
      <b style={{ left: x(mean) }} />
    </span>
  );
}

/** Copies text, and says so; falls back to telling the reader to select it. */
export async function copy(text: string): Promise<string> {
  try { await navigator.clipboard.writeText(text); return 'Copied'; } catch { return 'Select the text and copy it'; }
}
