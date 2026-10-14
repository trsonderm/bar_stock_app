#!/bin/sh
# check-database.sh — Health check & recovery tool for the TopShelf database.
#
# Usage:
#   sh scripts/check-database.sh           — interactive health check
#   sh scripts/check-database.sh --auto    — non-interactive: prints status,
#                                            exits 1 if zero-data detected

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

# ── Detect docker compose command ─────────────────────────────────────────────
if docker compose version >/dev/null 2>&1; then
    DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
    DC="docker-compose"
else
    echo "ERROR: Neither 'docker compose' nor 'docker-compose' was found."
    exit 1
fi

SEARCH_DIRS="${TOPSHELF_BACKUP_DIR:-} /opt/topshelf/backups $SCRIPT_DIR/../backups ./backups"

BACKUP_DIR=""
for d in $SEARCH_DIRS; do
    if [ -d "$d" ]; then
        BACKUP_DIR="$d"
        break
    fi
done
if [ -z "$BACKUP_DIR" ]; then
    BACKUP_DIR="${TOPSHELF_BACKUP_DIR:-/opt/topshelf/backups}"
fi

AUTO_MODE=false
[ "$1" = "--auto" ] && AUTO_MODE=true

# ── Helpers ───────────────────────────────────────────────────────────────────

pg() {
    $DC exec -T db psql -U postgres -d topshelf -tAc "$1" 2>/dev/null \
        | tr -d '[:space:]' || echo "ERR"
}

hr() { echo "──────────────────────────────────────────────────────────────"; }

# ── 1. Check containers ───────────────────────────────────────────────────────

echo ""
echo "============================================================"
echo "  TopShelf Database Health Check"
echo "  $(date)"
echo "============================================================"
echo ""

if ! $DC ps db 2>/dev/null | grep -qE "running|Up"; then
    echo "ERROR: The db container is not running."
    echo "  Start it with:  $DC up -d db"
    echo "  Then re-run:    sh $SCRIPT_DIR/check-database.sh"
    exit 1
fi

DB_EXISTS=$($DC exec -T db psql -U postgres -d postgres -tAc \
    "SELECT 1 FROM pg_database WHERE datname='topshelf'" 2>/dev/null \
    | tr -d '[:space:]' || echo "")

if [ "$DB_EXISTS" != "1" ]; then
    echo "ERROR: The 'topshelf' database does not exist yet."
    echo "  It will be created automatically on next deploy."
    exit 1
fi

# ── 2. Read current row counts ────────────────────────────────────────────────

ORGS=$(pg "SELECT COUNT(*) FROM organizations")
USERS=$(pg "SELECT COUNT(*) FROM users")
ITEMS=$(pg "SELECT COUNT(*) FROM items")
INVENTORY=$(pg "SELECT COUNT(*) FROM inventory")
LOGS=$(pg "SELECT COUNT(*) FROM activity_logs")
LOCS=$(pg "SELECT COUNT(*) FROM locations")
CATS=$(pg "SELECT COUNT(*) FROM categories")

echo "  Current database row counts:"
hr
printf "  %-22s %s\n" "organizations"  "$ORGS"
printf "  %-22s %s\n" "users"          "$USERS"
printf "  %-22s %s\n" "items"          "$ITEMS"
printf "  %-22s %s\n" "inventory rows" "$INVENTORY"
printf "  %-22s %s\n" "locations"      "$LOCS"
printf "  %-22s %s\n" "categories"     "$CATS"
printf "  %-22s %s\n" "activity_logs"  "$LOGS"
hr
echo ""

# ── 3. Evaluate health ────────────────────────────────────────────────────────

ZERO_DATA=false
PROBLEMS=""

if [ "$ITEMS" = "0" ] || [ -z "$ITEMS" ] || [ "$ITEMS" = "ERR" ]; then
    PROBLEMS="${PROBLEMS}       • items=0 (no products exist)\n"
    ZERO_DATA=true
fi
if [ "$INVENTORY" = "0" ] || [ -z "$INVENTORY" ] || [ "$INVENTORY" = "ERR" ]; then
    PROBLEMS="${PROBLEMS}       • inventory=0 (no stock counts exist)\n"
    ZERO_DATA=true
