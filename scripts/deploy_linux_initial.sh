#!/bin/bash
set -e

echo "=========================================================="
echo "  TopShelf Inventory - Master Initial Linux Deployment "
echo "=========================================================="

if [ "$EUID" -ne 0 ]; then
  echo "ERROR: Please run as root (sudo ./scripts/deploy_linux_initial.sh)"
  exit 1
fi

echo ""
echo "[Step 1] Securing Docker Dependencies & Plugins..."
apt-get update
# --fix-broken ensures we don't trip over legacy docker-compose leftovers
apt-get --fix-broken install -y
apt-get remove -y docker-compose docker-buildx || true
apt-get install -y docker.io docker-compose-plugin docker-buildx-plugin

echo ""
echo "[Step 2] Activating Docker Daemon..."
systemctl enable --now docker
systemctl restart docker

echo ""
echo "[Step 3] Pulling Latest Application Code..."
git pull || true

echo ""
echo "[Step 4] Rebuilding Docker Containers natively via Compose..."
# Remove old sessions
docker compose down --remove-orphans || true
# Rebuild the images and start the daemon (Alpine node modules will compile here natively)
docker compose up -d --build

echo ""
echo "[Step 5] Waiting for PostgreSQL to boot..."
# Postgres takes a few seconds to accept connections on a fresh boot
sleep 10
MAX_TRIES=15
for i in $(seq 1 $MAX_TRIES); do
  if docker compose exec -T db pg_isready -U postgres &> /dev/null; then
    echo "PostgreSQL is ready!"
    break
  fi
  echo "Waiting... ($i/$MAX_TRIES)"
  sleep 3
done

echo ""
echo "[Step 6] Initializing Raw Database Schema..."
# This drops and recreates the public schema and tables
docker compose exec -T app node scripts/init-postgres.js

echo ""
echo "[Step 7] Injecting Primary Super Admin Account..."
docker compose exec -T app node scripts/create_super_admin.js trsonderm@gmail.com D@T@121j

echo "=========================================================="
echo "✅ DEPLOYMENT COMPLETE! Bar Stock App is fully online."
echo "Port 6050 is active. Database is listening on port 5433."
echo "You can now run: sudo ./setup-ssl.sh OR ./repair_nginx.sh"
echo "=========================================================="
