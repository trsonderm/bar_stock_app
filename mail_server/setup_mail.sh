#!/bin/bash
# setup_mail.sh
# Debian 12 (Bookworm) / Debian 13 (Trixie) Mail Server Setup Script
# Domain: topshelfinventory.com
# Stack: Postfix, Dovecot, MariaDB, PHP-FPM, Nginx, PostfixAdmin

set -e

DOMAIN="topshelfinventory.com"
DB_NAME="postfixadmin"
DB_USER="postfixadmin"
DB_PASS=$(openssl rand -hex 16)
SETUP_LOG="setup_mail.log"

echo "=========================================="
echo " Starting Mail Server Setup for $DOMAIN"
echo "=========================================="
echo "Logs will be written to $SETUP_LOG"
exec > >(tee -a "$SETUP_LOG") 2>&1

# 1. Update and Install Dependencies
export DEBIAN_FRONTEND=noninteractive
echo "--> Updating system and installing dependencies..."
apt-get update
apt-get upgrade -y
apt-get install -y \
    postfix postfix-mysql \
    dovecot-core dovecot-imapd dovecot-pop3d dovecot-lmtpd dovecot-mysql \
    mariadb-server \
    nginx certbot python3-certbot-nginx \
    php-fpm php-cli php-mysql php-mbstring php-imap \
    curl unzip git ufw

# 2. Database Setup
echo "--> Securing & Configuring MariaDB database..."
systemctl start mariadb

# Create Database and User for PostfixAdmin
mariadb -e "CREATE DATABASE IF NOT EXISTS ${DB_NAME};"
mariadb -e "CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';"
mariadb -e "GRANT ALL PRIVILEGES ON ${DB_NAME}.* TO '${DB_USER}'@'localhost';"
mariadb -e "FLUSH PRIVILEGES;"

echo "--> Database credentials saved to mail_credentials.txt"
echo "Domain: $DOMAIN" > mail_credentials.txt
echo "DB_NAME: $DB_NAME" >> mail_credentials.txt
echo "DB_USER: $DB_USER" >> mail_credentials.txt
echo "DB_PASS: $DB_PASS" >> mail_credentials.txt

# 3. PostfixAdmin Setup
echo "--> Downloading and configuring PostfixAdmin GUI..."
PFA_DIR="/var/www/postfixadmin"
if [ ! -d "$PFA_DIR" ]; then
    mkdir -p /var/www
    cd /var/www
    curl -L -O https://github.com/postfixadmin/postfixadmin/archive/refs/tags/postfixadmin-3.3.13.tar.gz
    tar -xzf postfixadmin-3.3.13.tar.gz
    mv postfixadmin-postfixadmin-3.3.13 postfixadmin
    rm postfixadmin-3.3.13.tar.gz
fi

mkdir -p $PFA_DIR/templates_c
chown -R www-data:www-data $PFA_DIR

# Create PostfixAdmin local config
cat <<EOF > $PFA_DIR/config.local.php
<?php
\$CONF['configured'] = true;
\$CONF['database_type'] = 'mysqli';
\$CONF['database_host'] = 'localhost';
\$CONF['database_user'] = '${DB_USER}';
\$CONF['database_password'] = '${DB_PASS}';
\$CONF['database_name'] = '${DB_NAME}';
\$CONF['default_aliases'] = array(
    'abuse' => 'abuse@$DOMAIN',
    'hostmaster' => 'hostmaster@$DOMAIN',
    'postmaster' => 'postmaster@$DOMAIN',
    'webmaster' => 'webmaster@$DOMAIN'
);
\$CONF['domain_path'] = 'YES';
\$CONF['domain_in_mailbox'] = 'NO';
\$CONF['fetchmail'] = 'NO';
?>
EOF

# Nginx config for PostfixAdmin
echo "--> Configuring Nginx for PostfixAdmin..."
cat <<EOF > /etc/nginx/sites-available/postfixadmin
server {
    listen 80;
    server_name mail.$DOMAIN;
    root /var/www/postfixadmin/public;
    index index.php index.html;

    location / {
        try_files \$uri \$uri/ =404;
    }

    location ~ \.php\$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/run/php/php-fpm.sock;
    }
}
EOF

