-- ============================================================================
-- Brix Chat — MySQL / MariaDB schema
-- Ported from the Postgres (Supabase) migrations:
--   supabase/migrations/001_brix_core.sql
--   supabase/migrations/002_seed_demo.sql
--   supabase/migrations/003_backend_contract.sql
--   supabase/migrations/004_invites.sql
--
-- REQUIREMENTS
--   * MySQL 8.0.16+  (CHECK constraints are enforced from 8.0.16)
--     - or -
--   * MariaDB 10.6+   (CHECK constraints are enforced from 10.2)
--   * InnoDB engine, utf8mb4 charset.
--   * The importing DB user needs CREATE / ALTER / TRIGGER privileges
--     (phpMyAdmin users on cPanel shared hosting normally have these on
--     their own database).
--
-- INSTALL (phpMyAdmin)
--   1. Create an empty database, e.g.:
--        CREATE DATABASE brixchat CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
--      (or create it in cPanel > MySQL Databases and set the collation to
--      utf8mb4_unicode_ci in phpMyAdmin > Operations).
--   2. Select the database, open the Import tab, upload this file, Go.
--   3. The file is safe to import into a FRESH (empty) database. Re-importing
--      into a database that already has these tables will skip table creation
--      (CREATE TABLE IF NOT EXISTS) and skip each demo seed independently
--      (the 'demo' and 'acme' workspace seeds each exit early when a
--      workspace with that slug already exists).
--
-- PORTING NOTES (Postgres -> MySQL)
--   * uuid PKs            -> CHAR(36). IDs are minted CLIENT-side
--     (frontend crypto.randomUUID()) and sent in INSERTs — the API must
--     accept client-supplied IDs verbatim. Columns have NO server default
--     (no UUID() default) so a missing id fails loudly instead of silently
--     minting a different one.
--   * timestamptz         -> TIMESTAMP. This file sets the session time_zone
--     to +00:00 and the API must read/write UTC (ISO-8601 'Z' strings).
--   * jsonb               -> JSON. NOTE: MySQL 8 does not allow DEFAULT
--     values on JSON columns, so JSON columns are NOT NULL with NO default —
--     the PHP API must always supply '{}' / '[]' on insert (the seed below
--     and every frontend write does).
--   * text[] arrays       -> JSON arrays of strings (contacts.tags,
--     conversations.tags, tickets.tags, webhooks.events, api_keys.scopes).
--     Array-contains filtering becomes JSON_CONTAINS / MEMBER OF() in PHP.
--   * text + CHECK        -> TEXT + CHECK (enforced on MySQL 8.0.16+ /
--     MariaDB 10.2+), same value lists as Postgres.
--   * boolean             -> TINYINT(1) (0/1).
--   * numeric(12,2)       -> DECIMAL(12,2). smallint -> SMALLINT.
--     api_keys.usage_count is BIGINT (was bigint in Postgres).
--   * Partial indexes (WHERE ...) do not exist in MySQL: they are created
--     here as full indexes with the same names (minus the predicate).
--   * Expression index members (workspace_id, lower(display_name)) is
--     replaced by UNIQUE (workspace_id, display_name) on a case-insensitive
--     collation (utf8mb4_unicode_ci), which enforces the same
--     case-insensitive uniqueness the frontend duplicate-name check expects.
--   * TEXT columns that participate in UNIQUE indexes are VARCHAR(255)
--     instead (properties.public_key, branding.subdomain, kb_articles.slug,
--     webhook_deliveries.event_id, integrations.provider,
--     members.display_name) — MySQL cannot index full TEXT.
--
-- ACCESS CONTROL (RLS dropped)
--   Access control moves into the PHP API layer (per-request workspace
--   scoping + HMAC token auth). Row Level Security policies from the
--   Postgres migrations are intentionally NOT ported: enforce the role
--   matrix (admin/agent/developer/viewer, developers excluded from chat
--   content reads, viewers read-only) and the column grants
--   (member_credentials.*, api_keys.key_hash, webhooks.secret never
--   readable by members) in PHP serializers/queries.
--   The BEFORE INSERT/UPDATE workspace-match triggers below ARE ported —
--   they are the write-side cross-workspace guard.
--
-- TRIGGERS
--   * touch_updated_at (Postgres, 26 tables) -> BEFORE UPDATE triggers
--     setting NEW.updated_at = UTC_TIMESTAMP(). MySQL trigger names must be
--     unique per schema, so they are named trg_touch_<table> (Postgres reused
--     one name per table).
--   * enforce_workspace_match (Postgres) -> BEFORE INSERT + BEFORE UPDATE
--     triggers per child table (trg_ws_<table>_ins/_upd), SIGNAL SQLSTATE
--     '45000' on mismatch. department_members gets its own pair checking
--     both sides live in the same workspace.
--   * webhook_delivery_backfill_workspace (003) -> BEFORE INSERT trigger on
--     webhook_deliveries filling workspace_id from the parent webhook.
--
-- RPCS / EDGE FUNCTIONS (not ported — implement in PHP)
--   member_login, member_set_passcode, member_set_status, log_audit,
--   member_accept_invite, widget_* RPCs and the ai-copilot / invites /
--   send-email / sla-checker / webhook-dispatcher Edge Functions become PHP
--   API endpoints + cron jobs.
--   Claim logic (claim_pending_webhook_deliveries, FOR UPDATE SKIP LOCKED):
--   implement the claim in PHP — InnoDB supports
--   SELECT ... FOR UPDATE SKIP LOCKED natively. Suggested claim query:
--     UPDATE webhook_deliveries d SET claimed_at = UTC_TIMESTAMP()
--     WHERE d.id IN (
--       SELECT id FROM webhook_deliveries
--       WHERE status IN ('pending','failed')
--         AND next_attempt_at <= UTC_TIMESTAMP()
--         AND (claimed_at IS NULL OR claimed_at < UTC_TIMESTAMP() - INTERVAL 10 MINUTE)
--       ORDER BY next_attempt_at ASC LIMIT ?
--       FOR UPDATE SKIP LOCKED
--     );
--   Realtime (supabase_realtime publication on conversations, messages,
--   visitors): replicate with SSE/WebSocket pushes or polling on those three
--   tables, preserving the {table, type, row} event shape.
--
-- PASSCODES
--   member_credentials.passcode_hash is VARCHAR(255) holding a bcrypt hash.
--   The seed below stores REAL bcrypt hashes (generated with PHP
--   password_hash($passcode, PASSWORD_BCRYPT); verify with password_verify()).
--   PUBLIC DEMO CREDENTIALS (intentional — this is a demo/dev seed, identical
--   in spirit to the frontend's localStorage demo data):
--     workspace slug 'demo' -> passcode '3456' (Demo Agent, Sara, Omar)
--     workspace slug 'acme' -> passcode '7890' (Ava Client, Ben Agent)
--   These passcodes are NOT secrets; they exist so the shipped demo data is
--   usable out of the box. Real deployments should change them via the
--   member set-passcode endpoint (POST /members/:id/passcode).
--   NOTE: the Postgres migrations seed ONLY the 'demo' workspace — there is
--   no 'acme' workspace in the source migrations. The 'acme' seed here mirrors
--   the frontend localStorage demo store instead (src/lib/seed.ts:
--   workspace slug 'acme', displayName 'Ava Client', passcode '7890',
--   role 'admin'), which the Postgres seed never covered.
--
-- TRANSACTIONS
--   MySQL/MariaDB DDL auto-commits (each CREATE TABLE is its own implicit
--   transaction), so the table section cannot be wrapped in one atomic
--   transaction. The demo SEED at the end of this file IS wrapped in an
--   explicit transaction (START TRANSACTION ... COMMIT).
-- ============================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- ============================================================================
-- Tables (35)
-- ============================================================================

-- Workspaces -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workspaces (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY workspaces_slug_uniq (slug(191))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Properties (websites) --------------------------------------------------------
CREATE TABLE IF NOT EXISTS properties (
  id CHAR(36) NOT NULL PRIMARY KEY,
  workspace_id CHAR(36) NOT NULL,
  name TEXT NOT NULL,
  domain TEXT NOT NULL DEFAULT '',
  public_key VARCHAR(255) NOT NULL,
  secure_mode TINYINT(1) NOT NULL DEFAULT 0,
  widget_config JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY properties_public_key_uniq (public_key),
  KEY properties_workspace_idx (workspace_id),
  CONSTRAINT fk_properties_workspace FOREIGN KEY (workspace_id)
    REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT properties_public_key_format CHECK (public_key LIKE 'bx\\_%')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Contacts ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contacts (
  id CHAR(36) NOT NULL PRIMARY KEY,
  workspace_id CHAR(36) NOT NULL,
  property_id CHAR(36) NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  tags JSON NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'chat',
  chats_count INT NOT NULL DEFAULT 0,
  last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY contacts_workspace_idx (workspace_id),
  KEY contacts_workspace_email_idx (workspace_id, email(191)),
  CONSTRAINT fk_contacts_workspace FOREIGN KEY (workspace_id)
    REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_contacts_property FOREIGN KEY (property_id)
    REFERENCES properties (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Members (workspace membership; roles admin/agent/developer/viewer) ------------
CREATE TABLE IF NOT EXISTS members (
  id CHAR(36) NOT NULL PRIMARY KEY,
  workspace_id CHAR(36) NOT NULL,
  auth_user_id CHAR(36) NULL,
  display_name VARCHAR(255) NOT NULL,
  initials TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#4f46e5',
  role TEXT NOT NULL DEFAULT 'agent',
  email TEXT NOT NULL DEFAULT '',
  job_title TEXT NOT NULL DEFAULT '',
  avatar_url TEXT NULL,
  status TEXT NOT NULL DEFAULT 'offline',
  last_login_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY members_auth_user_id_uniq (auth_user_id),
  UNIQUE KEY members_workspace_display_name_uniq (workspace_id, display_name),
  KEY members_workspace_idx (workspace_id),
  CONSTRAINT fk_members_workspace FOREIGN KEY (workspace_id)
    REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT members_role_check CHECK (role IN ('admin','agent','developer','viewer')),
  CONSTRAINT members_status_check CHECK (status IN ('online','away','offline'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Member credentials: passcode bcrypt hashes. NEVER readable via the API.
-- No application-level read access; only the login / set-passcode PHP
-- endpoints touch this table.
CREATE TABLE IF NOT EXISTS member_credentials (
  member_id CHAR(36) NOT NULL PRIMARY KEY,
  passcode_hash VARCHAR(255) NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_member_credentials_member FOREIGN KEY (member_id)
    REFERENCES members (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Departments -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS departments (
  id CHAR(36) NOT NULL PRIMARY KEY,
  workspace_id CHAR(36) NOT NULL,
  property_id CHAR(36) NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  routing_mode TEXT NOT NULL DEFAULT 'round-robin',
  hours_override JSON NULL,
  offline_behavior TEXT NOT NULL DEFAULT 'message',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY departments_property_idx (property_id),
  CONSTRAINT fk_departments_workspace FOREIGN KEY (workspace_id)
    REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_departments_property FOREIGN KEY (property_id)
    REFERENCES properties (id) ON DELETE CASCADE,
  CONSTRAINT departments_routing_mode_check
    CHECK (routing_mode IN ('round-robin','least-busy','first-available')),
  CONSTRAINT departments_offline_behavior_check
    CHECK (offline_behavior IN ('ticket','message','hide'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS department_members (
  department_id CHAR(36) NOT NULL,
  member_id CHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (department_id, member_id),
  KEY department_members_member_idx (member_id),
  CONSTRAINT fk_department_members_department FOREIGN KEY (department_id)
    REFERENCES departments (id) ON DELETE CASCADE,
  CONSTRAINT fk_department_members_member FOREIGN KEY (member_id)
    REFERENCES members (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Conversations -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversations (
  id CHAR(36) NOT NULL PRIMARY KEY,
  workspace_id CHAR(36) NOT NULL,
  property_id CHAR(36) NOT NULL,
  contact_id CHAR(36) NULL,
  visitor_name TEXT NOT NULL DEFAULT 'Guest',
  visitor_email TEXT NOT NULL DEFAULT '',
  page_url TEXT NOT NULL DEFAULT '',
  referrer TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  department_id CHAR(36) NULL,
  assignee_id CHAR(36) NULL,
  tags JSON NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium',
  rating SMALLINT NULL,
  unread INT NOT NULL DEFAULT 0,
  ai_handled TINYINT(1) NOT NULL DEFAULT 0,
  closed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY conversations_workspace_idx (workspace_id),
  KEY conversations_property_idx (property_id),
  KEY conversations_status_idx (status(50)),
  KEY conversations_assignee_idx (assignee_id),
  KEY conversations_workspace_updated_idx (workspace_id, updated_at DESC),
  CONSTRAINT fk_conversations_workspace FOREIGN KEY (workspace_id)
    REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_conversations_property FOREIGN KEY (property_id)
    REFERENCES properties (id) ON DELETE CASCADE,
  CONSTRAINT fk_conversations_contact FOREIGN KEY (contact_id)
    REFERENCES contacts (id) ON DELETE SET NULL,
  CONSTRAINT fk_conversations_department FOREIGN KEY (department_id)
    REFERENCES departments (id) ON DELETE SET NULL,
  CONSTRAINT fk_conversations_assignee FOREIGN KEY (assignee_id)
    REFERENCES members (id) ON DELETE SET NULL,
  CONSTRAINT conversations_status_check CHECK (status IN ('open','closed','spam','missed')),
  CONSTRAINT conversations_priority_check CHECK (priority IN ('low','medium','high','urgent')),
  CONSTRAINT conversations_rating_check CHECK (rating IS NULL OR (rating BETWEEN 1 AND 5))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Messages -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS messages (
  id CHAR(36) NOT NULL PRIMARY KEY,
  workspace_id CHAR(36) NOT NULL,
  conversation_id CHAR(36) NOT NULL,
  sender TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'text',
  text TEXT NOT NULL DEFAULT '',
  metadata JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY messages_conversation_idx (conversation_id, created_at),
  CONSTRAINT fk_messages_workspace FOREIGN KEY (workspace_id)
    REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_messages_conversation FOREIGN KEY (conversation_id)
    REFERENCES conversations (id) ON DELETE CASCADE,
  CONSTRAINT messages_sender_check CHECK (sender IN ('visitor','agent','ai','system')),
  CONSTRAINT messages_kind_check CHECK (kind IN ('text','file','voice','rating'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Internal notes on conversations ---------------------------------------------------
CREATE TABLE IF NOT EXISTS conversation_notes (
  id CHAR(36) NOT NULL PRIMARY KEY,
  workspace_id CHAR(36) NOT NULL,
  conversation_id CHAR(36) NOT NULL,
  author_member_id CHAR(36) NULL,
  author_name TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY conversation_notes_conv_idx (conversation_id),
  CONSTRAINT fk_conversation_notes_workspace FOREIGN KEY (workspace_id)
    REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_conversation_notes_conversation FOREIGN KEY (conversation_id)
    REFERENCES conversations (id) ON DELETE CASCADE,
  CONSTRAINT fk_conversation_notes_author FOREIGN KEY (author_member_id)
    REFERENCES members (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Visitors (live visitor monitoring) --------------------------------------------------
CREATE TABLE IF NOT EXISTS visitors (
  id CHAR(36) NOT NULL PRIMARY KEY,
  workspace_id CHAR(36) NOT NULL,
  property_id CHAR(36) NOT NULL,
  contact_id CHAR(36) NULL,
  name TEXT NOT NULL DEFAULT 'Guest',
  email TEXT NOT NULL DEFAULT '',
  page_url TEXT NOT NULL DEFAULT '',
  pages INT NOT NULL DEFAULT 1,
  country TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  device TEXT NOT NULL DEFAULT '',
  browser TEXT NOT NULL DEFAULT '',
  time_on_site_sec INT NOT NULL DEFAULT 0,
  typing_preview TEXT NULL,
  online TINYINT(1) NOT NULL DEFAULT 1,
  custom_attributes JSON NOT NULL,
  last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY visitors_property_seen_idx (property_id, last_seen_at DESC),
  KEY visitors_workspace_idx (workspace_id),
  CONSTRAINT fk_visitors_workspace FOREIGN KEY (workspace_id)
    REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_visitors_property FOREIGN KEY (property_id)
    REFERENCES properties (id) ON DELETE CASCADE,
  CONSTRAINT fk_visitors_contact FOREIGN KEY (contact_id)
    REFERENCES contacts (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Contact timeline events (chat, ticket, campaign, note, tag) ---------------------------
CREATE TABLE IF NOT EXISTS contact_events (
  id CHAR(36) NOT NULL PRIMARY KEY,
  workspace_id CHAR(36) NOT NULL,
  contact_id CHAR(36) NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  related_id CHAR(36) NULL,
  occurred_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY contact_events_contact_idx (contact_id, occurred_at DESC),
  CONSTRAINT fk_contact_events_workspace FOREIGN KEY (workspace_id)
    REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_contact_events_contact FOREIGN KEY (contact_id)
    REFERENCES contacts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Goals & goal events (attribution) -----------------------------------------------------
CREATE TABLE IF NOT EXISTS goals (
  id CHAR(36) NOT NULL PRIMARY KEY,
  workspace_id CHAR(36) NOT NULL,
  property_id CHAR(36) NULL,
  name TEXT NOT NULL,
  event TEXT NOT NULL,
  revenue DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY goals_workspace_idx (workspace_id),
  CONSTRAINT fk_goals_workspace FOREIGN KEY (workspace_id)
    REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_goals_property FOREIGN KEY (property_id)
    REFERENCES properties (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS goal_events (
  id CHAR(36) NOT NULL PRIMARY KEY,
  workspace_id CHAR(36) NOT NULL,
  goal_id CHAR(36) NOT NULL,
  conversation_id CHAR(36) NULL,
  value DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY goal_events_goal_idx (goal_id, created_at DESC),
  CONSTRAINT fk_goal_events_workspace FOREIGN KEY (workspace_id)
    REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_goal_events_goal FOREIGN KEY (goal_id)
    REFERENCES goals (id) ON DELETE CASCADE,
  CONSTRAINT fk_goal_events_conversation FOREIGN KEY (conversation_id)
    REFERENCES conversations (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Campaigns (proactive / outbound) --------------------------------------------------------
CREATE TABLE IF NOT EXISTS campaigns (
  id CHAR(36) NOT NULL PRIMARY KEY,
  workspace_id CHAR(36) NOT NULL,
  property_id CHAR(36) NOT NULL,
  name TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  schedule TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  scheduled_at TIMESTAMP NULL,
  audience_rules JSON NULL,
  goal_id CHAR(36) NULL,
  sent_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY campaigns_property_status_idx (property_id, status(50)),
  CONSTRAINT fk_campaigns_workspace FOREIGN KEY (workspace_id)
    REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_campaigns_property FOREIGN KEY (property_id)
    REFERENCES properties (id) ON DELETE CASCADE,
  CONSTRAINT fk_campaigns_goal FOREIGN KEY (goal_id)
    REFERENCES goals (id) ON DELETE SET NULL,
  CONSTRAINT campaigns_status_check CHECK (status IN ('draft','scheduled','sent'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Knowledge base -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kb_categories (
  id CHAR(36) NOT NULL PRIMARY KEY,
  workspace_id CHAR(36) NOT NULL,
  property_id CHAR(36) NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#4f46e5',
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY kb_categories_property_idx (property_id),
  CONSTRAINT fk_kb_categories_workspace FOREIGN KEY (workspace_id)
    REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_kb_categories_property FOREIGN KEY (property_id)
    REFERENCES properties (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS kb_articles (
  id CHAR(36) NOT NULL PRIMARY KEY,
  workspace_id CHAR(36) NOT NULL,
  property_id CHAR(36) NULL,
  category_id CHAR(36) NULL,
  title TEXT NOT NULL,
  slug VARCHAR(255) NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  views INT NOT NULL DEFAULT 0,
  helpful INT NOT NULL DEFAULT 0,
  not_helpful INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY kb_articles_workspace_slug_uniq (workspace_id, slug),
  KEY kb_articles_property_status_idx (property_id, status(50)),
  CONSTRAINT fk_kb_articles_workspace FOREIGN KEY (workspace_id)
    REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_kb_articles_property FOREIGN KEY (property_id)
    REFERENCES properties (id) ON DELETE CASCADE,
  CONSTRAINT fk_kb_articles_category FOREIGN KEY (category_id)
    REFERENCES kb_categories (id) ON DELETE SET NULL,
  CONSTRAINT kb_articles_status_check CHECK (status IN ('draft','published'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Canned responses ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS canned_categories (
  id CHAR(36) NOT NULL PRIMARY KEY,
  workspace_id CHAR(36) NOT NULL,
  property_id CHAR(36) NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#4f46e5',
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY canned_categories_property_idx (property_id),
  CONSTRAINT fk_canned_categories_workspace FOREIGN KEY (workspace_id)
    REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_canned_categories_property FOREIGN KEY (property_id)
    REFERENCES properties (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS canned_responses (
  id CHAR(36) NOT NULL PRIMARY KEY,
  workspace_id CHAR(36) NOT NULL,
  property_id CHAR(36) NULL,
  category_id CHAR(36) NULL,
  shortcut TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  shared TINYINT(1) NOT NULL DEFAULT 1,
  owner_member_id CHAR(36) NULL,
  usage_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY canned_responses_property_idx (property_id),
  CONSTRAINT fk_canned_responses_workspace FOREIGN KEY (workspace_id)
    REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_canned_responses_property FOREIGN KEY (property_id)
    REFERENCES properties (id) ON DELETE CASCADE,
  CONSTRAINT fk_canned_responses_category FOREIGN KEY (category_id)
    REFERENCES canned_categories (id) ON DELETE SET NULL,
  CONSTRAINT fk_canned_responses_owner FOREIGN KEY (owner_member_id)
    REFERENCES members (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ticket categories (matches ApiCategory scope 'tickets') ---------------------------------------
CREATE TABLE IF NOT EXISTS ticket_categories (
  id CHAR(36) NOT NULL PRIMARY KEY,
  workspace_id CHAR(36) NOT NULL,
  property_id CHAR(36) NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#4f46e5',
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ticket_categories_property_idx (property_id),
  CONSTRAINT fk_ticket_categories_workspace FOREIGN KEY (workspace_id)
    REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_ticket_categories_property FOREIGN KEY (property_id)
    REFERENCES properties (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tickets (with SLA fields) ----------------------------------------------------------------
-- (003 adds sla_breached; ticket_categories is created above so the FK is inline.)
CREATE TABLE IF NOT EXISTS tickets (
  id CHAR(36) NOT NULL PRIMARY KEY,
  workspace_id CHAR(36) NOT NULL,
  property_id CHAR(36) NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  requester_name TEXT NOT NULL DEFAULT 'Guest',
  requester_email TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new',
  priority TEXT NOT NULL DEFAULT 'medium',
  assignee_id CHAR(36) NULL,
  sla_due TIMESTAMP NULL,
  sla_breach_notified TINYINT(1) NOT NULL DEFAULT 0,
  sla_breached TINYINT(1) NOT NULL DEFAULT 0,
  conversation_id CHAR(36) NULL,
  tags JSON NOT NULL,
  category_id CHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY tickets_workspace_status_idx (workspace_id, status(50)),
  KEY tickets_property_idx (property_id),
  KEY tickets_priority_idx (priority(50)),
  KEY tickets_sla_due_idx (sla_due),
  KEY tickets_assignee_idx (assignee_id),
  KEY tickets_sla_breach_idx (sla_due),
  CONSTRAINT fk_tickets_workspace FOREIGN KEY (workspace_id)
    REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_tickets_property FOREIGN KEY (property_id)
    REFERENCES properties (id) ON DELETE CASCADE,
  CONSTRAINT fk_tickets_assignee FOREIGN KEY (assignee_id)
    REFERENCES members (id) ON DELETE SET NULL,
  CONSTRAINT fk_tickets_conversation FOREIGN KEY (conversation_id)
    REFERENCES conversations (id) ON DELETE SET NULL,
  CONSTRAINT tickets_category_id_fkey FOREIGN KEY (category_id)
    REFERENCES ticket_categories (id) ON DELETE SET NULL,
  CONSTRAINT tickets_status_check CHECK (status IN ('new','open','resolved')),
  CONSTRAINT tickets_priority_check CHECK (priority IN ('low','medium','high','urgent'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ratings / feedback (CSAT 1-5, NPS 0-10) -----------------------------------------------------
CREATE TABLE IF NOT EXISTS ratings (
  id CHAR(36) NOT NULL PRIMARY KEY,
  workspace_id CHAR(36) NOT NULL,
  property_id CHAR(36) NOT NULL,
  conversation_id CHAR(36) NULL,
  member_id CHAR(36) NULL,
  kind TEXT NOT NULL,
  score SMALLINT NOT NULL,
  comment TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ratings_property_created_idx (property_id, created_at DESC),
  KEY ratings_workspace_idx (workspace_id),
  CONSTRAINT fk_ratings_workspace FOREIGN KEY (workspace_id)
    REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_ratings_property FOREIGN KEY (property_id)
    REFERENCES properties (id) ON DELETE CASCADE,
  CONSTRAINT fk_ratings_conversation FOREIGN KEY (conversation_id)
    REFERENCES conversations (id) ON DELETE SET NULL,
  CONSTRAINT fk_ratings_member FOREIGN KEY (member_id)
    REFERENCES members (id) ON DELETE SET NULL,
  CONSTRAINT ratings_kind_check CHECK (kind IN ('csat','nps')),
  CONSTRAINT ratings_score_check CHECK (
    (kind = 'csat' AND score BETWEEN 1 AND 5) OR
    (kind = 'nps' AND score BETWEEN 0 AND 10)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Triggers / workflow rules ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS triggers (
  id CHAR(36) NOT NULL PRIMARY KEY,
  workspace_id CHAR(36) NOT NULL,
  property_id CHAR(36) NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'proactive',
  event TEXT NOT NULL DEFAULT 'chat.started',
  condition_groups JSON NOT NULL,
  actions JSON NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY triggers_property_enabled_idx (property_id, enabled),
  CONSTRAINT fk_triggers_workspace FOREIGN KEY (workspace_id)
    REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_triggers_property FOREIGN KEY (property_id)
    REFERENCES properties (id) ON DELETE CASCADE,
  CONSTRAINT triggers_kind_check CHECK (kind IN ('proactive','routing'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Notifications (in-app bell) ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id CHAR(36) NOT NULL PRIMARY KEY,
  workspace_id CHAR(36) NOT NULL,
  member_id CHAR(36) NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  link TEXT NULL,
  `read` TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY notifications_workspace_idx (workspace_id, created_at DESC),
  KEY notifications_member_idx (member_id),
  CONSTRAINT fk_notifications_workspace FOREIGN KEY (workspace_id)
    REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_notifications_member FOREIGN KEY (member_id)
    REFERENCES members (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Saved inbox views -----------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS saved_views (
  id CHAR(36) NOT NULL PRIMARY KEY,
  workspace_id CHAR(36) NOT NULL,
  member_id CHAR(36) NULL,
  name TEXT NOT NULL,
  filters JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY saved_views_workspace_idx (workspace_id),
  CONSTRAINT fk_saved_views_workspace FOREIGN KEY (workspace_id)
    REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_saved_views_member FOREIGN KEY (member_id)
    REFERENCES members (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Plays (multi-step macros) ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plays (
  id CHAR(36) NOT NULL PRIMARY KEY,
  workspace_id CHAR(36) NOT NULL,
  name TEXT NOT NULL,
  steps JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY plays_workspace_idx (workspace_id),
  CONSTRAINT fk_plays_workspace FOREIGN KEY (workspace_id)
    REFERENCES workspaces (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Unanswered questions (knowledge-gap loop) -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS unanswered_questions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  workspace_id CHAR(36) NOT NULL,
  property_id CHAR(36) NULL,
  question TEXT NOT NULL,
  conversation_id CHAR(36) NULL,
  count INT NOT NULL DEFAULT 1,
  dismissed TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY unanswered_workspace_idx (workspace_id),
  CONSTRAINT fk_unanswered_workspace FOREIGN KEY (workspace_id)
    REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_unanswered_property FOREIGN KEY (property_id)
    REFERENCES properties (id) ON DELETE CASCADE,
  CONSTRAINT fk_unanswered_conversation FOREIGN KEY (conversation_id)
    REFERENCES conversations (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Webhooks ------------------------------------------------------------------------------------------------------
-- (003: secret_encrypted dropped, replaced by raw HMAC signing `secret`.)
CREATE TABLE IF NOT EXISTS webhooks (
  id CHAR(36) NOT NULL PRIMARY KEY,
  workspace_id CHAR(36) NOT NULL,
  property_id CHAR(36) NOT NULL,
  url TEXT NOT NULL,
  secret TEXT NULL,
  disabled_reason TEXT NULL,
  events JSON NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  auto_disable TINYINT(1) NOT NULL DEFAULT 1,
  consecutive_failures INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY webhooks_property_idx (property_id),
  CONSTRAINT fk_webhooks_workspace FOREIGN KEY (workspace_id)
    REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_webhooks_property FOREIGN KEY (property_id)
    REFERENCES properties (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id CHAR(36) NOT NULL PRIMARY KEY,
  workspace_id CHAR(36) NOT NULL,
  webhook_id CHAR(36) NOT NULL,
  property_id CHAR(36) NULL,
  event TEXT NOT NULL,
  event_id VARCHAR(255) NOT NULL,
  payload JSON NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  http_status INT NULL,
  attempts INT NOT NULL DEFAULT 0,
  attempt_count INT NOT NULL DEFAULT 0,
  latency_ms INT NULL,
  last_error TEXT NULL,
  next_attempt_at TIMESTAMP NULL,
  claimed_at TIMESTAMP NULL,
  note TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY webhook_deliveries_webhook_event_uniq (webhook_id, event_id),
  KEY webhook_deliveries_webhook_idx (webhook_id, created_at DESC),
  KEY webhook_deliveries_retry_idx (next_attempt_at),
  KEY webhook_deliveries_claim_idx (status(50), next_attempt_at),
  CONSTRAINT fk_webhook_deliveries_workspace FOREIGN KEY (workspace_id)
    REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_webhook_deliveries_webhook FOREIGN KEY (webhook_id)
    REFERENCES webhooks (id) ON DELETE CASCADE,
  CONSTRAINT fk_webhook_deliveries_property FOREIGN KEY (property_id)
    REFERENCES properties (id) ON DELETE CASCADE,
  CONSTRAINT webhook_deliveries_status_check
    CHECK (status IN ('pending','delivered','failed','dead','test'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- API keys: store ONLY the SHA-256 hash + prefix. The raw key is shown once
-- at creation and never persisted anywhere. -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_keys (
  id CHAR(36) NOT NULL PRIMARY KEY,
  workspace_id CHAR(36) NOT NULL,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  scopes JSON NOT NULL,
  revoked TINYINT(1) NOT NULL DEFAULT 0,
  usage_count BIGINT NOT NULL DEFAULT 0,
  last_used_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY api_keys_workspace_idx (workspace_id),
  CONSTRAINT fk_api_keys_workspace FOREIGN KEY (workspace_id)
    REFERENCES workspaces (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Audit log ---------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id CHAR(36) NOT NULL PRIMARY KEY,
  workspace_id CHAR(36) NOT NULL,
  actor_member_id CHAR(36) NULL,
  actor_name TEXT NOT NULL DEFAULT 'system',
  action TEXT NOT NULL,
  entity TEXT NOT NULL DEFAULT '',
  entity_id TEXT NOT NULL DEFAULT '',
  meta JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY audit_log_workspace_created_idx (workspace_id, created_at DESC),
  KEY audit_log_action_idx (workspace_id, action(100)),
  CONSTRAINT fk_audit_log_workspace FOREIGN KEY (workspace_id)
    REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_audit_log_actor FOREIGN KEY (actor_member_id)
    REFERENCES members (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Branding (per property) ----------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS branding (
  id CHAR(36) NOT NULL PRIMARY KEY,
  workspace_id CHAR(36) NOT NULL,
  property_id CHAR(36) NOT NULL,
  brand_name TEXT NOT NULL DEFAULT '',
  tagline TEXT NOT NULL DEFAULT '',
  logo_url TEXT NULL,
  theme TEXT NOT NULL DEFAULT 'light',
  accent_color TEXT NOT NULL DEFAULT '#4f46e5',
  widget_color TEXT NOT NULL DEFAULT '#4f46e5',
  widget_position TEXT NOT NULL DEFAULT 'bottom-right',
  launcher_style TEXT NOT NULL DEFAULT 'bubble',
  language TEXT NOT NULL DEFAULT 'en',
  subdomain VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY branding_property_id_uniq (property_id),
  UNIQUE KEY branding_subdomain_uniq (subdomain),
  KEY branding_property_idx (property_id),
  CONSTRAINT fk_branding_workspace FOREIGN KEY (workspace_id)
    REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_branding_property FOREIGN KEY (property_id)
    REFERENCES properties (id) ON DELETE CASCADE,
  CONSTRAINT branding_theme_check CHECK (theme IN ('light','dark')),
  CONSTRAINT branding_widget_position_check CHECK (widget_position IN ('bottom-right','bottom-left')),
  CONSTRAINT branding_launcher_style_check CHECK (launcher_style IN ('bubble','bar'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Property settings (business hours, pre-chat/offline forms, blocked list, ...) ------------------------------------------
CREATE TABLE IF NOT EXISTS property_settings (
  id CHAR(36) NOT NULL PRIMARY KEY,
  workspace_id CHAR(36) NOT NULL,
  property_id CHAR(36) NOT NULL,
  settings JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY property_settings_property_id_uniq (property_id),
  KEY property_settings_property_idx (property_id),
  CONSTRAINT fk_property_settings_workspace FOREIGN KEY (workspace_id)
    REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_property_settings_property FOREIGN KEY (property_id)
    REFERENCES properties (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Integrations (provider registry state) --------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS integrations (
  id CHAR(36) NOT NULL PRIMARY KEY,
  workspace_id CHAR(36) NOT NULL,
  provider VARCHAR(255) NOT NULL,
  name TEXT NOT NULL,
  config JSON NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY integrations_workspace_provider_uniq (workspace_id, provider),
  KEY integrations_workspace_idx (workspace_id),
  CONSTRAINT fk_integrations_workspace FOREIGN KEY (workspace_id)
    REFERENCES workspaces (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Member invites (004) --------------------------------------------------------------------------------------
-- Service-role only in Postgres (RLS deny-all); in the PHP port only the
-- privileged backend path may read token_hash / token_salt.
CREATE TABLE IF NOT EXISTS member_invites (
  id CHAR(36) NOT NULL PRIMARY KEY,
  workspace_id CHAR(36) NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'agent',
  token_hash TEXT NOT NULL,
  token_salt TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP NULL,
  created_by CHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY member_invites_workspace_idx (workspace_id, created_at DESC),
  CONSTRAINT fk_member_invites_workspace FOREIGN KEY (workspace_id)
    REFERENCES workspaces (id) ON DELETE CASCADE,
  CONSTRAINT fk_member_invites_created_by FOREIGN KEY (created_by)
    REFERENCES members (id) ON DELETE SET NULL,
  CONSTRAINT member_invites_role_check CHECK (role IN ('admin','agent','developer','viewer'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- ============================================================================
-- Triggers
-- ============================================================================

-- ----------------------------------------------------------------------------
-- updated_at auto-touch (ports Postgres touch_updated_at() on 26 tables)
-- ----------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_touch_workspaces;
CREATE TRIGGER trg_touch_workspaces BEFORE UPDATE ON workspaces
  FOR EACH ROW SET NEW.updated_at = UTC_TIMESTAMP();

DROP TRIGGER IF EXISTS trg_touch_properties;
CREATE TRIGGER trg_touch_properties BEFORE UPDATE ON properties
  FOR EACH ROW SET NEW.updated_at = UTC_TIMESTAMP();

DROP TRIGGER IF EXISTS trg_touch_contacts;
CREATE TRIGGER trg_touch_contacts BEFORE UPDATE ON contacts
  FOR EACH ROW SET NEW.updated_at = UTC_TIMESTAMP();

DROP TRIGGER IF EXISTS trg_touch_members;
CREATE TRIGGER trg_touch_members BEFORE UPDATE ON members
  FOR EACH ROW SET NEW.updated_at = UTC_TIMESTAMP();

DROP TRIGGER IF EXISTS trg_touch_member_credentials;
CREATE TRIGGER trg_touch_member_credentials BEFORE UPDATE ON member_credentials
  FOR EACH ROW SET NEW.updated_at = UTC_TIMESTAMP();

DROP TRIGGER IF EXISTS trg_touch_departments;
CREATE TRIGGER trg_touch_departments BEFORE UPDATE ON departments
  FOR EACH ROW SET NEW.updated_at = UTC_TIMESTAMP();

DROP TRIGGER IF EXISTS trg_touch_conversations;
CREATE TRIGGER trg_touch_conversations BEFORE UPDATE ON conversations
  FOR EACH ROW SET NEW.updated_at = UTC_TIMESTAMP();

DROP TRIGGER IF EXISTS trg_touch_visitors;
CREATE TRIGGER trg_touch_visitors BEFORE UPDATE ON visitors
  FOR EACH ROW SET NEW.updated_at = UTC_TIMESTAMP();

DROP TRIGGER IF EXISTS trg_touch_goals;
CREATE TRIGGER trg_touch_goals BEFORE UPDATE ON goals
  FOR EACH ROW SET NEW.updated_at = UTC_TIMESTAMP();

DROP TRIGGER IF EXISTS trg_touch_campaigns;
CREATE TRIGGER trg_touch_campaigns BEFORE UPDATE ON campaigns
  FOR EACH ROW SET NEW.updated_at = UTC_TIMESTAMP();

DROP TRIGGER IF EXISTS trg_touch_tickets;
CREATE TRIGGER trg_touch_tickets BEFORE UPDATE ON tickets
  FOR EACH ROW SET NEW.updated_at = UTC_TIMESTAMP();

DROP TRIGGER IF EXISTS trg_touch_kb_categories;
CREATE TRIGGER trg_touch_kb_categories BEFORE UPDATE ON kb_categories
  FOR EACH ROW SET NEW.updated_at = UTC_TIMESTAMP();

DROP TRIGGER IF EXISTS trg_touch_kb_articles;
CREATE TRIGGER trg_touch_kb_articles BEFORE UPDATE ON kb_articles
  FOR EACH ROW SET NEW.updated_at = UTC_TIMESTAMP();

DROP TRIGGER IF EXISTS trg_touch_canned_categories;
CREATE TRIGGER trg_touch_canned_categories BEFORE UPDATE ON canned_categories
  FOR EACH ROW SET NEW.updated_at = UTC_TIMESTAMP();

DROP TRIGGER IF EXISTS trg_touch_canned_responses;
CREATE TRIGGER trg_touch_canned_responses BEFORE UPDATE ON canned_responses
  FOR EACH ROW SET NEW.updated_at = UTC_TIMESTAMP();

DROP TRIGGER IF EXISTS trg_touch_ticket_categories;
CREATE TRIGGER trg_touch_ticket_categories BEFORE UPDATE ON ticket_categories
  FOR EACH ROW SET NEW.updated_at = UTC_TIMESTAMP();

DROP TRIGGER IF EXISTS trg_touch_triggers;
CREATE TRIGGER trg_touch_triggers BEFORE UPDATE ON triggers
  FOR EACH ROW SET NEW.updated_at = UTC_TIMESTAMP();

DROP TRIGGER IF EXISTS trg_touch_saved_views;
CREATE TRIGGER trg_touch_saved_views BEFORE UPDATE ON saved_views
  FOR EACH ROW SET NEW.updated_at = UTC_TIMESTAMP();

DROP TRIGGER IF EXISTS trg_touch_plays;
CREATE TRIGGER trg_touch_plays BEFORE UPDATE ON plays
  FOR EACH ROW SET NEW.updated_at = UTC_TIMESTAMP();

DROP TRIGGER IF EXISTS trg_touch_unanswered_questions;
CREATE TRIGGER trg_touch_unanswered_questions BEFORE UPDATE ON unanswered_questions
  FOR EACH ROW SET NEW.updated_at = UTC_TIMESTAMP();

DROP TRIGGER IF EXISTS trg_touch_webhooks;
CREATE TRIGGER trg_touch_webhooks BEFORE UPDATE ON webhooks
  FOR EACH ROW SET NEW.updated_at = UTC_TIMESTAMP();

DROP TRIGGER IF EXISTS trg_touch_webhook_deliveries;
CREATE TRIGGER trg_touch_webhook_deliveries BEFORE UPDATE ON webhook_deliveries
  FOR EACH ROW SET NEW.updated_at = UTC_TIMESTAMP();

DROP TRIGGER IF EXISTS trg_touch_api_keys;
CREATE TRIGGER trg_touch_api_keys BEFORE UPDATE ON api_keys
  FOR EACH ROW SET NEW.updated_at = UTC_TIMESTAMP();

DROP TRIGGER IF EXISTS trg_touch_branding;
CREATE TRIGGER trg_touch_branding BEFORE UPDATE ON branding
  FOR EACH ROW SET NEW.updated_at = UTC_TIMESTAMP();

DROP TRIGGER IF EXISTS trg_touch_property_settings;
CREATE TRIGGER trg_touch_property_settings BEFORE UPDATE ON property_settings
  FOR EACH ROW SET NEW.updated_at = UTC_TIMESTAMP();

DROP TRIGGER IF EXISTS trg_touch_integrations;
CREATE TRIGGER trg_touch_integrations BEFORE UPDATE ON integrations
  FOR EACH ROW SET NEW.updated_at = UTC_TIMESTAMP();

-- ----------------------------------------------------------------------------
-- Cross-workspace write guard (ports Postgres enforce_workspace_match()).
-- Rejects any child row whose workspace_id does not match its parent's.
-- ----------------------------------------------------------------------------

DELIMITER $$

DROP TRIGGER IF EXISTS trg_ws_messages_ins$$
CREATE TRIGGER trg_ws_messages_ins BEFORE INSERT ON messages
FOR EACH ROW
BEGIN
  DECLARE v_ws_0 CHAR(36) DEFAULT NULL;
  IF NEW.conversation_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_0 FROM conversations WHERE id = NEW.conversation_id;
    IF v_ws_0 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced conversations row not found';
    ELSEIF v_ws_0 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (messages.conversation_id)';
    END IF;
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_ws_messages_upd$$
CREATE TRIGGER trg_ws_messages_upd BEFORE UPDATE ON messages
FOR EACH ROW
BEGIN
  DECLARE v_ws_0 CHAR(36) DEFAULT NULL;
  IF NEW.conversation_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_0 FROM conversations WHERE id = NEW.conversation_id;
    IF v_ws_0 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced conversations row not found';
    ELSEIF v_ws_0 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (messages.conversation_id)';
    END IF;
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_ws_conversation_notes_ins$$
CREATE TRIGGER trg_ws_conversation_notes_ins BEFORE INSERT ON conversation_notes
FOR EACH ROW
BEGIN
  DECLARE v_ws_0 CHAR(36) DEFAULT NULL;
  IF NEW.conversation_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_0 FROM conversations WHERE id = NEW.conversation_id;
    IF v_ws_0 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced conversations row not found';
    ELSEIF v_ws_0 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (conversation_notes.conversation_id)';
    END IF;
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_ws_conversation_notes_upd$$
CREATE TRIGGER trg_ws_conversation_notes_upd BEFORE UPDATE ON conversation_notes
FOR EACH ROW
BEGIN
  DECLARE v_ws_0 CHAR(36) DEFAULT NULL;
  IF NEW.conversation_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_0 FROM conversations WHERE id = NEW.conversation_id;
    IF v_ws_0 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced conversations row not found';
    ELSEIF v_ws_0 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (conversation_notes.conversation_id)';
    END IF;
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_ws_contact_events_ins$$
CREATE TRIGGER trg_ws_contact_events_ins BEFORE INSERT ON contact_events
FOR EACH ROW
BEGIN
  DECLARE v_ws_0 CHAR(36) DEFAULT NULL;
  IF NEW.contact_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_0 FROM contacts WHERE id = NEW.contact_id;
    IF v_ws_0 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced contacts row not found';
    ELSEIF v_ws_0 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (contact_events.contact_id)';
    END IF;
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_ws_contact_events_upd$$
CREATE TRIGGER trg_ws_contact_events_upd BEFORE UPDATE ON contact_events
FOR EACH ROW
BEGIN
  DECLARE v_ws_0 CHAR(36) DEFAULT NULL;
  IF NEW.contact_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_0 FROM contacts WHERE id = NEW.contact_id;
    IF v_ws_0 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced contacts row not found';
    ELSEIF v_ws_0 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (contact_events.contact_id)';
    END IF;
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_ws_goal_events_ins$$
CREATE TRIGGER trg_ws_goal_events_ins BEFORE INSERT ON goal_events
FOR EACH ROW
BEGIN
  DECLARE v_ws_0 CHAR(36) DEFAULT NULL;
  IF NEW.goal_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_0 FROM goals WHERE id = NEW.goal_id;
    IF v_ws_0 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced goals row not found';
    ELSEIF v_ws_0 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (goal_events.goal_id)';
    END IF;
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_ws_goal_events_upd$$
CREATE TRIGGER trg_ws_goal_events_upd BEFORE UPDATE ON goal_events
FOR EACH ROW
BEGIN
  DECLARE v_ws_0 CHAR(36) DEFAULT NULL;
  IF NEW.goal_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_0 FROM goals WHERE id = NEW.goal_id;
    IF v_ws_0 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced goals row not found';
    ELSEIF v_ws_0 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (goal_events.goal_id)';
    END IF;
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_ws_tickets_ins$$
CREATE TRIGGER trg_ws_tickets_ins BEFORE INSERT ON tickets
FOR EACH ROW
BEGIN
  DECLARE v_ws_0 CHAR(36) DEFAULT NULL;
  DECLARE v_ws_1 CHAR(36) DEFAULT NULL;
  DECLARE v_ws_2 CHAR(36) DEFAULT NULL;
  IF NEW.conversation_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_0 FROM conversations WHERE id = NEW.conversation_id;
    IF v_ws_0 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced conversations row not found';
    ELSEIF v_ws_0 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (tickets.conversation_id)';
    END IF;
  END IF;
  IF NEW.property_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_1 FROM properties WHERE id = NEW.property_id;
    IF v_ws_1 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced properties row not found';
    ELSEIF v_ws_1 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (tickets.property_id)';
    END IF;
  END IF;
  IF NEW.assignee_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_2 FROM members WHERE id = NEW.assignee_id;
    IF v_ws_2 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced members row not found';
    ELSEIF v_ws_2 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (tickets.assignee_id)';
    END IF;
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_ws_tickets_upd$$
CREATE TRIGGER trg_ws_tickets_upd BEFORE UPDATE ON tickets
FOR EACH ROW
BEGIN
  DECLARE v_ws_0 CHAR(36) DEFAULT NULL;
  DECLARE v_ws_1 CHAR(36) DEFAULT NULL;
  DECLARE v_ws_2 CHAR(36) DEFAULT NULL;
  IF NEW.conversation_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_0 FROM conversations WHERE id = NEW.conversation_id;
    IF v_ws_0 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced conversations row not found';
    ELSEIF v_ws_0 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (tickets.conversation_id)';
    END IF;
  END IF;
  IF NEW.property_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_1 FROM properties WHERE id = NEW.property_id;
    IF v_ws_1 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced properties row not found';
    ELSEIF v_ws_1 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (tickets.property_id)';
    END IF;
  END IF;
  IF NEW.assignee_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_2 FROM members WHERE id = NEW.assignee_id;
    IF v_ws_2 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced members row not found';
    ELSEIF v_ws_2 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (tickets.assignee_id)';
    END IF;
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_ws_ratings_ins$$
CREATE TRIGGER trg_ws_ratings_ins BEFORE INSERT ON ratings
FOR EACH ROW
BEGIN
  DECLARE v_ws_0 CHAR(36) DEFAULT NULL;
  DECLARE v_ws_1 CHAR(36) DEFAULT NULL;
  DECLARE v_ws_2 CHAR(36) DEFAULT NULL;
  IF NEW.conversation_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_0 FROM conversations WHERE id = NEW.conversation_id;
    IF v_ws_0 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced conversations row not found';
    ELSEIF v_ws_0 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (ratings.conversation_id)';
    END IF;
  END IF;
  IF NEW.property_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_1 FROM properties WHERE id = NEW.property_id;
    IF v_ws_1 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced properties row not found';
    ELSEIF v_ws_1 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (ratings.property_id)';
    END IF;
  END IF;
  IF NEW.member_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_2 FROM members WHERE id = NEW.member_id;
    IF v_ws_2 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced members row not found';
    ELSEIF v_ws_2 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (ratings.member_id)';
    END IF;
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_ws_ratings_upd$$
CREATE TRIGGER trg_ws_ratings_upd BEFORE UPDATE ON ratings
FOR EACH ROW
BEGIN
  DECLARE v_ws_0 CHAR(36) DEFAULT NULL;
  DECLARE v_ws_1 CHAR(36) DEFAULT NULL;
  DECLARE v_ws_2 CHAR(36) DEFAULT NULL;
  IF NEW.conversation_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_0 FROM conversations WHERE id = NEW.conversation_id;
    IF v_ws_0 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced conversations row not found';
    ELSEIF v_ws_0 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (ratings.conversation_id)';
    END IF;
  END IF;
  IF NEW.property_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_1 FROM properties WHERE id = NEW.property_id;
    IF v_ws_1 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced properties row not found';
    ELSEIF v_ws_1 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (ratings.property_id)';
    END IF;
  END IF;
  IF NEW.member_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_2 FROM members WHERE id = NEW.member_id;
    IF v_ws_2 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced members row not found';
    ELSEIF v_ws_2 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (ratings.member_id)';
    END IF;
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_ws_unanswered_questions_ins$$
CREATE TRIGGER trg_ws_unanswered_questions_ins BEFORE INSERT ON unanswered_questions
FOR EACH ROW
BEGIN
  DECLARE v_ws_0 CHAR(36) DEFAULT NULL;
  DECLARE v_ws_1 CHAR(36) DEFAULT NULL;
  IF NEW.conversation_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_0 FROM conversations WHERE id = NEW.conversation_id;
    IF v_ws_0 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced conversations row not found';
    ELSEIF v_ws_0 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (unanswered_questions.conversation_id)';
    END IF;
  END IF;
  IF NEW.property_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_1 FROM properties WHERE id = NEW.property_id;
    IF v_ws_1 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced properties row not found';
    ELSEIF v_ws_1 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (unanswered_questions.property_id)';
    END IF;
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_ws_unanswered_questions_upd$$
CREATE TRIGGER trg_ws_unanswered_questions_upd BEFORE UPDATE ON unanswered_questions
FOR EACH ROW
BEGIN
  DECLARE v_ws_0 CHAR(36) DEFAULT NULL;
  DECLARE v_ws_1 CHAR(36) DEFAULT NULL;
  IF NEW.conversation_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_0 FROM conversations WHERE id = NEW.conversation_id;
    IF v_ws_0 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced conversations row not found';
    ELSEIF v_ws_0 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (unanswered_questions.conversation_id)';
    END IF;
  END IF;
  IF NEW.property_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_1 FROM properties WHERE id = NEW.property_id;
    IF v_ws_1 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced properties row not found';
    ELSEIF v_ws_1 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (unanswered_questions.property_id)';
    END IF;
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_ws_kb_articles_ins$$
CREATE TRIGGER trg_ws_kb_articles_ins BEFORE INSERT ON kb_articles
FOR EACH ROW
BEGIN
  DECLARE v_ws_0 CHAR(36) DEFAULT NULL;
  DECLARE v_ws_1 CHAR(36) DEFAULT NULL;
  IF NEW.category_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_0 FROM kb_categories WHERE id = NEW.category_id;
    IF v_ws_0 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced kb_categories row not found';
    ELSEIF v_ws_0 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (kb_articles.category_id)';
    END IF;
  END IF;
  IF NEW.property_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_1 FROM properties WHERE id = NEW.property_id;
    IF v_ws_1 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced properties row not found';
    ELSEIF v_ws_1 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (kb_articles.property_id)';
    END IF;
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_ws_kb_articles_upd$$
CREATE TRIGGER trg_ws_kb_articles_upd BEFORE UPDATE ON kb_articles
FOR EACH ROW
BEGIN
  DECLARE v_ws_0 CHAR(36) DEFAULT NULL;
  DECLARE v_ws_1 CHAR(36) DEFAULT NULL;
  IF NEW.category_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_0 FROM kb_categories WHERE id = NEW.category_id;
    IF v_ws_0 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced kb_categories row not found';
    ELSEIF v_ws_0 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (kb_articles.category_id)';
    END IF;
  END IF;
  IF NEW.property_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_1 FROM properties WHERE id = NEW.property_id;
    IF v_ws_1 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced properties row not found';
    ELSEIF v_ws_1 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (kb_articles.property_id)';
    END IF;
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_ws_canned_responses_ins$$
CREATE TRIGGER trg_ws_canned_responses_ins BEFORE INSERT ON canned_responses
FOR EACH ROW
BEGIN
  DECLARE v_ws_0 CHAR(36) DEFAULT NULL;
  DECLARE v_ws_1 CHAR(36) DEFAULT NULL;
  DECLARE v_ws_2 CHAR(36) DEFAULT NULL;
  IF NEW.category_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_0 FROM canned_categories WHERE id = NEW.category_id;
    IF v_ws_0 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced canned_categories row not found';
    ELSEIF v_ws_0 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (canned_responses.category_id)';
    END IF;
  END IF;
  IF NEW.property_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_1 FROM properties WHERE id = NEW.property_id;
    IF v_ws_1 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced properties row not found';
    ELSEIF v_ws_1 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (canned_responses.property_id)';
    END IF;
  END IF;
  IF NEW.owner_member_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_2 FROM members WHERE id = NEW.owner_member_id;
    IF v_ws_2 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced members row not found';
    ELSEIF v_ws_2 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (canned_responses.owner_member_id)';
    END IF;
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_ws_canned_responses_upd$$
CREATE TRIGGER trg_ws_canned_responses_upd BEFORE UPDATE ON canned_responses
FOR EACH ROW
BEGIN
  DECLARE v_ws_0 CHAR(36) DEFAULT NULL;
  DECLARE v_ws_1 CHAR(36) DEFAULT NULL;
  DECLARE v_ws_2 CHAR(36) DEFAULT NULL;
  IF NEW.category_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_0 FROM canned_categories WHERE id = NEW.category_id;
    IF v_ws_0 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced canned_categories row not found';
    ELSEIF v_ws_0 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (canned_responses.category_id)';
    END IF;
  END IF;
  IF NEW.property_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_1 FROM properties WHERE id = NEW.property_id;
    IF v_ws_1 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced properties row not found';
    ELSEIF v_ws_1 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (canned_responses.property_id)';
    END IF;
  END IF;
  IF NEW.owner_member_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_2 FROM members WHERE id = NEW.owner_member_id;
    IF v_ws_2 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced members row not found';
    ELSEIF v_ws_2 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (canned_responses.owner_member_id)';
    END IF;
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_ws_campaigns_ins$$
CREATE TRIGGER trg_ws_campaigns_ins BEFORE INSERT ON campaigns
FOR EACH ROW
BEGIN
  DECLARE v_ws_0 CHAR(36) DEFAULT NULL;
  DECLARE v_ws_1 CHAR(36) DEFAULT NULL;
  IF NEW.goal_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_0 FROM goals WHERE id = NEW.goal_id;
    IF v_ws_0 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced goals row not found';
    ELSEIF v_ws_0 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (campaigns.goal_id)';
    END IF;
  END IF;
  IF NEW.property_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_1 FROM properties WHERE id = NEW.property_id;
    IF v_ws_1 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced properties row not found';
    ELSEIF v_ws_1 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (campaigns.property_id)';
    END IF;
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_ws_campaigns_upd$$
CREATE TRIGGER trg_ws_campaigns_upd BEFORE UPDATE ON campaigns
FOR EACH ROW
BEGIN
  DECLARE v_ws_0 CHAR(36) DEFAULT NULL;
  DECLARE v_ws_1 CHAR(36) DEFAULT NULL;
  IF NEW.goal_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_0 FROM goals WHERE id = NEW.goal_id;
    IF v_ws_0 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced goals row not found';
    ELSEIF v_ws_0 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (campaigns.goal_id)';
    END IF;
  END IF;
  IF NEW.property_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_1 FROM properties WHERE id = NEW.property_id;
    IF v_ws_1 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced properties row not found';
    ELSEIF v_ws_1 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (campaigns.property_id)';
    END IF;
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_ws_departments_ins$$
CREATE TRIGGER trg_ws_departments_ins BEFORE INSERT ON departments
FOR EACH ROW
BEGIN
  DECLARE v_ws_0 CHAR(36) DEFAULT NULL;
  IF NEW.property_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_0 FROM properties WHERE id = NEW.property_id;
    IF v_ws_0 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced properties row not found';
    ELSEIF v_ws_0 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (departments.property_id)';
    END IF;
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_ws_departments_upd$$
CREATE TRIGGER trg_ws_departments_upd BEFORE UPDATE ON departments
FOR EACH ROW
BEGIN
  DECLARE v_ws_0 CHAR(36) DEFAULT NULL;
  IF NEW.property_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_0 FROM properties WHERE id = NEW.property_id;
    IF v_ws_0 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced properties row not found';
    ELSEIF v_ws_0 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (departments.property_id)';
    END IF;
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_ws_triggers_ins$$
CREATE TRIGGER trg_ws_triggers_ins BEFORE INSERT ON triggers
FOR EACH ROW
BEGIN
  DECLARE v_ws_0 CHAR(36) DEFAULT NULL;
  IF NEW.property_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_0 FROM properties WHERE id = NEW.property_id;
    IF v_ws_0 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced properties row not found';
    ELSEIF v_ws_0 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (triggers.property_id)';
    END IF;
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_ws_triggers_upd$$
CREATE TRIGGER trg_ws_triggers_upd BEFORE UPDATE ON triggers
FOR EACH ROW
BEGIN
  DECLARE v_ws_0 CHAR(36) DEFAULT NULL;
  IF NEW.property_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_0 FROM properties WHERE id = NEW.property_id;
    IF v_ws_0 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced properties row not found';
    ELSEIF v_ws_0 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (triggers.property_id)';
    END IF;
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_ws_webhooks_ins$$
CREATE TRIGGER trg_ws_webhooks_ins BEFORE INSERT ON webhooks
FOR EACH ROW
BEGIN
  DECLARE v_ws_0 CHAR(36) DEFAULT NULL;
  IF NEW.property_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_0 FROM properties WHERE id = NEW.property_id;
    IF v_ws_0 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced properties row not found';
    ELSEIF v_ws_0 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (webhooks.property_id)';
    END IF;
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_ws_webhooks_upd$$
CREATE TRIGGER trg_ws_webhooks_upd BEFORE UPDATE ON webhooks
FOR EACH ROW
BEGIN
  DECLARE v_ws_0 CHAR(36) DEFAULT NULL;
  IF NEW.property_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_0 FROM properties WHERE id = NEW.property_id;
    IF v_ws_0 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced properties row not found';
    ELSEIF v_ws_0 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (webhooks.property_id)';
    END IF;
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_ws_webhook_deliveries_ins$$
CREATE TRIGGER trg_ws_webhook_deliveries_ins BEFORE INSERT ON webhook_deliveries
FOR EACH ROW
BEGIN
  DECLARE v_ws_0 CHAR(36) DEFAULT NULL;
  IF NEW.webhook_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_0 FROM webhooks WHERE id = NEW.webhook_id;
    IF v_ws_0 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced webhooks row not found';
    ELSEIF v_ws_0 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (webhook_deliveries.webhook_id)';
    END IF;
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_ws_webhook_deliveries_upd$$
CREATE TRIGGER trg_ws_webhook_deliveries_upd BEFORE UPDATE ON webhook_deliveries
FOR EACH ROW
BEGIN
  DECLARE v_ws_0 CHAR(36) DEFAULT NULL;
  IF NEW.webhook_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_0 FROM webhooks WHERE id = NEW.webhook_id;
    IF v_ws_0 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced webhooks row not found';
    ELSEIF v_ws_0 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (webhook_deliveries.webhook_id)';
    END IF;
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_ws_visitors_ins$$
CREATE TRIGGER trg_ws_visitors_ins BEFORE INSERT ON visitors
FOR EACH ROW
BEGIN
  DECLARE v_ws_0 CHAR(36) DEFAULT NULL;
  DECLARE v_ws_1 CHAR(36) DEFAULT NULL;
  IF NEW.property_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_0 FROM properties WHERE id = NEW.property_id;
    IF v_ws_0 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced properties row not found';
    ELSEIF v_ws_0 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (visitors.property_id)';
    END IF;
  END IF;
  IF NEW.contact_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_1 FROM contacts WHERE id = NEW.contact_id;
    IF v_ws_1 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced contacts row not found';
    ELSEIF v_ws_1 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (visitors.contact_id)';
    END IF;
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_ws_visitors_upd$$
CREATE TRIGGER trg_ws_visitors_upd BEFORE UPDATE ON visitors
FOR EACH ROW
BEGIN
  DECLARE v_ws_0 CHAR(36) DEFAULT NULL;
  DECLARE v_ws_1 CHAR(36) DEFAULT NULL;
  IF NEW.property_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_0 FROM properties WHERE id = NEW.property_id;
    IF v_ws_0 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced properties row not found';
    ELSEIF v_ws_0 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (visitors.property_id)';
    END IF;
  END IF;
  IF NEW.contact_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_1 FROM contacts WHERE id = NEW.contact_id;
    IF v_ws_1 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced contacts row not found';
    ELSEIF v_ws_1 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (visitors.contact_id)';
    END IF;
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_ws_contacts_ins$$
CREATE TRIGGER trg_ws_contacts_ins BEFORE INSERT ON contacts
FOR EACH ROW
BEGIN
  DECLARE v_ws_0 CHAR(36) DEFAULT NULL;
  IF NEW.property_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_0 FROM properties WHERE id = NEW.property_id;
    IF v_ws_0 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced properties row not found';
    ELSEIF v_ws_0 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (contacts.property_id)';
    END IF;
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_ws_contacts_upd$$
CREATE TRIGGER trg_ws_contacts_upd BEFORE UPDATE ON contacts
FOR EACH ROW
BEGIN
  DECLARE v_ws_0 CHAR(36) DEFAULT NULL;
  IF NEW.property_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_0 FROM properties WHERE id = NEW.property_id;
    IF v_ws_0 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced properties row not found';
    ELSEIF v_ws_0 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (contacts.property_id)';
    END IF;
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_ws_conversations_ins$$
CREATE TRIGGER trg_ws_conversations_ins BEFORE INSERT ON conversations
FOR EACH ROW
BEGIN
  DECLARE v_ws_0 CHAR(36) DEFAULT NULL;
  DECLARE v_ws_1 CHAR(36) DEFAULT NULL;
  DECLARE v_ws_2 CHAR(36) DEFAULT NULL;
  DECLARE v_ws_3 CHAR(36) DEFAULT NULL;
  IF NEW.property_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_0 FROM properties WHERE id = NEW.property_id;
    IF v_ws_0 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced properties row not found';
    ELSEIF v_ws_0 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (conversations.property_id)';
    END IF;
  END IF;
  IF NEW.contact_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_1 FROM contacts WHERE id = NEW.contact_id;
    IF v_ws_1 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced contacts row not found';
    ELSEIF v_ws_1 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (conversations.contact_id)';
    END IF;
  END IF;
  IF NEW.department_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_2 FROM departments WHERE id = NEW.department_id;
    IF v_ws_2 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced departments row not found';
    ELSEIF v_ws_2 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (conversations.department_id)';
    END IF;
  END IF;
  IF NEW.assignee_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_3 FROM members WHERE id = NEW.assignee_id;
    IF v_ws_3 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced members row not found';
    ELSEIF v_ws_3 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (conversations.assignee_id)';
    END IF;
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_ws_conversations_upd$$
CREATE TRIGGER trg_ws_conversations_upd BEFORE UPDATE ON conversations
FOR EACH ROW
BEGIN
  DECLARE v_ws_0 CHAR(36) DEFAULT NULL;
  DECLARE v_ws_1 CHAR(36) DEFAULT NULL;
  DECLARE v_ws_2 CHAR(36) DEFAULT NULL;
  DECLARE v_ws_3 CHAR(36) DEFAULT NULL;
  IF NEW.property_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_0 FROM properties WHERE id = NEW.property_id;
    IF v_ws_0 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced properties row not found';
    ELSEIF v_ws_0 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (conversations.property_id)';
    END IF;
  END IF;
  IF NEW.contact_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_1 FROM contacts WHERE id = NEW.contact_id;
    IF v_ws_1 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced contacts row not found';
    ELSEIF v_ws_1 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (conversations.contact_id)';
    END IF;
  END IF;
  IF NEW.department_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_2 FROM departments WHERE id = NEW.department_id;
    IF v_ws_2 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced departments row not found';
    ELSEIF v_ws_2 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (conversations.department_id)';
    END IF;
  END IF;
  IF NEW.assignee_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_3 FROM members WHERE id = NEW.assignee_id;
    IF v_ws_3 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced members row not found';
    ELSEIF v_ws_3 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (conversations.assignee_id)';
    END IF;
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_ws_goals_ins$$
CREATE TRIGGER trg_ws_goals_ins BEFORE INSERT ON goals
FOR EACH ROW
BEGIN
  DECLARE v_ws_0 CHAR(36) DEFAULT NULL;
  IF NEW.property_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_0 FROM properties WHERE id = NEW.property_id;
    IF v_ws_0 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced properties row not found';
    ELSEIF v_ws_0 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (goals.property_id)';
    END IF;
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_ws_goals_upd$$
CREATE TRIGGER trg_ws_goals_upd BEFORE UPDATE ON goals
FOR EACH ROW
BEGIN
  DECLARE v_ws_0 CHAR(36) DEFAULT NULL;
  IF NEW.property_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_0 FROM properties WHERE id = NEW.property_id;
    IF v_ws_0 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced properties row not found';
    ELSEIF v_ws_0 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (goals.property_id)';
    END IF;
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_ws_branding_ins$$
CREATE TRIGGER trg_ws_branding_ins BEFORE INSERT ON branding
FOR EACH ROW
BEGIN
  DECLARE v_ws_0 CHAR(36) DEFAULT NULL;
  IF NEW.property_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_0 FROM properties WHERE id = NEW.property_id;
    IF v_ws_0 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced properties row not found';
    ELSEIF v_ws_0 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (branding.property_id)';
    END IF;
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_ws_branding_upd$$
CREATE TRIGGER trg_ws_branding_upd BEFORE UPDATE ON branding
FOR EACH ROW
BEGIN
  DECLARE v_ws_0 CHAR(36) DEFAULT NULL;
  IF NEW.property_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_0 FROM properties WHERE id = NEW.property_id;
    IF v_ws_0 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced properties row not found';
    ELSEIF v_ws_0 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (branding.property_id)';
    END IF;
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_ws_property_settings_ins$$
CREATE TRIGGER trg_ws_property_settings_ins BEFORE INSERT ON property_settings
FOR EACH ROW
BEGIN
  DECLARE v_ws_0 CHAR(36) DEFAULT NULL;
  IF NEW.property_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_0 FROM properties WHERE id = NEW.property_id;
    IF v_ws_0 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced properties row not found';
    ELSEIF v_ws_0 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (property_settings.property_id)';
    END IF;
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_ws_property_settings_upd$$
CREATE TRIGGER trg_ws_property_settings_upd BEFORE UPDATE ON property_settings
FOR EACH ROW
BEGIN
  DECLARE v_ws_0 CHAR(36) DEFAULT NULL;
  IF NEW.property_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_0 FROM properties WHERE id = NEW.property_id;
    IF v_ws_0 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced properties row not found';
    ELSEIF v_ws_0 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (property_settings.property_id)';
    END IF;
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_ws_notifications_ins$$
CREATE TRIGGER trg_ws_notifications_ins BEFORE INSERT ON notifications
FOR EACH ROW
BEGIN
  DECLARE v_ws_0 CHAR(36) DEFAULT NULL;
  IF NEW.member_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_0 FROM members WHERE id = NEW.member_id;
    IF v_ws_0 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced members row not found';
    ELSEIF v_ws_0 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (notifications.member_id)';
    END IF;
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_ws_notifications_upd$$
CREATE TRIGGER trg_ws_notifications_upd BEFORE UPDATE ON notifications
FOR EACH ROW
BEGIN
  DECLARE v_ws_0 CHAR(36) DEFAULT NULL;
  IF NEW.member_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_0 FROM members WHERE id = NEW.member_id;
    IF v_ws_0 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced members row not found';
    ELSEIF v_ws_0 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (notifications.member_id)';
    END IF;
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_ws_saved_views_ins$$
CREATE TRIGGER trg_ws_saved_views_ins BEFORE INSERT ON saved_views
FOR EACH ROW
BEGIN
  DECLARE v_ws_0 CHAR(36) DEFAULT NULL;
  IF NEW.member_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_0 FROM members WHERE id = NEW.member_id;
    IF v_ws_0 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced members row not found';
    ELSEIF v_ws_0 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (saved_views.member_id)';
    END IF;
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_ws_saved_views_upd$$
CREATE TRIGGER trg_ws_saved_views_upd BEFORE UPDATE ON saved_views
FOR EACH ROW
BEGIN
  DECLARE v_ws_0 CHAR(36) DEFAULT NULL;
  IF NEW.member_id IS NOT NULL THEN
    SELECT workspace_id INTO v_ws_0 FROM members WHERE id = NEW.member_id;
    IF v_ws_0 IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced members row not found';
    ELSEIF v_ws_0 <> NEW.workspace_id THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (saved_views.member_id)';
    END IF;
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_dept_member_ws_ins$$
CREATE TRIGGER trg_dept_member_ws_ins BEFORE INSERT ON department_members
FOR EACH ROW
BEGIN
  DECLARE v_d_ws CHAR(36) DEFAULT NULL;
  DECLARE v_m_ws CHAR(36) DEFAULT NULL;
  SELECT workspace_id INTO v_d_ws FROM departments WHERE id = NEW.department_id;
  SELECT workspace_id INTO v_m_ws FROM members WHERE id = NEW.member_id;
  IF v_d_ws IS NULL OR v_m_ws IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced department/member row not found';
  ELSEIF v_d_ws <> v_m_ws THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (department_members)';
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_dept_member_ws_upd$$
CREATE TRIGGER trg_dept_member_ws_upd BEFORE UPDATE ON department_members
FOR EACH ROW
BEGIN
  DECLARE v_d_ws CHAR(36) DEFAULT NULL;
  DECLARE v_m_ws CHAR(36) DEFAULT NULL;
  SELECT workspace_id INTO v_d_ws FROM departments WHERE id = NEW.department_id;
  SELECT workspace_id INTO v_m_ws FROM members WHERE id = NEW.member_id;
  IF v_d_ws IS NULL OR v_m_ws IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: referenced department/member row not found';
  ELSEIF v_d_ws <> v_m_ws THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'brix: workspace mismatch (department_members)';
  END IF;
END$$

DELIMITER ;

-- ----------------------------------------------------------------------------
-- Backfill webhook_deliveries.workspace_id from the parent webhook (003).
-- ----------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_delivery_ws_backfill;
CREATE TRIGGER trg_delivery_ws_backfill BEFORE INSERT ON webhook_deliveries
  FOR EACH ROW SET NEW.workspace_id = COALESCE(NEW.workspace_id,
    (SELECT workspace_id FROM webhooks WHERE id = NEW.webhook_id));
-- ============================================================================
-- Demo + Acme seed (ports 002_seed_demo.sql, plus the 'acme' workspace that the
-- frontend localStorage demo store defines in src/lib/seed.ts)
-- Idempotent: each workspace seed exits early when a workspace with its slug
-- ('demo' / 'acme') already exists, mirroring the Postgres DO-block guard.
-- The whole seed runs inside one explicit transaction.
-- ============================================================================

DROP PROCEDURE IF EXISTS brix_seed_demo;
DELIMITER $$
CREATE PROCEDURE brix_seed_demo()
seed_block: BEGIN
  DECLARE v_now TIMESTAMP DEFAULT NULL;
  -- REAL bcrypt hashes (see PASSCODES header). Public demo credentials:
  -- 'demo' workspace members all use passcode '3456'; 'acme' members '7890'.
  -- Generated with: php -r "echo password_hash('3456', PASSWORD_BCRYPT), PHP_EOL;"
  DECLARE c_hash_3456 VARCHAR(255)
    DEFAULT '$2y$10$bb5Hd4Za1UX8.kIn4ha8zudkIsm7ouCz9oA5G8I7XZvmPqLCugLHq';
  DECLARE c_hash_7890 VARCHAR(255)
    DEFAULT '$2y$10$ZrnDlG3CEJAYL1l3K9DGletOk4IfFhgCz6C3nV4pynbOZbPaa1GM6';

  DECLARE c_ws        CHAR(36) DEFAULT '2c9f14ce-7614-4cda-a34a-8f506dce5f50';
  DECLARE c_prop      CHAR(36) DEFAULT '942e5c96-cc32-4ab8-b1bf-8a5cbc3a236a';
  DECLARE c_admin     CHAR(36) DEFAULT 'ad511854-ac80-4aa6-abad-750462f48a9b';
  DECLARE c_sara      CHAR(36) DEFAULT 'd10de4ec-16ac-4c5a-b497-c90f7b5d8d90';
  DECLARE c_omar      CHAR(36) DEFAULT '1ed01f2e-a3c7-4f2f-ae52-d81d992b37a7';
  DECLARE c_dep_sales CHAR(36) DEFAULT '0bfa2c4c-5c41-4423-93ce-2597d201963b';
  DECLARE c_dep_supp  CHAR(36) DEFAULT 'd8178a1d-86ae-43cb-8168-7cc8daba679c';
  DECLARE c_conv      CHAR(36) DEFAULT 'faf0b9e5-b7cd-4025-80b3-91d7c4d213d3';
  DECLARE c_msg1      CHAR(36) DEFAULT '75685421-641d-4e0b-893c-f424db73759b';
  DECLARE c_msg2      CHAR(36) DEFAULT '9fb69100-c6ba-4fc6-bee4-2a1f5c30b437';
  DECLARE c_msg3      CHAR(36) DEFAULT '54899a43-be6d-47d2-be2a-d0aa8ecb15e8';
  DECLARE c_contact   CHAR(36) DEFAULT '01d54a41-2add-405d-b9e6-a93f140fa82a';
  DECLARE c_ticket    CHAR(36) DEFAULT 'f8bb92b8-064f-4332-a64a-b554f2feabb4';
  DECLARE c_canned1   CHAR(36) DEFAULT '4e81354a-effa-4f7b-9e83-281f331b7825';
  DECLARE c_canned2   CHAR(36) DEFAULT '6447d52a-06dc-4134-9a6a-33d2df2d91d5';
  DECLARE c_canned3   CHAR(36) DEFAULT '4f317f92-fd5c-4ee6-b246-9c77c28117af';
  DECLARE c_cat_gs    CHAR(36) DEFAULT '6a0b495b-0b0f-4b6b-8b33-aa9b813aa68d';
  DECLARE c_cat_dev   CHAR(36) DEFAULT '69d62e89-de4e-4794-84f0-a2308fe24a7f';
  DECLARE c_art1      CHAR(36) DEFAULT '7fdd58cd-dab4-4e27-8fcb-492414bc4710';
  DECLARE c_art2      CHAR(36) DEFAULT '8d28258d-d620-4f7d-9304-57ef04c1b60f';
  DECLARE c_int1      CHAR(36) DEFAULT '72c35397-941e-404d-aeb8-71e85f4f2ad6';
  DECLARE c_int2      CHAR(36) DEFAULT '258f1d8b-cd8c-4b0a-8f50-00eed3c80c7e';
  DECLARE c_int3      CHAR(36) DEFAULT 'ba5bab9d-d090-4576-9c7b-d7d6eff8f78a';
  DECLARE c_int4      CHAR(36) DEFAULT '8cf5bbf9-6077-4b4a-bdec-6c8c0b90a40e';
  DECLARE c_int5      CHAR(36) DEFAULT '30a6ef4a-e19d-4fd5-a1f9-47c70fde6cd4';
  DECLARE c_int6      CHAR(36) DEFAULT '104f6e0d-09e9-41a6-8e63-771fa7532e7d';
  DECLARE c_int7      CHAR(36) DEFAULT '2a045952-60af-4882-bcd4-020b455b1612';
  DECLARE c_int8      CHAR(36) DEFAULT '68bd108d-ccef-4719-968e-3f9da494d05b';
  DECLARE c_int9      CHAR(36) DEFAULT 'e16d288d-59cd-4004-b0be-c5395cf66c64';
  DECLARE c_int10     CHAR(36) DEFAULT 'f85872c2-f21a-43ed-900b-79cdd183a5f1';
  DECLARE c_audit1    CHAR(36) DEFAULT 'b28639f6-73e0-4822-8542-42655d541325';
  DECLARE c_branding  CHAR(36) DEFAULT '114af841-627b-4fc7-ae3c-aa6a412f2802';
  DECLARE c_psettings CHAR(36) DEFAULT '9406428f-9831-4eba-a157-4d5e06eb916b';

  IF EXISTS (SELECT 1 FROM workspaces WHERE slug = 'demo') THEN
    LEAVE seed_block;
  END IF;

  SET v_now = UTC_TIMESTAMP();

  -- Workspace + property ------------------------------------------------------
  INSERT INTO workspaces (id, name, slug)
  VALUES (c_ws, 'Demo Workspace', 'demo');

  INSERT INTO properties (id, workspace_id, name, domain, public_key, secure_mode, widget_config)
  VALUES (
    c_prop, c_ws, 'Demo Store', 'demo.brixchat.com', 'bx_demo_7f3a9c1e', 0,
    '{"color":"#4f46e5","position":"bottom-right","bubble":"round","greeting":"Hi there! How can we help you today?","offline_text":"We are currently offline. Leave a message and we will reply soon.","agent_name":"Support Team","show_branding":true,"prechat_form":false}'
  );

  -- Members (real bcrypt passcode hashes — see PASSCODES header) -------------------
  INSERT INTO members
    (id, workspace_id, display_name, initials, color, role, job_title, status)
  VALUES
    (c_admin, c_ws, 'Demo Agent', 'DA', '#4f46e5', 'admin',  'Support Lead', 'online'),
    (c_sara,  c_ws, 'Sara',       'S',  '#0891b2', 'agent',  '',             'offline'),
    (c_omar,  c_ws, 'Omar',       'O',  '#f59e0b', 'viewer', '',             'offline');

  INSERT INTO member_credentials (member_id, passcode_hash)
  VALUES
    (c_admin, c_hash_3456),
    (c_sara,  c_hash_3456),
    (c_omar,  c_hash_3456);

  -- Departments ------------------------------------------------------------------
  INSERT INTO departments
    (id, workspace_id, property_id, name, description, routing_mode, offline_behavior)
  VALUES
    (c_dep_sales, c_ws, c_prop, 'Sales',   'Pricing, plans and demos.',         'round-robin', 'ticket'),
    (c_dep_supp,  c_ws, c_prop, 'Support', 'Product help and troubleshooting.', 'least-busy',  'message');

  INSERT INTO department_members (department_id, member_id)
  VALUES (c_dep_sales, c_admin), (c_dep_supp, c_admin);

  -- Branding + property settings ----------------------------------------------------
  INSERT INTO branding
    (id, workspace_id, property_id, brand_name, tagline, theme, accent_color,
     widget_color, widget_position, launcher_style, language)
  VALUES
    (c_branding, c_ws, c_prop, 'Brix Chat', 'Chat with us — we reply fast.', 'light',
     '#4f46e5', '#4f46e5', 'bottom-right', 'bubble', 'en');

  INSERT INTO property_settings (id, workspace_id, property_id, settings)
  VALUES (
    c_psettings, c_ws, c_prop,
    '{"greeting_online":"Hi there! How can we help you today?","greeting_away":"We stepped away for a moment — leave a message and we will be right back.","greeting_offline":"We are offline right now — leave a message and we will reply soon.","offline_form_enabled":true,"offline_form_fields":["name","email","message"],"prechat_enabled":false,"prechat_fields":["name","email"],"business_hours":[{"day":1,"open":"09:00","close":"18:00"},{"day":2,"open":"09:00","close":"18:00"},{"day":3,"open":"09:00","close":"18:00"},{"day":4,"open":"09:00","close":"18:00"},{"day":5,"open":"09:00","close":"18:00"}],"timezone":"Asia/Dubai","blocked":[],"booking_url":""}'
  );

  -- Sample conversation (visitor Ayesha Khan) -----------------------------------------------
  INSERT INTO conversations
    (id, workspace_id, property_id, visitor_name, visitor_email, page_url, referrer,
     status, department_id, tags, priority, unread)
  VALUES
    (c_conv, c_ws, c_prop, 'Ayesha Khan', 'ayesha@example.com', '/pricing', 'https://google.com',
     'open', c_dep_sales, '["pricing"]', 'medium', 2);

  INSERT INTO messages (id, workspace_id, conversation_id, sender, kind, text, metadata, created_at)
  VALUES
    (c_msg1, c_ws, c_conv, 'visitor', 'text', 'Hi! Do you offer annual billing?',
     '{}', v_now - INTERVAL 26 MINUTE),
    (c_msg2, c_ws, c_conv, 'agent',   'text', 'Yes — annual plans save you two months. Want a quick walkthrough?',
     '{}', v_now - INTERVAL 24 MINUTE),
    (c_msg3, c_ws, c_conv, 'visitor', 'text', 'That would be great. Is there a trial?',
     '{}', v_now - INTERVAL 22 MINUTE);

  INSERT INTO contacts
    (id, workspace_id, property_id, name, email, country, tags, notes, source, chats_count, last_seen_at)
  VALUES
    (c_contact, c_ws, c_prop, 'Ayesha Khan', 'ayesha@example.com', 'UAE', '["lead"]',
     'Asked about annual billing.', 'chat', 2, v_now);

  -- Sample ticket (offline-form style, with SLA) --------------------------------------------
  INSERT INTO tickets
    (id, workspace_id, property_id, subject, message, requester_name, requester_email,
     status, priority, sla_due, tags)
  VALUES
    (c_ticket, c_ws, c_prop, 'Refund request #1042', 'I was charged twice for the monthly plan.',
     'Jonas Weber', 'jonas@example.com', 'new', 'high',
     v_now + INTERVAL 20 HOUR, '["billing"]');

  -- Canned responses ----------------------------------------------------------------------------
  INSERT INTO canned_responses (id, workspace_id, property_id, shortcut, title, body)
  VALUES
    (c_canned1, c_ws, c_prop, '/greet',   'Greeting',      'Hi {{visitor}}! Thanks for reaching out — how can I help you today?'),
    (c_canned2, c_ws, c_prop, '/pricing', 'Pricing info',  'Our plans start free forever; paid add-ons are listed on the pricing page.'),
    (c_canned3, c_ws, c_prop, '/offline', 'Offline reply', 'Thanks for your message! We are currently offline but will reply within one business day.');

  -- KB categories + articles --------------------------------------------------------------------------
  INSERT INTO kb_categories (id, workspace_id, property_id, name, color, position)
  VALUES
    (c_cat_gs,  c_ws, c_prop, 'Getting started', '#4f46e5', 1),
    (c_cat_dev, c_ws, c_prop, 'Developers',      '#0891b2', 2);

  INSERT INTO kb_articles
    (id, workspace_id, property_id, category_id, title, slug, body, status, views)
  VALUES
    (c_art1, c_ws, c_prop, c_cat_gs, 'Installing the widget', 'installing-the-widget',
     'Paste the embed snippet from Admin → Install before the closing </body> tag of every page.',
     'published', 128),
    (c_art2, c_ws, c_prop, c_cat_dev, 'Setting up webhooks', 'setting-up-webhooks',
     'Create an endpoint in Admin → Webhooks, subscribe to events, and verify the X-Brix-Signature header.',
     'published', 64);

  -- Integrations registry (seeded disabled; keys are entered in the app) -----------------------------------
  INSERT INTO integrations (id, workspace_id, provider, name, config, enabled)
  VALUES
    (c_int1,  c_ws, 'openai',          'OpenAI',             '{"description":"AI copilot and auto-replies","phase":"local","fields":[{"name":"api_key","label":"API key","secret":true}]}', 0),
    (c_int2,  c_ws, 'anthropic',       'Anthropic',          '{"description":"AI copilot and auto-replies","phase":"local","fields":[{"name":"api_key","label":"API key","secret":true}]}', 0),
    (c_int3,  c_ws, 'whatsapp',        'WhatsApp Cloud API', '{"description":"Send chat updates over WhatsApp","phase":"backend"}', 0),
    (c_int4,  c_ws, 'twilio',          'Twilio SMS',         '{"description":"SMS notifications","phase":"backend"}', 0),
    (c_int5,  c_ws, 'resend',          'Resend (email)',     '{"description":"Transcripts and notifications by email","phase":"backend"}', 0),
    (c_int6,  c_ws, 'slack',           'Slack',              '{"description":"Push chat alerts into Slack","phase":"backend"}', 0),
    (c_int7,  c_ws, 'shopify',         'Shopify',            '{"description":"Order context inside chats","phase":"backend"}', 0),
    (c_int8,  c_ws, 'wordpress',       'WordPress',          '{"description":"One-click widget install","phase":"backend"}', 0),
    (c_int9,  c_ws, 'zapier',          'Zapier',             '{"description":"Connect 6,000+ apps","phase":"backend"}', 0),
    (c_int10, c_ws, 'google_calendar', 'Google Calendar',    '{"description":"In-widget meeting booking","phase":"backend"}', 0);

  -- Audit trail entry ------------------------------------------------------------------
  INSERT INTO audit_log (id, workspace_id, actor_name, action, entity, entity_id, meta)
  VALUES (c_audit1, c_ws, 'system', 'workspace.seeded', 'workspace', c_ws,
          '{"note":"demo seed via 002_seed_demo.sql"}');

END$$
DELIMITER ;

START TRANSACTION;
CALL brix_seed_demo();
COMMIT;
DROP PROCEDURE brix_seed_demo;

-- ============================================================================
-- Acme seed (mirrors the frontend localStorage demo store in src/lib/seed.ts)
-- Idempotent: skipped when a workspace with slug 'acme' already exists.
-- Mirrors: seedWorkspaces() acme entry (slug 'acme', displayName 'Ava Client',
-- passcode '7890', role 'admin') + seedAcme*() data (Acme Store property,
-- Ava Client + Ben Agent team members, departments, Huda Al Farsi chat,
-- canned replies, Acme-flavored widget/branding).
-- ============================================================================

DROP PROCEDURE IF EXISTS brix_seed_acme;
DELIMITER $$
CREATE PROCEDURE brix_seed_acme()
seed_block: BEGIN
  DECLARE v_now TIMESTAMP DEFAULT NULL;
  -- Real bcrypt hash of the public acme demo passcode '7890'
  -- (see PASSCODES header — intentional public demo credential).
  DECLARE c_hash_7890 VARCHAR(255)
    DEFAULT '$2y$10$ZrnDlG3CEJAYL1l3K9DGletOk4IfFhgCz6C3nV4pynbOZbPaa1GM6';

  DECLARE a_ws        CHAR(36) DEFAULT '1182dccf-8f49-4fa0-92bb-f8136fb65a68';
  DECLARE a_prop      CHAR(36) DEFAULT '8699e07f-c974-4633-bc30-64435d4d9fb6';
  DECLARE a_ava       CHAR(36) DEFAULT '16b34bff-73e5-42fc-a2d0-bd5bbc5d3130';
  DECLARE a_ben       CHAR(36) DEFAULT '6205c5ac-63b9-4e51-80e7-19e7f189101f';
  DECLARE a_dep_sales CHAR(36) DEFAULT 'c8a476c6-126e-4263-906d-8f2562883788';
  DECLARE a_dep_supp  CHAR(36) DEFAULT '700821e6-6688-4169-8450-89a7697b4503';
  DECLARE a_conv      CHAR(36) DEFAULT '29c13ba5-2e69-4f5b-ba5b-699b42d848c1';
  DECLARE a_msg1      CHAR(36) DEFAULT '6119237b-e756-440d-b904-b1cc68a40bb2';
  DECLARE a_msg2      CHAR(36) DEFAULT '935ec586-9057-4b11-a79a-c46ea0fb7f4f';
  DECLARE a_msg3      CHAR(36) DEFAULT '5ed44618-6ade-457a-8c01-300024e56095';
  DECLARE a_contact   CHAR(36) DEFAULT '4792fb10-d26c-4c2a-8560-416dfb185f65';
  DECLARE a_canned1   CHAR(36) DEFAULT '7075643e-3a2b-4ee4-a6e4-d75f3600899d';
  DECLARE a_canned2   CHAR(36) DEFAULT '9c7b3f21-4d5e-4a8b-9c1d-2e6f8a0b4c5d';
  DECLARE a_branding  CHAR(36) DEFAULT '1f2e3d4c-5b6a-4789-9e0f-1a2b3c4d5e6f';
  DECLARE a_psettings CHAR(36) DEFAULT '2a3b4c5d-6e7f-4890-a1b2-c3d4e5f60718';
  DECLARE a_audit1    CHAR(36) DEFAULT '3b4c5d6e-7f80-49a1-b2c3-d4e5f6071829';

  IF EXISTS (SELECT 1 FROM workspaces WHERE slug = 'acme') THEN
    LEAVE seed_block;
  END IF;

  SET v_now = UTC_TIMESTAMP();

  -- Workspace + property -------------------------------------------------------
  INSERT INTO workspaces (id, name, slug)
  VALUES (a_ws, 'Acme Store', 'acme');

  INSERT INTO properties (id, workspace_id, name, domain, public_key, secure_mode, widget_config)
  VALUES (
    a_prop, a_ws, 'Acme Store', 'acme-store.brixchat.com', 'bx_acme_9d2f4a1b7e5c083d', 0,
    '{"color":"#0d9488","position":"bottom-right","bubble":"round","greeting":"Hi! Looking for gear? Ask us anything.","offline_text":"We are away — leave a message and we will reply within a few hours.","agent_name":"Acme Store team","show_branding":true,"prechat_form":false}'
  );

  -- Members (real bcrypt passcode hashes — see PASSCODES header) -----------------
  INSERT INTO members
    (id, workspace_id, display_name, initials, color, role, job_title, status)
  VALUES
    (a_ava, a_ws, 'Ava Client', 'AC', '#0d9488', 'admin', 'Store Owner', 'offline'),
    (a_ben, a_ws, 'Ben Agent',  'BA', '#4f46e5', 'agent', '',            'offline');

  INSERT INTO member_credentials (member_id, passcode_hash)
  VALUES
    (a_ava, c_hash_7890),
    (a_ben, c_hash_7890);

  -- Departments ------------------------------------------------------------------
  INSERT INTO departments
    (id, workspace_id, property_id, name, description, routing_mode, offline_behavior)
  VALUES
    (a_dep_sales, a_ws, a_prop, 'Sales',   'Orders, discounts and shipping.', 'round-robin', 'ticket'),
    (a_dep_supp,  a_ws, a_prop, 'Support', 'Returns, exchanges and order help.', 'least-busy',  'message');

  INSERT INTO department_members (department_id, member_id)
  VALUES (a_dep_sales, a_ava), (a_dep_supp, a_ava), (a_dep_sales, a_ben);

  -- Branding + property settings ---------------------------------------------------
  INSERT INTO branding
    (id, workspace_id, property_id, brand_name, tagline, theme, accent_color,
     widget_color, widget_position, launcher_style, language)
  VALUES
    (a_branding, a_ws, a_prop, 'Acme Store', 'Outdoor gear, delivered fast.', 'light',
     '#0d9488', '#0d9488', 'bottom-right', 'bubble', 'en');

  INSERT INTO property_settings (id, workspace_id, property_id, settings)
  VALUES (
    a_psettings, a_ws, a_prop,
    '{"greeting_online":"Hi! Looking for gear? Ask us anything.","greeting_away":"We stepped away for a moment — leave a message and we will be right back.","greeting_offline":"We are away — leave a message and we will reply within a few hours.","offline_form_enabled":true,"offline_form_fields":["name","email","message"],"prechat_enabled":false,"prechat_fields":["name","email"],"business_hours":[{"day":1,"open":"09:00","close":"18:00"},{"day":2,"open":"09:00","close":"18:00"},{"day":3,"open":"09:00","close":"18:00"},{"day":4,"open":"09:00","close":"18:00"},{"day":5,"open":"09:00","close":"18:00"}],"timezone":"Asia/Dubai","blocked":[],"booking_url":""}'
  );

  -- Sample conversation (visitor Huda Al Farsi — mirrors seed.ts) ------------------
  INSERT INTO conversations
    (id, workspace_id, property_id, visitor_name, visitor_email, page_url, referrer,
     status, department_id, assignee_id, tags, priority, unread)
  VALUES
    (a_conv, a_ws, a_prop, 'Huda Al Farsi', 'huda@example.com', '/products/trail-backpack-45l', '',
     'open', a_dep_sales, a_ben, '["order","shipping"]', 'medium', 1);

  INSERT INTO messages (id, workspace_id, conversation_id, sender, kind, text, metadata, created_at)
  VALUES
    (a_msg1, a_ws, a_conv, 'visitor', 'text', 'Hi! Is the Trail Backpack 45L waterproof?',
     '{}', v_now - INTERVAL 22 MINUTE),
    (a_msg2, a_ws, a_conv, 'agent',   'text', 'Hi Huda! It is water-resistant with a rain cover included — the cover packs into its own pocket. Happy to add one to your cart.',
     '{}', v_now - INTERVAL 19 MINUTE),
    (a_msg3, a_ws, a_conv, 'visitor', 'text', 'And delivery to Dubai — how long?',
     '{}', v_now - INTERVAL 6 MINUTE);

  INSERT INTO contacts
    (id, workspace_id, property_id, name, email, country, tags, notes, source, chats_count, last_seen_at)
  VALUES
    (a_contact, a_ws, a_prop, 'Huda Al Farsi', 'huda@example.com', 'UAE', '["customer"]',
     'Asked about the Trail Backpack 45L.', 'chat', 1, v_now);

  -- Canned responses --------------------------------------------------------------
  INSERT INTO canned_responses (id, workspace_id, property_id, shortcut, title, body)
  VALUES
    (a_canned1, a_ws, a_prop, '/greet',    'Greeting',            'Hi there! Welcome to Acme Store — looking for anything in particular today?'),
    (a_canned2, a_ws, a_prop, '/discount', 'First-order discount', 'Here is 10% off your first order: ACME10 — applied automatically at checkout.');

  -- Audit trail entry ------------------------------------------------------------------
  INSERT INTO audit_log (id, workspace_id, actor_name, action, entity, entity_id, meta)
  VALUES (a_audit1, a_ws, 'system', 'workspace.seeded', 'workspace', a_ws,
          '{"note":"acme seed (mirrors src/lib/seed.ts localStorage demo)"}');

END$$
DELIMITER ;

START TRANSACTION;
CALL brix_seed_acme();
COMMIT;
DROP PROCEDURE brix_seed_acme;

-- End of Brix Chat MySQL/MariaDB schema.
