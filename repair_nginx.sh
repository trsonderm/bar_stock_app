#!/bin/bash
set -e

echo "TopShelf Inventory - NGINX Automated Repair Tool"
echo "------------------------------------------------"

if [ "$EUID" -ne 0 ]; then
  echo "ERROR: Please run as root (sudo ./repair_nginx.sh)"
  exit 1
fi

APP_DIR="/srv/bar_stock_app"

echo "1. Killing any stuck processes on Port 80 / 443..."
fuser -k 80/tcp || true
fuser -k 443/tcp || true

echo "2. Disabling Apache (if active)..."
systemctl stop apache2 || true
systemctl disable apache2 || true

echo "3. Restoring factory-default /etc/nginx/nginx.conf..."
cp $APP_DIR/nginx-default.conf /etc/nginx/nginx.conf

echo "4. Removing legacy default site links..."
rm -f /etc/nginx/sites-enabled/default

echo "5. Linking TopShelf Production configuration..."
cp $APP_DIR/nginx-prod.conf /etc/nginx/sites-available/topshelf
ln -sf /etc/nginx/sites-available/topshelf /etc/nginx/sites-enabled/topshelf

echo "6. Testing NGINX configuration..."
nginx -t

echo "7. Restarting NGINX..."
systemctl restart nginx

echo "------------------------------------------------"
echo "✅ NGINX has been repaired, linked, and restarted successfully!"
echo "If this was your first time setting up the server, you can"
echo "now safely run: sudo ./setup-ssl.sh"
