// Brix Chat — phase-2 marketing content seed (100% original copy) + phase-2 API
// adapter for the §9 contract (implemented by Worker A in src/lib/api.ts).
//
// The adapter is a structural cast: method names/signatures follow §9 exactly.
// Once src/lib/api.ts implements them, the cast is transparent and these
// declarations can be deleted in favour of the real types.

import type { Envelope, Page, AuditEntry } from './api';

// ---------------------------------------------------------------------------
// Seed payloads
// ---------------------------------------------------------------------------

export interface BlogSeed {
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  tags: string[];
  author: string;
  published: boolean;
  reading_mins: number;
  category_id?: string;
}

export interface HelpSeed {
  slug: string;
  title: string;
  body: string;
  category: string;
  order: number;
  category_id?: string | null;
}

export const BLOG_SEED: BlogSeed[] = [
  {
    slug: 'thirty-second-support-gap',
    title: 'Why visitors leave without asking: the 30-second support gap',
    excerpt:
      'Most confused visitors never reach out — they decide in seconds whether help looks available. Here is how to close the gap before they leave.',
    body: `## The short answer

Visitors who hit a moment of doubt usually give your site about thirty seconds before they leave. If no help looks available in that window — no visible chat, no clear answer nearby — they bounce and you never hear from them.

## What the gap looks like in practice

It is not the angry visitor who leaves. It is the quietly uncertain one: the shopper re-reading your shipping terms, the trial user hovering over the plan picker, the reader who cannot tell which integration they need. None of them will fill out a contact form. Some will open chat — if it is obviously there.

## Why forms lose this race

A contact form asks for a commitment (name, email, a well-written message) at the exact moment confidence is lowest. Live chat asks for almost nothing: one tap, one short question. That asymmetry is the whole game.

## How to measure your own gap

Pick your five highest-exit pages and watch sessions or session replays for hesitation signals: rapid scrolling back and forth, repeated visits to the same FAQ, long pauses on pricing. If you see hesitation without a chat opening, the gap is open.

## Closing it without being intrusive

- Keep the chat launcher visible on every page, including the ones where "nobody chats".
- Use a single proactive prompt on high-exit pages, timed 25–40 seconds in, worded as a question about the page ("Comparing plans? Happy to point you at the right one.").
- Put your fastest answer — pricing, delivery, compatibility — one click away inside the widget, not three pages deep.

## The takeaway

Support that only exists after a visitor commits to asking for it is support most visitors never get. Make help visible at the moment of doubt and the thirty-second gap starts closing on its own.`,
    tags: ['conversion', 'widget'],
    author: 'Layla Haddad',
    published: true,
    reading_mins: 4,
  },
  {
    slug: 'pre-chat-forms-that-convert',
    title: 'Pre-chat forms: the 3 fields that qualify and the 5 that kill conversion',
    excerpt:
      'A pre-chat form should qualify a visitor in ten seconds, not interrogate them. Three fields worth keeping — and five to drop today.',
    body: `## The short answer

Keep: name, what they need (a short topic or department picker), and optionally email for follow-up. Drop everything else until after the conversation starts.

## The three fields that qualify

**Name.** It makes the conversation human on both sides, and it is the cheapest field you will ever ask for.

**Topic or department.** One tap — Sales, Support, Billing — routes the chat correctly and sets the agent's context before the first message.

**Email (optional, for follow-up).** Useful when your team cannot always answer instantly. Mark it optional and collect it after the first reply if you can.

## The five that kill conversion

**Phone number.** On a first contact it reads as "prepare to be called". Conversion drops hard.

**Company + role + team size.** That is a sales qualification call disguised as a chat. Earn it later.

**Full message required, minimum 50 characters.** Visitors testing the waters write "hi". Let them.

**CAPTCHA.** You are filtering bots by punishing humans. Use rate limiting instead.

**"How did you hear about us?"** Ask this after you have helped them, never before.

## The rule of thumb

If a field does not change what the agent does in the first two minutes, it does not belong before the first message. Qualify during the chat, not at the door.`,
    tags: ['widget', 'forms'],
    author: 'Marco Reyes',
    published: true,
    reading_mins: 3,
  },
  {
    slug: 'canned-responses-that-dont-sound-canned',
    title: "Canned responses that don't sound canned",
    excerpt:
      'Templates save minutes per chat — but only if visitors cannot tell they are templates. The writing rules that keep canned replies human.',
    body: `## The short answer

Write every canned response as if you are answering one specific person, use the visitor's name and the details of their case, and leave one editable sentence in the middle.

## Why most templates feel robotic

They were written for the average case, and the average case does not exist. "Thank you for contacting support" addresses nobody. "Thanks for flagging this, Ayesha — I can see the invoice from Tuesday" addresses a person.

## The rewrite rules

**Start mid-conversation, not at a greeting.** Drop "Dear valued customer" energy. "Got it — looking at your order now" beats any salutation.

**Put variables to work.** Name, order number, plan, date — every detail you can insert automatically is one less thing that smells like a script.

**Leave a gap.** End templates with an open line the agent completes: "The fastest fix is ___, which I can do right now if you'd like." The agent fills the blank in their own words.

**One idea per template.** A template that answers three questions answers none of them well. Chain short ones instead.

**Review like code.** Once a month, read your ten most-used templates and delete or rewrite the ones that make you cringe. Usage counts tell you which ones those are.

## The test

Read it out loud. If you would never say it to someone standing in front of you, do not let your team send it to someone on the other side of a screen.`,
    tags: ['agents', 'productivity'],
    author: 'Tariq Aziz',
    published: true,
    reading_mins: 4,
  },
  {
    slug: 'chat-to-ticket-handoff',
    title: 'From chat to ticket: a clean handoff playbook',
    excerpt:
      'Chats end; problems do not always end with them. A handoff playbook that turns unresolved chats into tickets without losing context.',
    body: `## The short answer

Convert the chat to a ticket before the visitor leaves: carry over the transcript, the visitor's details, and a one-line summary of what is still open. Confirm the next step and when they will hear back.

## When a chat should become a ticket

- The fix needs another team or more than a day.
- The visitor is going offline before it is resolved.
- The chat started from an offline form or a missed chat — these are tickets wearing a chat costume.

## The five-line handoff

1. **Summarize in the agent's words.** "So the remaining issue is the refund for order 1042."
2. **State the next step.** "I am sending this to our billing team now."
3. **Give a time.** "You will hear back by tomorrow, 2pm your time." Vague promises create the next angry chat.
4. **Convert, don't copy-paste.** Use the convert action so the transcript, tags and contact travel with the ticket automatically.
5. **Confirm in the ticket.** The first ticket note should repeat the summary — whoever picks it up starts informed.

## What usually goes wrong

The agent says "I will look into it" and the chat closes into nothing. No ticket, no owner, no deadline. The visitor returns in three days, angrier, and explains everything again. Every unresolved chat needs an owner the moment it ends.

## Make it automatic where it counts

Missed chats and offline-form submissions should become tickets by themselves, assigned and timestamped, so nothing depends on an agent remembering to click convert at midnight.`,
    tags: ['tickets', 'workflow'],
    author: 'Nadia Karim',
    published: true,
    reading_mins: 4,
  },
  {
    slug: 'first-response-time-matters',
    title: 'CSAT is a lagging indicator — measure first response instead',
    excerpt:
      'CSAT tells you how last week felt. First response time tells you what is happening right now — and it is the metric your team can actually move.',
    body: `## The short answer

CSAT arrives after the damage is done. First response time is visible while the chat is still alive, correlates strongly with satisfaction, and improves the moment staffing or routing improves.

## Why CSAT lags

A CSAT survey lands after resolution. By the time the score drops you are investigating history, not fixing the present. It is also noisy: response rates are low, and only the delighted and the furious bother.

## What first response time gives you

**It is immediate.** A rising median first response at 2pm tells you the 2pm shift is understaffed — today, not in next month's report.

**It is actionable.** You can change routing, add an agent, or tighten a trigger and watch the number move within the hour.

**It predicts.** Teams with a fast first response rarely have CSAT problems. The reverse is not true — polite slow service still scores badly.

## How to use both

Keep CSAT as the health check and first response time as the steering wheel. Set a target both teams understand — "under 60 seconds in business hours" — and put it on the wall, not in a quarterly deck.

## The honest caveat

Speed without substance backfires. A 10-second "looking into it!" followed by silence is worse than a 90-second real answer. Measure first response alongside resolution quality, and never bonus on speed alone.`,
    tags: ['analytics', 'metrics'],
    author: 'Layla Haddad',
    published: true,
    reading_mins: 4,
  },
  {
    slug: 'proactive-chat-timing',
    title: 'Proactive chat without being creepy: timing rules that work',
    excerpt:
      'A prompt at the wrong second feels like surveillance. The same prompt at the right second feels like service. Timing rules that keep proactive chat welcome.',
    body: `## The short answer

Trigger proactive prompts on behavior that signals a question — 25+ seconds on pricing, repeated visits to a help page, cart value above a threshold — never on page load, and never more than once per visit.

## The creepy line

Visitors accept that websites react to what they do. They do not accept being greeted the instant the page renders — that says "we were waiting for you" before they have done anything worth noticing.

## Timing rules that work

- **Wait for a signal, not a timer alone.** Time-on-page plus scroll depth, or a return visit to the same page, beats a bare 30-second delay.
- **Match the message to the page.** Pricing page: "Comparing plans? I can point you at the right one." Checkout: "Anything holding up the order — happy to help."
- **Once per visit, dismissible, remembered.** A dismissed prompt stays dismissed. A prompt that follows the visitor across pages is a pop-up with extra steps.
- **New vs returning matters.** First-time visitors need orientation; returning visitors need continuity ("Welcome back — still deciding on the Pro plan?").

## What to measure

Track prompt-to-chat rate and chat-to-goal rate per trigger. A trigger with high opens but no conversations is noise — rewrite or retire it. One good trigger beats ten mediocre ones.`,
    tags: ['campaigns', 'triggers'],
    author: 'Marco Reyes',
    published: true,
    reading_mins: 4,
  },
  {
    slug: 'unanswered-questions-log',
    title: 'The unanswered-questions log: turning misses into help articles',
    excerpt:
      'Every question your bot or team cannot answer is a free content brief. Run a weekly loop: collect the misses, draft the articles, watch the misses shrink.',
    body: `## The short answer

Keep a log of questions that got no good answer. Once a week, take the top repeats and turn them into help articles or canned responses. The log is the cheapest content strategy a support team has.

## Why misses are valuable

Answered questions teach you nothing new — the knowledge already exists. Unanswered questions point exactly at the gap between what visitors need and what your docs cover. That is a prioritized writing backlog, generated by your visitors, for free.

## The weekly loop

1. **Collect.** Every "I don't know" from the bot and every agent escalation lands in one list, with counts.
2. **Cluster.** Group near-duplicates: three phrasings of "how do I change my invoice email" are one article, not three.
3. **Draft.** Write the article or canned reply that would have answered it. Keep it short and answer-first.
4. **Close the loop.** Mark the log entries resolved by the new article, and watch next week's counts.

## What good looks like

A healthy team resolves most repeats within a week and the log trends toward genuinely new, interesting questions. A log that only grows is not a content problem — it is a sign nobody owns the loop.

## Start before you have AI

You do not need a bot for this. A shared list and a 30-minute weekly review does the job. The bot just makes the collection automatic later.`,
    tags: ['knowledge base', 'ai'],
    author: 'Tariq Aziz',
    published: true,
    reading_mins: 4,
  },
  {
    slug: 'local-first-support-software',
    title: 'Local-first support software: what stays in your browser and why',
    excerpt:
      'Brix Chat runs its full demo in your browser with no server. Here is exactly what is stored where — and what changes when a backend arrives.',
    body: `## The short answer

In local mode, everything — chats, contacts, tickets, settings, keys — lives in your browser's localStorage under one key. Nothing leaves your machine. A backend phase later moves storage server-side without changing how the product works.

## What stays in your browser

- **All workspace data:** properties, conversations, messages, contacts, tickets, articles, canned replies, campaigns, triggers.
- **Team and access:** member records, roles, passcodes, session state.
- **Integrations and keys:** API keys and third-party credentials you enter, stored locally and shown obfuscated.
- **Configuration:** widget settings, business hours, copilot preferences, security and data-retention settings.

## Why build it this way

You can evaluate the entire platform — widget, dashboard, admin, automations — with zero signup friction and zero data leaving your machine. For regulated or cautious teams, that is the difference between "let's try it" and a three-month security review.

## What is honestly limited in local mode

Real-time sync across devices, real push notifications, actual email sending, real AI calls, and real webhook HTTP delivery all need a server. The product is explicit about each of these: anything with a "backend phase" badge is configured locally today and activates when the server ships.

## What changes at backend phase

The storage layer moves to an API; method names, the admin UI and your data model stay the same. Export your local data first (Admin → Data → Export), and the migration is a restore, not a rebuild.`,
    tags: ['privacy', 'security'],
    author: 'Nadia Karim',
    published: true,
    reading_mins: 4,
  },
];

