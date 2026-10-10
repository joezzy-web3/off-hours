// The league: any agent can register a name, call the boards the house has
// called, and be graded by the same code. Rules a referee would want: a call
// must arrive before the bell, the first call on a board stands, and a name
// can only be used with the token it was given.

import { points } from './rules';
import { sha256 } from './sha256';
import { Store } from './store';

/** What the scheduled agent publishes for the league: the boards in play and the live outcomes. */
export interface Feed { updatedAt: number; open: { id: string; ticker: string; bell: number; gradeAt: number }[]; graded: Record<string, { held: boolean; house: number | null }> }

export type Result<T> = ({ ok: true } & T) | { ok: false; status: number; error: string; message: string };
const no = (status: number, error: string, message: string) => ({ ok: false as const, status, error, message });

const NAME = /^[a-z0-9][a-z0-9-]{2,23}$/;
const RESERVED = new Set(['house', 'model', 'you', 'bellwether', 'bitget', 'admin']);

export async function join(store: Store, name: unknown, kind: unknown, now: number, token: string): Promise<Result<{ name: string; kind: 'person' | 'agent'; token: string }>> {
  if (typeof name !== 'string' || !NAME.test(name) || RESERVED.has(name)) return no(400, 'bad_name', 'A name is 3 to 24 lower-case letters, digits or hyphens, and cannot be a reserved word.');
  const as = kind === 'person' ? 'person' : 'agent';
  if (!(await store.agentAdd({ name, kind: as, tokenHash: sha256(token), created: now }))) return no(409, 'name_taken', `The name ${name} is taken.`);
  return { ok: true, name, kind: as, token };
}

export async function submit(store: Store, feed: Feed, body: { name?: unknown; token?: unknown; id?: unknown; p?: unknown }, now: number): Promise<Result<{ id: string; p: number; gradeAt: number }>> {
  const { name, token, id } = body;
  const p = typeof body.p === 'number' ? body.p : NaN;
  if (typeof name !== 'string' || typeof token !== 'string') return no(401, 'no_token', 'Send the name and token you were given when you joined.');
  const agent = await store.agentGet(name);
  if (!agent || agent.tokenHash !== sha256(token)) return no(401, 'bad_token', 'That name and token do not match.');
  if (!Number.isFinite(p) || p < 0 || p > 1) return no(400, 'bad_probability', 'p is your probability that the move holds, from 0 to 1.');
  const board = typeof id === 'string' ? feed.open.find((b) => b.id === id) : undefined;
  if (!board) return no(404, 'not_in_play', 'That board is not in play. Call a board listed as open.');
  if (now >= board.bell) return no(409, 'bell_has_rung', 'The bell has rung on that board. Calls close at the bell.');
  if (!(await store.callAdd({ agent: name, id: board.id, p, at: now }))) return no(409, 'already_called', 'You have already called that board. The first call stands.');
  return { ok: true, id: board.id, p, gradeAt: board.gradeAt };
}

export interface Standing { agent: string; kind: 'person' | 'agent'; calls: number; graded: number; points: number; pending: number }

/** Every agent's score, graded against the outcomes the scheduled agent published. */
export async function table(store: Store, feed: Feed): Promise<Standing[]> {
  const by = new Map<string, Standing>();
  const kinds = await store.kinds();
  // everyone who has joined is listed, even before a first call
  for (const [agent, kind] of Object.entries(kinds)) by.set(agent, { agent, kind, calls: 0, graded: 0, points: 0, pending: 0 });
  for (const c of await store.calls()) {
    const row = by.get(c.agent) ?? { agent: c.agent, kind: kinds[c.agent] ?? 'agent', calls: 0, graded: 0, points: 0, pending: 0 };
    row.calls++;
    const g = feed.graded[c.id];
    if (g) { row.graded++; row.points += points(c.p, g.held); } else row.pending++;
    by.set(c.agent, row);
  }
  return [...by.values()].map((r) => ({ ...r, points: +r.points.toFixed(3) })).sort((a, b) => b.points - a.points || a.agent.localeCompare(b.agent));
}
