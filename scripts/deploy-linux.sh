#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKUP_DIR="/opt/topshelf/backups"
MANIFEST_DIR="$BACKUP_DIR/manifests"

echo "Starting Bar Stock App Deployment (Linux/Docker)..."

# Ensure persistent backup directory exists and is writable by container user (uid 1001)
mkdir -p "$BACKUP_DIR" "$MANIFEST_DIR"
chmod 777 "$BACKUP_DIR" "$MANIFEST_DIR"

# Capture pre-pull git state (for rollback manifest)
PRE_DEPLOY_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
PRE_DEPLOY_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
PRE_DEPLOY_MSG=$(git log -1 --pretty=format:"%s" 2>/dev/null || echo "unknown")

# 1. Pull Latest Code
echo "Pulling latest changes from git..."
git pull

# 2. Backup database BEFORE taking containers down
echo ""
echo "=== Pre-deploy database backup ==="
DEPLOY_TIMESTAMP=$(date +%Y%m%d_%H%M%S)
if ! bash "$SCRIPT_DIR/backup-db.sh" "$BACKUP_DIR" "pre-deploy"; then
    echo "ERROR: Pre-deploy backup failed. Aborting deployment to protect existing data."
    echo "       Fix the backup issue before deploying, or restore from an existing backup."
    exit 1
fi
# Resolve the actual backup file created (backup-db.sh uses its own timestamp; grab most recent)
ACTUAL_BACKUP=$(find "$BACKUP_DIR" -maxdepth 1 -name "topshelf_*.sql.gz" 2>/dev/null | sort | tail -1 || echo "")
if [ -z "$ACTUAL_BACKUP" ]; then
    echo "ERROR: Backup script succeeded but no backup file found in $BACKUP_DIR. Aborting."
    exit 1
fi
echo ""

# Send backup-complete notification (runs in background so it doesn't block deploy)
if [ -n "$ACTUAL_BACKUP" ]; then
    BACKUP_SIZE=$(du -sh "$ACTUAL_BACKUP" 2>/dev/null | cut -f1 || echo "unknown")
    docker compose exec -T app node scripts/notify-deploy.js backup_complete \
        "{\"backup_file\":\"$(basename "$ACTUAL_BACKUP")\",\"file_size\":\"$BACKUP_SIZE\",\"git_commit\":\"$POST_DEPLOY_COMMIT\",\"commit_message\":\"$POST_DEPLOY_MSG\"}" \
        2>/dev/null || true
fi
echo ""

# Write deploy manifest (records what to restore when rolling back THIS deploy)
MANIFEST_FILE="$MANIFEST_DIR/deploy_${DEPLOY_TIMESTAMP}.json"
POST_DEPLOY_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
POST_DEPLOY_MSG=$(git log -1 --pretty=format:"%s" 2>/dev/null || echo "unknown")
cat > "$MANIFEST_FILE" <<MANIFEST
{
  "deploy_timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "pre_deploy_commit": "$PRE_DEPLOY_COMMIT",
  "pre_deploy_branch": "$PRE_DEPLOY_BRANCH",
  "pre_deploy_message": "$PRE_DEPLOY_MSG",
  "post_deploy_commit": "$POST_DEPLOY_COMMIT",
  "post_deploy_message": "$POST_DEPLOY_MSG",
  "backup_file": "$(basename "$ACTUAL_BACKUP")"
}
MANIFEST
echo "Deploy manifest saved: $MANIFEST_FILE"
echo ""

# Show current database snapshot and require confirmation before any destructive step
echo "=================================================="
echo "  CURRENT DATABASE SNAPSHOT (before deploy)"
echo "=================================================="
SNAP_ORGS=$(docker compose exec -T db psql -U postgres -d topshelf -tAc "SELECT COUNT(*) FROM organizations" 2>/dev/null | tr -d '[:space:]' || echo "?")
SNAP_USERS=$(docker compose exec -T db psql -U postgres -d topshelf -tAc "SELECT COUNT(*) FROM users" 2>/dev/null | tr -d '[:space:]' || echo "?")
SNAP_ITEMS=$(docker compose exec -T db psql -U postgres -d topshelf -tAc "SELECT COUNT(*) FROM items" 2>/dev/null | tr -d '[:space:]' || echo "?")
SNAP_INVENTORY=$(docker compose exec -T db psql -U postgres -d topshelf -tAc "SELECT COUNT(*) FROM inventory" 2>/dev/null | tr -d '[:space:]' || echo "?")
SNAP_LOGS=$(docker compose exec -T db psql -U postgres -d topshelf -tAc "SELECT COUNT(*) FROM activity_logs" 2>/dev/null | tr -d '[:space:]' || echo "?")
echo "  Organizations : $SNAP_ORGS"
echo "  Users         : $SNAP_USERS"
echo "  Items         : $SNAP_ITEMS"
echo "  Inventory rows: $SNAP_INVENTORY"
echo "  Activity logs : $SNAP_LOGS"
echo "  Backup saved  : $(basename "$ACTUAL_BACKUP")"
echo "=================================================="
echo ""
printf "  Proceed with deploy? (yes/no): "
read -r DEPLOY_CONFIRM
if [ "$DEPLOY_CONFIRM" != "yes" ]; then
    echo "Deploy cancelled. Database and containers are unchanged."
    exit 0
