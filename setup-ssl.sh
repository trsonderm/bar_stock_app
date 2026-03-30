#!/bin/bash
set -e

echo "Bar Stock App - Automated SSL Provisioning Script for Debian/Ubuntu"
echo "-------------------------------------------------------------------"

# Ensure script is run as root
if [ "$EUID" -ne 0 ]; then 
  echo "ERROR: Please run this script as root (e.g. sudo ./setup-ssl.sh)"
  exit 1
fi

DOMAIN="topshelfinventory.com"
WWW_DOMAIN="www.topshelfinventory.com"

# Ask for an admin email for Let's Encrypt expiration notices
read -p "Enter admin email address for SSL registration: " EMAIL

if [ -z "$EMAIL" ]; then
    echo "ERROR: Email is required by Let's Encrypt."
    exit 1
fi

echo ""
echo "Step 1: Updating package repository..."
apt-get update

echo "Step 2: Installing Certbot and NGINX plugin..."
apt-get install -y certbot python3-certbot-nginx

echo "Step 3: Provisioning and Installing SSL Certificate..."
# --nginx tells certbot to automatically configure your nginx-prod.conf
# --redirect tells certbot to force HTTP -> HTTPS
certbot --nginx -d $WWW_DOMAIN -d $DOMAIN --non-interactive --agree-tos -m "$EMAIL" --redirect

echo "Step 4: Testing automatic renewal..."
systemctl enable certbot.timer
certbot renew --dry-run

echo "-------------------------------------------------------------------"
echo "✅ SSL Certificate successfully installed and configured for NGINX!"
echo "Your application can now cleanly serve HTTPS traffic securely."
