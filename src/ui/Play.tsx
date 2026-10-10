import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dealt as Board } from '../core/board';
import { points, timing } from '../core/rules';
import { deal } from '../core/season';
import { Chance, copy, Loading, planName, Plans } from './bits';
import { Chart } from './Chart';
import { nameOf, useData } from './data';
import { bps, nyDay, nyTime, pct, px, signed, span } from './format';
import { flag, note, saveCall, setFlag, setNote } from './store';

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const newSeed = () => 1000 + Math.floor(Math.random() * 9000);
const today = () => new Date().toISOString().slice(0, 10);
const dailySeed = (day: string) => Number(day.replace(/-/g, ''));

interface Pick { p: number; f: number; pts: number; house: number; gain: number; houseGain: number }
const score = (b: Board, p: number, f: number): Pick => ({ p, f, pts: points(p, b.held), house: b.housePoints, gain: timing(f, b.y).vsSplit, houseGain: timing(b.forecast.plan, b.y).vsSplit });

/** What became of the move, in words. */
function standing(retained: number): string {
  if (retained >= 1.05) return `The move had grown to ${retained.toFixed(1)}× its size.`;
  if (retained >= 0) return `${Math.round(retained * 100)}% of the move was still standing.`;
  return 'The move had been wiped out and the price was on the other side of the close.';
}

export function Play() {
  const { boards } = useData();
  const [seed, setSeed] = useState(newSeed);
  const [daily, setDaily] = useState(false);
  const [stage, setStage] = useState<'deal' | 'rounds' | 'card'>('deal');
  const [picks, setPicks] = useState<Pick[]>([]);
  const size = Math.min(10, boards?.length ?? 0);
  const deck = useMemo(() => (boards ? deal(boards, seed, size) : []), [boards, seed, size]);
  if (!boards) return <Loading what="the nights on record" />;
  const begin = (s: number, isDaily: boolean) => { setSeed(s); setDaily(isDaily); setPicks([]); setStage('rounds'); };
  const you = sum(picks.map((p) => p.pts)), house = sum(picks.map((p) => p.house));
  const day = today();
  const played = note(`daily.${day}`);

  if (stage === 'deal') {
    return (
      <main className="page page-narrow">
        <header className="page-head">
          <p className="eyebrow">Play · real nights from the record</p>
          <h1>Ten nights. You against the house.</h1>
          <p className="lede">Each board is a night when a Bitget stock perp moved while New York was shut. You see what the house saw at that hour and nothing after it. Make your call, then watch the night play out.</p>
        </header>
        <div className="modes">
          <section className="glass mode">
            <p className="eyebrow">Daily challenge · {nyDay(Date.now())}</p>
            <h2>Today's ten nights</h2>
            <p>Everyone gets the same ten today. {played ? `You scored ${played} today. Play again for practice, or come back tomorrow for a new set.` : 'Play them once, then share your score.'}</p>
            <button className="go" onClick={() => begin(dailySeed(day), true)}>{played ? 'Play today again' : 'Play today\'s ten'}</button>
          </section>
          <form className="glass mode" onSubmit={(e) => { e.preventDefault(); begin(seed, false); }}>
            <p className="eyebrow">Free play</p>
            <h2><label htmlFor="seed">Pick a season number</label></h2>
            <p id="seed-help">The same number deals the same {size} nights, so you can play a friend.</p>
            <div className="seed-row">
              <input id="seed" inputMode="numeric" value={seed} onChange={(e) => setSeed(Number(e.target.value.replace(/\D/g, '').slice(0, 6)) || 0)} aria-describedby="seed-help" />
              <button className="ghost" type="submit">Deal {size} nights</button>
            </div>
          </form>
        </div>
        <section className="how">
          <article className="glass"><i>1</i><h3>Call it</h3><p>Slide to your chance that the move holds. 50% scores nothing. Certainty scores +25 when right and −75 when wrong.</p></article>
          <article className="glass"><i>2</i><h3>Place it</h3><p>You have an order to fill by then. Do it all now, half and half, or wait for the bell.</p></article>
          <article className="glass"><i>3</i><h3>Hear the bell</h3><p>The night plays out on the chart. Code grades you and the house against the same Bitget price.</p></article>
        </section>
        <p className="note">Practice only: these nights are in the public record, so replay scores are not ranked. The league ranks calls on live rounds, made before the outcome exists.</p>
      </main>
    );
  }
  return (
    <main className="page page-narrow">
      <div className="tally" aria-live="polite">
        <span className="eyebrow">{daily ? `Daily challenge · ${day}` : `Season ${seed}`}</span>
        <span className="tag tag-you">You</span><b>{signed(you)}</b>
        <span className="tag tag-house">House</span><b>{signed(house)}</b>
      </div>
      {stage === 'rounds' ? (
        <>
          <ol className="pips" aria-label="Rounds">
            {deck.map((b, i) => {
              const p = picks[i];
              return <li key={b.id} className={!p ? (i === picks.length ? 'is-live' : '') : p.pts > 0 ? 'is-won' : p.pts < 0 ? 'is-lost' : 'is-flat'}>{i + 1}</li>;
            })}
          </ol>
          <Round key={`${seed}-${picks.length}`} board={deck[picks.length]} index={picks.length} total={deck.length}
            onDone={(pick) => {
              saveCall({ id: deck[picks.length].id, p: pick.p, f: pick.f, at: Date.now(), mode: 'replay' });
              const next = [...picks, pick];
              setPicks(next);
              if (next.length === deck.length) {
                if (daily && !played) setNote(`daily.${day}`, signed(sum(next.map((p) => p.pts))));
                setStage('card');
              }
            }} />
        </>
      ) : <Scorecard label={daily ? `daily challenge ${day}` : `season ${seed}`} deck={deck} picks={picks} onAgain={() => begin(seed, daily)} onNew={() => begin(newSeed(), false)} />}
    </main>
  );
}

