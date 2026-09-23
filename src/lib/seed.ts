// Brix Chat — demo seed data. Timestamps are relative to "now" so the
// demo always looks alive. Original sample content written for this demo.

import type {
  Article,
  Campaign,
  Canned,
  ChatData,
  ChatMessage,
  Contact,
  Conversation,
  Settings,
  TriggerRule,
  Visitor,
  Workspace,
} from './types';
import { uid } from './utils';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function m(from: ChatMessage['from'], text: string, agoMin: number, extra?: Partial<ChatMessage>): ChatMessage {
  return { id: uid('m'), from, kind: 'text', text, ts: Date.now() - agoMin * MIN, ...extra };
}

function conv(partial: Partial<Conversation> & { messages: ChatMessage[] }): Conversation {
  const createdAt = partial.messages[0]?.ts ?? Date.now();
  return {
    id: uid('c'),
    visitor: 'Visitor',
    country: 'UAE',
    city: 'Dubai',
    page: '/pricing',
    device: 'Desktop',
    status: 'open',
    department: 'Sales',
    tags: [],
    notes: [],
    unread: 0,
    aiHandled: false,
    createdAt,
    updatedAt: partial.messages[partial.messages.length - 1]?.ts ?? Date.now(),
    ...partial,
  } as Conversation;
}

