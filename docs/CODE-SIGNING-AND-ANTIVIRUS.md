# Why Norton blocks the installer, and what fixes it

## What is happening

The installer and the application executable are **not code-signed**. Norton 360's reputation
engine (the detection usually reads `WS.Reputation.1` or a SONAR heuristic) blocks or quarantines
any unsigned executable that few other Norton users have run — which is every TEST build of this
app by definition. It is not reacting to anything the app does; it is reacting to not knowing
who published it. Windows SmartScreen shows its "unknown publisher" warning for the same reason.

Nothing in the package is malicious. The two things inside it that heuristics most often point at:

- `resources/elevate.exe` — electron-builder's standard helper that asks for administrator rights
  when installing into `C:\Program Files`. Every electron-builder NSIS installer ships it.
- The NSIS installer stub itself, which is self-extracting and unsigned.

### `IDP.Generic` on Scan Receipt (behavioural detection)

`IDP.Generic` is not a reputation verdict; it is Norton's behaviour engine reacting to what an
unsigned program *does*. Three behaviours in earlier builds matched its patterns exactly, and each
has been removed:

| Earlier behaviour | Why a heuristic objects | Now |
|---|---|---|
| Launched `powershell.exe -ExecutionPolicy Bypass -EncodedCommand …` to drive the scanner | The signature move of script-based malware | Gone — no PowerShell anywhere in the app |
| Wrote a script into `AppData` at run time and immediately ran it | The "dropper" pattern | Gone — the WIA and Outlook scripts ship as files inside the installation (`resources\scripts\*.js`) and are never written at run time |
| Ran `tasklist.exe` to see which Epson program held the scanner | Process enumeration is reconnaissance behaviour | Gone — the busy message simply names the usual culprits |

What remains is the signed Windows script host (`cscript.exe`) running a plain-text file from the
installation folder, with the folder names passed through the environment. If Norton still objects
to a *signed-binary-from-install-folder* launch, only signing the app (below) or a one-time
exclusion on that machine will satisfy it — there is no further behaviour to remove.

When Norton reports a detection, its **Security → History** entry names the file and the process.
Send that line along with any report: "IDP.Generic on `cscript.exe` started by `Apex Ledger
Ultimate - TEST.exe`" and "WS.Reputation.1 on the installer" are different problems.

## The real fix: sign the build

Signing puts a publisher name on both the installer and the app. Norton's reputation check then
trusts the certificate rather than the download count, and SmartScreen's warning goes away
(immediately with an EV certificate, after a short reputation period with an OV one).

**Recommended: Azure Trusted Signing.** It is the cheapest route (a small monthly charge, no
hardware token), it lives in the Azure subscription the cloud deployment already needs, and
electron-builder 25 supports it natively.

1. In Azure: create a *Trusted Signing* account and a *certificate profile* (Public Trust), and
   complete identity validation for the business. Give the signing identity the
   *Trusted Signing Certificate Profile Signer* role.
2. On the build machine: `az login` as that identity (or set `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`,
   `AZURE_CLIENT_SECRET`).
3. In `package.json` → `build.win`, add:

   ```json
   "azureSignOptions": {
     "endpoint": "https://<region>.codesigning.azure.net",
     "codeSigningAccountName": "<account>",
     "certificateProfileName": "<profile>"
   }
   ```

4. Run `npm run dist:win` as usual. electron-builder signs the app executable, the uninstaller and
   the installer. Confirm with:

   ```powershell
   (Get-AuthenticodeSignature "release\...\ApexLedger-Ultimate-TEST-Setup-<version>.exe").Status
   ```

   which must print `Valid`.

**Alternative: a purchased OV/EV certificate** (Sectigo, DigiCert, GlobalSign). Export it as a
`.pfx`, then before building set:

```powershell
$env:CSC_LINK = "C:\secure\apex-ledger-codesign.pfx"
$env:CSC_KEY_PASSWORD = "<password>"
```

electron-builder picks these up with no configuration change. Never commit the `.pfx` or the
password; keep them outside the repository. An EV certificate ships on a hardware token and is
signed with `win.certificateSubjectName` instead of `CSC_LINK`.

Signing is required before any customer installs this. It is not optional for a Windows product.

## Until the build is signed: making Norton allow a TEST build

These are things the person running Norton does, once, on their own machine:

1. **Restore the file if it was quarantined.** Norton → *Security* → *History* → filter
   *Quarantine* → select the ApexLedger entry → *Restore & Exclude*.
2. **Exclude the folders.** Norton → *Settings* → *Antivirus* → *Scans and Risks* →
   *Exclusions / Low Risks* → *Items to Exclude from Scans* and *Items to Exclude from Auto-Protect,
   Script Control, SONAR and Download Intelligence Detection*, add:
   - `D:\ApexLedger\App` (the installation — the installer defaults to it)
   - `D:\ApexLedger` (company files) and `D:\Projects\ApexLedger-Claude\release` (fresh builds)
   - `C:\Users\<you>\AppData\Roaming\apex-ledger-ultimate-test` (settings, receipt inbox)
3. **Data Protector.** If the app can open a company file but cannot save or back it up, Norton's
   *Data Protector* is blocking writes to Documents. Norton → *Settings* → *Antivirus* →
   *Data Protector* → *Configure* → add `Apex Ledger Ultimate - TEST.exe` as a trusted process.
4. **Report the false positive** so Norton's cloud learns the file:
   https://submit.norton.com/ — choose *Report a suspected erroneous detection (false positive)*,
   attach the installer or paste its SHA-256 (printed at the end of every build; see below).

## Housekeeping

Every TEST build is a separate unsigned program for Norton to distrust, so keep exactly one
installed: the current one in `D:\ApexLedger\App`. The older North Ledger installs under
`C:\Program Files` and `AppData\Local\Programs` have been removed; if a stray one reappears,
uninstall it from *Settings → Apps*. (All of them share one installer identity, so uninstalling
an old copy also removes the current one — reinstall afterwards.)

## Verifying a build

```powershell
Get-FileHash "release\ApexLedger-0.1.330-alpha.8-test\ApexLedger-Ultimate-TEST-Setup-0.1.330-alpha.8.exe" -Algorithm SHA256
(Get-AuthenticodeSignature "release\ApexLedger-0.1.330-alpha.8-test\ApexLedger-Ultimate-TEST-Setup-0.1.330-alpha.8.exe").Status
```

`NotSigned` means the build is unsigned and Norton will keep objecting. `Valid` means it is signed
and the objection is over.
