# Apex Ledger Azure pilot deployment

Version: 0.1.330

## What the infrastructure template creates

`infra/main.bicep` creates a Canada-ready pilot foundation: Azure Container Apps with two minimum API replicas, Azure Container Registry, Static Web Apps, Log Analytics/Application Insights, a user-assigned managed identity, Key Vault references, PostgreSQL Flexible Server with private VNet access, zone redundancy and 35-day geo-redundant backup, and a GZRS Storage account with versioning, soft delete, sensitive-data discovery and Defender for Storage on-upload malware scanning.

The template deliberately does not put secrets in browser settings or source. The database application connection, HMAC keys and email relay credential are secure deployment parameters written to Key Vault. Container Apps reads them through its managed identity.

## Deployment sequence

1. Create separate Azure subscriptions or resource groups for `pilot`, `staging`, and `production`. Never share databases, Key Vaults, storage accounts or Entra app registrations between environments.
2. Install Azure CLI and Bicep on a controlled administration workstation. Run `az login` with an account protected by phishing-resistant MFA.
3. Copy `infra/main.bicepparam.example` outside source control, replace every placeholder, and generate independent 64-byte random values for the contact-search and MFA keys.
4. Validate before deployment:

   ```powershell
   .\cloud\infra\validate.ps1 -ResourceGroup <pilot-rg> -ParametersFile <secure-pilot-parameters>
   ```

   This performs Bicep compilation, Azure deployment validation, and `what-if`, and refuses parameter files that still contain example placeholders. It does not deploy resources.

5. Deploy in two controlled stages. The first stage sets `deployApi=false`, so Azure creates the foundation without trying to pull an image that does not exist yet:

   ```powershell
   .\cloud\infra\deploy.ps1 -ResourceGroup <pilot-rg> -ParametersFile <secure-pilot-parameters> -Stage Foundation -ApproveDeployment
   ```

6. Use the registry name from the deployment output to build the locked API image in Azure Container Registry. Record the immutable digest returned by the script:

   ```powershell
   .\cloud\infra\build-api-image.ps1 -RegistryName <registry-name> -Version 0.1.330
   ```

7. Confirm `apiImageTag='0.1.330'` in the secure parameters, then deploy the application stage. The script explicitly validates and runs `what-if` with `deployApi=true` before making the change:

   ```powershell
   .\cloud\infra\deploy.ps1 -ResourceGroup <pilot-rg> -ParametersFile <secure-pilot-parameters> -Stage Application -ApproveDeployment
   ```

8. Do not promote solely by a mutable tag in production. After the pilot proves the flow, change the Container App release pipeline to use the recorded, scanned, signed image digest.
9. Connect to PostgreSQL from a controlled migration runner inside the VNet. Apply migrations `001` through `020` as the database owner. Create a login that assumes the existing `northledger_app` runtime role; use that restricted login in `DATABASE_URL`. Never run the API as the database owner.
10. Configure Entra External ID SPA/API registrations and exact redirect URLs. Build `cloud/web` with the public `VITE_*` identifiers and API URL, then upload only `web/dist` to Static Web Apps.
11. Deploy a private HTTPS email relay backed by Azure Communication Services Email and a verified sender domain. Restrict it to the API managed identity or a rotated bearer secret from Key Vault. Set `EMAIL_DELIVERY_URL`, `EMAIL_DELIVERY_BEARER_TOKEN`, and `EMAIL_FROM_ADDRESS`.
12. Insert the first platform administrator as database owner after that person has signed in once:

   ```sql
   insert into platform_staff(user_id, role)
   select id, 'platform_admin' from app_users where entra_object_id = '<verified Entra object id>'
   on conflict (user_id) do update set role='platform_admin', active=true;
   ```

13. Complete every item in `PILOT-ACCEPTANCE.md`, including the two-firm/four-seat isolation test, email 2FA delivery test, support suspend/reactivate test, malware test file, backup restore drill, and browser accessibility test before any customer data is accepted.

## Release gates

- The `/ready` probe must remain healthy while two API replicas run.
- Cross-firm and unassigned-company reads must return no data; writes must be denied.
- Email codes must never appear in API responses, browser logs, application logs, analytics, or support screens.
- A suspended firm must lose application access while its data and audit history remain intact.
- Uploaded documents remain in quarantine until Defender reports a clean result. A file with a missing, failed, timed-out, or malicious scan result is never downloadable or processed.
- Restore a PostgreSQL backup and a deleted/versioned blob into an isolated recovery environment and reconcile control totals.

The current workstation does not have Azure CLI/Bicep or live Azure credentials, so the template is source-complete but has not yet passed an Azure `what-if` or live deployment.
