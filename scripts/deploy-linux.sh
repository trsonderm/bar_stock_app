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
BACKUP_FILE="$BACKUP_DIR/topshelf_${DEPLOY_TIMESTAMP}.sql.gz"
bash "$SCRIPT_DIR/backup-db.sh" "$BACKUP_DIR" || echo "WARNING: Backup failed — proceeding anyway. Check $BACKUP_DIR."
# Resolve the actual backup file created (backup-db.sh uses its own timestamp; grab most recent)
ACTUAL_BACKUP=$(find "$BACKUP_DIR" -maxdepth 1 -name "topshelf_*.sql.gz" 2>/dev/null | sort | tail -1 || echo "")
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
echo "Applying base schema..."
if docker compose exec -T db psql -U postgres -d topshelf < "$SCRIPT_DIR/schema.sql"; then
    echo "Base schema applied."
else
    echo "WARNING: schema.sql returned errors (may be safe if tables already exist)."
fi

# 8. Run incremental migrations (idempotent ALTER TABLE / CREATE TABLE IF NOT EXISTS)
echo "Running schema migrations..."
if docker compose exec -T db psql -U postgres -d topshelf < "$SCRIPT_DIR/migrate.sql"; then
    echo "Schema migrations applied successfully."
else
    echo "WARNING: Migration script returned an error. Check output above."
    echo "         Deployment will continue — existing data is not affected."
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