function Guide({ onClose }: { onClose: () => void }) {
  return (
    <aside className="guide glass" aria-label="How to play this board">
      <h2>Your first board. Here is how to read it.</h2>
      <ol>
        <li><b>The headline</b> is how far the stock perp has moved since New York closed.</li>
        <li><b>The white line</b> is its price since the close. The <span className="k-lime">lime line</span> marks half of the move.</li>
        <li><b>The striped area</b> is the future. You cannot see it yet, and neither could the house.</li>
        <li><b>Your job:</b> slide to how sure you are the price ends on the far side of the lime line, pick when you would trade, and press <i>Lock it in</i>.</li>
      </ol>
      <button className="ghost" onClick={onClose}>Got it</button>
    </aside>
  );
}

function Round({ board, index, total, onDone }: { board: Board; index: number; total: number; onDone: (p: Pick) => void }) {
  const [p, setP] = useState(50);
  const [f, setF] = useState(0.5);
  const [phase, setPhase] = useState<'call' | 'house' | 'run' | 'done'>('call');
  const [guide, setGuide] = useState(() => index === 0 && !flag('guide'));
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const up = board.m > 0;
  const fc = board.forecast;
  const result = score(board, p / 100, f);
  const lock = () => {
    setFlag('guide'); setGuide(false);
    if (reduced()) { setPhase('done'); return; }
    setPhase('house');
    timers.current.push(window.setTimeout(() => setPhase('run'), 1100), window.setTimeout(() => setPhase('done'), 3200));
  };

  return (
    <div className={`round phase-${phase}`}>
      {guide && <Guide onClose={() => { setFlag('guide'); setGuide(false); }} />}
      <div className="board">
        <div className="board-head">
          <p className="eyebrow">Round {index + 1} of {total} · {board.kind === 'weekend' ? 'over a weekend' : 'overnight'} · {nyDay(board.close)} into {nyDay(board.bell)} {new Date(board.bell).getUTCFullYear()}</p>
          <div className="headline">
            <h1><span className="ticker">{board.ticker}</span> <span className={up ? 'move is-up' : 'move is-down'}>{pct(board.m)}</span></h1>
            <p>{nameOf(board.ticker)} perp, since the New York close. That is {(Math.abs(board.m) / board.s).toFixed(1)}× a normal day's move, with {span(board.bell - board.at)} to the bell.</p>
          </div>
        </div>
        <div className="chart-wrap">
          <Chart board={board} show={phase === 'call' ? 'fog' : phase} />
          {phase === 'done' && <div className={`stamp ${board.held ? 'is-held' : 'is-faded'}`}>{board.held ? 'Held' : 'Faded'}</div>}
        </div>
      </div>

      {phase === 'call' ? (
        <form className="controls" onSubmit={(e) => { e.preventDefault(); lock(); }}>
          <fieldset>
            <legend>1. Will at least half of that move still be standing 90 minutes after the bell?</legend>
            <Chance id="chance" value={p} onChange={setP} />
          </fieldset>
          <fieldset>
            <legend>2. You must {up ? 'buy' : 'sell'} {board.ticker} by then. When?</legend>
            <Plans value={f} onChange={setF} />
          </fieldset>
          <button className="go" type="submit">Lock it in</button>
        </form>
      ) : (
        <section className="reveal" aria-live="polite">
          <div className="said">
            <div className="said-you"><span className="tag tag-you">You</span><b>{p}%</b><small>{planName(f)}</small></div>
            <div className="said-house"><span className="tag tag-house">House</span><b>{Math.round(fc.pHold * 100)}%</b><small>{planName(fc.plan)} · range {px(fc.lo)} to {px(fc.hi)}</small></div>
          </div>
          {phase === 'done' && (
            <>
              <p className="verdict">{board.ticker} was at <b>{px(board.out)}</b> 90 minutes after the bell. {standing(board.retained)} {board.held ? 'It held.' : 'It faded.'}</p>
              <table className="result">
                <thead><tr><th scope="col"></th><th scope="col">Call</th><th scope="col">Timing vs half and half</th></tr></thead>
                <tbody>
                  <tr><th scope="row"><span className="tag tag-you">You</span></th><td className={result.pts > 0 ? 'good' : result.pts < 0 ? 'bad' : ''}>{signed(result.pts)}</td><td>{bps(result.gain)}</td></tr>
                  <tr><th scope="row"><span className="tag tag-house">House</span></th><td className={result.house > 0 ? 'good' : 'bad'}>{signed(result.house)}</td><td>{bps(result.houseGain)}</td></tr>
                </tbody>
              </table>
              <p className="proof">House call written {nyTime(board.at)} New York, {span(board.gradeAt - board.at)} before it was graded, from {fc.n} earlier nights. Hash <code>{board.callHash}</code></p>
              <button className="go" onClick={() => onDone(result)} autoFocus>{index + 1 === total ? 'See the scorecard' : 'Next night'}</button>
            </>
          )}
        </section>
      )}
    </div>
  );
}