export const HELP_SEED: HelpSeed[] = [
  {
    slug: 'create-workspace',
    title: 'Create your workspace',
    body: `## What a workspace is

A workspace holds everything for one business: websites, chats, team members, settings. Most teams need exactly one.

## Steps

1. Open the signup page and choose a workspace name — usually your company name, lowercase, no spaces.
2. Pick a display name for yourself and set a passcode of at least 4 characters. You are the workspace admin.
3. You land in the agent dashboard. Head to the Admin console (top-left menu, or /admin) to add your website next.

## Good to know

- Workspace names cannot be changed later in local mode, so pick carefully.
- Your passcode is stored in this browser only. If you forget it on a fresh browser, create a new workspace and re-add your site — your data stays in the old browser.`,
    category: 'Getting started',
    order: 1,
  },
  {
    slug: 'install-widget',
    title: 'Install the widget on your website',
    body: `## Steps

1. In the Admin console, open the Properties tab and add your website (name + domain).
2. Click Snippet next to the property and copy the embed code.
3. Paste it just before the closing </body> tag on every page where you want chat.
4. Open your site in a new tab — the chat launcher should appear bottom-right within a few seconds.

## Verify it works

Open Admin → Install, pick your property, and compare the snippet on your page with the one shown. The data-property value must match your property's public key exactly.

## Optional overrides

Add data-color, data-position, data-greeting or data-locale attributes to the script tag to override dashboard defaults for one page without changing the property settings.`,
    category: 'Getting started',
    order: 2,
  },
  {
    slug: 'invite-team',
    title: 'Invite your team',
    body: `## Steps

1. Open Admin → Team and enter the member's display name.
2. Choose a role: admin (everything), agent (chats only), developer (keys and webhooks, no chat content), viewer (read-only).
3. Click Invite member — a one-time passcode appears. Share it with the person directly (message, call, password manager).
4. They log in with the workspace name + their passcode and pick their own display name.

## Roles, briefly

- **Admin** — full access including billing-adjacent settings, keys, webhooks, team.
- **Agent** — answers chats, uses canned replies, no admin screens.
- **Developer** — manages API keys and webhooks. Cannot read chat content.
- **Viewer** — can look at everything, change nothing.

## Good to know

Email invites arrive with the backend phase. In local mode, the passcode is the invite — treat it like a temporary password and rotate it if it leaks.`,
    category: 'Getting started',
    order: 3,
  },
  {
    slug: 'first-chat',
    title: 'Handle your first chat',
    body: `## Steps

1. With the widget installed, open your website in an incognito window and send a message through the widget.
2. In the dashboard, the conversation appears in the inbox under Open. Click it.
3. Reply from the composer at the bottom. The visitor sees your message in real time.
4. When done, mark the conversation resolved (or leave it open if you expect a follow-up).

## Tips for the first week

- Set your status (online / away / offline) from the agent menu so visitors see honest availability.
- Try a canned response: type / in the composer to see shortcuts.
- After a few chats, check Analytics for your first response time — aim under a minute in business hours.`,
    category: 'Getting started',
    order: 4,
  },
  {
    slug: 'pre-chat-form',
    title: 'Set up a pre-chat form',
    body: `## Steps

1. Open Admin → Properties and select your website.
2. Under Chat forms, toggle the pre-chat form on.
3. Choose the fields: name, email and topic are the recommended starting set.
4. Save. New widget sessions on that property now ask for these before the chat starts.

## Field guidance

Keep it to three fields or fewer. Name plus topic routes the chat correctly; email lets you follow up if the visitor goes offline. Phone numbers and company details belong later in the conversation, not at the door.

## Offline form

The offline form appears when no agent is online (or outside business hours) and creates a ticket automatically. Toggle it in the same section and pick which fields it asks for.`,
    category: 'How-to',
    order: 5,
  },
  {
    slug: 'triggers',
    title: 'Build a trigger (proactive message)',
    body: `## Steps

1. Open the dashboard → Triggers and click New trigger.
2. Pick the event: page view, time on page, scroll depth, exit intent, or cart value.
3. Add conditions (AND/OR): page URL contains /pricing, visitor is new, tag equals vip.
4. Choose actions: send a message, assign to a department, add a tag, set priority, or start a campaign.
5. Enable it, then use Test run to preview what a visitor would see.

## Writing the message

Match the page and the signal. "Comparing plans? I can point you at the right one." works on /pricing after 25 seconds. "Welcome!" on page load does not — it fires before the visitor has done anything worth noticing.

## Keep it polite

One proactive message per visit, dismissible, and remembered across pages. Retire triggers with high dismiss rates.`,
    category: 'How-to',
    order: 6,
  },
  {
    slug: 'campaigns',
    title: 'Send a campaign',
    body: `## Steps

1. Open the dashboard → Campaigns and click New campaign.
2. Write the message (short — two lines max) and optionally attach an image.
3. Set the audience: page URL contains, new vs returning visitors, tags.
4. Schedule it for later or send now. Drafts stay drafts until you publish.
5. Pick a goal event to track (e.g. signup, purchase) so the campaign reports attributed conversions.

## Good practice

Campaigns are announcements and nudges, not newsletters. One clear call to action, an honest audience, and a goal attached. Check delivery and goal completions in the campaign report afterwards.`,
    category: 'How-to',
    order: 7,
  },
  {
    slug: 'tickets',
    title: 'Work with tickets',
    body: `## Steps

1. Open the dashboard → Tickets to see new, open and resolved tickets.
2. Click a ticket to read the requester, message and linked transcript (if it came from a chat).
3. Assign it to an agent or department, set priority, and reply.
4. Resolve it when done. Resolved tickets stay searchable.

## Where tickets come from

Offline forms, missed chats (auto-converted), and manual creation from any conversation via the Convert to ticket action. SLA due times highlight overdue tickets automatically.

## Bulk actions

Select multiple tickets to resolve, assign or mark as spam in one go. Useful after a busy weekend or a spam wave.`,
    category: 'How-to',
    order: 8,
  },
  {
    slug: 'webhooks',
    title: 'Connect a webhook',
    body: `## Steps

1. Open Admin → Developers and click Add endpoint.
2. Enter your HTTPS URL and tick the events you want (start with message.created and ticket.created).
3. Copy the secret shown once — you need it to verify the X-Brix-Signature header.
4. Click Test fire to see the exact signed payload your endpoint will receive.

## Verifying payloads

Every delivery carries X-Brix-Signature: hex HMAC-SHA256 of "<timestamp>.<raw_body>" keyed with your secret. Reject anything older than five minutes or with a bad signature. Full code samples are in docs/WEBHOOKS.md.

## Local mode note

Configuration and signed test payloads work fully in this browser, but no real HTTP requests leave the browser until the backend phase. The event catalog, headers and signature format are already final.`,
    category: 'How-to',
    order: 9,
  },
  {
    slug: 'api-keys',
    title: 'Create an API key',
    body: `## Steps

1. Open Admin → Developers and enter a key name (e.g. "store backend").
2. Tick only the scopes the integration needs — least privilege keeps a leaked key harmless.
3. Click Create key and copy the full key immediately. It is shown once; lists show only the prefix.
4. Store it in your server's environment variables, never in frontend code.

## Managing keys

Rotate a key any time the old value stops working instantly. Revoke instead of deleting when you want the record kept for the audit log. Usage counts and last-used timestamps show on every key.

## Scopes

Available scopes: properties, conversations, contacts, tickets, kb, webhooks (read/write pairs) and metrics:read.`,
    category: 'How-to',
    order: 10,
  },
  {
    slug: 'canned-variables',
    title: 'Use variables in canned responses',
    body: `## Steps

1. Open the dashboard → Canned and create or edit a response.
2. Insert variables where personalization helps: visitor name, agent name, date, property name.
3. In a chat, type / plus the shortcut code to insert the response, then edit the middle before sending.

## Why variables matter

A template with the visitor's name and order number reads as a personal reply; the same text without them reads as a script. Variables are the cheapest personalization you have.

## Personal vs shared

Keep personal drafts for your own phrasing experiments; promote the ones that work to shared so the whole team benefits. Usage counts show which templates earn their keep.`,
    category: 'How-to',
    order: 11,
  },
  {
    slug: 'keyboard-shortcuts',
    title: 'Keyboard shortcuts',
    body: `## Inbox navigation

- **j / k** — move to the next / previous conversation
- **r** — jump to the reply composer
- **/ ** — focus search (or insert a canned response inside the composer)
- **?** — open the shortcuts help modal
- **Esc** — close dialogs and panels

## Tips

Shortcuts work when the inbox list or a conversation is focused, not while typing in a field (except / inside the composer for canned replies). Press ? any time to see the full list.`,
    category: 'How-to',
    order: 12,
  },
];

