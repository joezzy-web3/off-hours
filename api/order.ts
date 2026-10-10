// POST /api/order : places the "now" share of a plan on Bitget Demo Trading.
// The visitor's own demo key is used for this one request and is never stored
// or logged. Every signed request carries the demo header, so a real-money key
// is refused by Bitget. Without a key this is a dry run that returns the exact
// order it would have sent.
import type { ServerResponse } from 'node:http';
import { orderPayload, placeDemo, sizePlaceOf, tickers } from '../src/core/bitget';
import { STOCKS } from '../src/core/board';
import { Req, readJson, send } from './_http';

interface Body { symbol?: string; side?: string; usdt?: number; share?: number; byok?: { key?: string; secret?: string; passphrase?: string } }

export default async function handler(req: Req, res: ServerResponse) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' });
  try {
    const body = await readJson<Body>(req);
    const symbol = String(body.symbol ?? '');
    const usdt = Number(body.usdt), share = Number(body.share);
    if (!STOCKS.includes(symbol)) return send(res, 400, { error: 'unknown_symbol', message: 'That contract is not one of the twelve this product covers.' });
    if (body.side !== 'buy' && body.side !== 'sell') return send(res, 400, { error: 'bad_side', message: 'side is "buy" or "sell".' });
    if (!(usdt >= 5 && usdt <= 5000)) return send(res, 400, { error: 'bad_size', message: 'Order size is 5 to 5,000 USDT.' });
    if (![1, 0.5, 0].includes(share)) return send(res, 400, { error: 'bad_share', message: 'share is 1, 0.5 or 0.' });
    if (share === 0) return send(res, 200, { placed: false, note: 'Your plan waits for the bell, so nothing is sent now.' });

    const price = Number((await tickers())[symbol]?.lastPr);
    if (!(price > 0)) return send(res, 502, { error: 'no_price', message: 'Bitget returned no price for that contract.' });
    const payload = orderPayload({ symbol, side: body.side, usdt, share }, price, await sizePlaceOf(symbol));
    if (!(Number(payload.order.size) > 0)) return send(res, 400, { error: 'too_small', message: 'That size rounds down to nothing at the current price. Raise it.' });

    const b = body.byok;
    if (!(b && b.key && b.secret && b.passphrase)) {
      return send(res, 200, { placed: false, venue: 'dry run', price, order: payload.order, note: 'No demo key was given, so nothing was sent. This is the exact order that would be.' });
    }
    const placed = await placeDemo(payload, { key: String(b.key), secret: String(b.secret), passphrase: String(b.passphrase) });
    send(res, 200, { placed: true, venue: 'bitget-demo', price, orderId: placed.orderId, order: payload.order });
  } catch (e) {
    send(res, 502, { error: 'order_failed', message: (e as Error).message });
  }
}
