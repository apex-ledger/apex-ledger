begin;

-- Run migrations as the database owner. The application must connect as this
-- non-owner role so PostgreSQL row-level security cannot be bypassed.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'northledger_app') then
    create role northledger_app nologin nosuperuser nocreatedb nocreaterole noinherit;
  end if;
end;
$$;

grant usage on schema public to northledger_app;
grant select, insert, update on app_users to northledger_app;
grant select on firms to northledger_app;
grant select on firm_memberships to northledger_app;
grant select, insert, update on companies to northledger_app;
grant select, insert on audit_events to northledger_app;
grant select, insert, update, delete on idempotency_keys to northledger_app;
grant select, insert, update on realtime_outbox to northledger_app;
grant usage, select on all sequences in schema public to northledger_app;

revoke update, delete, truncate on audit_events from northledger_app;
revoke create on schema public from public;

commit;
