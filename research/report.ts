// Writes docs/STUDY.md from research/results.json, so every figure in the
// document is the figure the study computed and none is typed by hand.
//
//   tsx research/report.ts

import fs from 'node:fs';

const r = JSON.parse(fs.readFileSync('research/results.json', 'utf8'));
type Iv = { mean: number; lo: number; hi: number; n: number; windows: number };
const n = (x: number) => x.toLocaleString('en-US');
const bp = (x: number) => { const v = (x * 1e4).toFixed(1); return v === '-0.0' ? '0.0' : `${x > 0 ? '+' : ''}${v}`; };
const pc = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
const ivBp = (s: Iv) => `${bp(s.mean)} (${bp(s.lo)} to ${bp(s.hi)})`;
const ivPc = (s: Iv) => `${pc(s.mean)} (${pc(s.lo)} to ${pc(s.hi)})`;
const ivN = (s: Iv, d = 2) => `${s.mean.toFixed(d)} (${s.lo.toFixed(d)} to ${s.hi.toFixed(d)})`;
const day = (t: number) => new Date(t).toISOString().slice(0, 10);
const c1 = r.claim1, c2 = r.claim2, c3 = r.claim3, t = r.sets.test;
const p = r.posthoc;
const read1 = c1.y.lo > 0 ? 'The interval is wholly above zero: moves extend, and acting at the trigger beat waiting.' : c1.y.hi < 0 ? 'The interval is wholly below zero: moves fade, and waiting beat acting.' : 'The interval contains zero. By the rule fixed in advance, the reading is: **no measurable difference between acting at once and waiting.**';
const calibrated = c2.coverage.lo <= 0.8 && c2.coverage.hi >= 0.8;
const sig = r.breakdowns.filter((b: { adjusted: Iv }) => b.adjusted.lo > 0 || b.adjusted.hi < 0);
const sigPlain = r.breakdowns.filter((b: { plain: Iv }) => b.plain.lo > 0 || b.plain.hi < 0);
const halfWidth = Math.round(((c1.y.hi - c1.y.lo) / 2) * 1e4);
const manifest = JSON.parse(fs.readFileSync('data/manifest.json', 'utf8'));
const missing = r.data.contracts.reduce((a: number, c: string) => a + (manifest.symbols[`${c}USDT`]?.gaps ?? []).reduce((x: number, g: { missingHours: number }) => x + g.missingHours, 0), 0);
const halted = Object.entries(p.halts as Record<string, { zeroVolumeBars: number; longHalts: number }>);
const active = c3.plans.now + c3.plans.bell;
const [before, since] = p.periods;
const stamp = (t: number) => `${new Date(t).toISOString().slice(0, 16).replace('T', ' ')} UTC`;

