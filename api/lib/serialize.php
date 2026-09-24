<?php
declare(strict_types=1);

// DB snake_case -> API camelCase, mirroring the frontend map* functions.
// Nullable *_at fields stay null (never empty string).

function m_property(array $r): array {
    return [
        'id' => $r['id'], 'workspace_id' => $r['workspace_id'], 'name' => $r['name'],
        'domain' => $r['domain'], 'public_key' => $r['public_key'],
        'secure_mode' => to_bool($r['secure_mode']),
        'widget_config' => jdec($r['widget_config'] ?? null, new stdClass()),
        'created_at' => iso_dt($r['created_at']), 'updated_at' => iso_dt($r['updated_at']),
    ];
}

function m_message(array $r): array {
    return [
        'id' => $r['id'], 'conversation_id' => $r['conversation_id'], 'sender' => $r['sender'],
        'kind' => $r['kind'], 'text' => $r['text'],
        'metadata' => jdec($r['metadata'] ?? null, new stdClass()),
        'created_at' => iso_dt($r['created_at']),
    ];
}

function m_note_shape(array $r): array {
    // ConvNote API shape has no id: {author, text, created_at}
    return ['author' => $r['author_name'] ?? '', 'text' => $r['text'], 'created_at' => iso_dt($r['created_at'])];
}

function m_conversation(array $r, array $messages = [], array $notes = [], ?string $department = null, ?string $agent_name = null): array {
    return [
        'id' => $r['id'], 'property_id' => $r['property_id'], 'contact_id' => $r['contact_id'],
        'visitor_name' => $r['visitor_name'], 'visitor_email' => $r['visitor_email'],
        'page_url' => $r['page_url'], 'referrer' => $r['referrer'], 'status' => $r['status'],
        'department_id' => $r['department_id'], 'department' => $department,
        'agent_id' => $r['assignee_id'], 'agent_name' => $agent_name,
        'tags' => jdec($r['tags'] ?? null, []), 'priority' => $r['priority'],
        'rating' => $r['rating'] === null ? null : (int)$r['rating'],
        'unread' => (int)$r['unread'], 'ai_handled' => to_bool($r['ai_handled']),
        'closed_at' => iso_dt($r['closed_at']),
        'messages' => array_map('m_message', $messages),
        'notes' => array_map('m_note_shape', $notes),
        'created_at' => iso_dt($r['created_at']), 'updated_at' => iso_dt($r['updated_at']),
    ];
}

function m_contact(array $r): array {
    return [
        'id' => $r['id'], 'property_id' => $r['property_id'], 'name' => $r['name'],
        'email' => $r['email'], 'phone' => $r['phone'], 'country' => $r['country'],
        'tags' => jdec($r['tags'] ?? null, []), 'notes' => $r['notes'], 'source' => $r['source'],
        'chats' => (int)($r['chats_count'] ?? 0), 'last_seen_at' => iso_dt($r['last_seen_at']),
        'created_at' => iso_dt($r['created_at']), 'updated_at' => iso_dt($r['updated_at']),
    ];
}

function m_contact_event(array $r): array {
    return [
        'id' => $r['id'], 'contact_id' => $r['contact_id'], 'kind' => $r['kind'],
        'title' => $r['title'], 'body' => $r['body'], 'related_id' => $r['related_id'],
        'occurred_at' => iso_dt($r['occurred_at']), 'created_at' => iso_dt($r['created_at']),
    ];
}

function m_member(array $r, array $department_ids = []): array {
    return [
        'id' => $r['id'], 'display_name' => $r['display_name'], 'initials' => $r['initials'],
        'color' => $r['color'], 'role' => $r['role'], 'email' => $r['email'],
        'job_title' => $r['job_title'], 'avatar_data_url' => $r['avatar_url'],
        'status' => $r['status'], 'online' => ($r['status'] === 'online'),
        'active' => true, 'passcode' => '',
        'last_login' => iso_dt($r['last_login_at']),
        'department_ids' => array_values($department_ids),
        'created_at' => iso_dt($r['created_at']), 'updated_at' => iso_dt($r['updated_at']),
    ];
}

