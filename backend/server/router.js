/* Maps an incoming /api/* request onto the Vercel-style handlers in backend/api.
 * The handlers only expect req.{method,headers,query,body,socket} and
 * res.{statusCode,setHeader,status,json,send,end}, so a local server can run the
 * exact same files that deploy unchanged. */
const fs = require('node:fs');
const path = require('node:path');

const API_ROOT = path.join(__dirname, '..', 'api');

function resolveHandlerModule(pathname) {
  const relative = decodeURIComponent(pathname).replace(/^\/+api\/+/, '').replace(/\/+$/, '');
  if (!relative || relative.includes('..') || !/^[\w/-]*$/.test(relative)) return null;
  const candidates = [
    path.join(API_ROOT, `${relative}.js`),
    path.join(API_ROOT, relative, 'index.js')
  ];
  for (const candidate of candidates) {
    const normalized = path.normalize(candidate);
    if (!normalized.startsWith(API_ROOT + path.sep)) continue;
    if (normalized.includes(`${path.sep}_`)) continue;
    if (fs.existsSync(normalized) && fs.statSync(normalized).isFile()) return normalized;
  }
  return null;
}

function createResponse(res) {
  const headers = Object.create(null);
  let statusCode = 200;
  let finished = false;

  const write = (payload, fallbackType) => {
    if (finished) return;
    finished = true;
    if (!headers['Content-Type'] && fallbackType) headers['Content-Type'] = fallbackType;
    res.writeHead(statusCode, headers);
    res.end(payload);
  };

  return {
    get statusCode() { return statusCode; },
    set statusCode(code) { statusCode = code; },
    setHeader(name, value) { headers[name] = value; },
    getHeader(name) { return headers[name]; },
    status(code) { statusCode = code; return this; },
    json(payload) { write(Buffer.from(JSON.stringify(payload)), 'application/json; charset=utf-8'); },
    send(payload) {
      if (Buffer.isBuffer(payload)) return write(payload, 'application/octet-stream');
      if (typeof payload === 'string') return write(Buffer.from(payload), 'text/plain; charset=utf-8');
      return this.json(payload);
    },
    end(payload) {
      if (payload === undefined || payload === null) return write(Buffer.alloc(0), 'text/plain; charset=utf-8');
      return this.send(payload);
    },
    get finished() { return finished; }
  };
}

function readBody(req, limitBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(Object.assign(new Error('Request body too large.'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parseBody(raw, contentType) {
  if (!raw || !raw.length) return {};
  const type = String(contentType || '').split(';')[0].trim();
  if (type === 'application/json') {
    try { return JSON.parse(raw.toString('utf8')); } catch { return {}; }
  }
  if (type === 'application/x-www-form-urlencoded') {
    return Object.fromEntries(new URLSearchParams(raw.toString('utf8')));
  }
  return { raw };
}

async function handleApiRequest(req, res, url) {
  const modulePath = resolveHandlerModule(url.pathname);
  if (!modulePath) {
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end('{"error":"Unknown API route."}');
    return;
  }

  let body = {};
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const raw = await readBody(req, Number(process.env.REQUEST_BODY_LIMIT_BYTES || 12 * 1024 * 1024));
    body = parseBody(raw, req.headers['content-type']);
  }

  const apiReq = {
    method: req.method,
    headers: req.headers,
    url: req.url,
    query: Object.fromEntries(url.searchParams),
    body,
    socket: req.socket
  };
  const apiRes = createResponse(res);

  try {
    await require(modulePath)(apiReq, apiRes);
  } catch (error) {
    console.error(`[api] ${req.method} ${url.pathname} failed:`, error && error.message);
    if (!apiRes.finished) {
      apiRes.status(Number(error && error.statusCode) || 500).json({ error: 'The clinic service could not complete this request.' });
    }
  }
}

module.exports = { handleApiRequest, resolveHandlerModule, API_ROOT };