/** A 1200 x 630 picture of the result, drawn in the browser, for sharing. */
function drawCard(canvas: HTMLCanvasElement, label: string, you: number, house: number, picks: Pick[]) {
  const c = canvas.getContext('2d')!;
  const W = 1200, H = 630;
  c.fillStyle = '#06050b'; c.fillRect(0, 0, W, H);
  const glow = c.createRadialGradient(W / 2, H * 1.25, 40, W / 2, H * 1.25, 760);
  glow.addColorStop(0, '#b7a4ff'); glow.addColorStop(0.35, '#7c5cff'); glow.addColorStop(1, 'rgba(60,34,160,0)');
  c.fillStyle = glow; c.fillRect(0, 0, W, H);
  const font = (w: number, px: number) => `${w} ${px}px "Inter Tight", "Helvetica Neue", Arial, sans-serif`;
  c.fillStyle = '#ffffff'; c.font = font(700, 40); c.fillText('Bellwether', 70, 96);
  c.fillStyle = '#c9bcff'; c.font = font(500, 26); c.fillText(label, 70, 140);
  c.fillStyle = '#ffffff'; c.font = font(600, 78);
  c.fillText(you > house ? 'I beat the house.' : you < house ? 'The house beat me.' : 'Level with the house.', 70, 262);
  const tile = (x: number, name: string, value: number, colour: string) => {
    c.fillStyle = 'rgba(15,11,36,0.62)'; c.beginPath(); c.roundRect(x, 318, 500, 190, 26); c.fill();
    c.fillStyle = colour; c.beginPath(); c.roundRect(x + 30, 344, 110, 36, 18); c.fill();
    c.fillStyle = '#10121a'; c.font = font(700, 20); c.fillText(name, x + 48, 369);
    c.fillStyle = '#ffffff'; c.font = font(700, 96); c.fillText(signed(value), x + 30, 480);
  };
  tile(70, 'ME', you, '#d8f34a'); tile(630, 'HOUSE', house, '#a794ff');
  picks.forEach((p, i) => { c.fillStyle = p.pts > 0 ? '#5fe7a9' : p.pts < 0 ? '#ff7a90' : '#a794ff'; c.beginPath(); c.roundRect(70 + i * 108, 548, 92, 14, 7); c.fill(); });
  c.fillStyle = '#e7e3f6'; c.font = font(500, 22); c.fillText('Real nights on Bitget stock perps. Did the move hold at the bell?', 70, 606);
}

