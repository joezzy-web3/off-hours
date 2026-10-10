import { useMemo, useRef, useState } from 'react';
import type { Dealt } from '../core/board';
import { Entry, firstBreak } from '../core/ledger';
import { Interval, Loading } from './bits';
import { DOC } from './config';
import { Claims, file, isLive, Iv, StudyFile, useData } from './data';
import { nyDay, nyTime, pct, px, signed } from './format';

const PAGE = 25;
const year = (t: number) => new Date(t).getUTCFullYear();
const bp = (x: number) => { const v = (x * 1e4).toFixed(1); return v === '-0.0' ? '0.0' : `${x > 0 ? '+' : ''}${v}`; };
const pc = (x: number) => `${(x * 100).toFixed(1)}%`;

/** The house's whole record: the study, what it said against what happened, and a way to check nothing was edited. */
export function House() {
  const { summary: s, boards, study } = useData();
  const [page, setPage] = useState(0);
  const byTime = useMemo(() => [...(boards ?? [])].sort((a, b) => a.at - b.at), [boards]);
  const bands = useMemo(() => {
    const out: { lo: number; n: number; held: number; said: number }[] = [];
    for (let lo = 0; lo < 100; lo += 10) {
      const inBand = byTime.filter((b) => { const p = b.forecast.pHold * 100; return p >= lo && (p < lo + 10 || (lo === 90 && p <= 100)); });
      if (inBand.length) out.push({ lo, n: inBand.length, held: inBand.filter((b) => b.held).length / inBand.length, said: inBand.reduce((a, b) => a + b.forecast.pHold, 0) / inBand.length });
    }
    return out;
  }, [byTime]);
  if (!s || !boards) return <Loading what="the house's record" />;
  const recent = [...byTime].reverse();
  const rows = recent.slice(page * PAGE, page * PAGE + PAGE);
  const pages = Math.ceil(recent.length / PAGE);

  return (
    <main className="page">
      <header className="page-head">
        <p className="eyebrow">The house · an agent with one rule</p>
        <h1>It only knows what happened on earlier nights.</h1>
        <p className="lede">When a contract moves half a normal day while New York is shut, the house looks up every earlier night of the same kind, says how often such moves held, and gives a price range. No model writes the forecast. Every call is hashed before its bell, and a scheduled job runs it every hour with nobody watching.</p>
      </header>

      <section className="tiles">
        <div className="glass"><h2>Calls graded</h2><b>{s.graded.toLocaleString('en-US')}</b><p>across {s.windows} closed sessions and {s.contracts.length} contracts</p></div>
        <div className="glass"><h2>Inside its range</h2><b>{pc(s.house.coverage)}</b><p>of prices landed in the range it called 80%</p></div>
        <div className="glass"><h2>Moves that held</h2><b>{pc(s.house.held)}</b><p>still had half the move standing after the bell</p></div>
        <div className="glass"><h2>Points a call</h2><b>{signed(s.house.points, 2)}</b><p>50% every time scores 0. The plain base rate scores about the same as the house</p></div>
      </section>
      <p className="note">Every night on record since {nyDay(s.from)} {year(s.from)}. {s.live.boards + s.live.open > 0 ? `${s.live.boards} of these calls were made live by the scheduled agent, before their outcome existed, and ${s.live.open} more are waiting for a bell.` : 'The scheduled agent has not yet had a live call graded; everything so far is a replay of recorded history.'} Replayed and live calls are kept in separate records.</p>

      {study && <Study study={study} />}

      <section aria-labelledby="said">
        <h2 id="said" className="section-title">What it said against what happened</h2>
        <div className="scroll">
          <table className="result">
            <thead><tr><th scope="col">House said it holds</th><th scope="col">Calls</th><th scope="col">Average forecast</th><th scope="col">Actually held</th><th scope="col" className="wide">Held share, with the forecast marked</th></tr></thead>
            <tbody>
              {bands.map((b) => (
                <tr key={b.lo}>
                  <th scope="row">{b.lo}% to {b.lo + 10}%</th>
                  <td>{b.n}</td>
                  <td>{pc(b.said)}</td>
                  <td>{pc(b.held)}</td>
                  <td className="wide"><span className="meter meter-wide" title={`held ${pc(b.held)}, forecast ${pc(b.said)}`}><i style={{ width: `${b.held * 100}%` }} /><u style={{ left: `${b.said * 100}%` }} /></span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note">The bar is how often the move held and the white mark is what the house forecast. Read it plainly: about two moves in three hold, so beating 50% is easy and proves nothing. The house knows the base rate and nothing more: its higher forecasts did not hold more often than its lower ones, and it cannot tell a strong night from a weak one. The base rate is the bar to beat.</p>
      </section>

      <section aria-labelledby="running">
        <h2 id="running" className="section-title">Its running score</h2>
        <Running byTime={byTime} />
      </section>

      <Verify tail={s.ledger.tail} entries={s.ledger.entries} />

      <section aria-labelledby="record">
        <h2 id="record" className="section-title">Every call, newest first</h2>
        <div className="scroll">
          <table className="result result-full">
            <thead><tr><th scope="col">Called (New York)</th><th scope="col">Move</th><th scope="col">Said</th><th scope="col">Range</th><th scope="col">Ended</th><th scope="col">Result</th><th scope="col">Points</th><th scope="col">Made</th><th scope="col">Hash</th></tr></thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id}>
                  <th scope="row">{b.ticker} <small>{nyDay(b.at)} {year(b.at)} {nyTime(b.at)}</small></th>
                  <td>{pct(b.m)}</td>
                  <td>{Math.round(b.forecast.pHold * 100)}%</td>
                  <td>{px(b.forecast.lo)} – {px(b.forecast.hi)}</td>
                  <td>{px(b.out)}</td>
                  <td><span className={b.held ? 'chip-end is-held' : 'chip-end is-faded'}>{b.held ? 'held' : 'faded'}</span></td>
                  <td className={b.housePoints > 0 ? 'good' : 'bad'}>{signed(b.housePoints, 1)}</td>
                  <td>{isLive(b) ? <span className="chip-end is-call">live</span> : 'replay'}</td>
                  <td><code>{b.callHash.slice(0, 8)}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pager">
          <button className="ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>Newer</button>
          <span>{page * PAGE + 1} to {Math.min(recent.length, page * PAGE + PAGE)} of {recent.length.toLocaleString('en-US')}</span>
          <button className="ghost" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Older</button>
        </div>
      </section>
    </main>
  );
}

function Line({ label, fixed, rolling, fmt, min, max, mark, target }: { label: string; fixed: Iv; rolling: Iv; fmt: (x: number) => string; min: number; max: number; mark: number; target: string }) {
  const cell = (v: Iv) => (v.n ? <><b>{fmt(v.mean)}</b> <small>{fmt(v.lo)} to {fmt(v.hi)}</small><Interval lo={v.lo} hi={v.hi} mean={v.mean} min={min} max={max} mark={mark} label={`${label}: ${fmt(v.mean)}, 95% interval ${fmt(v.lo)} to ${fmt(v.hi)}; tested against ${target}`} /></> : <small>none yet</small>);
  return <tr><th scope="row">{label}<small className="sub">tested against {target}</small></th><td className="iv">{cell(fixed)}</td><td className="iv">{cell(rolling)}</td></tr>;
}

/** The three claims, on the test set fixed in advance and on everything recorded since. */
function Study({ study }: { study: StudyFile }) {
  const f = study.fixed;
  const [open, setOpen] = useState(false);
  if (!f) return null;
  const r: Claims = study;
  const verdict1 = f.claim1.y.lo > 0 ? 'Moves extend after the call.' : f.claim1.y.hi < 0 ? 'Moves fade after the call.' : 'No measurable average drift after the call.';
  const verdict2 = f.claim2.coverage.lo <= 0.8 && f.claim2.coverage.hi >= 0.8 ? 'The 80% range is calibrated on average.' : 'The 80% range missed its target.';
  const verdict3 = f.claim3.vsSplit.lo > 0 ? 'The order rule adds timing value.' : 'The order rule had almost nothing to act on.';
  const margin = Math.round(((f.claim1.y.hi - f.claim1.y.lo) / 2) * 1e4);
  return (
    <section className="study" aria-labelledby="study">
      <h2 id="study" className="section-title">The study</h2>
      <p className="body">Three claims were written down before the test data was read. The fixed test covers every contract from its first bar to 28 August 2026 and is never re-run. The rolling test applies the same code to everything recorded since, and a scheduled job extends it every hour.</p>
      <div className="verdicts">
        <div className="glass"><i>1</i><h3>{verdict1}</h3><p>The margin includes zero, so no difference between acting at once and waiting was detected. An average of about {margin} basis points either way cannot be ruled out.</p></div>
        <div className="glass"><i>2</i><h3>{verdict2}</h3><p>{pc(f.claim2.coverage.mean)} of prices landed inside it, and the margin includes 80%. It under-covered on large moves. {f.baseRate ? `Its hold forecast does not beat a plain running base rate: ${f.baseRate.housePoints.mean.toFixed(2)} points a call against ${f.baseRate.runningPoints.mean.toFixed(2)}, and the margin on the difference includes zero.` : 'Its hold forecast beats 50% only by knowing the base rate.'}</p></div>
        <div className="glass"><i>3</i><h3>{verdict3}</h3><p>It chose half and half on {f.claim3.plans.split.toLocaleString('en-US')} of {f.claim3.events.toLocaleString('en-US')} nights. That says the record gave it no reason to deviate, not that timing can never add value.</p></div>
      </div>
      <div className="scroll">
        <table className="result study-table">
          <thead><tr><th scope="col"></th><th scope="col">Fixed test · {f.events.toLocaleString('en-US')} moves, {f.windows} sessions</th><th scope="col">Since then · {study.events.toLocaleString('en-US')} moves, {study.windows} sessions</th></tr></thead>
          <tbody>
            <Line label="Move after the call" fixed={f.claim1.y} rolling={r.claim1.y} fmt={(x) => `${bp(x)} bp`} min={-0.01} max={0.01} mark={0} target="zero" />
            <Line label="Moves that held" fixed={f.claim1.held} rolling={r.claim1.held} fmt={pc} min={0.4} max={0.9} mark={0.5} target="50%" />
            <Line label="Prices inside the 80% range" fixed={f.claim2.coverage} rolling={r.claim2.coverage} fmt={pc} min={0.6} max={1} mark={0.8} target="80%" />
            <Line label="Points a call" fixed={f.claim2.points} rolling={r.claim2.points} fmt={(x) => signed(x, 2)} min={-4} max={10} mark={0} target="zero" />
            <Line label="Order rule vs half and half" fixed={f.claim3.vsSplit} rolling={r.claim3.vsSplit} fmt={(x) => `${bp(x)} bp`} min={-0.001} max={0.001} mark={0} target="zero" />
          </tbody>
        </table>
      </div>
      <p className="note">Each bar is a 95% interval from resampling whole closed sessions 10,000 times; the dot is the estimate and the tall line is the value it is tested against. A bar that crosses the line means the difference cannot be told from none. The first six weeks of the "since then" column were looked at before the rules were fixed, so read it as a check, not a second proof. Until February 2026 these contracts did not trade from Friday's close to Sunday evening New York, so earlier weekend moves are moves made as trading resumed; the full study splits the results around that date.</p>
      <div className="again">
        <button className="ghost" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Hide' : 'Show'} month by month and the {f.breakdownCount} breakdowns</button>
        <a className="ghost" href={DOC('docs/STUDY.md')} target="_blank" rel="noreferrer">Full study</a>
        <a className="ghost" href={DOC('research/AUDIT.md')} target="_blank" rel="noreferrer">Independent re-check</a>
        <a className="ghost" href={DOC('research/PREREGISTRATION.md')} target="_blank" rel="noreferrer">Rules fixed in advance</a>
      </div>
      {open && (
        <>
          <h3 className="section-title sub-title">Month by month</h3>
          <div className="scroll">
            <table className="result result-full">
              <thead><tr><th scope="col">Month</th><th scope="col">Moves</th><th scope="col">Sessions</th><th scope="col">Held</th><th scope="col">Went further</th><th scope="col">Move after the call</th><th scope="col">Inside the range</th><th scope="col">Points a call</th></tr></thead>
              <tbody>{study.months.map((m) => <tr key={m.month}><th scope="row">{m.month}</th><td>{m.events}</td><td>{m.windows}</td><td>{pc(m.held)}</td><td>{pc(m.extended)}</td><td>{bp(m.y)} bp</td><td>{m.coverage === null ? '' : pc(m.coverage)}</td><td>{m.points === null ? '' : signed(m.points, 2)}</td></tr>)}</tbody>
            </table>
          </div>
          <p className="note">No intervals here: one month is a small sample, and a single loud week moves it a long way. It is shown so drift would be visible.</p>
          <h3 className="section-title sub-title">Every breakdown fixed in advance</h3>
          <div className="scroll">
            <table className="result result-full">
              <thead><tr><th scope="col">Cut</th><th scope="col">Moves</th><th scope="col">Move after the call</th><th scope="col">95% interval</th><th scope="col">Interval allowing for {f.breakdownCount} cuts</th></tr></thead>
              <tbody>{f.breakdowns.map((b) => <tr key={b.group + b.name}><th scope="row">{b.name} <small>{b.group}</small></th><td>{b.plain.n}</td><td>{bp(b.plain.mean)} bp</td><td>{bp(b.plain.lo)} to {bp(b.plain.hi)}</td><td className={b.adjusted.lo > 0 || b.adjusted.hi < 0 ? 'good' : ''}>{bp(b.adjusted.lo)} to {bp(b.adjusted.hi)}</td></tr>)}</tbody>
            </table>
          </div>
          <p className="note">None of the {f.breakdownCount} cuts has an interval that excludes zero once the number of cuts is allowed for. These intervals are wide, so that is an absence of evidence and not proof there is nothing there.</p>
        </>
      )}
    </section>
  );
}

/** Cumulative points, call by call, with a readout that follows the pointer. */
function Running({ byTime }: { byTime: Dealt[] }) {
  const W = 760, H = 240, L = 44, R = 14, T = 14, B = 26;
  const series = useMemo(() => { let s = 0; return byTime.map((b) => (s += b.housePoints)); }, [byTime]);
  const [at, setAt] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  if (series.length < 2) return <p className="empty glass">Too few calls to draw.</p>;
  const lo = Math.min(0, ...series), hi = Math.max(0, ...series);
  const x = (i: number) => L + (i / (series.length - 1)) * (W - L - R);
  const y = (v: number) => T + ((hi - v) / (hi - lo || 1)) * (H - T - B);
  const d = series.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('');
  // the low tick is dropped when it would sit on top of zero
  const ticks = [lo, 0, hi].filter((v, i, a) => a.indexOf(v) === i && (v === 0 || Math.abs(v) > (hi - lo) * 0.12));
  const move = (clientX: number) => {
    const box = ref.current!.getBoundingClientRect();
    const i = Math.round((((clientX - box.left) / box.width) * W - L) / (W - L - R) * (series.length - 1));
    setAt(Math.max(0, Math.min(series.length - 1, i)));
  };
  const b = at === null ? null : byTime[at];
  return (
    <div className="running glass">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`The house's cumulative points over ${series.length} calls, ending at ${Math.round(series.at(-1)!)}`} onPointerMove={(e) => move(e.clientX)} onPointerLeave={() => setAt(null)}>
        {ticks.map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className={v === 0 ? 'run-zero' : 'run-grid'} /><text x={L - 8} y={y(v) + 4} textAnchor="end" className="run-tick">{Math.round(v)}</text></g>)}
        <text x={L} y={H - 6} className="run-tick">{nyDay(byTime[0].at)} {year(byTime[0].at)}</text>
        <text x={W - R} y={H - 6} textAnchor="end" className="run-tick">{nyDay(byTime.at(-1)!.at)} {year(byTime.at(-1)!.at)}</text>
        <path d={d} className="run-line" fill="none" />
        {at === null && <text x={L + 10} y={y(series[0]) < H / 2 ? H - B - 12 : T + 16} className="run-end">{signed(series.at(-1)!)} points after {series.length.toLocaleString('en-US')} calls</text>}
        {at !== null && <g><line x1={x(at)} x2={x(at)} y1={T} y2={H - B} className="run-cross" /><circle cx={x(at)} cy={y(series[at])} r="5" className="run-dot" /></g>}
      </svg>
      <p className="readout" aria-live="off">{b ? <><b>{signed(series[at!])}</b> after call {at! + 1}: {b.ticker} {nyDay(b.at)} {year(b.at)}, said {Math.round(b.forecast.pHold * 100)}%, {b.held ? 'held' : 'faded'}, {signed(b.housePoints, 1)}</> : <>Move across the chart to read any call. Flat would mean no better than always saying 50%.</>}</p>
    </div>
  );
}

