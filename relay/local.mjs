// Run the relay locally with Node 18+:  WHOOP_CLIENT_ID=... WHOOP_CLIENT_SECRET=... node relay/local.mjs
import http from 'node:http';
import { handle } from './worker.js';

const env = {
  WHOOP_CLIENT_ID: process.env.WHOOP_CLIENT_ID,
  WHOOP_CLIENT_SECRET: process.env.WHOOP_CLIENT_SECRET,
  ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN || 'http://localhost:*,http://127.0.0.1:*',
};
const port = Number(process.env.PORT || 8787);
if (!env.WHOOP_CLIENT_ID || !env.WHOOP_CLIENT_SECRET) {
  console.error('Set WHOOP_CLIENT_ID and WHOOP_CLIENT_SECRET, e.g.\n  WHOOP_CLIENT_ID=... WHOOP_CLIENT_SECRET=... npm run relay');
  process.exit(1);
}

http
  .createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const request = new Request(`http://localhost:${port}${req.url}`, {
      method: req.method,
      headers: req.headers,
      body: body && req.method !== 'GET' && req.method !== 'HEAD' ? body : undefined,
    });
    const r = await handle(request, env);
    console.log(new Date().toISOString(), req.method, req.url, '->', r.status);
    res.writeHead(r.status, Object.fromEntries(r.headers.entries()));
    res.end(Buffer.from(await r.arrayBuffer()));
  })
  .listen(port, () => console.log(`WHOOP relay listening on http://localhost:${port} (allowed origin ${env.ALLOWED_ORIGIN})`));
