begin;

create table firm_invitations (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id),
  email text not null check (email = lower(email)),
  role text not null check (role in ('owner', 'firm_admin', 'accountant', 'bookkeeper', 'payroll', 'viewer')),
  token_hash text not null unique check (length(token_hash) = 64),
  invited_by uuid not null references app_users(id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (accepted_at is null or revoked_at is null)
);
create unique index firm_invitations_pending_email_idx
on firm_invitations(firm_id, email)
where accepted_at is null and revoked_at is null;
create index firm_invitations_firm_idx on firm_invitations(firm_id, created_at desc);

create or replace function current_user_firm_role(target_firm_id uuid) returns text
language sql stable security definer
set search_path = public
set row_security = off
as $$
  select role
  from firm_memberships
  where firm_id = target_firm_id
    and user_id = nullif(current_setting('app.user_id', true), '')::uuid
    and status = 'active'
$$;

drop policy membership_self_select on firm_memberships;
create policy membership_authorized_select on firm_memberships for select
using (
  user_id = nullif(current_setting('app.user_id', true), '')::uuid
  or current_user_firm_role(firm_id) in ('owner', 'firm_admin')
);

alter table firm_invitations enable row level security;
alter table firm_invitations force row level security;
create policy invitation_admin_select on firm_invitations for select
using (
  firm_id = nullif(current_setting('app.firm_id', true), '')::uuid
  and current_user_firm_role(firm_id) in ('owner', 'firm_admin')
);
create policy invitation_admin_insert on firm_invitations for insert
with check (
  firm_id = nullif(current_setting('app.firm_id', true), '')::uuid
  and invited_by = nullif(current_setting('app.user_id', true), '')::uuid
  and current_user_firm_role(firm_id) in ('owner', 'firm_admin')
);
create policy invitation_admin_update on firm_invitations for update
using (
  firm_id = nullif(current_setting('app.firm_id', true), '')::uuid
  and current_user_firm_role(firm_id) in ('owner', 'firm_admin')
)
with check (
  firm_id = nullif(current_setting('app.firm_id', true), '')::uuid
  and current_user_firm_role(firm_id) in ('owner', 'firm_admin')
);

create or replace function enforce_firm_seat_limit() returns trigger
language plpgsql as $$
declare
  allowed_seats integer;
  occupied_seats integer;
  pending_seats integer;
begin
  if new.status not in ('invited', 'active') then return new; end if;
  select seat_limit into allowed_seats from firms where id = new.firm_id for update;
  select count(*) into occupied_seats
  from firm_memberships
  where firm_id = new.firm_id
    and status in ('invited', 'active')
    and user_id <> new.user_id;
  select count(*) into pending_seats
  from firm_invitations
  where firm_id = new.firm_id
    and accepted_at is null and revoked_at is null and expires_at > now();
  if occupied_seats + pending_seats >= allowed_seats then
    raise exception 'firm seat limit reached' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create or replace function enforce_invitation_seat_limit() returns trigger
language plpgsql as $$
declare
  allowed_seats integer;
  occupied_seats integer;
  pending_seats integer;
begin
  if new.accepted_at is not null or new.revoked_at is not null then return new; end if;
  select seat_limit into allowed_seats from firms where id = new.firm_id for update;
  select count(*) into occupied_seats
  from firm_memberships
  where firm_id = new.firm_id and status in ('invited', 'active');
  select count(*) into pending_seats
  from firm_invitations
  where firm_id = new.firm_id
    and accepted_at is null and revoked_at is null and expires_at > now()
    and id <> new.id;
  if occupied_seats + pending_seats >= allowed_seats then
    raise exception 'firm seat limit reached' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger firm_invitation_seat_limit
before insert or update of firm_id, accepted_at, revoked_at, expires_at on firm_invitations
for each row execute function enforce_invitation_seat_limit();

create or replace function accept_firm_invitation(p_token_hash text, p_email text)
returns table (firm_id uuid, role text)
language plpgsql security definer
set search_path = public
set row_security = off
as $$
declare
  invitation firm_invitations%rowtype;
  authenticated_user uuid;
begin
  authenticated_user := nullif(current_setting('app.user_id', true), '')::uuid;
  if authenticated_user is null then raise exception 'authentication required'; end if;

  select * into invitation
  from firm_invitations
  where token_hash = p_token_hash
    and accepted_at is null and revoked_at is null and expires_at > now()
  for update;
  if not found then raise exception 'invitation invalid or expired'; end if;
  if invitation.email <> lower(trim(p_email)) then raise exception 'invitation email mismatch'; end if;

  update firm_invitations set accepted_at = now() where id = invitation.id;
  insert into firm_memberships(firm_id, user_id, role, status)
  values (invitation.firm_id, authenticated_user, invitation.role, 'active')
  on conflict (firm_id, user_id) do update
  set role = excluded.role, status = 'active', updated_at = now();

  insert into audit_events(firm_id, actor_user_id, event_type, entity_type, entity_id, after_state)
  values (invitation.firm_id, authenticated_user, 'seat.invitation_accepted', 'firm_membership', authenticated_user::text,
    jsonb_build_object('role', invitation.role, 'email', invitation.email));

  return query select invitation.firm_id, invitation.role;
end;
$$;

create or replace function suspend_firm_membership(p_firm_id uuid, p_target_user_id uuid)
returns void
language plpgsql security definer
set search_path = public
set row_security = off
as $$
declare
  actor_user uuid;
  actor_role text;
  target_role text;
begin
  actor_user := nullif(current_setting('app.user_id', true), '')::uuid;
  select role into actor_role from firm_memberships
  where firm_id = p_firm_id and user_id = actor_user and status = 'active';
  if actor_role not in ('owner', 'firm_admin') then raise exception 'firm administration required'; end if;
  if actor_user = p_target_user_id then raise exception 'cannot suspend your own seat'; end if;

  select role into target_role from firm_memberships
  where firm_id = p_firm_id and user_id = p_target_user_id and status = 'active'
  for update;
  if not found then raise exception 'active membership not found'; end if;
  if target_role = 'owner' then raise exception 'transfer ownership before suspending this seat'; end if;

  update firm_memberships set status = 'suspended', updated_at = now()
  where firm_id = p_firm_id and user_id = p_target_user_id;
  insert into audit_events(firm_id, actor_user_id, event_type, entity_type, entity_id, before_state, after_state)
  values (p_firm_id, actor_user, 'seat.suspended', 'firm_membership', p_target_user_id::text,
    jsonb_build_object('role', target_role, 'status', 'active'),
    jsonb_build_object('role', target_role, 'status', 'suspended'));
end;
$$;

grant select, insert, update on firm_invitations to northledger_app;
revoke all on function current_user_firm_role(uuid) from public;
revoke all on function accept_firm_invitation(text, text) from public;
revoke all on function suspend_firm_membership(uuid, uuid) from public;
grant execute on function current_user_firm_role(uuid) to northledger_app;
grant execute on function accept_firm_invitation(text, text) to northledger_app;
grant execute on function suspend_firm_membership(uuid, uuid) to northledger_app;

commit;
