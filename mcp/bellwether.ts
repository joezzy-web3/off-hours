// Bellwether as an MCP server (stdio, JSON-RPC 2.0, no dependencies).
//
// Any MCP-capable agent (Claude Code, Cursor, Codex, Bitget Agent Hub) can read
// the round in play, look up base rates, and enter the league: call a board
// before its bell and be graded by the same code as the house.
//
//   npm run build:mcp && node dist/mcp/bellwether.mjs
//
// Environment:
//   BELLWETHER_URL    the deployed site, for the league (for example https://your-site.netlify.app)
//   BELLWETHER_FEED   where the live files are published (defaults to this repository on GitHub)

import { createInterface } from 'node:readline';
import { answer, Context } from '../src/core/ask';
import { Dealt, Tonight } from '../src/core/board';
import { Cost } from '../src/core/book';

const FEED = (process.env.BELLWETHER_FEED || 'https://raw.githubusercontent.com/joezzy-web3/off-hours/main/live').replace(/\/$/, '');
const SITE = (process.env.BELLWETHER_URL || '').replace(/\/$/, '');

async function file<T>(name: string): Promise<T> {
  const res = await fetch(`${FEED}/${name}`, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`could not read ${name} (${res.status})`);
  return (await res.json()) as T;
}
async function league(body?: unknown): Promise<unknown> {
  if (!SITE) throw new Error('Set BELLWETHER_URL to the deployed site to use the league.');
  const res = await fetch(`${SITE}/api/league`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) } : { signal: AbortSignal.timeout(15_000) });
  return res.json();
}
async function context(withBoards: boolean): Promise<Context> {
  const [summary, tonight, cost, boards, live] = await Promise.all([
    file<Context['summary']>('summary.json'), file<Tonight>('tonight.json'), file<Cost>('cost.json').catch(() => null),
    withBoards ? file<Dealt[]>('boards.json') : Promise.resolve([]), withBoards ? file<Dealt[]>('boards-live.json').catch(() => []) : Promise.resolve([]),
  ]);
  return { now: Date.now(), summary, tonight, cost, boards: [...boards, ...live] };
}

const str = { type: 'string' } as const;
const TOOLS = [
  { name: 'bellwether_tonight', description: 'The round in play while the New York cash market is shut: when the bell rings, how far each Bitget stock perp has moved since the close, and the boards the house has called. Each board has an id you can call with bellwether_call.', inputSchema: { type: 'object', properties: {} } },
  { name: 'bellwether_ask', description: 'Ask the record a question in plain words, for example "how often do NVDA drops hold over a weekend?", "should I sell now or wait for the bell?", "what does it cost to trade TSLA?". The answer is computed from recorded Bitget data, never written by a model.', inputSchema: { type: 'object', properties: { question: str }, required: ['question'] } },
  { name: 'bellwether_join', description: 'Register a name in the league. Returns a token ONCE: keep it, it is the only way to call under that name.', inputSchema: { type: 'object', properties: { name: { type: 'string', description: '3 to 24 lower-case letters, digits or hyphens' } }, required: ['name'] } },
  { name: 'bellwether_call', description: 'Call a board in play: your probability, from 0 to 1, that at least half of the move is still standing 90 minutes after the opening bell. Must arrive before the bell. The first call on a board stands. Scored 100 x (0.25 - (p - outcome)^2).', inputSchema: { type: 'object', properties: { name: str, token: str, id: { type: 'string', description: 'board id from bellwether_tonight' }, p: { type: 'number', minimum: 0, maximum: 1 } }, required: ['name', 'token', 'id', 'p'] } },
  { name: 'bellwether_league', description: 'The league table: every person and agent, graded by the same code on live boards only.', inputSchema: { type: 'object', properties: {} } },
];

async function call(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'bellwether_tonight': {
      const { tonight, summary, now } = await context(false);
      const w = tonight.window;
      return {
        asOf: new Date(tonight.asOf).toISOString(),
        round: w ? { kind: w.kind, closed: new Date(w.close).toISOString(), bell: new Date(w.bell).toISOString(), graded: new Date(w.grade).toISOString(), hoursToBell: +((w.bell - now) / 3_600_000).toFixed(2) } : null,
        note: w ? `The house calls a contract when its move reaches ${summary.threshold} of a normal day's move.` : 'New York is trading. A round opens at the close.',
        standings: tonight.standings.map((r) => ({ ticker: r.ticker, movePct: +(r.m * 100).toFixed(3), ofNormalDay: +(Math.abs(r.m) / r.s).toFixed(3), called: r.called })),
        boards: tonight.calls.map((c) => ({ id: c.id, ticker: c.ticker, calledAt: new Date(c.at).toISOString(), movePct: +(c.m * 100).toFixed(3), priceAtClose: c.c0, priceAtCall: c.price, house: c.forecast && { holds: c.forecast.pHold, range: [c.forecast.lo, c.forecast.hi], fromNights: c.forecast.n }, hash: c.callHash })),
      };
    }
    case 'bellwether_ask': return answer(String(args.question ?? ''), await context(true));
    case 'bellwether_join': return league({ action: 'join', kind: 'agent', name: args.name });
    case 'bellwether_call': return league({ action: 'call', name: args.name, token: args.token, id: args.id, p: args.p });
    case 'bellwether_league': return league();
  }
  throw new Error(`Unknown tool ${name}`);
}

const reply = (id: unknown, result: unknown): void => { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n'); };
const fail = (id: unknown, code: number, message: string): void => { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n'); };

let queue: Promise<void> = Promise.resolve(); // requests are answered in the order they arrive
createInterface({ input: process.stdin }).on('line', (line) => {
  if (!line.trim()) return;
  queue = queue.then(async () => {
    let msg: { id?: unknown; method?: string; params?: { name?: string; arguments?: Record<string, unknown>; protocolVersion?: string } };
    try { msg = JSON.parse(line); } catch { return fail(null, -32700, 'Parse error'); }
    if (msg.id === undefined) return; // notifications need no answer
    switch (msg.method) {
      case 'initialize': return reply(msg.id, { protocolVersion: msg.params?.protocolVersion ?? '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'bellwether', version: '0.1.0' } });
      case 'ping': return reply(msg.id, {});
      case 'tools/list': return reply(msg.id, { tools: TOOLS });
      case 'tools/call':
        try { return reply(msg.id, { content: [{ type: 'text', text: JSON.stringify(await call(String(msg.params?.name), msg.params?.arguments ?? {}), null, 2) }] }); }
        catch (e) { return reply(msg.id, { content: [{ type: 'text', text: (e as Error).message }], isError: true }); }
      default: return fail(msg.id, -32601, `Method not found: ${msg.method}`);
    }
  });
});
