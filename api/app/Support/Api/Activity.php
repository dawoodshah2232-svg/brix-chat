<?php

namespace App\Support\Api;

use Throwable;

/**
 * Best-effort audit + notification writes. They never break the primary operation.
 */
final class Activity
{
    public static function audit(string $wid, ?array $member, string $action, string $entity = '', string $entityId = '', array $meta = []): void
    {
        try {
            Sql::run(
                'INSERT INTO audit_log (id, workspace_id, actor_member_id, actor_name, action, entity, entity_id, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [Sql::uuid(), $wid, $member['id'] ?? null, $member['display_name'] ?? 'system', $action, $entity, $entityId, Json::encode($meta)],
            );
        } catch (Throwable) {
            // swallowed by design
        }
    }

    /** Shorthand: audit as the current member. */
    public static function log(Member $c, string $action, string $entity = '', string $entityId = '', array $meta = []): void
    {
        self::audit($c->wid, $c->member, $action, $entity, $entityId, $meta);
    }

    public static function notify(string $wid, string $type, string $title, string $body = '', ?string $link = null, ?string $memberId = null): void
    {
        try {
            Sql::run(
                'INSERT INTO notifications (id, workspace_id, member_id, type, title, body, link) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [Sql::uuid(), $wid, $memberId, $type, $title, $body, $link],
            );
        } catch (Throwable) {
            // swallowed by design
        }
    }
}