function m_department(array $r, array $agent_ids = []): array {
    return [
        'id' => $r['id'], 'property_id' => $r['property_id'], 'name' => $r['name'],
        'description' => $r['description'], 'routing_mode' => $r['routing_mode'],
        'hours_override' => jdec($r['hours_override'] ?? null),
        'offline_behavior' => $r['offline_behavior'], 'agent_ids' => array_values($agent_ids),
        'created_at' => ms_epoch($r['created_at']), 'updated_at' => iso_dt($r['updated_at']),
    ];
}

function m_ticket(array $r): array {
    return [
        'id' => $r['id'], 'property_id' => $r['property_id'], 'subject' => $r['subject'],
        'message' => $r['message'], 'requester_name' => $r['requester_name'],
        'requester_email' => $r['requester_email'], 'status' => $r['status'],
        'priority' => $r['priority'], 'assignee_id' => $r['assignee_id'],
        'sla_due' => iso_dt($r['sla_due']), 'sla_breached' => to_bool($r['sla_breached']),
        'conversation_id' => $r['conversation_id'], 'tags' => jdec($r['tags'] ?? null, []),
        'category_id' => $r['category_id'],
        'parent_id' => null, 'relation' => null, // no such columns in the schema; always null
        'created_at' => iso_dt($r['created_at']), 'updated_at' => iso_dt($r['updated_at']),
    ];
}

function m_notification(array $r): array {
    return [
        'id' => $r['id'], 'member_id' => $r['member_id'], 'type' => $r['type'],
        'title' => $r['title'], 'body' => $r['body'], 'link' => $r['link'],
        'read' => to_bool($r['read']), 'created_at' => iso_dt($r['created_at']),
    ];
}

function m_rating(array $r): array {
    return [
        'id' => $r['id'], 'property_id' => $r['property_id'], 'conversation_id' => $r['conversation_id'],
        'agent_id' => $r['member_id'], 'kind' => $r['kind'], 'score' => (int)$r['score'],
        'comment' => $r['comment'], 'created_at' => ms_epoch($r['created_at']),
    ];
}

function m_category(array $r, string $scope): array {
    return [
        'id' => $r['id'], 'property_id' => $r['property_id'], 'scope' => $scope,
        'name' => $r['name'], 'color' => $r['color'], 'position' => (int)$r['position'],
        'created_at' => ms_epoch($r['created_at']),
    ];
}

function m_view(array $r): array {
    return [
        'id' => $r['id'], 'member_id' => $r['member_id'], 'name' => $r['name'],
        'filters' => jdec($r['filters'] ?? null, new stdClass()),
        'created_at' => iso_dt($r['created_at']),
    ];
}

function m_play(array $r): array {
    return [
        'id' => $r['id'], 'name' => $r['name'], 'steps' => jdec($r['steps'] ?? null, []),
        'created_at' => iso_dt($r['created_at']),
    ];
}

function m_goal(array $r): array {
    return [
        'id' => $r['id'], 'property_id' => $r['property_id'], 'name' => $r['name'],
        'event' => $r['event'], 'revenue' => (float)$r['revenue'],
        'created_at' => iso_dt($r['created_at']),
    ];
}

function m_unanswered(array $r): array {
    return [
        'id' => $r['id'], 'property_id' => $r['property_id'], 'question' => $r['question'],
        'conversation_id' => $r['conversation_id'], 'count' => (int)$r['count'],
        'dismissed' => to_bool($r['dismissed']),
        'created_at' => iso_dt($r['created_at']), 'updated_at' => iso_dt($r['updated_at']),
    ];
}

function m_article(array $r, ?string $category = null): array {
    $status = $r['status'];
    return [
        'id' => $r['id'], 'property_id' => $r['property_id'], 'category_id' => $r['category_id'],
        'category' => $category, 'title' => $r['title'], 'slug' => $r['slug'],
        'body' => $r['body'], 'status' => $status,
        // Internal-only: the schema has no separate flag; status='draft' means
        // not published to the public help center (internal only).
        'internal_only' => ($status !== 'published'),
        'views' => (int)$r['views'], 'helpful' => (int)$r['helpful'], 'not_helpful' => (int)$r['not_helpful'],
        'created_at' => iso_dt($r['created_at']), 'updated_at' => iso_dt($r['updated_at']),
    ];
}

