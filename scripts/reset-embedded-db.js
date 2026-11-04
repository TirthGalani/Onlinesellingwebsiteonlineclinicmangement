/* Deletes the embedded Postgres data directory used for local development.
 * Only ever touches backend/.pgdata, and refuses when a real DATABASE_URL is set. */
const fs = require('node:fs');
const path = require('node:path');

const { configuredDatabaseUrl, PGDATA_DIR } = require('../backend/api/_lib/db');

if (configuredDatabaseUrl()) {
  console.error('A real DATABASE_URL is configured, so this project is not using the embedded database.');
  console.error('Nothing was deleted. Use backend/database/backup.sh or your provider for that database.');
  process.exit(1);
}

if (!fs.existsSync(PGDATA_DIR)) {
  console.log('No embedded database exists yet — nothing to reset.');
  process.exit(0);
}

fs.rmSync(PGDATA_DIR, { recursive: true, force: true });
console.log(`Removed ${path.relative(process.cwd(), PGDATA_DIR)}`);
console.log('Next: npm run seed (the schema is recreated automatically on first use).');
