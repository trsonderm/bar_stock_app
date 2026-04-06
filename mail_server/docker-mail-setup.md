# Mail Server Deployment (Docker/Mailcow)

We have migrated to **Mailcow Dockerized** because it provides a fully autonomous out-of-the-box system orchestrating Postfix, Dovecot, Nginx, Let's Encrypt (ACME), and a fully structured admin GUI. This is inherently more resilient and capable than a bash script attempting to install individual system binaries side-by-side.

## Hardware Requirements
- OS: Debian 12 (Bookworm) or Debian 13 (Trixie)
- RAM: 2GB Minimum (4GB recommended otherwise disable ClamAV during install)
- Ports: Ensure ports `25`, `80`, `443`, `110`, `143`, `465`, `587`, `993`, `995` are unblocked on your firewall.

## 1. Domain Configuration
Before installation, configure your DNS records to route mail towards the exact hostname the Docker stack will use:

1. Setup an **A Record** pointing `mail.topshelfinventory.com` to your Server IP.
2. Setup an **MX Record** pointing `@` OR `topshelfinventory.com` with Priority `10` pointing to `mail.topshelfinventory.com`.

*Mailcow will natively handle mapping `@topshelfinventory.com` addresses inwards later via its control panel.*

## 2. Prepare Docker Foundation

Install Docker engine and Docker Compose standard tooling:
```bash
sudo apt update
sudo apt install curl apt-transport-https ca-certificates gnupg2 jq -y
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
```

## 3. Install Mailcow

Clone the source into `/opt`:
```bash
su -
cd /opt
git clone https://github.com/mailcow/mailcow-dockerized
cd mailcow-dockerized
```

Generate the configuration matrix. It will prompt you for the `Mail server hostname`. You **MUST** specify `mail.topshelfinventory.com`.
*(Note: Do NOT run this with `sh generate_config.sh` as it requires Bash).*
```bash
bash ./generate_config.sh
```

*(Optional)* If running locally with minimal RAM (<3GB), disable the antivirus scanner to prevent OOM errors:
```bash
nano mailcow.conf
# Change SKIP_CLAMD=n to SKIP_CLAMD=y
# Change SKIP_SOLR=n to SKIP_SOLR=y
```

## 4. Initializing the Stack
Once configured, simply bring the containers online.
```bash
docker compose pull
docker compose up -d
```

## 5. GUI Setup & Mailbox Management

After startup, let the Docker containers stabilize for 2-3 minutes. Let's Encrypt will automatically reach out and attempt to verify your domain (ensure Port 80 is open to the internet).

1. Navigate to: **https://mail.topshelfinventory.com**
2. Login with credentials:
   - Username: `admin`
   - Password: `moohoo` (Change this immediately inside the GUI panel).

### Connecting to tophelfinventory.com
- Within the Mailcow Admin panel, go to **Configuration -> Mail Setup -> Domains** and add `topshelfinventory.com`.
- Head to **Mailboxes** and click "Add mailbox". You can now safely generate your core accounts:
  - `support@topshelfinventory.com`
  - `reporting@topshelfinventory.com`
  - `admin@topshelfinventory.com`

Provide these generated credentials into your Super Admin portal on your main webapp to hook the two services together.
