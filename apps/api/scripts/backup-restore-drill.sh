#!/usr/bin/env bash
# Backup + restore drill — dumps the DB, restores it into a scratch database,
# and verifies a canary query returns non-empty. Exit 0 pass / 1 fail.
#
# Usage:
#   DATABASE_URL="postgresql://user:pass@localhost:5439/bluefish" \
#     ./scripts/backup-restore-drill.sh [output_dir]
#
# Requires: pg_dump, psql on PATH. Docker containers work (docker exec pg_dump).

set -euo pipefail

# ── parse DATABASE_URL ────────────────────────────────────────────────
: "${DATABASE_URL:?DATABASE_URL is required}"
proto_stripped="${DATABASE_URL#*://}"
creds="${proto_stripped%%@*}"
hostpath="${proto_stripped#*@}"
DB_USER="${creds%%:*}"
DB_PASS="${creds#*:}"
DB_HOST="${hostpath%%:*}"
rest="${hostpath#*:}"
DB_PORT="${rest%%/*}"
DB_NAME="${rest#*/}"
DB_NAME="${DB_NAME%%\?*}"

OUT_DIR="${1:-/tmp/bluefish-drill}"
mkdir -p "$OUT_DIR"
STAMP="$(date +%Y%m%d_%H%M%S)"
DUMP="$OUT_DIR/bluefish_${STAMP}.sql.gz"
SCRATCH_DB="bluefish_drill_${STAMP}"

export PGPASSWORD="$DB_PASS"

log() { printf '[drill] %s\n' "$*"; }

# ── 1. dump ────────────────────────────────────────────────────────────
log "step 1/4 dump → $DUMP"
pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
  --no-owner --no-privileges --clean --if-exists \
  | gzip -c > "$DUMP"
BYTES=$(stat -c%s "$DUMP" 2>/dev/null || stat -f%z "$DUMP")
log "  dump size = ${BYTES} bytes"
if [ "$BYTES" -lt 5000 ]; then
  log "❌ dump suspiciously small; aborting"
  exit 1
fi

# ── 2. create scratch DB ───────────────────────────────────────────────
log "step 2/4 create scratch DB $SCRATCH_DB"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres \
  -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$SCRATCH_DB\";" >/dev/null

cleanup() {
  log "cleanup: DROP DATABASE $SCRATCH_DB"
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres \
    -c "DROP DATABASE IF EXISTS \"$SCRATCH_DB\";" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# ── 3. restore ─────────────────────────────────────────────────────────
log "step 3/4 restore into $SCRATCH_DB"
gunzip -c "$DUMP" | psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$SCRATCH_DB" \
  -v ON_ERROR_STOP=1 >/dev/null

# ── 4. canary verification ─────────────────────────────────────────────
log "step 4/4 verify canary rows"
USER_COUNT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$SCRATCH_DB" -tA -c 'SELECT COUNT(*) FROM "User";')
CUST_COUNT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$SCRATCH_DB" -tA -c 'SELECT COUNT(*) FROM "Customer";')
AUDIT_COUNT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$SCRATCH_DB" -tA -c 'SELECT COUNT(*) FROM "AuditLog";')
log "  Users=$USER_COUNT Customers=$CUST_COUNT AuditLog=$AUDIT_COUNT"

if [ "$USER_COUNT" -lt 1 ] || [ "$CUST_COUNT" -lt 1 ]; then
  log "❌ canary failed — restored DB looks empty"
  exit 1
fi

log "✅ backup + restore drill PASSED (dump=$DUMP)"
