// Brix Chat — integration registry (phase 2, §8).
//
// Local-only: each entry describes a third-party service. Providers marked
// phase 'local' store their keys in this browser (Admin → Integrations);
// providers marked 'backend' activate with the backend phase. Nothing here
// makes network calls.

export interface IntegrationKeyField {
  name: string;
  label: string;
  placeholder: string;
  secret: boolean;
}

export interface IntegrationDef {
  id: string;
  name: string;
  description: string;
  keyFields: IntegrationKeyField[];
  status: 'local' | 'backend'; // 'local' = key stored locally today; 'backend' = needs backend phase
  enabled: boolean;
}

export const INTEGRATION_REGISTRY: IntegrationDef[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'Powers AI-drafted replies and summaries once live calls are enabled. Keys are stored locally in this browser for now.',
    keyFields: [{ name: 'api_key', label: 'API key', placeholder: 'sk-…', secret: true }],
    status: 'local',
    enabled: false,
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Alternative AI provider for reply drafts and summaries. Keys are stored locally in this browser for now.',
    keyFields: [{ name: 'api_key', label: 'API key', placeholder: 'sk-ant-…', secret: true }],
    status: 'local',
    enabled: false,
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp Cloud API',
    description: 'Continue web chats on WhatsApp. Live messaging activates with the backend phase.',
    keyFields: [
      { name: 'access_token', label: 'Access token', placeholder: 'EAAG…', secret: true },
      { name: 'phone_number_id', label: 'Phone number ID', placeholder: '1098…', secret: false },
    ],
    status: 'backend',
    enabled: false,
  },
  {
    id: 'twilio',
    name: 'Twilio SMS',
    description: 'Send follow-up SMS from ticket and campaign flows. Live sending activates with the backend phase.',
    keyFields: [
      { name: 'account_sid', label: 'Account SID', placeholder: 'AC…', secret: false },
      { name: 'auth_token', label: 'Auth token', placeholder: '••••', secret: true },
      { name: 'from_number', label: 'From number', placeholder: '+1 555 …', secret: false },
    ],
    status: 'backend',
    enabled: false,
  },
  {
    id: 'resend',
    name: 'Resend (email)',
    description: 'Transactional email: transcripts, ticket updates, campaign digests. Works with SendGrid-compatible senders. Live sending activates with the backend phase.',
    keyFields: [{ name: 'api_key', label: 'API key', placeholder: 're_…', secret: true }],
    status: 'backend',
    enabled: false,
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Post new chats, missed chats and SLA breaches to a channel. Live posting activates with the backend phase.',
    keyFields: [{ name: 'webhook_url', label: 'Incoming webhook URL', placeholder: 'https://hooks.slack.com/…', secret: true }],
    status: 'backend',
    enabled: false,
  },
  {
    id: 'shopify',
    name: 'Shopify',
    description: 'Show live cart contents inside the chat and trigger abandonment flows. Live sync activates with the backend phase.',
    keyFields: [
      { name: 'shop_domain', label: 'Shop domain', placeholder: 'mystore.myshopify.com', secret: false },
      { name: 'access_token', label: 'Admin API token', placeholder: 'shpat_…', secret: true },
    ],
    status: 'backend',
    enabled: false,
  },
  {
    id: 'wordpress',
    name: 'WordPress',
    description: 'One-click widget installer and article sync for WordPress sites. Live sync activates with the backend phase.',
    keyFields: [
      { name: 'site_url', label: 'Site URL', placeholder: 'https://example.com', secret: false },
      { name: 'app_password', label: 'Application password', placeholder: '••••', secret: true },
    ],
    status: 'backend',
    enabled: false,
  },
  {
    id: 'zapier',
    name: 'Zapier',
    description: 'Pipe chat, ticket and goal events into 6,000+ apps. Live triggers activate with the backend phase.',
    keyFields: [{ name: 'webhook_url', label: 'Zap webhook URL', placeholder: 'https://hooks.zapier.com/…', secret: true }],
    status: 'backend',
    enabled: false,
  },
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    description: 'Let visitors book meetings from the chat booking block. Live booking activates with the backend phase.',
    keyFields: [{ name: 'client_id', label: 'OAuth client ID', placeholder: '…apps.googleusercontent.com', secret: false }],
    status: 'backend',
    enabled: false,
  },
];

export function getIntegration(id: string): IntegrationDef | undefined {
  return INTEGRATION_REGISTRY.find((i) => i.id === id);
}
