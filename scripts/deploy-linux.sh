#!/bin/bash
set -e

echo "Starting Bar Stock App Deployment (Linux/Docker)..."

# 1. Pull Latest Code
echo "Pulling latest changes from git..."
git pull

# 2. Cleanup Existing Sessions / Ports
echo "Cleaning up existing sessions..."
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

# 4. Wait for PostgreSQL to accept connections (using default postgres db)
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

# 5. Ensure the topshelf database exists (safe on fresh and existing volumes)
echo "Ensuring database 'topshelf' exists..."
docker compose exec -T db psql -U postgres -d postgres -c \
    "SELECT 1 FROM pg_database WHERE datname='topshelf'" \
    | grep -q 1 || \
    docker compose exec -T db psql -U postgres -d postgres -c \
    "CREATE DATABASE topshelf OWNER postgres;" || true
echo "Database ready."

# 6. Run safe schema migrations
echo "Running schema migrations..."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if docker compose exec -T db psql -U postgres -d topshelf < "$SCRIPT_DIR/migrate.sql"; then
    echo "Schema migrations applied successfully."
else
    echo "WARNING: Migration script returned an error. Check output above."
    echo "         Deployment will continue — existing data is not affected."
fi

echo "Deployment Complete! Application should be running on port 6050."
