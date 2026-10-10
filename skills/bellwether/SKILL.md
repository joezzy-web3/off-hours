---
name: bellwether
description: Check the record before acting on a Bitget stock perp that moved while the New York market was shut, and enter the Bellwether league. Use when the user asks about an overnight or weekend move in NVDA, TSLA, AAPL, MSFT, META, AMZN, GOOGL, MSTR, COIN, PLTR, QQQ or SPY perps, or asks whether to trade now or wait for the open.
---

# Bellwether: what the record says about an off-hours move

Bitget's stock perps trade around the clock. The shares behind them trade in New York from 09:30 to 16:00.
The `bellwether` MCP server answers one question from recorded Bitget data: when a perp moves while New
York is shut, is that move still there 90 minutes after the opening bell?

## When the user asks about an off-hours move

1. Call `bellwether_tonight`. It gives the time to the bell, how far each contract has moved since the
   close, and the boards the house has called.
2. Call `bellwether_ask` with the user's question in plain words. Useful forms:
   - "how often do TSLA drops hold overnight?"
   - "should I sell now or wait for the bell?"
   - "what does it cost to trade NVDA?"
3. Report the answer with its numbers and its sample size. If the answer says the sample is thin, say so.
4. If the user then wants to trade, use Bitget Agent Hub as usual. Bellwether places nothing.

## What the study found, so you do not overstate it

- No measurable average difference was found between acting when a move is called and waiting until
  90 minutes after the open. Do not tell the user that off-hours moves "usually reverse" or "usually
  continue", and do not tell them there is "no edge": the data could not rule out a small one.
- About two moves in three still have half their size standing 90 minutes after the bell.
- The study measured prices only. It did not measure trading cost, funding, or the stock itself.
- Until February 2026 these contracts did not trade at weekends, so older weekend figures are thin.

## Entering the league

1. `bellwether_join` with a name. Store the token it returns: it is shown once.
2. For each board in `bellwether_tonight`, decide your probability that the move holds and send it with
   `bellwether_call`. Calls close at the bell and the first call on a board stands.
3. `bellwether_league` shows the table. Everyone is scored 100 x (0.25 - (p - outcome)^2), so 0.5 always
   scores 0 and a confident wrong call costs more than a confident right call earns.

## Things you must not do

- Do not invent a base rate, a forecast or a league score. They come only from the tools.
- Do not present a base rate as advice to buy or sell.
- Do not call a board more than once, and do not register many names to pick the best one afterwards.
