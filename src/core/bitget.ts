// Server-side Bitget client: public order books and signed demo orders.
// Never imported by the browser bundle.

import { createHmac, randomUUID } from 'node:crypto';
import { STOCKS } from './board';
import { Book, BookRow, summarise } from './book';

const BASE = () => process.env.BITGET_BASE_URL || 'https://api.bitget.com';
const PRODUCT = 'USDT-FUTURES';

async function publicGet<T>(path: string, params: Record<string, string | number>): Promise<T> {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
  const res = await fetch(`${BASE()}${path}?${qs}`, { headers: { locale: 'en-US' }, signal: AbortSignal.timeout(8000) });
  const json = (await res.json()) as { code: string; msg: string; data: T };
  if (!res.ok || json.code !== '00000') throw new Error(`Bitget ${path}: ${json.code} ${json.msg}`);
  return json.data;
}

type Ticker = Record<string, string> & { symbol: string };
export const tickers = async () => Object.fromEntries((await publicGet<Ticker[]>('/api/v2/mix/market/tickers', { productType: PRODUCT })).map((t) => [t.symbol, t]));

/** The book at successively coarser price steps, stopping once it reaches 50 basis points from the mid. */
async function books(symbol: string): Promise<Book[]> {
  const out: Book[] = [];
  for (const precision of ['scale0', 'scale1', 'scale2', 'scale3']) {
    const book = await publicGet<Book>('/api/v2/mix/market/merge-depth', { symbol, productType: PRODUCT, precision, limit: 'max' });
    out.push(book);
    const bid = Number(out[0].bids?.[0]?.[0]), ask = Number(out[0].asks?.[0]?.[0]);
    const far = (l: [string, string][]) => (l?.length ? Math.abs(Number(l[l.length - 1][0]) / ((bid + ask) / 2) - 1) * 10_000 : 0);
    if (!(bid > 0 && ask > 0) || Math.min(far(book.bids), far(book.asks)) >= 50) break;
  }
  return out;
}

/** Spread and depth for every stock contract, right now. */
export async function bookNow(now: number): Promise<BookRow[]> {
  const all = await tickers();
  return Promise.all(STOCKS.filter((s) => all[s]).map(async (symbol) => {
    try { return summarise(symbol, await books(symbol), all[symbol], now); } catch (e) { return { t: now, symbol, error: (e as Error).message } as BookRow; }
  }));
}

// ---- signed demo orders -----------------------------------------------------------

export interface Credentials { key: string; secret: string; passphrase: string }

/** Bitget signature: base64(HMAC-SHA256(secret, timestamp + METHOD + path + body)). */
export const sign = (secret: string, timestamp: string, method: string, path: string, body: string) => createHmac('sha256', secret).update(timestamp + method.toUpperCase() + path + body).digest('base64');

async function demoPost<T>(path: string, payload: unknown, creds: Credentials): Promise<T> {
  const body = JSON.stringify(payload);
  const ts = Date.now().toString();
  const res = await fetch(BASE() + path, {
    method: 'POST', body, signal: AbortSignal.timeout(12_000),
    headers: {
      'ACCESS-KEY': creds.key, 'ACCESS-SIGN': sign(creds.secret, ts, 'POST', path, body), 'ACCESS-TIMESTAMP': ts, 'ACCESS-PASSPHRASE': creds.passphrase,
      'Content-Type': 'application/json', locale: 'en-US',
      // Demo Trading: the same paths, this header, and a demo API key. It is always sent, so a real-money key is refused by Bitget.
      paptrading: '1',
    },
  });
  const json = (await res.json()) as { code: string; msg: string; data: T };
  if (json.code !== '00000') throw new Error(`${json.code} ${json.msg}`);
  return json.data;
}

export interface OrderAsk { symbol: string; side: 'buy' | 'sell'; usdt: number; share: number }

/** The exact order that would be sent for the "now" share of a plan: market, 1x, isolated. */
export function orderPayload(ask: OrderAsk, price: number, sizePlace: number) {
  const unit = 10 ** sizePlace;
  const size = Math.floor(((ask.usdt * ask.share) / price) * unit + 1e-9) / unit; // never more than asked: size rounds down
  return {
    leverage: { symbol: ask.symbol, productType: PRODUCT, marginCoin: 'USDT', leverage: '1', holdSide: ask.side === 'buy' ? 'long' : 'short' },
    order: { symbol: ask.symbol, productType: PRODUCT, marginMode: 'isolated', marginCoin: 'USDT', size: size.toFixed(sizePlace), side: ask.side, tradeSide: 'open', orderType: 'market', clientOid: 'bw-' + randomUUID() },
  };
}

export async function sizePlaceOf(symbol: string): Promise<number> {
  const rows = await publicGet<{ symbol: string; volumePlace: string }[]>('/api/v2/mix/market/contracts', { productType: PRODUCT, symbol });
  return Number(rows.find((r) => r.symbol === symbol)?.volumePlace ?? 2);
}

export async function placeDemo(payload: ReturnType<typeof orderPayload>, creds: Credentials): Promise<{ orderId: string }> {
  await demoPost('/api/v2/mix/account/set-leverage', payload.leverage, creds);
  return demoPost<{ orderId: string }>('/api/v2/mix/order/place-order', payload.order, creds);
}
