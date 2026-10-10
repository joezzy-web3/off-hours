# Data record

Bitget public market data, recorded by the two scripts in `scripts/` and committed by the
workflows in `.github/workflows/`. The study this data is for is fixed in advance in
`research/PREREGISTRATION.md`.

- `node scripts/fetch-history.mjs` records hourly candles, contract specifications and funding rates into `data/`.
- `node scripts/record-book.mjs` appends the current spread and depth of each contract to `data/book/`.
- `node --test tests/recorders.test.mjs` runs both against a local stand-in for the exchange.
