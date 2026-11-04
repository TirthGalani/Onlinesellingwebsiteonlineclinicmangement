#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must be set}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$SCRIPT_DIR/../backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
mkdir -p "$BACKUP_DIR"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TARGET="$BACKUP_DIR/maison-$STAMP.dump"
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo "Creating custom-format PostgreSQL backup: $TARGET"
if ! pg_dump "$DATABASE_URL" --format=custom --no-owner --no-privileges --file "$TARGET"; then
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v loc="$TARGET" -c \
    "INSERT INTO backup_runs (id, status, location, notes) VALUES (gen_random_uuid()::text, 'failed', :'loc', 'pg_dump failed')" || true
  exit 1
fi

SIZE_BYTES="$(wc -c < "$TARGET" | tr -d ' ')"
if command -v sha256sum >/dev/null 2>&1; then
  CHECKSUM="$(sha256sum "$TARGET" | awk '{print $1}')"
else
  CHECKSUM="$(shasum -a 256 "$TARGET" | awk '{print $1}')"
fi

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -v loc="$TARGET" -v size="$SIZE_BYTES" -v sum="$CHECKSUM" -v started="$STARTED_AT" -c \
  "INSERT INTO backup_runs (id, status, location, size_bytes, checksum, started_at, finished_at, notes)
   VALUES (gen_random_uuid()::text, 'completed', :'loc', :size, :'sum', :'started'::timestamptz, now(), 'pg_dump custom format')"

# Remove local dumps older than the retention window.
find "$BACKUP_DIR" -type f -name 'maison-*.dump' -mtime +"$RETENTION_DAYS" -print -delete

echo "Backup complete. size=$SIZE_BYTES bytes sha256=$CHECKSUM"
echo "Store encrypted copies off the database host and test a restore regularly. Neon also provides point-in-time restore on paid plans."
