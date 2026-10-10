// Netlify entry point. One function receives every /api/* request (see the
// redirect in netlify.toml) and hands it to the handlers in api/.

import type { ServerResponse } from 'node:http';
import type { Req } from '../api/_http';
import ask from '../api/ask';
import book from '../api/book';
import league from '../api/league';
import order from '../api/order';
import status from '../api/status';

type Handler = (req: Req, res: ServerResponse) => unknown;
export const ROUTES: Record<string, Handler> = { ask, book, league, order, status };

export interface NetlifyEvent {
  httpMethod: string; path: string; rawQuery?: string;
  queryStringParameters?: Record<string, string | undefined> | null;
  headers?: Record<string, string | undefined> | null;
  body?: string | null; isBase64Encoded?: boolean;
}
export interface NetlifyResult { statusCode: number; headers: Record<string, string>; body: string }

const json = (statusCode: number, data: unknown): NetlifyResult => ({ statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(data) });

export async function handler(event: NetlifyEvent): Promise<NetlifyResult> {
  // works for /api/league and for /.netlify/functions/api/league
  const name = (event.path || '').replace(/\/+$/, '').split('/').pop() ?? '';
  const route = Object.prototype.hasOwnProperty.call(ROUTES, name) ? ROUTES[name] : undefined;
  if (!route) return json(404, { error: 'not_found' });
  const pairs = Object.entries(event.queryStringParameters ?? {}).filter((e): e is [string, string] => typeof e[1] === 'string');
  const qs = event.rawQuery ?? new URLSearchParams(pairs).toString();
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(event.headers ?? {})) if (typeof v === 'string') headers[k.toLowerCase()] = v;
  const method = (event.httpMethod || 'GET').toUpperCase();
  const raw = event.body ? (event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body) : '';
  const req = { method, url: `/api/${name}${qs ? `?${qs}` : ''}`, headers, body: method === 'GET' || method === 'HEAD' ? undefined : raw || '{}' };

  return new Promise<NetlifyResult>((resolve) => {
    const out = {
      statusCode: 200,
      headers: {} as Record<string, string>,
      setHeader(k: string, v: unknown) { out.headers[k] = String(v); return out; },
      getHeader(k: string) { return out.headers[k]; },
      end(text?: string) { resolve({ statusCode: out.statusCode, headers: out.headers, body: text ?? '' }); },
    };
    Promise.resolve()
      .then(() => route(req as unknown as Req, out as unknown as ServerResponse))
      .catch((e: unknown) => resolve(json(500, { error: 'function_failed', message: e instanceof Error ? e.message : String(e) })));
  });
}
