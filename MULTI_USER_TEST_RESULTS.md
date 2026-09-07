# Apex Ledger multi-user test result

## Dummy company

`demo-companies/Apex Ledger Multi-User Test.company`

Database validation completed:

| Check | Result |
|---|---:|
| Active named users | 3 |
| Distinct entry creators | 3 |
| User activity rows | 3 |
| Unbalanced test journals | 0 |
| SQLite quick check | OK |

## Test users and entries

| User | Role | Test entry | Purpose |
|---|---|---|---|
| Alex Admin | Administrator | `MULTI-ALEX` | Admin-created income |
| Priya Accountant | Accountant | `MULTI-PRIYA` | Accountant adjusting entry |
| Jordan Bookkeeper | Bookkeeper | `MULTI-JORDAN` | Bookkeeper-created expense |

The three entries are balanced and retain different `created_by` values. The activity log also
contains one row for each actor/reference, so the Audit Trail, Journal, General Ledger and
Comprehensive Company Report can distinguish them.

## Manual same-time test

1. Open `Apex Ledger Multi-User Test.company` using **Open Company**.
2. In the light-green top bar choose **Working as — Alex Admin**.
3. Click **Mirror Window** twice.
4. In the second window choose **Priya Accountant**; in the third choose **Jordan Bookkeeper**.
5. Enter a different transaction in each window.
6. Leave the windows open. Successful saves broadcast a refresh to every window automatically.
7. Open **Reports → Journal**, **General Ledger**, **Audit Trail**, or **Comprehensive Company Report**.
   The user name is shown and each actor has a stable review color.

## Boundary of this local test

This proves simultaneous, separately attributed sessions in multiple Apex Ledger windows sharing
one local company database. Separate computers/offices still require the planned cloud database,
server-side authentication, conflict handling and WebSocket/live-update service. The desktop test
does not pretend to provide those remote guarantees yet.
