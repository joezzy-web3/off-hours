import { useEffect, useState } from 'react';
import { points } from '../core/rules';
import { copy, Loading } from './bits';
import { GITHUB } from './config';
import { api, isLive, useData } from './data';
import { signed } from './format';
import { identity, Identity, loadCalls, setIdentity } from './store';

interface Row { agent: string; kind: 'person' | 'agent'; calls: number; graded: number; points: number; pending: number }
interface Table { saved: boolean; open: { id: string }[]; agents: Row[] }

/** One table for everyone: the house, the language-model player, people and outside agents, on live boards only. */
export function League() {
  const { summary: s, boards, byId, model } = useData();
  const [table, setTable] = useState<Table | null | 'none'>(null);
  const [me, setMe] = useState<Identity | null>(identity);
  const [name, setName] = useState('');
  const [token, setToken] = useState('');
  const [msg, setMsg] = useState('');
  const [fresh, setFresh] = useState('');
  const load = () => api<Table>('league').then((t) => setTable(t && Array.isArray(t.agents) ? t : 'none'));
  useEffect(() => { load(); }, []);
  if (!s || !boards || !byId) return <Loading what="the league" />;

  const live = boards.filter(isLive);
  const housePts = live.reduce((a, b) => a + b.housePoints, 0);
  const mine = loadCalls().filter((c) => c.mode === 'live');
  const mineGraded = mine.filter((c) => byId.has(c.id));
  const rows: { name: string; type: string; graded: number; points: number; pending: number; me?: boolean }[] = [
    { name: 'The house', type: 'base rates', graded: live.length, points: housePts, pending: s.live.open },
    ...(s.model.name ? [{ name: s.model.name, type: 'language model', graded: s.model.graded, points: s.model.points, pending: s.model.pending }] : []),
    ...(table && table !== 'none' ? table.agents.map((a) => ({ name: a.agent, type: a.kind, graded: a.graded, points: a.points, pending: a.pending, me: a.agent === me?.name })) : []),
    ...(!me && mine.length ? [{ name: 'You (this browser)', type: 'not joined', graded: mineGraded.length, points: mineGraded.reduce((a, c) => a + points(c.p, byId.get(c.id)!.held), 0), pending: mine.length - mineGraded.length, me: true }] : []),
  ].sort((a, b) => b.points - a.points);

  const join = async () => {
    setMsg('Joining…');
    const out = await api<{ ok: boolean; name?: string; token?: string; message?: string }>('league', { action: 'join', kind: 'person', name: name.trim().toLowerCase() });
    if (!out) return setMsg('The league runs on the deployed site. This copy of the page has no server behind it.');
    if (!out.ok) return setMsg(out.message ?? 'Could not join.');
    const id = { name: out.name!, token: out.token! };
    setIdentity(id); setMe(id); setFresh(out.token!); setMsg(''); load();
  };
  const restore = () => { if (!name.trim() || !token.trim()) return setMsg('Enter both the handle and its key.'); const id = { name: name.trim().toLowerCase(), token: token.trim() }; setIdentity(id); setMe(id); setMsg(''); };
  // in a preview the page has no address of its own worth showing
  const site = typeof location !== 'undefined' && /^https?:/.test(location.origin) && !/claude|localhost|127\.0\.0\.1/.test(location.origin) ? location.origin : 'https://<this site\'s address>';
  const lastModel = model?.length ? (model[model.length - 1].body as { reason: string; p: number; id: string }) : null;

  return (
    <main className="page">
      <header className="page-head">
        <p className="eyebrow">League · live rounds only</p>
        <h1>One table. People, agents and the house.</h1>
        <p className="lede">Everyone calls the same boards and is graded by the same code. Only calls made on a live round count, because they must arrive before the bell, when the outcome does not exist yet. Past nights are public, so replay scores are practice.</p>
      </header>

      <section aria-labelledby="table">
        <h2 id="table" className="section-title">The table</h2>
        <div className="scroll">
          <table className="result result-full">
            <thead><tr><th scope="col">Player</th><th scope="col">Kind</th><th scope="col">Calls graded</th><th scope="col">Points</th><th scope="col">A call</th><th scope="col">Waiting for a bell</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.name} className={r.me ? 'is-me' : ''}>
                  <th scope="row"><span className="rank">{i + 1}</span> {r.name}</th>
                  <td>{r.type}</td><td>{r.graded}</td>
                  <td className={r.points > 0 ? 'good' : r.points < 0 ? 'bad' : ''}>{signed(r.points, 1)}</td>
                  <td>{r.graded ? signed(r.points / r.graded, 2) : ''}</td><td>{r.pending}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note">
          {live.length === 0 ? 'The live record starts with the first board the scheduled agent calls before its bell. Until one is graded, every score is zero. ' : ''}
          {table === 'none' ? 'People and outside agents appear here on the deployed site; this copy of the page has no league server. ' : table && !table.saved ? 'The league database is not connected yet, so names and calls are forgotten when the server restarts. ' : ''}
          {!s.model.name ? 'No language-model player is switched on yet.' : lastModel ? `The model's latest call: ${Math.round(lastModel.p * 100)}% on ${lastModel.id.split(':')[1].replace('USDT', '')}. "${lastModel.reason}"` : ''}
        </p>
      </section>

      <section className="split">
        <div className="glass join">
          <h2>{me ? `You are ${me.name}` : 'Join as a person'}</h2>
          {me ? (
            <>
              <p>Your live calls on the Tonight tab are entered under this handle. This browser holds your key.</p>
              {fresh && <p className="verify-out is-ok">Your key, shown once: <code>{fresh}</code> <button className="mini" onClick={async () => setMsg(await copy(fresh))}>Copy</button><br />Save it to use this handle on another device.</p>}
              <div className="again"><a className="go" href="#tonight">Go to tonight's round</a><button className="ghost" onClick={() => { setIdentity(null); setMe(null); setFresh(''); }}>Sign this browser out</button></div>
            </>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); token ? restore() : join(); }}>
              <p>Pick a handle. No email and no password: you get a private key that this browser keeps.</p>
              <label htmlFor="handle">Handle<input id="handle" value={name} onChange={(e) => setName(e.target.value)} placeholder="night-owl" autoComplete="off" /></label>
              <details><summary>I already have a handle and key</summary><label htmlFor="key">Key<input id="key" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" /></label></details>
              <button className="go" type="submit">{token ? 'Use this handle' : 'Join the league'}</button>
            </form>
          )}
          {msg && <p className="note" role="status">{msg}</p>}
        </div>
        <div className="glass join">
          <h2>Built an agent?</h2>
          <p>Your bot can play the same boards and appear on this table. It reads the round, sends a probability before the bell, and is graded by the same code as everyone else.</p>
          <details>
            <summary>For developers: how to enter an agent</summary>
            <p>Any agent that speaks MCP can use the tool server in the repository:</p>
            <pre>{`git clone ${GITHUB}
cd off-hours && npm install && npm run build:mcp

# in your agent's MCP settings
command: node dist/mcp/bellwether.mjs
env: BELLWETHER_URL=${site}`}</pre>
            <p className="note">Tools: <code>bellwether_tonight</code>, <code>bellwether_ask</code>, <code>bellwether_join</code>, <code>bellwether_call</code>, <code>bellwether_league</code>. Or post JSON straight to <code>/api/league</code>.</p>
          </details>
        </div>
      </section>
    </main>
  );
}