function seedConversations(): Conversation[] {
  return [
    conv({
      visitor: 'Amina Rahman', email: 'amina@noordesign.co', country: 'UAE', city: 'Dubai',
      page: '/pricing', device: 'Desktop · Chrome', department: 'Sales', agent: 'Demo Agent',
      tags: ['pricing', 'startup'], unread: 1, aiHandled: false, live: true,
      messages: [
        m('visitor', 'Hi! We’re a small design studio — how much would Brix Chat cost us?', 14),
        m('agent', 'Hi Amina! Great news: the core product is free forever — unlimited agents, unlimited sites, unlimited history.', 12, { name: 'Demo Agent' }),
        m('agent', 'Paid extras are optional flat add-ons, e.g. white-label at $19/mo per account. Nothing per-agent, ever.', 12, { name: 'Demo Agent' }),
        m('visitor', 'That sounds almost too good. What’s the catch with the free tier?', 3),
      ],
      notes: [{ id: uid('n'), text: 'Warm lead — 4-person studio, deciding this week. Offer onboarding call.', ts: Date.now() - 10 * MIN, author: 'Demo Agent' }],
    }),
    conv({
      visitor: 'Jonas Weber', email: 'jonas@alpenstore.de', country: 'Germany', city: 'Munich',
      page: '/checkout', device: 'Mobile · Safari', department: 'Support', agent: 'Demo Agent',
      tags: ['order', 'ecommerce'], unread: 0, aiHandled: true,
      messages: [
        m('visitor', 'Hey, my order #4821 hasn’t arrived yet — can you track it?', 65),
        m('ai', 'I can check that for you right now. Orders usually ship within 24 hours and tracking appears in your account once the courier scans the parcel. Could you confirm the email on the order?', 64, { name: 'Brix AI' }),
        m('visitor', 'It’s jonas@alpenstore.de', 60),
        m('ai', 'Found it — parcel left the Frankfurt hub this morning and is out for delivery today before 6pm. I’ll keep an eye on it and ping you if anything changes.', 59, { name: 'Brix AI' }),
        m('visitor', 'Perfect, thanks so much!', 58),
      ],
      rating: 5,
    }),
    conv({
      visitor: 'Priya Nair', email: 'priya@kartikashop.in', country: 'India', city: 'Bengaluru',
      page: '/integrations/shopify', device: 'Desktop · Edge', department: 'Sales', agent: 'Demo Agent',
      tags: ['shopify', 'integration'], unread: 0, aiHandled: false, live: true,
      messages: [
        m('visitor', 'Hello, do you integrate with Shopify?', 26),
        m('agent', 'Yes — one-click installer in the Shopify App Store, live in about 2 minutes. It syncs cart contents into the chat so agents see what the shopper is buying.', 24, { name: 'Demo Agent' }),
        m('visitor', 'Nice. Does it handle abandoned cart recovery?', 9),
      ],
    }),
    conv({
      visitor: 'Omar Haddad', country: 'Saudi Arabia', city: 'Riyadh',
      page: '/features/ai', device: 'Desktop · Firefox', department: 'Support',
      tags: ['bug'], status: 'open', unread: 0, aiHandled: false,
      messages: [
        m('visitor', 'Hi, I’m getting an error when I try to install the widget — it says “invalid key”.', 190),
        m('agent', 'Thanks for flagging this. That usually means the property key has a typo — keys are 24 characters. Could you paste the snippet you used? (Remove nothing, I’ll spot it.)', 180, { name: 'Demo Agent' }),
        m('visitor', 'Ah wait, I copied it from the staging property. My bad — works now!', 170),
        m('agent', 'Happens to everyone! Glad it’s working. Anything else I can help with?', 168, { name: 'Demo Agent' }),
      ],
    }),
    conv({
      visitor: 'Sofia Marino', email: 'sofia@bellacasa.it', country: 'Italy', city: 'Milan',
      page: '/pricing', device: 'Mobile · Chrome', department: 'Billing', agent: 'Demo Agent',
      tags: ['billing'], status: 'closed', unread: 0, aiHandled: false, rating: 4,
      messages: [
        m('visitor', 'Hey, I was charged twice this month. Can you help?', 2 * 24 * 60 + 40),
        m('agent', 'Of course, Sofia — let me look into that right away. Could you share the invoice number?', 2 * 24 * 60 + 30, { name: 'Demo Agent' }),
        m('visitor', 'INV-2026-0917', 2 * 24 * 60 + 22),
        m('agent', 'Found it — a duplicate charge from a retried payment. I’ve refunded the second charge in full; it lands back in 3–5 business days. Sorry for the hassle!', 2 * 24 * 60 + 15, { name: 'Demo Agent' }),
        m('visitor', 'Thanks for the quick fix!', 2 * 24 * 60 + 10),
        m('system', 'Sofia rated this chat 4/5.', 2 * 24 * 60 + 9),
      ],
    }),
    conv({
      visitor: 'Liam Carter', country: 'United Kingdom', city: 'London',
      page: '/features/triggers', device: 'Desktop · Chrome', department: 'Sales',
      tags: ['demo'], status: 'closed', unread: 0, aiHandled: false, rating: 5,
      messages: [
        m('visitor', 'Good morning! Can I book a demo of the dashboard?', 3 * 24 * 60 + 120),
        m('agent', 'Absolutely — I’ve booked you in for Thursday 11:00 GST with our product specialist. You’ll get a calendar invite shortly.', 3 * 24 * 60 + 100, { name: 'Demo Agent' }),
        m('visitor', 'Brilliant, see you then.', 3 * 24 * 60 + 95),
        m('system', 'Liam rated this chat 5/5.', 3 * 24 * 60 + 94),
      ],
    }),
    conv({
      visitor: 'spam-bot-88213', country: 'Unknown', city: '—', page: '/', device: 'Bot',
      department: 'Support', status: 'spam', unread: 0, aiHandled: false, tags: ['spam'],
      messages: [
        m('visitor', 'CHECK OUT cheap-followers-4u.example — 10k followers $5!!!', 5 * 24 * 60),
        m('system', 'Auto-flagged as spam by content filter.', 5 * 24 * 60 - 1),
      ],
    }),
    conv({
      visitor: 'Nadia Ali', email: 'nadia@fintech.example', country: 'UAE', city: 'Abu Dhabi',
      page: '/pricing', device: 'Desktop · Safari', department: 'Support',
      status: 'missed', unread: 0, aiHandled: false, tags: ['missed'],
      messages: [
        m('visitor', 'Is anyone there? I have a question about data retention.', 8 * 60),
        m('system', 'Chat missed — no agent available. Ticket #T-1042 created.', 3 * 60),
      ],
    }),
  ];
}

