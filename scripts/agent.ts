// THE HOUSE, UNATTENDED. Run every hour by .github/workflows/agent.yml:
//
//   node scripts/fetch-recent.mjs      append the hours that have closed
//   node scripts/record-book.mjs       note what it costs to trade right now
//   tsx scripts/agent.ts               replay the house to this hour and publish live/
//
// The house is deterministic, so each run replays it from the first candle and
// then checks one thing before publishing: the record it published last time
// must still be an exact prefix of the record it has just rebuilt. If Bitget
// ever revised an old candle, or anyone edited a file, that check fails and
// nothing is written.

import fs from 'node:fs';
import path from 'node:path';
import { start, tick } from '../src/core/agent';
import { BookRow, costPanel } from '../src/core/book';
import { loadMarket, readJson, writeIfChanged } from '../src/core/files';
import { append, Entry, firstBreak } from '../src/core/ledger';
import { buildLive, markSeen, Seen } from '../src/core/live';
import { span } from '../src/core/market';
import { ask, Chat, chat, modelName } from '../src/core/model';
import { MIN_PRIOR, points, THRESHOLD, timing } from '../src/core/rules';
import { byMonth, claim1, claim2, claim3, rows as studyRows, TEST_END } from '../src/core/study';

export interface ModelBody { id: string; model: string; p: number; reason: string }

