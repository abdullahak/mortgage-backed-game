#!/usr/bin/env bash
set -euo pipefail

DB_PATH="${DB_PATH:-/mnt/ssd/projects/mortgage-backed/backend/game.db}"
BACKUP_PATH="${BACKUP_PATH:-${1:-}}"
PRE_RESTORE_DIR="${PRE_RESTORE_DIR:-/mnt/ssd/backups/mortgage-backed/pre-restore}"
PROD_DB_PATH="/mnt/ssd/projects/mortgage-backed/backend/game.db"

if [ -z "$BACKUP_PATH" ]; then
  echo "Usage: BACKUP_PATH=/path/to/game-backup.db DB_PATH=/path/to/game.db scripts/restore-db.sh" >&2
  echo "   or: DB_PATH=/path/to/game.db scripts/restore-db.sh /path/to/game-backup.db" >&2
  exit 2
fi

if [ ! -f "$BACKUP_PATH" ]; then
  echo "Backup not found: $BACKUP_PATH" >&2
  exit 1
fi

if [ "$DB_PATH" = "$PROD_DB_PATH" ] && [ "${CONFIRM_RESTORE:-}" != "restore-production" ]; then
  echo "Refusing to restore the production database without CONFIRM_RESTORE=restore-production." >&2
  echo "Stop mortgage-backend first, then rerun with the confirmation flag if this is intentional." >&2
  exit 2
fi

check_integrity() {
  local sqlite_path="$1"
  if command -v sqlite3 >/dev/null 2>&1; then
    local result
    result="$(sqlite3 "$sqlite_path" 'PRAGMA integrity_check;')"
    [ "$result" = "ok" ]
    return
  fi

  SQLITE_PATH="$sqlite_path" node --experimental-sqlite - <<'NODE'
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(process.env.SQLITE_PATH, { readOnly: true });
try {
  const row = db.prepare('PRAGMA integrity_check').get();
  const result = row && Object.values(row)[0];
  if (result !== 'ok') {
    console.error(result || 'integrity_check returned no result');
    process.exit(1);
  }
} finally {
  db.close();
}
NODE
}

if ! check_integrity "$BACKUP_PATH"; then
  echo "Backup failed SQLite integrity check: $BACKUP_PATH" >&2
  exit 1
fi

mkdir -p "$(dirname "$DB_PATH")"

if [ -f "$DB_PATH" ]; then
  mkdir -p "$PRE_RESTORE_DIR"
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  pre_restore="$PRE_RESTORE_DIR/game-before-restore-$stamp.db"
  cp "$DB_PATH" "$pre_restore"
  echo "Current database copied before restore: $pre_restore"
fi

cp "$BACKUP_PATH" "$DB_PATH"

if ! check_integrity "$DB_PATH"; then
  echo "Restored database failed SQLite integrity check: $DB_PATH" >&2
  exit 1
fi

echo "Database restored: $DB_PATH"
