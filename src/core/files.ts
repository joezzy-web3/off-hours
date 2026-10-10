// Reading the recorded candles from disk. Node only: never imported by the browser bundle.

import fs from 'node:fs';
import path from 'node:path';
import { Market, parseCsv } from './market';

import { STOCKS } from './board';

export { STOCKS };

/**
 * The stock contracts' hourly bars. `data/hourly` is the history recorded once
 * and never rewritten; `data/recent` holds the hours the scheduled agent has
 * appended since. The study reads the first only, so its figures cannot drift.
 */
export function loadMarket(root = process.env.DATA_DIR || 'data', withRecent = true): Market {
  const market: Market = {};
  for (const s of STOCKS) {
    const parts = [path.join(root, 'hourly', `${s}.csv`), ...(withRecent ? [path.join(root, 'recent', `${s}.csv`)] : [])].filter((f) => fs.existsSync(f));
    if (!parts.length) continue;
    market[s] = parseCsv(parts.map((f) => fs.readFileSync(f, 'utf8')).join('\n'));
  }
  if (!Object.keys(market).length) throw new Error(`no candles under ${root}`);
  return market;
}

export const readJson = <T>(file: string, fallback: T): T => { try { return JSON.parse(fs.readFileSync(file, 'utf8')) as T; } catch { return fallback; } };

/** Writes only when the content differs, so an unchanged record makes no new commit. */
export function writeIfChanged(file: string, text: string): boolean {
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === text) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return true;
}
