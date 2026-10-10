import { useState } from 'react';
import { points } from '../core/rules';
import { Loading } from './bits';
import { useData } from './data';
import { nyDay, signed } from './format';
import { clearCalls, loadCalls } from './store';

const BANDS: [number, number, string][] = [[0, 0.3, 'Sure it fades (0 to 30%)'], [0.35, 0.45, 'Leaning fade (35 to 45%)'], [0.5, 0.5, 'No view (50%)'], [0.55, 0.65, 'Leaning hold (55 to 65%)'], [0.7, 1, 'Sure it holds (70 to 100%)']];
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Your own record, from the calls kept in this browser. */
export function You() {
  const { byId, summary } = useData();
  const [calls, setCalls] = useState(loadCalls);
  const [confirm, setConfirm] = useState(false);
  if (!byId || !summary) return <Loading what="your record" />;
  const graded = calls.filter((c) => byId.has(c.id)).map((c) => ({ c, b: byId.get(c.id)! }));
  const pending = calls.filter((c) => c.mode === 'live' && !byId.has(c.id));
  const you = sum(graded.map(({ c, b }) => points(c.p, b.held))), house = sum(graded.map(({ b }) => b.housePoints));

  if (!calls.length) {
    return (
      <main className="page page-narrow">
        <header className="page-head">
          <p className="eyebrow">Your form</p>
          <h1>No calls yet.</h1>
          <p className="lede">Every call you lock is kept in this browser and scored here: how often you were right when you were sure, and how you stand against the house on the same boards.</p>
        </header>
        <a className="go" href="#play">Play your first season</a>
      </main>
    );
  }
  const sure = graded.filter(({ c }) => c.p >= 0.7 || c.p <= 0.3);
  const sureRight = sure.filter(({ c, b }) => (c.p >= 0.7) === b.held).length;
  return (
    <main className="page">
      <header className="page-head">
        <p className="eyebrow">Your form · kept in this browser only</p>
        <h1>{you > house ? 'You are ahead of the house.' : you < house ? 'The house is ahead of you.' : 'You and the house are level.'}</h1>
        <p className="lede">{graded.length} graded calls so far. {sure.length ? `When you were sure, you were right ${sureRight} times out of ${sure.length}.` : 'You have not yet gone past 70% either way.'}</p>
      </header>
      <section className="tiles">
        <div className="glass"><h2>Your points</h2><b>{signed(you)}</b><p>{signed(graded.length ? you / graded.length : 0, 1)} a call</p></div>
        <div className="glass"><h2>House, same boards</h2><b>{signed(house)}</b><p>{signed(graded.length ? house / graded.length : 0, 1)} a call</p></div>
        <div className="glass"><h2>Calls graded</h2><b>{graded.length}</b><p>{pending.length} waiting for a bell</p></div>
      </section>

      <section aria-labelledby="mine">
        <h2 id="mine" className="section-title">When you said it, how often did it happen?</h2>
        <div className="scroll">
          <table className="result">
            <thead><tr><th scope="col">Your call</th><th scope="col">Times</th><th scope="col">Move held</th><th scope="col">Points</th><th scope="col" className="wide">Held share</th></tr></thead>
            <tbody>
              {BANDS.map(([lo, hi, label]) => {
                const rows = graded.filter(({ c }) => c.p >= lo - 1e-9 && c.p <= hi + 1e-9);
                const held = rows.filter(({ b }) => b.held).length;
                const pts = sum(rows.map(({ c, b }) => points(c.p, b.held)));
                return (
                  <tr key={label}>
                    <th scope="row">{label}</th>
                    <td>{rows.length}</td>
                    <td>{rows.length ? `${held} of ${rows.length}` : 'none yet'}</td>
                    <td className={rows.length ? (pts >= 0 ? 'good' : 'bad') : ''}>{rows.length ? signed(pts) : ''}</td>
                    <td className="wide">{rows.length ? <span className="meter meter-wide" title={`${held} of ${rows.length} held`}><i style={{ width: `${(held / rows.length) * 100}%` }} /></span> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="note">A well-judged "sure it holds" row should hold most of the time, and a "sure it fades" row should hardly ever hold. Across the whole record the plain base rate is {(summary.house.held * 100).toFixed(0)}% held.</p>
      </section>

      {pending.length > 0 && (
        <section aria-labelledby="waiting">
          <h2 id="waiting" className="section-title">Waiting for the bell</h2>
          <ul className="pending">{pending.map((c) => <li key={c.id} className="glass"><b>{c.id.split(':')[1].replace('USDT', '')}</b> you said {Math.round(c.p * 100)}% on {nyDay(c.at)}</li>)}</ul>
        </section>
      )}

      <div className="again">
        <a className="go" href="#play">Play another season</a>
        {confirm
          ? <><button className="ghost is-danger" onClick={() => { clearCalls(); setCalls([]); setConfirm(false); }}>Yes, erase my record</button><button className="ghost" onClick={() => setConfirm(false)}>Keep it</button></>
          : <button className="ghost" onClick={() => setConfirm(true)}>Erase my record</button>}
      </div>
    </main>
  );
}