/** Re-hash the whole record in this browser, then show that a single edit is caught. */
function Verify({ tail, entries }: { tail: string | null; entries: number }) {
  const [state, setState] = useState<{ kind: 'idle' | 'busy' | 'ok' | 'broken' | 'error'; text?: string }>({ kind: 'idle' });
  const cache = useRef<Entry[] | null>(null);
  const load = async () => {
    // the replayed record and the live record are separate files that join into one chain
    cache.current ??= [...(await file<Entry[]>('record.json')), ...(await file<Entry[]>('record-live.json'))];
    return cache.current;
  };
  const run = async (tamper: boolean) => {
    setState({ kind: 'busy' });
    try {
      let ledger = await load();
      let edited = -1;
      if (tamper) {
        // flip one forecast in a copy: the kind of quiet edit a cheating house would make
        ledger = JSON.parse(JSON.stringify(ledger)) as Entry[];
        edited = ledger.findIndex((e, i) => i > ledger.length / 2 && e.kind === 'call' && (e.body as { forecast: unknown }).forecast);
        ((ledger[edited].body as { forecast: { pHold: number } }).forecast).pHold = 0.99;
      }
      const t0 = performance.now();
      const broken = firstBreak(ledger);
      const ms = Math.round(performance.now() - t0);
      if (broken === -1) {
        const last = ledger.at(-1)!.hash;
        setState(last === tail || ledger.length !== entries
          ? { kind: 'ok', text: `${ledger.length.toLocaleString('en-US')} entries re-hashed in ${ms} ms. Every hash follows from the one before it, ending at ${last.slice(0, 16)}${last === tail ? ', the hash the agent last published' : ''}.` }
          : { kind: 'broken', text: `The chain is consistent but ends at ${last.slice(0, 16)}, not the hash the agent published.` });
      } else {
        setState({ kind: 'broken', text: tamper ? `Caught. One forecast in entry ${edited} was changed to 99%, and the check failed at entry ${broken}: its contents no longer produce its hash. Every entry after it is orphaned too.` : `The record fails at entry ${broken}: its contents do not produce its hash.` });
      }
    } catch (e) {
      setState({ kind: 'error', text: `Could not load the record (${(e as Error).message}). Try again in a moment.` });
    }
  };
  return (
    <section className="verify glass" aria-labelledby="verify">
      <div>
        <h2 id="verify">Check it yourself</h2>
        <p>The record is a chain: each entry carries the hash of the one before it. Your browser can recompute all {entries.toLocaleString('en-US')} hashes right now. Then try the second button, which edits one old forecast and checks again.</p>
      </div>
      <div className="verify-actions">
        <button className="go" onClick={() => run(false)} disabled={state.kind === 'busy'}>Re-hash the record</button>
        <button className="ghost" onClick={() => run(true)} disabled={state.kind === 'busy'}>Edit one call, then check</button>
      </div>
      {state.kind !== 'idle' && <p className={`verify-out is-${state.kind}`} role="status">{state.kind === 'busy' ? 'Hashing…' : state.text}</p>}
    </section>
  );
}
