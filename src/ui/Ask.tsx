import { useState } from 'react';
import { answer, Reply } from '../core/ask';
import { Loading } from './bits';
import { api, context, useData } from './data';

const EXAMPLES = ['What moved since the close?', 'How often do NVDA drops hold over a weekend?', 'Should I sell now or wait for the bell?', 'What does it cost to trade TSLA?', 'How has the house done?', 'When does the bell ring?'];
interface Turn { q: string; reply: Reply; reworded?: string | null }

/** One typed line, answered from the record. The numbers are computed; a model may only reword them. */
export function Ask() {
  const data = useData();
  const [q, setQ] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const ctx = context(data);
  if (!ctx) return <Loading what="the record" />;
  const ask = (line: string) => {
    if (!line.trim()) return;
    const reply = answer(line, { ...ctx, now: Date.now() });
    const turn: Turn = { q: line.trim(), reply };
    setTurns((t) => [turn, ...t]);
    setQ('');
    if (reply.tool !== 'help') api<{ text: string | null }>('ask', { question: line, reply }).then((out) => { if (out?.text) setTurns((t) => t.map((x) => (x === turn ? { ...x, reworded: out.text } : x))); });
  };
  return (
    <main className="page page-narrow">
      <header className="page-head">
        <p className="eyebrow">Ask the house</p>
        <h1>Ask the record a question.</h1>
        <p className="lede">Type it the way you would say it. The answer is computed from recorded Bitget data, and it tells you how it read your question so you can see if it got it wrong.</p>
      </header>
      <form className="ask glass" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
        <label htmlFor="question" className="sr">Your question</label>
        <input id="question" value={q} onChange={(e) => setQ(e.target.value)} placeholder="How often do Tesla drops hold overnight?" autoComplete="off" />
        <button className="go" type="submit">Ask</button>
      </form>
      <div className="examples" aria-label="Examples">{EXAMPLES.map((e) => <button key={e} className="chip-btn" onClick={() => ask(e)}>{e}</button>)}</div>
      <div className="turns" aria-live="polite">
        {turns.map((t, i) => (
          <article key={turns.length - i} className="glass turn">
            <p className="turn-q">{t.q}</p>
            <p className="eyebrow">Understood as: {t.reply.understood} · answered from: {t.reply.tool}</p>
            {t.reworded && <p className="turn-plain">{t.reworded}<small>Reworded by a language model. Every number was checked against the lines below.</small></p>}
            <ul>{t.reply.lines.map((l) => <li key={l}>{l}</li>)}</ul>
          </article>
        ))}
        {!turns.length && <p className="note">Nothing here is advice. It is what the record says about the past.</p>}
      </div>
    </main>
  );
}
