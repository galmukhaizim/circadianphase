// Run the relay locally with Node 18+:  WHOOP_CLIENT_ID=... WHOOP_CLIENT_SECRET=... node relay/local.mjs
import http from 'node:http';
import { handle } from './worker.js';

const env = {
  WHOOP_CLIENT_ID: process.env.WHOOP_CLIENT_ID,
  WHOOP_CLIENT_SECRET: process.env.WHOOP_CLIENT_SECRET,
  ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN || 'http://localhost:5173',
};
const port = Number(process.env.PORT || 8787);

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
    res.writeHead(r.status, Object.fromEntries(r.headers.entries()));
    res.end(Buffer.from(await r.arrayBuffer()));
  })
  .listen(port, () => console.log(`WHOOP relay listening on http://localhost:${port} (allowed origin ${env.ALLOWED_ORIGIN})`));