fi
echo ""

# 3. Cleanup Existing Sessions / Ports
echo "Cleaning up existing sessions..."
for PORT in 6050 3000; do
    PID=$(lsof -ti:$PORT || true)
    if [ ! -z "$PID" ]; then
        echo "Killing process $PID on port $PORT"
        kill -9 $PID || true
    fi
done

# 4. Rebuild and Start Containers
echo "Rebuilding and starting containers..."
docker compose down --remove-orphans
docker compose up -d --build

# 5. Wait for PostgreSQL to accept connections (using default postgres db)
echo "Waiting for PostgreSQL to be ready..."
RETRIES=60
until docker compose exec -T db pg_isready -U postgres -q 2>/dev/null; do
    RETRIES=$((RETRIES - 1))
    if [ $RETRIES -le 0 ]; then
        echo "ERROR: PostgreSQL did not become ready in time. Aborting migration."
        exit 1
    fi
    echo "  Waiting for PostgreSQL... ($RETRIES retries left)"
    sleep 2
done
echo "PostgreSQL is accepting connections."

# 6. Ensure the topshelf database exists (safe on fresh and existing volumes)
echo "Ensuring database 'topshelf' exists..."
docker compose exec -T db psql -U postgres -d postgres -c \
    "SELECT 1 FROM pg_database WHERE datname='topshelf'" \
    | grep -q 1 || \
    docker compose exec -T db psql -U postgres -d postgres -c \
    "CREATE DATABASE topshelf OWNER postgres;" || true
echo "Database ready."

# 7. Apply base schema (idempotent — CREATE TABLE IF NOT EXISTS throughout)
# NEVER drops existing tables or columns — all statements use IF NOT EXISTS
echo "Applying base schema (safe — CREATE TABLE IF NOT EXISTS only)..."
SCHEMA_OUT=$(docker compose exec -T db psql -U postgres -d topshelf < "$SCRIPT_DIR/schema.sql" 2>&1 || true)
echo "$SCHEMA_OUT"
echo "Base schema step complete."

# 8. Run incremental migrations (idempotent ALTER TABLE ADD COLUMN IF NOT EXISTS / DO $$ EXCEPTION)
# Each ALTER TABLE wraps in DO $$ EXCEPTION WHEN duplicate_column so existing data is NEVER touched.
# New columns are added with DEFAULT values so existing rows get 0/null automatically.

# Capture row counts BEFORE migration to verify nothing is lost
echo "Capturing pre-migration row counts..."
PRE_ORGS=$(docker compose exec -T db psql -U postgres -d topshelf -tAc "SELECT COUNT(*) FROM organizations" 2>/dev/null | tr -d '[:space:]' || echo "0")
PRE_USERS=$(docker compose exec -T db psql -U postgres -d topshelf -tAc "SELECT COUNT(*) FROM users" 2>/dev/null | tr -d '[:space:]' || echo "0")
PRE_ITEMS=$(docker compose exec -T db psql -U postgres -d topshelf -tAc "SELECT COUNT(*) FROM items" 2>/dev/null | tr -d '[:space:]' || echo "0")
PRE_INVENTORY=$(docker compose exec -T db psql -U postgres -d topshelf -tAc "SELECT COUNT(*) FROM inventory" 2>/dev/null | tr -d '[:space:]' || echo "0")
PRE_CATEGORIES=$(docker compose exec -T db psql -U postgres -d topshelf -tAc "SELECT COUNT(*) FROM categories" 2>/dev/null | tr -d '[:space:]' || echo "0")
echo "  Pre-migration: orgs=$PRE_ORGS users=$PRE_USERS items=$PRE_ITEMS inventory=$PRE_INVENTORY categories=$PRE_CATEGORIES"

echo "Running schema migrations (safe — ALTER TABLE with EXCEPTION guards, wrapped in BEGIN/COMMIT)..."
MIGRATE_OUT=$(docker compose exec -T db psql -U postgres -d topshelf < "$SCRIPT_DIR/migrate.sql" 2>&1 || true)
echo "$MIGRATE_OUT"

# Capture row counts AFTER migration
POST_ORGS=$(docker compose exec -T db psql -U postgres -d topshelf -tAc "SELECT COUNT(*) FROM organizations" 2>/dev/null | tr -d '[:space:]' || echo "0")
POST_USERS=$(docker compose exec -T db psql -U postgres -d topshelf -tAc "SELECT COUNT(*) FROM users" 2>/dev/null | tr -d '[:space:]' || echo "0")
POST_ITEMS=$(docker compose exec -T db psql -U postgres -d topshelf -tAc "SELECT COUNT(*) FROM items" 2>/dev/null | tr -d '[:space:]' || echo "0")
POST_INVENTORY=$(docker compose exec -T db psql -U postgres -d topshelf -tAc "SELECT COUNT(*) FROM inventory" 2>/dev/null | tr -d '[:space:]' || echo "0")
POST_CATEGORIES=$(docker compose exec -T db psql -U postgres -d topshelf -tAc "SELECT COUNT(*) FROM categories" 2>/dev/null | tr -d '[:space:]' || echo "0")
echo "  Post-migration: orgs=$POST_ORGS users=$POST_USERS items=$POST_ITEMS inventory=$POST_INVENTORY categories=$POST_CATEGORIES"

