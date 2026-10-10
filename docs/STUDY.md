# The study

**Question.** When a Bitget stock perpetual moves while the New York cash market is shut, is the holder better off acting at once or waiting until the market has opened?

**Answer, in three lines.**

1. **No measurable average difference.** After a move is called, the perp's price 90 minutes after the open is on average -3.9 basis points further in the move's direction, with a 95% interval of -23.4 to +15.5. That interval contains zero. This data cannot rule out an average of about 19 basis points either way.
2. **About two moves in three hold, and the house's range is calibrated on average.** 63.6% of moves still had at least half their size standing. The house's 80% price range contained the outcome 78.2% of the time (interval 74.8% to 81.6%, which includes 80%). It under-covered for large moves.
3. **The order rule had nothing to act on.** It departed from "half now, half later" on only 15 of 1,143 moves, so its result (0.0 basis points against half and half) says only that the record gave it no reason to deviate. It is not evidence that timing cannot add value.

In plain words: in this data, nothing favours rushing to act on an off-hours move and nothing favours waiting for it to reverse. The study measured prices only. It did not measure what trading costs at each hour, which is the other half of that decision. An hourly order-book recorder was added in October 2026 for that purpose.

No figure in this document is typed by hand: `research/report.ts` writes it from `research/results.json`, which `research/study.ts` computes from the candles in `data/hourly`.

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
| Source | Bitget public market API, `GET /api/v2/mix/market/history-candles`, product type USDT-FUTURES, 1H bars |
| Recorded by | `scripts/fetch-history.mjs`, run on GitHub Actions on 10 October 2026 and committed by the workflow |
| Contracts | NVDA, TSLA, AAPL, MSFT, META, AMZN, GOOGL, MSTR, COIN, PLTR, QQQ, SPY (each as `<TICKER>USDT`), chosen from the contracts listed in October 2026 |
| Period | 2025-08-19 to 2026-10-10. Contracts start on different dates: NVDA 2025-08-19, TSLA 2025-08-19, AAPL 2025-08-26, META 2025-08-26, AMZN 2025-08-26, GOOGL 2025-08-26, MSTR 2025-08-27, COIN 2025-08-27, PLTR 2025-09-09, MSFT 2025-09-22, QQQ 2025-10-28, SPY 2026-02-11 |
| Hours with no bar | 0 across the twelve contracts (`data/manifest.json`) |
| Hours with a bar but no trades | NVDA 1,304, TSLA 1,299, AAPL 1,311, MSFT 1,130, META 1,425, AMZN 1,397, GOOGL 1,315, MSTR 1,319, COIN 1,413, PLTR 1,231, QQQ 778, SPY 0. See "weekend halts" below |
| Test set | Each contract's first bar up to the New York close of 28 August 2026: **1,175 moves in 223 closed sessions** (of 244 sessions in which at least one contract was eligible), plus 1,518 contract-sessions in which nothing moved enough |
| After the test set | 143 moves in 28 sessions (28 August to 10 October 2026). Not part of any headline |
| Calls that could not be graded | 0 |

**Weekend halts.** Until early 2026 these contracts did not trade from Friday's New York close to Sunday evening New York. Bitget still returns an hourly bar for those hours, flat and with zero volume, so no hour is "missing", but nothing traded. The last such halt ended on 2026-02-02 01:00 UTC; from the following weekend the contracts traded through. SPY listed after the change and has no halted hours. A "weekend or holiday" move before that date is therefore a move made in the hours after trading resumed on Sunday evening, not a move made across a traded weekend. A split around this date is in the review section.

The period after 28 August is kept out of every headline because 40 days of it (29 August to 8 October, eight contracts) were looked at before the rules were written. What was seen is listed in the pre-registration: counts of moves at five thresholds, and the outcomes of the 7 moves found at the first threshold tried.

## Rules fixed in advance

The full text is [research/PREREGISTRATION.md](../research/PREREGISTRATION.md). In short:

- **A closed session** runs from the New York cash close (16:00) to the next open (09:30). It is "overnight" when the next trading day is the next calendar day, otherwise "weekend or holiday".
- **A contract's scale** is the standard deviation of its last 20 close-to-close returns. It uses nothing after the close.
- **A move is called** at the first hourly close, from one hour after the cash close to 90 minutes before the open, at which the perp is at least 0.5 of its scale away from its own price at the close. At most one call per contract per session.
- **The outcome** is the perp's price at the hourly close 90 minutes after the open (11:00 New York).
- **Y** is how far the price went after the call, in the direction of the move. Positive: it went further. Negative: it came back.
- **A move held** if at least half of it was still standing at the outcome.
- **Intervals** are 95%, from 10,000 resamples of whole closed sessions (every contract in a session is drawn together, because contracts move together), with a fixed seed.

The rules were written on 10 October 2026, the same day the history was recorded. The test set had not been read when they were fixed. The order of events is in the change log at the foot of the pre-registration, including two things a reader should weigh: the call threshold was lowered from 1 to 0.5 of the scale after the 40 days already seen turned out to hold only 7 moves at 1, and the recording job had been running for four minutes when that change was committed. The other design constants (30 earlier moves for a forecast, the 60% and 40% lines of the order rule, the 90 minutes) were also set after those 40 days had been seen.

## Result 1: what a move does after it is called

| | Test set |
| --- | ---: |
| Moves | 1,175 in 223 sessions |
| Mean of Y, basis points | -3.9 (-23.4 to +15.5) |
| Share of moves that went further | 49.0% (44.9% to 53.0%) |
| Share of moves that held | 63.6% (59.5% to 67.5%) |
| Median share of the move still standing | 0.95 |
| Mean of Y in quiet sessions (baseline), basis points | +2.0 (-9.4 to +13.6) |
| Called moves minus baseline, basis points | -5.9 (-27.4 to +15.8) |

The interval contains zero. By the rule fixed in advance, the reading is: **no measurable difference between acting at once and waiting.**

How much could be hiding inside that interval: the average move at the moment of the call was 156 basis points, and the interval is about 19 basis points either side of zero. So an average fade or extension of roughly 12% of the move would not have been detected. The spread of single outcomes is far larger than the mean: the standard deviation of Y is 247 basis points, so waiting carries real risk in either direction whatever the average says.

The baseline is the same measurement in sessions where the contract never moved enough to be called, taken from the last decision hour. The mean for called moves is not measurably different from the mean for quiet ones.

Two figures here can look as if they disagree. 63.6% of moves held, yet only 49.0% went further. They measure different things. "Held" compares the outcome with the close: a move that gives back a third of itself has still held. "Went further" compares the outcome with the price at the call.

## Result 2: is the forecast calibrated

The house forecasts from earlier sessions only. With at least 30 earlier moves of the same kind, it says how often they held and gives the range that 80% of them ended in.

| | Test set |
| --- | ---: |
| Moves with a forecast | 1,143 (32 came before the house had 30 earlier moves) |
| Outcomes inside the 80% range | 78.2% (74.8% to 81.6%) |
| Points a call (always saying 50% scores 0) | 1.51 (0.50 to 2.50) |
| Brier score of the hold forecast (0.25 is always saying 50%) | 0.2349 |

By the rule fixed in advance the range is **calibrated on average over the test set**: the interval of its coverage contains 80%. That rule is a weak test: a true coverage a few points under 80% would usually pass it. And the average hides unevenness. Coverage by the size of the move at the call (not fixed in advance):

| Move at the call | Moves | Outcomes inside the 80% range |
| --- | ---: | ---: |
| under 1 x scale | 1,069 | 78.9% (75.5% to 82.2%) |
| 1 x scale or more | 74 | 68.9% (54.1% to 81.4%) |

The hold forecast beats always saying 50%: the interval of its points is wholly above zero. That is a low bar, and it clears it by knowing the base rate. It does not tell a strong night from a weak one:

| House said it holds | Moves | Average forecast | Actually held |
| --- | ---: | ---: | ---: |
| 50% to 60% | 295 | 58.3% | 65.8% |
| 60% to 70% | 785 | 62.5% | 62.5% |
| 70% to 80% | 63 | 73.5% | 61.9% |

Its higher forecasts did not hold more often than its lower ones. These rows carry no intervals, and the top one is small.

