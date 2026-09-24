<?php
declare(strict_types=1);

// Best-effort audit + notification writes. They must NEVER break the primary op.

function audit_log(string $wid, ?array $member, string $action, string $entity = '', string $entity_id = '', array $meta = []): void {
    try {
        $db = brix_db();
        $st = $db->prepare('INSERT INTO audit_log (id, workspace_id, actor_member_id, actor_name, action, entity, entity_id, meta)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        $st->execute([
            new_uuid(), $wid,
            $member['id'] ?? null, $member['display_name'] ?? 'system',
            $action, $entity, $entity_id, jenc($meta),
        ]);
    } catch (Throwable $e) { /* swallowed by design */ }
}

function notify_push(string $wid, string $type, string $title, string $body = '', ?string $link = null, ?string $member_id = null): void {
    try {
        $db = brix_db();
        $st = $db->prepare('INSERT INTO notifications (id, workspace_id, member_id, type, title, body, link)
                            VALUES (?, ?, ?, ?, ?, ?, ?)');
        $st->execute([new_uuid(), $wid, $member_id, $type, $title, $body, $link]);
    } catch (Throwable $e) { /* swallowed by design */ }
}

// --- Widget config defaults ------------------------------------------------------
function widget_defaults(): array {
    return [
        'color' => '#4f46e5', 'position' => 'bottom-right', 'bubble' => 'round',
        'greeting' => 'Hi there! How can we help you today?',
        'offline_text' => 'We are currently offline. Leave a message and we will reply soon.',
        'agent_name' => 'Support Team', 'show_branding' => true, 'prechat_form' => false,
    ];
}

function property_settings_defaults(): array {
    return [
        'greeting_online' => 'Hi there! How can we help you today?',
        'greeting_away' => 'We stepped away for a moment — leave a message and we will be right back.',
        'greeting_offline' => 'We are offline right now — leave a message and we will reply soon.',
        'offline_form_enabled' => true, 'offline_form_fields' => ['name', 'email', 'message'],
        'prechat_enabled' => false, 'prechat_fields' => ['name', 'email'],
        'business_hours' => [], 'timezone' => 'Asia/Dubai', 'blocked' => [], 'booking_url' => '',
    ];
}

// --- Integrations registry --------------------------------------------------------
// Mirrors the frontend INTEGRATION_REGISTRY; list() merges stored rows over it.
function integration_registry(): array {
    return [
        ['provider' => 'openai',          'name' => 'OpenAI',            'description' => 'AI copilot and auto-replies'],
        ['provider' => 'anthropic',       'name' => 'Anthropic',         'description' => 'AI copilot and auto-replies'],
        ['provider' => 'whatsapp',        'name' => 'WhatsApp Cloud API','description' => 'Send chat updates over WhatsApp'],
        ['provider' => 'twilio',          'name' => 'Twilio SMS',        'description' => 'SMS notifications'],
        ['provider' => 'resend',          'name' => 'Resend (email)',    'description' => 'Transcripts and notifications by email'],
        ['provider' => 'slack',           'name' => 'Slack',             'description' => 'Push chat alerts into Slack'],
        ['provider' => 'shopify',         'name' => 'Shopify',           'description' => 'Order context inside chats'],
        ['provider' => 'wordpress',       'name' => 'WordPress',         'description' => 'One-click widget install'],
        ['provider' => 'zapier',          'name' => 'Zapier',            'description' => 'Connect 6,000+ apps'],
        ['provider' => 'google_calendar', 'name' => 'Google Calendar',   'description' => 'In-widget meeting booking'],
    ];
}

function m_integration(array $reg, ?array $row): array {
    $values = [];
    if ($row && ($cfg = jdec($row['config'] ?? null, [])) && is_array($cfg) && isset($cfg['values'])) {
        $values = $cfg['values'];
    }
    return [
        'id' => $row['id'] ?? ('reg-' . $reg['provider']),
        'provider' => $reg['provider'], 'name' => $reg['name'],
        'description' => $reg['description'],
        'values' => $values, 'enabled' => $row ? to_bool($row['enabled']) : false,
    ];
}
