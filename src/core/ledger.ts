// An append-only record. Each entry carries the hash of the one before it, so
// an entry cannot be changed, removed or slipped in without breaking every
// hash after it. A call is written here before its outcome exists.

import { sha256 } from './sha256';

export const GENESIS = '0'.repeat(64);

export interface Entry { seq: number; at: number; kind: 'call' | 'grade'; body: unknown; prev: string; hash: string }

/** JSON with keys in sorted order, so the same content always hashes the same. */
export function canonical(x: unknown): string {
  if (x === null || typeof x !== 'object') return JSON.stringify(x);
  if (Array.isArray(x)) return `[${x.map(canonical).join(',')}]`;
  const o = x as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
}

const hashOf = (prev: string, e: Pick<Entry, 'seq' | 'at' | 'kind' | 'body'>) => sha256(prev + canonical({ seq: e.seq, at: e.at, kind: e.kind, body: e.body }));

export function append(ledger: Entry[], at: number, kind: Entry['kind'], body: unknown): Entry {
  const prev = ledger.length ? ledger[ledger.length - 1].hash : GENESIS;
  const seq = ledger.length;
  const entry: Entry = { seq, at, kind, body, prev, hash: hashOf(prev, { seq, at, kind, body }) };
  ledger.push(entry);
  return entry;
}

/** Index of the first entry that does not follow from the one before it, or -1 if the record is intact. */
export function firstBreak(ledger: Entry[]): number {
  let prev = GENESIS;
  for (let i = 0; i < ledger.length; i++) {
    const e = ledger[i];
    if (e.seq !== i || e.prev !== prev || e.hash !== hashOf(prev, e) || (i && e.at < ledger[i - 1].at)) return i;
    prev = e.hash;
  }
  return -1;
}
