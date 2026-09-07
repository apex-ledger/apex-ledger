# Desktop-to-cloud migration inventory

Audit date: 2026-08-29

## Measured desktop boundary

- Electron + React + TypeScript desktop application
- `better-sqlite3` local `.company` data files
- 41 IPC handler modules
- 839-line Electron preload bridge
- Approximately 567 `window.api` references in renderer source
- Approximately 745 lines in the current database schema module

These figures explain why the current installer cannot simply be uploaded as an
online multi-user application. The React screens are reusable, as are many pure
accounting domain functions, but the data access boundary must be replaced.

## Reuse

- React visual components and page layouts
- Shared domain calculations and their tests
- Zod validation schemas
- Accounting regression fixtures
- PDF/report logic after filesystem operations are abstracted

## Replace or adapt

- Electron `ipcRenderer` calls -> authenticated HTTPS client
- Electron `ipcMain` handlers -> server API routes/services
- SQLite connection and file switching -> PostgreSQL tenant context
- Local file dialogs and paths -> Azure Blob Storage upload/download
- Machine-bound licensing -> subscription, firm and seat entitlements
- Local mirror events -> tenant/company-scoped real-time events
- Local recovery points -> managed backups plus audited restore workflow

## Pilot acceptance target

Two firms, two seats each can sign in with MFA, see only authorized companies,
work simultaneously, observe committed changes without refreshing, and recover
from conflicting edits without silent data loss. Journal posting, HST locks and
audit history must retain the desktop product's verified accounting behaviour.

