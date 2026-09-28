<?php

namespace App\Support\Api;

/**
 * The authenticated workspace member for this request (set by the
 * AuthenticateMember middleware). Every query must scope by $wid.
 */
final class Member
{
    /** Chat content: read admin/agent/viewer, write admin/agent (developers excluded). */
    private const CHAT = ['conversations', 'messages', 'conversation_notes', 'visitors', 'contacts', 'contact_events'];

    /** Ops data: read any member, write admin/agent/developer. */
    private const OPS = ['goals', 'goal_events', 'campaigns', 'tickets', 'ratings', 'kb_categories', 'kb_articles',
        'canned_categories', 'canned_responses', 'ticket_categories', 'triggers', 'plays',
        'saved_views', 'unanswered_questions'];

    /** Workspace config: read any member, write admin. */
    private const CONFIG = ['properties', 'members', 'departments', 'branding', 'property_settings', 'department_members'];

    /** Developer surface: admin/developer only. */
    private const DEVELOPER = ['webhooks', 'webhook_deliveries', 'api_keys', 'integrations'];

    public function __construct(
        public readonly string $wid,
        public readonly string $mid,
        public readonly string $role,
        public readonly array $member,
        public readonly array $workspace,
    ) {
    }

    public static function can(string $role, string $table, string $op): bool
    {
        if ($role === 'owner') {
            return true;
        }
        if (in_array($table, self::CHAT, true)) {
            return $op === 'read'
                ? in_array($role, ['admin', 'agent', 'viewer'], true)
                : in_array($role, ['admin', 'agent'], true);
        }
        if (in_array($table, self::OPS, true)) {
            return $op === 'read' || in_array($role, ['admin', 'agent', 'developer'], true);
        }
        if (in_array($table, self::CONFIG, true)) {
            return $op === 'read' || $role === 'admin';
        }
        if (in_array($table, self::DEVELOPER, true)) {
            return in_array($role, ['admin', 'developer'], true);
        }
        if ($table === 'notifications') {
            return $op === 'read' || in_array($role, ['admin', 'agent'], true);
        }
        if ($table === 'audit_log') {
            return $op === 'read' && $role === 'admin';
        }

        return in_array($role, ['admin', 'owner'], true);
    }

    /** Enforce the role matrix for $table/$op (403 otherwise). */
    public function need(string $table, string $op): self
    {
        if (!self::can($this->role, $table, $op)) {
            Json::fail('forbidden', 'Insufficient permissions', 403);
        }

        return $this;
    }

    /** Owner/admin, or the member acting on their own record. */
    public function selfOrAdmin(string $memberId): void
    {
        if (!in_array($this->role, ['admin', 'owner'], true) && $this->mid !== $memberId) {
            Json::fail('forbidden', 'Insufficient permissions', 403);
        }
    }

    public function name(): string
    {
        return (string) ($this->member['display_name'] ?? '');
    }
}
