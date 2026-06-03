#!/usr/bin/env bash
set -euo pipefail

DB_PATH="${DB_PATH:-/mnt/ssd/projects/mortgage-backed/backend/game.db}"
BACKUP_DIR="${BACKUP_DIR:-/mnt/ssd/backups/mortgage-backed}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

if [ ! -f "$DB_PATH" ]; then
  echo "Database not found: $DB_PATH" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup="$BACKUP_DIR/game-$stamp.db"

sqlite3 "$DB_PATH" ".backup '$backup'"
find "$BACKUP_DIR" -name 'game-*.db' -type f -mtime +"$RETENTION_DAYS" -delete

echo "Backup written: $backup"
