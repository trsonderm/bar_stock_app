#!/bin/bash
# restore-db.sh — Restore the topshelf database from a backup file.
# Usage:
#   ./scripts/restore-db.sh                    — list backups and pick interactively
#   ./scripts/restore-db.sh <backup-file.sql.gz> — restore a specific file
#   ./scripts/restore-db.sh --latest           — restore most recent backup

set -e

BACKUP_DIR="${TOPSHELF_BACKUP_DIR:-/opt/topshelf/backups}"

# ── Resolve backup file ───────────────────────────────────────────────────────

if [ "$1" = "--latest" ]; then
    BACKUP_FILE=$(find "$BACKUP_DIR" -name "topshelf_*.sql.gz" 2>/dev/null | sort | tail -1)
    if [ -z "$BACKUP_FILE" ]; then
        echo "ERROR: No backups found in $BACKUP_DIR"
        exit 1
    fi
    echo "Latest backup: $BACKUP_FILE"

elif [ -n "$1" ] && [ "$1" != "--list" ]; then
    # Accept absolute path or bare filename
    if [ -f "$1" ]; then
        BACKUP_FILE="$1"
    elif [ -f "$BACKUP_DIR/$1" ]; then
        BACKUP_FILE="$BACKUP_DIR/$1"
    else
        echo "ERROR: Backup file not found: $1"
        exit 1
    fi

else
    # List available backups
    echo ""
    echo "Available backups in $BACKUP_DIR:"
    echo "──────────────────────────────────────────────────────"
    FILES=$(find "$BACKUP_DIR" -name "topshelf_*.sql.gz" 2>/dev/null | sort -r)
    if [ -z "$FILES" ]; then
        echo "  (no backups found)"
        echo ""
        exit 0
    fi
    i=1
    while IFS= read -r f; do
        SIZE=$(du -sh "$f" | cut -f1)
        NAME=$(basename "$f")
        # Parse timestamp from filename: topshelf_YYYYMMDD_HHMMSS.sql.gz
        TS=$(echo "$NAME" | sed 's/topshelf_\([0-9]*\)_\([0-9]*\)\.sql\.gz/\1 \2/')
        DATE_PART=$(echo "$TS" | awk '{print $1}')
        TIME_PART=$(echo "$TS" | awk '{print $2}')
        HUMAN="${DATE_PART:0:4}-${DATE_PART:4:2}-${DATE_PART:6:2} ${TIME_PART:0:2}:${TIME_PART:2:2}:${TIME_PART:4:2}"
        printf "  [%2d] %s  (%s)  %s\n" "$i" "$HUMAN" "$SIZE" "$NAME"
        i=$((i + 1))
    done <<< "$FILES"
    echo "──────────────────────────────────────────────────────"
    echo ""

    if [ "$1" = "--list" ]; then
        exit 0
    fi

    printf "Enter number to restore (or q to quit): "
    read -r CHOICE
    [ "$CHOICE" = "q" ] || [ -z "$CHOICE" ] && exit 0

    BACKUP_FILE=$(echo "$FILES" | sed -n "${CHOICE}p")
    if [ -z "$BACKUP_FILE" ]; then
        echo "ERROR: Invalid selection."
        exit 1
    fi
fi

# ── Confirm ───────────────────────────────────────────────────────────────────

echo ""
echo "============================================================"
echo "  RESTORE: $(basename "$BACKUP_FILE")"
echo "  Size:    $(du -sh "$BACKUP_FILE" | cut -f1)"
echo ""
echo "  WARNING: This will DROP and recreate the topshelf database."
echo "  ALL current data will be replaced with the backup contents."
echo "============================================================"
echo ""
printf "Type 'yes' to confirm restore: "
read -r CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo "Restore cancelled."
    exit 0
fi

# ── Take a safety backup of current state before restoring ───────────────────

SAFETY_DIR="/opt/topshelf/backups/pre-restore"
mkdir -p "$SAFETY_DIR"
SAFETY_FILE="$SAFETY_DIR/topshelf_pre_restore_$(date +%Y%m%d_%H%M%S).sql.gz"

echo ""
echo "Creating safety backup of current database before restore..."
DB_EXISTS=$(docker compose exec -T db psql -U postgres -d postgres -tAc \
    "SELECT 1 FROM pg_database WHERE datname='topshelf'" 2>/dev/null | tr -d '[:space:]' || echo "")
if [ "$DB_EXISTS" = "1" ]; then
    docker compose exec -T db pg_dump -U postgres topshelf | gzip > "$SAFETY_FILE"
    echo "Safety backup saved: $SAFETY_FILE"
else
    echo "No existing database to back up — skipping safety backup."
fi

# ── Drop and recreate the database ───────────────────────────────────────────

echo ""
echo "Dropping existing topshelf database..."
docker compose exec -T db psql -U postgres -d postgres -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='topshelf' AND pid <> pg_backend_pid();" > /dev/null 2>&1 || true
docker compose exec -T db psql -U postgres -d postgres -c \
    "DROP DATABASE IF EXISTS topshelf;"
docker compose exec -T db psql -U postgres -d postgres -c \
    "CREATE DATABASE topshelf OWNER postgres;"

# ── Restore ───────────────────────────────────────────────────────────────────

echo "Restoring from backup..."
gunzip -c "$BACKUP_FILE" | docker compose exec -T db psql -U postgres -d topshelf

echo ""
echo "============================================================"
echo "  Restore complete!"
echo "  Source: $(basename "$BACKUP_FILE")"
[ -f "$SAFETY_FILE" ] && echo "  Undo:   $SAFETY_FILE (restore this to revert)"
echo "============================================================"
