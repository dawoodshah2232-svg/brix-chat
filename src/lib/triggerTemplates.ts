// Brix Chat — P4-19 trigger template library.
// 10 original, one-click-installable rule templates. Each stores a plain-language
// `description` ("Greet visitors who idle 60s on pricing") reserved for future
// backend NL parsing. All wording below is original to Brix Chat.

import type { TriggerRule } from './types';
import { uid } from './utils';

export interface TriggerTemplate {
  id: string;
  name: string;
  kind: 'proactive' | 'routing';
  description: string;
  conditions: string[];
  action: string;
  event: TriggerRule['event'];
  conditionGroups: TriggerRule['conditionGroups'];
  actions: TriggerRule['actions'];
}

const T = (
  id: string,
  name: string,
  kind: 'proactive' | 'routing',
  description: string,
  conditions: string[],
  action: string,
  event: TriggerRule['event'] = undefined,
  conditionGroups: TriggerRule['conditionGroups'] = undefined,
  actions: TriggerRule['actions'] = undefined,
): TriggerTemplate => ({ id, name, kind, description, conditions, action, event, conditionGroups, actions });

export const TRIGGER_TEMPLATES: TriggerTemplate[] = [
  T('tpl-pricing-greeter', 'Pricing page greeter', 'proactive',
    'Greet visitors who idle 60 seconds on the pricing page',
    ['page_url contains /pricing', 'time_on_page greater_than 60'],
    'Send proactive message: “Comparing plans? I can walk you through the differences — just ask.”',
    'visitor.idle',
    [{ op: 'and', conditions: [
      { field: 'page_url', op: 'contains', value: '/pricing' },
      { field: 'time_on_page', op: 'greater_than', value: '60' },
    ] }],
    [{ kind: 'message', value: 'Comparing plans? I can walk you through the differences — just ask.' }]),
  T('tpl-cart-nudge', 'Abandoned-cart nudge', 'proactive',
    'Nudge visitors with a non-empty cart who idle 90 seconds on checkout',
    ['page_url contains /checkout', 'cart_value greater_than 0', 'time_on_page greater_than 90'],
    'Send proactive message: “Still deciding? Your items are saved — I can answer anything about shipping or returns.”',
    'visitor.idle',
    [{ op: 'and', conditions: [
      { field: 'page_url', op: 'contains', value: '/checkout' },
      { field: 'cart_value', op: 'greater_than', value: '0' },
      { field: 'time_on_page', op: 'greater_than', value: '90' },
    ] }],
    [{ kind: 'message', value: 'Still deciding? Your items are saved — I can answer anything about shipping or returns.' }]),
  T('tpl-new-visitor', 'New-visitor welcome', 'proactive',
    'Welcome first-time visitors 20 seconds after they land',
    ['time_on_page greater_than 20'],
    'Send proactive message: “Welcome! 👋 New here? Tell me what you’re looking for and I’ll point you the right way.”',
    'visitor.idle',
    [{ op: 'and', conditions: [{ field: 'time_on_page', op: 'greater_than', value: '20' }] }],
    [{ kind: 'message', value: 'Welcome! 👋 New here? Tell me what you’re looking for and I’ll point you the right way.' }]),
  T('tpl-offline-capture', 'Offline-hours capture', 'proactive',
    'Offer a callback form when nobody is online',
    ['chat.missed'],
    'Send proactive message: “We’re away right now — leave your email and we’ll reply first thing in the morning.”',
    'chat.missed', undefined,
    [{ kind: 'message', value: 'We’re away right now — leave your email and we’ll reply first thing in the morning.' }]),
  T('tpl-refund-route', 'Refund requests → Billing', 'routing',
    'Route chats mentioning “refund” to the Billing department with high priority',
    ['message_contains refund'],
    'Assign to Billing department, set priority high, tag “billing”.',
    'message.received',
    [{ op: 'and', conditions: [{ field: 'message_contains', op: 'contains', value: 'refund' }] }],
    [{ kind: 'assign', value: 'Billing' }, { kind: 'priority', value: 'high' }, { kind: 'tag', value: 'billing' }]),
  T('tpl-vip-tag', 'VIP contact tagging', 'routing',
    'Tag chats from contacts tagged “vip” so agents see them first',
    ['contact_tag is vip'],
    'Tag “vip-priority”, set priority urgent.',
    'chat.started',
    [{ op: 'and', conditions: [{ field: 'contact_tag', op: 'is', value: 'vip' }] }],
    [{ kind: 'tag', value: 'vip-priority' }, { kind: 'priority', value: 'urgent' }]),
  T('tpl-sales-route', 'Pricing questions → Sales', 'routing',
    'Send chats that mention pricing to the Sales department',
    ['message_contains pricing'],
    'Assign to Sales department.',
    'message.received',
    [{ op: 'and', conditions: [{ field: 'message_contains', op: 'contains', value: 'pricing' }] }],
    [{ kind: 'assign', value: 'Sales' }]),
  T('tpl-docs-helper', 'Docs-page helper', 'proactive',
    'Offer help to visitors spending over 2 minutes on documentation',
    ['page_url contains /docs', 'time_on_page greater_than 120'],
    'Send proactive message: “Digging into the docs? If something’s unclear, I’ll explain it in plain English.”',
    'visitor.idle',
    [{ op: 'and', conditions: [
      { field: 'page_url', op: 'contains', value: '/docs' },
      { field: 'time_on_page', op: 'greater_than', value: '120' },
    ] }],
    [{ kind: 'message', value: 'Digging into the docs? If something’s unclear, I’ll explain it in plain English.' }]),
  T('tpl-upset-escalate', 'Upset visitor escalation', 'routing',
    'Flag chats with angry wording as urgent for a senior agent',
    ['message_contains angry OR message_contains furious OR message_contains terrible'],
    'Set priority urgent, tag “escalation”.',
    'message.received',
    [{ op: 'or', conditions: [
      { field: 'message_contains', op: 'contains', value: 'angry' },
      { field: 'message_contains', op: 'contains', value: 'furious' },
      { field: 'message_contains', op: 'contains', value: 'terrible' },
    ] }],
    [{ kind: 'priority', value: 'urgent' }, { kind: 'tag', value: 'escalation' }]),
  T('tpl-returning-welcome', 'Returning-visitor check-in', 'proactive',
    'Check in with returning visitors shortly after they arrive',
    ['time_on_page greater_than 30'],
    'Send proactive message: “Welcome back! Picking up where you left off — need a hand with anything?”',
    'visitor.idle',
    [{ op: 'and', conditions: [{ field: 'time_on_page', op: 'greater_than', value: '30' }] }],
    [{ kind: 'message', value: 'Welcome back! Picking up where you left off — need a hand with anything?' }]),
];

/** Instantiate a template as a fresh, enabled TriggerRule. */
export function instantiateTemplate(t: TriggerTemplate): TriggerRule {
  return {
    id: uid('tr'),
    name: t.name,
    kind: t.kind,
    conditions: [...t.conditions],
    action: t.action,
    enabled: true,
    description: t.description,
    event: t.event,
    conditionGroups: t.conditionGroups ? JSON.parse(JSON.stringify(t.conditionGroups)) : undefined,
    actions: t.actions ? t.actions.map((a) => ({ ...a })) : undefined,
  };
}
