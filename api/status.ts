// GET /api/status : which optional parts are switched on. No secret is ever returned.
import type { ServerResponse } from 'node:http';
import { modelName } from '../src/core/model';
import { storeFromEnv } from '../src/core/store';
import { FEED, Req, send } from './_http';

export default function handler(_req: Req, res: ServerResponse) {
  send(res, 200, { league: storeFromEnv().kind, model: Boolean(modelName()), orders: 'demo only', feed: FEED() });
}
