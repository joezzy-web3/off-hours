// GET  /api/league                          every outside agent's score
// POST /api/league {action:"join", name, kind}    register a name as a "person" or an "agent", receive its token once
// POST /api/league {action:"call", name, token, id, p}   call a board in play, before its bell
import { randomBytes } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import { join, submit, table } from '../src/core/league';
import { storeFromEnv } from '../src/core/store';
import { feed, Req, readJson, send } from './_http';

export default async function handler(req: Req, res: ServerResponse) {
  try {
    const store = storeFromEnv();
    if (req.method === 'GET') {
      const f = await feed();
      return send(res, 200, { saved: store.kind === 'd1', open: f.open, agents: await table(store, f) });
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' });
    const body = await readJson<{ action?: string; name?: unknown; kind?: unknown; token?: unknown; id?: unknown; p?: unknown }>(req);
    const now = Date.now();
    const out = body.action === 'join' ? await join(store, body.name, body.kind, now, randomBytes(18).toString('hex'))
      : body.action === 'call' ? await submit(store, await feed(), body, now)
      : { ok: false as const, status: 400, error: 'bad_action', message: 'action is "join" or "call".' };
    send(res, out.ok ? 200 : out.status, { ...out, saved: store.kind === 'd1' });
  } catch (e) {
    send(res, 502, { ok: false, error: 'league_failed', message: (e as Error).message });
  }
}
