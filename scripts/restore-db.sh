#!/bin/bash
# restore-db.sh — Restore the topshelf database from a backup file.
# Usage:
#   ./scripts/restore-db.sh                        — list backups and pick interactively
#   ./scripts/restore-db.sh <backup-file>          — restore a specific file (.sql or .sql.gz)
#   ./scripts/restore-db.sh --latest               — restore most recent backup
#   ./scripts/restore-db.sh --list                 — list available backups and exit
#   ./scripts/restore-db.sh -y <backup-file>       — restore without confirmation prompt

set -e

# Re-execute under bash if invoked via `sh` (avoids dash/POSIX syntax errors)
if [ -z "$BASH_VERSION" ]; then
    exec bash "$0" "$@"
fi

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

# ── Resolve backup search directories ─────────────────────────────────────────
SEARCH_DIRS=()
[ -n "$TOPSHELF_BACKUP_DIR" ] && SEARCH_DIRS+=("$TOPSHELF_BACKUP_DIR")
SEARCH_DIRS+=("/opt/topshelf/backups" "$SCRIPT_DIR/../backups" "./backups")

# Pick primary BACKUP_DIR
BACKUP_DIR=""
for d in "${SEARCH_DIRS[@]}"; do
    if [ -d "$d" ]; then
        BACKUP_DIR="$d"
        break
    fi
done
if [ -z "$BACKUP_DIR" ]; then
    BACKUP_DIR="${TOPSHELF_BACKUP_DIR:-/opt/topshelf/backups}"
fi

# ── Parse arguments ───────────────────────────────────────────────────────────
AUTO_CONFIRM=false
TARGET_ARG=""

for arg in "$@"; do
    case "$arg" in
        -y|--yes|--force)
            AUTO_CONFIRM=true
            ;;
        --latest|--list)
            TARGET_ARG="$arg"
            ;;
        -*)
            echo "Unknown option: $arg"
            exit 1
            ;;
        *)
            if [ -z "$TARGET_ARG" ]; then
                TARGET_ARG="$arg"
            fi
            ;;
    esac
done

# ── Helper to find all backup files across known directories ──────────────────
find_all_backups() {
    for d in "${SEARCH_DIRS[@]}"; do
        if [ -d "$d" ]; then
            find "$d" -maxdepth 1 \( -name "*.sql.gz" -o -name "*.sql" -o -name "*.dump" \) 2>/dev/null
        fi
    done | sort -u | sort -r
}

# ── Resolve backup file ───────────────────────────────────────────────────────
BACKUP_FILE=""

if [ "$TARGET_ARG" = "--latest" ]; then
    BACKUP_FILE=$(find_all_backups | head -1)
    if [ -z "$BACKUP_FILE" ]; then
        echo "ERROR: No backups found in search directories: ${SEARCH_DIRS[*]}"
        exit 1
    fi
    echo "Latest backup selected: $BACKUP_FILE"

elif [ -n "$TARGET_ARG" ] && [ "$TARGET_ARG" != "--list" ]; then
    # Direct path or filename
    if [ -f "$TARGET_ARG" ]; then
        BACKUP_FILE="$TARGET_ARG"
    else
        # Search candidate directories
        for d in "${SEARCH_DIRS[@]}"; do
            if [ -f "$d/$TARGET_ARG" ]; then
                BACKUP_FILE="$d/$TARGET_ARG"
                break
            fi
        done
    fi

    if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
        echo "ERROR: Backup file not found: $TARGET_ARG"
        echo "Searched locations: ${SEARCH_DIRS[*]}"
        exit 1
    fi

