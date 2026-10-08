#!/bin/bash
# check-database.sh — Health check & recovery tool for the TopShelf database.
#
# Usage:
#   bash scripts/check-database.sh           — interactive health check
#   bash scripts/check-database.sh --auto    — non-interactive: prints status,
#                                              exits 1 if zero-data detected

set -e

if [ -z "$BASH_VERSION" ]; then
    exec bash "$0" "$@"
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

BACKUP_DIR="${TOPSHELF_BACKUP_DIR:-/opt/topshelf/backups}"
AUTO_MODE=false
[ "$1" = "--auto" ] && AUTO_MODE=true

# ── Helpers ───────────────────────────────────────────────────────────────────

pg() {
    docker compose exec -T db psql -U postgres -d topshelf -tAc "$1" 2>/dev/null \
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

if ! docker compose ps db 2>/dev/null | grep -qE "running|Up"; then
    echo "ERROR: The db container is not running."
    echo "  Start it with:  docker compose up -d db"
    echo "  Then re-run:    bash $SCRIPT_DIR/check-database.sh"
    exit 1
fi

DB_EXISTS=$(docker compose exec -T db psql -U postgres -d postgres -tAc \
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
PROBLEMS=()

[ "$ITEMS" = "0" ]     && PROBLEMS+=("items=0 (no products exist)")       && ZERO_DATA=true
[ "$INVENTORY" = "0" ] && PROBLEMS+=("inventory=0 (no stock counts exist)") && ZERO_DATA=true
[ "$USERS" = "0" ]     && PROBLEMS+=("users=0 (no user accounts exist)")  && ZERO_DATA=true
[ "$ORGS" = "0" ]      && PROBLEMS+=("organizations=0 (no org data)")     && ZERO_DATA=true

if [ "$ZERO_DATA" = "false" ]; then
    echo "  ✓  Database looks healthy — key tables have data."
    echo ""
    if [ "$AUTO_MODE" = "true" ]; then exit 0; fi
    exit 0
fi

echo "  ⚠  ZERO-DATA DETECTED in critical tables:"
for P in "${PROBLEMS[@]}"; do
    echo "       • $P"
done
echo ""

if [ "$AUTO_MODE" = "true" ]; then
    echo "  Run 'bash $SCRIPT_DIR/check-database.sh' for interactive restore."
    exit 1
fi

# ── 4. Find available backups and score them by data richness ─────────────────

echo "  Scanning backups in $BACKUP_DIR for the best restore candidate..."
echo ""

BEST_FILE=""
BEST_SCORE=0
BEST_LABEL=""

declare -a BACKUP_LINES

BACKUP_FILES=$(find "$BACKUP_DIR" -maxdepth 1 -name "topshelf_*.sql.gz" 2>/dev/null | sort -r || true)

if [ -z "$BACKUP_FILES" ]; then
    echo "  No backups found in $BACKUP_DIR."
    echo "  Cannot restore — check your backup directory or search filesystem for backups."
    exit 1
fi

while IFS= read -r SQL_FILE; do
    [ -z "$SQL_FILE" ] && continue
    NAME=$(basename "$SQL_FILE")
    META_FILE="${SQL_FILE%.sql.gz}.meta.json"
    FILE_SIZE=$(du -sh "$SQL_FILE" 2>/dev/null | cut -f1 || echo "?")

    SCORE=0
    META_SUMMARY=""

    if [ -f "$META_FILE" ]; then
        READ_COUNTS=$(python3 - "$META_FILE" <<'PYEOF' 2>/dev/null || echo "0|unknown"
import json, sys
try:
    data = json.load(open(sys.argv[1]))
    tables = {t["table_name"]: int(t["row_count"]) for t in (data.get("tables") or []) if t.get("table_name")}
    items     = tables.get("items", 0)
    inventory = tables.get("inventory", 0)
    users     = tables.get("users", 0)
    orgs      = tables.get("organizations", 0)
    score     = items + inventory + users + orgs
    print(f"{score}|items={items} inventory={inventory} users={users} orgs={orgs}")
except Exception as e:
    print("0|unknown")
PYEOF
)
        SCORE=$(echo "$READ_COUNTS" | cut -d'|' -f1)
        META_SUMMARY=$(echo "$READ_COUNTS" | cut -d'|' -f2)
    else
        KB=$(du -k "$SQL_FILE" 2>/dev/null | cut -f1 || echo "0")
        SCORE=$KB
        META_SUMMARY="no metadata — ${FILE_SIZE} compressed"
    fi

    HUMAN=$(echo "$NAME" | sed -E 's/.*topshelf_([0-9]{4})([0-9]{2})([0-9]{2})_([0-9]{2})([0-9]{2})([0-9]{2})\.sql\.gz.*/\1-\2-\3 \4:\5:\6/' 2>/dev/null)
    if [ "$HUMAN" = "$NAME" ] || [ -z "$HUMAN" ]; then
        HUMAN="unknown date"
    fi

    BACKUP_LINES+=("$SCORE|$SQL_FILE|$HUMAN|$FILE_SIZE|$META_SUMMARY")

    if [ "$SCORE" -gt "$BEST_SCORE" ] 2>/dev/null; then
        BEST_SCORE=$SCORE
        BEST_FILE=$SQL_FILE
        BEST_LABEL="$HUMAN  ($META_SUMMARY)  size=$FILE_SIZE"
    fi

done <<EOF
$BACKUP_FILES
EOF

# ── 5. Print scored backup list ───────────────────────────────────────────────

echo "  Available backups (sorted newest first, ★ = most data):"
hr
IDX=1
declare -a ORDERED_FILES

for LINE in "${BACKUP_LINES[@]}"; do
    SC=$(echo "$LINE" | cut -d'|' -f1)
    FL=$(echo "$LINE" | cut -d'|' -f2)
    HU=$(echo "$LINE" | cut -d'|' -f3)
    SZ=$(echo "$LINE" | cut -d'|' -f4)
    SM=$(echo "$LINE" | cut -d'|' -f5)
    STAR="  "
    [ "$FL" = "$BEST_FILE" ] && STAR="★ "
    printf "  [%2d] %s%s  (%s)  %s\n" "$IDX" "$STAR" "$HU" "$SZ" "$SM"
    ORDERED_FILES+=("$FL")
    IDX=$((IDX + 1))
done
hr
echo ""

if [ -n "$BEST_FILE" ]; then
    echo "  ★  Recommended (most data): $BEST_LABEL"
    echo ""
fi

# ── 6. Offer restore ─────────────────────────────────────────────────────────

printf "  Options:\n"
printf "    R  — restore the ★ recommended backup\n"
printf "    N  — enter a number from the list above\n"
printf "    Q  — quit without restoring\n"
printf "\n  Choice: "
read -r CHOICE

if [ "$CHOICE" = "Q" ] || [ "$CHOICE" = "q" ] || [ -z "$CHOICE" ]; then
    echo "  Exiting. No changes made."
    exit 0
fi

if [ "$CHOICE" = "R" ] || [ "$CHOICE" = "r" ]; then
    RESTORE_FILE="$BEST_FILE"
else
    RESTORE_FILE="${ORDERED_FILES[$((CHOICE - 1))]}"
    if [ -z "$RESTORE_FILE" ] || [ ! -f "$RESTORE_FILE" ]; then
        echo "  Invalid selection. No changes made."
        exit 1
    fi
fi

echo ""
echo "  Selected: $(basename "$RESTORE_FILE")"
echo ""

exec bash "$SCRIPT_DIR/restore-db.sh" "$RESTORE_FILE"
