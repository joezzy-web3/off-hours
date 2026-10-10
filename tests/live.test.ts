import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { run } from '../scripts/agent';
import { answer, Context, sameNumbers } from '../src/core/ask';
import { costPanel, summarise } from '../src/core/book';
import { HOUR } from '../src/core/calendar';
import { Entry, firstBreak } from '../src/core/ledger';
import { Feed, join, submit, table } from '../src/core/league';
import { parseAnswer } from '../src/core/model';
import { points } from '../src/core/rules';
import { rng } from '../src/core/season';
import { MemoryStore } from '../src/core/store';
import { byMonth, clustered, Row } from '../src/core/study';

const FROM = Date.parse('2026-03-02T00:00:00Z');

/** A seeded hourly walk for three of the real contract names, written the way the recorder writes it. */
function writeMarket(dir: string, hours: number, seed = 5) {
  const r = rng(seed);
  fs.mkdirSync(path.join(dir, 'hourly'), { recursive: true });
  for (const s of ['NVDAUSDT', 'TSLAUSDT', 'QQQUSDT']) {
    let p = 100 + 50 * r();
    const lines: string[] = [];
    for (let i = 0; i < hours; i++) { const o = p; p = +(p * (1 + (r() - 0.5) * 0.012)).toFixed(2); lines.push(`${FROM + i * HOUR},${o},${Math.max(o, p)},${Math.min(o, p)},${p},10,1000`); }
    fs.writeFileSync(path.join(dir, 'hourly', `${s}.csv`), lines.join('\n') + '\n');
  }
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bw-'));
const read = <T>(dir: string, name: string) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) as T;

test('the agent: live calls are only those seen before their outcome, and the replay record never changes', async () => {
  const root = tmp(), data = path.join(root, 'data'), live = path.join(root, 'live'), research = path.join(root, 'research');
  writeMarket(data, 70 * 24);
  const opts = { data, live, research, model: null };
  // first run in the middle of the history: everything already graded is replay
  const t1 = FROM + 48 * 24 * HOUR + 5 * HOUR;
  const a = await run({ ...opts, now: t1 });
  assert.ok(a.files.boards.length > 0, `${a.files.boards.length} replay boards`);
  assert.equal(a.files.boardsLive.length, 0);
  const frozenRecord = fs.readFileSync(path.join(live, 'record.json'), 'utf8');
  // later runs, a day at a time, as a scheduled job would make them
  let last = a;
  for (let t = t1 + 6 * HOUR; t <= FROM + 70 * 24 * HOUR; t += 6 * HOUR) last = await run({ ...opts, now: t });
  assert.ok(last.files.boardsLive.length > 5, `${last.files.boardsLive.length} live boards`);
  // every live call was first seen before it was graded, and no replay call is marked live
  for (const [id, seenAt] of Object.entries(last.seen.live)) {
    const g = last.state.graded.find((x) => x.call.id === id) ?? { call: last.state.open.find((c) => c.id === id)! };
    assert.ok(seenAt < g.call.gradeAt && seenAt >= g.call.at);
  }
  assert.ok(a.files.boards.every((b) => !(b.id in last.seen.live)));
  // the replay record is byte-for-byte what the first live run published, and the two files join into one intact chain
  const frozen = read<Entry[]>(live, 'record.json'), after = read<Entry[]>(live, 'record-live.json');
  assert.equal(frozen.length, last.seen.frozen);
  assert.equal(firstBreak([...frozen, ...after]), -1);
  assert.equal(frozen.length + after.length, last.state.ledger.length);
  assert.ok(after.length > 0 && frozenRecord.length <= fs.readFileSync(path.join(live, 'record.json'), 'utf8').length);
  assert.deepEqual(read<Entry[]>(live, 'record.json').slice(0, 50).map((e) => e.hash), (JSON.parse(frozenRecord) as Entry[]).slice(0, 50).map((e) => e.hash));
  const summary = read<{ live: { boards: number }; replay: { boards: number }; house: { boards: number } }>(live, 'summary.json');
  assert.equal(summary.live.boards + summary.replay.boards, summary.house.boards);
  assert.match(fs.readFileSync(path.join(research, 'FORWARD.md'), 'utf8'), /Calls graded \| \d+/);
  assert.match(fs.readFileSync(path.join(research, 'ROLLING.md'), 'utf8'), /Month by month/);

  // if an old candle changes under the published record, the agent refuses to write
  const file = path.join(data, 'hourly', 'NVDAUSDT.csv');
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  for (let i = 200; i < 330; i++) lines[i] = lines[i].replace(/,([\d.]+),10,1000$/, (_, c) => `,${(Number(c) * 1.2).toFixed(2)},10,1000`); // a few days of closes
  fs.writeFileSync(file, lines.join('\n'));
  await assert.rejects(run({ ...opts, now: FROM + 70 * 24 * HOUR }), /no longer reproduce the published record/);
});