else
    # Interactive selection or --list
    echo ""
    echo "Available backups:"
    echo "────────────────────────────────────────────────────────────────────────"
    ALL_FILES=$(find_all_backups)
    if [ -z "$ALL_FILES" ]; then
        echo "  (no backups found in ${SEARCH_DIRS[*]})"
        echo ""
        exit 0
    fi

    i=1
    declare -a FILE_ARRAY
    while IFS= read -r f; do
        [ -z "$f" ] && continue
        SIZE=$(du -sh "$f" 2>/dev/null | cut -f1 || echo "?")
        NAME=$(basename "$f")
        DIR_NAME=$(dirname "$f")
        
        HUMAN=$(echo "$NAME" | sed -E 's/.*topshelf_([0-9]{4})([0-9]{2})([0-9]{2})_([0-9]{2})([0-9]{2})([0-9]{2})\.sql.*/\1-\2-\3 \4:\5:\6/' 2>/dev/null)
        if [ "$HUMAN" = "$NAME" ] || [ -z "$HUMAN" ]; then
            HUMAN=$(echo "$NAME" | sed -E 's/.*backup-([0-9]{4}-[0-9]{2}-[0-9]{2})-([0-9]+)\.sql.*/\1 \2/' 2>/dev/null)
        fi
        if [ "$HUMAN" = "$NAME" ] || [ -z "$HUMAN" ]; then
            HUMAN="unknown date       "
        fi

        printf "  [%2d] %s  (%5s)  %s  [%s]\n" "$i" "$HUMAN" "$SIZE" "$NAME" "$DIR_NAME"
        FILE_ARRAY+=("$f")
        i=$((i + 1))
    done <<< "$ALL_FILES"
    echo "────────────────────────────────────────────────────────────────────────"
    echo ""

    if [ "$TARGET_ARG" = "--list" ]; then
        exit 0
    fi

    printf "Enter number to restore (or 'q' to quit): "
    read -r CHOICE
    if [ "$CHOICE" = "q" ] || [ "$CHOICE" = "Q" ] || [ -z "$CHOICE" ]; then
        echo "Restore cancelled."
        exit 0
    fi

    INDEX=$((CHOICE - 1))
    BACKUP_FILE="${FILE_ARRAY[$INDEX]}"
    if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
        echo "ERROR: Invalid selection."
        exit 1
    fi
fi

# ── Confirm ───────────────────────────────────────────────────────────────────
echo ""
echo "============================================================"
echo "  RESTORE TARGET: $(basename "$BACKUP_FILE")"
echo "  Path:           $BACKUP_FILE"
echo "  Size:           $(du -sh "$BACKUP_FILE" 2>/dev/null | cut -f1)"
echo ""
echo "  WARNING: This will replace the topshelf database."
echo "  Existing data will be backed up to pre-restore directory."
echo "============================================================"
echo ""

if [ "$AUTO_CONFIRM" != "true" ]; then
    printf "Type 'yes' to confirm restore: "
    read -r CONFIRM
    if [ "$CONFIRM" != "yes" ]; then
        echo "Restore cancelled."
        exit 0
    fi
fi

# ── Ensure db container is running ───────────────────────────────────────────
if ! $DC ps db 2>/dev/null | grep -qE "running|Up"; then
    echo "Starting db container..."
    $DC up -d db
    echo "Waiting for PostgreSQL to be ready..."
    until $DC exec -T db pg_isready -U postgres -q 2>/dev/null; do
        sleep 2
    done
fi

# ── Track app container status and set trap for cleanup ───────────────────────
APP_WAS_RUNNING=false
if $DC ps app 2>/dev/null | grep -qE "running|Up"; then
    APP_WAS_RUNNING=true
fi

cleanup() {
    if [ "$APP_WAS_RUNNING" = "true" ]; then
        echo "Restarting app container..."
        $DC start app >/dev/null 2>&1 || true
    fi
}
trap cleanup EXIT

# ── Stop app container temporarily to avoid database connection locks ─────────
if [ "$APP_WAS_RUNNING" = "true" ]; then
    echo "Stopping app container temporarily to close open connections..."
    $DC stop app >/dev/null 2>&1 || true
fi

# ── Safety backup before restore ──────────────────────────────────────────────
SAFETY_DIR="$BACKUP_DIR/pre-restore"
mkdir -p "$SAFETY_DIR" 2>/dev/null || {
    SAFETY_DIR="$SCRIPT_DIR/../backups/pre-restore"
    mkdir -p "$SAFETY_DIR" 2>/dev/null || SAFETY_DIR="/tmp/topshelf_pre_restore"
    mkdir -p "$SAFETY_DIR" 2>/dev/null || true
}

SAFETY_FILE="$SAFETY_DIR/topshelf_pre_restore_$(date +%Y%m%d_%H%M%S).sql.gz"
echo "Creating safety backup of current database..."
DB_EXISTS=$($DC exec -T db psql -U postgres -d postgres -tAc \
    "SELECT 1 FROM pg_database WHERE datname='topshelf'" 2>/dev/null | tr -d '[:space:]' || echo "")

if [ "$DB_EXISTS" = "1" ]; then
    $DC exec -T db pg_dump -U postgres topshelf 2>/dev/null | gzip > "$SAFETY_FILE" || true
    if [ -s "$SAFETY_FILE" ]; then
        echo "Safety backup saved: $SAFETY_FILE"
    else
        rm -f "$SAFETY_FILE" 2>/dev/null || true
    fi