const doc = `# The study

**Question.** When a Bitget stock perpetual moves while the New York cash market is shut, is the holder better off acting at once or waiting until the market has opened?

**Answer, in three lines.**

1. **No measurable average difference.** After a move is called, the perp's price 90 minutes after the open is on average ${bp(c1.y.mean)} basis points further in the move's direction, with a 95% interval of ${bp(c1.y.lo)} to ${bp(c1.y.hi)}. That interval contains zero. This data cannot rule out an average of about ${halfWidth} basis points either way.
2. **About two moves in three hold, and the house's range is calibrated on average.** ${pc(c1.held.mean)} of moves still had at least half their size standing. The house's 80% price range contained the outcome ${pc(c2.coverage.mean)} of the time (interval ${pc(c2.coverage.lo)} to ${pc(c2.coverage.hi)}, which ${calibrated ? 'includes' : 'does not include'} 80%). It under-covered for large moves.
3. **The order rule had nothing to act on.** It departed from "half now, half later" on only ${active} of ${n(c3.events)} moves, so its result (${bp(c3.vsSplit.mean)} basis points against half and half) says only that the record gave it no reason to deviate. It is not evidence that timing cannot add value.

In plain words: in this data, nothing favours rushing to act on an off-hours move and nothing favours waiting for it to reverse. The study measured prices only. It did not measure what trading costs at each hour, which is the other half of that decision. An hourly order-book recorder was added in October 2026 for that purpose.

No figure in this document is typed by hand: \`research/report.ts\` writes it from \`research/results.json\`, which \`research/study.ts\` computes from the candles in \`data/hourly\`.

## Contents

1. [Data](#data)
2. [Rules fixed in advance](#rules-fixed-in-advance)
3. [Result 1: what a move does after it is called](#result-1-what-a-move-does-after-it-is-called)
4. [Result 2: is the forecast calibrated](#result-2-is-the-forecast-calibrated)
5. [Result 3: does the order rule add anything](#result-3-does-the-order-rule-add-anything)
6. [Every breakdown](#every-breakdown)
7. [Month by month](#month-by-month)
8. [Found in review: weekend halts, and other splits](#found-in-review-weekend-halts-and-other-splits)
9. [What the study did not show](#what-the-study-did-not-show)
10. [Checks on the study itself](#checks-on-the-study-itself)
11. [The independent review](#the-independent-review)
12. [After the fixed test: rolling and forward](#after-the-fixed-test-rolling-and-forward)
13. [Reproduce it](#reproduce-it)

## Data

| | |
| --- | --- |
| Source | Bitget public market API, \`GET /api/v2/mix/market/history-candles\`, product type USDT-FUTURES, 1H bars |
| Recorded by | \`scripts/fetch-history.mjs\`, run on GitHub Actions on 10 October 2026 and committed by the workflow |
| Contracts | ${r.data.contracts.join(', ')} (each as \`<TICKER>USDT\`), chosen from the contracts listed in October 2026 |
| Period | ${day(r.data.from)} to ${day(r.data.to)}. Contracts start on different dates: ${Object.entries(p.firstBars as Record<string, number>).sort((a, b) => a[1] - b[1]).map(([c, t0]) => `${c} ${day(t0)}`).join(', ')} |
| Hours with no bar | ${missing} across the twelve contracts (\`data/manifest.json\`) |
| Hours with a bar but no trades | ${halted.map(([c, h]) => `${c} ${n(h.zeroVolumeBars)}`).join(', ')}. See "weekend halts" below |
| Test set | Each contract's first bar up to the New York close of 28 August 2026: **${n(t.events)} moves in ${t.windows} closed sessions** (of ${p.eligibleSessions} sessions in which at least one contract was eligible), plus ${n(t.quiet)} contract-sessions in which nothing moved enough |
| After the test set | ${n(r.sets.exploration.events)} moves in ${r.sets.exploration.windows} sessions (28 August to 10 October 2026). Not part of any headline |
| Calls that could not be graded | ${r.data.voided} |

**Weekend halts.** Until early 2026 these contracts did not trade from Friday's New York close to Sunday evening New York. Bitget still returns an hourly bar for those hours, flat and with zero volume, so no hour is "missing", but nothing traded. The last such halt ended on ${stamp(p.weekendTradingFrom)}; from the following weekend the contracts traded through. SPY listed after the change and has no halted hours. A "weekend or holiday" move before that date is therefore a move made in the hours after trading resumed on Sunday evening, not a move made across a traded weekend. A split around this date is in the review section.

The period after 28 August is kept out of every headline because 40 days of it (29 August to 8 October, eight contracts) were looked at before the rules were written. What was seen is listed in the pre-registration: counts of moves at five thresholds, and the outcomes of the 7 moves found at the first threshold tried.

## Rules fixed in advance

The full text is [research/PREREGISTRATION.md](../research/PREREGISTRATION.md). In short:

- **A closed session** runs from the New York cash close (16:00) to the next open (09:30). It is "overnight" when the next trading day is the next calendar day, otherwise "weekend or holiday".
- **A contract's scale** is the standard deviation of its last 20 close-to-close returns. It uses nothing after the close.
- **A move is called** at the first hourly close, from one hour after the cash close to 90 minutes before the open, at which the perp is at least ${r.threshold} of its scale away from its own price at the close. At most one call per contract per session.
- **The outcome** is the perp's price at the hourly close 90 minutes after the open (11:00 New York).
- **Y** is how far the price went after the call, in the direction of the move. Positive: it went further. Negative: it came back.
- **A move held** if at least half of it was still standing at the outcome.
- **Intervals** are 95%, from ${n(r.resamples)} resamples of whole closed sessions (every contract in a session is drawn together, because contracts move together), with a fixed seed.

The rules were written on 10 October 2026, the same day the history was recorded. The test set had not been read when they were fixed. The order of events is in the change log at the foot of the pre-registration, including two things a reader should weigh: the call threshold was lowered from 1 to 0.5 of the scale after the 40 days already seen turned out to hold only 7 moves at 1, and the recording job had been running for four minutes when that change was committed. The other design constants (${r.minPrior} earlier moves for a forecast, the 60% and 40% lines of the order rule, the 90 minutes) were also set after those 40 days had been seen.

## Result 1: what a move does after it is called

| | Test set |
| --- | ---: |
| Moves | ${n(c1.y.n)} in ${c1.y.windows} sessions |
| Mean of Y, basis points | ${ivBp(c1.y)} |
| Share of moves that went further | ${ivPc(c1.extended)} |
| Share of moves that held | ${ivPc(c1.held)} |
| Median share of the move still standing | ${c1.medianRetained.toFixed(2)} |
| Mean of Y in quiet sessions (baseline), basis points | ${ivBp(c1.quiet)} |
| Called moves minus baseline, basis points | ${ivBp(c1.difference)} |

${read1}

How much could be hiding inside that interval: the average move at the moment of the call was ${(p.size.meanMoveBp * 1e4).toFixed(0)} basis points, and the interval is about ${halfWidth} basis points either side of zero. So an average fade or extension of roughly ${Math.round((halfWidth / (p.size.meanMoveBp * 1e4)) * 100)}% of the move would not have been detected. The spread of single outcomes is far larger than the mean: the standard deviation of Y is ${(p.size.sdOfY * 1e4).toFixed(0)} basis points, so waiting carries real risk in either direction whatever the average says.

The baseline is the same measurement in sessions where the contract never moved enough to be called, taken from the last decision hour. The mean for called moves is not measurably different from the mean for quiet ones.

Two figures here can look as if they disagree. ${pc(c1.held.mean)} of moves held, yet only ${pc(c1.extended.mean)} went further. They measure different things. "Held" compares the outcome with the close: a move that gives back a third of itself has still held. "Went further" compares the outcome with the price at the call.

## Result 2: is the forecast calibrated

The house forecasts from earlier sessions only. With at least ${r.minPrior} earlier moves of the same kind, it says how often they held and gives the range that 80% of them ended in.

| | Test set |
| --- | ---: |
| Moves with a forecast | ${n(c2.events)} (${c2.noForecast} came before the house had ${r.minPrior} earlier moves) |
| Outcomes inside the 80% range | ${ivPc(c2.coverage)} |
| Points a call (always saying 50% scores 0) | ${ivN(c2.points)} |
| Brier score of the hold forecast (0.25 is always saying 50%) | ${c2.brier.toFixed(4)} |

By the rule fixed in advance the range is ${calibrated ? '**calibrated on average over the test set**: the interval of its coverage contains 80%' : '**not calibrated**: the interval of its coverage does not contain 80%, and the product shows the measured share instead'}. That rule is a weak test: a true coverage a few points under 80% would usually pass it. And the average hides unevenness. Coverage by the size of the move at the call (not fixed in advance):

| Move at the call | Moves | Outcomes inside the 80% range |
| --- | ---: | ---: |
${p.coverageBySize.map((x: Iv & { size: string }) => `| ${x.size === 'small' ? 'under 1 x scale' : '1 x scale or more'} | ${n(x.n)} | ${ivPc(x)} |`).join('\n')}

The hold forecast beats always saying 50%: the interval of its points is wholly above zero. That is a low bar, and it clears it by knowing the base rate. It does not tell a strong night from a weak one:

| House said it holds | Moves | Average forecast | Actually held |
| --- | ---: | ---: | ---: |
${c2.bands.map((b: { band: string; n: number; said: number; held: number }) => `| ${b.band} | ${n(b.n)} | ${pc(b.said)} | ${pc(b.held)} |`).join('\n')}

Its higher forecasts did not hold more often than its lower ones. These rows carry no intervals, and the top one is small.

Against a plain range (a normal distribution centred on the price at the call, with the contract's scale stretched over the hours remaining):

| | House | Plain range |
| --- | ---: | ---: |
| Outcomes inside the 80% range | ${pc(c2.coverage.mean)} | ${pc(c2.baselineCoverage.mean)} |
| Mean width, share of price | ${pc(c2.width.mean, 2)} | ${pc(c2.baselineWidth.mean, 2)} |
| Mean pinball loss at the 10th and 90th percentiles, basis points | ${(c2.pinball.mean * 1e4).toFixed(2)} | ${(c2.baselinePinball.mean * 1e4).toFixed(2)} |

The house's range is wider than the plain one and covers more. On pinball loss the house is better by ${bp(-c2.pinballDifference.mean).replace('+', '')} basis points (interval of the difference ${bp(c2.pinballDifference.lo)} to ${bp(c2.pinballDifference.hi)}). Do not read much into that. The plain range is a crude yardstick: it treats every hour alike, including the open, and it counts halted hours as time passing, so it is too narrow overnight. The margin is small, it is one of several secondary comparisons with no allowance for their number, and the reviewer reported no measurable gain from the house's classes over simply pooling all earlier moves (the reviewer's own computation, not repeated here).

## Result 3: does the order rule add anything

The rule: with an order in the direction of the move, trade all of it at the call if at least 60% of earlier moves of the kind went further, all of it later if at most 40% did, otherwise half and half.

| | Test set |
| --- | ---: |
| Plans chosen | all at the call ${n(c3.plans.now)}, half and half ${n(c3.plans.split)}, all later ${n(c3.plans.bell)} |
| Gain over half and half, basis points | ${ivBp(c3.vsSplit)} |
| Gain over all at the call, basis points | ${ivBp(c3.vsNow)} |
| Gain over all later, basis points | ${ivBp(c3.vsBell)} |

The rule chose half and half on ${n(c3.plans.split)} of ${n(c3.events)} moves, because the share of earlier moves that went further stayed between 40% and 60% almost throughout. With only ${active} moves on which it did anything else, this test has nothing to say about whether some other timing rule could add value. It shows that this rule, fed this record, almost never had a reason to act. Prices are hourly closes and no trading cost or funding payment is charged.

## Every breakdown

All ${r.breakdownCount} cuts were fixed in advance. Each has a plain 95% interval and a wider one that allows for ${r.breakdownCount} cuts being shown (Bonferroni). Basis points.

| Cut | Moves | Sessions | Mean of Y | 95% interval | Interval allowing for ${r.breakdownCount} cuts |
| --- | ---: | ---: | ---: | ---: | ---: |
${r.breakdowns.map((b: { group: string; name: string; plain: Iv; adjusted: Iv }) => `| ${b.group}: ${b.name} | ${n(b.plain.n)} | ${b.plain.windows} | ${bp(b.plain.mean)} | ${bp(b.plain.lo)} to ${bp(b.plain.hi)} | ${bp(b.adjusted.lo)} to ${bp(b.adjusted.hi)} |`).join('\n')}

${sig.length ? `${sig.length} cut(s) have an adjusted interval that excludes zero.` : `No cut has an adjusted interval that excludes zero${sigPlain.length ? `, and ${sigPlain.length} have a plain interval that does, which is about what chance alone produces across ${r.breakdownCount} cuts` : ', and none has a plain interval that excludes zero either'}.`} That is an absence of evidence, not evidence of absence: these intervals are tens to more than a hundred basis points wide. In particular there is almost no power for large moves. The average call was made at ${p.size.meanOfScale.toFixed(2)} of the contract's scale, only ${pc(p.size.shareAtLeastOneScale)} of calls were at 1 x scale or more, and the cuts at 1.5 and 2 x scale rest on a few dozen moves.

## Month by month

No intervals: a month is a small sample, and one loud week moves it a long way. This is here so that drift would be visible.

| Month | Moves | Sessions | Held | Went further | Mean of Y, bp | Inside the 80% range | Points a call |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${r.months.map((m: { month: string; events: number; windows: number; held: number; extended: number; y: number; coverage: number | null; points: number | null }) => `| ${m.month} | ${m.events} | ${m.windows} | ${pc(m.held)} | ${pc(m.extended)} | ${bp(m.y)} | ${m.coverage === null ? '' : pc(m.coverage)} | ${m.points === null ? '' : m.points.toFixed(2)} |`).join('\n')}

The last months of the test set lean positive, and so does the period after it (see [research/ROLLING.md](../research/ROLLING.md)). That is a pattern noticed after the fact in a few months of data, in a market that was rising. It is flagged here so that nobody mistakes the test-set average for a law.

## Found in review: weekend halts, and other splits

Nothing in this section was fixed in advance. It was added after an independent review of the first draft found that the contracts did not trade at weekends for the first half of the test set. Treat every figure here as description, not as a test.

| | Before weekend trading began | Since weekend trading began |
| --- | ---: | ---: |
| Moves | ${n(before.events)} | ${n(since.events)} |
| Mean of Y, basis points | ${ivBp(before.y)} | ${ivBp(since.y)} |
| Share that held | ${ivPc(before.held)} | ${ivPc(since.held)} |
| Outcomes inside the 80% range | ${ivPc(before.coverage)} | ${ivPc(since.coverage)} |
| Weekend or holiday moves | ${n(before.weekend.events)} | ${n(since.weekend.events)} |
| Their mean of Y, basis points | ${ivBp(before.weekend.y)} | ${ivBp(since.weekend.y)} |
| Their share inside the 80% range | ${ivPc(before.weekend.coverage)} | ${ivPc(since.weekend.coverage)} |

- ${n(p.afterHalt.events)} test-set calls (${n(p.afterHalt.weekend)} of them in weekend or holiday sessions) were made on the first hourly bar after a bar with no trades, that is, as trading resumed after a halt.
- ${n(p.thin.under10k)} calls were made on an hourly bar with under 10,000 USDT traded, and ${n(p.thin.under1k)} on one with under 1,000. Prices on bars that thin are last trades on a thin book.
- The house's forecaster treats weekend sessions before and after the change as one class. Since the change, weekend moves have a mean of Y of ${bp(since.weekend.y.mean)} basis points with an interval of ${bp(since.weekend.y.lo)} to ${bp(since.weekend.y.hi)}. That interval contains zero. It is the cut most worth watching as the rolling test grows.

## What the study did not show

- **No timing edge was detected.** The headline is a null result with a margin of about ${halfWidth} basis points. Nothing here supports selling at once after an off-hours fall, or waiting for a rebound. Nothing here proves there is no edge either.
- **No skill at telling nights apart.** The house knows the base rate and little more. Its higher hold forecasts did not hold more often.
- **Nothing about profit.** No strategy was tested for profit and none is claimed. Points measure forecast quality, not money.
- **Nothing about cost.** Candles hold no spread and no depth, and funding payments between the call and the outcome are ignored. Every figure is at hourly last-trade prices. An hourly order-book recorder was added only in October 2026. Any statement that cost is what matters is a reasonable guess, not a finding of this study.
- **Nothing about the stock.** The price at the close, the price at the call and the outcome are all the perp's own prints. Nothing was checked against the shares' pre-market or opening prices, or against the perp's index.
- **Nothing about the open itself.** Bars close on the hour and the bell is at 09:30, so the outcome is read at 11:00 New York. What happens in the first minutes of the session is invisible here, and a different fixed hour might read differently. Two other outcome hours are in the breakdowns.
- **Nothing about why.** Earnings, news and index moves are not separated.
- **Little about large moves.** Most calls are modest. The intervals for moves of 1 x scale and above are too wide to say anything.
- **A short, changing history.** About ${Math.round((r.data.testEnd - r.data.from) / (86_400_000 * 30.44))} months and ${t.windows} sessions. The venue itself changed part-way through, when weekend trading began. The panel is unbalanced: QQQ starts in October 2025 and SPY in February 2026. Twelve contracts that move together are far fewer than twelve independent samples, which is why the intervals resample sessions and not moves.
- **Survivorship in the list.** The twelve contracts were picked from those listed in October 2026.
- **Choices made after looking.** The threshold and the other design constants were set after 40 days of data outside the test set had been seen, and the rules were written the day the history was recorded.
- **Several intervals, one allowance.** Only the ${r.breakdownCount} breakdowns carry an allowance for their number. The secondary figures in Results 2 and 3 do not.
- **Past is past.** What held on average over these months may not hold next year. The rolling test exists to show it if that changes.

## Checks on the study itself

- **No look-ahead.** The engine reads prices only through a view that refuses any bar that had not closed. One test changes every bar after a cut-off on a synthetic market and asserts that the hash of every earlier ledger entry is unchanged; another does the same on the recorded Bitget candles by cutting the history short at several dates (\`tests/core.test.ts\`, \`tests/study.test.ts\`).
- **One loop for replay and live.** A test runs the house one hour at a time, passing its state through JSON each time, and asserts the ledger is identical to a single replay.
- **A second implementation.** \`research/audit.py\` shares no code with the engine. It rebuilds every call from the candles with its own calendar arithmetic (Python's time-zone database), sessions, scale, trigger, forecaster and outcome, and matches eleven headline figures to ten decimal places and the price and outcome of all ${n(r.sets.all.events)} calls row by row. It does not recompute the intervals, the breakdowns or the range comparison, and it reads the rules the same way and uses the same list of market holidays, so it catches coding slips, not a misread rule. See [research/AUDIT.md](../research/AUDIT.md).
- **A record that cannot be edited quietly.** The ${n(r.ledger.entries)} ledger entries form a hash chain ending at \`${r.ledger.tail.slice(0, 16)}\`. The site's House tab recomputes it in the reader's browser.
- **Recorded data, checked.** The recorder refuses bars with impossible ranges and lists any hour with no bar.

## The independent review

Before publication a separate reviewer, given the rules, the code, the data and the first draft of this document and asked to attack it, re-derived all ${n(r.sets.all.events)} calls from the raw candles with its own script, re-ran the engine, recomputed the headline figures and intervals with a different random generator, and confirmed there was no look-ahead on the recorded data. It also found three things that had to change, and they were changed:

1. **The weekend halts were not disclosed.** The first draft said "missing hours: none" and nothing more. The halts, the split around them and the thin bars are now reported above.
2. **The summary claimed more than a null result supports.** It called the off-hours price "a fair preview of the open" and said cost was what separated one hour from another. Both sentences are gone. The summary now says what the rule fixed in advance says, with the size of effect the data could not rule out.
3. **The number of resamples differed from the pre-registration** (20,000 against 10,000). It is now 10,000. No reading changed.

It also asked for, and got: the uneven coverage behind "calibrated"; plain statements that the order-rule test is nearly empty and the range comparison weak; an accurate account of what the second implementation does and does not check; a look-ahead test on the recorded candles; and the limitations listed above that the first draft left out.

One reading of the rules is recorded here because the reviewer flagged it: sessions that close early are left out as closed sessions, but their 13:00 close is still used as a day's close when the scale is computed. The reviewer reported that leaving those days out of the scale as well removes 9 calls and leaves the headline unchanged to the first decimal place; that figure is the reviewer's and is not recomputed in this repository.

## After the fixed test: rolling and forward

The fixed test above is never re-run on new data. Two documents carry on from it, both rewritten every hour by a scheduled job that appends Bitget's newest candles:

- [research/ROLLING.md](../research/ROLLING.md) applies the same three claims, with the same code, to everything recorded after 28 August 2026, with intervals, and shows every month on record.
- [research/FORWARD.md](../research/FORWARD.md) counts only the calls the scheduled agent published before their outcome existed. Replayed and live calls are kept in separate records.

## Reproduce it

\`\`\`
npm install
npm run study        # tsx research/study.ts && python3 research/audit.py
npx tsx research/report.ts
\`\`\`

\`npm run study\` recomputes \`research/results.json\` from \`data/hourly\` and then runs the second implementation, which exits with an error if any figure it checks differs. \`npx tsx research/report.ts\` rewrites this document from the results.
`;
fs.mkdirSync('docs', { recursive: true });
fs.writeFileSync('docs/STUDY.md', doc);
console.log(`docs/STUDY.md written (${doc.split('\n').length} lines)`);