function seedVisitors(): Visitor[] {
  return [
    { id: uid('v'), name: 'Guest #4412', page: '/pricing', pages: 4, country: 'UAE', city: 'Dubai', device: 'Desktop', browser: 'Chrome', timeOnSite: 185, typing: 'Do you have a Shopify…', online: true, cartValue: 240 },
    { id: uid('v'), name: 'Guest #4413', page: '/features/ai', pages: 2, country: 'Saudi Arabia', city: 'Jeddah', device: 'Mobile', browser: 'Safari', timeOnSite: 64, online: true },
    { id: uid('v'), name: 'Marco P.', page: '/checkout', pages: 6, country: 'Italy', city: 'Rome', device: 'Mobile', browser: 'Chrome', timeOnSite: 322, online: true, cartValue: 89 },
    { id: uid('v'), name: 'Guest #4415', page: '/blog/live-chat-tips', pages: 1, country: 'India', city: 'Mumbai', device: 'Desktop', browser: 'Edge', timeOnSite: 41, online: true },
    { id: uid('v'), name: 'Sara K.', page: '/pricing', pages: 3, country: 'UAE', city: 'Sharjah', device: 'Tablet', browser: 'Safari', timeOnSite: 129, online: true },
    { id: uid('v'), name: 'Guest #4417', page: '/', pages: 1, country: 'United States', city: 'Austin', device: 'Desktop', browser: 'Firefox', timeOnSite: 12, online: false },
  ];
}

function seedContacts(): Contact[] {
  const rows: Array<[string, string, string, string, string[], number, number, string]> = [
    ['Amina Rahman', 'amina@noordesign.co', '+971 50 123 4567', 'UAE', ['lead', 'studio'], 3, 1, 'Chat'],
    ['Jonas Weber', 'jonas@alpenstore.de', '', 'Germany', ['customer', 'ecommerce'], 5, 8, 'Chat'],
    ['Priya Nair', 'priya@kartikashop.in', '+91 98 0000 1122', 'India', ['lead', 'shopify'], 2, 3, 'Chat'],
    ['Omar Haddad', 'omar.h@example.com', '', 'Saudi Arabia', ['customer'], 4, 15, 'Widget'],
    ['Sofia Marino', 'sofia@bellacasa.it', '+39 340 000 7788', 'Italy', ['customer', 'vip'], 6, 40, 'Chat'],
    ['Liam Carter', 'liam@carterdev.co.uk', '', 'United Kingdom', ['lead', 'demo-booked'], 2, 2, 'Chat'],
    ['Nadia Ali', 'nadia@fintech.example', '+971 55 999 0011', 'UAE', ['lead', 'compliance'], 1, 0, 'Offline form'],
    ['Chen Wei', 'chen@brightmart.sg', '', 'Singapore', ['customer', 'ecommerce'], 7, 22, 'Chat'],
    ['Fatima Noor', 'fatima@noorlabs.ae', '+971 52 444 8899', 'UAE', ['partner'], 1, 1, 'Manual'],
    ['Diego Fuentes', 'diego@tiendafacil.mx', '', 'Mexico', ['lead'], 0, 0, 'Campaign'],
  ];
  return rows.map(([name, email, phone, country, tags, chats, daysAgo, source]) => ({
    id: uid('ct'), name, email, phone: phone || undefined, country, tags, chats,
    notes: '', lastSeen: Date.now() - daysAgo * DAY - 3 * HOUR, source,
  }));
}

