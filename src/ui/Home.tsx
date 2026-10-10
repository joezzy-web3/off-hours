import { Art } from './Art';
import bitget from './bitget.svg';
import { useData } from './data';

export function Home() {
  const { summary: s } = useData();
  return (
    <main className="landing">
      <section className="hero">
        <div className="hero-copy">
          <p className="chip"><span className="chip-logo" role="img" aria-label="Bitget" dangerouslySetInnerHTML={{ __html: bitget }} /> Bitget stock perps trade while Wall Street sleeps</p>
          <h1>Call the Move Before the Opening Bell</h1>
          <p className="lede">A stock just moved while New York was shut. Say how sure you are it still stands 90 minutes after the bell, place your order, and try to beat an agent that plays on base rates alone.</p>
          <div className="cta">
            <a className="go" href="#play">Start here: play a night</a>
            <a className="ghost" href="#tonight">Tonight's round</a>
          </div>
        </div>
        <div className="hero-art"><Art /></div>
      </section>

      <section className="stats glass" aria-label="The record so far">
        <div><h2>Real Nights</h2><p><b>{s ? s.house.boards.toLocaleString('en-US') : '…'}</b><span>forecasts graded on recorded Bitget candles{s ? `, ${s.windows} closed sessions` : ''}</span></p></div>
        <div><h2>House Range</h2><p><b>{s ? `${Math.round(s.house.coverage * 100)}%` : '…'}</b><span>of prices landed inside the house's 80% forecast range</span></p></div>
        <div><h2>Sealed Calls</h2><p><b>{s ? s.ledger.entries.toLocaleString('en-US') : '…'}</b><span>house entries hashed in order, each call before its bell</span></p></div>
      </section>

      <section className="tour glass" aria-labelledby="tour">
        <div>
          <h2 id="tour">Watch the two-minute tour</h2>
          <p>The real app, start to finish: play a night, read a board, see tonight's round, check the house's record, and ask it a question. Captions are on screen, so it works with the sound off.</p>
          <a className="ghost" href="#play">Or skip it and play</a>
        </div>
        <video controls preload="none" playsInline poster="tour.jpg" src="tour.mp4" aria-label="A two-minute tour of Bellwether with on-screen captions" />
      </section>

      <section aria-labelledby="start">
        <h2 id="start" className="section-title">New here? Three steps, in this order</h2>
        <div className="how">
          <a className="glass step" href="#play"><i>1</i><h3>Play a night</h3><p>Ten real nights from the record. You see what the house saw and make the same call. Two minutes, and the first board walks you through it.</p><span>Open Play</span></a>
          <a className="glass step" href="#tonight"><i>2</i><h3>See tonight's round</h3><p>What every contract has done since New York closed, what it costs to trade right now, and the calls the house has sealed.</p><span>Open Tonight</span></a>
          <a className="glass step" href="#house"><i>3</i><h3>Check the house</h3><p>Its whole record, the study behind it, and a button that re-checks every hash in your own browser.</p><span>Open The House</span></a>
        </div>
      </section>

      {s?.study && (
        <section className="finding glass" aria-labelledby="finding">
          <h2 id="finding">What {s.study.events.toLocaleString('en-US')} tested moves showed</h2>
          <ul>
            <li><b>No measurable average difference between acting at once and waiting.</b> After a move is called, the price 90 minutes after the bell is {(s.study.y.mean * 1e4).toFixed(1)} basis points further on average, with a margin of {(s.study.y.lo * 1e4).toFixed(1)} to +{(s.study.y.hi * 1e4).toFixed(1)}. That margin includes zero.</li>
            <li><b>About two moves in three hold.</b> {(s.study.held.mean * 100).toFixed(1)}% still had half their size standing 90 minutes after the bell.</li>
            <li><b>The house's range is calibrated on average.</b> {(s.study.coverage.mean * 100).toFixed(1)}% of prices landed inside the range it called 80%. It knows the base rate; it cannot tell a strong night from a weak one.</li>
            <li><b>What it did not measure:</b> the cost of trading at each hour. That is recorded from now on, on the Tonight tab.</li>
          </ul>
          <a className="ghost" href="#house">Read the study</a>
        </section>
      )}
    </main>
  );
}
