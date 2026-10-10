// A stand-in for api.bitget.com, shaped like the real v2 mix responses, so the
// server routes can be tested without network or keys. It checks the request
// signature and the demo-trading header on every signed call.

import { createHmac } from 'node:crypto';
import { createServer, Server } from 'node:http';

export const MOCK_SECRET = 'mock-secret';
export const PRICES: Record<string, number> = { NVDAUSDT: 230.5, SPYUSDT: 700, TSLAUSDT: 380 };

export function startMock(): Promise<{ server: Server; url: string; orders: Record<string, unknown>[] }> {
  const orders: Record<string, unknown>[] = [];
  const ok = (data: unknown) => JSON.stringify({ code: '00000', msg: 'success', requestTime: Date.now(), data });
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://mock');
    const symbol = url.searchParams.get('symbol') ?? '';
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'GET') {
      if (url.pathname.endsWith('/tickers')) return res.end(ok(Object.entries(PRICES).map(([s, p]) => ({ symbol: s, lastPr: String(p), indexPrice: String(p * 1.001), markPrice: String(p), fundingRate: '0.0001' }))));
      if (url.pathname.endsWith('/contracts')) return res.end(ok([{ symbol, volumePlace: '2', pricePlace: '2', isRwa: 'YES' }]));
      if (url.pathname.endsWith('/merge-depth')) {
        const step = { scale0: 0.01, scale1: 0.1, scale2: 1, scale3: 10 }[url.searchParams.get('precision') ?? 'scale0']!;
        const mid = PRICES[symbol];
        const side = (dir: number) => Array.from({ length: 100 }, (_, i) => [(mid + dir * step * (i + 0.5)).toFixed(3), String(2 * Math.round(step / 0.01))]);
        return res.end(ok({ asks: side(1), bids: side(-1), ts: String(Date.now()) }));
      }
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const ts = String(req.headers['access-timestamp']);
        const want = createHmac('sha256', MOCK_SECRET).update(ts + 'POST' + url.pathname + body).digest('base64');
        if (req.headers['access-sign'] !== want) return res.end(JSON.stringify({ code: '40009', msg: 'sign signature error', data: null }));
        if (req.headers.paptrading !== '1') return res.end(JSON.stringify({ code: '40099', msg: 'mock only accepts demo trading', data: null }));
        const payload = JSON.parse(body);
        orders.push({ path: url.pathname, ...payload });
        res.end(ok(url.pathname.endsWith('/place-order') ? { orderId: '1300000000000000001', clientOid: payload.clientOid } : { symbol: payload.symbol }));
      });
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ code: '40404', msg: 'Request URL NOT FOUND', data: null }));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${(server.address() as { port: number }).port}`, orders })));
}
