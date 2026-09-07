# Firm seat growth

Version `0.1.327` adds an administrator-facing firm seat area designed to grow from the two-firm pilot toward 200 or more named users.

## Available now

- Shows active seats, pending invitations, total limit, and capacity usage.
- Invites a named person by verified email with an explicit **Can edit**, **Payroll only**, or **View only** permission. Accountant, bookkeeper, and firm-administrator seats can edit authorized company accounting data; viewer seats cannot edit.
- Blocks invitations when active plus pending seats reach the licensed limit.
- Creates a secure one-time acceptance link without storing the raw secret.
- The recipient can open the link, sign in using the exact invited email, accept the seat, and enter the shared firm workspace. A mismatched email, expired link, revoked link, or reused link is rejected.
- Like the QuickBooks Online Accountant team model, the administrator selects the client companies the invited user may open. Non-administrator seats cannot list, read, or edit unassigned client companies. Administrators can later edit a team member's client assignments.
- Allows an administrator to cancel a pending invitation or suspend a non-owner user, while retaining their audit history.
- Records one auditable, administrator-only request for a higher seat limit. Current access does not change before billing approval.
- Keeps every firm and company behind PostgreSQL row-level security; adding seats does not copy company files.

## Billing connection still required

The request record is intentionally separate from entitlement changes. A future billing worker must validate a signed provider event, approve the request, change the licensed limit atomically, and record the provider reference. This prevents a browser user from granting itself unpaid seats.
