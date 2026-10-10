// What this browser remembers: your calls, your league name, and which hints you
// have dismissed. Storage can be missing or blocked, so every read and write is
// guarded and the app works without it.

export interface Saved { id: string; p: number; f: number; at: number; mode: 'replay' | 'live' }
export interface Identity { name: string; token: string }

const KEY = 'bellwether.calls.v1';
let memory: Saved[] = [];
const mem = new Map<string, string>();

function read(key: string): string | null { try { return localStorage.getItem(key) ?? mem.get(key) ?? null; } catch { return mem.get(key) ?? null; } }
function write(key: string, value: string | null) {
  if (value === null) mem.delete(key); else mem.set(key, value);
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* in memory only */ }
}

export function loadCalls(): Saved[] {
  const text = read(KEY);
  if (text) { try { memory = JSON.parse(text) as Saved[]; } catch { /* keep what is in memory */ } }
  return memory;
}
/** A live call replaces an earlier one on the same board; replay calls are all kept. */
export function saveCall(call: Saved) {
  memory = [...loadCalls().filter((c) => !(call.mode === 'live' && c.mode === 'live' && c.id === call.id)), call].slice(-600);
  write(KEY, JSON.stringify(memory));
}
export function clearCalls() { memory = []; write(KEY, null); }

export function identity(): Identity | null { try { return JSON.parse(read('bellwether.identity') ?? 'null') as Identity | null; } catch { return null; } }
export const setIdentity = (id: Identity | null) => write('bellwether.identity', id ? JSON.stringify(id) : null);

export const flag = (name: string) => read(`bellwether.flag.${name}`) === '1';
export const setFlag = (name: string) => write(`bellwether.flag.${name}`, '1');
export const note = (key: string) => read(`bellwether.note.${key}`);
export const setNote = (key: string, value: string) => write(`bellwether.note.${key}`, value);
