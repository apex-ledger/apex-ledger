begin;

create table company_contacts (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references firms(id),
  company_id uuid not null references companies(id),
  contact_type text not null check (contact_type in ('customer', 'vendor', 'both')),
  entity_type text not null default 'business' check (entity_type in ('business', 'person')),
  display_name text not null check (length(trim(display_name)) > 0),
  company_name text,
  first_name text,
  last_name text,
  email text,
  phone text,
  phone_normalized text generated always as (regexp_replace(coalesce(phone, ''), '[^0-9]+', '', 'g')) stored,
  address_line1 text,
  address_line2 text,
  city text,
  province text,
  postal_code text,
  date_of_birth date,
  sin_lookup_hash char(64),
  sin_last_four char(4),
  notes text,
  active boolean not null default true,
  version bigint not null default 1,
  created_by uuid not null references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  check ((sin_lookup_hash is null and sin_last_four is null)
      or (sin_lookup_hash is not null and sin_last_four ~ '^[0-9]{4}$'))
);
create unique index company_contacts_sin_unique_idx
on company_contacts(company_id, sin_lookup_hash) where sin_lookup_hash is not null and active = true;
create index company_contacts_company_name_idx
on company_contacts(company_id, lower(display_name)) where active = true;
create index company_contacts_company_phone_idx
on company_contacts(company_id, phone_normalized) where active = true and phone_normalized <> '';
create index company_contacts_company_dob_idx
on company_contacts(company_id, date_of_birth) where active = true and date_of_birth is not null;

create or replace function update_company_contact_version() returns trigger
language plpgsql as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$$;
create trigger company_contact_version
before update on company_contacts
for each row execute function update_company_contact_version();

create or replace function publish_company_contact() returns trigger
language plpgsql security definer
set search_path = public
set row_security = off
as $$
begin
  insert into realtime_outbox(firm_id, company_id, topic, payload)
  values (new.firm_id, new.company_id,
    case when tg_op = 'INSERT' then 'contact.created' else 'contact.updated' end,
    jsonb_build_object('contactId', new.id, 'contactType', new.contact_type, 'version', new.version));
  return new;
end;
$$;
create trigger company_contact_outbox
after insert or update on company_contacts
for each row execute function publish_company_contact();

alter table company_contacts enable row level security;
alter table company_contacts force row level security;
create policy company_contact_isolation on company_contacts
using (
  firm_id = nullif(current_setting('app.firm_id', true), '')::uuid
  and company_id = nullif(current_setting('app.company_id', true), '')::uuid
)
with check (
  firm_id = nullif(current_setting('app.firm_id', true), '')::uuid
  and company_id = nullif(current_setting('app.company_id', true), '')::uuid
);

grant select, insert, update on company_contacts to northledger_app;
revoke all on function publish_company_contact() from public;
revoke all on function update_company_contact_version() from public;

commit;