function Scorecard({ label, deck, picks, onAgain, onNew }: { label: string; deck: Board[]; picks: Pick[]; onAgain: () => void; onNew: () => void }) {
  const you = sum(picks.map((p) => p.pts)), house = sum(picks.map((p) => p.house));
  const gain = sum(picks.map((p) => p.gain)), houseGain = sum(picks.map((p) => p.houseGain));
  const sure = picks.map((p, i) => ({ p, b: deck[i] })).filter(({ p }) => p.p >= 0.7 || p.p <= 0.3);
  const sureRight = sure.filter(({ p, b }) => (p.p >= 0.7) === b.held).length;
  const line = you > house ? 'You beat the house.' : you < house ? 'The house wins this one.' : 'Level with the house.';
  const share = `Bellwether, ${label}: me ${signed(you)}, house ${signed(house)} over ${deck.length} real nights.`;
  const [copied, setCopied] = useState('');
  const [image, setImage] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const draw = () => { if (!canvas.current) return; drawCard(canvas.current, label, you, house, picks); try { setImage(canvas.current.toDataURL('image/png')); } catch { /* the picture stays on the page */ } };
    draw();
    // draw again once the web font has arrived, so the card uses it
    (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready.then(draw).catch(() => undefined);
  }, []);
  return (
    <div className="card">
      <p className="eyebrow">{label} · final bell</p>
      <h1>{line}</h1>
      <div className="totals">
        <div><span className="tag tag-you">You</span><b>{signed(you)}</b><small>timing {bps(gain)}</small></div>
        <div><span className="tag tag-house">House</span><b>{signed(house)}</b><small>timing {bps(houseGain)}</small></div>
      </div>
      <p className="lede">{sure.length ? `You were sure (70% or more either way) on ${sure.length} of ${deck.length} nights and right on ${sureRight} of those.` : 'You never went past 70% either way, so you risked little and won little.'} Saying 50% every night scores exactly 0.</p>
      <div className="scroll">
        <table className="result result-full">
          <thead><tr><th scope="col">Night</th><th scope="col">Move</th><th scope="col">Ended</th><th scope="col">You said</th><th scope="col">You</th><th scope="col">House said</th><th scope="col">House</th></tr></thead>
          <tbody>
            {deck.map((b, i) => (
              <tr key={b.id}>
                <th scope="row">{b.ticker} <small>{nyDay(b.bell)} {new Date(b.bell).getUTCFullYear()}</small></th>
                <td>{pct(b.m)}</td>
                <td><span className={b.held ? 'chip-end is-held' : 'chip-end is-faded'}>{b.held ? 'held' : 'faded'}</span></td>
                <td>{Math.round(picks[i].p * 100)}%</td>
                <td className={picks[i].pts > 0 ? 'good' : picks[i].pts < 0 ? 'bad' : ''}>{signed(picks[i].pts)}</td>
                <td>{Math.round(b.forecast.pHold * 100)}%</td>
                <td className={b.housePoints > 0 ? 'good' : 'bad'}>{signed(b.housePoints)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className="sharecard" aria-labelledby="sharecard">
        <h2 id="sharecard" className="section-title">Your share card</h2>
        <canvas ref={canvas} width="1200" height="630" role="img" aria-label={share} />
        <p className="share"><span>{share}</span> <button type="button" onClick={async () => setCopied(await copy(share))}>Copy text</button> {image && <a className="share-save" href={image} download="bellwether-score.png">Save image</a>} <em aria-live="polite">{copied}</em></p>
      </section>
      <div className="again">
        <button className="go" onClick={onNew}>Deal a new season</button>
        <button className="ghost" onClick={onAgain}>Play these ten again</button>
        <a className="ghost" href="#you">See your form</a>
      </div>
    </div>
  );
}
