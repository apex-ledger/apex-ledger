# CPA firm seat and login model

## Firm workspace

Each CPA firm has one tenant workspace containing the companies it is authorized
to manage. The workspace replaces a shared physical `.company` file. Several
authorized users can work concurrently without copying or opening a SQLite file
from a network drive.

## Individual login

Every seat belongs to one person. Microsoft Entra External ID manages account
registration, password hashing, password reset, MFA and token issuance. North
Ledger stores the Entra object identifier and profile details, never a readable
password or reusable login token.

## Invitation flow

1. A firm owner or firm administrator enters the user's email and role.
2. Apex Ledger reserves one seat and creates a random 256-bit invitation token.
3. Only the SHA-256 token hash is stored. The raw token is returned once in a URL
   fragment so it is not sent in ordinary HTTP request logs.
4. The recipient signs in through Microsoft Entra using the invited email.
5. Apex Ledger validates the Entra token, invitation hash, email, expiry and seat
   reservation in one database transaction.
6. Membership is activated and an append-only audit event is recorded.

Invitations expire after seven days. Expired reservations are released. A firm
cannot invite beyond its subscription `seat_limit`.

## Seat removal

Removing access suspends the membership instead of deleting it. Historical audit
records retain the person's identity. Administrators cannot suspend themselves,
and an owner cannot be suspended until ownership is transferred, preventing a
firm from accidentally locking itself out.
