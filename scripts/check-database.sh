#!/bin/bash
# check-database.sh — Inspect current database health and offer to restore the
# richest backup when key tables are empty or suspiciously low.
#
# Usage:
#   bash scripts/check-database.sh           — interactive health check
#   bash scripts/check-database.sh --auto    — non-interactive: prints status,
#                                              exits 1 if zero-data detected

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
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

# Score = items + inventory + users from .meta.json; fall back to file size if no metadata
declare -a BACKUP_LINES

while IFS= read -r SQL_FILE; do
    [ -z "$SQL_FILE" ] && continue
    NAME=$(basename "$SQL_FILE")
    META_FILE="${SQL_FILE%.sql.gz}.meta.json"
    FILE_SIZE=$(du -sh "$SQL_FILE" 2>/dev/null | cut -f1 || echo "?")

    SCORE=0
    META_SUMMARY=""

    if [ -f "$META_FILE" ]; then
        # Extract row counts from metadata using Python (available on all Linux distros)
        READ_COUNTS=$(python3 - "$META_FILE" <<'PYEOF'
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
    print(f"0|unknown")
PYEOF
)
        SCORE=$(echo "$READ_COUNTS" | cut -d'|' -f1)
        META_SUMMARY=$(echo "$READ_COUNTS" | cut -d'|' -f2)
    else
        # No metadata — use compressed file size in KB as a proxy score
        KB=$(du -k "$SQL_FILE" 2>/dev/null | cut -f1 || echo "0")
        SCORE=$KB
        META_SUMMARY="no metadata — ${FILE_SIZE} compressed"
    fi

    TS=$(echo "$NAME" | sed 's/topshelf_\([0-9]*\)_\([0-9]*\)\.sql\.gz/\1 \2/')
    D=$(echo "$TS" | awk '{print $1}')
    T=$(echo "$TS" | awk '{print $2}')
    HUMAN="${D:0:4}-${D:4:2}-${D:6:2} ${T:0:2}:${T:2:2}"

    BACKUP_LINES+=("$SCORE|$SQL_FILE|$HUMAN|$FILE_SIZE|$META_SUMMARY")

    if [ "$SCORE" -gt "$BEST_SCORE" ] 2>/dev/null; then
        BEST_SCORE=$SCORE
        BEST_FILE=$SQL_FILE
        BEST_LABEL="$HUMAN  ($META_SUMMARY)  size=$FILE_SIZE"
    fi

done < <(find "$BACKUP_DIR" -maxdepth 1 -name "topshelf_*.sql.gz" 2>/dev/null | sort -r)

if [ ${#BACKUP_LINES[@]} -eq 0 ]; then
    echo "  No backups found in $BACKUP_DIR."
    echo "  Cannot restore — check your backup directory or create a manual backup."
    exit 1
fi

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
    # Numeric selection
    RESTORE_FILE="${ORDERED_FILES[$((CHOICE - 1))]}"
    if [ -z "$RESTORE_FILE" ] || [ ! -f "$RESTORE_FILE" ]; then
        echo "  Invalid selection. No changes made."
        exit 1
    fi
fi

echo ""
echo "  Selected: $(basename "$RESTORE_FILE")"
echo ""

# Delegate to restore-db.sh which handles the safety backup + confirm + restore
exec bash "$SCRIPT_DIR/restore-db.sh" "$RESTORE_FILE"
