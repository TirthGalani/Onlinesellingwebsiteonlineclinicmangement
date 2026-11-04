const jwt = require('jsonwebtoken');
const crypto = require('node:crypto');
const db = require('./db');

const SESSION_COOKIE = 'maison_session';
const SESSION_SECONDS = 8 * 60 * 60;

function reply(res, status, payload) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(status).json(payload);
}

function method(req, allowed, res) {
  res.setHeader('Allow', allowed.join(', '));
  if (!allowed.includes(req.method)) {
    reply(res, 405, { error: 'Method not allowed.' });
    return false;
  }
  return true;
}

function database() {
  return db.database();
}

function cookieValue(req, name) {
  const cookies = String(req.headers.cookie || '').split(';');
  const entry = cookies.find(part => part.trim().startsWith(`${name}=`));
  if (!entry) return '';
  try { return decodeURIComponent(entry.trim().slice(name.length + 1)); } catch { return ''; }
}

function tokenFromRequest(req) {
  const authorization = String(req.headers.authorization || '');
  const bearer = authorization.match(/^Bearer\s+(.+)$/i);
  return (bearer && bearer[1]) || cookieValue(req, SESSION_COOKIE);
}

function requireUser(req, res, roles = []) {
  if (!process.env.JWT_SECRET) {
    reply(res, 503, { error: 'Authentication is not configured.' });
    return null;
  }
  let user;
  try {
    user = jwt.verify(tokenFromRequest(req), process.env.JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: 'maison-dental'
    });
  } catch {
    reply(res, 401, { error: 'Please sign in to continue.' });
    return null;
  }
  if (!user || typeof user.sub !== 'string' || !['patient', 'doctor', 'management'].includes(user.role)) {
    reply(res, 401, { error: 'Please sign in to continue.' });
    return null;
  }
  if (roles.length && !roles.includes(user.role)) {
    reply(res, 403, { error: 'Your account does not have access to this action.' });
    return null;
  }
  return user;
}

// Cookie-authenticated mutations must originate from this deployment. This blocks
// cross-site form/fetch attempts that reuse a signed-in browser session.
function guardMutation(req, res) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;
  const origin = String(req.headers.origin || '');
  if (!origin) return true;
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  const forwardedProto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  try {
    const parsed = new URL(origin);
    if (parsed.host === host) return true;
    if (parsed.hostname === 'localhost' && /^localhost(:\d+)?$/.test(host)) return true;
    if (parsed.protocol === `${forwardedProto}:` && parsed.host === host) return true;
  } catch {
    // Fall through to the rejection below.
  }
  reply(res, 403, { error: 'This request did not come from the clinic application.' });
  return false;
}

function sessionCookie(token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}${secure}`;
}

function clearSessionCookie() {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

function issueSession(user) {
  return jwt.sign({ sub: user.id, role: user.role, name: user.name, email: user.email }, process.env.JWT_SECRET, {
    algorithm: 'HS256', expiresIn: '8h', issuer: 'maison-dental'
  });
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase().slice(0, 254);
}

function text(value, max = 2000) {
  return String(value || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || ''));
}

function passwordProblem(password) {
  const value = String(password || '');
  if (value.length < 12) return 'Use a password of at least 12 characters.';
  if (value.length > 128) return 'Use a password of no more than 128 characters.';
  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) return 'Include at least one letter and one number in the password.';
  return null;
}

function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || String(req.socket?.remoteAddress || 'unknown');
}

function clinicianSurname(name) {
  return String(name || '')
    .replace(/^dr\.?\s*/i, '')
    .split(',')[0]
    .trim()
    .toLowerCase();
}

async function canAccessPatient(sql, user, patientId) {
  const id = String(patientId || '');
  if (!id) return false;
  if (user.role === 'management') return true;
  if (user.role === 'patient') return user.sub === id;
  if (user.role !== 'doctor') return false;
  const surname = clinicianSurname(user.name);
  if (!surname) return false;
  const rows = await sql`SELECT 1 FROM appointments WHERE patient_id = ${id} AND (clinician_id = ${user.sub} OR (clinician_id IS NULL AND lower(dentist) LIKE ${`%${surname}%`})) LIMIT 1`;
  return rows.length > 0;
}

async function audit(sql, actorId, action, entityType, entityId, details = {}) {
  const id = crypto.randomUUID();
  await sql`INSERT INTO audit_events (id, actor_id, action, entity_type, entity_id, details) VALUES (${id}, ${actorId || null}, ${action}, ${entityType}, ${entityId}, ${JSON.stringify(details)}::jsonb)`;
}

async function notify(sql, userId, title, body, type = 'info', link = '') {
  const id = crypto.randomUUID();
  await sql`INSERT INTO user_notifications (id, user_id, title, body, notification_type, link_url) VALUES (${id}, ${userId}, ${title}, ${body}, ${type}, ${link})`;
  return id;
}

module.exports = {
  SESSION_COOKIE,
  reply,
  method,
  database,
  requireUser,
  guardMutation,
  sessionCookie,
  clearSessionCookie,
  issueSession,
  normalizeEmail,
  text,
  isValidEmail,
  passwordProblem,
  clientIp,
  clinicianSurname,
  canAccessPatient,
  audit,
  notify
};
