<?php

namespace App\Support\Api;

use stdClass;

/**
 * DB rows -> API shapes (mirrors the frontend map* functions in src/lib/api.ts).
 * Nullable *_at fields stay null, never ''. Empty JSON objects stay {}.
 */
final class Serialize
{
    public static function property(array $r): array
    {
        return [
            'id' => $r['id'], 'workspace_id' => $r['workspace_id'], 'name' => $r['name'],
            'domain' => $r['domain'], 'public_key' => $r['public_key'],
            'secure_mode' => (bool) $r['secure_mode'],
            'widget_config' => Json::decode($r['widget_config'] ?? null, new stdClass()),
            'created_at' => Json::iso($r['created_at']), 'updated_at' => Json::iso($r['updated_at']),
        ];
    }

    public static function message(array $r): array
    {
        return [
            'id' => $r['id'], 'conversation_id' => $r['conversation_id'], 'sender' => $r['sender'],
            'kind' => $r['kind'], 'text' => $r['text'],
            'metadata' => Json::decode($r['metadata'] ?? null, new stdClass()),
            'created_at' => Json::iso($r['created_at']),
        ];
    }

    /** Conversation notes have no id in the API shape. */
    public static function note(array $r): array
    {
        return ['author' => $r['author_name'] ?? '', 'text' => $r['text'], 'created_at' => Json::iso($r['created_at'])];
    }

    public static function conversation(array $r, array $messages = [], array $notes = [], ?string $department = null, ?string $agentName = null): array
    {
        return [
            'id' => $r['id'], 'property_id' => $r['property_id'], 'contact_id' => $r['contact_id'],
            'visitor_name' => $r['visitor_name'], 'visitor_email' => $r['visitor_email'],
            'page_url' => $r['page_url'], 'referrer' => $r['referrer'], 'status' => $r['status'],
            'department_id' => $r['department_id'], 'department' => $department,
            'agent_id' => $r['assignee_id'], 'agent_name' => $agentName,
            'tags' => Json::decode($r['tags'] ?? null, []), 'priority' => $r['priority'],
            'rating' => $r['rating'] === null ? null : (int) $r['rating'],
            'unread' => (int) $r['unread'], 'ai_handled' => (bool) $r['ai_handled'],
            'closed_at' => Json::iso($r['closed_at']),
            'messages' => array_map([self::class, 'message'], $messages),
            'notes' => array_map([self::class, 'note'], $notes),
            'created_at' => Json::iso($r['created_at']), 'updated_at' => Json::iso($r['updated_at']),
        ];
    }

    public static function contact(array $r): array
    {
        return [
            'id' => $r['id'], 'property_id' => $r['property_id'], 'name' => $r['name'],
            'email' => $r['email'], 'phone' => $r['phone'], 'country' => $r['country'],
            'tags' => Json::decode($r['tags'] ?? null, []), 'notes' => $r['notes'], 'source' => $r['source'],
            'chats' => (int) ($r['chats_count'] ?? 0), 'last_seen_at' => Json::iso($r['last_seen_at']),
            'created_at' => Json::iso($r['created_at']), 'updated_at' => Json::iso($r['updated_at']),
        ];
    }

    public static function contactEvent(array $r): array
    {
        return [
            'id' => $r['id'], 'contact_id' => $r['contact_id'], 'kind' => $r['kind'],
            'title' => $r['title'], 'body' => $r['body'], 'related_id' => $r['related_id'],
            'occurred_at' => Json::iso($r['occurred_at']), 'created_at' => Json::iso($r['created_at']),
        ];
    }

    public static function member(array $r, array $departmentIds = []): array
    {
        return [
            'id' => $r['id'], 'display_name' => $r['display_name'], 'initials' => $r['initials'],
            'color' => $r['color'], 'role' => $r['role'], 'email' => $r['email'],
            'job_title' => $r['job_title'], 'avatar_data_url' => $r['avatar_url'],
            'status' => $r['status'], 'online' => $r['status'] === 'online',
            'active' => true, 'passcode' => '',
            'last_login' => Json::iso($r['last_login_at']),
            'department_ids' => array_values($departmentIds),
            'created_at' => Json::iso($r['created_at']), 'updated_at' => Json::iso($r['updated_at']),
        ];
    }

