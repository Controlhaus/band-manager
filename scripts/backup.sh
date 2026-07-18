#!/bin/sh
# Nightly backup (§11): dumps the database and tars the uploads volume,
# retaining 14 days. Intended to run via cron on the VPS, e.g.:
#   0 3 * * * /path/to/band-manager/scripts/backup.sh >> /var/log/band-backup.log 2>&1
set -e

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP="$(date +%Y-%m-%d_%H%M%S)"
COMPOSE="docker compose"

mkdir -p "$BACKUP_DIR"

echo "→ Dumping database…"
$COMPOSE exec -T db pg_dump -U "${POSTGRES_USER:-band}" "${POSTGRES_DB:-band}" \
  | gzip > "$BACKUP_DIR/db_$STAMP.sql.gz"

echo "→ Archiving uploads…"
UPLOADS_VOLUME="$($COMPOSE ps -q app >/dev/null 2>&1 && echo band-manager_uploads || echo band-manager_uploads)"
docker run --rm \
  -v "${UPLOADS_VOLUME}:/data:ro" \
  -v "$(cd "$BACKUP_DIR" && pwd):/backup" \
  alpine tar czf "/backup/uploads_$STAMP.tar.gz" -C /data .

echo "→ Pruning backups older than ${RETENTION_DAYS} days…"
find "$BACKUP_DIR" -name 'db_*.sql.gz' -mtime +"$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -name 'uploads_*.tar.gz' -mtime +"$RETENTION_DAYS" -delete

echo "✓ Backup complete: $BACKUP_DIR (db_$STAMP.sql.gz, uploads_$STAMP.tar.gz)"