else
    echo "No existing database to back up — skipping safety backup."
fi

# ── Drop and recreate topshelf database cleanly ───────────────────────────────
echo "Resetting topshelf database..."
# Block any new incoming connections
$DC exec -T db psql -U postgres -d postgres -c \
    "ALTER DATABASE topshelf WITH ALLOW_CONNECTIONS false;" >/dev/null 2>&1 || true

# Terminate all active backend connections
$DC exec -T db psql -U postgres -d postgres -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='topshelf' AND pid <> pg_backend_pid();" >/dev/null 2>&1 || true

# Drop and recreate
$DC exec -T db psql -U postgres -d postgres -c "DROP DATABASE IF EXISTS topshelf;"
$DC exec -T db psql -U postgres -d postgres -c "CREATE DATABASE topshelf OWNER postgres;"

# ── Detect file format and perform restore ─────────────────────────────────────
echo "Restoring from $BACKUP_FILE ..."

IS_GZIP=false
if gzip -t "$BACKUP_FILE" 2>/dev/null; then
    IS_GZIP=true
fi

# Check magic bytes for pg_dump custom format ("PGDMP")
MAGIC=""
if [ "$IS_GZIP" = "true" ]; then
    MAGIC=$(gzip -dc "$BACKUP_FILE" 2>/dev/null | head -c 5 || echo "")
else
    MAGIC=$(head -c 5 "$BACKUP_FILE" 2>/dev/null || echo "")
fi

if [ "$MAGIC" = "PGDMP" ]; then
    echo "Format detected: PostgreSQL Custom Archive (pg_restore)"
    if [ "$IS_GZIP" = "true" ]; then
        gzip -dc "$BACKUP_FILE" | $DC exec -T db pg_restore -U postgres -d topshelf --clean --if-exists --no-owner --no-privileges || true
    else
        cat "$BACKUP_FILE" | $DC exec -T db pg_restore -U postgres -d topshelf --clean --if-exists --no-owner --no-privileges || true
    fi
else
    echo "Format detected: Plain SQL text"
    if [ "$IS_GZIP" = "true" ]; then
        gzip -dc "$BACKUP_FILE" | $DC exec -T db psql -U postgres -d topshelf -v ON_ERROR_STOP=0 >/dev/null 2>&1 || true
    else
        cat "$BACKUP_FILE" | $DC exec -T db psql -U postgres -d topshelf -v ON_ERROR_STOP=0 >/dev/null 2>&1 || true
    fi
fi

# ── Verification ──────────────────────────────────────────────────────────────
RESTORED_ORGS=$($DC exec -T db psql -U postgres -d topshelf -tAc "SELECT COUNT(*) FROM organizations" 2>/dev/null | tr -d '[:space:]' || echo "0")
RESTORED_USERS=$($DC exec -T db psql -U postgres -d topshelf -tAc "SELECT COUNT(*) FROM users" 2>/dev/null | tr -d '[:space:]' || echo "0")
RESTORED_ITEMS=$($DC exec -T db psql -U postgres -d topshelf -tAc "SELECT COUNT(*) FROM items" 2>/dev/null | tr -d '[:space:]' || echo "0")
RESTORED_INV=$($DC exec -T db psql -U postgres -d topshelf -tAc "SELECT COUNT(*) FROM inventory" 2>/dev/null | tr -d '[:space:]' || echo "0")

echo ""
echo "Restore verification:"
echo "  organizations: $RESTORED_ORGS"
echo "  users:         $RESTORED_USERS"
echo "  items:         $RESTORED_ITEMS"
echo "  inventory:     $RESTORED_INV"

if [ "${RESTORED_ORGS:-0}" = "0" ] && [ "${RESTORED_USERS:-0}" = "0" ] && [ "${RESTORED_ITEMS:-0}" = "0" ]; then
    echo "WARNING: Key tables are currently empty. If this was unintended, revert with safety backup:"
    [ -f "$SAFETY_FILE" ] && echo "  Undo: $SAFETY_FILE"
fi

echo ""
echo "============================================================"
echo "  Database restore completed successfully!"
echo "  Source: $(basename "$BACKUP_FILE")"
[ -f "$SAFETY_FILE" ] && echo "  Safety backup: $SAFETY_FILE"
echo "============================================================"
