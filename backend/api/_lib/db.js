/* Database access for the clinic API.
 * Production uses Neon (DATABASE_URL). When no real URL is configured the same
 * SQL runs against an embedded Postgres (PGlite) so the app is testable offline. */
const fs = require('node:fs');
const path = require('node:path');

const SCHEMA_PATH = path.join(__dirname, '..', '..', 'database', 'schema.sql');
const PGDATA_DIR = path.join(__dirname, '..', '..', '.pgdata');

function configuredDatabaseUrl() {
  const raw = String(process.env.DATABASE_URL || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (!url.hostname || url.hostname.toUpperCase() === 'HOST') return '';
    if (decodeURIComponent(url.password).toUpperCase() === 'PASSWORD') return '';
    return raw;
  } catch {
    return '';
  }
}

function usingEmbeddedDatabase() {
  return !configuredDatabaseUrl() && process.env.EMBEDDED_DB !== 'off';
}

function toParam(value) {
  if (value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value) || (value && typeof value === 'object')) return JSON.stringify(value);
  return value;
}

// Neon's interface is a tagged template; PGlite takes (text, params). This converts
// `sql`SELECT ... ${id}`` into the equivalent parameterised query.
function toQuery(strings, values) {
  const parts = Array.from(strings);
  let text = parts[0];
  for (let i = 1; i < parts.length; i += 1) text += `$${i}${parts[i]}`;
  return { text, params: values.map(toParam) };
}

let embeddedPromise = null;

function openEmbedded() {
  if (!embeddedPromise) {
    embeddedPromise = (async () => {
      const { PGlite } = require('@electric-sql/pglite');
      const instance = new PGlite(PGDATA_DIR);
      await instance.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));
      return instance;
    })().catch(error => {
      embeddedPromise = null;
      throw error;
    });
  }
  return embeddedPromise;
}

let embeddedTag = null;

function embeddedSqlTag() {
  if (embeddedTag) return embeddedTag;
  embeddedTag = function sql(strings, ...values) {
    const { text, params } = toQuery(strings, values);
    return openEmbedded().then(instance => instance.query(text, params)).then(result => result.rows || []);
  };
  return embeddedTag;
}

let neonTag = null;

function neonSqlTag() {
  if (!neonTag) neonTag = require('@neondatabase/serverless').neon(configuredDatabaseUrl());
  return neonTag;
}

function database() {
  if (usingEmbeddedDatabase()) return embeddedSqlTag();
  const url = configuredDatabaseUrl();
  if (!url) throw new Error('DATABASE_URL is not configured.');
  return neonSqlTag();
}

module.exports = {
  database,
  configuredDatabaseUrl,
  usingEmbeddedDatabase,
  SCHEMA_PATH,
  PGDATA_DIR
};
