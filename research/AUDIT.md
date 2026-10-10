# Audit: a second implementation

Written by `python3 research/audit.py`. That script shares no code with the engine: it has its own
calendar (Python's time-zone database), windows, scale, events, forecaster and outcomes. It reads the
same recorded candles and recomputes the test set from scratch.

| Figure | Engine (TypeScript) | Second implementation (Python) | Match |
| --- | ---: | ---: | :---: |
| test events | 1,175 | 1,175 | yes |
| test windows | 223 | 223 | yes |
| quiet contract-windows | 1,518 | 1,518 | yes |
| mean Y | -0.0003912649 | -0.0003912649 | yes |
| share that went further | 0.4902127660 | 0.4902127660 | yes |
| share that held | 0.6357446809 | 0.6357446809 | yes |
| mean Y, quiet windows | 0.0002009820 | 0.0002009820 | yes |
| events with a forecast | 1,143 | 1,143 | yes |
| share inside the 80% range | 0.7821522310 | 0.7821522310 | yes |
| mean points | 1.5110664984 | 1.5110664984 | yes |
| mean timing gain | -0.0000039955 | -0.0000039955 | yes |

Row by row: 1,318 events recomputed, 0 differ from `research/events.csv`, 0 are in that file and not here.

Interval for the mean of Y, from 4,000 resamples of closed windows with a different random generator: -22.3 to +15.7 basis points. The engine's: -23.4 to +15.5.

Result: every figure matches to ten decimal places.