fi
if [ "$USERS" = "0" ] || [ -z "$USERS" ] || [ "$USERS" = "ERR" ]; then
    PROBLEMS="${PROBLEMS}       • users=0 (no user accounts exist)\n"
    ZERO_DATA=true
fi
if [ "$ORGS" = "0" ] || [ -z "$ORGS" ] || [ "$ORGS" = "ERR" ]; then
    PROBLEMS="${PROBLEMS}       • organizations=0 (no org data)\n"
    ZERO_DATA=true
fi

if [ "$ZERO_DATA" = "false" ]; then
    echo "  ✓  Database looks healthy — key tables have data."
    echo ""
    if [ "$AUTO_MODE" = "true" ]; then exit 0; fi
    exit 0
fi

echo "  ⚠  ZERO-DATA DETECTED in critical tables:"
printf "%b" "$PROBLEMS"
echo ""

if [ "$AUTO_MODE" = "true" ]; then
    echo "  Run 'sh $SCRIPT_DIR/check-database.sh' for interactive restore."
    exit 1
fi

# ── 4. Find available backups and list them ───────────────────────────────────

echo "  Scanning backup locations for restore candidates..."
echo ""

BACKUP_FILES=$(for d in $SEARCH_DIRS; do
    [ -d "$d" ] && find "$d" -maxdepth 1 \( -name "*.sql.gz" -o -name "*.sql" -o -name "*.dump" \) 2>/dev/null
done | sort -u | sort -r || true)

if [ -z "$BACKUP_FILES" ]; then
    echo "  No backups found in search directories: $SEARCH_DIRS"
    echo "  Cannot restore — check your backup directory or search filesystem for backups."
    exit 1
fi

echo "  Available backups (sorted newest first):"
hr
IDX=1
printf '%s\n' "$BACKUP_FILES" | while IFS= read -r SQL_FILE; do
    [ -z "$SQL_FILE" ] && continue
    NAME=$(basename "$SQL_FILE")
    FILE_SIZE=$(du -sh "$SQL_FILE" 2>/dev/null | cut -f1 || echo "?")
    DIR_NAME=$(dirname "$SQL_FILE")

    HUMAN=$(echo "$NAME" | sed -E 's/.*topshelf_([0-9]{4})([0-9]{2})([0-9]{2})_([0-9]{2})([0-9]{2})([0-9]{2})\.sql.*/\1-\2-\3 \4:\5:\6/' 2>/dev/null)
    if [ "$HUMAN" = "$NAME" ] || [ -z "$HUMAN" ]; then
        HUMAN=$(echo "$NAME" | sed -E 's/.*backup-([0-9]{4}-[0-9]{2}-[0-9]{2})-([0-9]+)\.sql.*/\1 \2/' 2>/dev/null)
    fi
    if [ "$HUMAN" = "$NAME" ] || [ -z "$HUMAN" ]; then
        HUMAN="unknown date       "
    fi

    printf "  [%2d] %s  (%5s)  %s  [%s]\n" "$IDX" "$HUMAN" "$FILE_SIZE" "$NAME" "$DIR_NAME"
    IDX=$((IDX + 1))
done
hr
echo ""

# ── 5. Offer restore ─────────────────────────────────────────────────────────

printf "  Options:\n"
printf "    1  — restore the most recent backup ([ 1] above)\n"
printf "    N  — enter a number from the list above\n"
printf "    Q  — quit without restoring\n"
printf "\n  Choice: "
read -r CHOICE

if [ "$CHOICE" = "Q" ] || [ "$CHOICE" = "q" ] || [ -z "$CHOICE" ]; then
    echo "  Exiting. No changes made."
    exit 0
fi

RESTORE_FILE=$(printf '%s\n' "$BACKUP_FILES" | sed -n "${CHOICE}p")
if [ -z "$RESTORE_FILE" ] || [ ! -f "$RESTORE_FILE" ]; then
    echo "  Invalid selection. No changes made."
    exit 1
fi

echo ""
echo "  Selected: $(basename "$RESTORE_FILE")"
echo ""

exec /bin/sh "$SCRIPT_DIR/restore-db.sh" "$RESTORE_FILE"
