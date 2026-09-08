#!/usr/bin/env bash
# Prepares an Ubuntu 22.04 VM to run the Apex Ledger web server, and (re)deploys the bundle
# uploaded to /home/apex/apexledger-release.tgz. Safe to run again for an update.
#
#   sudo APP_DOMAIN=apexledger.ca bash setup-vm.sh <public-host-name> <admin-email> <admin-password> [seed-orgs]
# APP_DOMAIN adds app.<domain> for the application and <domain> + www for the public site.
#
# What it does: mounts the data disk at /srv/apex (company files live there), installs Node 20 and
# Caddy, unpacks the release into /opt/apexledger, installs production dependencies, writes the
# environment file (0600, root), a systemd service, and a Caddyfile that serves HTTPS for the host
# name with an automatically issued certificate.
set -euo pipefail
HOST="${1:?public host name}"; ADMIN_EMAIL="${2:?admin email}"; ADMIN_PASSWORD="${3:?admin password}"; SEED_ORGS="${4:-}"
export DEBIAN_FRONTEND=noninteractive

echo "== data disk"
if ! mountpoint -q /srv/apex; then
  DISK=$(lsblk -dpno NAME,SIZE,TYPE | awk '$3=="disk" && $2=="64G"{print $1}' | head -1)
  if [ -n "$DISK" ]; then
    if ! blkid "$DISK" >/dev/null 2>&1; then mkfs.ext4 -F -L apexdata "$DISK"; fi
    mkdir -p /srv/apex
    grep -q "LABEL=apexdata" /etc/fstab || echo "LABEL=apexdata /srv/apex ext4 defaults,nofail 0 2" >> /etc/fstab
    mount -a
  else
    echo "no 64 GB data disk found; using the OS disk for /srv/apex" >&2
    mkdir -p /srv/apex
  fi
fi
id -u apexsvc >/dev/null 2>&1 || useradd --system --home /srv/apex --shell /usr/sbin/nologin apexsvc
chown -R apexsvc:apexsvc /srv/apex
chmod 750 /srv/apex

echo "== packages"
apt-get update -q
apt-get install -y -q ca-certificates curl gnupg debian-keyring debian-archive-keyring apt-transport-https build-essential python3 >/dev/null
if ! command -v node >/dev/null || [ "$(node -v | cut -c2-3)" != "20" ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
  apt-get install -y -q nodejs >/dev/null
fi
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q && apt-get install -y -q caddy >/dev/null
fi
node -v; caddy version | head -1

echo "== release"
mkdir -p /opt/apexledger
tar -xzf /home/apex/apexledger-release.tgz -C /opt/apexledger
cd /opt/apexledger
npm ci --omit=dev --no-audit --no-fund >/dev/null 2>&1 || npm ci --omit=dev --no-audit --no-fund
chown -R root:apexsvc /opt/apexledger
chmod -R o-rwx /opt/apexledger

echo "== environment"
install -m 600 -o root -g root /dev/null /etc/apexledger.env
cat > /etc/apexledger.env <<EOF
NODE_ENV=production
PORT=8787
APEX_DATA_DIR=/srv/apex
APEX_ADMIN_EMAIL=${ADMIN_EMAIL}
APEX_ADMIN_PASSWORD=${ADMIN_PASSWORD}
APEX_SEED_ORGS=${SEED_ORGS}
APEX_WEB_STATIC=/opt/apexledger/dist-web
EOF

echo "== service"
cat > /etc/systemd/system/apexledger.service <<'EOF'
[Unit]
Description=Apex Ledger web server
After=network.target

[Service]
Type=simple
User=apexsvc
Group=apexsvc
WorkingDirectory=/opt/apexledger
EnvironmentFile=/etc/apexledger.env
ExecStart=/usr/bin/node /opt/apexledger/dist-server/index.js
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/srv/apex
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable apexledger >/dev/null
systemctl restart apexledger

echo "== https"
# The public site (website/) is served from /var/www/apexledger when it has been uploaded.
mkdir -p /var/www/apexledger
if [ -d /home/apex/website ]; then rm -rf /var/www/apexledger/* && cp -r /home/apex/website/. /var/www/apexledger/ && chown -R www-data:www-data /var/www/apexledger; fi
APP_HOSTS="${HOST}"
[ -n "${APP_DOMAIN:-}" ] && APP_HOSTS="${APP_HOSTS}, app.${APP_DOMAIN}"
cat > /etc/caddy/Caddyfile <<EOF
${APP_HOSTS} {
	encode gzip
	reverse_proxy localhost:8787
	header {
		Strict-Transport-Security "max-age=31536000"
		X-Content-Type-Options nosniff
		X-Frame-Options DENY
		Referrer-Policy no-referrer
	}
}
EOF
if [ -n "${APP_DOMAIN:-}" ]; then cat >> /etc/caddy/Caddyfile <<EOF

${APP_DOMAIN}, www.${APP_DOMAIN} {
	encode gzip
	root * /var/www/apexledger
	file_server
	header {
		Strict-Transport-Security "max-age=31536000"
		X-Content-Type-Options nosniff
		Referrer-Policy strict-origin-when-cross-origin
	}
}
EOF
fi
systemctl enable caddy >/dev/null
systemctl restart caddy

sleep 3
systemctl is-active apexledger caddy
curl -s -o /dev/null -w "local app: %{http_code}\n" http://localhost:8787/api/session
echo "done: https://${HOST}"