function seedArticles(): Article[] {
  return [
    {
      id: uid('a'), title: 'Installing the widget on any website', slug: 'install-widget',
      category: 'Getting started', status: 'published', updatedAt: Date.now() - 6 * DAY, views: 1842,
      body: 'Paste one script tag before the closing </body> tag of your site. The widget loads asynchronously, so it never slows down your pages.\n\n1. Open Settings → Installation in your Brix Chat dashboard.\n2. Copy the embed snippet.\n3. Paste it into your site template or tag manager.\n\nThe chat bubble appears bottom-right by default. Change colors, position and greeting text under Settings → Widget appearance — no code needed.',
    },
    {
      id: uid('a'), title: 'Setting up proactive triggers', slug: 'proactive-triggers',
      category: 'Guides', status: 'published', updatedAt: Date.now() - 3 * DAY, views: 964,
      body: 'Triggers start conversations before visitors ask. A good starter set:\n\n• Pricing page, 45+ seconds → “Questions about plans? I can help.”\n• Cart value over $100, idle 60s → offer checkout help.\n• Exit intent on the pricing page → one-time discount nudge.\n\nKeep auto-messages to one per visit. Every trigger can be limited to once per visitor so you never feel spammy.',
    },
    {
      id: uid('a'), title: 'How the AI copilot drafts replies', slug: 'ai-copilot',
      category: 'AI', status: 'published', updatedAt: Date.now() - 1 * DAY, views: 731,
      body: 'The copilot reads the live thread and suggests three reply drafts — professional, friendly and concise. One click inserts a draft into your reply box; you always send it yourself.\n\nIt can also summarize long threads in one click and rewrite your draft in a different tone. The AI never sends messages on its own unless you enable “AI answers first” in Settings.',
    },
    {
      id: uid('a'), title: 'Data retention and GDPR exports', slug: 'data-retention-gdpr',
      category: 'Guides', status: 'draft', updatedAt: Date.now() - 5 * HOUR, views: 0,
      body: 'Draft: scheduled auto-purge rules (e.g. delete closed chats after 12 months), per-contact export, and right-to-erasure workflow. Finish before publishing.',
    },
  ];
}

function seedCanned(): Canned[] {
  return [
    { id: uid('cc'), shortcut: '/greet', title: 'Greeting', body: 'Hi there! Thanks for reaching out — how can I help you today?' },
    { id: uid('cc'), shortcut: '/pricing', title: 'Pricing explainer', body: 'Our core is free forever: unlimited agents, sites and history. Extras like white-label ($19/mo) and AI packs ($29/mo) are optional flat add-ons per account.' },
    { id: uid('cc'), shortcut: '/shipping', title: 'Shipping status', body: 'I’ve checked your order — it’s on the way! Tracking updates appear in your account as soon as the courier scans the parcel.' },
    { id: uid('cc'), shortcut: '/refund', title: 'Refund policy', body: 'Anything billed in the last 30 days can be refunded in full. I’ve started the refund — it lands back in 3–5 business days.' },
    { id: uid('cc'), shortcut: '/offline', title: 'Offline follow-up', body: 'Thanks for your message! We’re currently offline, but I’ve created a ticket and we’ll reply within a few hours.' },
    { id: uid('cc'), shortcut: '/csat', title: 'Ask for rating', body: 'Before you go — how was your experience today? A quick 1–5 rating helps us a lot. ⭐' },
  ];
}

function seedTriggers(): TriggerRule[] {
  return [
    { id: uid('t'), name: 'Pricing page nudge', kind: 'proactive', conditions: ['URL contains /pricing', 'Time on page > 45s'], action: 'Show message: “Questions about plans? I can help you compare.”', enabled: true },
    { id: uid('t'), name: 'High-value cart rescue', kind: 'proactive', conditions: ['Cart value > $100', 'Idle > 60s'], action: 'Open chat with: “Need a hand finishing checkout? I can apply your discount.”', enabled: true },
    { id: uid('t'), name: 'Exit intent on pricing', kind: 'proactive', conditions: ['Exit intent', 'URL contains /pricing', 'Once per visitor'], action: 'Show message: “Wait — here’s 20% off your first 3 months: WELCOME20.”', enabled: false },
    { id: uid('t'), name: 'Route billing keywords', kind: 'routing', conditions: ['Message contains: refund, invoice, charged, billing'], action: 'Route to department: Billing', enabled: true },
    { id: uid('t'), name: 'Route VIP contacts', kind: 'routing', conditions: ['Contact tag = vip'], action: 'Assign to: senior agent on duty', enabled: true },
  ];
}

function seedCampaigns(): Campaign[] {
  return [
    { id: uid('cp'), name: 'Spring AI add-on launch', audience: 'Visitors who viewed /features/ai in last 30 days', message: 'Our AI copilot now drafts replies in 3 tones — try it free for 14 days.', schedule: '2026-09-25 10:00 GST', status: 'scheduled' },
    { id: uid('cp'), name: 'Cart abandoners — September', audience: 'Carts > $50 abandoned in last 7 days', message: 'Still thinking it over? Here’s 10% off to complete your order today.', schedule: 'Draft — not scheduled', status: 'draft' },
  ];
}

