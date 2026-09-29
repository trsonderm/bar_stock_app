#!/bin/bash
set -e

cd "$(dirname "$0")/.."

echo "=========================================================="
echo "  TopShelf Inventory - Master Initial Linux Deployment "
echo "=========================================================="

if [ "$EUID" -ne 0 ]; then
  echo "ERROR: Please run as root (sudo ./scripts/deploy_linux_initial.sh)"
  exit 1
fi

echo ""
echo "[Step 1] Securing Docker Dependencies & Node Tools..."
apt-get update
# --fix-broken ensures we don't trip over legacy docker-compose leftovers
apt-get --fix-broken install -y
apt-get remove -y docker-compose docker-buildx || true
apt-get install -y docker.io docker-compose-plugin docker-buildx-plugin nodejs npm psmisc lsof curl

echo ""
echo "[Step 2] Activating Docker Daemon..."
systemctl enable --now docker
systemctl restart docker

echo ""
echo "[Step 3] Pulling Latest Application Code..."
git pull || true

echo ""
echo "[Step 3.5] Ensuring .env file exists..."
if [ ! -f .env ]; then
  echo "No .env found. Creating .env from .env.example with a fresh JWT_SECRET..."
  cp .env.example .env
  RAND_SECRET=$(openssl rand -base64 36 | tr -dc 'a-zA-Z0-9' | head -c 48)
  sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$RAND_SECRET/" .env
fi

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
echo "[Step 6] Compiling Local Node Environment for Admin Tools..."
# The Docker container strips unused modules. We install them securely on the host.
npm install --legacy-peer-deps || true

echo ""
echo "[Step 7] Initializing Raw Database Schema..."
# Applies schema.sql + migrate.sql against the mapped 5433 port. Refuses to run
# if the database already has tables (use --force to wipe it deliberately).
node scripts/init-postgres.js

echo ""
echo "[Step 8] Injecting Primary Super Admin Account..."
# Credentials come from the environment so they are never committed to git:
#   sudo SUPER_ADMIN_EMAIL=you@example.com SUPER_ADMIN_PASSWORD='...' ./scripts/deploy_linux_initial.sh
if [ -z "$SUPER_ADMIN_EMAIL" ] || [ -z "$SUPER_ADMIN_PASSWORD" ]; then
  echo "SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD not set - skipping."
  echo "Create one later with: node scripts/create_super_admin.js <email> <password>"
else
  node scripts/create_super_admin.js "$SUPER_ADMIN_EMAIL" "$SUPER_ADMIN_PASSWORD"
fi

echo "=========================================================="
echo "✅ DEPLOYMENT COMPLETE! Bar Stock App is fully online."
echo "Port 6050 is active. Database is listening on port 5433."
echo "You can now run: sudo ./setup-ssl.sh OR ./repair_nginx.sh"
echo "=========================================================="
