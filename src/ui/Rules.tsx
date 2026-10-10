import { points } from '../core/rules';
import { Loading } from './bits';
import { DOC } from './config';
import { useData } from './data';
import { signed } from './format';

/** The rules of the game and what has and has not been shown. */
export function Rules() {
  const { summary: DATA } = useData();
  if (!DATA) return <Loading what="the rules" />;
  const STUDY_URL = DOC('research/PREREGISTRATION.md');
  return (
    <main className="page">
      <header className="page-head">
        <p className="eyebrow">Rules · fixed before the test data was read</p>
        <h1>One question, asked the same way every night.</h1>
        <p className="lede">Bitget's stock perps trade around the clock. The shares behind them trade in New York from 09:30 to 16:00. When a perp moves while New York is shut, will that move still be there once the real market has had its say?</p>
      </header>

      <section className="clock glass" aria-label="The four moments of a round">
        <div><b>16:00</b><h2>The close</h2><p>New York shuts. The perp's price at this hour is the starting line.</p></div>
        <div><b>Any hour after</b><h2>The call</h2><p>The first hour the perp is half a normal day's move away from the close, the house calls it. You call it too.</p></div>
        <div><b>09:30</b><h2>The bell</h2><p>New York opens and real buyers and sellers arrive.</p></div>
        <div><b>11:00</b><h2>The grade</h2><p>90 minutes after the bell. If at least half the move is still standing, it held.</p></div>
      </section>

      <section className="split">
        <div>
          <h2 className="section-title">Scoring a call</h2>
          <p className="body">You give a chance that the move holds. The score rewards being right and punishes being sure and wrong, so the best strategy is to say what you really think. Saying 50% scores 0 either way.</p>
          <div className="scroll">
            <table className="result">
              <thead><tr><th scope="col">You say</th><th scope="col">If it holds</th><th scope="col">If it fades</th></tr></thead>
              <tbody>
                {[50, 60, 70, 80, 90, 100].map((p) => (
                  <tr key={p}><th scope="row">{p}% holds</th><td className="good">{signed(points(p / 100, true))}</td><td className={p === 50 ? '' : 'bad'}>{signed(points(p / 100, false))}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <h2 className="section-title">Placing the order</h2>
          <p className="body">Each board gives you an order in the direction of the move: sell after a fall, buy after a rise. Fill it all now, half now and half after the bell, or all after the bell. Your timing is scored in basis points against half and half, at Bitget's hourly prices.</p>
          <h2 className="section-title">How the house plays</h2>
          <p className="body">It finds every earlier night of the same kind (overnight or weekend, ordinary move or jump). With at least {DATA.minPrior} of them, it says how often they held and gives the range that 80% of them ended in. Its order follows one rule: all now if 60% or more went further, wait if 40% or fewer did, otherwise half and half.</p>
        </div>
      </section>

      <section className="split">
        <div className="glass shown">
          <h2>Shown so far</h2>
          <ul>
            <li>The house never reads a price from the future. A test changes every later price and checks that no earlier call's hash moves.</li>
            <li>The record cannot be edited quietly. The House tab re-hashes all {DATA.ledger.entries.toLocaleString('en-US')} entries in your browser.</li>
            <li>Replay and live run the same code, one hour at a time.</li>
            <li>Bitget's history for all {DATA.contracts.length} contracts was recorded with no missing hours.</li>
            <li>A second implementation, written separately in Python, reproduces the study's headline figures to ten decimal places and every call row by row.</li>
            <li>The house's 80% range is calibrated on average over the test set fixed in advance.</li>
            <li>An independent reviewer re-derived every call from the raw candles and confirmed the arithmetic.</li>
          </ul>
        </div>
        <div className="glass shown not">
          <h2>Not shown</h2>
          <ul>
            <li>Any edge in timing. None was detected{DATA.study ? `, and the data could not rule out an average of about ${Math.round(((DATA.study.y.hi - DATA.study.y.lo) / 2) * 1e4)} basis points either way` : ''}.</li>
            <li>Anything about traded weekends before February 2026. Until then these contracts were halted from Friday's close to Sunday evening New York.</li>
            <li>That the house can tell a strong night from a weak one. Its higher forecasts did not hold more often than its lower ones.</li>
            <li>What trading cost before 10 October 2026. Candles hold no spread; the order book has been recorded every hour only since then.</li>
            <li>Anything about real money. The timing score charges no cost, and orders go to Demo Trading only.</li>
          </ul>
        </div>
      </section>
      <p className="note">The full rules, with the changes made and why, are in the <a href={STUDY_URL} target="_blank" rel="noreferrer">pre-registration on GitHub</a>, with the order in which things happened.</p>
    </main>
  );
}