export async function run(opts: { now?: number; data?: string; live?: string; research?: string; via?: Chat; model?: string | null } = {}) {
  const now = opts.now ?? Date.now();
  const dir = opts.live ?? 'live', research = opts.research ?? 'research';
  const market = loadMarket(opts.data);
  const symbols = Object.keys(market);
  const { first, last } = span(market);
  const state = tick(market, start(first), Math.min(last, now), { symbols });
  if (firstBreak(state.ledger) !== -1) throw new Error('the rebuilt record does not verify');

  const published = [...readJson<Entry[]>(path.join(dir, 'record.json'), []), ...readJson<Entry[]>(path.join(dir, 'record-live.json'), [])];
  if (published.length && (state.ledger.length < published.length || state.ledger[published.length - 1].hash !== published[published.length - 1].hash)) {
    throw new Error(`the recorded candles no longer reproduce the published record (entry ${published.length - 1}); nothing was written`);
  }

  const seen = markSeen(readJson<Seen | null>(path.join(dir, 'seen.json'), null), state, now);
  const files = buildLive(market, state, seen, now, { source: 'Bitget USDT-FUTURES hourly candles, public market API', threshold: THRESHOLD, minPrior: MIN_PRIOR });

  // the language-model player: one sealed call per open board, made before the bell
  const chain = readJson<Entry[]>(path.join(dir, 'model.json'), []);
  const name = opts.model === undefined ? modelName() : opts.model;
  if (name) {
    for (const call of files.tonight.calls) {
      if (now >= call.bell || chain.some((e) => (e.body as ModelBody).id === call.id)) continue;
      const answer = await ask(call, now, opts.via ?? chat);
      if (answer) append(chain, now, 'call', { id: call.id, model: name, p: answer.p, reason: answer.reason } satisfies ModelBody);
    }
  }
  if (firstBreak(chain) !== -1) throw new Error('the model player\'s record does not verify');
  const outcome = new Map(state.graded.filter((g) => !g.grade.void).map((g) => [g.call.id, g.grade.held!]));
  const modelGraded = chain.map((e) => e.body as ModelBody).filter((b) => outcome.has(b.id));
  const model = {
    name: chain.length ? (chain[chain.length - 1].body as ModelBody).model : name, calls: chain.length, graded: modelGraded.length,
    points: +modelGraded.reduce((a, b) => a + points(b.p, outcome.get(b.id)!), 0).toFixed(3), pending: chain.length - modelGraded.length,
  };

  // what trading costs, from the hourly order-book record
  const bookDir = path.join(opts.data ?? process.env.DATA_DIR ?? 'data', 'book');
  const rows: BookRow[] = [];
  if (fs.existsSync(bookDir)) {
    for (const f of fs.readdirSync(bookDir).filter((x) => x.endsWith('.jsonl')).sort()) {
      for (const line of fs.readFileSync(path.join(bookDir, f), 'utf8').split('\n')) if (line.trim()) { try { rows.push(JSON.parse(line) as BookRow); } catch { /* a torn line is skipped */ } }
    }
  }
  const cost = costPanel(rows, now);

  const results = readJson<Record<string, any> | null>(path.join(research, 'results.json'), null);
  const study = results && {
    events: results.sets.test.events, windows: results.sets.test.windows, testEnd: results.data.testEnd,
    y: results.claim1.y, held: results.claim1.held, extended: results.claim1.extended, coverage: results.claim2.coverage, points: results.claim2.points, timing: results.claim3.vsSplit,
  };

  // the rolling study: the same three claims on everything recorded since the fixed test set ended
  const allRows = studyRows(market, state.graded).rows;
  const after = allRows.filter((r) => r.set === 'after');
  const rolling = {
    updatedAt: now, from: TEST_END, through: state.cursor,
    events: after.length, windows: new Set(after.map((r) => r.window)).size,
    claim1: claim1(after, state.quiet.filter((q) => q.gradeAt > TEST_END)), claim2: claim2(after), claim3: claim3(after),
    months: byMonth(allRows),
    fixed: results && { events: results.sets.test.events, windows: results.sets.test.windows, claim1: results.claim1, claim2: results.claim2, claim3: results.claim3, breakdowns: results.breakdowns, breakdownCount: results.breakdownCount },
  };

  const out = (name: string, data: unknown) => writeIfChanged(path.join(dir, name), JSON.stringify(data) + '\n');
  out('study.json', rolling);
  out('seen.json', seen);
  out('boards.json', files.boards);
  out('boards-live.json', files.boardsLive);
  out('record.json', files.record);
  out('record-live.json', files.recordLive);
  out('model.json', chain);
  out('league.json', files.league);
  out('cost.json', cost);
  out('tonight.json', files.tonight);
  out('summary.json', { ...files.summary, model, study });

  // the forward test: the same rules, on calls the scheduled agent made before their outcome existed
  const live = files.boardsLive;
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
  const pct = (x: number) => (Number.isFinite(x) ? `${(x * 100).toFixed(1)}%` : 'none yet');
  const bp = (x: number) => { const v = (x * 1e4).toFixed(1); return v === '-0.0' ? '0.0' : v; };
  const iv = (s: { mean: number; lo: number; hi: number }, f: (x: number) => string) => (Number.isFinite(s.mean) ? `${f(s.mean)} (${f(s.lo)} to ${f(s.hi)})` : 'none yet');
  const forward = [
    '# Forward test', '',
    'The study in docs/STUDY.md was run on candles recorded up to 10 October 2026 09:00 UTC. This file is what',
    'happened next. Every hour a scheduled job appends the new Bitget candles, replays the house with nothing',
    'changed, and counts here only the calls it published before their outcome existed. Nothing is tuned on',
    'what this finds. It only keeps score.', '',
    `Updated ${new Date(now).toISOString().slice(0, 16).replace('T', ' ')} UTC. Candles on file through ${new Date(state.cursor).toISOString().slice(0, 16).replace('T', ' ')} UTC.`, '',
    '| | Live calls | Test set (study) |', '| --- | ---: | ---: |',
    `| Calls graded | ${live.length} | ${study ? study.events.toLocaleString('en-US') : ''} |`,
    `| Calls waiting for a bell | ${files.summary.live.open} | |`,
    `| Moves that held | ${pct(mean(live.map((b) => (b.held ? 1 : 0))))} | ${study ? pct(study.held.mean) : ''} |`,
    `| Prices inside the 80% range | ${pct(mean(live.map((b) => (b.inRange ? 1 : 0))))} | ${study ? pct(study.coverage.mean) : ''} |`,
    `| Points a call | ${live.length ? mean(live.map((b) => b.housePoints)).toFixed(2) : 'none yet'} | ${study ? study.points.mean.toFixed(2) : ''} |`,
    `| Move after the call, basis points | ${live.length ? bp(mean(live.map((b) => b.y))) : 'none yet'} | ${study ? bp(study.y.mean) : ''} |`,
    `| Timing rule against half and half, basis points | ${live.length ? bp(mean(live.map((b) => timing(b.forecast.plan, b.y).vsSplit))) : 'none yet'} | ${study ? bp(study.timing.mean) : ''} |`,
    '', live.length < 100 ? 'Fewer than 100 live calls is too few to read anything into. The row to watch is the first one, as it grows.' : '',
  ].join('\n');
  writeIfChanged(path.join(research, 'FORWARD.md'), forward.trimEnd() + '\n');

  // the rolling study, as a document: regenerated every hour
  const c1 = rolling.claim1, c2 = rolling.claim2, c3 = rolling.claim3;
  const doc = [
    '# Rolling study', '',
    'The fixed test in docs/STUDY.md covers each contract\'s first bar up to the New York close of 28 August 2026 and',
    'is never re-run on new data. This file applies the same three claims, with the same code and nothing changed, to',
    'everything recorded after that date. A scheduled job rewrites it every hour, so it keeps growing.', '',
    `Updated ${new Date(now).toISOString().slice(0, 16).replace('T', ' ')} UTC. ${after.length.toLocaleString('en-US')} moves in ${rolling.windows} closed sessions since the fixed test ended.`,
    'The first six weeks of this period (to 8 October 2026) were looked at before the rules were fixed; see research/PREREGISTRATION.md.', '',
    '| | Since the fixed test | Fixed test |', '| --- | ---: | ---: |',
    `| Moves | ${after.length.toLocaleString('en-US')} | ${rolling.fixed ? rolling.fixed.events.toLocaleString('en-US') : ''} |`,
    `| Move after the call, basis points | ${iv(c1.y, bp)} | ${rolling.fixed ? iv(rolling.fixed.claim1.y, bp) : ''} |`,
    `| Moves that held | ${iv(c1.held, pct)} | ${rolling.fixed ? iv(rolling.fixed.claim1.held, pct) : ''} |`,
    `| Prices inside the 80% range | ${iv(c2.coverage, pct)} | ${rolling.fixed ? iv(rolling.fixed.claim2.coverage, pct) : ''} |`,
    `| Points a call | ${iv(c2.points, (x) => x.toFixed(2))} | ${rolling.fixed ? iv(rolling.fixed.claim2.points, (x: number) => x.toFixed(2)) : ''} |`,
    `| Timing rule against half and half, basis points | ${iv(c3.vsSplit, bp)} | ${rolling.fixed ? iv(rolling.fixed.claim3.vsSplit, bp) : ''} |`,
    '', 'Figures in brackets are 95% intervals from resampling whole closed sessions.', '',
    '## Month by month', '',
    'Every month on record, fixed test and after. No intervals: a single month is a small sample, and one loud week moves it a long way.', '',
    '| Month | Moves | Sessions | Held | Went further | Move after the call, bp | Inside the 80% range | Points a call |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...rolling.months.map((m) => `| ${m.month} | ${m.events} | ${m.windows} | ${pct(m.held)} | ${pct(m.extended)} | ${bp(m.y)} | ${m.coverage === null ? '' : pct(m.coverage)} | ${m.points === null ? '' : m.points.toFixed(2)} |`),
  ].join('\n');
  writeIfChanged(path.join(research, 'ROLLING.md'), doc + '\n');
  return { state, seen, files, chain, cost };
}

if (process.argv[1]?.endsWith('agent.ts')) {
  run()
    .then(({ files, chain }) => console.log(`house: ${files.summary.ledger.entries} entries, ${files.boards.length} replay boards, ${files.boardsLive.length} live boards, ${files.tonight.calls.length} open calls; model calls ${chain.length}`))
    .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
}