function seedSettings(): Settings {
  return {
    widget: {
      color: '#4f46e5', position: 'bottom-right', bubble: 'round', radius: 16,
      greeting: 'Hi there! How can we help you today?',
      offlineText: 'We’re offline right now — leave a message and we’ll reply soon.',
      agentName: 'Support Team', showBranding: true,
    },
    departments: ['Sales', 'Support', 'Billing'],
    team: [
      { name: 'Demo Agent', role: 'Admin', online: true, color: '#4f46e5' },
      { name: 'Sara Iqbal', role: 'Agent', online: true, color: '#0891b2' },
      { name: 'Tom Becker', role: 'Agent', online: false, color: '#7c3aed' },
      { name: 'Lina Farah', role: 'Agent', online: true, color: '#059669' },
    ],
    hours: [
      { day: 'Monday', from: '09:00', to: '18:00', enabled: true },
      { day: 'Tuesday', from: '09:00', to: '18:00', enabled: true },
      { day: 'Wednesday', from: '09:00', to: '18:00', enabled: true },
      { day: 'Thursday', from: '09:00', to: '18:00', enabled: true },
      { day: 'Friday', from: '09:00', to: '18:00', enabled: true },
      { day: 'Saturday', from: '10:00', to: '14:00', enabled: false },
      { day: 'Sunday', from: '10:00', to: '14:00', enabled: false },
    ],
    whiteLabel: false,
    aiEnabled: true,
    notifySound: true,
  };
}

export function seedWorkspaces(): Record<string, Workspace> {
  return {
    demo: { name: 'demo', displayName: 'Demo Agent', passcode: '3456', role: 'owner', createdAt: Date.now() - 30 * DAY },
    acme: { name: 'acme', displayName: 'Ava Client', passcode: '7890', role: 'admin', createdAt: Date.now() - 12 * DAY },
  };
}

export function seedData(): ChatData {
  return {
    conversations: seedConversations(),
    visitors: seedVisitors(),
    contacts: seedContacts(),
    articles: seedArticles(),
    canned: seedCanned(),
    triggers: seedTriggers(),
    campaigns: seedCampaigns(),
    settings: seedSettings(),
  };
}

// --- per-workspace ChatData ---------------------------------------------------
// The API layer seeds each workspace with its own data (see api.ts
// seedWorkspace). The store-side ChatData (Inbox/Triggers/etc. still read it)
// needs the same treatment so e.g. the Acme Store dashboard never shows the
// generic Brix Chat demo content.

