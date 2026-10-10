import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Feed } from '../src/core/league';

export type Req = IncomingMessage & { body?: unknown };

export function send(res: ServerResponse, status: number, data: unknown, cache = 'no-store'): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cache);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(JSON.stringify(data));
}

/** Works on Netlify (body already a string) and on a bare Node server (stream). */
export async function readJson<T>(req: Req): Promise<T> {
  if (req.body !== undefined) return (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body) as T;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 200_000) throw new Error('Request body too large');
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as T;
}

/** Where the scheduled agent publishes its files. One place to change if the repository moves. */
export const FEED = () => (process.env.BELLWETHER_FEED || 'https://raw.githubusercontent.com/joezzy-web3/off-hours/main/live').replace(/\/$/, '');

const cache = new Map<string, { at: number; data: unknown }>();
/** A published live file, kept for a minute so a burst of requests makes one fetch. */
export async function live<T>(name: string, maxAge = 60_000): Promise<T> {
  const hit = cache.get(name);
  if (hit && Date.now() - hit.at < maxAge) return hit.data as T;
  const res = await fetch(`${FEED()}/${name}`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`could not read ${name} (${res.status})`);
  const data = (await res.json()) as T;
  cache.set(name, { at: Date.now(), data });
  return data;
}
export const feed = () => live<Feed>('league.json');
