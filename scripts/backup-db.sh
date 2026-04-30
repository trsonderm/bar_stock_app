#!/bin/bash
# backup-db.sh — Create a timestamped pg_dump of the topshelf database.
# Usage: ./scripts/backup-db.sh [backup-dir] [triggered-by]
# Default backup dir: /opt/topshelf/backups

set -e

BACKUP_DIR="${1:-/opt/topshelf/backups}"
TRIGGERED_BY="${2:-manual}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/topshelf_$TIMESTAMP.sql.gz"
META_FILE="$BACKUP_DIR/topshelf_$TIMESTAMP.meta.json"
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

# Capture table stats BEFORE dump (so metadata reflects what is being backed up)
echo "Capturing table statistics..."
TABLE_STATS=$(docker compose exec -T db psql -U postgres -d topshelf -tAc \
    "SELECT json_agg(row_to_json(t) ORDER BY t.row_count DESC) FROM (SELECT relname AS table_name, n_live_tup AS row_count, pg_size_pretty(pg_total_relation_size(quote_ident(relname))) AS size FROM pg_stat_user_tables WHERE schemaname='public') t" \
    2>/dev/null | tr -d '[:space:]' || echo "null")
DB_SIZE=$(docker compose exec -T db psql -U postgres -d topshelf -tAc \
    "SELECT pg_size_pretty(pg_database_size('topshelf'))" 2>/dev/null | tr -d '[:space:]' || echo "unknown")
TABLE_COUNT=$(docker compose exec -T db psql -U postgres -d topshelf -tAc \
    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public'" 2>/dev/null | tr -d '[:space:]' || echo "0")
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
GIT_MSG=$(git log -1 --pretty=format:"%s" 2>/dev/null || echo "")

# Dump and compress
docker compose exec -T db pg_dump -U postgres topshelf | gzip > "$BACKUP_FILE"

FILE_SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
echo "Backup complete: $BACKUP_FILE ($FILE_SIZE)"

# Write metadata JSON alongside backup
cat > "$META_FILE" <<META
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "backup_file": "$(basename "$BACKUP_FILE")",
  "file_size": "$FILE_SIZE",
  "db_size": "$DB_SIZE",
  "table_count": $TABLE_COUNT,
  "triggered_by": "$TRIGGERED_BY",
  "git_commit": "$GIT_COMMIT",
  "git_message": "$GIT_MSG",
  "tables": $TABLE_STATS
}
META
echo "Metadata saved: $META_FILE"

# Remove backups older than KEEP_DAYS (both .sql.gz and .meta.json)
REMOVED=$(find "$BACKUP_DIR" -maxdepth 1 \( -name "topshelf_*.sql.gz" -o -name "topshelf_*.meta.json" \) -mtime +$KEEP_DAYS -print -delete 2>/dev/null | wc -l | tr -d '[:space:]')
[ "$REMOVED" -gt 0 ] && echo "Removed $REMOVED old backup file(s) older than $KEEP_DAYS days."

# Show current backup inventory
TOTAL=$(find "$BACKUP_DIR" -maxdepth 1 -name "topshelf_*.sql.gz" 2>/dev/null | wc -l | tr -d '[:space:]')
OLDEST=$(find "$BACKUP_DIR" -maxdepth 1 -name "topshelf_*.sql.gz" 2>/dev/null | sort | head -1 | xargs -I{} basename {} 2>/dev/null || echo "none")
echo "Backup inventory: $TOTAL file(s), oldest: $OLDEST"
