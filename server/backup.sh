#!/usr/bin/env bash
# Nightly PocketBase backup: a consistent SQLite copy, safe while the server runs.
# Keeps 14 daily and 8 weekly (Sunday) copies. Pings HC_URL (Healthchecks.io) if set.
set -euo pipefail

DB=/var/lib/pocketbase/pb_data/data.db
DEST=${BACKUP_DIR:-/var/backups/forge}
KEEP_DAILY=${KEEP_DAILY:-14}
KEEP_WEEKLY=${KEEP_WEEKLY:-8}

hc() { [ -n "${HC_URL:-}" ] && curl -fsS -m 10 --retry 3 "$HC_URL$1" >/dev/null || true; }
trap 'hc /fail' ERR
hc /start

mkdir -p "$DEST/daily" "$DEST/weekly"
stamp=$(date +%F)
tmp=$(mktemp "$DEST/.forge-$stamp.XXXXXX")
sqlite3 "$DB" ".backup '$tmp'"
sqlite3 "$tmp" "PRAGMA integrity_check;" | grep -qx ok
gzip -9 -c "$tmp" > "$DEST/daily/forge-$stamp.db.gz"
rm -f "$tmp"

if [ "$(date +%u)" = 7 ]; then
  cp "$DEST/daily/forge-$stamp.db.gz" "$DEST/weekly/forge-$stamp.db.gz"
fi

prune() {
  local files
  files=$(ls -1t "$1"/forge-*.db.gz 2>/dev/null || true)
  [ -n "$files" ] && printf '%s\n' "$files" | tail -n +"$(($2 + 1))" | xargs -r rm -f
  return 0
}
prune "$DEST/daily" "$KEEP_DAILY"
prune "$DEST/weekly" "$KEEP_WEEKLY"

hc ""
echo "Backed up to $DEST/daily/forge-$stamp.db.gz"
