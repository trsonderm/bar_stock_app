#!/bin/bash
# Non-Docker deployment (dev server): pull, install, migrate, build, restart.
# Requires DATABASE_URL and JWT_SECRET in the environment or in .env.local.
set -e

cd "$(dirname "$0")"

echo "Starting deployment..."

echo "Pulling from git..."
git pull

echo "Exporting environment variables..."
export NEXT_PUBLIC_APP_URL="${NEXT_PUBLIC_APP_URL:-https://dev.topshelfinventory.com}"

echo "Installing dependencies..."
# Include devDependencies (needed for the build) even if NODE_ENV=production is set
npm install --include=dev --legacy-peer-deps

echo "Applying database migrations..."
# migrate.sql is idempotent and safe to run on every deploy.
node scripts/migrate.js

echo "Building application..."
npm run build

echo "Restarting server..."
bash ./stop.sh || true
bash ./start.sh

echo "Deployment complete."