function seedAcmeConversations(): Conversation[] {
  return [
    conv({
      visitor: 'Huda Al Farsi', email: 'huda@example.com', country: 'UAE', city: 'Dubai',
      page: '/products/trail-backpack-45l', device: 'Mobile · Safari', department: 'Sales', agent: 'Ben Agent',
      tags: ['order', 'shipping'], unread: 1, aiHandled: false, live: true,
      messages: [
        m('visitor', 'Hi! Is the Trail Backpack 45L waterproof?', 22),
        m('agent', 'Hi Huda! It’s water-resistant with a rain cover included — the cover packs into its own pocket. Happy to add one to your cart.', 19, { name: 'Ben Agent' }),
        m('visitor', 'And delivery to Dubai — how long?', 6),
      ],
    }),
    conv({
      visitor: 'Tariq Aziz', email: 'tariq@example.com', country: 'UAE', city: 'Sharjah',
      page: '/checkout', device: 'Desktop · Chrome', department: 'Support', agent: 'Ava Client',
      tags: ['refund'], unread: 0, aiHandled: false, live: true,
      messages: [
        m('visitor', 'Hello, order #A-2214 arrived with the wrong size. Can I exchange it?', 48),
        m('agent', 'Of course, Tariq — sorry about that! I’ve booked a free courier pickup for tomorrow and the correct size ships the same day. Anything else?', 41, { name: 'Ava Client' }),
        m('visitor', 'That’s perfect, thank you!', 38),
      ],
      rating: 5,
    }),
    conv({
      visitor: 'Guest #9031', country: 'Saudi Arabia', city: 'Riyadh',
      page: '/products/summit-tent-2p', device: 'Mobile · Chrome', department: 'Sales',
      tags: ['pricing'], status: 'open', unread: 0, aiHandled: true,
      messages: [
        m('visitor', 'Does the Summit Tent fit 2 adults + a kid?', 75),
        m('ai', 'Yes — it’s a true 2-person tent with a vestibule that comfortably fits a child’s mat. Setup takes about 8 minutes with the color-coded poles.', 74, { name: 'Brix AI' }),
        m('visitor', 'Nice. Is there a discount code right now?', 70),
      ],
    }),
    conv({
      visitor: 'Maria Santos', email: 'maria@example.com', country: 'UAE', city: 'Abu Dhabi',
      page: '/track-order', device: 'Desktop · Edge', department: 'Support', agent: 'Ben Agent',
      tags: ['order'], status: 'closed', unread: 0, aiHandled: false, rating: 4,
      messages: [
        m('visitor', 'My parcel has been “out for delivery” for two days. Order #A-2198.', 3 * 24 * 60 + 90),
        m('agent', 'Let me check with the courier right now, Maria.', 3 * 24 * 60 + 85, { name: 'Ben Agent' }),
        m('agent', 'Found it — the courier attempted delivery while you were out. I’ve rebooked it for tomorrow morning, 9–12. Sorry for the wait!', 3 * 24 * 60 + 60, { name: 'Ben Agent' }),
        m('visitor', 'Thanks for sorting it out quickly.', 3 * 24 * 60 + 55),
      ],
    }),
  ];
}

function seedAcmeVisitors(): Visitor[] {
  return [
    { id: uid('v'), name: 'Guest #9031', page: '/products/summit-tent-2p', pages: 5, country: 'Saudi Arabia', city: 'Riyadh', device: 'Mobile', browser: 'Chrome', timeOnSite: 210, typing: 'Does the Summit Tent…', online: true, cartValue: 349 },
    { id: uid('v'), name: 'Guest #9032', page: '/products/trail-backpack-45l', pages: 3, country: 'UAE', city: 'Dubai', device: 'Mobile', browser: 'Safari', timeOnSite: 96, online: true, cartValue: 129 },
    { id: uid('v'), name: 'Omar K.', page: '/checkout', pages: 7, country: 'Kuwait', city: 'Kuwait City', device: 'Desktop', browser: 'Chrome', timeOnSite: 340, online: true, cartValue: 512 },
    { id: uid('v'), name: 'Guest #9034', page: '/', pages: 1, country: 'UAE', city: 'Ajman', device: 'Desktop', browser: 'Firefox', timeOnSite: 28, online: true },
  ];
}

function seedAcmeContacts(): Contact[] {
  const rows: Array<[string, string, string, string, string[], number, number, string]> = [
    ['Huda Al Farsi', 'huda@example.com', '+971 50 222 3344', 'UAE', ['lead'], 1, 0, 'Chat'],
    ['Tariq Aziz', 'tariq@example.com', '', 'UAE', ['customer'], 2, 4, 'Chat'],
    ['Maria Santos', 'maria@example.com', '+971 55 777 8899', 'UAE', ['customer', 'vip'], 5, 30, 'Chat'],
    ['Omar Khalidi', 'omar.k@example.com', '', 'Kuwait', ['lead', 'cart-512'], 0, 0, 'Widget'],
  ];
  return rows.map(([name, email, phone, country, tags, chats, daysAgo, source]) => ({
    id: uid('ct'), name, email, phone: phone || undefined, country, tags, chats,
    notes: '', lastSeen: Date.now() - daysAgo * DAY - 2 * HOUR, source,
  }));
}

