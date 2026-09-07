# Essentials web deployment

## Azure resources

1. Register a single-page application in Microsoft Entra External ID.
2. Configure the production Static Web Apps URL as a redirect URI.
3. Grant the SPA delegated access to the Apex Ledger API scope.
4. Set the five `VITE_*` build variables from `web/.env.example`.
5. Build `web/` and publish its `dist/` folder to Azure Static Web Apps.
6. Add the web origin to the API `ALLOWED_ORIGINS` setting exactly; do not use a
   wildcard origin with authenticated financial data.

## Login security

The browser uses Microsoft Authorization Code Flow with PKCE through MSAL. Tokens
are requested for the Apex Ledger API and cached in session storage. The web app
contains no client secret and never receives, logs or stores a user's password.
Enable MFA and configure password/reset policies in Entra External ID.

## Workspace behaviour

After sign-in, the browser retrieves only firms associated with the authenticated
membership. Selecting a firm loads its authorized companies, plan and role-based
capabilities. Selecting a company loads accounts, current-year business entries
and HST summary totals.

The Essentials screen lets an authorized user enter Sales or Expenses. The
description requests a tax suggestion after a short delay, but the chosen tax
code remains visible and confirmation is required on save. Every save has a new
idempotency key so browser or network retries cannot duplicate the journal.

## Release gates

Before pilot deployment, generate the npm lockfile using a trusted registry
certificate path, run the complete web build, test Microsoft login against the
pilot tenant, test all three subscription plans, confirm cross-firm access is
denied, and run the accessibility and browser test suite.
