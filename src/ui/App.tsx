import { useEffect, useState } from 'react';
import { Ask } from './Ask';
import { Mark } from './bits';
import { boot, useData } from './data';
import { nyDay, nyTime } from './format';
import { Home } from './Home';
import { House } from './House';
import { League } from './League';
import { Play } from './Play';
import { Rules } from './Rules';
import { Tonight } from './Tonight';
import { You } from './You';

const TABS: [string, string, string][] = [
  ['home', 'Home', ''], ['play', 'Play', 'Call real past nights and see how they ended.'], ['tonight', 'Tonight', 'The round in play right now.'],
  ['house', 'The House', 'The agent\'s record, the study, and proof nothing was edited.'], ['league', 'League', 'People and agents on one table, live rounds only.'],
  ['ask', 'Ask', 'Ask the record a question in plain words.'], ['you', 'Your Form', 'Your own calls, scored.'], ['rules', 'Rules', 'How it is scored and what is proven.'],
];
const tabOf = () => { const h = location.hash.replace('#', ''); return TABS.some(([k]) => k === h) ? h : 'home'; };

export function App() {
  const [tab, setTab] = useState(tabOf);
  const [visit, setVisit] = useState(0); // pressing the tab you are on starts it afresh
  const { summary, source, failed } = useData();
  useEffect(() => {
    boot();
    const on = () => { setTab(tabOf()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const hint = TABS.find(([k]) => k === tab)![2];

  return (
    <div className={`shell shell-${tab}`}>
      <header className="top">
        <a className="mark" href="#home" aria-label="Bellwether, home"><Mark /> <span>Bell<i>wether</i></span></a>
        <nav className="tabs" aria-label="Sections">
          {TABS.map(([key, label]) => <a key={key} href={`#${key}`} className={tab === key ? 'is-on' : ''} aria-current={tab === key ? 'page' : undefined} onClick={() => { if (tab === key) { setVisit(visit + 1); window.scrollTo(0, 0); } }}>{label}</a>)}
        </nav>
        <a className="go go-sm" href="#play">Play now</a>
      </header>
      {hint && <p className="tab-hint">{hint}</p>}
      {failed && <p className="verify-out is-error" role="alert">{failed}</p>}

      {tab === 'home' && <Home />}
      {tab === 'play' && <Play key={visit} />}
      {tab === 'tonight' && <Tonight />}
      {tab === 'house' && <House />}
      {tab === 'league' && <League />}
      {tab === 'ask' && <Ask />}
      {tab === 'you' && <You />}
      {tab === 'rules' && <Rules />}

      <footer className="foot">
        <p>Prices: Bitget USDT-FUTURES hourly candles, public market API. Every board is a real night. The house's calls are written and hashed before each bell{summary ? <>; record tail <code>{String(summary.ledger.tail).slice(0, 12)}</code>, last published {nyDay(summary.updatedAt)} {nyTime(summary.updatedAt)} New York{source === 'snapshot' ? ' (the copy this page was built with)' : ''}</> : null}.</p>
        <p>A game about judgement, not advice. No trading cost is charged in the timing score, and orders go to Demo Trading only.</p>
      </footer>
    </div>
  );
}