// ---------------------------------------------------------------------------
// Seeding helpers (idempotent — only seed when the store is empty)
// ---------------------------------------------------------------------------

export async function seedBlogIfEmpty(p2: Phase2Api): Promise<number> {
  const { data } = await p2.blog.list(true);
  if (data.items.length > 0) return 0;
  for (const b of BLOG_SEED) {
    await p2.blog.create(b);
  }
  return BLOG_SEED.length;
}

export async function seedHelpIfEmpty(p2: Phase2Api): Promise<number> {
  const { data } = await p2.helpDocs.list();
  if (data.items.length > 0) return 0;
  for (const a of HELP_SEED) {
    await p2.helpDocs.create(a);
  }
  return HELP_SEED.length;
}

// ---------------------------------------------------------------------------
// Phase-2 API adapter — exact §9 contract surface.
// ---------------------------------------------------------------------------

export type TicketPriority2 = 'low' | 'medium' | 'high' | 'urgent';
export interface ApiTicket2 {
  id: string; property_id: string; subject: string; message: string;
  requester_name: string; requester_email: string; status: string; priority: TicketPriority2;
  assignee_id: string | null; sla_due: number | null; conversation_id: string | null;
  tags: string[]; created_at: number; updated_at: number;
}
export interface ApiBlogPost2 {
  id: string; slug: string; title: string; excerpt: string; body: string; tags: string[];
  author: string; published: boolean; reading_mins: number; created_at: number; updated_at: number;
}
export interface ApiHelpArticle2 {
  id: string; slug: string; title: string; body: string; category: string; order: number; updated_at: number;
  published?: boolean;
  /** KB category id (api.categories, scope 'kb'); null = uncategorized. */
  category_id?: string | null;
}
export interface ApiContactMessage2 {
  id: string; name: string; email: string; subject: string; message: string; read: boolean; created_at: number;
}
export interface ApiStatusEntry2 {
  id: string; title: string; detail: string; state: 'operational' | 'degraded' | 'incident'; created_at: number;
}
export interface ApiMember2 {
  id: string; display_name: string; initials: string; color: string; role: string;
  passcode: string; last_login: number | null; status: 'online' | 'away' | 'offline'; created_at: number;
  // Extended profile fields (forward-compatible; persist once the members contract lands them).
  job_title?: string; avatar_data_url?: string | null; department_ids?: string[];
}
// ---------------------------------------------------------------------------
// Departments + routing (api.departments.*, api.routing.routeChat)
// ---------------------------------------------------------------------------
export type RoutingMode = 'round-robin' | 'least-busy' | 'first-available';
export type OfflineBehavior = 'ticket' | 'message' | 'hide';
export interface DayHours { day: number; open: string; close: string; closed: boolean; }
export interface ApiDepartment2 {
  id: string; property_id: string;
  name: string; description: string;
  agent_ids: string[];
  routing_mode: RoutingMode;
  hours_override: Array<{ day: number; open: string; close: string }> | null; // null = inherit property hours; empty open/close = closed
  offline_behavior: OfflineBehavior;
  created_at: number;
}
export interface DepartmentInput2 {
  name: string; description?: string; agent_ids?: string[];
  routing_mode?: RoutingMode;
  hours_override?: Array<{ day: number; open: string; close: string }> | null;
  offline_behavior?: OfflineBehavior;
}
// ---------------------------------------------------------------------------
// Categories (api.categories.*): KB, canned-response, and ticket categories.
// ---------------------------------------------------------------------------
export type CategoryKind = 'kb' | 'canned' | 'tickets';
export interface ApiCategory2 {
  id: string; scope: CategoryKind; property_id: string;
  name: string; color: string; created_at: number;
}
export interface CategoryInput2 { name: string; color?: string; }
// ---------------------------------------------------------------------------
// Ratings (api.ratings.*): two records per survey — kind 'csat' (1-5) and
// kind 'nps' (0-10). Low = csat ≤ 2, nps ≤ 6.
// ---------------------------------------------------------------------------
export interface ApiRating2 {
  id: string; property_id: string; conversation_id: string | null;
  agent_id: string | null; kind: 'csat' | 'nps'; score: number;
  comment: string; created_at: number;
}
export interface RatingInput2 {
  property_id: string; conversation_id?: string | null; agent_id?: string | null;
  kind: 'csat' | 'nps'; score: number; comment?: string;
}
export interface RatingsSummary2 {
  csat_avg: number | null; csat_count: number;
  nps_score: number | null; nps_count: number;
  promoters: number; passives: number; detractors: number;
  trend: Array<{ day: string; csat_avg: number | null; nps_avg: number | null; count: number }>;
}
export interface ApiUnanswered2 {
  id: string; question: string; conversation_id: string | null; count: number; dismissed: boolean; created_at: number;
}
export interface ApiIntegration2 {
  id: string; name: string; description: string; fields: Array<{ name: string; label: string; secret: boolean }>;
  values: Record<string, string>; enabled: boolean; phase: 'local' | 'backend';
}
export interface PropertySettings2 {
  greeting_online: string; greeting_away: string; greeting_offline: string;
  offline_form_enabled: boolean; offline_form_fields: string[];
  prechat_enabled: boolean; prechat_fields: string[];
  departments: Array<{ id: string; name: string }>;
  business_hours: Array<{ day: number; open: string; close: string }>;
  timezone: string; blocked: string[];
  widget_color: string; widget_position: 'bottom-right' | 'bottom-left';
  launcher_style: 'bubble' | 'bar'; language: string; booking_url: string;
  // Branding (white-label) — stored via propertySettings.patch; honored by /kb/:propertyKey.
  // custom_domain / custom_subdomain / default_department_id are not in the
  // runtime PropertySettings interface yet; patch() merges schemalessly so
  // they persist, and the adapter carries them here.
  logo_data_url: string | null; brand_name: string; tagline: string;
  accent_color: string; custom_domain: string; custom_subdomain: string;
  // Routing: default department for "when chat starts → route to department X".
  default_department_id: string;
}
export interface CopilotSettings2 {
  tone: 'friendly' | 'professional' | 'concise'; autosuggest: boolean; summarize: boolean;
  translate: boolean; sources: string[]; provider: 'local' | 'openai' | 'anthropic';
}
export interface SecuritySettings2 {
  session_timeout_mins: number; passcode_min_len: number; passcode_expiry_days: number;
}
export interface DataSettings2 { retention_days: number; auto_purge: boolean; }
export interface ApiPlay2 {
  id: string; name: string;
  steps: Array<{ kind: 'reply' | 'tag' | 'assign' | 'priority' | 'note'; value: string }>;
  created_at: number;
}
export interface ApiGoal2 { id: string; name: string; event: string; revenue: number; created_at: number; }
export interface GoalFunnel2 {
  visitors: number; chats: number;
  goals: Array<{ goal: string; count: number; revenue: number }>;
}
export interface AuditSearchOpts { actor?: string; action?: string; from?: string; to?: string; cursor?: string; limit?: number; }

