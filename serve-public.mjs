// Единый публичный сервер для демо: отдаёт собранный frontend и проксирует
// /api и /webhook на локальный Fastify. Один HTTPS-туннель обслуживает всё,
// поэтому браузеру не нужен отдельный адрес backend и CORS.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, request as httpRequest } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve('frontend/dist');
const PORT = Number(process.env.PORT ?? 5173);
const BACKEND = { host: '127.0.0.1', port: 3000 };

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function proxy(req, res) {
  const upstream = httpRequest(
    {
      host: BACKEND.host,
      port: BACKEND.port,
      method: req.method,
      path: req.url,
      headers: { ...req.headers, host: `127.0.0.1:${BACKEND.port}` },
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    },
  );
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'BAD_GATEWAY', message: 'Backend unavailable' } }));
  });
  req.pipe(upstream);
}

const server = createServer((req, res) => {
  const requestUrl = req.url ?? '/';
  if (requestUrl.startsWith('/api') || requestUrl.startsWith('/webhook')) {
    proxy(req, res);
    return;
  }

  const pathname = decodeURIComponent(new URL(requestUrl, 'http://localhost').pathname);
  const relative = normalize(pathname).replace(/^([/\\])+/, '');
  let filePath = join(ROOT, relative);

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  if (pathname === '/' || !existsSync(filePath) || !statSync(filePath).isFile()) {
    filePath = join(ROOT, 'index.html');
  }

  const ext = extname(filePath).toLowerCase();
  const cacheControl = ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable';
  const size = statSync(filePath).size;
  res.writeHead(200, {
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    'Content-Length': size,
    'Cache-Control': cacheControl,
    'Accept-Ranges': 'bytes',
  });
  createReadStream(filePath).pipe(res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`public demo server: http://127.0.0.1:${PORT} -> backend :${BACKEND.port}`);
});
