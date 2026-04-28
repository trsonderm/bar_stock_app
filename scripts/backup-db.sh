#!/bin/bash
# backup-db.sh — Create a timestamped pg_dump of the topshelf database.
# Usage: ./scripts/backup-db.sh [backup-dir]
# Default backup dir: /opt/topshelf/backups

set -e

BACKUP_DIR="${1:-/opt/topshelf/backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/topshelf_$TIMESTAMP.sql.gz"
KEEP_DAYS=60   # retain backups for 60 days

mkdir -p "$BACKUP_DIR"

echo "Backing up topshelf database to $BACKUP_FILE ..."

# Check if db container is running
if ! docker compose ps db 2>/dev/null | grep -q "running\|Up"; then
    echo "WARNING: db container is not running. Skipping backup."
    exit 0
fi

# Check if topshelf database exists
DB_EXISTS=$(docker compose exec -T db psql -U postgres -d postgres -tAc \
    "SELECT 1 FROM pg_database WHERE datname='topshelf'" 2>/dev/null | tr -d '[:space:]' || echo "")
if [ "$DB_EXISTS" != "1" ]; then
    echo "WARNING: topshelf database does not exist yet. Skipping backup."
    exit 0
fi

# Dump and compress
docker compose exec -T db pg_dump -U postgres topshelf | gzip > "$BACKUP_FILE"

SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
echo "Backup complete: $BACKUP_FILE ($SIZE)"

# Remove backups older than KEEP_DAYS
REMOVED=$(find "$BACKUP_DIR" -name "topshelf_*.sql.gz" -mtime +$KEEP_DAYS -print -delete 2>/dev/null | wc -l | tr -d '[:space:]')
[ "$REMOVED" -gt 0 ] && echo "Removed $REMOVED backup(s) older than $KEEP_DAYS days."

# Show current backup inventory
TOTAL=$(find "$BACKUP_DIR" -name "topshelf_*.sql.gz" 2>/dev/null | wc -l | tr -d '[:space:]')
OLDEST=$(find "$BACKUP_DIR" -name "topshelf_*.sql.gz" 2>/dev/null | sort | head -1 | xargs -I{} basename {} 2>/dev/null || echo "none")
echo "Backup inventory: $TOTAL file(s), oldest: $OLDEST"
