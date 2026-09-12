#!/usr/bin/env bash
# Adds or replaces one secret in /etc/apexledger.env on the server and restarts the service.
# The value is typed at a hidden prompt, never on the command line, never in the shell history.
#
#   bash deploy/set-secret.sh APEX_ANTHROPIC_API_KEY
set -e
NAME="${1:?usage: bash deploy/set-secret.sh VARIABLE_NAME}"
read -r -s -p "Value for $NAME (hidden): " VALUE; echo
[ -n "$VALUE" ] || { echo "nothing entered"; exit 1; }
printf '%s' "$VALUE" | ssh -i ~/.ssh/apexledger_azure apex@20.63.45.22 "V=\$(cat); sudo sed -i '/^$NAME=/d' /etc/apexledger.env && printf '%s=%s\n' '$NAME' \"\$V\" | sudo tee -a /etc/apexledger.env >/dev/null && sudo chmod 600 /etc/apexledger.env && sudo systemctl restart apexledger && sleep 3 && echo \"$NAME set; service: \$(systemctl is-active apexledger)\""