    public static function department(array $r, array $agentIds = []): array
    {
        return [
            'id' => $r['id'], 'property_id' => $r['property_id'], 'name' => $r['name'],
            'description' => $r['description'], 'routing_mode' => $r['routing_mode'],
            'hours_override' => Json::decode($r['hours_override'] ?? null),
            'offline_behavior' => $r['offline_behavior'], 'agent_ids' => array_values($agentIds),
            'created_at' => Json::ms($r['created_at']), 'updated_at' => Json::iso($r['updated_at']),
        ];
    }

    public static function ticket(array $r): array
    {
        return [
            'id' => $r['id'], 'property_id' => $r['property_id'], 'subject' => $r['subject'],
            'message' => $r['message'], 'requester_name' => $r['requester_name'],
            'requester_email' => $r['requester_email'], 'status' => $r['status'],
            'priority' => $r['priority'], 'assignee_id' => $r['assignee_id'],
            'sla_due' => Json::iso($r['sla_due']), 'sla_breached' => (bool) $r['sla_breached'],
            'conversation_id' => $r['conversation_id'], 'tags' => Json::decode($r['tags'] ?? null, []),
            'category_id' => $r['category_id'],
            'parent_id' => null, 'relation' => null, // not stored server-side
            'created_at' => Json::iso($r['created_at']), 'updated_at' => Json::iso($r['updated_at']),
        ];
    }

    public static function notification(array $r): array
    {
        return [
            'id' => $r['id'], 'member_id' => $r['member_id'], 'type' => $r['type'],
            'title' => $r['title'], 'body' => $r['body'], 'link' => $r['link'],
            'read' => (bool) $r['read'], 'created_at' => Json::iso($r['created_at']),
        ];
    }

    public static function rating(array $r): array
    {
        return [
            'id' => $r['id'], 'property_id' => $r['property_id'], 'conversation_id' => $r['conversation_id'],
            'agent_id' => $r['member_id'], 'kind' => $r['kind'], 'score' => (int) $r['score'],
            'comment' => $r['comment'], 'created_at' => Json::ms($r['created_at']),
        ];
    }

    public static function category(array $r, string $scope): array
    {
        return [
            'id' => $r['id'], 'property_id' => $r['property_id'], 'scope' => $scope,
            'name' => $r['name'], 'color' => $r['color'], 'position' => (int) $r['position'],
            'created_at' => Json::ms($r['created_at']),
        ];
    }

    public static function view(array $r): array
    {
        return [
            'id' => $r['id'], 'member_id' => $r['member_id'], 'name' => $r['name'],
            'filters' => Json::decode($r['filters'] ?? null, new stdClass()),
            'created_at' => Json::iso($r['created_at']),
        ];
    }

    public static function play(array $r): array
    {
        return [
            'id' => $r['id'], 'name' => $r['name'], 'steps' => Json::decode($r['steps'] ?? null, []),
            'created_at' => Json::iso($r['created_at']),
        ];
    }

    public static function goal(array $r): array
    {
        return [
            'id' => $r['id'], 'property_id' => $r['property_id'], 'name' => $r['name'],
            'event' => $r['event'], 'revenue' => (float) $r['revenue'],
            'created_at' => Json::iso($r['created_at']),
        ];
    }

    public static function unanswered(array $r): array
    {
        return [
            'id' => $r['id'], 'property_id' => $r['property_id'], 'question' => $r['question'],
            'conversation_id' => $r['conversation_id'], 'count' => (int) $r['count'],
            'dismissed' => (bool) $r['dismissed'],
            'created_at' => Json::iso($r['created_at']), 'updated_at' => Json::iso($r['updated_at']),
        ];
    }

