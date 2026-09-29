#!/bin/bash
set -e

echo "Bar Stock App - Automated SSL Provisioning Script for Debian/Ubuntu"
echo "-------------------------------------------------------------------"

# Ensure script is run as root
if [ "$EUID" -ne 0 ]; then 
  echo "ERROR: Please run this script as root (e.g. sudo ./setup-ssl.sh)"
  exit 1
fi

read -p "Enter primary domain [topshelfinventory.com]: " INPUT_DOMAIN
DOMAIN="${INPUT_DOMAIN:-topshelfinventory.com}"
read -p "Enter www or secondary domain (or press enter for www.$DOMAIN, type 'none' to skip): " INPUT_WWW
if [ "$INPUT_WWW" = "none" ]; then
    WWW_DOMAIN=""
else
    WWW_DOMAIN="${INPUT_WWW:-www.$DOMAIN}"
fi

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
DOMAIN_ARGS="-d $DOMAIN"
if [ -n "$WWW_DOMAIN" ]; then
    DOMAIN_ARGS="$DOMAIN_ARGS -d $WWW_DOMAIN"
fi
certbot --nginx $DOMAIN_ARGS --non-interactive --agree-tos -m "$EMAIL" --redirect

echo "Step 4: Testing automatic renewal..."
systemctl enable certbot.timer
certbot renew --dry-run

echo "-------------------------------------------------------------------"
echo "✅ SSL Certificate successfully installed and configured for NGINX!"
echo "Your application can now cleanly serve HTTPS traffic securely."