test('the model player: one sealed call per open board, unreadable answers sit out, nothing after the bell', async () => {
  const root = tmp(), data = path.join(root, 'data'), live = path.join(root, 'live'), research = path.join(root, 'research');
  writeMarket(data, 70 * 24, 9);
  let asked = 0;
  const via = async (_s: string, user: string) => { asked++; assert.match(user, /probability, in percent/); return asked % 3 === 0 ? 'I think it holds' : 'Sure: {"p": 64, "reason": "Small move, long way to the bell."}'; };
  let chainLength = 0, out = await run({ data, live, research, now: FROM + 48 * 24 * HOUR, model: 'test model', via });
  for (let t = FROM + 48 * 24 * HOUR + 2 * HOUR; t <= FROM + 70 * 24 * HOUR; t += 2 * HOUR) {
    out = await run({ data, live, research, now: t, model: 'test model', via });
    for (const e of out.chain.slice(chainLength)) {
      const call = [...out.state.open, ...out.state.graded.map((g) => g.call)].find((c) => c.id === (e.body as { id: string }).id)!;
      assert.ok(e.at < call.bell, 'a model call was written after the bell');
    }
    chainLength = out.chain.length;
  }
  assert.ok(out.chain.length > 5, `${out.chain.length} model calls`);
  assert.equal(firstBreak(out.chain), -1);
  const ids = out.chain.map((e) => (e.body as { id: string }).id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(out.chain.every((e) => (e.body as { p: number; model: string }).p === 0.64 && (e.body as { model: string }).model === 'test model'));
  const s = read<{ model: { calls: number; graded: number; pending: number } }>(live, 'summary.json');
  assert.equal(s.model.calls, out.chain.length);
  assert.ok(s.model.graded > 0 && s.model.graded + s.model.pending === s.model.calls);
});

test('the model\'s answer is accepted only as a probability from 0 to 100', () => {
  assert.deepEqual(parseAnswer('{"p": 70, "reason": "x"}'), { p: 0.7, reason: 'x' });
  assert.deepEqual(parseAnswer('Here you go:\n{"p":"35","reason":"a\\nb"}\nThanks'), { p: 0.35, reason: 'a b' });
  for (const bad of [null, '', 'seventy', '{"p": 140}', '{"p": -1}', '{"p": null}', '{p: 70}', '{"probability": 70}']) assert.equal(parseAnswer(bad), null);
  assert.equal(parseAnswer(`{"p": 50, "reason": "${'y'.repeat(500)}"}`)!.reason.length, 200);
});

test('the league: a call must come before the bell, under the right token, and the first one stands', async () => {
  const store = new MemoryStore();
  const feed: Feed = { updatedAt: 0, open: [{ id: 'w:NVDAUSDT', ticker: 'NVDA', bell: 2000, gradeAt: 2500 }, { id: 'w:TSLAUSDT', ticker: 'TSLA', bell: 2000, gradeAt: 2500 }], graded: {} };
  for (const bad of ['ab', 'Has Caps', 'house', 'x'.repeat(30), 5]) assert.equal((await join(store, bad, 'agent', 1, 't')).ok, false);
  const a = await join(store, 'quant-bot', 'agent', 1, 'token-a');
  const b = await join(store, 'ada', 'person', 1, 'token-b');
  assert.ok(a.ok && b.ok && b.kind === 'person');
  assert.equal((await join(store, 'ada', 'person', 2, 'other')).ok, false);
  const call = (name: string, token: string, id: string, p: unknown, now: number) => submit(store, feed, { name, token, id, p }, now);
  assert.deepEqual(await call('quant-bot', 'token-a', 'w:NVDAUSDT', 0.8, 1000), { ok: true, id: 'w:NVDAUSDT', p: 0.8, gradeAt: 2500 });
  const fails: [Promise<{ ok: boolean; error?: string }>, string][] = [
    [call('quant-bot', 'token-b', 'w:TSLAUSDT', 0.5, 1000), 'bad_token'], [call('nobody', 'x', 'w:TSLAUSDT', 0.5, 1000), 'bad_token'],
    [call('quant-bot', 'token-a', 'w:NVDAUSDT', 0.1, 1001), 'already_called'], [call('quant-bot', 'token-a', 'w:AAPLUSDT', 0.5, 1000), 'not_in_play'],
    [call('quant-bot', 'token-a', 'w:TSLAUSDT', 1.2, 1000), 'bad_probability'], [call('quant-bot', 'token-a', 'w:TSLAUSDT', '0.5', 1000), 'bad_probability'],
    [call('ada', 'token-b', 'w:TSLAUSDT', 0.5, 2000), 'bell_has_rung'],
  ];
  for (const [p, error] of fails) assert.equal((await p as { error?: string }).error, error);
  assert.ok((await call('ada', 'token-b', 'w:NVDAUSDT', 0.3, 1999)).ok);
  // before the bell rings both are pending; afterwards the same code that scores the house scores them
  assert.deepEqual((await table(store, feed)).map((r) => [r.agent, r.kind, r.graded, r.pending]), [['ada', 'person', 0, 1], ['quant-bot', 'agent', 0, 1]]);
  feed.graded['w:NVDAUSDT'] = { held: true, house: 12 };
  const t = await table(store, feed);
  assert.deepEqual(t.map((r) => [r.agent, r.points]), [['quant-bot', +points(0.8, true).toFixed(3)], ['ada', +points(0.3, true).toFixed(3)]]);
  assert.ok(!JSON.stringify(await store.agentGet('ada')).includes('token-b'), 'the token itself is never stored');
});

test('cost: spread and depth from a book, and the panel splits closed hours from cash hours', () => {
  const side = (mid: number, dir: number, step: number): [string, string][] => Array.from({ length: 100 }, (_, i) => [(mid + dir * step * (i + 0.5)).toFixed(3), String(2 * Math.round(step / 0.01))]);
  const book = (step: number) => ({ bids: side(700, -1, step), asks: side(700, 1, step) });
  const row = summarise('SPYUSDT', [book(0.01), book(0.1)], { lastPr: '700', indexPrice: '700.7', markPrice: '700', fundingRate: '0.0001' }, Date.parse('2026-10-10T03:00:00Z'));
  assert.ok(Math.abs(row.spreadBps - 0.143) < 0.01);
  assert.ok(row.bid10! > 0 && row.bid50! > row.bid25! && row.bid25! > row.bid10!); // one-cent steps stop at 14 bps; the coarser book supplies 25 and 50
  assert.throws(() => summarise('X', [{ bids: [], asks: [] }], undefined, 0));
  const monday = { ...row, t: Date.parse('2026-10-12T15:00:00Z'), spreadBps: 0.05 };
  const panel = costPanel([row, { ...row, t: row.t + HOUR, spreadBps: 0.3 }, monday, { t: 1, symbol: 'SPYUSDT', error: 'x' } as never], 0);
  assert.equal(panel.rows[0].closed.snapshots, 2);
  assert.equal(panel.rows[0].cash.snapshots, 1);
  assert.ok(Math.abs(panel.rows[0].closed.spreadBps! - 0.2215) < 0.01 && panel.rows[0].cash.spreadBps === 0.05);
  assert.ok(Math.abs(panel.rows[0].premiumBps! + 9.99) < 0.01);
});

test('ask the house: each kind of question is read correctly and answered only from the record', async () => {
  const root = tmp(), data = path.join(root, 'data'), live = path.join(root, 'live'), research = path.join(root, 'research');
  writeMarket(data, 70 * 24, 3);
  const now = FROM + 68 * 24 * HOUR + 2 * HOUR; // a Saturday, mid-round
  const out = await run({ data, live, research, now, model: null });
  const ctx: Context = { now, summary: { ...out.files.summary, study: { events: 1175, windows: 223, y: { mean: -0.00039, lo: -0.00235, hi: 0.00155 }, held: { mean: 0.636, lo: 0.596, hi: 0.675 }, extended: { mean: 0.49, lo: 0.45, hi: 0.53 }, coverage: { mean: 0.782, lo: 0.748, hi: 0.816 }, points: { mean: 1.51, lo: 0.5, hi: 2.52 }, timing: { mean: 0, lo: -0.00017, hi: 0.00016 } } }, tonight: out.files.tonight, boards: [...out.files.boards, ...out.files.boardsLive], cost: out.cost };
  const tool = (q: string) => answer(q, ctx).tool;
  assert.equal(tool('what moved since the close?'), 'tonight');
  assert.equal(tool('how often do NVDA drops hold over a weekend?'), 'base rate');
  assert.equal(tool('should I sell now or wait for the bell?'), 'timing');
  assert.equal(tool('when does the bell ring'), 'the bell');
  assert.equal(tool('how has the house done?'), 'the house');
  assert.equal(tool('what does it cost to trade TSLA'), 'cost');
  assert.equal(tool('tell me a joke'), 'help');
  const base = answer('how often do tesla rallies hold overnight', ctx);
  assert.match(base.understood, /TSLA \(Tesla\), up moves, overnight/);
  const want = ctx.boards.filter((b) => b.ticker === 'TSLA' && b.m > 0 && b.kind === 'overnight');
  if (want.length >= 10) assert.ok(base.lines[0].includes(`${((want.filter((b) => b.held).length / want.length) * 100).toFixed(1)}%`));
  const timing = answer('is it better to wait', ctx);
  assert.ok(timing.lines[0].includes('1,175') && timing.lines[0].includes('−3.9 basis points'));
  // a rewording may not introduce a number the answer did not contain
  assert.equal(sameNumbers('On 1,175 tested moves the drift was 3.9 basis points.', timing), true);
  assert.equal(sameNumbers('On 1,175 moves the drift was 3.9 basis points, so expect a 12% gain.', timing), false);
});

test('study arithmetic: intervals are reproducible, contain the mean, and widen when sessions are few', () => {
  const r = rng(1);
  const rows = Array.from({ length: 400 }, (_, i) => ({ window: `2026-0${1 + (i % 6)}-${10 + Math.floor(i / 20)}`, y: (r() - 0.5) * 0.02, held: r() > 0.4, forecast: false } as unknown as Row));
  const a = clustered(rows, (x) => x.window, (x) => x.y), b = clustered(rows, (x) => x.window, (x) => x.y);
  assert.deepEqual(a, b);
  assert.ok(a.lo < a.mean && a.mean < a.hi && a.n === 400);
  const few = clustered(rows.slice(0, 40), (x) => x.window, (x) => x.y);
  assert.ok(few.hi - few.lo > a.hi - a.lo);
  assert.ok(clustered(rows, (x) => x.window, (x) => x.y, 0.05 / 27).hi > a.hi);
  const months = byMonth(rows);
  assert.equal(months.length, 6);
  assert.equal(months.reduce((n, m) => n + m.events, 0), 400);
});
