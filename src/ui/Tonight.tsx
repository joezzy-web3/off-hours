import { useEffect, useState } from 'react';
import type { OpenBoard } from '../core/board';
import type { Cost } from '../core/book';
import { STOCKS } from '../core/board';
import { Bell, Chance, Loading, Plans } from './bits';
import { Chart } from './Chart';
import { api, nameOf, useData } from './data';
import { nyDay, nyTime, pct, px, span } from './format';
import { identity, loadCalls, saveCall } from './store';

/** The round in play: every contract's standing, what trading costs, the house's sealed calls, and yours. */
export function Tonight() {
  const { tonight: T, summary, cost } = useData();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(id); }, []);
  if (!T || !summary) return <Loading what="tonight's round" />;
  const w = T.window;
  const stale = now - T.asOf > 3 * 3_600_000;
  const asOf = <p className="asof"><Bell /> Prices as of {nyDay(T.asOf)} {nyTime(T.asOf)} New York. {stale ? 'That is more than three hours old: the hourly agent has not published since.' : 'The agent publishes a new hour every hour.'}</p>;
  if (!w) {
    return (
      <main className="page">
        <header className="page-head">
          <p className="eyebrow">Tonight</p>
          <h1>New York is open. No round is on.</h1>
          <p className="lede">A round opens at the cash close, 16:00 New York, and runs until 90 minutes after the next opening bell. Until then you can play past nights, or look at what trading costs right now.</p>
          {asOf}
        </header>
        <a className="go" href="#play">Play past nights</a>
        <CostPanel cost={cost} />
        <DemoOrder />
      </main>
    );
  }
  const over = now > w.grade;
  return (
    <main className="page">
      <header className="page-head">
        <p className="eyebrow">{over ? 'Last recorded round' : 'Round in play'} · {w.kind === 'weekend' ? 'over a weekend' : 'overnight'} · closed {nyDay(w.close)}</p>
        <h1>{over ? 'This round has rung out.' : now > w.bell ? 'The bell has rung. Grading soon.' : <>The bell rings in <span className="count">{span(w.bell - now)}</span></>}</h1>
        <p className="lede">New York closed on {nyDay(w.close)} at {nyTime(w.close)} and opens on {nyDay(w.bell)} at {nyTime(w.bell)}. The house calls a contract the hour its move reaches half a normal day's move, and seals that call before anyone sees the outcome.</p>
        {asOf}
      </header>

      <section aria-labelledby="calls">
        <h2 id="calls" className="section-title">The house's sealed calls</h2>
        {T.calls.length === 0
          ? <p className="empty glass">Nothing has moved half a normal day yet, so the house has not called anything this round. It is watching {T.standings.length} contracts and checks again every hour until 90 minutes before the bell. When it calls one, the board appears here for you to call too.</p>
          : <div className="live-list">{T.calls.map((c) => <Live key={c.id} call={c} gradeAt={w.grade} locked={now >= c.bell} />)}</div>}
      </section>

      <section aria-labelledby="standings">
        <h2 id="standings" className="section-title">Where every contract stands</h2>
        <div className="scroll">
          <table className="result standings">
            <thead><tr><th scope="col">Contract</th><th scope="col">Close</th><th scope="col">Now</th><th scope="col">Move</th><th scope="col" className="wide">Distance to a call</th><th scope="col">Status</th></tr></thead>
            <tbody>
              {[...T.standings].sort((a, b) => Math.abs(b.m) / b.s - Math.abs(a.m) / a.s).map((r) => {
                const z = Math.abs(r.m) / r.s;
                return (
                  <tr key={r.symbol}>
                    <th scope="row">{r.ticker} <small>{r.name}</small></th>
                    <td>{px(r.c0)}</td>
                    <td>{px(r.last)}</td>
                    <td className={r.m > 0 ? 'good' : r.m < 0 ? 'bad' : ''}>{pct(r.m)}</td>
                    <td className="wide"><span className="meter" title={`${z.toFixed(2)} of a normal day's move; the house calls at ${summary.threshold}`}><i style={{ width: `${Math.min(100, (z / summary.threshold) * 100)}%` }} /></span><small>{Math.round((z / summary.threshold) * 100)}%</small></td>
                    <td>{r.called ? <span className="chip-end is-call">called</span> : <span className="chip-end">quiet</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <CostPanel cost={cost} />
      <DemoOrder />
    </main>
  );
}

function Live({ call, gradeAt, locked: bellRung }: { call: OpenBoard; gradeAt: number; locked: boolean }) {
  const mine = loadCalls().find((c) => c.mode === 'live' && c.id === call.id);
  const [p, setP] = useState(mine ? Math.round(mine.p * 100) : 50);
  const [locked, setLocked] = useState(Boolean(mine));
  const [posted, setPosted] = useState('');
  const fc = call.forecast;
  const up = call.m > 0;
  const lock = async () => {
    saveCall({ id: call.id, p: p / 100, f: 0.5, at: Date.now(), mode: 'live' });
    setLocked(true);
    const me = identity();
    if (!me) { setPosted('Kept in this browser. Join the league to put live calls on the global table.'); return; }
    const out = await api<{ ok: boolean; message?: string }>('league', { action: 'call', name: me.name, token: me.token, id: call.id, p: p / 100 });
    setPosted(!out ? 'Kept in this browser. The league server could not be reached.' : out.ok ? `Entered in the league as ${me.name}.` : `Not entered in the league: ${out.message}`);
  };
  return (
    <div className="round">
      <div className="board">
        <div className="board-head">
          <p className="eyebrow">Called {nyDay(call.at)} {nyTime(call.at)} New York · hash <code>{call.callHash.slice(0, 16)}</code></p>
          <div className="headline">
            <h1><span className="ticker">{call.ticker}</span> <span className={up ? 'move is-up' : 'move is-down'}>{pct(call.m)}</span></h1>
            <p>{nameOf(call.ticker)} perp when the house called it, {(Math.abs(call.m) / call.s).toFixed(1)}× a normal day's move.</p>
          </div>
        </div>
        <div className="chart-wrap"><Chart board={call} show={locked || bellRung ? 'house' : 'fog'} /></div>
      </div>
      {locked || bellRung ? (
        <div className="said">
          <div><span className="tag tag-you">You</span><b>{locked ? `${p}%` : 'no call'}</b><small>{locked ? 'locked' : 'the bell rang before you called'}</small></div>
          <div><span className="tag tag-house">House</span><b>{fc ? `${Math.round(fc.pHold * 100)}%` : 'no forecast'}</b><small>{fc ? `range ${px(fc.lo)} to ${px(fc.hi)}, from ${fc.n} earlier nights` : 'too few earlier nights to forecast from'}</small></div>
          <p className="proof">Graded {nyDay(gradeAt)} at {nyTime(gradeAt)} New York against the Bitget price at that hour. {posted}</p>
        </div>
      ) : (
        <form className="controls" onSubmit={(e) => { e.preventDefault(); lock(); }}>
          <fieldset>
            <legend>Will at least half of that move still be standing 90 minutes after the bell?</legend>
            <Chance id={`live-${call.id}`} value={p} onChange={setP} />
          </fieldset>
          <button className="go" type="submit">Lock it in to see the house's call</button>
        </form>
      )}
    </div>
  );
}

const usd = (x: number | null) => (x === null ? 'beyond the book' : `${Math.round(x).toLocaleString('en-US')} USDT`);

/** What it costs to trade each contract: the hourly record, or Bitget's book read this second. */
export function CostPanel({ cost }: { cost?: Cost }) {
  const [fresh, setFresh] = useState<Cost | null>(null);
  const [size, setSize] = useState(1000);
  const [busy, setBusy] = useState('');
  const shown = fresh ?? cost;
  const refresh = async () => {
    setBusy('Reading the order books…');
    const out = await api<Cost & { error?: string }>('book');
    if (out && !out.error && out.rows?.length) { setFresh(out); setBusy(''); } else setBusy('The live reader runs on the deployed site. Showing the latest hourly record.');
  };
  const fits = (r: Cost['rows'][number]) => (r.depth10 !== null && r.depth10 >= size ? 'inside 10 bps' : r.depth25 !== null && r.depth25 >= size ? 'inside 25 bps' : r.depth50 !== null && r.depth50 >= size ? 'inside 50 bps' : 'moves the price more than 50 bps');
  return (
    <section aria-labelledby="cost">
      <h2 id="cost" className="section-title">What it costs to trade right now</h2>
      <p className="body">The study detected no average edge in waiting or rushing, but it measured prices only. Cost is the other half of the decision, and history cannot show it, so it is recorded here. The spread is what you pay to cross. Depth is how much can trade before the price moves.</p>
      <div className="cost-bar">
        <label htmlFor="order-size">Your order, in USDT</label>
        <input id="order-size" inputMode="numeric" value={size} onChange={(e) => setSize(Math.min(1_000_000, Number(e.target.value.replace(/\D/g, '')) || 0))} />
        <button className="ghost" type="button" onClick={refresh}>Read Bitget's books now</button>
        <span role="status">{busy || (shown?.rows.length ? `${fresh ? 'Read live' : 'Hourly record'}, ${nyDay(shown.rows[0].t)} ${nyTime(shown.rows[0].t)} New York` : '')}</span>
      </div>
      {!shown || !shown.rows.length ? (
        <p className="empty glass">No hourly order-book snapshot is on file yet; the recorder writes one every hour. Press the button to read Bitget's books this second.</p>
      ) : (
        <>
          <div className="scroll">
            <table className="result result-full">
              <thead><tr><th scope="col">Contract</th><th scope="col">Spread</th><th scope="col">Within 10 bps</th><th scope="col">Within 25 bps</th><th scope="col">Your order</th><th scope="col">Perp vs index</th><th scope="col">Typical spread, shut / open</th></tr></thead>
              <tbody>
                {[...shown.rows].sort((a, b) => a.ticker.localeCompare(b.ticker)).map((r) => (
                  <tr key={r.ticker}>
                    <th scope="row">{r.ticker}</th>
                    <td>{r.spreadBps.toFixed(2)} bps</td>
                    <td>{usd(r.depth10)}</td>
                    <td>{usd(r.depth25)}</td>
                    <td className={fits(r).startsWith('inside 10') ? 'good' : fits(r).startsWith('moves') ? 'bad' : ''}>{fits(r)}</td>
                    <td>{r.premiumBps === null ? '' : `${r.premiumBps > 0 ? '+' : ''}${r.premiumBps.toFixed(1)} bps`}</td>
                    <td>{r.closed.spreadBps === null ? 'none yet' : `${r.closed.spreadBps.toFixed(2)}`} / {r.cash.spreadBps === null ? 'none yet' : `${r.cash.spreadBps.toFixed(2)}`} bps</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="note">Depth is the thinner side of the book, in USDT, within that distance of the mid price. Typical spread is the median of {shown.snapshots} hourly snapshots since {shown.since ? nyDay(shown.since) : 'recording began'}, split by whether New York was shut or open. Candles hold no spread, so nothing earlier exists.</p>
        </>
      )}
    </section>
  );
}

interface Placed { placed?: boolean; venue?: string; note?: string; orderId?: string; price?: number; order?: Record<string, string>; error?: string; message?: string }

/** Place the "now" share of a plan on Bitget Demo Trading, or see the exact order without a key. */
export function DemoOrder() {
  const [symbol, setSymbol] = useState('NVDAUSDT');
  const [side, setSide] = useState<'buy' | 'sell'>('sell');
  const [usdt, setUsdt] = useState(200);
  const [share, setShare] = useState(0.5);
  const [key, setKey] = useState(''), [secret, setSecret] = useState(''), [pass, setPass] = useState('');
  const [out, setOut] = useState<Placed | null>(null);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    const res = await api<Placed>('order', { symbol, side, usdt, share, ...(key && secret && pass ? { byok: { key, secret, passphrase: pass } } : {}) });
    setOut(res ?? { error: 'no_server', message: 'Orders go through the deployed site. This copy of the page has no server behind it.' });
    setBusy(false);
  };
  return (
    <section aria-labelledby="demo">
      <h2 id="demo" className="section-title">Try your plan on Demo Trading</h2>
      <p className="body">Bitget's demo account trades pretend money at real prices. This places the share of your plan that trades now, as a market order at 1× leverage. The share you leave for the bell is yours to place then.</p>
      <form className="demo glass" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <div className="demo-grid">
          <label htmlFor="demo-symbol">Contract<select id="demo-symbol" value={symbol} onChange={(e) => setSymbol(e.target.value)}>{STOCKS.map((s) => <option key={s} value={s}>{s.replace('USDT', '')}</option>)}</select></label>
          <label htmlFor="demo-side">Side<select id="demo-side" value={side} onChange={(e) => setSide(e.target.value as 'buy' | 'sell')}><option value="sell">Sell</option><option value="buy">Buy</option></select></label>
          <label htmlFor="demo-usdt">Order size, USDT<input id="demo-usdt" inputMode="numeric" value={usdt} onChange={(e) => setUsdt(Number(e.target.value.replace(/\D/g, '')) || 0)} /></label>
        </div>
        <Plans value={share} onChange={setShare} name="demo-plan" />
        <details>
          <summary>Add a Demo Trading API key to really place it (optional)</summary>
          <p className="note">Without a key you get a dry run: the exact order, not sent. With one, the key is used for this single request and is never stored or logged. Every request is marked as demo, so a real-money key is refused by Bitget.</p>
          <div className="demo-grid">
            <label htmlFor="demo-key">API key<input id="demo-key" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} /></label>
            <label htmlFor="demo-secret">Secret<input id="demo-secret" type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} /></label>
            <label htmlFor="demo-pass">Passphrase<input id="demo-pass" type="password" autoComplete="off" value={pass} onChange={(e) => setPass(e.target.value)} /></label>
          </div>
        </details>
        <button className="go" type="submit" disabled={busy}>{key && secret && pass ? 'Place on Demo Trading' : 'Show the exact order'}</button>
        {out && (
          <div className={`verify-out ${out.error ? 'is-broken' : out.placed ? 'is-ok' : ''}`} role="status">
            {out.error ? out.message : out.placed ? `Placed on Bitget Demo Trading at about ${px(out.price!)}. Order id ${out.orderId}.` : out.note}
            {out.order && <pre>{JSON.stringify(out.order, null, 2)}</pre>}
          </div>
        )}
      </form>
    </section>
  );
}
