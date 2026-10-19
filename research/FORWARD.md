# Forward test

The study in docs/STUDY.md was run on candles recorded up to 10 October 2026 09:00 UTC. This file is what
happened next. Every hour a scheduled job appends the new Bitget candles, replays the house with nothing
changed, and counts here only the calls it published before their outcome existed. Nothing is tuned on
what this finds. It only keeps score.

Updated 2026-10-19 07:43 UTC. Candles on file through 2026-10-19 07:00 UTC.

| | Live calls | Test set (study) |
| --- | ---: | ---: |
| Calls graded | 31 | 1,175 |
| Calls waiting for a bell | 11 | |
| Moves that held | 48.4% | 63.6% |
| Prices inside the 80% range | 93.5% | 78.2% |
| Points a call | -2.21 | 1.51 |
| Move after the call, basis points | -77.7 | -3.9 |
| Timing rule against half and half, basis points | 0.0 | 0.0 |

Fewer than 100 live calls is too few to read anything into. The row to watch is the first one, as it grows.
