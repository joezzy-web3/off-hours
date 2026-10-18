# Rolling study

The fixed test in docs/STUDY.md covers each contract's first bar up to the New York close of 28 August 2026 and
is never re-run on new data. This file applies the same three claims, with the same code and nothing changed, to
everything recorded after that date. A scheduled job rewrites it every hour, so it keeps growing.

Updated 2026-10-18 19:03 UTC. 174 moves in 33 closed sessions since the fixed test ended.
The first six weeks of this period (to 8 October 2026) were looked at before the rules were fixed; see research/PREREGISTRATION.md.

| | Since the fixed test | Fixed test |
| --- | ---: | ---: |
| Moves | 174 | 1,175 |
| Move after the call, basis points | 14.2 (-21.7 to 51.5) | -3.9 (-23.4 to 15.5) |
| Moves that held | 70.1% (60.4% to 78.9%) | 63.6% (59.5% to 67.5%) |
| Prices inside the 80% range | 84.5% (78.4% to 90.1%) | 78.2% (74.8% to 81.6%) |
| Points a call | 3.58 (0.81 to 6.08) | 1.51 (0.50 to 2.50) |
| Timing rule against half and half, basis points | 0.0 (0.0 to 0.0) | 0.0 (-1.7 to 1.6) |

Figures in brackets are 95% intervals from resampling whole closed sessions.

## Month by month

Every month on record, fixed test and after. No intervals: a single month is a small sample, and one loud week moves it a long way.

| Month | Moves | Sessions | Held | Went further | Move after the call, bp | Inside the 80% range | Points a call |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2025-09 | 60 | 18 | 68.3% | 45.0% | 33.7 | 67.9% | 1.80 |
| 2025-10 | 112 | 23 | 62.5% | 51.8% | -13.3 | 73.2% | 1.44 |
| 2025-11 | 86 | 17 | 60.5% | 45.3% | -48.9 | 74.4% | 1.73 |
| 2025-12 | 69 | 15 | 58.0% | 49.3% | -12.9 | 84.1% | -1.52 |
| 2026-01 | 120 | 19 | 63.3% | 50.8% | -8.8 | 75.8% | 0.99 |
| 2026-02 | 67 | 18 | 58.2% | 43.3% | -46.0 | 67.2% | 0.32 |
| 2026-03 | 151 | 21 | 66.2% | 55.0% | -8.4 | 80.8% | 2.14 |
| 2026-04 | 108 | 20 | 62.0% | 41.7% | -33.6 | 87.0% | 1.30 |
| 2026-05 | 116 | 20 | 60.3% | 46.6% | -5.1 | 75.9% | 1.08 |
| 2026-06 | 126 | 19 | 59.5% | 46.0% | -10.3 | 77.8% | 0.46 |
| 2026-07 | 124 | 22 | 71.0% | 51.6% | 49.0 | 82.3% | 3.57 |
| 2026-08 | 49 | 13 | 79.6% | 63.3% | 95.5 | 87.8% | 6.53 |
| 2026-09 | 93 | 20 | 72.0% | 62.4% | 49.5 | 76.3% | 3.81 |
| 2026-10 | 68 | 11 | 66.2% | 54.4% | -29.5 | 94.1% | 2.83 |
