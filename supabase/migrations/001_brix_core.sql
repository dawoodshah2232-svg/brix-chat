-- ============================================================================
-- Brix Chat — 001 core schema
--
-- Supabase/Postgres migration. Creates every Brix Chat entity (workspaces,
-- properties, members, departments, conversations, messages, visitors,
-- contacts, tickets, campaigns, ratings, KB, canned responses, triggers,
-- webhooks, API keys, audit log, branding, integrations + supporting tables),
-- with UUID primary keys, created_at/updated_at + touch_updated_at() trigger,
-- indexes, and Row Level Security on every table.
--
-- Design notes (see supabase/migrations/README.md):
--  * Enum-like fields are TEXT + CHECK constraints (easier to extend than PG
--    enums — no new migration needed to add a value).
--  * workspace_id is denormalized onto every tenant table so RLS is one hop.
--  * Secrets are never in readable columns: member passcode hashes live in
--    member_credentials (zero grants to anon/authenticated, RPC access only);
--    api_keys.key_hash and webhooks.secret are excluded from the
--    authenticated SELECT column grants.
--  * anon gets EXECUTE on the widget_* RPCs only — no direct table access.
-- ============================================================================

-- Extensions ---------------------------------------------------------------
create extension if not exists "pgcrypto" with schema public;

-- updated_at helper ----------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- Tables
-- ============================================================================

-- Workspaces -----------------------------------------------------------------
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Properties (websites) --------------------------------------------------------
create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  domain text not null default '',
  public_key text not null unique,            -- bx_... public widget identifier
  secure_mode boolean not null default false, -- HMAC identity verification
  widget_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint properties_public_key_format check (public_key like 'bx\_%')
);

-- Contacts ---------------------------------------------------------------------
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  property_id uuid references public.properties(id) on delete cascade,
  name text not null,
  email text not null default '',
  phone text not null default '',
  country text not null default '',
  tags text[] not null default '{}',
  notes text not null default '',
  source text not null default 'chat',
  chats_count integer not null default 0,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Members (workspace membership; roles admin/agent/developer/viewer) ------------
create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  auth_user_id uuid unique,                   -- link to auth.users (Supabase Auth)
  display_name text not null,
  initials text not null default '',
  color text not null default '#4f46e5',
  role text not null default 'agent',
  email text not null default '',
  job_title text not null default '',
  avatar_url text,
  status text not null default 'offline',
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint members_role_check check (role in ('admin','agent','developer','viewer')),
  constraint members_status_check check (status in ('online','away','offline'))
);
create unique index if not exists members_workspace_display_name_uniq
  on public.members (workspace_id, lower(display_name));

-- Member credentials: passcode bcrypt hashes. NEVER readable via the API.
-- No grants are issued on this table to anon/authenticated; only the
-- SECURITY DEFINER RPCs (member_login, member_set_passcode) touch it.
create table if not exists public.member_credentials (
  member_id uuid primary key references public.members(id) on delete cascade,
  passcode_hash text not null,
  updated_at timestamptz not null default now()
);

-- Departments -------------------------------------------------------------------
create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  name text not null,
  description text not null default '',
  routing_mode text not null default 'round-robin',
  hours_override jsonb,                       -- [{day, open, close}] or null
  offline_behavior text not null default 'message',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint departments_routing_mode_check
    check (routing_mode in ('round-robin','least-busy','first-available')),
  constraint departments_offline_behavior_check
    check (offline_behavior in ('ticket','message','hide'))
);

create table if not exists public.department_members (
  department_id uuid not null references public.departments(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (department_id, member_id)
);

-- Conversations -------------------------------------------------------------------
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  visitor_name text not null default 'Guest',
  visitor_email text not null default '',
  page_url text not null default '',
  referrer text not null default '',
  status text not null default 'open',
  department_id uuid references public.departments(id) on delete set null,
  assignee_id uuid references public.members(id) on delete set null,
  tags text[] not null default '{}',
  priority text not null default 'medium',
  rating smallint,
  unread integer not null default 0,
  ai_handled boolean not null default false,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_status_check check (status in ('open','closed','spam','missed')),
  constraint conversations_priority_check check (priority in ('low','medium','high','urgent')),
  constraint conversations_rating_check check (rating is null or (rating between 1 and 5))
);

-- Messages -------------------------------------------------------------------------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender text not null,                       -- visitor | agent | ai | system
  kind text not null default 'text',           -- text | file | voice | rating
  text text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint messages_sender_check check (sender in ('visitor','agent','ai','system')),
  constraint messages_kind_check check (kind in ('text','file','voice','rating'))
);

-- Internal notes on conversations ---------------------------------------------------
create table if not exists public.conversation_notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  author_member_id uuid references public.members(id) on delete set null,
  author_name text not null default '',
  text text not null,
  created_at timestamptz not null default now()
);

-- Visitors (live visitor monitoring) --------------------------------------------------
create table if not exists public.visitors (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  name text not null default 'Guest',
  email text not null default '',
  page_url text not null default '',
  pages integer not null default 1,
  country text not null default '',
  city text not null default '',
  device text not null default '',
  browser text not null default '',
  time_on_site_sec integer not null default 0,
  typing_preview text,
  online boolean not null default true,
  custom_attributes jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Contact timeline events (chat, ticket, campaign, note, tag) ---------------------------
create table if not exists public.contact_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  kind text not null,                          -- chat | ticket | campaign | note | tag
  title text not null,
  body text not null default '',
  related_id uuid,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Goals & goal events (attribution) -----------------------------------------------------
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  property_id uuid references public.properties(id) on delete cascade,
  name text not null,
  event text not null,
  revenue numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.goal_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  goal_id uuid not null references public.goals(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  value numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

-- Campaigns (proactive / outbound) --------------------------------------------------------
create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  name text not null,
  audience text not null default '',
  message text not null default '',
  schedule text not null default '',
  status text not null default 'draft',
  scheduled_at timestamptz,
  audience_rules jsonb,                       -- {urlContains, visitorType, tags[]}
  goal_id uuid references public.goals(id) on delete set null,
  sent_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaigns_status_check check (status in ('draft','scheduled','sent'))
);

-- Tickets (with SLA fields) ----------------------------------------------------------------
create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  property_id uuid references public.properties(id) on delete cascade,
  subject text not null,
  message text not null default '',
  requester_name text not null default 'Guest',
  requester_email text not null default '',
  status text not null default 'new',
  priority text not null default 'medium',
  assignee_id uuid references public.members(id) on delete set null,
  sla_due timestamptz,
  sla_breach_notified boolean not null default false,
  conversation_id uuid references public.conversations(id) on delete set null,
  tags text[] not null default '{}',
  category_id uuid,                            -- references ticket_categories (added below)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tickets_status_check check (status in ('new','open','resolved')),
  constraint tickets_priority_check check (priority in ('low','medium','high','urgent'))
);

