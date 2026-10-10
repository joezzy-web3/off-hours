// A local server for the built site: static files from dist/web and the same
// function Netlify runs for /api/*.
//   npm run build:netlify && node scripts/dev.mjs      then open http://localhost:4173
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const { handler } = createRequire(import.meta.url)(path.resolve('dist/netlify/functions/api.js'));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const port = Number(process.env.PORT) || 4173;
const ROOT = path.resolve(process.env.WEB_ROOT || 'dist/web');

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname.startsWith('/api/')) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const out = await handler({ httpMethod: req.method, path: url.pathname, rawQuery: url.search.slice(1), headers: req.headers, body: Buffer.concat(chunks).toString('utf8') });
    res.writeHead(out.statusCode, out.headers);
    return res.end(out.body);
  }
  const file = path.join(ROOT, path.normalize(url.pathname === '/' ? '/index.html' : url.pathname));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end('not found'); }
}).listen(port, () => console.log(`http://localhost:${port}`));
