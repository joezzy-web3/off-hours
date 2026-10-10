// GET /api/book : spread and depth for every contract, read from Bitget right now.
import type { ServerResponse } from 'node:http';
import { bookNow } from '../src/core/bitget';
import { costPanel } from '../src/core/book';
import { Req, send } from './_http';

let last: { at: number; data: unknown } | null = null;

export default async function handler(_req: Req, res: ServerResponse) {
  try {
    if (!last || Date.now() - last.at > 20_000) {
      const now = Date.now();
      last = { at: now, data: costPanel(await bookNow(now), now) };
    }
    send(res, 200, last.data);
  } catch (e) {
    send(res, 502, { error: 'book_failed', message: (e as Error).message });
  }
}