-- Ratings / feedback (CSAT 1-5, NPS 0-10) -----------------------------------------------------
create table if not exists public.ratings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  member_id uuid references public.members(id) on delete set null,  -- rated agent
  kind text not null,                           -- csat | nps
  score smallint not null,
  comment text not null default '',
  created_at timestamptz not null default now(),
  constraint ratings_kind_check check (kind in ('csat','nps')),
  constraint ratings_score_check check (
    (kind = 'csat' and score between 1 and 5) or
    (kind = 'nps' and score between 0 and 10)
  )
);

-- Knowledge base -----------------------------------------------------------------------------
create table if not exists public.kb_categories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  property_id uuid references public.properties(id) on delete cascade,
  name text not null,
  color text not null default '#4f46e5',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.kb_articles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  property_id uuid references public.properties(id) on delete cascade,
  category_id uuid references public.kb_categories(id) on delete set null,
  title text not null,
  slug text not null,
  body text not null default '',
  status text not null default 'draft',
  views integer not null default 0,
  helpful integer not null default 0,
  not_helpful integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kb_articles_status_check check (status in ('draft','published'))
);
create unique index if not exists kb_articles_workspace_slug_uniq
  on public.kb_articles (workspace_id, slug);

-- Canned responses ----------------------------------------------------------------------------
create table if not exists public.canned_categories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  property_id uuid references public.properties(id) on delete cascade,
  name text not null,
  color text not null default '#4f46e5',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.canned_responses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  property_id uuid references public.properties(id) on delete cascade,
  category_id uuid references public.canned_categories(id) on delete set null,
  shortcut text not null default '',
  title text not null,
  body text not null,
  shared boolean not null default true,        -- false = personal to owner_member_id
  owner_member_id uuid references public.members(id) on delete set null,
  usage_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ticket categories (matches ApiCategory scope 'tickets') ---------------------------------------
create table if not exists public.ticket_categories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  property_id uuid references public.properties(id) on delete cascade,
  name text not null,
  color text not null default '#4f46e5',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- tickets.category_id FK (deferred: ticket_categories is created after tickets)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tickets_category_id_fkey'
  ) then
    alter table public.tickets
      add constraint tickets_category_id_fkey
      foreign key (category_id) references public.ticket_categories(id)
      on delete set null;
  end if;
end $$;

-- Triggers / workflow rules ----------------------------------------------------------------------
create table if not exists public.triggers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  name text not null,
  kind text not null default 'proactive',      -- proactive | routing (legacy rule shape)
  event text not null default 'chat.started',  -- chat.started | message.received | visitor.idle | page.viewed | chat.missed | ...
  condition_groups jsonb not null default '[]'::jsonb,  -- [{op:'and'|'or', conditions:[{field,op,value}]}]
  actions jsonb not null default '[]'::jsonb,            -- [{kind:'message'|'assign'|'tag'|'priority'|'campaign'|'ticket', value}]
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint triggers_kind_check check (kind in ('proactive','routing'))
);

-- Notifications (in-app bell) ----------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  member_id uuid references public.members(id) on delete cascade,  -- null = workspace broadcast
  type text not null,                            -- chat.assigned | ticket.sla | ticket.created | campaign.sent | mention | system
  title text not null,
  body text not null default '',
  link text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- Saved inbox views -----------------------------------------------------------------------------------
