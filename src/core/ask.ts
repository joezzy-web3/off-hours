// "Ask the house": one typed line, answered from the same figures every screen
// uses. No model is involved in finding or computing an answer: the line is
// matched to a question the record can answer, the numbers come from the data,
// and the reply says what it understood so a wrong reading is visible.

import { Dealt, NAMES, Tonight } from './board';
import { Cost } from './book';
import { HOUR } from './calendar';
import { Summary } from './live';

export interface Context {
  now: number;
  summary: Summary & { study?: Study | null; model?: unknown };
  tonight: Tonight;
  boards: Dealt[];
  cost?: Cost | null;
}
export interface Study { events: number; windows: number; y: Iv; held: Iv; extended: Iv; coverage: Iv; points: Iv; timing: Iv }
interface Iv { mean: number; lo: number; hi: number }

export interface Reply {
  /** how the line was read, shown back to the asker */
  understood: string;
  /** which part of the record answered */
  tool: 'tonight' | 'base rate' | 'the house' | 'the bell' | 'cost' | 'timing' | 'help';
  lines: string[];
  /** every number in `lines`, so a rewording can be checked against them */
  figures: (string | number)[];
}

const ALIASES: Record<string, string[]> = {
  NVDA: ['nvda', 'nvidia'], TSLA: ['tsla', 'tesla'], AAPL: ['aapl', 'apple'], MSFT: ['msft', 'microsoft'], META: ['meta', 'facebook'], AMZN: ['amzn', 'amazon'],
  GOOGL: ['googl', 'google', 'alphabet'], MSTR: ['mstr', 'microstrategy', 'strategy'], COIN: ['coin', 'coinbase'], PLTR: ['pltr', 'palantir'], QQQ: ['qqq', 'nasdaq'], SPY: ['spy', 's&p', 'sp500', 's and p'],
};
const has = (q: string, ...words: string[]) => words.some((w) => new RegExp(`(^|[^a-z0-9&])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(q));
const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
const bps = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 1e4).toFixed(1)} basis points`;
const span = (ms: number) => { const h = Math.floor(ms / HOUR), m = Math.round((ms % HOUR) / 60000); return h >= 24 ? `${Math.floor(h / 24)} days ${h % 24} hours` : `${h} hours ${m} minutes`; };

export function answer(line: string, ctx: Context): Reply {
  const q = line.toLowerCase().trim();
  const ticker = Object.keys(ALIASES).find((t) => has(q, ...ALIASES[t]));
  const kind = has(q, 'weekend', 'holiday', 'saturday', 'sunday') ? 'weekend' : has(q, 'overnight', 'night') ? 'overnight' : undefined;
  const dir = has(q, 'down', 'fall', 'fell', 'drop', 'dump', 'sell-off', 'selloff', 'red') ? 'down' : has(q, 'up', 'rise', 'rose', 'rall', 'pump', 'jump', 'green', 'gain') ? 'up' : undefined;
  const scope = [ticker && `${ticker} (${NAMES[`${ticker}USDT`]})`, dir && `${dir} moves`, kind && (kind === 'weekend' ? 'over a weekend or holiday' : 'overnight')].filter(Boolean).join(', ');
  const figures: (string | number)[] = [];
  const say = (text: string, ...nums: (string | number)[]) => { figures.push(...nums); return text; };
  const w = ctx.tonight.window;

  if (has(q, 'cost', 'spread', 'depth', 'liquid', 'thin', 'slippage', 'book')) {
    const rows = (ctx.cost?.rows ?? []).filter((r) => !ticker || r.ticker === ticker).sort((a, b) => a.spreadBps - b.spreadBps);
    if (!rows.length) return { understood: `what it costs to trade ${ticker ?? 'right now'}`, tool: 'cost', figures, lines: ['No order-book snapshot is on file yet. The recorder writes one every hour.'] };
    return {
      understood: `what it costs to trade ${ticker ?? 'each contract'} at the latest snapshot`, tool: 'cost', figures,
      lines: rows.slice(0, ticker ? 1 : 5).map((r) => say(`${r.ticker}: spread ${r.spreadBps.toFixed(2)} basis points, ${r.depth25 === null ? 'depth not reached' : `${r.depth25.toLocaleString('en-US')} USDT within 25 basis points on the thinner side`}.`, r.spreadBps.toFixed(2), r.depth25 ?? '')),
    };
  }

  if (has(q, 'should i', 'sell now', 'buy now', 'wait', 'act now', 'better to')) {
    const s = ctx.summary.study;
    if (!s) return { understood: 'whether to act now or wait for the bell', tool: 'timing', figures, lines: ['The study has not been run on this copy of the record.'] };
    return {
      understood: 'whether acting at once beats waiting for the bell', tool: 'timing', figures,
      lines: [
        say(`On ${s.events.toLocaleString('en-US')} tested moves, the price after the call drifted ${bps(s.y.mean)} on average, with a margin from ${bps(s.y.lo)} to ${bps(s.y.hi)}. That margin includes zero.`, s.events.toLocaleString('en-US'), bps(s.y.mean), bps(s.y.lo), bps(s.y.hi)),
        'So no average difference between acting at once and waiting was detected. An average that size either way cannot be ruled out, and single outcomes vary far more than the average.',
        'Trading cost was not part of that test. The Tonight tab shows the spread and depth right now.',
        'This is a finding about the past, not advice about your order.',
      ],
    };
  }

  if (has(q, 'when', 'bell', 'how long', 'opens', 'open?', 'countdown')) {
    if (!w) return { understood: 'when the next bell rings', tool: 'the bell', figures, lines: ['New York is trading now. The next round opens at the close, 16:00 New York.'] };
    const left = w.bell - ctx.now;
    return { understood: 'when the bell rings', tool: 'the bell', figures, lines: [left > 0 ? say(`The bell rings in ${span(left)}. Calls are graded 90 minutes after it.`, span(left)) : 'The bell has rung on the last recorded round.'] };
  }

  if (has(q, 'how often', 'hold', 'fade', 'chance', 'odds', 'base rate', 'probab', 'likely', 'history', 'usually') || (ticker && has(q, 'record'))) {
    const set = ctx.boards.filter((b) => (!ticker || b.ticker === ticker) && (!kind || b.kind === kind) && (!dir || (dir === 'up') === b.m > 0));
    if (set.length < 10) return { understood: `how often such moves held: ${scope || 'all moves'}`, tool: 'base rate', figures, lines: [say(`Only ${set.length} nights on record match, which is too few to give a rate.`, set.length)] };
    const held = set.filter((b) => b.held).length / set.length, further = set.filter((b) => b.y > 0).length / set.length, inRange = set.filter((b) => b.inRange).length / set.length;
    return {
      understood: `how often such moves held: ${scope || 'all moves, all contracts'}`, tool: 'base rate', figures,
      lines: [
        say(`${set.length.toLocaleString('en-US')} nights on record match. ${pct(held)} of those moves still had at least half standing 90 minutes after the bell.`, set.length.toLocaleString('en-US'), pct(held)),
        say(`${pct(further)} went further after they were called, and ${pct(inRange)} ended inside the house's 80% range.`, pct(further), pct(inRange)),
        set.length < 100 ? 'Under 100 nights is a thin sample: treat the rate as rough.' : 'These count every night on record together, not only the part set aside for the formal test.',
      ],
    };
  }

  if (has(q, 'house', 'record', 'score', 'calibrat', 'accura', 'trust', 'proof', 'study', 'evidence', 'edge')) {
    const s = ctx.summary.study, h = ctx.summary.house;
    return {
      understood: 'how the house has done', tool: 'the house', figures,
      lines: [
        say(`The house has ${h.boards.toLocaleString('en-US')} graded forecasts. ${pct(h.coverage)} of prices ended inside the range it called 80%, and it averages ${h.points.toFixed(2)} points a call, where always saying 50% scores 0.`, h.boards.toLocaleString('en-US'), pct(h.coverage), h.points.toFixed(2)),
        ...(s ? [say(`On the test set fixed in advance (${s.events.toLocaleString('en-US')} moves): range coverage ${pct(s.coverage.mean)} with a margin from ${pct(s.coverage.lo)} to ${pct(s.coverage.hi)}.`, s.events.toLocaleString('en-US'), pct(s.coverage.mean), pct(s.coverage.lo), pct(s.coverage.hi))] : []),
        say(`Its record is ${ctx.summary.ledger.entries.toLocaleString('en-US')} hashed entries. The House tab re-checks every one in your browser.`, ctx.summary.ledger.entries.toLocaleString('en-US')),
      ],
    };
  }

  if (ticker || has(q, 'moved', 'movers', 'moving', 'tonight', 'since the close', 'right now', 'what happened', 'biggest', 'called')) {
    if (!w) return { understood: 'what has moved since the close', tool: 'tonight', figures, lines: ['New York is trading, so no round is in play. A round opens at the close.'] };
    const rows = [...ctx.tonight.standings].filter((r) => !ticker || r.ticker === ticker).sort((a, b) => Math.abs(b.m) / b.s - Math.abs(a.m) / a.s);
    const lines = rows.slice(0, ticker ? 1 : 4).map((r) => {
      const z = Math.abs(r.m) / r.s;
      return say(`${r.ticker} is ${r.m >= 0 ? 'up' : 'down'} ${pct(Math.abs(r.m), 2)} since the close, ${z.toFixed(2)} of a normal day's move. ${r.called ? 'The house has called it.' : `The house calls at ${ctx.summary.threshold}.`}`, pct(Math.abs(r.m), 2), z.toFixed(2), ctx.summary.threshold);
    });
    const called = ctx.tonight.calls.length;
    return { understood: ticker ? `where ${ticker} stands in the round in play` : 'what has moved most since the New York close', tool: 'tonight', figures, lines: [...lines, say(`${called} ${called === 1 ? 'contract has' : 'contracts have'} been called this round.`, called)] };
  }

  return {
    understood: 'nothing I can answer from the record', tool: 'help', figures,
    lines: ['Try one of these:', '"what moved since the close?"', '"how often do NVDA drops hold over a weekend?"', '"should I sell now or wait for the bell?"', '"what does it cost to trade TSLA?"', '"how has the house done?"', '"when does the bell ring?"'],
  };
}

/** True when a rewording uses no number that the answer did not contain. */
export function sameNumbers(reworded: string, reply: Reply): boolean {
  const allowed = new Set((reply.lines.join(' ').match(/\d[\d,]*\.?\d*/g) ?? []).map((n) => n.replace(/,/g, '')));
  return (reworded.match(/\d[\d,]*\.?\d*/g) ?? []).every((n) => allowed.has(n.replace(/,/g, '').replace(/\.$/, '')));
}