function m_canned(array $r): array {
    return [
        'id' => $r['id'], 'property_id' => $r['property_id'], 'category_id' => $r['category_id'],
        'shortcut' => $r['shortcut'], 'title' => $r['title'], 'body' => $r['body'],
        'shared' => to_bool($r['shared']), 'owner_member_id' => $r['owner_member_id'],
        'usage_count' => (int)$r['usage_count'],
        'created_at' => iso_dt($r['created_at']), 'updated_at' => iso_dt($r['updated_at']),
    ];
}

function m_trigger(array $r): array {
    return [
        'id' => $r['id'], 'property_id' => $r['property_id'], 'name' => $r['name'],
        'kind' => $r['kind'], 'event' => $r['event'],
        'condition_groups' => jdec($r['condition_groups'] ?? null, []),
        'actions' => jdec($r['actions'] ?? null, []),
        'enabled' => to_bool($r['enabled']),
        'created_at' => iso_dt($r['created_at']), 'updated_at' => iso_dt($r['updated_at']),
    ];
}

function m_campaign(array $r): array {
    return [
        'id' => $r['id'], 'property_id' => $r['property_id'], 'name' => $r['name'],
        'audience' => $r['audience'], 'message' => $r['message'], 'schedule' => $r['schedule'],
        'status' => $r['status'], 'scheduled_at' => iso_dt($r['scheduled_at']),
        'audience_rules' => jdec($r['audience_rules'] ?? null),
        'goal_id' => $r['goal_id'], 'sent_count' => (int)$r['sent_count'],
        'created_at' => iso_dt($r['created_at']), 'updated_at' => iso_dt($r['updated_at']),
    ];
}

function m_webhook(array $r): array {
    return [
        'id' => $r['id'], 'property_id' => $r['property_id'], 'url' => $r['url'],
        // secret is never readable — only whether one is set.
        'secret_set' => !empty($r['secret']),
        'disabled_reason' => $r['disabled_reason'], 'events' => jdec($r['events'] ?? null, []),
        'enabled' => to_bool($r['enabled']), 'auto_disable' => to_bool($r['auto_disable']),
        'consecutive_failures' => (int)$r['consecutive_failures'],
        'created_at' => iso_dt($r['created_at']), 'updated_at' => iso_dt($r['updated_at']),
    ];
}

function m_delivery(array $r): array {
    return [
        'id' => $r['id'], 'webhook_id' => $r['webhook_id'], 'property_id' => $r['property_id'],
        'event' => $r['event'], 'event_id' => $r['event_id'],
        'payload' => jdec($r['payload'] ?? null, new stdClass()),
        'status' => $r['status'], 'http_status' => $r['http_status'] === null ? null : (int)$r['http_status'],
        'attempt_count' => (int)$r['attempt_count'], 'latency_ms' => $r['latency_ms'] === null ? null : (int)$r['latency_ms'],
        'last_error' => $r['last_error'], 'next_attempt_at' => iso_dt($r['next_attempt_at']),
        'created_at' => iso_dt($r['created_at']),
    ];
}

function m_apikey(array $r): array {
    return [
        'id' => $r['id'], 'name' => $r['name'], 'prefix' => $r['prefix'],
        'key_hash' => '', // never readable
        'scopes' => jdec($r['scopes'] ?? null, []), 'revoked' => to_bool($r['revoked']),
        'usage_count' => (int)$r['usage_count'], 'last_used_at' => iso_dt($r['last_used_at']),
        'created_at' => iso_dt($r['created_at']),
    ];
}

function m_audit(array $r): array {
    return [
        'id' => $r['id'], 'actor_member_id' => $r['actor_member_id'],
        'actor' => $r['actor_name'], 'action' => $r['action'], 'entity' => $r['entity'],
        'entity_id' => $r['entity_id'], 'meta' => jdec($r['meta'] ?? null, new stdClass()),
        'created_at' => iso_dt($r['created_at']),
    ];
}