Against a plain range (a normal distribution centred on the price at the call, with the contract's scale stretched over the hours remaining):

| | House | Plain range |
| --- | ---: | ---: |
| Outcomes inside the 80% range | 78.2% | 67.6% |
| Mean width, share of price | 5.18% | 4.28% |
| Mean pinball loss at the 10th and 90th percentiles, basis points | 39.99 | 41.86 |

The house's range is wider than the plain one and covers more. On pinball loss the house is better by 1.9 basis points (interval of the difference -3.3 to -0.4). Do not read much into that. The plain range is a crude yardstick: it treats every hour alike, including the open, and it counts halted hours as time passing, so it is too narrow overnight. The margin is small, it is one of several secondary comparisons with no allowance for their number, and the reviewer reported no measurable gain from the house's classes over simply pooling all earlier moves (the reviewer's own computation, not repeated here).

## Result 3: does the order rule add anything

The rule: with an order in the direction of the move, trade all of it at the call if at least 60% of earlier moves of the kind went further, all of it later if at most 40% did, otherwise half and half.

| | Test set |
| --- | ---: |
| Plans chosen | all at the call 0, half and half 1,128, all later 15 |
| Gain over half and half, basis points | 0.0 (-1.7 to +1.6) |
| Gain over all at the call, basis points | +2.7 (-7.4 to +13.0) |
| Gain over all later, basis points | -2.8 (-12.7 to +6.9) |

The rule chose half and half on 1,128 of 1,143 moves, because the share of earlier moves that went further stayed between 40% and 60% almost throughout. With only 15 moves on which it did anything else, this test has nothing to say about whether some other timing rule could add value. It shows that this rule, fed this record, almost never had a reason to act. Prices are hourly closes and no trading cost or funding payment is charged.

## Every breakdown

All 27 cuts were fixed in advance. Each has a plain 95% interval and a wider one that allows for 27 cuts being shown (Bonferroni). Basis points.

| Cut | Moves | Sessions | Mean of Y | 95% interval | Interval allowing for 27 cuts |
| --- | ---: | ---: | ---: | ---: | ---: |
| Kind of window: overnight | 811 | 173 | +5.9 | -16.8 to +28.3 | -29.9 to +40.7 |
| Kind of window: weekend or holiday | 364 | 50 | -25.8 | -61.1 to +10.6 | -81.2 to +30.8 |
| Direction: up moves | 589 | 177 | +17.5 | -8.2 to +43.0 | -22.5 to +57.4 |
| Direction: down moves | 586 | 133 | -25.4 | -58.9 to +8.3 | -79.8 to +28.3 |
| When it was called: after-hours | 194 | 83 | -1.9 | -68.4 to +70.2 | -105.6 to +103.5 |
| When it was called: dead hours | 621 | 159 | -19.6 | -46.3 to +6.9 | -61.0 to +21.5 |
| When it was called: pre-market | 360 | 158 | +22.0 | -5.1 to +48.6 | -20.5 to +65.7 |
| Crypto-linked: MSTR and COIN | 232 | 139 | +19.6 | -39.8 to +78.7 | -73.3 to +107.5 |
| Crypto-linked: the other contracts | 943 | 214 | -9.7 | -26.6 to +7.2 | -36.2 to +17.2 |
| Contract: NVDA | 116 | 116 | -27.3 | -65.8 to +9.4 | -88.3 to +28.1 |
| Contract: TSLA | 88 | 88 | +8.2 | -48.0 to +64.6 | -80.6 to +94.2 |
| Contract: AAPL | 82 | 82 | -22.6 | -53.3 to +10.3 | -71.7 to +30.1 |
| Contract: MSFT | 89 | 89 | +22.3 | -18.0 to +66.1 | -36.7 to +92.8 |
| Contract: META | 80 | 80 | +6.7 | -32.6 to +46.5 | -55.2 to +72.2 |
| Contract: AMZN | 95 | 95 | -16.1 | -51.5 to +19.7 | -69.4 to +42.8 |
| Contract: GOOGL | 114 | 114 | -15.7 | -48.7 to +15.7 | -68.5 to +34.8 |
| Contract: MSTR | 124 | 124 | -10.5 | -87.0 to +61.3 | -137.1 to +94.5 |
| Contract: COIN | 108 | 108 | +54.2 | -10.3 to +119.8 | -50.9 to +157.5 |
| Contract: PLTR | 84 | 84 | -20.6 | -92.2 to +53.7 | -134.0 to +98.0 |
| Contract: QQQ | 117 | 117 | -12.4 | -30.5 to +5.3 | -42.0 to +14.6 |
| Contract: SPY | 78 | 78 | -11.3 | -25.5 to +3.0 | -33.7 to +11.9 |
| Outcome measured: 30 minutes after the bell | 1,175 | 223 | -7.8 | -25.4 to +9.0 | -37.2 to +18.9 |
| Outcome measured: at the cash close | 1,175 | 223 | -13.4 | -39.1 to +11.1 | -53.8 to +25.1 |
| Threshold: 1 x scale | 312 | 117 | -16.3 | -59.5 to +28.4 | -81.4 to +55.5 |
| Threshold: 1.5 x scale | 97 | 45 | +40.9 | -25.0 to +122.1 | -56.6 to +174.1 |
| Threshold: 2 x scale | 48 | 26 | +44.9 | -45.2 to +157.8 | -90.9 to +231.1 |
| Threshold: a flat 2% | 502 | 178 | +1.7 | -35.6 to +40.5 | -59.7 to +65.3 |

No cut has an adjusted interval that excludes zero, and none has a plain interval that excludes zero either. That is an absence of evidence, not evidence of absence: these intervals are tens to more than a hundred basis points wide. In particular there is almost no power for large moves. The average call was made at 0.68 of the contract's scale, only 6.3% of calls were at 1 x scale or more, and the cuts at 1.5 and 2 x scale rest on a few dozen moves.

## Month by month

No intervals: a month is a small sample, and one loud week moves it a long way. This is here so that drift would be visible.

| Month | Moves | Sessions | Held | Went further | Mean of Y, bp | Inside the 80% range | Points a call |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2025-09 | 60 | 18 | 68.3% | 45.0% | +33.7 | 67.9% | 1.80 |
| 2025-10 | 112 | 23 | 62.5% | 51.8% | -13.3 | 73.2% | 1.44 |
| 2025-11 | 86 | 17 | 60.5% | 45.3% | -48.9 | 74.4% | 1.73 |
| 2025-12 | 69 | 15 | 58.0% | 49.3% | -12.9 | 84.1% | -1.52 |
| 2026-01 | 120 | 19 | 63.3% | 50.8% | -8.8 | 75.8% | 0.99 |
| 2026-02 | 67 | 18 | 58.2% | 43.3% | -46.0 | 67.2% | 0.32 |
| 2026-03 | 151 | 21 | 66.2% | 55.0% | -8.4 | 80.8% | 2.14 |
| 2026-04 | 108 | 20 | 62.0% | 41.7% | -33.6 | 87.0% | 1.30 |
| 2026-05 | 116 | 20 | 60.3% | 46.6% | -5.1 | 75.9% | 1.08 |
| 2026-06 | 126 | 19 | 59.5% | 46.0% | -10.3 | 77.8% | 0.46 |
| 2026-07 | 124 | 22 | 71.0% | 51.6% | +49.0 | 82.3% | 3.57 |
| 2026-08 | 36 | 11 | 80.6% | 66.7% | +133.3 | 86.1% | 6.75 |

The last months of the test set lean positive, and so does the period after it (see [research/ROLLING.md](../research/ROLLING.md)). That is a pattern noticed after the fact in a few months of data, in a market that was rising. It is flagged here so that nobody mistakes the test-set average for a law.

## Found in review: weekend halts, and other splits

Nothing in this section was fixed in advance. It was added after an independent review of the first draft found that the contracts did not trade at weekends for the first half of the test set. Treat every figure here as description, not as a test.

| | Before weekend trading began | Since weekend trading began |
| --- | ---: | ---: |
| Moves | 436 | 739 |
| Mean of Y, basis points | -11.0 (-36.1 to +14.1) | +0.3 (-27.2 to +28.0) |
| Share that held | 62.6% (55.6% to 69.2%) | 64.1% (59.2% to 69.0%) |
| Outcomes inside the 80% range | 76.0% (70.3% to 81.1%) | 79.4% (74.9% to 83.7%) |
| Weekend or holiday moves | 135 | 229 |
| Their mean of Y, basis points | +7.1 (-38.5 to +51.1) | -45.2 (-94.3 to +5.5) |
| Their share inside the 80% range | 78.6% (66.9% to 89.1%) | 76.9% (69.0% to 84.9%) |

- 80 test-set calls (62 of them in weekend or holiday sessions) were made on the first hourly bar after a bar with no trades, that is, as trading resumed after a halt.
- 122 calls were made on an hourly bar with under 10,000 USDT traded, and 24 on one with under 1,000. Prices on bars that thin are last trades on a thin book.
- The house's forecaster treats weekend sessions before and after the change as one class. Since the change, weekend moves have a mean of Y of -45.2 basis points with an interval of -94.3 to +5.5. That interval contains zero. It is the cut most worth watching as the rolling test grows.

## What the study did not show

- **No timing edge was detected.** The headline is a null result with a margin of about 19 basis points. Nothing here supports selling at once after an off-hours fall, or waiting for a rebound. Nothing here proves there is no edge either.
- **No skill at telling nights apart.** The house knows the base rate and little more. Its higher hold forecasts did not hold more often.
- **Nothing about profit.** No strategy was tested for profit and none is claimed. Points measure forecast quality, not money.
- **Nothing about cost.** Candles hold no spread and no depth, and funding payments between the call and the outcome are ignored. Every figure is at hourly last-trade prices. An hourly order-book recorder was added only in October 2026. Any statement that cost is what matters is a reasonable guess, not a finding of this study.
- **Nothing about the stock.** The price at the close, the price at the call and the outcome are all the perp's own prints. Nothing was checked against the shares' pre-market or opening prices, or against the perp's index.
- **Nothing about the open itself.** Bars close on the hour and the bell is at 09:30, so the outcome is read at 11:00 New York. What happens in the first minutes of the session is invisible here, and a different fixed hour might read differently. Two other outcome hours are in the breakdowns.
- **Nothing about why.** Earnings, news and index moves are not separated.
- **Little about large moves.** Most calls are modest. The intervals for moves of 1 x scale and above are too wide to say anything.
- **A short, changing history.** About 12 months and 223 sessions. The venue itself changed part-way through, when weekend trading began. The panel is unbalanced: QQQ starts in October 2025 and SPY in February 2026. Twelve contracts that move together are far fewer than twelve independent samples, which is why the intervals resample sessions and not moves.
- **Survivorship in the list.** The twelve contracts were picked from those listed in October 2026.
- **Choices made after looking.** The threshold and the other design constants were set after 40 days of data outside the test set had been seen, and the rules were written the day the history was recorded.
- **Several intervals, one allowance.** Only the 27 breakdowns carry an allowance for their number. The secondary figures in Results 2 and 3 do not.
- **Past is past.** What held on average over these months may not hold next year. The rolling test exists to show it if that changes.

## Checks on the study itself

- **No look-ahead.** The engine reads prices only through a view that refuses any bar that had not closed. One test changes every bar after a cut-off on a synthetic market and asserts that the hash of every earlier ledger entry is unchanged; another does the same on the recorded Bitget candles by cutting the history short at several dates (`tests/core.test.ts`, `tests/study.test.ts`).
- **One loop for replay and live.** A test runs the house one hour at a time, passing its state through JSON each time, and asserts the ledger is identical to a single replay.
- **A second implementation.** `research/audit.py` shares no code with the engine. It rebuilds every call from the candles with its own calendar arithmetic (Python's time-zone database), sessions, scale, trigger, forecaster and outcome, and matches eleven headline figures to ten decimal places and the price and outcome of all 1,318 calls row by row. It does not recompute the intervals, the breakdowns or the range comparison, and it reads the rules the same way and uses the same list of market holidays, so it catches coding slips, not a misread rule. See [research/AUDIT.md](../research/AUDIT.md).
- **A record that cannot be edited quietly.** The 2,636 ledger entries form a hash chain ending at `f1537f5ca9581255`. The site's House tab recomputes it in the reader's browser.
- **Recorded data, checked.** The recorder refuses bars with impossible ranges and lists any hour with no bar.

## The independent review

Before publication a separate reviewer, given the rules, the code, the data and the first draft of this document and asked to attack it, re-derived all 1,318 calls from the raw candles with its own script, re-ran the engine, recomputed the headline figures and intervals with a different random generator, and confirmed there was no look-ahead on the recorded data. It also found three things that had to change, and they were changed:

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

```
npm install
npm run study        # tsx research/study.ts && python3 research/audit.py
npx tsx research/report.ts
```

`npm run study` recomputes `research/results.json` from `data/hourly` and then runs the second implementation, which exits with an error if any figure it checks differs. `npx tsx research/report.ts` rewrites this document from the results.
