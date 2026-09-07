begin;

create table company_member_access(
  firm_id uuid not null references firms(id),
  company_id uuid not null references companies(id),
  user_id uuid not null references app_users(id),
  granted_by uuid not null references app_users(id),
  created_at timestamptz not null default now(),
  primary key(company_id,user_id)
);
create index company_member_access_firm_user_idx on company_member_access(firm_id,user_id);

create table firm_invitation_company_access(
  invitation_id uuid not null references firm_invitations(id) on delete cascade,
  firm_id uuid not null references firms(id),
  company_id uuid not null references companies(id),
  primary key(invitation_id,company_id)
);

insert into company_member_access(firm_id,company_id,user_id,granted_by)
select fm.firm_id,c.id,fm.user_id,fm.user_id from firm_memberships fm join companies c on c.firm_id=fm.firm_id
where fm.status='active'and fm.role not in('owner','firm_admin')and c.archived_at is null on conflict do nothing;

create or replace function current_user_company_role(target_firm_id uuid,target_company_id uuid)returns text
language sql stable security definer set search_path=public set row_security=off as $$
  select fm.role from firm_memberships fm join companies c on c.firm_id=fm.firm_id
  where fm.firm_id=target_firm_id and fm.user_id=nullif(current_setting('app.user_id',true),'')::uuid
    and fm.status='active'and c.id=target_company_id and c.archived_at is null
    and(fm.role in('owner','firm_admin')or exists(select 1 from company_member_access ca where ca.firm_id=fm.firm_id and ca.company_id=c.id and ca.user_id=fm.user_id))
$$;

drop policy company_member_select on companies;
create policy company_assigned_member_select on companies for select using(
  firm_id=nullif(current_setting('app.firm_id',true),'')::uuid and current_user_company_role(firm_id,id)is not null);
drop policy audit_member_select on audit_events;
create policy audit_assigned_member_select on audit_events for select using(
  firm_id=nullif(current_setting('app.firm_id',true),'')::uuid and(
    (company_id is null and current_user_firm_role(firm_id)in('owner','firm_admin'))or
    (company_id is not null and current_user_company_role(firm_id,company_id)is not null)));

create or replace function accept_firm_invitation(p_token_hash text,p_email text)
returns table(firm_id uuid,role text)language plpgsql security definer set search_path=public set row_security=off as $$
declare invitation firm_invitations%rowtype;authenticated_user uuid;
begin
  authenticated_user:=nullif(current_setting('app.user_id',true),'')::uuid;if authenticated_user is null then raise exception'authentication required';end if;
  select*into invitation from firm_invitations where token_hash=p_token_hash and accepted_at is null and revoked_at is null and expires_at>now()for update;
  if not found then raise exception'invitation invalid or expired';end if;if invitation.email<>lower(trim(p_email))then raise exception'invitation email mismatch';end if;
  update firm_invitations set accepted_at=now()where id=invitation.id;
  insert into firm_memberships(firm_id,user_id,role,status)values(invitation.firm_id,authenticated_user,invitation.role,'active')
    on conflict(firm_id,user_id)do update set role=excluded.role,status='active',updated_at=now();
  delete from company_member_access where firm_id=invitation.firm_id and user_id=authenticated_user;
  insert into company_member_access(firm_id,company_id,user_id,granted_by)
    select firm_id,company_id,authenticated_user,invitation.invited_by from firm_invitation_company_access where invitation_id=invitation.id;
  insert into audit_events(firm_id,actor_user_id,event_type,entity_type,entity_id,after_state)
    values(invitation.firm_id,authenticated_user,'seat.invitation_accepted','firm_membership',authenticated_user::text,
      jsonb_build_object('role',invitation.role,'email',invitation.email,'companyCount',(select count(*)from firm_invitation_company_access where invitation_id=invitation.id)));
  return query select invitation.firm_id,invitation.role;
end;$$;

alter table company_member_access enable row level security;alter table company_member_access force row level security;
alter table firm_invitation_company_access enable row level security;alter table firm_invitation_company_access force row level security;
create policy company_member_access_admin_all on company_member_access for all
  using(current_user_firm_role(firm_id)in('owner','firm_admin'))with check(current_user_firm_role(firm_id)in('owner','firm_admin'));
create policy company_member_access_self_select on company_member_access for select
  using(user_id=nullif(current_setting('app.user_id',true),'')::uuid);
create policy invitation_company_access_admin_all on firm_invitation_company_access for all
  using(current_user_firm_role(firm_id)in('owner','firm_admin'))with check(current_user_firm_role(firm_id)in('owner','firm_admin'));

grant select,insert,delete on company_member_access,firm_invitation_company_access to northledger_app;

commit;
