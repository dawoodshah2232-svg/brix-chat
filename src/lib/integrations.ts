// Brix Chat — integration registry (phase 2, §8; extended phase 3, Worker D).
//
// Local-only: each entry describes a third-party service. Providers marked
// phase 'local' store their keys in this browser (Admin → Integrations);
// providers marked 'backend' activate with the backend phase. Nothing here
// makes network calls — see src/lib/integrationClient.ts for the honest
// local-stub vs Edge Function test path.

export interface IntegrationKeyFormat {
  /** expected prefix, e.g. 'sk-' */
  prefix?: string;
  /** expected substring, e.g. '.myshopify.com' */
  contains?: string;
  /** minimum length */
  minLen?: number;
  /** short human note shown next to the field */
  note: string;
}

export interface IntegrationKeyField {
  name: string;
  label: string;
  placeholder: string;
  secret: boolean;
  format?: IntegrationKeyFormat;
}

export interface IntegrationDef {
  id: string;
  name: string;
  description: string;
  keyFields: IntegrationKeyField[];
  status: 'local' | 'backend'; // 'local' = key stored locally today; 'backend' = needs backend phase
  enabled: boolean;
  /** one original sentence: where this provider plugs into Brix Chat */
  wiresInto: string;
  /** Edge Function name for live calls, per supabase/README.md (Worker B);
   *  null when no function is documented for the provider yet. */
  edgeFunction: string | null;
  /** honest one-liner: what the backend will do with the credential once live */
  liveCall: string;
}

export const INTEGRATION_REGISTRY: IntegrationDef[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'Powers AI-drafted replies and summaries once live calls are enabled. Keys are stored locally in this browser for now.',
    keyFields: [{ name: 'api_key', label: 'API key', placeholder: 'sk-…', secret: true, format: { prefix: 'sk-', minLen: 20, note: 'Starts with sk-, at least 20 characters.' } }],
    status: 'local',
    enabled: false,
    wiresInto: 'Wires into AI Copilot — drafts agent replies and one-click conversation summaries inside the inbox.',
    edgeFunction: 'ai-copilot',
    liveCall: 'Live drafts call POST /functions/v1/ai-copilot with { provider: \'openai\' }; usage bills to the OpenAI key stored as a Supabase secret.'
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Alternative AI provider for reply drafts and summaries. Keys are stored locally in this browser for now.',
    keyFields: [{ name: 'api_key', label: 'API key', placeholder: 'sk-ant-…', secret: true, format: { prefix: 'sk-ant-', minLen: 20, note: 'Starts with sk-ant-, at least 20 characters.' } }],
    status: 'local',
    enabled: false,
    wiresInto: 'Wires into AI Copilot as the fallback model — takes over reply drafts and summaries if the primary AI provider is unreachable.',
    edgeFunction: 'ai-copilot',
    liveCall: 'Live drafts call POST /functions/v1/ai-copilot with { provider: \'anthropic\' }; usage bills to the Anthropic key stored as a Supabase secret.'
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp Cloud API',
    description: 'Continue web chats on WhatsApp. Live messaging activates with the backend phase.',
    keyFields: [
      { name: 'access_token', label: 'Access token', placeholder: 'EAAG…', secret: true, format: { minLen: 20, note: 'Long-lived system-user token from Meta Business settings.' } },
      { name: 'phone_number_id', label: 'Phone number ID', placeholder: '1098…', secret: false, format: { minLen: 5, note: 'Digits only — found under your WhatsApp number in Meta Business settings.' } },
    ],
    status: 'backend',
    enabled: false,
    wiresInto: 'Wires into the backend send path — agents continue a web chat over WhatsApp from the same inbox thread.',
    edgeFunction: null,
    liveCall: 'No Edge Function is documented for WhatsApp yet — live messaging lands with the backend phase.'
  },
  {
    id: 'twilio',
    name: 'Twilio SMS',
    description: 'Send follow-up SMS from ticket and campaign flows. Live sending activates with the backend phase.',
    keyFields: [
      { name: 'account_sid', label: 'Account SID', placeholder: 'AC…', secret: false, format: { prefix: 'AC', minLen: 20, note: 'Starts with AC, from the Twilio console dashboard.' } },
      { name: 'auth_token', label: 'Auth token', placeholder: '••••', secret: true, format: { minLen: 20, note: 'Your Twilio auth token — treat it like a password.' } },
      { name: 'from_number', label: 'From number', placeholder: '+1 555 …', secret: false, format: { prefix: '+', minLen: 8, note: 'E.164 format, e.g. +15551234567.' } },
    ],
    status: 'backend',
    enabled: false,
    wiresInto: 'Wires into ticket and campaign flows — sends follow-up SMS such as ticket updates and review requests.',
    edgeFunction: null,
    liveCall: 'No Edge Function is documented for Twilio yet — live SMS sending lands with the backend phase.'
  },
  {
    id: 'resend',
    name: 'Resend (email)',
    description: 'Transactional email: transcripts, ticket updates, campaign digests. Works with SendGrid-compatible senders. Live sending activates with the backend phase.',
    keyFields: [{ name: 'api_key', label: 'API key', placeholder: 're_…', secret: true, format: { prefix: 're_', minLen: 10, note: 'Starts with re_, created in the Resend dashboard.' } }],
    status: 'backend',
    enabled: false,
    wiresInto: 'Wires into transactional email — delivers chat transcripts, ticket updates, and campaign digests to visitors.',
    edgeFunction: 'send-email',
    liveCall: 'Live mail calls POST /functions/v1/send-email; the sender domain must be verified in Resend.'
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Post new chats, missed chats and SLA breaches to a channel. Live posting activates with the backend phase.',
    keyFields: [{ name: 'webhook_url', label: 'Incoming webhook URL', placeholder: 'https://hooks.slack.com/…', secret: true, format: { prefix: 'https://hooks.slack.com/', minLen: 30, note: 'Paste the full incoming-webhook URL from your Slack app.' } }],
    status: 'backend',
    enabled: false,
    wiresInto: 'Wires into conversation notifications — posts new chats, missed chats, and SLA breaches to a Slack channel.',
    edgeFunction: null,
    liveCall: 'No Edge Function is documented for Slack yet — live posting lands with the backend phase.'
  },
  {
    id: 'shopify',
    name: 'Shopify',
    description: 'Show live cart contents inside the chat and trigger abandonment flows. Live sync activates with the backend phase.',
    keyFields: [
      { name: 'shop_domain', label: 'Shop domain', placeholder: 'mystore.myshopify.com', secret: false, format: { contains: '.myshopify.com', note: 'Your myshopify.com domain.' } },
      { name: 'access_token', label: 'Admin API token', placeholder: 'shpat_…', secret: true, format: { prefix: 'shpat_', minLen: 20, note: 'Starts with shpat_, from a custom app with read_orders and read_customers scopes.' } },
    ],
    status: 'backend',
    enabled: false,
    wiresInto: 'Wires into the chat context panel — shows the visitor’s live cart to the agent and triggers abandonment flows.',
    edgeFunction: null,
    liveCall: 'No Edge Function is documented for Shopify yet — live sync lands with the backend phase.'
  },
  {
    id: 'wordpress',
    name: 'WordPress',
    description: 'One-click widget installer and article sync for WordPress sites. Live sync activates with the backend phase.',
    keyFields: [
      { name: 'site_url', label: 'Site URL', placeholder: 'https://example.com', secret: false, format: { prefix: 'https://', note: 'Full https:// URL of the WordPress site.' } },
      { name: 'app_password', label: 'Application password', placeholder: '••••', secret: true, format: { minLen: 10, note: 'Generated under Users → Profile → Application Passwords.' } },
    ],
    status: 'backend',
    enabled: false,
    wiresInto: 'Wires into one-click install — injects the widget snippet into a WordPress site and syncs help-center articles.',
    edgeFunction: null,
    liveCall: 'No Edge Function is documented for WordPress yet — live sync lands with the backend phase.'
  },
  {
    id: 'zapier',
    name: 'Zapier',
    description: 'Pipe chat, ticket and goal events into 6,000+ apps. Live triggers activate with the backend phase.',
    keyFields: [{ name: 'webhook_url', label: 'Zap webhook URL', placeholder: 'https://hooks.zapier.com/…', secret: true, format: { prefix: 'https://hooks.zapier.com/', minLen: 30, note: 'Paste the “Catch Hook” trigger URL from your Zap.' } }],
    status: 'backend',
    enabled: false,
    wiresInto: 'Wires into event webhooks — forwards chat, ticket, and goal events into 6,000+ apps through your Zap.',
    edgeFunction: 'webhook-dispatcher',
    liveCall: 'Live event fan-out calls POST /functions/v1/webhook-dispatcher (service-role, server-side only).'
  },
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    description: 'Let visitors book meetings from the chat booking block. Live booking activates with the backend phase.',
    keyFields: [{ name: 'client_id', label: 'OAuth client ID', placeholder: '…apps.googleusercontent.com', secret: false, format: { contains: '.apps.googleusercontent.com', note: 'From Google Cloud → Credentials → OAuth client ID.' } }],
    status: 'backend',
    enabled: false,
    wiresInto: 'Wires into the widget booking block — lets visitors pick a real meeting slot without leaving the chat.',
    edgeFunction: null,
    liveCall: 'No Edge Function is documented for Google Calendar yet — live booking lands with the backend phase.'
  },
];