    public static function article(array $r, ?string $category = null): array
    {
        return [
            'id' => $r['id'], 'property_id' => $r['property_id'], 'category_id' => $r['category_id'],
            'category' => $category, 'title' => $r['title'], 'slug' => $r['slug'],
            'body' => $r['body'], 'status' => $r['status'],
            // No separate flag in the schema: drafts are internal-only.
            'internal_only' => $r['status'] !== 'published',
            'views' => (int) $r['views'], 'helpful' => (int) $r['helpful'], 'not_helpful' => (int) $r['not_helpful'],
            'created_at' => Json::iso($r['created_at']), 'updated_at' => Json::iso($r['updated_at']),
        ];
    }

    public static function canned(array $r): array
    {
        return [
            'id' => $r['id'], 'property_id' => $r['property_id'], 'category_id' => $r['category_id'],
            'shortcut' => $r['shortcut'], 'title' => $r['title'], 'body' => $r['body'],
            'shared' => (bool) $r['shared'], 'owner_member_id' => $r['owner_member_id'],
            'usage_count' => (int) $r['usage_count'],
            'created_at' => Json::iso($r['created_at']), 'updated_at' => Json::iso($r['updated_at']),
        ];
    }

    public static function trigger(array $r): array
    {
        return [
            'id' => $r['id'], 'property_id' => $r['property_id'], 'name' => $r['name'],
            'kind' => $r['kind'], 'event' => $r['event'],
            'condition_groups' => Json::decode($r['condition_groups'] ?? null, []),
            'actions' => Json::decode($r['actions'] ?? null, []),
            'enabled' => (bool) $r['enabled'],
            'created_at' => Json::iso($r['created_at']), 'updated_at' => Json::iso($r['updated_at']),
        ];
    }

    public static function webhook(array $r): array
    {
        return [
            'id' => $r['id'], 'property_id' => $r['property_id'], 'url' => $r['url'],
            'secret_set' => !empty($r['secret']), // the secret itself is never returned
            'disabled_reason' => $r['disabled_reason'], 'events' => Json::decode($r['events'] ?? null, []),
            'enabled' => (bool) $r['enabled'], 'auto_disable' => (bool) $r['auto_disable'],
            'consecutive_failures' => (int) $r['consecutive_failures'],
            'created_at' => Json::iso($r['created_at']), 'updated_at' => Json::iso($r['updated_at']),
        ];
    }

    public static function delivery(array $r): array
    {
        return [
            'id' => $r['id'], 'webhook_id' => $r['webhook_id'], 'property_id' => $r['property_id'],
            'event' => $r['event'], 'event_id' => $r['event_id'],
            'payload' => Json::decode($r['payload'] ?? null, new stdClass()),
            'status' => $r['status'], 'http_status' => $r['http_status'] === null ? null : (int) $r['http_status'],
            'attempt_count' => (int) $r['attempt_count'], 'latency_ms' => $r['latency_ms'] === null ? null : (int) $r['latency_ms'],
            'last_error' => $r['last_error'], 'next_attempt_at' => Json::iso($r['next_attempt_at']),
            'created_at' => Json::iso($r['created_at']),
        ];
    }

    public static function apiKey(array $r): array
    {
        return [
            'id' => $r['id'], 'name' => $r['name'], 'prefix' => $r['prefix'],
            'key_hash' => '', // never readable
            'scopes' => Json::decode($r['scopes'] ?? null, []), 'revoked' => (bool) $r['revoked'],
            'usage_count' => (int) $r['usage_count'], 'last_used_at' => Json::iso($r['last_used_at']),
            'created_at' => Json::iso($r['created_at']),
        ];
    }

    public static function audit(array $r): array
    {
        return [
            'id' => $r['id'], 'actor_member_id' => $r['actor_member_id'],
            'actor' => $r['actor_name'], 'action' => $r['action'], 'entity' => $r['entity'],
            'entity_id' => $r['entity_id'], 'meta' => Json::decode($r['meta'] ?? null, new stdClass()),
            'created_at' => Json::iso($r['created_at']),
        ];
    }

