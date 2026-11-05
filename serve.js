// Local web server for Maison Dental Clinic Management System.
// Serves the portal and the real /api/* handlers on one origin, which is what the
// HttpOnly session cookie and the mutation origin guard both require.
const http = require('http');
const fs = require('fs');
const path = require('path');

const { handleApiRequest } = require('./backend/server/router');
const { usingEmbeddedDatabase } = require('./backend/api/_lib/db');

const PORT = process.env.PORT || 5500;
const ROOT_DIR = __dirname;

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    if (process.env[key] !== undefined) continue;
    process.env[key] = trimmed.slice(separator + 1).trim().replace(/^"(.*)"$/, '$1');
  }
}

loadEnvFile(path.join(ROOT_DIR, '.env'));

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad request');
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    handleApiRequest(req, res, url).catch(error => {
      console.error('[server] unhandled API failure:', error);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end('{"error":"Server error."}');
      }
    });
    return;
  }

  const reqPath = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(ROOT_DIR, reqPath));
  if (filePath !== ROOT_DIR && !filePath.startsWith(ROOT_DIR + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`404 Not Found: ${reqPath}`);
      return;
    }

    const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n======================================================`);
  console.log(`  Maison Dental Website + Portal + API is running!`);
  console.log(`  Website: http://127.0.0.1:${PORT}/index.html`);
  console.log(`  Portal:  http://127.0.0.1:${PORT}/portal.html`);
  console.log(`  Health:  http://127.0.0.1:${PORT}/api/health`);
  console.log(`  Storage: ${usingEmbeddedDatabase() ? 'embedded Postgres (backend/.pgdata)' : 'Neon (DATABASE_URL)'}`);
  console.log(`======================================================\n`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is in use. Retrying on port ${Number(PORT) + 1}...`);
    server.listen(Number(PORT) + 1, '127.0.0.1');
  } else {
    console.error('Server error:', err);
  }
});