function m_visitor(array $r): array {
    return [
        'id' => $r['id'], 'property_id' => $r['property_id'], 'contact_id' => $r['contact_id'],
        'name' => $r['name'], 'email' => $r['email'], 'page_url' => $r['page_url'],
        'pages' => (int)$r['pages'], 'country' => $r['country'], 'city' => $r['city'],
        'device' => $r['device'], 'browser' => $r['browser'],
        'time_on_site_sec' => (int)$r['time_on_site_sec'], 'typing_preview' => $r['typing_preview'],
        'online' => to_bool($r['online']),
        'custom_attributes' => jdec($r['custom_attributes'] ?? null, new stdClass()),
        'last_seen_at' => iso_dt($r['last_seen_at']),
        'created_at' => iso_dt($r['created_at']), 'updated_at' => iso_dt($r['updated_at']),
    ];
}

function m_invite(array $r): array {
    return [
        'id' => $r['id'], 'email' => $r['email'], 'display_name' => $r['display_name'],
        'role' => $r['role'], 'expires_at' => iso_dt($r['expires_at']),
        'used_at' => iso_dt($r['used_at']), 'created_at' => iso_dt($r['created_at']),
    ];
}

// --- Hydration joins (client-side-join equivalent, done in bulk) -----------------
function hydrate_conversations(array $rows): array {
    $db = brix_db();
    $ids = array_column($rows, 'id');
    $msgs = []; $notes = [];
    if ($ids) {
        $in = implode(',', array_fill(0, count($ids), '?'));
        $st = $db->prepare("SELECT * FROM messages WHERE conversation_id IN ($in) ORDER BY created_at ASC, id ASC");
        $st->execute($ids);
        foreach ($st->fetchAll() as $m) $msgs[$m['conversation_id']][] = $m;
        $st = $db->prepare("SELECT * FROM conversation_notes WHERE conversation_id IN ($in) ORDER BY created_at ASC, id ASC");
        $st->execute($ids);
        foreach ($st->fetchAll() as $n) $notes[$n['conversation_id']][] = $n;
    }
    $depMap = []; $memMap = [];
    $depIds = array_values(array_unique(array_filter(array_column($rows, 'department_id'))));
    $memIds = array_values(array_unique(array_filter(array_column($rows, 'assignee_id'))));
    if ($depIds) {
        $in = implode(',', array_fill(0, count($depIds), '?'));
        $st = $db->prepare("SELECT id, name FROM departments WHERE id IN ($in)");
        $st->execute($depIds);
        foreach ($st->fetchAll() as $d) $depMap[$d['id']] = $d['name'];
    }
    if ($memIds) {
        $in = implode(',', array_fill(0, count($memIds), '?'));
        $st = $db->prepare("SELECT id, display_name FROM members WHERE id IN ($in)");
        $st->execute($memIds);
        foreach ($st->fetchAll() as $m) $memMap[$m['id']] = $m['display_name'];
    }
    return array_map(fn($r) => m_conversation(
        $r, $msgs[$r['id']] ?? [], $notes[$r['id']] ?? [],
        ($r['department_id'] !== null && isset($depMap[$r['department_id']])) ? $depMap[$r['department_id']] : null,
        ($r['assignee_id'] !== null && isset($memMap[$r['assignee_id']])) ? $memMap[$r['assignee_id']] : null
    ), $rows);
}

function hydrate_members(array $rows): array {
    $db = brix_db();
    $ids = array_column($rows, 'id');
    $map = [];
    if ($ids) {
        $in = implode(',', array_fill(0, count($ids), '?'));
        $st = $db->prepare("SELECT member_id, department_id FROM department_members WHERE member_id IN ($in)");
        $st->execute($ids);
        foreach ($st->fetchAll() as $x) $map[$x['member_id']][] = $x['department_id'];
    }
    return array_map(fn($r) => m_member($r, $map[$r['id']] ?? []), $rows);
}

function hydrate_departments(array $rows): array {
    $db = brix_db();
    $ids = array_column($rows, 'id');
    $map = [];
    if ($ids) {
        $in = implode(',', array_fill(0, count($ids), '?'));
        $st = $db->prepare("SELECT department_id, member_id FROM department_members WHERE department_id IN ($in)");
        $st->execute($ids);
        foreach ($st->fetchAll() as $x) $map[$x['department_id']][] = $x['member_id'];
    }
    return array_map(fn($r) => m_department($r, $map[$r['id']] ?? []), $rows);
}
