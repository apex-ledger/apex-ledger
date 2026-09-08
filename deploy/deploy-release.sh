#!/usr/bin/env bash
# Installs a new release on the VM. Run on the server as the "apex" user after uploading:
#   site.tgz     the website/ folder          -> /var/www/apexledger
#   bundles.tgz  dist-server/ and dist-web/   -> /opt/apexledger, then the service restarts
# Either file may be absent; only what was uploaded is installed.
#
# From the workstation (PowerShell or Git Bash), with the repo built (npm run build:web):
#   tar -czf site.tgz website && tar -czf bundles.tgz dist-server dist-web
#   scp -i ~/.ssh/apexledger_azure site.tgz bundles.tgz deploy/deploy-release.sh apex@20.63.45.22:/home/apex/
#   ssh -i ~/.ssh/apexledger_azure apex@20.63.45.22 'bash /home/apex/deploy-release.sh'
# Sessions survive the restart (they are rows in web-admin.db), so nobody is signed out.
set -e
cd /home/apex
if [ -f site.tgz ]; then
  rm -rf website && tar -xzf site.tgz
  sudo mkdir -p /var/www/apexledger
  sudo find /var/www/apexledger -mindepth 1 -delete
  sudo cp -r website/. /var/www/apexledger/
  sudo chown -R www-data:www-data /var/www/apexledger
  rm -f site.tgz
  echo "website installed"
fi
if [ -f bundles.tgz ]; then
  rm -rf bundles && mkdir -p bundles && tar -xzf bundles.tgz -C bundles
  sudo rm -rf /opt/apexledger/dist-server /opt/apexledger/dist-web
  sudo mv bundles/dist-server bundles/dist-web /opt/apexledger/
  sudo chown -R root:apexsvc /opt/apexledger/dist-server /opt/apexledger/dist-web
  sudo chmod -R o-rwx /opt/apexledger/dist-server /opt/apexledger/dist-web
  rm -rf bundles bundles.tgz
  sudo systemctl restart apexledger
  sleep 3
  echo "service: $(systemctl is-active apexledger)"
  curl -s http://localhost:8787/api/health || true
  echo
fi
