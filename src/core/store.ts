// Where the league keeps outside agents and their calls. Cloudflare D1 over its
// REST API when three environment variables are set, memory otherwise (a demo
// then works with no setup, but forgets when the function restarts).

export interface AgentRow { name: string; kind: 'person' | 'agent'; tokenHash: string; created: number }
export interface CallRow { agent: string; id: string; p: number; at: number }

export interface Store {
  kind: 'd1' | 'memory';
  agentGet(name: string): Promise<AgentRow | null>;
  /** false when the name is taken */
  agentAdd(row: AgentRow): Promise<boolean>;
  /** false when this agent has already called this board: the first call stands */
  callAdd(row: CallRow): Promise<boolean>;
  calls(): Promise<CallRow[]>;
  /** every registered name and whether it is a person or an agent */
  kinds(): Promise<Record<string, 'person' | 'agent'>>;
}

export class MemoryStore implements Store {
  kind = 'memory' as const;
  private agentsByName = new Map<string, AgentRow>();
  private list: CallRow[] = [];
  async agentGet(name: string) { return this.agentsByName.get(name) ?? null; }
  async agentAdd(row: AgentRow) { if (this.agentsByName.has(row.name)) return false; this.agentsByName.set(row.name, row); return true; }
  async callAdd(row: CallRow) { if (this.list.some((c) => c.agent === row.agent && c.id === row.id)) return false; this.list.push(row); return true; }
  async calls() { return [...this.list]; }
  async kinds() { const out: Record<string, 'person' | 'agent'> = {}; for (const a of this.agentsByName.values()) out[a.name] = a.kind; return out; }
}

interface D1Config { accountId: string; databaseId: string; token: string; base?: string }
const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS bw_agents (name TEXT PRIMARY KEY, kind TEXT NOT NULL DEFAULT 'agent', token_hash TEXT NOT NULL, created INTEGER NOT NULL)",
  'CREATE TABLE IF NOT EXISTS bw_calls (agent TEXT NOT NULL, id TEXT NOT NULL, p REAL NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (agent, id))',
];

export class D1Store implements Store {
  kind = 'd1' as const;
  private ready: Promise<void> | null = null;
  constructor(private cfg: D1Config) {}

  private async raw<T>(sql: string, params: unknown[] = []): Promise<{ rows: T[]; changes: number }> {
    const url = `${this.cfg.base ?? 'https://api.cloudflare.com'}/client/v4/accounts/${this.cfg.accountId}/d1/database/${this.cfg.databaseId}/query`;
    const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${this.cfg.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ sql, params }), signal: AbortSignal.timeout(8000) });
    const json = (await res.json()) as { success: boolean; errors?: unknown; result?: { results?: T[]; meta?: { changes?: number } }[] };
    if (!res.ok || !json.success) throw new Error(`D1 ${res.status}: ${JSON.stringify(json.errors ?? '')}`);
    return { rows: json.result?.[0]?.results ?? [], changes: json.result?.[0]?.meta?.changes ?? 0 };
  }
  private async q<T>(sql: string, params: unknown[] = []) {
    this.ready ??= (async () => { for (const s of SCHEMA) await this.raw(s); })();
    await this.ready;
    return this.raw<T>(sql, params);
  }
  async agentGet(name: string): Promise<AgentRow | null> {
    const { rows } = await this.q<{ name: string; kind: string; token_hash: string; created: number }>('SELECT * FROM bw_agents WHERE name = ?', [name]);
    return rows[0] ? { name: rows[0].name, kind: rows[0].kind === 'person' ? 'person' : 'agent', tokenHash: rows[0].token_hash, created: rows[0].created } : null;
  }
  // INSERT OR IGNORE changes no row when the primary key exists, which is how a second writer loses
  async agentAdd(row: AgentRow) { return (await this.q('INSERT OR IGNORE INTO bw_agents (name, kind, token_hash, created) VALUES (?, ?, ?, ?)', [row.name, row.kind, row.tokenHash, row.created])).changes > 0; }
  async kinds() {
    const out: Record<string, 'person' | 'agent'> = {};
    for (const r of (await this.q<{ name: string; kind: string }>('SELECT name, kind FROM bw_agents LIMIT 5000')).rows) out[r.name] = r.kind === 'person' ? 'person' : 'agent';
    return out;
  }
  async callAdd(row: CallRow) { return (await this.q('INSERT OR IGNORE INTO bw_calls (agent, id, p, at) VALUES (?, ?, ?, ?)', [row.agent, row.id, row.p, row.at])).changes > 0; }
  async calls() { return (await this.q<CallRow>('SELECT agent, id, p, at FROM bw_calls ORDER BY at LIMIT 5000')).rows; }
}

/** D1 when its three variables are set, memory otherwise. One instance per running function. */
export function storeFromEnv(): Store {
  const { CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_D1_DATABASE_ID: databaseId, CLOUDFLARE_API_TOKEN: token } = process.env;
  const g = globalThis as { __bwStore?: Store };
  if (g.__bwStore) return g.__bwStore;
  return (g.__bwStore = accountId && databaseId && token ? new D1Store({ accountId, databaseId, token, base: process.env.CLOUDFLARE_API_BASE }) : new MemoryStore());
}
