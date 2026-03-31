#!/bin/bash
set -e

echo "Starting deployment..."

echo "Pulling from git..."
git pull

echo "Exporting environment variables..."
export NEXT_PUBLIC_APP_URL="https://dev.topshelftinventory.com"

echo "Installing dependencies..."
# Ensure all libraries (including devDependencies required for build) are installed 
# even if NODE_ENV=production is set in the environment
npm install --include=dev --legacy-peer-deps

echo "Checking database..."
if [ ! -f "inventory.db" ]; then
    echo "Database not found. Initializing..."
    node scripts/init-db.js
fi
echo "Building application..."
npm run build

echo "Restarting server..."
# Check if stop script exists and is executable
if [ -x "./stop.sh" ]; then
    ./stop.sh || true # Ignore failure if not running
else
    bash ./stop.sh || true
fi

if [ -x "./start.sh" ]; then
    ./start.sh
else
    bash ./start.sh
fi

echo "Deployment complete."