ln -sf /etc/nginx/sites-available/postfixadmin /etc/nginx/sites-enabled/
systemctl restart nginx

# 4. Postfix Configuration
echo "--> Configuring Postfix..."

cat <<EOF > /etc/postfix/mysql_virtual_domains_maps.cf
user = ${DB_USER}
password = ${DB_PASS}
hosts = 127.0.0.1
dbname = ${DB_NAME}
query = SELECT domain FROM domain WHERE domain='%s' AND active = '1'
EOF

cat <<EOF > /etc/postfix/mysql_virtual_mailbox_maps.cf
user = ${DB_USER}
password = ${DB_PASS}
hosts = 127.0.0.1
dbname = ${DB_NAME}
query = SELECT maildir FROM mailbox WHERE username='%s' AND active = '1'
EOF

cat <<EOF > /etc/postfix/mysql_virtual_alias_maps.cf
user = ${DB_USER}
password = ${DB_PASS}
hosts = 127.0.0.1
dbname = ${DB_NAME}
query = SELECT goto FROM alias WHERE address='%s' AND active = '1'
EOF

# Add virtual mail mappings to Postfix main.cf
postconf -e "myhostname = mail.$DOMAIN"
postconf -e "mydestination = localhost"
postconf -e "virtual_mailbox_domains = proxy:mysql:/etc/postfix/mysql_virtual_domains_maps.cf"
postconf -e "virtual_alias_maps = proxy:mysql:/etc/postfix/mysql_virtual_alias_maps.cf"
postconf -e "virtual_mailbox_maps = proxy:mysql:/etc/postfix/mysql_virtual_mailbox_maps.cf"
postconf -e "virtual_transport = lmtp:unix:private/dovecot-lmtp"
postconf -e "local_recipient_maps = \$virtual_mailbox_maps"

# 5. Dovecot Configuration
echo "--> Configuring Dovecot..."
groupadd -g 5000 vmail || true
useradd -g vmail -u 5000 vmail -d /var/vmail -m || true

cat <<EOF > /etc/dovecot/dovecot-sql.conf.ext
driver = mysql
connect = host=127.0.0.1 dbname=${DB_NAME} user=${DB_USER} password=${DB_PASS}
default_pass_scheme = MD5-CRYPT
password_query = SELECT username as user, password FROM mailbox WHERE username='%u' AND active='1'
user_query = SELECT maildir, 5000 AS uid, 5000 AS gid FROM mailbox WHERE username='%u' AND active='1'
EOF

# Apply configs to dovecot
sed -i 's/#auth_mechanisms = plain/auth_mechanisms = plain login/g' /etc/dovecot/conf.d/10-auth.conf
sed -i 's/!include auth-system.conf.ext/#!include auth-system.conf.ext/g' /etc/dovecot/conf.d/10-auth.conf
sed -i 's/#!include auth-sql.conf.ext/!include auth-sql.conf.ext/g' /etc/dovecot/conf.d/10-auth.conf
sed -i "s|mail_location = mbox:~/mail:INBOX=/var/mail/%u|mail_location = maildir:/var/vmail/%d/%n|g" /etc/dovecot/conf.d/10-mail.conf

cat <<EOF >> /etc/dovecot/conf.d/10-master.conf
service lmtp {
  unix_listener /var/spool/postfix/private/dovecot-lmtp {
    mode = 0666
    user = postfix
    group = postfix
  }
}
EOF

# Restarts
systemctl restart postfix dovecot nginx php*-fpm.service

# 6. Inform user
echo "====================================================="
echo " Setup Complete!"
echo " "
echo " Next Steps:"
echo " 1. Setup DNS A record for mail.$DOMAIN pointing to this server IP"
echo " 2. Run Certbot for SSL (Wait for DNS propagation!):"
echo "    certbot --nginx -d mail.$DOMAIN"
echo " 3. Go to http://mail.$DOMAIN/setup.php to initialize PostfixAdmin"
echo " 4. MySQL credentials have been saved to mail_credentials.txt"
echo "====================================================="
