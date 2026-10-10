import { useEffect, useRef, useState } from 'react';
import { HOUR } from '../core/calendar';
import type { Forecast } from '../core/rules';
import { nyTime, px } from './format';

const L = 12, R = 12, T = 26, B = 34;

export interface Charted {
  close: number; bell: number; gradeAt: number; at: number;
  c0: number; m: number; price: number;
  path: (number | null)[];
  now: number;
  forecast: Forecast | null;
  out?: number;
  held?: boolean;
}

/**
 * The night on one chart: the close, the move so far, and the stretch still to
 * come. While the ending is hidden the vertical scale is set from what is
 * already known, so the axis cannot give the ending away.
 *   show = fog    the player has not called yet
 *          house  the house's range is on, the ending is not
 *          run    the ending is being drawn
 *          done   everything
 */
export function Chart({ board, show }: { board: Charted; show: 'fog' | 'house' | 'run' | 'done' }) {
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setW(Math.max(280, Math.min(780, Math.round(el.clientWidth))));
    fit();
    if (typeof ResizeObserver !== 'function') return;
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = W < 480 ? 250 : 300;
  const n = Math.round((board.gradeAt - board.close) / HOUR);
  const ended = board.out !== undefined;
  const revealed = show !== 'fog';
  // a replayed board hides everything after the call; a live board shows every hour that has closed
  const known = ended ? board.now : board.path.length - 1;
  const bellIdx = (board.bell - board.close) / HOUR;
  const half = board.c0 * (1 + 0.5 * board.m);
  const f = board.forecast;
  const visible = board.path.slice(0, (revealed && ended ? n : known) + 1).filter((v): v is number => v !== null);
  if (revealed && f) visible.push(f.lo, f.hi);
  const reach = Math.max(Math.abs(board.m) * 2.4 * board.c0, 0.012 * board.c0, ...visible.map((v) => Math.abs(v - board.c0) * 1.12));
  const x = (i: number) => L + (i / n) * (W - L - R);
  const y = (v: number) => T + ((board.c0 + reach - v) / (2 * reach)) * (H - T - B);
  const line = (from: number, to: number) => {
    let d = '', pen = false;
    for (let i = from; i <= to; i++) {
      const v = board.path[i];
      if (v === null || v === undefined) { pen = false; continue; }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
      pen = true;
    }
    return d;
  };
  const up = board.m > 0;
  const zoneTop = up ? T : y(half), zoneH = up ? y(half) - T : H - B - y(half);
  const nowX = Math.min(Math.max(x(board.now), L + 56), W - R - 52);
  const fogFrom = revealed && ended ? n : known;
  return (
    <div ref={box} className="chart-box">
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Price from the New York close to the grading hour">
        <defs>
          <pattern id="fog" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="var(--fog)" /><rect width="2" height="8" fill="var(--fog-line)" /></pattern>
        </defs>
        <rect x={L} y={zoneTop} width={W - L - R} height={zoneH} fill="var(--zone)" />
        <text x={L + 4} y={up ? T + 14 : H - B - 7} className="chart-zone">holds if it ends in this band</text>
        {fogFrom < n && <rect x={x(fogFrom)} y={T} width={x(n) - x(fogFrom)} height={H - T - B} fill="url(#fog)" />}
        <line x1={L} x2={W - R} y1={y(board.c0)} y2={y(board.c0)} className="chart-close" />
        <text x={L + 4} y={y(board.c0) + (up ? 13 : -5)} className="chart-label">close {px(board.c0)}</text>
        <line x1={L} x2={W - R} y1={y(half)} y2={y(half)} className="chart-half" />
        <text x={L + 4} y={y(half) + (up ? -5 : 13)} className="chart-label">half the move {px(half)}</text>
        <line x1={x(0)} x2={x(0)} y1={T} y2={H - B} className="chart-mark" />
        <line x1={x(board.now)} x2={x(board.now)} y1={T} y2={H - B} className="chart-mark chart-mark-now" />
        <line x1={x(bellIdx)} x2={x(bellIdx)} y1={T - 6} y2={H - B} className="chart-mark chart-mark-bell" />
        <line x1={x(n)} x2={x(n)} y1={T} y2={H - B} className="chart-mark" />
        <text x={x(bellIdx) - 6} y={T - 9} textAnchor="end" className="chart-tick">bell <tspan className="chart-time">{nyTime(board.bell)}</tspan></text>
        <text x={L} y={H - B + 14} className="chart-tick">close</text>
        <text x={L} y={H - B + 27} className="chart-time">{nyTime(board.close)}</text>
        <text x={nowX} y={H - B + 14} textAnchor="middle" className="chart-tick">{ended ? 'now' : 'called'}</text>
        <text x={nowX} y={H - B + 27} textAnchor="middle" className="chart-time">{nyTime(board.at)}</text>
        <text x={W - R} y={H - B + 14} textAnchor="end" className="chart-tick">+90m</text>
        <text x={W - R} y={H - B + 27} textAnchor="end" className="chart-time">{nyTime(board.gradeAt)}</text>
        <path d={line(0, known)} className="chart-path" fill="none" />
        {revealed && f && (
          <g className="chart-range">
            <line x1={x(n)} x2={x(n)} y1={y(f.hi)} y2={y(f.lo)} />
            <line x1={x(n) - 7} x2={x(n) + 7} y1={y(f.hi)} y2={y(f.hi)} />
            <line x1={x(n) - 7} x2={x(n) + 7} y1={y(f.lo)} y2={y(f.lo)} />
          </g>
        )}
        {revealed && ended && <path d={line(board.now, n)} pathLength={1} className="chart-after" fill="none" />}
        <circle cx={x(board.now)} cy={y(board.price)} r="5" className="chart-now" />
        <text x={x(board.now) - 9} y={y(board.price) + (up ? -10 : 18)} textAnchor="end" className="chart-price">{px(board.price)}</text>
        {show === 'done' && ended && (
          <g>
            <circle cx={x(n)} cy={y(board.out!)} r="6" className={board.held ? 'chart-end is-held' : 'chart-end is-faded'} />
            <text x={x(n) - 11} y={y(board.out!) + 4} textAnchor="end" className="chart-price">{px(board.out!)}</text>
          </g>
        )}
        {fogFrom < n && x(n) - x(fogFrom) > 44 && <text x={(x(fogFrom) + x(n)) / 2} y={(T + H - B) / 2 + 14} textAnchor="middle" className="chart-unknown">?</text>}
      </svg>
    </div>
  );
}
