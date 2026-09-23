-- 003_backend_contract.sql
-- Bridge migration: align the 001 schema with the Edge Function contract
-- (supabase/functions/*, documented in supabase/README.md).
-- Nothing here weakens RLS: all changes are additive columns / a service_role-only RPC.

-- 1) webhooks: single raw signing secret for webhook-dispatcher (service_role reads it).
--    Members can SET it (insert/update, for rotation) but never SELECT it back —
--    same posture as api_keys.key_hash. The old app-layer-encrypted column is
--    dropped: one source of truth, used only server-side for HMAC signing.
alter table public.webhooks
  add column if not exists secret text,
  add column if not exists disabled_reason text;
alter table public.webhooks drop column if exists secret_encrypted;
comment on column public.webhooks.secret is
  'Raw HMAC signing secret. Writable by workspace admins/developers (rotation), never selectable via the API; read by the webhook-dispatcher Edge Function via service_role.';
grant insert (workspace_id, property_id, url, secret, events, enabled)
  on public.webhooks to authenticated;
grant update (url, secret, events, enabled, auto_disable, consecutive_failures)
  on public.webhooks to authenticated;

-- 2) webhook_deliveries: columns the dispatcher reads/writes.
alter table public.webhook_deliveries
  add column if not exists property_id uuid references public.properties(id) on delete cascade,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists latency_ms integer,
  add column if not exists last_error text,
  add column if not exists claimed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

-- Backfill workspace_id from the parent webhook so the NOT NULL constraint holds
-- even when the dispatcher enqueues without it.
create or replace function public.webhook_delivery_backfill_workspace()
returns trigger language plpgsql as $$
begin
  if new.workspace_id is null then
    select w.workspace_id into new.workspace_id
    from public.webhooks w where w.id = new.webhook_id;
  end if;
  return new;
end $$;
drop trigger if exists trg_webhook_delivery_workspace on public.webhook_deliveries;
create trigger trg_webhook_delivery_workspace
  before insert on public.webhook_deliveries
  for each row execute function public.webhook_delivery_backfill_workspace();

-- Keep the updated_at convention (the dispatcher also sets it explicitly).
drop trigger if exists trg_webhook_deliveries_touch on public.webhook_deliveries;
create trigger trg_webhook_deliveries_touch
  before update on public.webhook_deliveries
  for each row execute function public.touch_updated_at();

create index if not exists webhook_deliveries_claim_idx
  on public.webhook_deliveries (status, next_attempt_at)
  where status in ('pending','failed');

-- 3) tickets: breach flag for sla-checker (idempotent re-check).
alter table public.tickets
  add column if not exists sla_breached boolean not null default false;
create index if not exists tickets_sla_breach_idx
  on public.tickets (sla_due) where sla_breached = false and sla_due is not null;

-- 4) Concurrency-safe claim RPC for the dispatcher retry sweeper.
--    Service-role only: dispatchers run with the service_role key.
create or replace function public.claim_pending_webhook_deliveries(batch_size int default 50)
returns setof public.webhook_deliveries
language plpgsql security definer
set search_path = public
as $$
begin
  return query
  update public.webhook_deliveries d set claimed_at = now()
  where d.id in (
    select id from public.webhook_deliveries
    where status in ('pending','failed')
      and next_attempt_at <= now()
      and (claimed_at is null or claimed_at < now() - interval '10 minutes')
    order by next_attempt_at asc
    limit batch_size
    for update skip locked
  )
  returning d.*;
end $$;
revoke all on function public.claim_pending_webhook_deliveries(int) from anon, authenticated;
