import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer, Server } from 'node:http';
import test, { after, before } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { handler, NetlifyEvent } from '../netlify/api';
import { handler as tick } from '../netlify/tick';
import { Feed } from '../src/core/league';
import { D1Store } from '../src/core/store';
import { MOCK_SECRET, startMock } from './mock-bitget';

const HOUR = 3_600_000;
const listen = (server: Server) => new Promise<string>((resolve) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as { port: number }).port}`)));
const body = (req: import('node:http').IncomingMessage) => new Promise<string>((resolve) => { let s = ''; req.on('data', (c) => (s += c)); req.on('end', () => resolve(s)); });

// the live files the scheduled agent would have published
const feed: Feed = { updatedAt: Date.now(), open: [{ id: '2026-10-09:NVDAUSDT', ticker: 'NVDA', bell: Date.now() + 5 * HOUR, gradeAt: Date.now() + 6.5 * HOUR }, { id: '2026-10-08:TSLAUSDT', ticker: 'TSLA', bell: Date.now() - HOUR, gradeAt: Date.now() + HOUR }], graded: {} };
const files: Record<string, unknown> = {
  'league.json': feed,
  'summary.json': { name: 'Bellwether', threshold: 0.5, house: { boards: 10, coverage: 0.8, points: 2 }, ledger: { entries: 20 }, study: null },
  'tonight.json': { asOf: Date.now(), window: { id: '2026-10-09', kind: 'weekend', close: Date.now() - 10 * HOUR, bell: Date.now() + 5 * HOUR, grade: Date.now() + 6.5 * HOUR }, standings: [{ symbol: 'NVDAUSDT', ticker: 'NVDA', name: 'NVIDIA', c0: 230, s: 0.02, last: 233, m: 0.013, called: true }], calls: [{ id: '2026-10-09:NVDAUSDT', ticker: 'NVDA', at: Date.now() - 2 * HOUR, m: 0.013, s: 0.02, c0: 230, price: 233, forecast: { pHold: 0.64, lo: 228, hi: 238, n: 400 }, callHash: 'abc' }] },
  'cost.json': { updatedAt: 0, since: null, snapshots: 0, rows: [] }, 'boards.json': [], 'boards-live.json': [],
};
const feedServer = createServer((req, res) => { const name = (req.url ?? '').split('/').pop()!; if (!(name in files)) { res.statusCode = 404; return res.end(); } res.end(JSON.stringify(files[name])); });

// Cloudflare D1's REST endpoint, answered by a real SQL engine
const db = new DatabaseSync(':memory:');
const d1 = createServer(async (req, res) => {
  const { sql, params } = JSON.parse(await body(req)) as { sql: string; params: (string | number)[] };
  assert.equal(req.headers.authorization, 'Bearer d1-token');
  try {
    const stmt = db.prepare(sql);
    const isRead = /^\s*select/i.test(sql);
    const results = isRead ? stmt.all(...params) : [];
    const changes = isRead ? 0 : Number(stmt.run(...params).changes);
    res.end(JSON.stringify({ success: true, result: [{ results, meta: { changes } }] }));
  } catch (e) { res.statusCode = 400; res.end(JSON.stringify({ success: false, errors: [{ message: (e as Error).message }] })); }
});

// an OpenAI-compatible model that answers whatever the test tells it to
let modelSays = '';
const llm = createServer(async (req, res) => { await body(req); res.end(JSON.stringify({ choices: [{ message: { content: modelSays } }] })); });

let mock: Awaited<ReturnType<typeof startMock>>, feedUrl = '', d1Url = '', llmUrl = '';
before(async () => {
  mock = await startMock();
  [feedUrl, d1Url, llmUrl] = await Promise.all([listen(feedServer), listen(d1), listen(llm)]);
  Object.assign(process.env, { BITGET_BASE_URL: mock.url, BELLWETHER_FEED: feedUrl, CLOUDFLARE_ACCOUNT_ID: 'acc', CLOUDFLARE_D1_DATABASE_ID: 'db', CLOUDFLARE_API_TOKEN: 'd1-token', CLOUDFLARE_API_BASE: d1Url });
});
after(() => { for (const s of [mock.server, feedServer, d1, llm]) s.close(); });

const api = async (method: string, route: string, data?: unknown) => {
  const out = await handler({ httpMethod: method, path: `/.netlify/functions/api/${route}`, body: data === undefined ? null : JSON.stringify(data), headers: {} } as NetlifyEvent);
  return { status: out.statusCode, json: JSON.parse(out.body) };
};

test('status says what is switched on and leaks no secret; the clock starts the workflows only with a token', async () => {
  const { status, json } = await api('GET', 'status');
  assert.equal(status, 200);
  assert.deepEqual(json, { league: 'd1', model: false, orders: 'demo only', feed: feedUrl });
  assert.equal((await api('GET', 'nothing')).status, 404);

  // the clock: starts the order-book recorder and then the agent, and only when it holds a token
  const seen: { url: string; auth: string; body: string }[] = [];
  const github = createServer(async (req, res) => { seen.push({ url: `${req.method} ${req.url}`, auth: String(req.headers.authorization), body: await body(req) }); res.statusCode = 204; res.end(); });
  process.env.GITHUB_API_URL = await listen(github);
  try {
    delete process.env.GITHUB_DISPATCH_TOKEN;
    assert.match((await tick()).body, /nothing started/);
    assert.equal(seen.length, 0);
    process.env.GITHUB_DISPATCH_TOKEN = 'clock-token';
    const out = await tick();
    assert.equal(out.body, 'record-book.yml: started; agent.yml: started');
    assert.ok(!out.body.includes('clock-token'));
    assert.deepEqual(seen.map((r) => r.url), ['POST /repos/joezzy-web3/off-hours/actions/workflows/record-book.yml/dispatches', 'POST /repos/joezzy-web3/off-hours/actions/workflows/agent.yml/dispatches']);
    assert.ok(seen.every((r) => r.auth === 'Bearer clock-token' && JSON.parse(r.body).ref === 'main'));
  } finally { delete process.env.GITHUB_DISPATCH_TOKEN; delete process.env.GITHUB_API_URL; github.close(); }
});

test('league over D1: join, call before the bell, first call stands, table is graded by the published outcomes', async () => {
  const joined = await api('POST', 'league', { action: 'join', name: 'night-owl', kind: 'person' });
  assert.equal(joined.status, 200);
  assert.match(joined.json.token, /^[0-9a-f]{36}$/);
  assert.equal((await api('POST', 'league', { action: 'join', name: 'night-owl' })).status, 409);
  const token = joined.json.token;
  const ok = await api('POST', 'league', { action: 'call', name: 'night-owl', token, id: '2026-10-09:NVDAUSDT', p: 0.7 });
  assert.deepEqual([ok.status, ok.json.ok, ok.json.saved], [200, true, true]);
  assert.equal((await api('POST', 'league', { action: 'call', name: 'night-owl', token, id: '2026-10-09:NVDAUSDT', p: 0.2 })).json.error, 'already_called');
  assert.equal((await api('POST', 'league', { action: 'call', name: 'night-owl', token, id: '2026-10-08:TSLAUSDT', p: 0.5 })).json.error, 'bell_has_rung');
  assert.equal((await api('POST', 'league', { action: 'call', name: 'night-owl', token: 'wrong', id: '2026-10-09:NVDAUSDT', p: 0.5 })).status, 401);
  assert.equal((await api('POST', 'league', { action: 'dance' })).status, 400);
  let t = await api('GET', 'league');
  assert.deepEqual(t.json.agents, [{ agent: 'night-owl', kind: 'person', calls: 1, graded: 0, points: 0, pending: 1 }]);
  // the token is stored only as a hash
  const stored = db.prepare('SELECT * FROM bw_agents').all() as { token_hash: string }[];
  assert.ok(stored.length === 1 && stored[0].token_hash !== token && stored[0].token_hash.length === 64);
  // a second store instance (a new function instance) sees the same rows
  const again = new D1Store({ accountId: 'acc', databaseId: 'db', token: 'd1-token', base: d1Url });
  assert.equal((await again.calls()).length, 1);
  assert.equal(await again.callAdd({ agent: 'night-owl', id: '2026-10-09:NVDAUSDT', p: 0.1, at: 1 }), false);
});

test('demo order: dry run without a key, a signed demo order with one, and nothing sent when the plan waits', async () => {
  const dry = await api('POST', 'order', { symbol: 'NVDAUSDT', side: 'sell', usdt: 500, share: 0.5 });
  assert.equal(dry.json.placed, false);
  assert.equal(dry.json.order.size, '1.08'); // 250 USDT at 230.5 is 1.0846: rounded down, never up
  assert.equal(dry.json.order.side, 'sell');
  assert.equal(mock.orders.length, 0);
  const live = await api('POST', 'order', { symbol: 'NVDAUSDT', side: 'buy', usdt: 500, share: 1, byok: { key: 'k', secret: MOCK_SECRET, passphrase: 'p' } });
  assert.deepEqual([live.json.placed, live.json.venue, live.json.orderId], [true, 'bitget-demo', '1300000000000000001']);
  assert.deepEqual(mock.orders.map((o) => o.path), ['/api/v2/mix/account/set-leverage', '/api/v2/mix/order/place-order']);
  assert.equal(mock.orders[0].leverage, '1');
  assert.equal(mock.orders[1].size, '2.16');
  assert.ok(!JSON.stringify(live.json).includes(MOCK_SECRET));
  const bad = await api('POST', 'order', { symbol: 'NVDAUSDT', side: 'buy', usdt: 500, share: 1, byok: { key: 'k', secret: 'wrong', passphrase: 'p' } });
  assert.equal(bad.status, 502);
  assert.match(bad.json.message, /sign signature error/);
  assert.equal((await api('POST', 'order', { symbol: 'NVDAUSDT', side: 'buy', usdt: 500, share: 0 })).json.placed, false);
  for (const wrong of [{ symbol: 'DOGEUSDT', side: 'buy', usdt: 50, share: 1 }, { symbol: 'NVDAUSDT', side: 'hold', usdt: 50, share: 1 }, { symbol: 'NVDAUSDT', side: 'buy', usdt: 50_000, share: 1 }, { symbol: 'NVDAUSDT', side: 'buy', usdt: 50, share: 0.3 }]) {
    assert.equal((await api('POST', 'order', wrong)).status, 400);
  }
  assert.equal(mock.orders.length, 2);
});

test('order book: spread and depth for the listed contracts, read live', async () => {
  const { status, json } = await api('GET', 'book');
  assert.equal(status, 200);
  assert.deepEqual(json.rows.map((r: { ticker: string }) => r.ticker).sort(), ['NVDA', 'SPY', 'TSLA']);
  const spy = json.rows.find((r: { ticker: string }) => r.ticker === 'SPY');
  assert.ok(spy.spreadBps > 0 && spy.depth50 > spy.depth10 && spy.premiumBps < 0);
});

test('rewording: used only when a model is configured and its text adds no number', async () => {
  const reply = { understood: 'x', tool: 'timing', figures: [], lines: ['On 1,175 tested moves the drift was −3.9 basis points.'] };
  assert.equal((await api('POST', 'ask', { question: 'wait?', reply })).json.text, null); // no model configured
  Object.assign(process.env, { LLM_BASE_URL: llmUrl, LLM_API_KEY: 'k', LLM_MODEL: 'm' });
  modelSays = 'Across 1,175 moves, the drift after a call was 3.9 basis points.';
  assert.equal((await api('POST', 'ask', { question: 'wait?', reply })).json.text, modelSays);
  modelSays = 'Across 1,175 moves the drift was tiny, so you should expect about 5% upside.';
  assert.equal((await api('POST', 'ask', { question: 'wait?', reply })).json.text, null);
  assert.equal((await api('GET', 'status')).json.model, true);
  for (const k of ['LLM_BASE_URL', 'LLM_API_KEY', 'LLM_MODEL']) delete process.env[k];
});

test('the agent tool server speaks MCP and reads the published round', async () => {
  const child = spawn('node', ['dist/mcp/bellwether.mjs'], { env: { ...process.env, BELLWETHER_FEED: feedUrl, BELLWETHER_URL: '' }, stdio: ['pipe', 'pipe', 'inherit'] });
  const lines: string[] = [];
  let buffer = '';
  child.stdout.on('data', (c) => { buffer += c; const parts = buffer.split('\n'); buffer = parts.pop()!; lines.push(...parts.filter(Boolean)); });
  const rpc = async (id: number, method: string, params?: unknown) => {
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    for (let i = 0; i < 200; i++) { const hit = lines.map((l) => JSON.parse(l)).find((m) => m.id === id); if (hit) return hit; await new Promise((r) => setTimeout(r, 25)); }
    throw new Error(`no answer to ${method}`);
  };
  try {
    assert.equal((await rpc(1, 'initialize', { protocolVersion: '2024-11-05' })).result.serverInfo.name, 'bellwether');
    const tools = (await rpc(2, 'tools/list')).result.tools.map((t: { name: string }) => t.name);
    assert.deepEqual(tools, ['bellwether_tonight', 'bellwether_ask', 'bellwether_join', 'bellwether_call', 'bellwether_league']);
    const tonight = JSON.parse((await rpc(3, 'tools/call', { name: 'bellwether_tonight', arguments: {} })).result.content[0].text);
    assert.equal(tonight.boards[0].id, '2026-10-09:NVDAUSDT');
    assert.equal(tonight.boards[0].house.holds, 0.64);
    assert.ok(tonight.round.hoursToBell > 4.9 && tonight.round.hoursToBell < 5.1);
    const asked = JSON.parse((await rpc(4, 'tools/call', { name: 'bellwether_ask', arguments: { question: 'when does the bell ring?' } })).result.content[0].text);
    assert.equal(asked.tool, 'the bell');
    const noSite = (await rpc(5, 'tools/call', { name: 'bellwether_league', arguments: {} })).result;
    assert.ok(noSite.isError && /BELLWETHER_URL/.test(noSite.content[0].text));
  } finally { child.kill(); }
});