# Verify no rows were lost
DATA_LOSS=false
for TABLE_CHECK in "organizations:$PRE_ORGS:$POST_ORGS" "users:$PRE_USERS:$POST_USERS" "items:$PRE_ITEMS:$POST_ITEMS" "inventory:$PRE_INVENTORY:$POST_INVENTORY" "categories:$PRE_CATEGORIES:$POST_CATEGORIES"; do
    TBL=$(echo "$TABLE_CHECK" | cut -d: -f1)
    PRE=$(echo "$TABLE_CHECK" | cut -d: -f2)
    POST=$(echo "$TABLE_CHECK" | cut -d: -f3)
    if [ -n "$PRE" ] && [ -n "$POST" ] && [ "$PRE" -gt 0 ] && [ "$POST" -lt "$PRE" ] 2>/dev/null; then
        echo "CRITICAL: Table '$TBL' lost rows! Before=$PRE After=$POST"
        DATA_LOSS=true
    fi
done

if [ "$DATA_LOSS" = "true" ]; then
    echo ""
    echo "================================================================"
    echo "  CRITICAL: DATA LOSS DETECTED AFTER MIGRATION"
    echo "  The migration transaction should have rolled back automatically."
    echo "  To restore from the pre-deploy backup:"
    echo "    bash $SCRIPT_DIR/restore-db.sh $(basename "$ACTUAL_BACKUP")"
    echo "================================================================"
    docker compose exec -T app node scripts/notify-deploy.js migration_warning \
        "{\"git_commit\":\"$POST_DEPLOY_COMMIT\",\"commit_message\":\"$POST_DEPLOY_MSG\",\"backup_file\":\"$(basename "$ACTUAL_BACKUP")\",\"note\":\"DATA LOSS DETECTED — immediate restore may be required\"}" \
        2>/dev/null || true
    exit 1
fi

# Check for SQL errors vs expected duplicate_column notices
if echo "$MIGRATE_OUT" | grep -qi "ERROR:" ; then
    MIGRATION_STATUS="warning"
    echo "WARNING: Migrations completed with errors. Check output above."
    echo "         All errors are wrapped — existing data is preserved."
    # Send warning notification
    docker compose exec -T app node scripts/notify-deploy.js migration_warning \
        "{\"git_commit\":\"$POST_DEPLOY_COMMIT\",\"commit_message\":\"$POST_DEPLOY_MSG\",\"backup_file\":\"$(basename "$ACTUAL_BACKUP")\",\"note\":\"Review migration output in deploy log\"}" \
        2>/dev/null || true
else
    MIGRATION_STATUS="success"
    echo "Schema migrations applied successfully."
    # Send success notification
    docker compose exec -T app node scripts/notify-deploy.js migration_complete \
        "{\"git_commit\":\"$POST_DEPLOY_COMMIT\",\"commit_message\":\"$POST_DEPLOY_MSG\",\"backup_file\":\"$(basename "$ACTUAL_BACKUP")\",\"status\":\"All migrations applied — data preserved\"}" \
        2>/dev/null || true
fi

# 9. Seed default super admin only on a truly empty database
echo "Checking for existing users..."
USER_COUNT=$(docker compose exec -T db psql -U postgres -d topshelf -tAc "SELECT COUNT(*) FROM users" 2>/dev/null | tr -d '[:space:]')

# Only seed if we got a clean numeric 0 back — any error or non-zero value skips this
if [ "$USER_COUNT" = "0" ]; then
    echo "No users found (fresh database). Creating default super admin..."
    DEFAULT_PASS="TopShelf$(date +%Y)!"
    if docker compose exec -T app node scripts/create_super_admin.js admin@topshelf.app "$DEFAULT_PASS"; then
        echo ""
        echo "============================================"
        echo "  DEFAULT SUPER ADMIN CREDENTIALS"
        echo "  Email:    admin@topshelf.app"
        echo "  Password: $DEFAULT_PASS"
        echo "  CHANGE THESE IMMEDIATELY AFTER FIRST LOGIN"
        echo "============================================"
        echo ""
    else
        echo "WARNING: Failed to create default super admin. Run manually:"
        echo "  docker compose exec app node scripts/create_super_admin.js <email> <password>"
    fi
elif [ -z "$USER_COUNT" ]; then
    echo "Could not query user count (DB may not be ready). Skipping super admin seed."
else
    echo "Users already exist ($USER_COUNT found). Skipping super admin seed."
fi

echo ""
echo "Deployment Complete! Application should be running on port 6050."
echo "Backups stored in: $BACKUP_DIR"
echo "To restore:  bash $SCRIPT_DIR/restore-db.sh"
echo "To list:     bash $SCRIPT_DIR/restore-db.sh --list"
