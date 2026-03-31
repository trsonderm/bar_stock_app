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
# Use --build to ensure changes are picked up. -d for detached mode.
# Using 'docker compose' (v2) which is standard on modern systems.
docker compose down --remove-orphans
docker compose up -d --build

# 3. Wait for Database
echo "Waiting for database to initialize..."
sleep 5

# 4. Run Migrations inside the container
echo "Running database migrations..."
docker compose exec -T app node scripts/migrate.js

echo "Deployment Complete! Application should be running on port 6050."