create table if not exists public.saved_views (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  member_id uuid references public.members(id) on delete cascade,  -- null = shared view
  name text not null,
  filters jsonb not null default '{}'::jsonb,   -- {status, priority, tag, assignee, unreadOnly}
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Plays (multi-step macros) ------------------------------------------------------------------------------
create table if not exists public.plays (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  steps jsonb not null default '[]'::jsonb,     -- [{kind:'reply'|'tag'|'assign'|'priority'|'note', value}]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Unanswered questions (knowledge-gap loop) -------------------------------------------------------------------
create table if not exists public.unanswered_questions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  property_id uuid references public.properties(id) on delete cascade,
  question text not null,
  conversation_id uuid references public.conversations(id) on delete set null,
  count integer not null default 1,
  dismissed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Webhooks ------------------------------------------------------------------------------------------------------
create table if not exists public.webhooks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  url text not null,
  secret_encrypted text not null,               -- app-layer encrypted; never returned after creation
  events text[] not null default '{}',
  enabled boolean not null default true,
  auto_disable boolean not null default true,
  consecutive_failures integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  webhook_id uuid not null references public.webhooks(id) on delete cascade,
  event text not null,
  event_id text not null,                       -- stable UUID across retries (idempotent receivers)
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  http_status integer,
  attempts integer not null default 0,
  next_attempt_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  constraint webhook_deliveries_status_check check (status in ('pending','delivered','failed','dead','test'))
);
create unique index if not exists webhook_deliveries_webhook_event_uniq
  on public.webhook_deliveries (webhook_id, event_id);

-- API keys: store ONLY the SHA-256 hash + prefix. The raw key is shown once
-- at creation and never persisted anywhere. -----------------------------------------------------------
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  prefix text not null,                          -- e.g. bk_live_1a2b3c — safe to display
  key_hash text not null,                        -- SHA-256 hex of the raw key
  scopes text[] not null default '{}',
  revoked boolean not null default false,
  usage_count bigint not null default 0,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Audit log ---------------------------------------------------------------------------------------------------------
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_member_id uuid references public.members(id) on delete set null,
  actor_name text not null default 'system',
  action text not null,
  entity text not null default '',
  entity_id text not null default '',
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Branding (per property) ----------------------------------------------------------------------------------------------
create table if not exists public.branding (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  property_id uuid not null unique references public.properties(id) on delete cascade,
  brand_name text not null default '',
  tagline text not null default '',
  logo_url text,
  theme text not null default 'light',
  accent_color text not null default '#4f46e5',
  widget_color text not null default '#4f46e5',
  widget_position text not null default 'bottom-right',
  launcher_style text not null default 'bubble',
  language text not null default 'en',
  subdomain text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint branding_theme_check check (theme in ('light','dark')),
  constraint branding_widget_position_check check (widget_position in ('bottom-right','bottom-left')),
  constraint branding_launcher_style_check check (launcher_style in ('bubble','bar'))
);

-- Property settings (business hours, pre-chat/offline forms, blocked list, ...) ------------------------------------------
create table if not exists public.property_settings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  property_id uuid not null unique references public.properties(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  -- {greeting_online, greeting_away, greeting_offline, offline_form_enabled,
  --  offline_form_fields[], prechat_enabled, prechat_fields[], business_hours[],
  --  timezone, blocked[], booking_url}
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Integrations (provider registry state) --------------------------------------------------------------------------------------
create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null,                        -- openai | anthropic | whatsapp | twilio | resend | slack | shopify | wordpress | zapier | google_calendar
  name text not null,
  config jsonb not null default '{}'::jsonb,     -- secret values MUST be app-layer encrypted before insert
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integrations_workspace_provider_uniq unique (workspace_id, provider)
);

-- ============================================================================
-- Indexes
-- ============================================================================

create index if not exists properties_workspace_idx        on public.properties (workspace_id);
create index if not exists contacts_workspace_idx          on public.contacts (workspace_id);
create index if not exists contacts_workspace_email_idx    on public.contacts (workspace_id, email);
create index if not exists members_workspace_idx           on public.members (workspace_id);
create index if not exists departments_property_idx       on public.departments (property_id);
create index if not exists department_members_member_idx   on public.department_members (member_id);

create index if not exists conversations_workspace_idx         on public.conversations (workspace_id);
create index if not exists conversations_property_idx         on public.conversations (property_id);
create index if not exists conversations_status_idx           on public.conversations (status);
create index if not exists conversations_assignee_idx         on public.conversations (assignee_id) where assignee_id is not null;
create index if not exists conversations_workspace_updated_idx on public.conversations (workspace_id, updated_at desc);

create index if not exists messages_conversation_idx       on public.messages (conversation_id, created_at);
create index if not exists conversation_notes_conv_idx     on public.conversation_notes (conversation_id);
create index if not exists visitors_property_seen_idx      on public.visitors (property_id, last_seen_at desc);
create index if not exists visitors_workspace_idx          on public.visitors (workspace_id);
create index if not exists contact_events_contact_idx      on public.contact_events (contact_id, occurred_at desc);

create index if not exists goals_workspace_idx             on public.goals (workspace_id);
create index if not exists goal_events_goal_idx             on public.goal_events (goal_id, created_at desc);
create index if not exists campaigns_property_status_idx   on public.campaigns (property_id, status);

create index if not exists tickets_workspace_status_idx    on public.tickets (workspace_id, status);
create index if not exists tickets_property_idx            on public.tickets (property_id);
create index if not exists tickets_priority_idx            on public.tickets (priority);
create index if not exists tickets_sla_due_idx              on public.tickets (sla_due) where sla_due is not null;
create index if not exists tickets_assignee_idx             on public.tickets (assignee_id) where assignee_id is not null;

create index if not exists ratings_property_created_idx    on public.ratings (property_id, created_at desc);
create index if not exists ratings_workspace_idx           on public.ratings (workspace_id);

create index if not exists kb_categories_property_idx      on public.kb_categories (property_id);
create index if not exists kb_articles_property_status_idx on public.kb_articles (property_id, status);
create index if not exists canned_categories_property_idx  on public.canned_categories (property_id);
create index if not exists canned_responses_property_idx    on public.canned_responses (property_id);
create index if not exists ticket_categories_property_idx  on public.ticket_categories (property_id);

create index if not exists triggers_property_enabled_idx   on public.triggers (property_id, enabled);
create index if not exists notifications_workspace_idx     on public.notifications (workspace_id, created_at desc);
create index if not exists notifications_member_idx        on public.notifications (member_id) where member_id is not null;
create index if not exists saved_views_workspace_idx       on public.saved_views (workspace_id);
create index if not exists plays_workspace_idx             on public.plays (workspace_id);
create index if not exists unanswered_workspace_idx        on public.unanswered_questions (workspace_id);

create index if not exists webhooks_property_idx           on public.webhooks (property_id);
create index if not exists webhook_deliveries_webhook_idx   on public.webhook_deliveries (webhook_id, created_at desc);
create index if not exists webhook_deliveries_retry_idx     on public.webhook_deliveries (next_attempt_at)
  where status in ('pending','failed') and next_attempt_at is not null;

create index if not exists api_keys_workspace_idx          on public.api_keys (workspace_id);
create index if not exists audit_log_workspace_created_idx on public.audit_log (workspace_id, created_at desc);
create index if not exists audit_log_action_idx            on public.audit_log (workspace_id, action);

create index if not exists branding_property_idx           on public.branding (property_id);
create index if not exists property_settings_property_idx  on public.property_settings (property_id);
create index if not exists integrations_workspace_idx      on public.integrations (workspace_id);

-- ============================================================================
-- updated_at triggers
-- ============================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'workspaces','properties','contacts','members','member_credentials','departments',
    'conversations','visitors','goals','campaigns','tickets',
    'kb_categories','kb_articles','canned_categories','canned_responses','ticket_categories',
    'triggers','saved_views','plays','unanswered_questions',
    'webhooks','api_keys','branding','property_settings','integrations'
  ]
  loop
    execute format('drop trigger if exists trg_touch_updated_at on public.%I', t);
    execute format(
      'create trigger trg_touch_updated_at before update on public.%I ' ||
      'for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- ============================================================================
-- Row Level Security — enable on EVERY table
-- ============================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'workspaces','properties','contacts','members','member_credentials','departments',
    'department_members','conversations','messages','conversation_notes','visitors',
    'contact_events','goals','goal_events','campaigns','tickets','ratings',
    'kb_categories','kb_articles','canned_categories','canned_responses','ticket_categories',
    'triggers','notifications','saved_views','plays','unanswered_questions',
    'webhooks','webhook_deliveries','api_keys','audit_log','branding',
    'property_settings','integrations'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ============================================================================
-- RLS helper functions (SECURITY DEFINER so policies never recurse into RLS)
-- ============================================================================

-- The member row of the currently authenticated user (via auth.users link).
create or replace function public.current_member_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.id
  from public.members m
  where m.auth_user_id = nullif(auth.jwt() ->> 'sub', '')::uuid
  limit 1;
$$;

-- The caller's role inside a given workspace (null when not a member).
create or replace function public.current_member_role(p_workspace_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select m.role
  from public.members m
  where m.id = public.current_member_id()
    and m.workspace_id = p_workspace_id
  limit 1;
$$;

create or replace function public.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.members m
    where m.id = public.current_member_id()
      and m.workspace_id = p_workspace_id
  );
$$;

-- ============================================================================
-- RLS policies
--
-- Patterns:
--  A (chat content)      read: admin/agent/viewer      write: admin/agent
--  B (operational)       read: any member              write: admin/agent/developer
--  C (structural/admin)  per-table below
-- Developers are intentionally excluded from chat-content reads (they manage
-- keys/webhooks, not conversations). Viewers are read-only everywhere.
-- ============================================================================

do $$
declare
  t text;
begin
  -- Pattern A ----------------------------------------------------------------
  foreach t in array array[
    'conversations','messages','conversation_notes','visitors','contacts','contact_events'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || ' read', t);
    execute format(
      'create policy %I on public.%I for select to authenticated ' ||
      'using (public.current_member_role(workspace_id) in (''admin'',''agent'',''viewer''))',
      t || ' read', t);
    execute format('drop policy if exists %I on public.%I', t || ' insert', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated ' ||
      'with check (public.current_member_role(workspace_id) in (''admin'',''agent''))',
      t || ' insert', t);
    execute format('drop policy if exists %I on public.%I', t || ' update', t);
    execute format(
      'create policy %I on public.%I for update to authenticated ' ||
      'using (public.current_member_role(workspace_id) in (''admin'',''agent'')) ' ||
      'with check (public.current_member_role(workspace_id) in (''admin'',''agent''))',
      t || ' update', t);
    execute format('drop policy if exists %I on public.%I', t || ' delete', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated ' ||
      'using (public.current_member_role(workspace_id) in (''admin'',''agent''))',
      t || ' delete', t);
  end loop;

  -- Pattern B ----------------------------------------------------------------
  foreach t in array array[
    'goals','goal_events','campaigns','tickets','ratings',
    'kb_categories','kb_articles','canned_categories','canned_responses','ticket_categories',
    'triggers','plays','saved_views','unanswered_questions'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || ' read', t);
    execute format(
      'create policy %I on public.%I for select to authenticated ' ||
      'using (public.is_workspace_member(workspace_id))',
      t || ' read', t);
    execute format('drop policy if exists %I on public.%I', t || ' insert', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated ' ||
      'with check (public.current_member_role(workspace_id) in (''admin'',''agent'',''developer''))',
      t || ' insert', t);
    execute format('drop policy if exists %I on public.%I', t || ' update', t);
    execute format(
      'create policy %I on public.%I for update to authenticated ' ||
      'using (public.current_member_role(workspace_id) in (''admin'',''agent'',''developer'')) ' ||
      'with check (public.current_member_role(workspace_id) in (''admin'',''agent'',''developer''))',
      t || ' update', t);
    execute format('drop policy if exists %I on public.%I', t || ' delete', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated ' ||
      'using (public.current_member_role(workspace_id) in (''admin'',''agent'',''developer''))',
      t || ' delete', t);
  end loop;
end $$;

-- Workspaces: readable by members; creatable by any signed-in user (bootstrap
-- uses the create_workspace() RPC); managed by workspace admins.
drop policy if exists "workspaces read" on public.workspaces;
create policy "workspaces read" on public.workspaces
  for select to authenticated using (public.is_workspace_member(id));
drop policy if exists "workspaces insert" on public.workspaces;
create policy "workspaces insert" on public.workspaces
  for insert to authenticated with check (true);
drop policy if exists "workspaces update" on public.workspaces;
create policy "workspaces update" on public.workspaces
  for update to authenticated
  using (public.current_member_role(id) = 'admin')
  with check (public.current_member_role(id) = 'admin');
drop policy if exists "workspaces delete" on public.workspaces;
create policy "workspaces delete" on public.workspaces
  for delete to authenticated using (public.current_member_role(id) = 'admin');

-- Properties: readable by members; admin-managed.
drop policy if exists "properties read" on public.properties;
create policy "properties read" on public.properties
  for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists "properties write" on public.properties;
create policy "properties write" on public.properties
  for all to authenticated
  using (public.current_member_role(workspace_id) = 'admin')
  with check (public.current_member_role(workspace_id) = 'admin');

-- Members: readable by members (passcode_hash lives in member_credentials,
-- which has NO policies and NO grants — never exposed); admin-managed.
-- Self status changes go through the member_set_status() RPC.
drop policy if exists "members read" on public.members;
create policy "members read" on public.members
  for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists "members write" on public.members;
create policy "members write" on public.members
  for all to authenticated
  using (public.current_member_role(workspace_id) = 'admin')
  with check (public.current_member_role(workspace_id) = 'admin');

-- member_credentials: intentionally NO policies — deny-all for anon/authenticated.
-- Only SECURITY DEFINER RPCs (member_login, member_set_passcode) read/write it.

-- Departments: readable by members; admin-managed.
drop policy if exists "departments read" on public.departments;
create policy "departments read" on public.departments
  for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists "departments write" on public.departments;
create policy "departments write" on public.departments
  for all to authenticated
  using (public.current_member_role(workspace_id) = 'admin')
  with check (public.current_member_role(workspace_id) = 'admin');

drop policy if exists "department_members read" on public.department_members;
create policy "department_members read" on public.department_members
  for select to authenticated
  using (exists (
    select 1 from public.departments d
    where d.id = department_members.department_id
      and public.is_workspace_member(d.workspace_id)
  ));
drop policy if exists "department_members write" on public.department_members;
create policy "department_members write" on public.department_members
  for all to authenticated
  using (exists (
    select 1 from public.departments d
    where d.id = department_members.department_id
      and public.current_member_role(d.workspace_id) = 'admin'
  ))
  with check (exists (
    select 1 from public.departments d
    where d.id = department_members.department_id
      and public.current_member_role(d.workspace_id) = 'admin'
  ));

-- Notifications: readable by members; admin/agent write.
drop policy if exists "notifications read" on public.notifications;
create policy "notifications read" on public.notifications
  for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists "notifications insert" on public.notifications;
create policy "notifications insert" on public.notifications
  for insert to authenticated
  with check (public.current_member_role(workspace_id) in ('admin','agent'));
drop policy if exists "notifications update" on public.notifications;
create policy "notifications update" on public.notifications
  for update to authenticated
  using (public.current_member_role(workspace_id) in ('admin','agent'))
  with check (public.current_member_role(workspace_id) in ('admin','agent'));
drop policy if exists "notifications delete" on public.notifications;
create policy "notifications delete" on public.notifications
  for delete to authenticated using (public.current_member_role(workspace_id) = 'admin');

-- Webhooks + deliveries: admin/developer only.
drop policy if exists "webhooks access" on public.webhooks;
create policy "webhooks access" on public.webhooks
  for all to authenticated
  using (public.current_member_role(workspace_id) in ('admin','developer'))
  with check (public.current_member_role(workspace_id) in ('admin','developer'));
drop policy if exists "webhook_deliveries read" on public.webhook_deliveries;
create policy "webhook_deliveries read" on public.webhook_deliveries
  for select to authenticated
  using (public.current_member_role(workspace_id) in ('admin','developer'));
-- (deliveries are written by the delivery worker via service role, or the test-fire RPC)

-- API keys: admin/developer only.
drop policy if exists "api_keys access" on public.api_keys;
create policy "api_keys access" on public.api_keys
  for all to authenticated
  using (public.current_member_role(workspace_id) in ('admin','developer'))
  with check (public.current_member_role(workspace_id) in ('admin','developer'));

-- Audit log: admin read; writes go through log_audit() (SECURITY DEFINER) or service role.
drop policy if exists "audit_log read" on public.audit_log;
create policy "audit_log read" on public.audit_log
  for select to authenticated
  using (public.current_member_role(workspace_id) = 'admin');

-- Branding + property settings: readable by members; admin-managed.
drop policy if exists "branding read" on public.branding;
create policy "branding read" on public.branding
  for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists "branding write" on public.branding;
create policy "branding write" on public.branding
  for all to authenticated
  using (public.current_member_role(workspace_id) = 'admin')
  with check (public.current_member_role(workspace_id) = 'admin');

drop policy if exists "property_settings read" on public.property_settings;
create policy "property_settings read" on public.property_settings
  for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists "property_settings write" on public.property_settings;
create policy "property_settings write" on public.property_settings
  for all to authenticated
  using (public.current_member_role(workspace_id) = 'admin')
  with check (public.current_member_role(workspace_id) = 'admin');

-- Integrations: admin/developer only (config may hold encrypted secrets).
drop policy if exists "integrations access" on public.integrations;
create policy "integrations access" on public.integrations
  for all to authenticated
  using (public.current_member_role(workspace_id) in ('admin','developer'))
  with check (public.current_member_role(workspace_id) in ('admin','developer'));

-- ============================================================================
-- Grants — least privilege.
-- anon: NOTHING on tables (widget RPCs only, granted below).
-- authenticated: exactly what each role's RLS policies allow; sensitive
-- columns (api_keys.key_hash, webhooks.secret_encrypted) are excluded from
-- SELECT grants. member_credentials gets no grants at all.
-- ============================================================================

revoke all on all tables in schema public from anon, authenticated;

-- Read grants (row access still gated by RLS policies above)
grant select on
  public.workspaces, public.properties, public.contacts, public.members,
  public.departments, public.department_members, public.conversations, public.messages,
  public.conversation_notes, public.visitors, public.contact_events, public.goals,
  public.goal_events, public.campaigns, public.tickets, public.ratings,
  public.kb_categories, public.kb_articles, public.canned_categories, public.canned_responses,
  public.ticket_categories, public.triggers, public.notifications, public.saved_views,
  public.plays, public.unanswered_questions, public.webhook_deliveries,
  public.audit_log, public.branding, public.property_settings, public.integrations
  to authenticated;

-- Write grants (RLS policies narrow these further per role)
grant insert, update, delete on
  public.workspaces, public.properties, public.contacts, public.members,
  public.departments, public.department_members, public.conversations, public.messages,
  public.conversation_notes, public.visitors, public.contact_events, public.goals,
  public.goal_events, public.campaigns, public.tickets, public.ratings,
  public.kb_categories, public.kb_articles, public.canned_categories, public.canned_responses,
  public.ticket_categories, public.triggers, public.notifications, public.saved_views,
  public.plays, public.unanswered_questions, public.webhooks, public.integrations
  to authenticated;

-- api_keys: key_hash is never selectable by members (hash of a high-entropy
-- secret; defense in depth). App hashes client-side, then inserts.
grant select (id, workspace_id, name, prefix, scopes, revoked, usage_count,
              last_used_at, created_at, updated_at)
  on public.api_keys to authenticated;
grant insert (workspace_id, name, prefix, key_hash, scopes)
  on public.api_keys to authenticated;
grant update (name, scopes, revoked)
  on public.api_keys to authenticated;
grant delete on public.api_keys to authenticated;

-- webhooks: secret_encrypted is never selectable via the API (shown once at
-- creation by the app, then only used server-side for signing).
grant select (id, workspace_id, property_id, url, events, enabled,
              auto_disable, consecutive_failures, created_at, updated_at)
  on public.webhooks to authenticated;
grant insert (workspace_id, property_id, url, secret_encrypted, events, enabled)
  on public.webhooks to authenticated;
grant update (url, secret_encrypted, events, enabled, auto_disable, consecutive_failures)
  on public.webhooks to authenticated;
grant delete on public.webhooks to authenticated;

-- NOTE: no grants on public.member_credentials (deny-all; RPCs only).
-- NOTE: no write grants on public.webhook_deliveries / public.audit_log for
--       authenticated (worker/service-role or SECURITY DEFINER RPCs write them).

-- ============================================================================
-- RPCs (SECURITY DEFINER)
-- ============================================================================

-- Bootstrap: create a workspace and make the caller its admin member.
create or replace function public.create_workspace(p_name text, p_display_name text default 'Owner')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub uuid := nullif(auth.jwt() ->> 'sub', '')::uuid;
  v_ws_id uuid;
  v_member_id uuid;
  v_slug text;
begin
  if v_sub is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if nullif(trim(p_name), '') is null then
    raise exception 'workspace name is required';
  end if;
  v_slug := trim(both '-' from regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g'))
            || '-' || substr(md5(gen_random_uuid()::text), 1, 6);
  insert into public.workspaces (name, slug) values (trim(p_name), v_slug)
  returning id into v_ws_id;
  insert into public.members (workspace_id, auth_user_id, display_name, initials, role, status)
  values (v_ws_id, v_sub, nullif(trim(p_display_name), ''), '', 'admin', 'online')
  returning id into v_member_id;
  return jsonb_build_object('workspace_id', v_ws_id, 'slug', v_slug, 'member_id', v_member_id);
end;
$$;

-- Passcode login for dashboard members. Returns safe columns only — the hash
-- never leaves the database. NOTE: short numeric passcodes are brute-forceable;
-- rate-limit this endpoint at the edge (see README).
create or replace function public.member_login(
  p_workspace_slug text, p_display_name text, p_passcode text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.members%rowtype;
  v_hash text;
begin
  if p_passcode is null or length(p_passcode) < 4 then
    raise exception 'invalid credentials' using errcode = '28000';
  end if;
  select m.* into v_member
  from public.members m
  join public.workspaces w on w.id = m.workspace_id
  where w.slug = p_workspace_slug
    and lower(m.display_name) = lower(nullif(trim(p_display_name), ''));
  if not found then
    raise exception 'invalid credentials' using errcode = '28000';
  end if;
  select c.passcode_hash into v_hash
  from public.member_credentials c
  where c.member_id = v_member.id;
  -- Placeholder/unset hashes (not bcrypt) can never authenticate.
  if v_hash is null or v_hash not like '$2%' then
    raise exception 'invalid credentials' using errcode = '28000';
  end if;
  if crypt(p_passcode, v_hash) <> v_hash then
    raise exception 'invalid credentials' using errcode = '28000';
  end if;
  update public.members
  set last_login_at = now(), status = 'online', updated_at = now()
  where id = v_member.id;
  return jsonb_build_object(
    'id', v_member.id,
    'workspace_id', v_member.workspace_id,
    'display_name', v_member.display_name,
    'initials', v_member.initials,
    'color', v_member.color,
    'role', v_member.role,
    'status', 'online'
  );
end;
$$;

-- Set/change a member passcode. Admins may reset anyone's; members may change
-- their own. Stores bcrypt via pgcrypto — plaintext never persisted.
create or replace function public.member_set_passcode(p_member_id uuid, p_passcode text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws uuid;
  v_me uuid := public.current_member_id();
begin
  if p_passcode is null or length(p_passcode) < 4 then
    raise exception 'passcode must be at least 4 characters';
  end if;
  select workspace_id into v_ws from public.members where id = p_member_id;
  if not found then
    raise exception 'member not found';
  end if;
  if v_me is null
     or (v_me <> p_member_id and public.current_member_role(v_ws) <> 'admin') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.member_credentials (member_id, passcode_hash)
  values (p_member_id, crypt(p_passcode, gen_salt('bf')))
  on conflict (member_id)
  do update set passcode_hash = excluded.passcode_hash, updated_at = now();
end;
$$;

-- Let a signed-in member change their own online status (members table writes
-- are otherwise admin-only).
create or replace function public.member_set_status(p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_member_id();
begin
  if p_status not in ('online','away','offline') then
    raise exception 'invalid status';
  end if;
  if v_me is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  update public.members set status = p_status, updated_at = now() where id = v_me;
end;
$$;

-- Append an audit entry stamped with the caller's member identity.
create or replace function public.log_audit(
  p_action text, p_entity text default '', p_entity_id text default '',
  p_meta jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.current_member_id();
  v_ws uuid;
  v_name text;
  v_id uuid;
begin
  if v_me is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if nullif(trim(p_action), '') is null then
    raise exception 'action is required';
  end if;
  select workspace_id, display_name into v_ws, v_name
  from public.members where id = v_me;
  insert into public.audit_log
    (workspace_id, actor_member_id, actor_name, action, entity, entity_id, meta)
  values (v_ws, v_me, v_name, trim(p_action), p_entity, p_entity_id, coalesce(p_meta, '{}'))
  returning id into v_id;
  return v_id;
end;
$$;

-- ============================================================================
-- Public widget RPCs — the ONLY surface the anonymous widget may touch.
-- Each validates the property public key (bx_...) and never exposes rows.
-- ============================================================================

-- Start a conversation from the website widget.
create or replace function public.widget_start_conversation(
  p_public_key text, p_visitor jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prop public.properties%rowtype;
  v_conv_id uuid;
  v_greeting text;
begin
  select * into v_prop from public.properties where public_key = nullif(trim(p_public_key), '');
  if not found then
    raise exception 'unknown property' using errcode = 'P0001';
  end if;
  insert into public.conversations
    (workspace_id, property_id, visitor_name, visitor_email, page_url, referrer, status)
  values (
    v_prop.workspace_id, v_prop.id,
    coalesce(nullif(trim(p_visitor ->> 'name'), ''), 'Guest'),
    coalesce(trim(p_visitor ->> 'email'), ''),
    coalesce(trim(p_visitor ->> 'page_url'), ''),
    coalesce(trim(p_visitor ->> 'referrer'), ''),
    'open'
  )
  returning id into v_conv_id;
  v_greeting := coalesce(nullif(trim(v_prop.widget_config ->> 'greeting'), ''),
                         'Hi there! How can we help you today?');
  insert into public.messages (workspace_id, conversation_id, sender, kind, text)
  values (v_prop.workspace_id, v_conv_id, 'agent', 'text', v_greeting);
  return jsonb_build_object(
    'conversation_id', v_conv_id,
    'greeting', v_greeting,
    'property', jsonb_build_object('name', v_prop.name, 'widget_config', v_prop.widget_config)
  );
end;
$$;

-- Post a visitor message. The sender is FORCED to 'visitor' — the widget can
-- never impersonate an agent. Reopens a closed chat, like the app does.
create or replace function public.widget_post_message(
  p_conversation_id uuid, p_text text,
  p_kind text default 'text', p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv public.conversations%rowtype;
  v_msg_id uuid;
  v_created timestamptz;
  v_text text := trim(both from coalesce(p_text, ''));
begin
  if v_text = '' then
    raise exception 'message text is required';
  end if;
  if length(v_text) > 4000 then
    raise exception 'message too long (max 4000 characters)';
  end if;
  if p_kind not in ('text','file','voice','rating') then
    raise exception 'invalid message kind';
  end if;
  select * into v_conv from public.conversations where id = p_conversation_id;
  if not found then
    raise exception 'conversation not found';
  end if;
  if v_conv.status <> 'open' then
    update public.conversations
    set status = 'open', closed_at = null, updated_at = now()
    where id = p_conversation_id;
  end if;
  insert into public.messages
    (workspace_id, conversation_id, sender, kind, text, metadata)
  values (v_conv.workspace_id, p_conversation_id, 'visitor', p_kind, v_text,
          coalesce(p_metadata, '{}'::jsonb))
  returning id, created_at into v_msg_id, v_created;
  update public.conversations
  set unread = unread + 1, updated_at = now()
  where id = p_conversation_id;
  return jsonb_build_object(
    'id', v_msg_id, 'conversation_id', p_conversation_id, 'created_at', v_created);
end;
$$;

-- End a conversation from the widget.
create or replace function public.widget_end_conversation(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
  set status = 'closed', closed_at = now(), updated_at = now()
  where id = p_conversation_id and status = 'open';
end;
$$;

-- Post-chat rating (CSAT 1-5 / NPS 0-10) from the widget.
create or replace function public.widget_submit_rating(
  p_conversation_id uuid, p_kind text, p_score integer, p_comment text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv public.conversations%rowtype;
  v_id uuid;
begin
  select * into v_conv from public.conversations where id = p_conversation_id;
  if not found then
    raise exception 'conversation not found';
  end if;
  if p_kind = 'csat' and (p_score < 1 or p_score > 5) then
    raise exception 'CSAT score must be between 1 and 5';
  elsif p_kind = 'nps' and (p_score < 0 or p_score > 10) then
    raise exception 'NPS score must be between 0 and 10';
  elsif p_kind not in ('csat','nps') then
    raise exception 'invalid rating kind';
  end if;
  insert into public.ratings
    (workspace_id, property_id, conversation_id, kind, score, comment)
  values (v_conv.workspace_id, v_conv.property_id, p_conversation_id,
          p_kind, p_score, coalesce(trim(p_comment), ''))
  returning id into v_id;
  return v_id;
end;
$$;

-- Offline-form ticket from the widget (creates a ticket, not a conversation).
create or replace function public.widget_create_ticket(
  p_public_key text, p_name text, p_email text, p_subject text, p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prop public.properties%rowtype;
  v_ticket_id uuid;
begin
  select * into v_prop from public.properties where public_key = nullif(trim(p_public_key), '');
  if not found then
    raise exception 'unknown property' using errcode = 'P0001';
  end if;
  if nullif(trim(coalesce(p_subject, '')), '') is null
     or nullif(trim(coalesce(p_message, '')), '') is null then
    raise exception 'subject and message are required';
  end if;
  if length(p_message) > 10000 then
    raise exception 'message too long (max 10000 characters)';
  end if;
  insert into public.tickets
    (workspace_id, property_id, subject, message, requester_name, requester_email, status)
  values (
    v_prop.workspace_id, v_prop.id,
    trim(p_subject), trim(p_message),
    coalesce(nullif(trim(coalesce(p_name, '')), ''), 'Guest'),
    coalesce(trim(coalesce(p_email, '')), ''),
    'new'
  )
  returning id into v_ticket_id;
  return jsonb_build_object('id', v_ticket_id);
end;
$$;

-- RPC execute grants ------------------------------------------------------------
-- anon: widget surface ONLY.
grant execute on function public.widget_start_conversation(text, jsonb) to anon, authenticated;
grant execute on function public.widget_post_message(uuid, text, text, jsonb) to anon, authenticated;
grant execute on function public.widget_end_conversation(uuid) to anon, authenticated;
grant execute on function public.widget_submit_rating(uuid, text, integer, text) to anon, authenticated;
grant execute on function public.widget_create_ticket(text, text, text, text, text) to anon, authenticated;
grant execute on function public.member_login(text, text, text) to anon, authenticated;
-- authenticated-only helpers.
grant execute on function public.create_workspace(text, text) to authenticated;
grant execute on function public.member_set_passcode(uuid, text) to authenticated;
grant execute on function public.member_set_status(text) to authenticated;
grant execute on function public.log_audit(text, text, text, jsonb) to authenticated;
-- (current_member_id / current_member_role / is_workspace_member are SECURITY
-- DEFINER and keep default PUBLIC execute: they reveal only the caller's own
-- member id/role, which the caller can already read from the members table.)

-- ============================================================================
-- Cross-workspace FK integrity.
--
-- RLS filters rows by workspace_id, but workspace_id is caller-supplied on
-- INSERT. Without this, an authenticated member of workspace A could attach
-- a row (e.g. a message) to a parent row (e.g. a conversation) in workspace B
-- by guessing its UUID. These triggers reject any child whose workspace_id
-- does not match its parent's. (Reads can't leak across workspaces regardless;
-- this closes the write side.)
-- ============================================================================

create or replace function public.enforce_workspace_match()
returns trigger
language plpgsql
as $$
declare
  v_parent_ws uuid;
  v_fk_val uuid;
begin
  -- TG_ARGV[0] = parent table, TG_ARGV[1] = FK column on NEW
  execute format('select ($1).%I', TG_ARGV[1]) using NEW into v_fk_val;
  if v_fk_val is null then
    return NEW;
  end if;
  execute format('select workspace_id from public.%I where id = $1', TG_ARGV[0])
    using v_fk_val into v_parent_ws;
  if v_parent_ws is null then
    -- Either the parent doesn't exist, or RLS hides it from the caller.
    -- Same error either way: no existence oracle.
    raise exception 'referenced row not found';
  end if;
  if v_parent_ws <> NEW.workspace_id then
    raise exception 'workspace mismatch: referenced row belongs to another workspace';
  end if;
  return NEW;
end;
$$;

do $$
declare
  r record;
begin
  -- (child table, parent table, fk column)
  for r in
    select * from (values
      ('messages','conversations','conversation_id'),
      ('conversation_notes','conversations','conversation_id'),
      ('contact_events','contacts','contact_id'),
      ('goal_events','goals','goal_id'),
      ('tickets','conversations','conversation_id'),
      ('tickets','properties','property_id'),
      ('ratings','conversations','conversation_id'),
      ('ratings','properties','property_id'),
      ('unanswered_questions','conversations','conversation_id'),
      ('unanswered_questions','properties','property_id'),
      ('kb_articles','kb_categories','category_id'),
      ('kb_articles','properties','property_id'),
      ('canned_responses','canned_categories','category_id'),
      ('canned_responses','properties','property_id'),
      ('campaigns','goals','goal_id'),
      ('campaigns','properties','property_id'),
      ('departments','properties','property_id'),
      ('triggers','properties','property_id'),
      ('webhooks','properties','property_id'),
      ('webhook_deliveries','webhooks','webhook_id'),
      ('visitors','properties','property_id'),
      ('visitors','contacts','contact_id'),
      ('contacts','properties','property_id'),
      ('conversations','properties','property_id'),
      ('conversations','contacts','contact_id'),
      ('conversations','departments','department_id'),
      ('conversations','members','assignee_id'),
      ('tickets','members','assignee_id'),
      ('ratings','members','member_id'),
      ('canned_responses','members','owner_member_id'),
      ('goals','properties','property_id'),
      ('branding','properties','property_id'),
      ('property_settings','properties','property_id'),
      ('notifications','members','member_id'),
      ('saved_views','members','member_id')
      -- NOTE: department_members has no workspace_id of its own; it gets a
      -- dedicated trigger below.
    ) as v(child_table, parent_table, fk_col)
  loop
    execute format('drop trigger if exists %I on public.%I',
                   'trg_ws_match_' || r.fk_col, r.child_table);
    execute format(
      'create trigger %I before insert or update on public.%I ' ||
      'for each row execute function public.enforce_workspace_match(%L, %L)',
      'trg_ws_match_' || r.fk_col, r.child_table, r.parent_table, r.fk_col);
  end loop;
end $$;

-- department_members: both sides must live in the same workspace.
create or replace function public.enforce_department_member_workspace()
returns trigger
language plpgsql
as $$
declare
  d_ws uuid;
  m_ws uuid;
begin
  select workspace_id into d_ws from public.departments where id = NEW.department_id;
  select workspace_id into m_ws from public.members where id = NEW.member_id;
  if d_ws is null or m_ws is null then
    raise exception 'referenced row not found';
  end if;
  if d_ws <> m_ws then
    raise exception 'workspace mismatch: department and member belong to different workspaces';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_ws_match_department_member on public.department_members;
create trigger trg_ws_match_department_member
  before insert or update on public.department_members
  for each row execute function public.enforce_department_member_workspace();

-- ============================================================================
-- Realtime: conversations, messages, visitors (RLS still applies per client)
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public'
                   and tablename = 'conversations') then
    alter publication supabase_realtime add table public.conversations;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public'
                   and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public'
                   and tablename = 'visitors') then
    alter publication supabase_realtime add table public.visitors;
  end if;
end $$;
