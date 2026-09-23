-- ============================================================================
-- Brix Chat — 002 demo seed
--
-- Demo workspace + property (public key bx_demo_7f3a9c1e), demo members,
-- departments, branding/settings, a sample conversation, canned responses
-- and KB articles. No real secrets: member passcodes are placeholder hashes —
-- set real ones with the member_set_passcode() RPC (or the app's team settings).
-- Idempotent: skips entirely if the demo workspace already exists.
-- ============================================================================

do $$
declare
  v_ws        uuid;
  v_prop      uuid;
  v_admin     uuid;
  v_sara      uuid;
  v_omar      uuid;
  v_dep_sales uuid;
  v_dep_supp  uuid;
  v_conv      uuid;
  v_cat_gs    uuid;
  v_cat_dev   uuid;
  v_now       timestamptz := now();
  -- Placeholder: NOT a valid bcrypt hash on purpose (member_login rejects any
  -- hash that is not bcrypt). Replace via member_set_passcode().
  c_placeholder constant text := '__PLACEHOLDER__set_via_member_set_passcode';
begin
  if exists (select 1 from public.workspaces where slug = 'demo') then
    raise notice 'demo workspace already exists — seed skipped';
    return;
  end if;

  -- Workspace + property ------------------------------------------------------
  insert into public.workspaces (name, slug)
  values ('Demo Workspace', 'demo')
  returning id into v_ws;

  insert into public.properties (workspace_id, name, domain, public_key, secure_mode, widget_config)
  values (
    v_ws, 'Demo Store', 'demo.brixchat.com', 'bx_demo_7f3a9c1e', false,
    '{"color":"#4f46e5","position":"bottom-right","bubble":"round",
      "greeting":"Hi there! How can we help you today?",
      "offline_text":"We are currently offline. Leave a message and we will reply soon.",
      "agent_name":"Support Team","show_branding":true,"prechat_form":false}'::jsonb
  )
  returning id into v_prop;

  -- Members (placeholder passcode hashes — see header) --------------------------
  insert into public.members
    (workspace_id, display_name, initials, color, role, job_title, status)
  values
    (v_ws, 'Demo Agent', 'DA', '#4f46e5', 'admin',  'Support Lead', 'online'),
    (v_ws, 'Sara',       'S',  '#0891b2', 'agent',  '',             'offline'),
    (v_ws, 'Omar',       'O',  '#f59e0b', 'viewer', '',             'offline');

  select id into v_admin from public.members where workspace_id = v_ws and display_name = 'Demo Agent';
  select id into v_sara  from public.members where workspace_id = v_ws and display_name = 'Sara';
  select id into v_omar   from public.members where workspace_id = v_ws and display_name = 'Omar';

  insert into public.member_credentials (member_id, passcode_hash)
  values
    (v_admin, c_placeholder),  -- real passcode '3456' is set via the app
    (v_sara,  c_placeholder),
    (v_omar,  c_placeholder);

  -- Departments ------------------------------------------------------------------
  insert into public.departments
    (workspace_id, property_id, name, description, routing_mode, offline_behavior)
  values
    (v_ws, v_prop, 'Sales',   'Pricing, plans and demos.',          'round-robin', 'ticket'),
    (v_ws, v_prop, 'Support', 'Product help and troubleshooting.',  'least-busy',  'message');

  select id into v_dep_sales from public.departments where property_id = v_prop and name = 'Sales';
  select id into v_dep_supp  from public.departments where property_id = v_prop and name = 'Support';

  insert into public.department_members (department_id, member_id)
  values (v_dep_sales, v_admin), (v_dep_supp, v_admin);

  -- Branding + property settings ----------------------------------------------------
  insert into public.branding
    (workspace_id, property_id, brand_name, tagline, theme, accent_color,
     widget_color, widget_position, launcher_style, language)
  values
    (v_ws, v_prop, 'Brix Chat', 'Chat with us — we reply fast.', 'light',
     '#4f46e5', '#4f46e5', 'bottom-right', 'bubble', 'en');

  insert into public.property_settings (workspace_id, property_id, settings)
  values (
    v_ws, v_prop,
    '{"greeting_online":"Hi there! How can we help you today?",
      "greeting_away":"We stepped away for a moment — leave a message and we will be right back.",
      "greeting_offline":"We are offline right now — leave a message and we will reply soon.",
      "offline_form_enabled":true,"offline_form_fields":["name","email","message"],
      "prechat_enabled":false,"prechat_fields":["name","email"],
      "business_hours":[{"day":1,"open":"09:00","close":"18:00"},
                        {"day":2,"open":"09:00","close":"18:00"},
                        {"day":3,"open":"09:00","close":"18:00"},
                        {"day":4,"open":"09:00","close":"18:00"},
                        {"day":5,"open":"09:00","close":"18:00"}],
      "timezone":"Asia/Dubai","blocked":[],"booking_url":""}'::jsonb
  );

  -- Sample conversation ---------------------------------------------------------------
  insert into public.conversations
    (workspace_id, property_id, visitor_name, visitor_email, page_url, referrer,
     status, department_id, tags, priority, unread)
  values
    (v_ws, v_prop, 'Ayesha Khan', 'ayesha@example.com', '/pricing', 'https://google.com',
     'open', v_dep_sales, array['pricing'], 'medium', 2)
  returning id into v_conv;

  insert into public.messages (workspace_id, conversation_id, sender, kind, text, created_at)
  values
    (v_ws, v_conv, 'visitor', 'text', 'Hi! Do you offer annual billing?',
     v_now - interval '26 minutes'),
    (v_ws, v_conv, 'agent',   'text', 'Yes — annual plans save you two months. Want a quick walkthrough?',
     v_now - interval '24 minutes'),
    (v_ws, v_conv, 'visitor', 'text', 'That would be great. Is there a trial?',
     v_now - interval '22 minutes');

  insert into public.contacts
    (workspace_id, property_id, name, email, country, tags, notes, source, chats_count, last_seen_at)
  values
    (v_ws, v_prop, 'Ayesha Khan', 'ayesha@example.com', 'UAE', array['lead'],
     'Asked about annual billing.', 'chat', 2, v_now);

  -- Sample ticket (offline-form style, with SLA) --------------------------------------------
  insert into public.tickets
    (workspace_id, property_id, subject, message, requester_name, requester_email,
     status, priority, sla_due, tags)
  values
    (v_ws, v_prop, 'Refund request #1042', 'I was charged twice for the monthly plan.',
     'Jonas Weber', 'jonas@example.com', 'new', 'high',
     v_now + interval '20 hours', array['billing']);

  -- Canned responses ----------------------------------------------------------------------------
  insert into public.canned_responses (workspace_id, property_id, shortcut, title, body)
  values
    (v_ws, v_prop, '/greet',   'Greeting',     'Hi {{visitor}}! Thanks for reaching out — how can I help you today?'),
    (v_ws, v_prop, '/pricing', 'Pricing info', 'Our plans start free forever; paid add-ons are listed on the pricing page.'),
    (v_ws, v_prop, '/offline', 'Offline reply','Thanks for your message! We are currently offline but will reply within one business day.');

  -- KB categories + articles --------------------------------------------------------------------------
  insert into public.kb_categories (workspace_id, property_id, name, color, position)
  values
    (v_ws, v_prop, 'Getting started', '#4f46e5', 1),
    (v_ws, v_prop, 'Developers',      '#0891b2', 2);

  select id into v_cat_gs  from public.kb_categories where property_id = v_prop and name = 'Getting started';
  select id into v_cat_dev from public.kb_categories where property_id = v_prop and name = 'Developers';

  insert into public.kb_articles
    (workspace_id, property_id, category_id, title, slug, body, status, views)
  values
    (v_ws, v_prop, v_cat_gs, 'Installing the widget', 'installing-the-widget',
     'Paste the embed snippet from Admin → Install before the closing </body> tag of every page.',
     'published', 128),
    (v_ws, v_prop, v_cat_dev, 'Setting up webhooks', 'setting-up-webhooks',
     'Create an endpoint in Admin → Webhooks, subscribe to events, and verify the X-Brix-Signature header.',
     'published', 64);

  -- Integrations registry (seeded disabled; keys are entered in the app) -----------------------------------
  insert into public.integrations (workspace_id, provider, name, config, enabled)
  values
    (v_ws, 'openai',          'OpenAI',            '{"description":"AI copilot and auto-replies","phase":"local","fields":[{"name":"api_key","label":"API key","secret":true}]}', false),
    (v_ws, 'anthropic',       'Anthropic',         '{"description":"AI copilot and auto-replies","phase":"local","fields":[{"name":"api_key","label":"API key","secret":true}]}', false),
    (v_ws, 'whatsapp',        'WhatsApp Cloud API','{"description":"Send chat updates over WhatsApp","phase":"backend"}', false),
    (v_ws, 'twilio',          'Twilio SMS',        '{"description":"SMS notifications","phase":"backend"}', false),
    (v_ws, 'resend',          'Resend (email)',    '{"description":"Transcripts and notifications by email","phase":"backend"}', false),
    (v_ws, 'slack',           'Slack',             '{"description":"Push chat alerts into Slack","phase":"backend"}', false),
    (v_ws, 'shopify',         'Shopify',           '{"description":"Order context inside chats","phase":"backend"}', false),
    (v_ws, 'wordpress',       'WordPress',         '{"description":"One-click widget install","phase":"backend"}', false),
    (v_ws, 'zapier',          'Zapier',            '{"description":"Connect 6,000+ apps","phase":"backend"}', false),
    (v_ws, 'google_calendar', 'Google Calendar',   '{"description":"In-widget meeting booking","phase":"backend"}', false);

  -- Audit trail entry ------------------------------------------------------------------
  insert into public.audit_log (workspace_id, actor_name, action, entity, entity_id, meta)
  values (v_ws, 'system', 'workspace.seeded', 'workspace', v_ws::text,
          '{"note":"demo seed via 002_seed_demo.sql"}'::jsonb);

  raise notice 'demo seed complete: workspace=% property=%', v_ws, v_prop;
end $$;