export interface Phase2Api {
  blog: {
    list(publishedOnly?: boolean): Promise<Envelope<Page<ApiBlogPost2>>>;
    getBySlug(slug: string): Promise<Envelope<ApiBlogPost2>>;
    create(input: BlogSeed): Promise<Envelope<ApiBlogPost2>>;
    update(id: string, patch: Partial<BlogSeed>): Promise<Envelope<ApiBlogPost2>>;
    delete(id: string): Promise<Envelope<void>>;
  };
  helpDocs: {
    list(): Promise<Envelope<Page<ApiHelpArticle2>>>;
    getBySlug(slug: string): Promise<Envelope<ApiHelpArticle2>>;
    create(input: HelpSeed): Promise<Envelope<ApiHelpArticle2>>;
    update(id: string, patch: Partial<HelpSeed>): Promise<Envelope<ApiHelpArticle2>>;
    delete(id: string): Promise<Envelope<void>>;
  };
  contactMessages: {
    create(input: { name: string; email: string; subject: string; message: string }): Promise<Envelope<ApiContactMessage2>>;
    list(): Promise<Envelope<Page<ApiContactMessage2>>>;
    markRead(id: string): Promise<Envelope<ApiContactMessage2>>;
  };
  statusEntries: {
    list(): Promise<Envelope<Page<ApiStatusEntry2>>>;
    create(input: { title: string; detail: string; state: ApiStatusEntry2['state'] }): Promise<Envelope<ApiStatusEntry2>>;
    delete(id: string): Promise<Envelope<void>>;
  };
  members: {
    list(): Promise<Envelope<Page<ApiMember2>>>;
    create(displayName: string, role: string, passcode: string): Promise<Envelope<ApiMember2>>;
    update(id: string, patch: Partial<ApiMember2>): Promise<Envelope<ApiMember2>>;
    remove(id: string): Promise<Envelope<void>>;
    setPasscode(id: string, passcode: string): Promise<Envelope<ApiMember2>>;
    setStatus(id: string, status: ApiMember2['status']): Promise<Envelope<ApiMember2>>;
  };
  propertySettings: {
    get(propertyId: string): Promise<Envelope<PropertySettings2>>;
    patch(propertyId: string, patch: Partial<PropertySettings2>): Promise<Envelope<PropertySettings2>>;
  };
  copilotSettings: {
    get(): Promise<Envelope<CopilotSettings2>>;
    patch(patch: Partial<CopilotSettings2>): Promise<Envelope<CopilotSettings2>>;
  };
  securitySettings: {
    get(): Promise<Envelope<SecuritySettings2>>;
    patch(patch: Partial<SecuritySettings2>): Promise<Envelope<SecuritySettings2>>;
  };
  dataSettings: {
    get(): Promise<Envelope<DataSettings2>>;
    patch(patch: Partial<DataSettings2>): Promise<Envelope<DataSettings2>>;
  };
  integrations: {
    list(): Promise<Envelope<ApiIntegration2[]>>;
    patch(id: string, patch: Partial<ApiIntegration2>): Promise<Envelope<ApiIntegration2>>;
  };
  unanswered: {
    list(): Promise<Envelope<Page<ApiUnanswered2>>>;
    dismiss(id: string): Promise<Envelope<ApiUnanswered2>>;
    promote(id: string): Promise<Envelope<{ id: string; title: string }>>;
  };
  ratings: {
    create(input: RatingInput2): Promise<Envelope<ApiRating2>>;
    list(opts?: { property_id?: string; agent_id?: string; kind?: 'csat' | 'nps'; from?: number; to?: number; limit?: number }): Promise<Envelope<Page<ApiRating2>>>;
    summary(propertyId: string, days?: number): Promise<Envelope<RatingsSummary2>>;
  };
  routing: {
    routeChat(propertyId: string, departmentId?: string | null): Promise<Envelope<{ agent_id: string | null; department_id: string | null }>>;
  };
  departments: {
    list(propertyId: string): Promise<Envelope<ApiDepartment2[]>>;
    create(propertyId: string, input: DepartmentInput2): Promise<Envelope<ApiDepartment2>>;
    update(id: string, patch: Partial<DepartmentInput2>): Promise<Envelope<ApiDepartment2>>;
    delete(id: string): Promise<Envelope<{ deleted: true }>>;
  };
  categories: {
    list(scope: CategoryKind, propertyId?: string): Promise<Envelope<ApiCategory2[]>>;
    create(scope: CategoryKind, propertyId: string, name: string, color?: string): Promise<Envelope<ApiCategory2>>;
    update(id: string, patch: Partial<CategoryInput2>): Promise<Envelope<ApiCategory2>>;
    delete(id: string): Promise<Envelope<{ deleted: true }>>;
  };
  plays: {
    list(): Promise<Envelope<Page<ApiPlay2>>>;
    create(name: string, steps: ApiPlay2['steps']): Promise<Envelope<ApiPlay2>>;
    delete(id: string): Promise<Envelope<void>>;
  };
  goals: {
    list(): Promise<Envelope<Page<ApiGoal2>>>;
    create(name: string, event: string, revenue: number): Promise<Envelope<ApiGoal2>>;
    delete(id: string): Promise<Envelope<void>>;
    funnel(days: number): Promise<Envelope<GoalFunnel2>>;
  };
  audit: {
    search(opts?: AuditSearchOpts): Promise<Envelope<Page<AuditEntry>>>;
  };
  dataExport(): Promise<Envelope<unknown>>;
  dataImport(json: unknown): Promise<Envelope<{ ok: boolean }>>;
  dataReset(): Promise<Envelope<{ ok: boolean }>>;
}

/** Cast the runtime api object onto the phase-2 contract surface. */
export function asP2(api: unknown): Phase2Api {
  return api as unknown as Phase2Api;
}

export function fmtTs(v: number | string): string {
  try {
    return new Date(typeof v === 'number' ? v : v).toLocaleString();
  } catch {
    return String(v);
  }
}