    public static function visitor(array $r): array
    {
        return [
            'id' => $r['id'], 'property_id' => $r['property_id'], 'contact_id' => $r['contact_id'],
            'name' => $r['name'], 'email' => $r['email'], 'page_url' => $r['page_url'],
            'pages' => (int) $r['pages'], 'country' => $r['country'], 'city' => $r['city'],
            'device' => $r['device'], 'browser' => $r['browser'],
            'time_on_site_sec' => (int) $r['time_on_site_sec'], 'typing_preview' => $r['typing_preview'],
            'online' => (bool) $r['online'],
            'custom_attributes' => Json::decode($r['custom_attributes'] ?? null, new stdClass()),
            'last_seen_at' => Json::iso($r['last_seen_at']),
            'created_at' => Json::iso($r['created_at']), 'updated_at' => Json::iso($r['updated_at']),
        ];
    }

    public static function invite(array $r): array
    {
        return [
            'id' => $r['id'], 'email' => $r['email'], 'display_name' => $r['display_name'],
            'role' => $r['role'], 'expires_at' => Json::iso($r['expires_at']),
            'used_at' => Json::iso($r['used_at']), 'created_at' => Json::iso($r['created_at']),
        ];
    }

    public static function integration(array $registry, ?array $row): array
    {
        $values = [];
        $config = $row ? Json::decode($row['config'] ?? null, []) : [];
        if ($config && isset($config['values'])) {
            $values = $config['values'];
        }

        return [
            'id' => $row['id'] ?? ('reg-'.$registry['provider']),
            'provider' => $registry['provider'], 'name' => $registry['name'],
            'description' => $registry['description'],
            'values' => $values, 'enabled' => $row ? (bool) $row['enabled'] : false,
        ];
    }

    // ---- bulk hydration (joins done once per list) ---------------------------

    public static function conversations(array $rows): array
    {
        $ids = array_column($rows, 'id');
        $messages = $notes = $departments = $agents = [];
        if ($ids) {
            $in = Sql::marks($ids);
            foreach (Sql::all("SELECT * FROM messages WHERE conversation_id IN ($in) ORDER BY created_at ASC, id ASC", $ids) as $m) {
                $messages[$m['conversation_id']][] = $m;
            }
            foreach (Sql::all("SELECT * FROM conversation_notes WHERE conversation_id IN ($in) ORDER BY created_at ASC, id ASC", $ids) as $n) {
                $notes[$n['conversation_id']][] = $n;
            }
        }
        $departmentIds = array_values(array_unique(array_filter(array_column($rows, 'department_id'))));
        if ($departmentIds) {
            foreach (Sql::all('SELECT id, name FROM departments WHERE id IN ('.Sql::marks($departmentIds).')', $departmentIds) as $d) {
                $departments[$d['id']] = $d['name'];
            }
        }
        $agentIds = array_values(array_unique(array_filter(array_column($rows, 'assignee_id'))));
        if ($agentIds) {
            foreach (Sql::all('SELECT id, display_name FROM members WHERE id IN ('.Sql::marks($agentIds).')', $agentIds) as $a) {
                $agents[$a['id']] = $a['display_name'];
            }
        }

        return array_map(fn ($r) => self::conversation(
            $r, $messages[$r['id']] ?? [], $notes[$r['id']] ?? [],
            $r['department_id'] !== null ? ($departments[$r['department_id']] ?? null) : null,
            $r['assignee_id'] !== null ? ($agents[$r['assignee_id']] ?? null) : null,
        ), $rows);
    }

    public static function members(array $rows): array
    {
        $ids = array_column($rows, 'id');
        $map = [];
        if ($ids) {
            foreach (Sql::all('SELECT member_id, department_id FROM department_members WHERE member_id IN ('.Sql::marks($ids).')', $ids) as $x) {
                $map[$x['member_id']][] = $x['department_id'];
            }
        }

        return array_map(fn ($r) => self::member($r, $map[$r['id']] ?? []), $rows);
    }

    public static function departments(array $rows): array
    {
        $ids = array_column($rows, 'id');
        $map = [];
        if ($ids) {
            foreach (Sql::all('SELECT department_id, member_id FROM department_members WHERE department_id IN ('.Sql::marks($ids).')', $ids) as $x) {
                $map[$x['department_id']][] = $x['member_id'];
            }
        }

        return array_map(fn ($r) => self::department($r, $map[$r['id']] ?? []), $rows);
    }
}
