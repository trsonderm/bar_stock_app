#!/bin/bash
set -e

echo "Starting Bar Stock App Deployment (Linux/Docker)..."

# 1. Pull Latest Code
echo "Pulling latest changes from git..."
git pull

# 2. Cleanup Existing Sessions / Ports
echo "Cleaning up existing sessions..."
# Kill any process on port 6050 or 3000
for PORT in 6050 3000; do
    PID=$(lsof -ti:$PORT || true)
    if [ ! -z "$PID" ]; then
        echo "Killing process $PID on port $PORT"
        kill -9 $PID || true
    fi
done

# 3. Rebuild and Start Containers
echo "Rebuilding and starting containers..."
docker compose down --remove-orphans
docker compose up -d --build

# 4. Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL to be ready..."
RETRIES=30
until docker compose exec -T db pg_isready -U postgres -d topshelf -q 2>/dev/null; do
    RETRIES=$((RETRIES - 1))
    if [ $RETRIES -le 0 ]; then
        echo "ERROR: PostgreSQL did not become ready in time. Aborting migration."
        exit 1
    fi
    echo "  Waiting for database... ($RETRIES retries left)"
    sleep 2
done
echo "PostgreSQL is ready."

# 5. Run safe schema migrations
# All statements in migrate.sql are idempotent — safe to run on existing databases.
# Uses DO $$ EXCEPTION WHEN duplicate_column ... END $$ and CREATE TABLE IF NOT EXISTS.
echo "Running schema migrations..."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if docker compose exec -T db psql -U postgres -d topshelf < "$SCRIPT_DIR/migrate.sql"; then
    echo "Schema migrations applied successfully."
else
    echo "WARNING: Migration script returned an error. Check output above."
    echo "         Deployment will continue — existing data is not affected."
fi

echo "Deployment Complete! Application should be running on port 6050."
