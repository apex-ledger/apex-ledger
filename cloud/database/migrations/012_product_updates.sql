begin;

create or replace function update_product_service_version() returns trigger language plpgsql as $$
begin new.version:=old.version+1;new.updated_at:=now();return new;end; $$;
create trigger product_service_version before update on products_services
for each row execute function update_product_service_version();

create or replace function publish_product_service() returns trigger language plpgsql security definer
set search_path=public set row_security=off as $$
begin insert into realtime_outbox(firm_id,company_id,topic,payload) values(new.firm_id,new.company_id,
  case when tg_op='INSERT' then 'product.created' else 'product.updated' end,
  jsonb_build_object('productId',new.id,'version',new.version));return new;end; $$;
create trigger product_service_outbox after insert or update on products_services
for each row execute function publish_product_service();

revoke all on function update_product_service_version() from public;
revoke all on function publish_product_service() from public;

commit;
