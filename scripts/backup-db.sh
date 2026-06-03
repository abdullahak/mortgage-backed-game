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

if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$DB_PATH" ".backup '$backup'"
else
  DB_PATH="$DB_PATH" BACKUP_PATH="$backup" node --experimental-sqlite - <<'NODE'
const { DatabaseSync, backup } = require('node:sqlite');

const db = new DatabaseSync(process.env.DB_PATH, { readOnly: true });
backup(db, process.env.BACKUP_PATH)
  .finally(() => db.close())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
NODE
fi
find "$BACKUP_DIR" -name 'game-*.db' -type f -mtime +"$RETENTION_DAYS" -delete

echo "Backup written: $backup"
