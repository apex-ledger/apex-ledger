# Platform administration and customer support

Migrations `019_apex_security_and_platform_management.sql` and `020_platform_action_history.sql` add two roles and a read-only service history that are separate from customer-firm roles:

- `platform_admin`: may change plans, renew, suspend, reactivate, mark past due or cancel after an approved business process.
- `customer_support`: may renew, suspend, reactivate or mark past due, but cannot change a plan or cancel service.

The management panel appears only when `current_user_platform_role()` returns an active platform role. Every service action requires a reason and writes an append-only record containing the staff user, timestamp, firm, action, and before/after subscription state. Support tools do not grant access to company accounting data.

The panel shows the latest service actions to authorized platform staff. That history is read-only and is retrieved through a restricted database function; it cannot be changed or deleted through the application.

## Normal procedures

- **Renew:** confirm payment or approved extension, choose the new period end, enter the ticket/payment reference in the reason, then select Renew.
- **Stop service:** confirm the customer request or approved risk action, enter the ticket reference, and select Stop service. `suspended` blocks reads and writes but preserves data.
- **Reactivate:** confirm payment/authorization, enter the reference, then select Reactivate.
- **Past due:** use for billing grace-period handling. Accounting becomes read-only under the current entitlement policy.
- **Cancel or change plan:** platform administrator only; require a second approver outside the application for the production pilot.

Never make support staff firm owners or database owners. Do not use direct database updates for normal service changes because they bypass the append-only management record.
