<?php
declare(strict_types=1);

// --- Token ----------------------------------------------------------------------
// Format: base64url(json_payload) . '.' . hex_hmac_sha256(payload, APP_SECRET)
// Payload: { wid, mid, exp }
function b64u_encode(string $s): string {
    return rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
}

function b64u_decode(string $s): string|false {
    return base64_decode(strtr($s, '-_', '+/'), true);
}

function token_issue(string $wid, string $mid, int $ttl = 2592000): string {
    $payload = b64u_encode(jenc(['wid' => $wid, 'mid' => $mid, 'exp' => time() + $ttl]));
    $sig = hash_hmac('sha256', $payload, (string)brix_config()['APP_SECRET']);
    return $payload . '.' . $sig;
}

function token_verify(string $tok): ?array {
    $p = explode('.', $tok);
    if (count($p) !== 2 || $p[0] === '' || $p[1] === '') return null;
    $expect = hash_hmac('sha256', $p[0], (string)brix_config()['APP_SECRET']);
    if (!hash_equals($expect, strtolower($p[1]))) return null;
    $raw = b64u_decode($p[0]);
    if ($raw === false) return null;
    $d = json_decode($raw, true);
    if (!is_array($d) || !isset($d['wid'], $d['mid'], $d['exp'])) return null;
    if ((int)$d['exp'] < time()) return null;
    return $d;
}

// --- Request auth ----------------------------------------------------------------
// Reads `Authorization: Bearer <token>`, verifies it, loads workspace + member,
// and returns the context. EVERY query must scope by $ctx['wid'].
function auth_ctx(): array {
    static $ctx = null;
    if ($ctx !== null) return $ctx;
    $h = $_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
    if (!preg_match('/^Bearer\s+(.+)$/i', trim($h), $m)) {
        brix_fail('unauthorized', 'Missing bearer token', 401);
    }
    $d = token_verify(trim($m[1]));
    if (!$d) brix_fail('unauthorized', 'Invalid or expired token', 401);
    $db = brix_db();
    $st = $db->prepare('SELECT id, name, slug FROM workspaces WHERE id = ?');
    $st->execute([$d['wid']]);
    $ws = $st->fetch();
    $st = $db->prepare('SELECT * FROM members WHERE id = ? AND workspace_id = ?');
    $st->execute([$d['mid'], $d['wid']]);
    $mb = $st->fetch();
    if (!$ws || !$mb) brix_fail('unauthorized', 'Session is no longer valid', 401);
    $ctx = ['wid' => $ws['id'], 'mid' => $mb['id'], 'role' => $mb['role'], 'member' => $mb, 'workspace' => $ws];
    return $ctx;
}

// --- Role matrix (mirrors the Postgres RLS design, see schema header) -------------
// Pattern A (chat content): read = admin/agent/viewer; write = admin/agent.
//   (developers are deliberately excluded from chat-content reads)
// Pattern B (ops data): read = any member; write = admin/agent/developer.
function can(string $role, string $table, string $op): bool {
    static $A = ['conversations', 'messages', 'conversation_notes', 'visitors', 'contacts', 'contact_events'];
    static $B = ['goals', 'goal_events', 'campaigns', 'tickets', 'ratings', 'kb_categories', 'kb_articles',
                 'canned_categories', 'canned_responses', 'ticket_categories', 'triggers', 'plays',
                 'saved_views', 'unanswered_questions'];
    static $ADMIN_W = ['properties', 'members', 'departments', 'branding', 'property_settings', 'department_members'];
    static $ADMIN_DEV = ['webhooks', 'webhook_deliveries', 'api_keys', 'integrations'];
    // member_credentials and member_invites: deny-all at the API layer (internal only).

    if (in_array($table, $A, true)) {
        return $op === 'read'
            ? in_array($role, ['admin', 'agent', 'viewer'], true)
            : in_array($role, ['admin', 'agent'], true);
    }
    if (in_array($table, $B, true)) {
        return $op === 'read' ? true : in_array($role, ['admin', 'agent', 'developer'], true);
    }
    if (in_array($table, $ADMIN_W, true)) {
        return $op === 'read' ? true : $role === 'admin';
    }
    if (in_array($table, $ADMIN_DEV, true)) {
        return in_array($role, ['admin', 'developer'], true);
    }
    if ($table === 'notifications') {
        return $op === 'read' ? true : in_array($role, ['admin', 'agent'], true);
    }
    if ($table === 'audit_log') {
        return $op === 'read' ? $role === 'admin' : false;
    }
    return $role === 'admin';
}

/** Enforce the matrix; returns the auth context. */
function need(string $table, string $op): array {
    $c = auth_ctx();
    if (!can($c['role'], $table, $op)) {
        brix_fail('forbidden', 'Insufficient permissions', 403);
    }
    return $c;
}

// --- Workspace-scoped row fetch ----------------------------------------------------
// Cross-workspace write guard (app-layer mirror of the DB triggers): every
// referenced parent row must belong to the caller's workspace.
function own(string $table, mixed $id, string $wid, string $cols = '*'): array {
    $id = v_uuid($id, $table . ' id');
    $db = brix_db();
    $st = $db->prepare("SELECT $cols FROM `$table` WHERE id = ? AND workspace_id = ?");
    $st->execute([$id, $wid]);
    $r = $st->fetch();
    if (!$r) brix_fail('not_found', ucfirst(rtrim($table, 's')) . ' not found', 404);
    return $r;
}
