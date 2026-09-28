<?php

namespace App\Support\Api;

/**
 * Static defaults and registries shared by the workspace API and the frontend.
 */
final class Catalog
{
    public const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

    public const ROLES = ['owner', 'admin', 'agent', 'developer', 'viewer'];

    public const MEMBER_COLORS = ['#4f46e5', '#0891b2', '#f59e0b', '#10b981', '#ef4444'];

    /** Webhook event catalog (mirrors WEBHOOK_EVENTS in src/lib/api.ts). */
    public const WEBHOOK_EVENTS = [
        'chat.started' => 'Visitor sends the first message of a chat',
        'chat.ended' => 'Chat session ends',
        'chat.transcript' => 'Full transcript ready after a chat ends',
        'message.created' => 'Any new message (visitor, agent, or bot)',
        'message.received' => 'A visitor sent a message',
        'conversation.assigned' => 'Chat assigned to an agent or department',
        'conversation.status_changed' => 'Status flips between open / closed / spam / missed',
        'ticket.created' => 'New support ticket (offline form, missed chat)',
        'ticket.status_changed' => 'Ticket resolved or reopened',
        'contact.created' => 'Contact record created',
        'contact.updated' => 'Contact record updated',
        'satisfaction.received' => 'Visitor submits a post-chat rating',
        'widget.opened' => 'Visitor opens the chat widget',
        'ticket.sla_breached' => 'A ticket passed its SLA due time unresolved',
        'campaign.sent' => 'A campaign finished sending',
        'goal.completed' => 'A tracked goal event fired',
        'widget.rating' => 'Visitor rates the widget experience',
        'rating.created' => 'Visitor submits a CSAT or NPS rating',
    ];

    public static function widgetDefaults(): array
    {
        return [
            'color' => '#4f46e5', 'position' => 'bottom-right', 'bubble' => 'round',
            'greeting' => 'Hi there! How can we help you today?',
            'offline_text' => 'We are currently offline. Leave a message and we will reply soon.',
            'agent_name' => 'Support Team', 'show_branding' => true, 'prechat_form' => false,
        ];
    }

    public static function propertySettingsDefaults(): array
    {
        return [
            'greeting_online' => 'Hi there! How can we help you today?',
            'greeting_away' => 'We stepped away for a moment — leave a message and we will be right back.',
            'greeting_offline' => 'We are offline right now — leave a message and we will reply soon.',
            'offline_form_enabled' => true, 'offline_form_fields' => ['name', 'email', 'message'],
            'prechat_enabled' => false, 'prechat_fields' => ['name', 'email'],
            'business_hours' => [], 'timezone' => 'Asia/Dubai', 'blocked' => [], 'booking_url' => '',
        ];
    }

    /** Mirrors the frontend INTEGRATION_REGISTRY; stored rows are merged over it. */
    public static function integrations(): array
    {
        return [
            ['provider' => 'openai', 'name' => 'OpenAI', 'description' => 'AI copilot and auto-replies'],
            ['provider' => 'anthropic', 'name' => 'Anthropic', 'description' => 'AI copilot and auto-replies'],
            ['provider' => 'whatsapp', 'name' => 'WhatsApp Cloud API', 'description' => 'Send chat updates over WhatsApp'],
            ['provider' => 'twilio', 'name' => 'Twilio SMS', 'description' => 'SMS notifications'],
            ['provider' => 'resend', 'name' => 'Resend (email)', 'description' => 'Transcripts and notifications by email'],
            ['provider' => 'slack', 'name' => 'Slack', 'description' => 'Push chat alerts into Slack'],
            ['provider' => 'shopify', 'name' => 'Shopify', 'description' => 'Order context inside chats'],
            ['provider' => 'wordpress', 'name' => 'WordPress', 'description' => 'One-click widget install'],
            ['provider' => 'zapier', 'name' => 'Zapier', 'description' => 'Connect 6,000+ apps'],
            ['provider' => 'google_calendar', 'name' => 'Google Calendar', 'description' => 'In-widget meeting booking'],
        ];
    }

    public static function integration(string $provider): ?array
    {
        foreach (self::integrations() as $entry) {
            if ($entry['provider'] === $provider) {
                return $entry;
            }
        }

        return null;
    }

    public static function initials(string $name): string
    {
        $initials = '';
        foreach (array_slice(preg_split('/\s+/', trim($name)), 0, 2) as $part) {
            $initials .= mb_strtoupper(mb_substr($part, 0, 1));
        }

        return $initials !== '' ? $initials : '?';
    }

    /** URL-safe slug: lowercase, non-alphanumerics collapsed to '-'. */
    public static function slug(string $text, string $fallback): string
    {
        $slug = trim((string) preg_replace('/[^a-z0-9]+/', '-', mb_strtolower($text)), '-');

        return $slug !== '' ? $slug : $fallback;
    }
}
