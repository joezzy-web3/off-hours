# Forward test

The study in docs/STUDY.md was run on candles recorded up to 10 October 2026 09:00 UTC. This file is what
happened next. Every hour a scheduled job appends the new Bitget candles, replays the house with nothing
changed, and counts here only the calls it published before their outcome existed. Nothing is tuned on
what this finds. It only keeps score.

Updated 2026-11-06 05:03 UTC. Candles on file through 2026-11-06 05:00 UTC.

| | Live calls | Test set (study) |
| --- | ---: | ---: |
| Calls graded | 138 | 1,175 |
| Calls waiting for a bell | 6 | |
| Moves that held | 52.9% | 63.6% |
| Prices inside the 80% range | 67.4% | 78.2% |
| Points a call | -1.29 | 1.51 |
| Move after the call, basis points | -56.7 | -3.9 |
| Timing rule against half and half, basis points | 0.0 | 0.0 |