export function getIntegration(id: string): IntegrationDef | undefined {
  return INTEGRATION_REGISTRY.find((i) => i.id === id);
}

/* ------------------------------------------------------------------ */
/* Local format validation (honest: checks shape only, never claims    */
/* a live connection — used by the Admin → Integrations Test button)   */
/* ------------------------------------------------------------------ */

export interface FieldCheck {
  field: string;
  label: string;
  ok: boolean;
  message: string;
}

/** Validate one stored value against its declared format. Returns an error
 *  message, or null when the value matches the expected shape. */
export function validateFieldValue(field: IntegrationKeyField, value: string): string | null {
  const v = (value || '').trim();
  if (!v) return `${field.label} is empty — paste the value from the provider dashboard.`;
  const f = field.format;
  if (!f) return null;
  if (f.prefix && !v.startsWith(f.prefix)) {
    return `${field.label} should start with “${f.prefix}”. ${f.note}`;
  }
  if (f.contains && !v.includes(f.contains)) {
    return `${field.label} should contain “${f.contains}”. ${f.note}`;
  }
  if (f.minLen && v.length < f.minLen) {
    return `${field.label} looks too short (got ${v.length} chars, expected at least ${f.minLen}). ${f.note}`;
  }
  return null;
}

/** Validate every key field of a provider against stored values. */
export function validateProvider(def: IntegrationDef, values: Record<string, string>): FieldCheck[] {
  return def.keyFields.map((field) => {
    const err = validateFieldValue(field, values[field.name] ?? '');
    return {
      field: field.name,
      label: field.label,
      ok: err === null,
      message: err ?? `${field.label} matches the expected format.`,
    };
  });
}

/** True when every required field is present and format-valid. */
export function providerConfigured(def: IntegrationDef, values: Record<string, string>): boolean {
  return validateProvider(def, values).every((c) => c.ok);
}
