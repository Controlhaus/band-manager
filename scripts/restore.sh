#!/bin/sh
# Restore from a dated backup (§15.6). Usage:
#   scripts/restore.sh 2026-07-18_030000
# Expects backups/db_<stamp>.sql.gz and backups/uploads_<stamp>.tar.gz.
set -e

STAMP="$1"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
COMPOSE="docker compose"

if [ -z "$STAMP" ]; then
  echo "Usage: $0 <backup-stamp>   (e.g. 2026-07-18_030000)"
  echo "Available:"
  ls "$BACKUP_DIR" 2>/dev/null | sed 's/^/  /'
  exit 1
fi

DB_FILE="$BACKUP_DIR/db_$STAMP.sql.gz"
UP_FILE="$BACKUP_DIR/uploads_$STAMP.tar.gz"
[ -f "$DB_FILE" ] || { echo "Missing $DB_FILE"; exit 1; }

echo "→ Stopping app…"
$COMPOSE stop app

echo "→ Recreating database…"
$COMPOSE exec -T db psql -U "${POSTGRES_USER:-band}" -d postgres -c \
  "DROP DATABASE IF EXISTS \"${POSTGRES_DB:-band}\";"
$COMPOSE exec -T db psql -U "${POSTGRES_USER:-band}" -d postgres -c \
  "CREATE DATABASE \"${POSTGRES_DB:-band}\";"

echo "→ Restoring database…"
gunzip -c "$DB_FILE" | $COMPOSE exec -T db psql -U "${POSTGRES_USER:-band}" -d "${POSTGRES_DB:-band}"

if [ -f "$UP_FILE" ]; then
  echo "→ Restoring uploads…"
  docker run --rm \
    -v band-manager_uploads:/data \
    -v "$(cd "$BACKUP_DIR" && pwd):/backup:ro" \
    alpine sh -c "rm -rf /data/* && tar xzf /backup/uploads_$STAMP.tar.gz -C /data"
fi

echo "→ Starting app (migrations no-op on a restored DB)…"
$COMPOSE start app

echo "✓ Restore complete."
