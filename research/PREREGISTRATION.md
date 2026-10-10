# Pre-registration

Written on 10 October 2026, before the test data below was recorded or read. The commit that adds
this file is older than the commit that adds `data/`, and that order is the evidence. Anything
changed here later is listed at the bottom with its date and reason.

## The question

When a Bitget stock perpetual moves while the US cash market is closed, is the holder better off
acting at once or waiting for the open?

## Data

- Source: Bitget public market API, `history-candles`, USDT-FUTURES, 1H bars, recorded by
  `scripts/fetch-history.mjs`. Missing hours stay missing.
- Contracts, fixed now: NVDA, TSLA, AAPL, MSFT, META, AMZN, GOOGL, MSTR, COIN, PLTR, QQQ, SPY
  (each as `<TICKER>USDT`). A contract Bitget does not list is left out. None is added later.
- Exploration set: 29 August to 8 October 2026. Already seen; see "What was seen first".
- Test set: each contract's first bar up to the cash close of 28 August 2026. Not seen.
  Headline figures come from the test set only.
- Forward set: everything after this repository was created, scored with nothing changed.

## Definitions

- Trading days: NYSE regular sessions, 09:30 to 16:00 New York time (13:30 to 20:00 UTC from
  8 March to 31 October 2026, 14:30 to 21:00 UTC otherwise). Closed in 2026 on 1 Jan, 19 Jan,
  16 Feb, 3 Apr, 25 May, 19 Jun, 3 Jul, 7 Sep, 26 Nov, 25 Dec. Sessions that close early
  (27 Nov, 24 Dec) are left out.
- Closed window: from the cash close of trading day D to the open of the next trading day N.
  It is "overnight" when N is the next calendar day, otherwise "weekend or holiday".
- Reference price C0: the close of the hourly bar that ends at the cash close of D.
- Decision hours: every hourly bar close from one hour after the cash close up to 90 minutes
  before the open of N.
- Move at a decision hour: m = P / C0 - 1.
- Scale: s = the standard deviation of the contract's last 20 cash-close to cash-close returns
  ending at D. A contract with fewer than 10 is not eligible in that window. Nothing after D is used.
- Event: the first decision hour in the window at which |m| >= 1 x s. At most one event per
  contract per window. P_trigger is the price at that hour.
- Outcome price P_out: the close of the hourly bar that ends 90 minutes after the open of N.
- Outcome: Y = sign(m) x (P_out / P_trigger - 1). Positive means the move went further after the
  trigger, so acting at the trigger beat waiting. Negative means it came back, so waiting won.
- An event with any required bar missing is dropped and counted.

## Primary result and how it will be read

The mean of Y over all test-set events, with a 95% interval from 10,000 bootstrap resamples of
closed windows (every event in a window is drawn together, because contracts move together), with
a fixed seed.

- Interval wholly above zero: moves extend. The product says act now.
- Interval wholly below zero: moves fade. The product says wait for the open.
- Interval contains zero: no measurable difference. The product says so in those words and
  decides on trading cost alone.

Whichever of the three it is gets published. Reported next to it: the number of events and
windows, the share of events with Y > 0, and the median share of the move still standing at
P_out, (P_out / C0 - 1) / m.

## Baseline

The same Y for windows in which the contract never reached 1 x s, measured from the last
decision hour in the direction of the move at that hour. The difference between events and
baseline is reported with its interval.

## Breakdowns, all reported, none chosen afterwards

Overnight against weekend or holiday. Up moves against down moves. Trigger in the first four
hours after the close, in the hours after that, or from 04:00 New York time. Thresholds of 0.5,
1.5 and 2 x s, and a flat 2%. Each contract alone. MSTR and COIN against the rest. Outcome
measured 30 minutes after the open and at the cash close of N. No breakdown becomes a headline
unless its interval excludes zero after allowing for the number of breakdowns shown (Bonferroni).

## Second claim: the forecast is calibrated

At each event the forecaster uses only events from earlier closed windows.

- Class: the window's kind (overnight; weekend or holiday) and the move's size (under 2 x s;
  2 x s or more). A class with fewer than 30 earlier events falls back to all earlier events.
  With fewer than 30 of those, no forecast is made and the event is counted as such.
- Range forecast: the 10th and 90th percentiles of Y / s in the class, turned back into prices
  with this event's own s, direction and P_trigger. It is an 80% range for P_out.
- Hold forecast: the share of the class in which the move held. A move "held" when at least
  half of it was still standing at P_out: (P_out / C0 - 1) / m >= 0.5.

Tested on the test set, with the same window bootstrap:

- Coverage: the share of outcomes inside the range. The forecaster is called calibrated only
  if the 95% interval of that share contains 80%. Otherwise the product shows the measured
  share in place of "80%" and says the forecaster missed.
- Hold forecast: the observed hold rate in each ten-point band of forecast probability, and the
  Brier score against a constant 50%.
- Sharpness: mean range width and mean pinball loss at the 10th and 90th percentiles, against a
  plain baseline: a normal range centred on P_trigger with standard deviation
  s x sqrt(hours from trigger to P_out / 24). Reported whichever is narrower.

## Third claim: timing an order

An order of fixed size must be done by the time of P_out. q is the share of the class, earlier
events only, in which Y > 0. For an order in the direction of the move (selling after a fall,
buying after a rise): all at the trigger if q >= 0.6, all at P_out if q <= 0.4, otherwise half
and half. For an order against the move, the mirror image. The two cases score the same, so
one figure covers both: T = (f - 0.5) x Y, where f is the share done at the trigger. T is the
gain over half and half; gains over "all at the trigger" and "all at P_out" are reported too.

Prices are hourly closes and no trading cost is charged, because none can be measured on
history. Read as: interval of mean T wholly above zero, the rule adds timing value before
costs; containing zero, it adds none that can be measured, and the product says so.

## Scoring a call

A player states a probability p that a move will hold. When the outcome is known the call
scores 100 x (0.25 - (p - o)^2), with o = 1 if it held and 0 if not. Saying 50% always scores
zero; a certain call scores +25 when right and -75 when wrong. The forecaster above, a
language-model player and human players are scored by the same code. The language-model
player takes part in live rounds only: it may have seen past prices, so it is never replayed
over history.

## The agent's record

- Every call the agent makes is hashed and time-stamped before its outcome exists; each entry
  carries the hash of the entry before it.
- Calls are graded by code against Bitget candles. The language model takes no part in grading.
- The same agent is replayed over the recorded history, one decision hour at a time, seeing only
  bars that had closed. A test proves that changing any later bar changes no earlier call.
- Replayed calls and live calls are kept in separate records and never added together.

## What cannot be tested on history

Trading cost. Candles hold no spread or depth. `scripts/record-book.mjs` records both every hour
from the day this repository was created; cost figures are "observed since" that day and
nothing earlier.

## What was seen first

- The exploration set, eight contracts (NVDA, TSLA, AAPL, MSFT, MSTR, COIN, QQQ, BTC), with flat
  thresholds of 0.5% to 2% and the outcome 90 minutes after the open: 27 closed windows, 47 to
  153 events, 48% to 53% of events extending, median share of the move still standing 0.93 to
  1.12. Too few windows to tell from no effect. These figures chose nothing above except the
  decision to run the study.
- Two pages of NVDA hourly bars (20 February to 1 March and 21 to 29 August 2026) were fetched to
  confirm that Bitget serves history that far back. They were not analysed.

## Changes after registration

- 10 October 2026, before any test data was read: a claim about hedging was removed and the
  forecast, timing and scoring sections were added, when the product became a forecaster with
  an order rule and a scored game. The data, definitions and primary result were not changed.
