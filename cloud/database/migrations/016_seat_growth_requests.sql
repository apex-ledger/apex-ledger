begin;

create table firm_seat_change_requests(
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id),
  requested_by uuid not null references app_users(id),
  current_seat_limit integer not null check(current_seat_limit > 0),
  requested_seat_limit integer not null check(requested_seat_limit > current_seat_limit),
  status text not null default 'pending' check(status in('pending','approved','rejected','canceled')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  provider_reference text
);
create unique index firm_seat_change_one_pending_idx on firm_seat_change_requests(firm_id) where status='pending';
create index firm_seat_change_history_idx on firm_seat_change_requests(firm_id,created_at desc);

alter table firm_seat_change_requests enable row level security;
alter table firm_seat_change_requests force row level security;
create policy firm_seat_change_admin_select on firm_seat_change_requests for select
  using(current_user_firm_role(firm_id) in('owner','firm_admin'));
create policy firm_seat_change_admin_insert on firm_seat_change_requests for insert
  with check(current_user_firm_role(firm_id) in('owner','firm_admin')
    and requested_by=nullif(current_setting('app.user_id',true),'')::uuid);

grant select,insert on firm_seat_change_requests to northledger_app;
grant select,update on firm_seat_change_requests to northledger_billing;

commit;
