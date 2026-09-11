# Working on ApexLedger from another computer

Everything that matters lives off the workstation: the code is in the private GitHub repository
`apex-ledger/apex-ledger`, the live site and application run on the Azure VM, and the firms' data is
on that VM. A second computer needs only the tools to edit, test and deploy.

## Before leaving the main PC (10 minutes, do these with Claude)

1. **New SSH key for the laptop.** On the laptop, once it exists: `ssh-keygen -t ed25519 -f ~/.ssh/apexledger_azure -N ""`
   and send the *public* key (`~/.ssh/apexledger_azure.pub`, one line starting `ssh-ed25519`) to
   Claude on the main PC to add to `/home/apex/.ssh/authorized_keys` on the VM. Never copy the
   private key between machines.
2. **Firewall.** SSH (port 22) is allowed from the main PC's home address only. From India the
   address differs, so on arrival run from the laptop (Azure CLI signed in):
   `az network nsg rule update -g apexledger-prod-cac --nsg-name apexledger-appNSG -n default-allow-ssh --source-address-prefixes <laptop public ip>/32`
   (find the address at https://api.ipify.org). This needs no SSH, only the Azure sign-in.
3. **Daily feedback task.** It runs only while the Claude desktop app is open on the PC that owns it.
   Either leave the main PC on with the app open, or recreate the task on the laptop from
   `C:\Users\<you>\.claude\scheduled-tasks\apexledger-feedback-fix\SKILL.md` (copy that folder).
4. **Claude's notes.** Copy `C:\Users\<you>\.claude\projects\D--Projects-ATP-Systems\memory\` to the
   same relative place on the laptop so Claude starts with the project context. `docs/WEB.md` in
   the repository holds the same facts if that is missed.

## Setting up the laptop (30 minutes)

1. Install Git, Node.js 22 LTS, and the Claude desktop app; sign in to Claude.
2. Sign in to GitHub as `apex-ledger` and clone: `git clone https://github.com/apex-ledger/apex-ledger.git D:\Projects\ApexLedger-Claude`
   (any folder works; keep the same path if the memory notes were copied).
3. In the folder: `npm ci` then `npm run rebuild` (desktop build) or `npm rebuild better-sqlite3` (web server build).
   The Windows build tools prompt appears once if they are missing; accept it.
4. Azure CLI: `winget install Microsoft.AzureCLI --source winget`, then `az login --use-device-code`.
   If a Norton-style antivirus inspects TLS, export its root certificate and set
   `REQUESTS_CA_BUNDLE` as on the main PC; without such software this step is not needed.
5. Deploys: exactly as in `deploy/deploy-release.sh` (build, tar, scp with the laptop's key, run the script).

## What stays put

- The Azure VM, its backups, the domain, the Microsoft sign-in registration, HostPapa DNS.
- The admin sign-in for online.apexledger.ca (same everywhere).
- Firm data: never copy company files onto a travelling laptop. Use the web application.

## Travelling

- Turn on BitLocker on the laptop before you go; a lost laptop then holds nothing readable.
- Public Wi-Fi is fine for the web application (HTTPS); for SSH deploys prefer a phone hotspot.
- Time zone does not matter to anything on the server (it runs in UTC and the app shows local time).