function seedAcmeArticles(): Article[] {
  return [
    {
      id: uid('a'), title: 'Shipping & delivery times', slug: 'shipping-delivery',
      category: 'Orders', status: 'published', updatedAt: Date.now() - 4 * DAY, views: 612,
      body: 'Orders placed before 2pm GST ship the same day from our Dubai warehouse. Delivery takes 1–2 business days within the UAE and 3–5 days across the GCC. Tracking is emailed as soon as the courier collects the parcel.',
    },
    {
      id: uid('a'), title: 'Returns & exchanges', slug: 'returns-exchanges',
      category: 'Orders', status: 'published', updatedAt: Date.now() - 9 * DAY, views: 488,
      body: 'Unused gear can be returned within 30 days for a full refund. Exchanges are free — we book the courier pickup and ship the replacement the same day. Start a return from your account page or ask us here in chat.',
    },
  ];
}

function seedAcmeCanned(): Canned[] {
  return [
    { id: uid('cc'), shortcut: '/greet', title: 'Greeting', body: 'Hi there! Welcome to Acme Store — looking for anything in particular today?' },
    { id: uid('cc'), shortcut: '/shipping', title: 'Shipping times', body: 'Orders ship same-day before 2pm GST: 1–2 days in the UAE, 3–5 days across the GCC. I’ll share tracking as soon as it’s on its way!' },
    { id: uid('cc'), shortcut: '/returns', title: 'Returns', body: 'No problem — returns are free within 30 days. I’ve booked your pickup; the refund lands 3–5 business days after we receive it.' },
    { id: uid('cc'), shortcut: '/discount', title: 'First-order discount', body: 'Here’s 10% off your first order: ACME10 — applied automatically at checkout.' },
  ];
}

function seedAcmeTriggers(): TriggerRule[] {
  return [
    { id: uid('t'), name: 'High-value cart rescue', kind: 'proactive', conditions: ['Cart value > $200', 'Idle > 60s'], action: 'Open chat with: “Need a hand finishing checkout? I can apply ACME10 for you.”', enabled: true },
    { id: uid('t'), name: 'Route order keywords', kind: 'routing', conditions: ['Message contains: order, delivery, tracking, refund, exchange'], action: 'Route to department: Support', enabled: true },
  ];
}

function seedAcmeCampaigns(): Campaign[] {
  return [
    { id: uid('cp'), name: 'Camping season kickoff', audience: 'Visitors who viewed tents or backpacks in last 30 days', message: 'Camping season is here 🏕️ — 15% off tents & backpacks this weekend with code CAMP15.', schedule: '2026-09-26 10:00 GST', status: 'scheduled' },
  ];
}

function seedAcmeSettings(): Settings {
  return {
    widget: {
      color: '#0d9488', position: 'bottom-right', bubble: 'round', radius: 16,
      greeting: 'Hi! Looking for gear? Ask us anything.',
      offlineText: 'We’re away — leave a message and we’ll reply within a few hours.',
      agentName: 'Acme Store team', showBranding: true,
    },
    departments: ['Sales', 'Support'],
    team: [
      { name: 'Ava Client', role: 'Admin', online: false, color: '#0d9488' },
      { name: 'Ben Agent', role: 'Agent', online: false, color: '#4f46e5' },
    ],
    hours: [
      { day: 'Monday', from: '09:00', to: '18:00', enabled: true },
      { day: 'Tuesday', from: '09:00', to: '18:00', enabled: true },
      { day: 'Wednesday', from: '09:00', to: '18:00', enabled: true },
      { day: 'Thursday', from: '09:00', to: '18:00', enabled: true },
      { day: 'Friday', from: '09:00', to: '18:00', enabled: true },
      { day: 'Saturday', from: '10:00', to: '14:00', enabled: true },
      { day: 'Sunday', from: '10:00', to: '14:00', enabled: false },
    ],
    whiteLabel: false,
    aiEnabled: true,
    notifySound: true,
  };
}

/** ChatData for a workspace slug: Acme Store gets its own store-flavored demo
 *  content; every other workspace gets the generic seed. */
export function seedDataForWorkspace(slug: string): ChatData {
  if (slug === 'acme') {
    return {
      conversations: seedAcmeConversations(),
      visitors: seedAcmeVisitors(),
      contacts: seedAcmeContacts(),
      articles: seedAcmeArticles(),
      canned: seedAcmeCanned(),
      triggers: seedAcmeTriggers(),
      campaigns: seedAcmeCampaigns(),
      settings: seedAcmeSettings(),
    };
  }
  return seedData();
}
