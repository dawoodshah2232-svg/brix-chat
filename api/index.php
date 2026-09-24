<?php
declare(strict_types=1);

// Brix Chat — plain-PHP REST API (single entry point, no framework).
// Clean URLs via api/.htaccess: /api/<resource> -> index.php?route=<resource>.
// Dev/test: php -S 127.0.0.1:8099 api/router.php

require __DIR__ . '/lib/db.php';
require __DIR__ . '/lib/respond.php';
require __DIR__ . '/lib/validate.php';
require __DIR__ . '/lib/auth.php';
require __DIR__ . '/lib/serialize.php';
require __DIR__ . '/lib/audit.php';
require __DIR__ . '/lib/webhooks.php';

// Invite token alphabet (must be declared before the dispatch code runs:
// PHP registers top-level consts when execution reaches the declaration).
const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

$cfg = brix_config();

// --- CORS: only the configured SITE_ORIGIN (+ localhost when APP_DEBUG=1) ----
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowed = [$cfg['SITE_ORIGIN'] ?? ''];
if (!empty($cfg['APP_DEBUG'])) {
    $allowed = array_merge($allowed, [
        'http://localhost:5173', 'http://127.0.0.1:5173',
        'http://localhost:3000', 'http://127.0.0.1:3000',
        'http://localhost:8099', 'http://127.0.0.1:8099',
    ]);
}
if ($origin !== '' && in_array($origin, $allowed, true)) {
    header("Access-Control-Allow-Origin: $origin");
    header('Vary: Origin');
    header('Access-Control-Allow-Headers: Authorization, Content-Type');
    header('Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS');
}
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$route = trim((string)($_GET['route'] ?? ''), '/');
$seg = $route === '' ? [] : explode('/', $route);
$r0 = $seg[0] ?? '';
$r1 = $seg[1] ?? null;
$r2 = $seg[2] ?? null;
$r3 = $seg[3] ?? null;

try {
    $handler = 'route_' . preg_replace('/[^a-z0-9_]/', '_', $r0);
    if ($r0 === '' || !function_exists($handler)) {
        brix_fail('not_found', 'Unknown endpoint', 404);
    }
    $handler($method, $seg, $r1, $r2, $r3);
    brix_fail('not_found', 'Unknown endpoint', 404);
} catch (ApiError $e) {
    http_response_code($e->estatus);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => ['code' => $e->ecode, 'message' => $e->getMessage()]],
        JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    error_log('[brix-api] ' . $e->getMessage());
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    $msg = !empty($cfg['APP_DEBUG']) ? $e->getMessage() : 'Internal server error';
    echo json_encode(['error' => ['code' => 'supabase_error', 'message' => $msg]],
        JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
}

// ============================================================================
// auth
// ============================================================================
function route_auth(string $method, array $seg, $r1, $r2, $r3): void {
    $db = brix_db();
    if ($method === 'POST' && $r1 === 'login' && $r2 === null) {
        $b = req_body();
        $slug = mb_strtolower(trim((string)v_required($b, 'workspace')));
        $passcode = v_passcode($b['passcode'] ?? null, 4, 128);

        $st = $db->prepare('SELECT id, name, slug FROM workspaces WHERE slug = ?');
        $st->execute([$slug]);
        $ws = $st->fetch();
        if (!$ws) brix_fail('unauthorized', 'Invalid workspace or passcode', 401);

        // Members of this workspace whose bcrypt hash verifies (admins first).
        $st = $db->prepare("SELECT m.*, mc.passcode_hash FROM members m
            JOIN member_credentials mc ON mc.member_id = m.id
            WHERE m.workspace_id = ?
            ORDER BY FIELD(m.role, 'admin', 'agent', 'developer', 'viewer')");
        $st->execute([$ws['id']]);
        $member = null;
        foreach ($st->fetchAll() as $m) {
            if (isset($m['passcode_hash']) && str_starts_with((string)$m['passcode_hash'], '$2')
                && password_verify($passcode, (string)$m['passcode_hash'])) {
                $member = $m;
                break;
            }
        }
        if (!$member) brix_fail('unauthorized', 'Invalid workspace or passcode', 401);

        $st = $db->prepare("UPDATE members SET last_login_at = UTC_TIMESTAMP(), status = 'online' WHERE id = ?");
        $st->execute([$member['id']]);
        $member['status'] = 'online';
        audit_log($ws['id'], $member, 'member.login', 'member', $member['id']);

        brix_json([
            'token' => token_issue($ws['id'], $member['id']),
            'workspace' => ['id' => $ws['id'], 'name' => $ws['name'], 'slug' => $ws['slug']],
            'member' => hydrate_members([$member])[0],
        ]);
    }
    if ($method === 'GET' && $r1 === 'me' && $r2 === null) {
        $c = auth_ctx();
        $members = hydrate_members([$c['member']]);
        brix_json([
            'member' => $members[0],
            'workspace' => ['id' => $c['workspace']['id'], 'name' => $c['workspace']['name'], 'slug' => $c['workspace']['slug']],
        ]);
    }
}

// ============================================================================
// workspaces
// ============================================================================
function route_workspaces(string $method, array $seg, $r1, $r2, $r3): void {
    $db = brix_db();
    if ($method === 'POST' && $r1 === null) {
        // Bootstrap: any authenticated member may create a workspace (becomes its admin).
        $src = auth_ctx();
        $b = req_body();
        $name = v_str(v_required($b, 'name'), 'name', 255);
        $display = v_str(v_required($b, 'display_name'), 'display_name', 60);
        $passcode = v_passcode($b['passcode'] ?? null, 4, 128);

        $slug = trim((string)preg_replace('/[^a-z0-9]+/', '-', mb_strtolower($name)), '-');
        if ($slug === '') $slug = 'workspace';
        $slug .= '-' . substr(md5(random_bytes(16)), 0, 6);

        $wsId = new_uuid();
        $db->beginTransaction();
        try {
            $db->prepare('INSERT INTO workspaces (id, name, slug) VALUES (?, ?, ?)')
               ->execute([$wsId, $name, $slug]);
            $mid = new_uuid();
            $db->prepare("INSERT INTO members (id, workspace_id, display_name, initials, color, role, status)
                          VALUES (?, ?, ?, ?, ?, 'admin', 'online')")
               ->execute([$mid, $wsId, $display, member_initials($display), '#4f46e5']);
            $db->prepare('INSERT INTO member_credentials (member_id, passcode_hash) VALUES (?, ?)')
               ->execute([$mid, password_hash($passcode, PASSWORD_BCRYPT)]);
            $db->commit();
        } catch (Throwable $e) { $db->rollBack(); throw $e; }

        $member = ['id' => $mid, 'workspace_id' => $wsId, 'display_name' => $display,
                   'initials' => member_initials($display), 'color' => '#4f46e5', 'role' => 'admin',
                   'email' => '', 'job_title' => '', 'avatar_url' => null, 'status' => 'online',
                   'last_login_at' => gmdate('Y-m-d H:i:s'),
                   'created_at' => gmdate('Y-m-d H:i:s'), 'updated_at' => gmdate('Y-m-d H:i:s')];
        audit_log($wsId, $member, 'workspace.created', 'workspace', $wsId, ['name' => $name]);
        brix_json([
            'token' => token_issue($wsId, $mid),
            'workspace' => ['id' => $wsId, 'name' => $name, 'slug' => $slug],
            'member' => m_member($member, []),
        ], 201);
    }
    $c = need('workspaces', $r1 === null && $method === 'GET' ? 'read' : 'write');
    if ($method === 'GET' && ($r1 === null || $r1 === 'current')) {
        brix_json(['id' => $c['workspace']['id'], 'name' => $c['workspace']['name'], 'slug' => $c['workspace']['slug']]);
    }
    if ($method === 'PATCH' && ($r1 === null || $r1 === 'current')) {
        $b = req_body();
        $sets = []; $params = [];
        if (array_key_exists('name', $b)) { $sets[] = 'name = ?'; $params[] = v_str($b['name'], 'name', 255); }
        if (array_key_exists('slug', $b)) {
            $slug = mb_strtolower(trim(v_str($b['slug'], 'slug', 255)));
            if (!preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $slug)) brix_fail('validation', 'Invalid slug', 422);
            $sets[] = 'slug = ?'; $params[] = $slug;
        }
        if (!$sets) brix_fail('validation', 'Nothing to update', 422);
        $params[] = $c['wid'];
        $db->prepare('UPDATE workspaces SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);
        audit_log($c['wid'], $c['member'], 'workspace.updated', 'workspace', $c['wid']);
        $st = $db->prepare('SELECT id, name, slug FROM workspaces WHERE id = ?');
        $st->execute([$c['wid']]);
        brix_json($st->fetch());
    }
    if ($method === 'DELETE' && ($r1 === null || $r1 === 'current')) {
        // Admin-only destructive cascade (all child rows cascade-delete).
        $db->prepare('DELETE FROM workspaces WHERE id = ?')->execute([$c['wid']]);
        brix_json(['deleted' => true]);
    }
}

function member_initials(string $name): string {
    $parts = preg_split('/\s+/', trim($name));
    $in = '';
    foreach (array_slice($parts, 0, 2) as $p) $in .= mb_strtoupper(mb_substr($p, 0, 1));
    return $in !== '' ? $in : '?';
}

// ============================================================================
// properties (+ widget config, + property settings/branding)
// ============================================================================
function route_properties(string $method, array $seg, $r1, $r2, $r3): void {
    $db = brix_db();

    // GET /properties/by-key/:key — public-key lookup (widget bootstrap)
    if ($method === 'GET' && $r1 === 'by-key' && $r2 !== null && $r3 === null) {
        $c = need('properties', 'read');
        $st = $db->prepare('SELECT * FROM properties WHERE workspace_id = ? AND public_key = ?');
        $st->execute([$c['wid'], $r2]);
        $r = $st->fetch();
        if (!$r) brix_fail('not_found', 'Property not found', 404);
        brix_json(m_property($r));
    }

    $id = $r1;
    $isId = $id !== null && $id !== 'by-key';

    if ($isId && $r2 === 'widget-config' && $r3 === null) {
        if ($method === 'GET') {
            $c = need('properties', 'read');
            $p = own('properties', $id, $c['wid']);
            brix_json(array_merge(widget_defaults(), jdec($p['widget_config'] ?? null, [])));
        }
        if ($method === 'PATCH') {
            $c = need('properties', 'write');
            $p = own('properties', $id, $c['wid']);
            $merged = array_merge(jdec($p['widget_config'] ?? null, []), req_body());
            $db->prepare('UPDATE properties SET widget_config = ? WHERE id = ? AND workspace_id = ?')
               ->execute([jenc($merged), $p['id'], $c['wid']]);
            audit_log($c['wid'], $c['member'], 'widget.updated', 'property', $p['id']);
            brix_json(array_merge(widget_defaults(), $merged));
        }
    }

    // GET/PATCH /properties/:id/settings — merged propertySettings (branding + settings)
    if ($isId && $r2 === 'settings' && $r3 === null) {
        if ($method === 'GET') {
            $c = need('property_settings', 'read');
            brix_json(property_settings_get($c['wid'], own('properties', $id, $c['wid'])['id']));
        }
        if ($method === 'PATCH') {
            $c = need('property_settings', 'write');
            $pid = own('properties', $id, $c['wid'])['id'];
            brix_json(property_settings_patch($c, $pid, req_body()));
        }
    }

    if ($method === 'GET' && $r1 === null) {
        $c = need('properties', 'read');
        $st = $db->prepare('SELECT * FROM properties WHERE workspace_id = ? ORDER BY created_at DESC');
        $st->execute([$c['wid']]);
        brix_items(array_map('m_property', $st->fetchAll()), null);
    }
    if ($method === 'POST' && $r1 === null) {
        $c = need('properties', 'write');
        $b = req_body();
        $name = v_str(v_required($b, 'name'), 'name', 255);
        $domain = isset($b['domain']) ? v_str($b['domain'], 'domain', 255) : '';
        $pid = isset($b['id']) ? v_uuid($b['id']) : new_uuid();
        $key = 'bx_' . bin2hex(random_bytes(9)); // 18 hex chars
        $db->prepare("INSERT INTO properties (id, workspace_id, name, domain, public_key, secure_mode, widget_config)
                      VALUES (?, ?, ?, ?, ?, 0, ?)")
           ->execute([$pid, $c['wid'], $name, $domain, $key, jenc(widget_defaults())]);
        audit_log($c['wid'], $c['member'], 'property.created', 'property', $pid, ['name' => $name]);
        $st = $db->prepare('SELECT * FROM properties WHERE id = ?');
        $st->execute([$pid]);
        brix_json(m_property($st->fetch()), 201);
    }
    if ($isId && $r2 === null) {
        if ($method === 'GET') {
            $c = need('properties', 'read');
            brix_json(m_property(own('properties', $id, $c['wid'])));
        }
        if ($method === 'PATCH') {
            $c = need('properties', 'write');
            $p = own('properties', $id, $c['wid']);
            $b = req_body();
            $sets = []; $params = [];
            foreach (['name', 'domain'] as $f) {
                if (array_key_exists($f, $b)) { $sets[] = "$f = ?"; $params[] = v_str($b[$f], $f, 255); }
            }
            if (array_key_exists('secure_mode', $b)) { $sets[] = 'secure_mode = ?'; $params[] = v_bool($b['secure_mode']) ? 1 : 0; }
            if (!$sets) brix_fail('validation', 'Nothing to update', 422);
            $params[] = $p['id']; $params[] = $c['wid'];
            $db->prepare('UPDATE properties SET ' . implode(', ', $sets) . ' WHERE id = ? AND workspace_id = ?')->execute($params);
            audit_log($c['wid'], $c['member'], 'property.updated', 'property', $p['id']);
            brix_json(m_property(own('properties', $id, $c['wid'])));
        }
        if ($method === 'DELETE') {
            $c = need('properties', 'write');
            $p = own('properties', $id, $c['wid']);
            $db->prepare('DELETE FROM properties WHERE id = ? AND workspace_id = ?')->execute([$p['id'], $c['wid']]);
            audit_log($c['wid'], $c['member'], 'property.deleted', 'property', $p['id']);
            brix_json(['deleted' => true]);
        }
    }
    if ($isId && $r2 === 'regenerate-key' && $r3 === null && $method === 'POST') {
        $c = need('properties', 'write');
        $p = own('properties', $id, $c['wid']);
        $key = 'bx_' . bin2hex(random_bytes(9));
        $db->prepare('UPDATE properties SET public_key = ? WHERE id = ? AND workspace_id = ?')
           ->execute([$key, $p['id'], $c['wid']]);
        audit_log($c['wid'], $c['member'], 'property.key_regenerated', 'property', $p['id']);
        brix_json(['public_key' => $key]);
    }
}

// Merged PropertySettings: defaults <- property_settings.settings <- branding fields + departments.
function property_settings_get(string $wid, string $pid): array {
    $db = brix_db();
    $st = $db->prepare('SELECT * FROM property_settings WHERE workspace_id = ? AND property_id = ?');
    $st->execute([$wid, $pid]);
    $ps = $st->fetch();
    $st = $db->prepare('SELECT * FROM branding WHERE workspace_id = ? AND property_id = ?');
    $st->execute([$wid, $pid]);
    $br = $st->fetch();
    $out = property_settings_defaults();
    if ($ps) $out = array_merge($out, jdec($ps['settings'] ?? null, []));
    if ($br) {
        $out['brand_name'] = $br['brand_name']; $out['tagline'] = $br['tagline'];
        $out['logo_data_url'] = $br['logo_url']; $out['theme'] = $br['theme'];
        $out['accent_color'] = $br['accent_color']; $out['widget_color'] = $br['widget_color'];
        $out['widget_position'] = $br['widget_position']; $out['launcher_style'] = $br['launcher_style'];
        $out['language'] = $br['language'];
    }
    $st = $db->prepare('SELECT id, name FROM departments WHERE workspace_id = ? AND property_id = ? ORDER BY name ASC');
    $st->execute([$wid, $pid]);
    $out['departments'] = $st->fetchAll();
    $out['property_id'] = $pid;
    return $out;
}

function property_settings_patch(array $c, string $pid, array $b): array {
    $db = brix_db();
    $brandKeys = ['brand_name', 'tagline', 'logo_data_url', 'theme', 'accent_color', 'widget_color',
                  'widget_position', 'launcher_style', 'language'];
    $brandPatch = [];
    foreach ($brandKeys as $k) {
        if (array_key_exists($k, $b)) {
            $col = $k === 'logo_data_url' ? 'logo_url' : $k;
            $brandPatch[$col] = $b[$k] === null ? null : v_str($b[$k], $k, 65535);
        }
    }
    if ($brandPatch) {
        $st = $db->prepare('SELECT id FROM branding WHERE workspace_id = ? AND property_id = ?');
        $st->execute([$c['wid'], $pid]);
        if ($st->fetch()) {
            $sets = []; $params = [];
            foreach ($brandPatch as $col => $v) { $sets[] = "$col = ?"; $params[] = $v; }
            $params[] = $c['wid']; $params[] = $pid;
            $db->prepare('UPDATE branding SET ' . implode(', ', $sets) . ' WHERE workspace_id = ? AND property_id = ?')->execute($params);
        } else {
            $cols = array_keys($brandPatch);
            $db->prepare('INSERT INTO branding (id, workspace_id, property_id, ' . implode(', ', $cols) . ')
                          VALUES (?, ?, ?, ' . implode(', ', array_fill(0, count($cols), '?')) . ')')
               ->execute([new_uuid(), $c['wid'], $pid, ...array_values($brandPatch)]);
        }
    }
    $settingsPatch = array_diff_key($b, array_flip($brandKeys));
    if ($settingsPatch) {
        $st = $db->prepare('SELECT id, settings FROM property_settings WHERE workspace_id = ? AND property_id = ?');
        $st->execute([$c['wid'], $pid]);
        $ps = $st->fetch();
        if ($ps) {
            $merged = array_merge(jdec($ps['settings'] ?? null, []), $settingsPatch);
            $db->prepare('UPDATE property_settings SET settings = ? WHERE id = ?')->execute([jenc($merged), $ps['id']]);
        } else {
            $db->prepare('INSERT INTO property_settings (id, workspace_id, property_id, settings) VALUES (?, ?, ?, ?)')
               ->execute([new_uuid(), $c['wid'], $pid, jenc($settingsPatch)]);
        }
    }
    audit_log($c['wid'], $c['member'], 'property_settings.updated', 'property', $pid);
    return property_settings_get($c['wid'], $pid);
}

// ============================================================================
// conversations (+ messages, notes)
// ============================================================================
function route_conversations(string $method, array $seg, $r1, $r2, $r3): void {
    $db = brix_db();

    // GET /conversations — list w/ filters, cursor-paginated
    if ($method === 'GET' && $r1 === null) {
        $c = need('conversations', 'read');
        $where = 'FROM conversations WHERE workspace_id = ?';
        $params = [$c['wid']];
        if (($v = req_q('propertyId')) !== null) { $where .= ' AND property_id = ?'; $params[] = v_uuid($v, 'propertyId'); }
        if (($v = req_q('status')) !== null) { $where .= ' AND status = ?'; $params[] = v_in($v, ['open', 'closed', 'spam', 'missed'], 'status'); }
        if (($v = req_q('priority')) !== null) { $where .= ' AND priority = ?'; $params[] = v_in($v, ['low', 'medium', 'high', 'urgent'], 'priority'); }
        if (($v = req_q('tag')) !== null) { $where .= ' AND JSON_CONTAINS(tags, JSON_QUOTE(?))'; $params[] = mb_strtolower(trim((string)$v)); }
        if (($v = req_q('assignee')) !== null) {
            if ($v === 'unassigned') $where .= ' AND assignee_id IS NULL';
            else { $where .= ' AND assignee_id = ?'; $params[] = v_uuid($v, 'assignee'); }
        }
        if (($q = req_q('q')) !== null && trim((string)$q) !== '') {
            $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], trim((string)$q)) . '%';
            $where .= " AND (visitor_name LIKE ? ESCAPE '\\\\' OR visitor_email LIKE ? ESCAPE '\\\\'
                       OR EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = conversations.id AND m.text LIKE ? ESCAPE '\\\\'))";
            $params[] = $like; $params[] = $like; $params[] = $like;
        }
        [$items, $next] = cursor_page($db, $where, $params, [['updated_at', 'DESC'], ['id', 'DESC']],
            req_q('cursor'), req_q('limit', 50), fn($r) => $r);
        brix_items(hydrate_conversations($items), $next);
    }

    // POST /conversations — startSession
    if ($method === 'POST' && $r1 === null) {
        $c = need('conversations', 'write');
        $b = req_body();
        $prop = own('properties', $b['property_id'] ?? null, $c['wid']);
        $convId = isset($b['id']) ? v_uuid($b['id']) : new_uuid();
        $name = isset($b['name']) ? v_str($b['name'], 'name', 255) : 'Guest';

        // Auto-resolve department named 'Support' (case-insensitive).
        $st = $db->prepare('SELECT id FROM departments WHERE workspace_id = ? AND property_id = ? AND LOWER(name) = ? LIMIT 1');
        $st->execute([$c['wid'], $prop['id'], 'support']);
        $dept = $st->fetch();

        $db->prepare("INSERT INTO conversations (id, workspace_id, property_id, visitor_name, visitor_email,
                      page_url, referrer, status, department_id, tags, priority, unread)
                      VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, 0)")
           ->execute([$convId, $c['wid'], $prop['id'], $name,
                      isset($b['email']) ? v_email($b['email']) : '',
                      isset($b['page_url']) ? v_str($b['page_url'], 'page_url', 2048) : '',
                      isset($b['referrer']) ? v_str($b['referrer'], 'referrer', 2048) : '',
                      $dept['id'] ?? null, jenc(v_tags($b['tags'] ?? [])),
                      isset($b['priority']) ? v_in($b['priority'], ['low', 'medium', 'high', 'urgent'], 'priority') : 'medium']);
        // Greeting message from widget config.
        $greeting = array_merge(widget_defaults(), jdec($prop['widget_config'] ?? null, []))['greeting'];
        $db->prepare("INSERT INTO messages (id, workspace_id, conversation_id, sender, kind, text, metadata)
                      VALUES (?, ?, ?, 'agent', 'text', ?, ?)")
           ->execute([new_uuid(), $c['wid'], $convId, $greeting, jenc(['greeting' => true])]);
        audit_log($c['wid'], $c['member'], 'conversation.started', 'conversation', $convId);
        $rows = hydrate_conversations([own('conversations', $convId, $c['wid'])]);
        brix_json($rows[0], 201);
    }

    $cid = $r1;
    if ($cid === null) brix_fail('not_found', 'Unknown endpoint', 404);

    // GET /conversations/:id/messages — ordered list
    if ($r2 === 'messages' && $r3 === null) {
        if ($method === 'GET') {
            $c = need('messages', 'read');
            $conv = own('conversations', $cid, $c['wid']);
            $where = 'FROM messages WHERE conversation_id = ? AND workspace_id = ?';
            [$items, $next] = cursor_page($db, $where, [$conv['id'], $c['wid']], [['created_at', 'ASC'], ['id', 'ASC']],
                req_q('cursor'), req_q('limit', 50), 'm_message');
            brix_items($items, $next);
        }
        // POST /conversations/:id/messages — sendMessage
        if ($method === 'POST') {
            $c = need('messages', 'write');
            $conv = own('conversations', $cid, $c['wid']);
            $b = req_body();
            $text = v_str(v_required($b, 'text'), 'text', 65535);
            if ($text === '') brix_fail('validation', 'text must not be empty', 422);
            $sender = v_in($b['sender'] ?? 'agent', ['visitor', 'agent', 'ai', 'system'], 'sender');
            $kind = v_in($b['kind'] ?? 'text', ['text', 'file', 'voice', 'rating'], 'kind');
            $mid = isset($b['id']) ? v_uuid($b['id']) : new_uuid();
            $db->prepare("INSERT INTO messages (id, workspace_id, conversation_id, sender, kind, text, metadata)
                          VALUES (?, ?, ?, ?, ?, ?, ?)")
               ->execute([$mid, $c['wid'], $conv['id'], $sender, $kind, $text, jenc($b['metadata'] ?? new stdClass())]);
            // Visitor message -> unread+1; any send on non-open -> reopen.
            $sets = $sender === 'visitor' ? 'unread = unread + 1,' : '';
            if ($conv['status'] !== 'open') $sets .= "status = 'open', closed_at = NULL,";
            if ($sets !== '') {
                $db->prepare("UPDATE conversations SET $sets updated_at = UTC_TIMESTAMP() WHERE id = ?")->execute([$conv['id']]);
            }
            audit_log($c['wid'], $c['member'], 'message.sent', 'conversation', $conv['id'], ['sender' => $sender]);
            // Visitor message -> fan out to subscribed webhooks. Deliveries
            // are flushed by api/cron/webhook-retry.php (5-min cron).
            if ($sender === 'visitor') {
                $pst = $db->prepare('SELECT name FROM properties WHERE id = ?');
                $pst->execute([$conv['property_id']]);
                $propName = $pst->fetch()['name'] ?? null;
                webhook_enqueue($c['wid'], 'message.received', $conv['property_id'], [
                    'event' => 'message.received',
                    'conversation_id' => $conv['id'],
                    'visitor_id' => $conv['contact_id'] ?? null,
                    'visitor_name' => $conv['visitor_name'],
                    'message_text' => $text,
                    'property_id' => $conv['property_id'],
                    'property_name' => $propName,
                    'timestamp' => now_iso(),
                ]);
            }
            $st = $db->prepare('SELECT * FROM messages WHERE id = ?');
            $st->execute([$mid]);
            brix_json(m_message($st->fetch()), 201);
        }
    }

    // GET/POST /conversations/:id/notes
    if ($r2 === 'notes' && $r3 === null) {
        if ($method === 'GET') {
            $c = need('conversation_notes', 'read');
            $conv = own('conversations', $cid, $c['wid']);
            $st = $db->prepare('SELECT * FROM conversation_notes WHERE conversation_id = ? ORDER BY created_at ASC, id ASC');
            $st->execute([$conv['id']]);
            brix_items(array_map('m_note_shape', $st->fetchAll()), null);
        }
        if ($method === 'POST') {
            $c = need('conversation_notes', 'write');
            $conv = own('conversations', $cid, $c['wid']);
            $b = req_body();
            $text = v_str(v_required($b, 'text'), 'text', 65535);
            $author = isset($b['author']) ? v_str($b['author'], 'author', 255) : ($c['member']['display_name'] ?? '');
            $nid = isset($b['id']) ? v_uuid($b['id']) : new_uuid();
            $db->prepare('INSERT INTO conversation_notes (id, workspace_id, conversation_id, author_member_id, author_name, text)
                          VALUES (?, ?, ?, ?, ?, ?)')
               ->execute([$nid, $c['wid'], $conv['id'], $c['mid'], $author, $text]);
            brix_json(['author' => $author, 'text' => $text, 'created_at' => now_iso()], 201);
        }
    }

    // POST /conversations/:id/assign | /transfer | /status | /tags | /rating | /read | /close | /reopen
    if ($r2 !== null && $r3 === null && $method === 'POST' && in_array($r2,
        ['assign', 'transfer', 'status', 'tags', 'rating', 'read', 'close', 'reopen'], true)) {
        $c = need('conversations', 'write');
        $conv = own('conversations', $cid, $c['wid']);
        $b = req_body();
        $dbm = brix_db();

        if ($r2 === 'assign') {
            $agentId = v_opt_uuid($b['agent_id'] ?? $b['assignee_id'] ?? null, 'agent_id');
            $deptId = null;
            if (isset($b['department']) && $b['department'] !== '') {
                // Resolve department BY NAME (frontend contract).
                $st = $dbm->prepare('SELECT id, name FROM departments WHERE workspace_id = ? AND LOWER(name) = LOWER(?) LIMIT 1');
                $st->execute([$c['wid'], v_str($b['department'], 'department', 255)]);
                $drow = $st->fetch();
                if (!$drow) brix_fail('not_found', 'Department not found', 404);
                $deptId = $drow['id'];
            } elseif (array_key_exists('department_id', $b)) {
                $deptId = v_opt_uuid($b['department_id'], 'department_id');
                if ($deptId) own('departments', $deptId, $c['wid']);
            }
            if ($agentId) own('members', $agentId, $c['wid']);
            $dbm->prepare('UPDATE conversations SET assignee_id = ?, department_id = COALESCE(?, department_id) WHERE id = ?')
                ->execute([$agentId, $deptId, $conv['id']]);
            audit_log($c['wid'], $c['member'], 'conversation.assigned', 'conversation', $conv['id']);
        }
        if ($r2 === 'transfer') {
            $agentId = v_opt_uuid($b['agent_id'] ?? null, 'agent_id');
            $deptId = v_opt_uuid($b['department_id'] ?? null, 'department_id');
            if ($agentId) own('members', $agentId, $c['wid']);
            if ($deptId) own('departments', $deptId, $c['wid']);
            $dbm->prepare('UPDATE conversations SET assignee_id = COALESCE(?, assignee_id), department_id = COALESCE(?, department_id) WHERE id = ?')
                ->execute([$agentId, $deptId, $conv['id']]);
            $note = isset($b['note']) ? v_str($b['note'], 'note', 65535) : '';
            $target = 'the team';
            if ($agentId) {
                $st = $dbm->prepare('SELECT display_name FROM members WHERE id = ?');
                $st->execute([$agentId]); $target = $st->fetch()['display_name'] ?? $target;
            }
            $summary = 'Transferred to ' . $target . ($note !== '' ? ' — ' . $note : '');
            $dbm->prepare('INSERT INTO conversation_notes (id, workspace_id, conversation_id, author_member_id, author_name, text)
                           VALUES (?, ?, ?, ?, ?, ?)')
                ->execute([new_uuid(), $c['wid'], $conv['id'], $c['mid'], $c['member']['display_name'] ?? '', $summary]);
            $dbm->prepare("INSERT INTO messages (id, workspace_id, conversation_id, sender, kind, text, metadata)
                           VALUES (?, ?, ?, 'system', 'text', ?, ?)")
                ->execute([new_uuid(), $c['wid'], $conv['id'], '🔀 ' . $summary, jenc(['transfer' => true])]);
            if ($agentId) notify_push($c['wid'], 'chat.assigned', 'Chat transferred to you', $summary, null, $agentId);
            audit_log($c['wid'], $c['member'], 'conversation.transferred', 'conversation', $conv['id'], ['to' => $target]);
        }
        if ($r2 === 'status' || $r2 === 'close' || $r2 === 'reopen') {
            $status = $r2 === 'close' ? 'closed' : ($r2 === 'reopen' ? 'open' : v_in($b['status'] ?? '', ['open', 'closed', 'spam', 'missed'], 'status'));
            $closedAt = $status === 'closed' ? gmdate('Y-m-d H:i:s') : null;
            $unreadZero = $status !== 'open' ? ', unread = 0' : '';
            $dbm->prepare("UPDATE conversations SET status = ?, closed_at = ? $unreadZero WHERE id = ?")
                ->execute([$status, $closedAt, $conv['id']]);
            audit_log($c['wid'], $c['member'], 'conversation.status_changed', 'conversation', $conv['id'],
                ['from' => $conv['status'], 'to' => $status]);
        }
        if ($r2 === 'tags') {
            $tags = v_tags($b['tags'] ?? []);
            $dbm->prepare('UPDATE conversations SET tags = ? WHERE id = ?')->execute([jenc($tags), $conv['id']]);
        }
        if ($r2 === 'rating') {
            $rating = v_int($b['rating'] ?? null, 'rating', 1, 5);
            $dbm->prepare('UPDATE conversations SET rating = ? WHERE id = ?')->execute([$rating, $conv['id']]);
        }
        if ($r2 === 'read') {
            $dbm->prepare('UPDATE conversations SET unread = 0 WHERE id = ?')->execute([$conv['id']]);
            brix_json(['unread' => 0]);
        }
        $rows = hydrate_conversations([own('conversations', $conv['id'], $c['wid'])]);
        brix_json($rows[0]);
    }

    if ($method === 'GET' && $r2 === null) {
        $c = need('conversations', 'read');
        $rows = hydrate_conversations([own('conversations', $cid, $c['wid'])]);
        brix_json($rows[0]);
    }
    if ($method === 'PATCH' && $r2 === null) {
        $c = need('conversations', 'write');
        $conv = own('conversations', $cid, $c['wid']);
        $b = req_body();
        $sets = []; $params = [];
        foreach (['visitor_name' => 255, 'visitor_email' => 255, 'page_url' => 2048, 'referrer' => 2048] as $f => $mx) {
            if (array_key_exists($f, $b)) { $sets[] = "$f = ?"; $params[] = v_str($b[$f], $f, $mx); }
        }
        if (array_key_exists('priority', $b)) { $sets[] = 'priority = ?'; $params[] = v_in($b['priority'], ['low', 'medium', 'high', 'urgent'], 'priority'); }
        if (array_key_exists('status', $b)) {
            $s = v_in($b['status'], ['open', 'closed', 'spam', 'missed'], 'status');
            $sets[] = 'status = ?'; $params[] = $s;
            $sets[] = 'closed_at = ?'; $params[] = $s === 'closed' ? gmdate('Y-m-d H:i:s') : null;
        }
        if (array_key_exists('department_id', $b)) {
            $d = v_opt_uuid($b['department_id'], 'department_id');
            if ($d) own('departments', $d, $c['wid']);
            $sets[] = 'department_id = ?'; $params[] = $d;
        }
        if (array_key_exists('assignee_id', $b)) {
            $a = v_opt_uuid($b['assignee_id'], 'assignee_id');
            if ($a) own('members', $a, $c['wid']);
            $sets[] = 'assignee_id = ?'; $params[] = $a;
        }
        if (array_key_exists('tags', $b)) { $sets[] = 'tags = ?'; $params[] = jenc(v_tags($b['tags'])); }
        if (array_key_exists('contact_id', $b)) {
            $ct = v_opt_uuid($b['contact_id'], 'contact_id');
            if ($ct) own('contacts', $ct, $c['wid']);
            $sets[] = 'contact_id = ?'; $params[] = $ct;
        }
        if (!$sets) brix_fail('validation', 'Nothing to update', 422);
        $params[] = $conv['id'];
        $db->prepare('UPDATE conversations SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);
        audit_log($c['wid'], $c['member'], 'conversation.updated', 'conversation', $conv['id']);
        $rows = hydrate_conversations([own('conversations', $conv['id'], $c['wid'])]);
        brix_json($rows[0]);
    }
    if ($method === 'DELETE' && $r2 === null) {
        $c = need('conversations', 'write');
        $conv = own('conversations', $cid, $c['wid']);
        $db->prepare('DELETE FROM conversations WHERE id = ?')->execute([$conv['id']]);
        audit_log($c['wid'], $c['member'], 'conversation.deleted', 'conversation', $conv['id']);
        brix_json(['deleted' => true]);
    }
}

// PATCH /messages/:id — update a single message
function route_messages(string $method, array $seg, $r1, $r2, $r3): void {
    $db = brix_db();
    if ($r1 !== null && $r2 === null && $method === 'PATCH') {
        $c = need('messages', 'write');
        $mid = v_uuid($r1);
        $st = $db->prepare('SELECT m.* FROM messages m JOIN conversations co ON co.id = m.conversation_id
                            WHERE m.id = ? AND co.workspace_id = ?');
        $st->execute([$mid, $c['wid']]);
        $msg = $st->fetch();
        if (!$msg) brix_fail('not_found', 'Message not found', 404);
        $b = req_body();
        $sets = []; $params = [];
        if (array_key_exists('text', $b)) { $sets[] = 'text = ?'; $params[] = v_str($b['text'], 'text', 65535); }
        if (array_key_exists('kind', $b)) { $sets[] = 'kind = ?'; $params[] = v_in($b['kind'], ['text', 'file', 'voice', 'rating'], 'kind'); }
        if (array_key_exists('metadata', $b)) { $sets[] = 'metadata = ?'; $params[] = jenc($b['metadata']); }
        if (!$sets) brix_fail('validation', 'Nothing to update', 422);
        $params[] = $mid;
        $db->prepare('UPDATE messages SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);
        $st = $db->prepare('SELECT * FROM messages WHERE id = ?');
        $st->execute([$mid]);
        brix_json(m_message($st->fetch()));
    }
}

// ============================================================================
// contacts
// ============================================================================
function route_contacts(string $method, array $seg, $r1, $r2, $r3): void {
    $db = brix_db();
    if ($method === 'GET' && $r1 === null) {
        $c = need('contacts', 'read');
        $where = 'FROM contacts WHERE workspace_id = ?';
        $params = [$c['wid']];
        if (($v = req_q('propertyId')) !== null) { $where .= ' AND property_id = ?'; $params[] = v_uuid($v, 'propertyId'); }
        if (($v = req_q('tag')) !== null) { $where .= ' AND JSON_CONTAINS(tags, JSON_QUOTE(?))'; $params[] = mb_strtolower(trim((string)$v)); }
        if (($q = req_q('q')) !== null && trim((string)$q) !== '') {
            $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], trim((string)$q)) . '%';
            $where .= " AND (name LIKE ? ESCAPE '\\\\' OR email LIKE ? ESCAPE '\\\\')";
            $params[] = $like; $params[] = $like;
        }
        [$items, $next] = cursor_page($db, $where, $params, [['last_seen_at', 'DESC'], ['id', 'DESC']],
            req_q('cursor'), req_q('limit', 50), 'm_contact');
        brix_items($items, $next);
    }
    if ($method === 'POST' && $r1 === null) {
        $c = need('contacts', 'write');
        $b = req_body();
        $name = v_str(v_required($b, 'name'), 'name', 255);
        $propId = v_opt_uuid($b['property_id'] ?? null, 'property_id');
        if ($propId) own('properties', $propId, $c['wid']);
        $cid = isset($b['id']) ? v_uuid($b['id']) : new_uuid();
        $db->prepare("INSERT INTO contacts (id, workspace_id, property_id, name, email, phone, country, tags, notes, source)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
           ->execute([$cid, $c['wid'], $propId, $name,
                      isset($b['email']) ? v_email($b['email']) : '',
                      isset($b['phone']) ? v_str($b['phone'], 'phone', 64) : '',
                      isset($b['country']) ? v_str($b['country'], 'country', 128) : '',
                      jenc(v_tags($b['tags'] ?? [])),
                      isset($b['notes']) ? v_str($b['notes'], 'notes', 65535) : '',
                      isset($b['source']) ? v_str($b['source'], 'source', 64) : 'api']);
        audit_log($c['wid'], $c['member'], 'contact.created', 'contact', $cid, ['name' => $name]);
        brix_json(m_contact(own('contacts', $cid, $c['wid'])), 201);
    }
    if ($r1 !== null && $r2 === null) {
        if ($method === 'GET') {
            $c = need('contacts', 'read');
            brix_json(m_contact(own('contacts', $r1, $c['wid'])));
        }
        if ($method === 'PATCH') {
            $c = need('contacts', 'write');
            $row = own('contacts', $r1, $c['wid']);
            $b = req_body();
            $sets = []; $params = [];
            foreach (['name' => 255, 'email' => 255, 'phone' => 64, 'country' => 128, 'notes' => 65535, 'source' => 64] as $f => $mx) {
                if (array_key_exists($f, $b)) { $sets[] = "$f = ?"; $params[] = $f === 'email' ? v_email($b[$f]) : v_str($b[$f], $f, $mx); }
            }
            if (array_key_exists('tags', $b)) { $sets[] = 'tags = ?'; $params[] = jenc(v_tags($b['tags'])); }
            if (array_key_exists('property_id', $b)) {
                $p = v_opt_uuid($b['property_id'], 'property_id');
                if ($p) own('properties', $p, $c['wid']);
                $sets[] = 'property_id = ?'; $params[] = $p;
            }
            if (!$sets) brix_fail('validation', 'Nothing to update', 422);
            $sets[] = 'last_seen_at = UTC_TIMESTAMP()';
            $params[] = $row['id'];
            $db->prepare('UPDATE contacts SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);
            audit_log($c['wid'], $c['member'], 'contact.updated', 'contact', $row['id']);
            brix_json(m_contact(own('contacts', $row['id'], $c['wid'])));
        }
        if ($method === 'DELETE') {
            $c = need('contacts', 'write');
            $row = own('contacts', $r1, $c['wid']);
            $db->prepare('DELETE FROM contacts WHERE id = ?')->execute([$row['id']]);
            audit_log($c['wid'], $c['member'], 'contact.deleted', 'contact', $row['id']);
            brix_json(['deleted' => true]);
        }
    }
}

// ============================================================================
// contact_events
// ============================================================================
function route_contact_events(string $method, array $seg, $r1, $r2, $r3): void {
    $db = brix_db();
    if ($method === 'GET' && $r1 === null) {
        $c = need('contact_events', 'read');
        $where = 'FROM contact_events WHERE workspace_id = ?';
        $params = [$c['wid']];
        if (($v = req_q('contact_id')) !== null) { $where .= ' AND contact_id = ?'; $params[] = v_uuid($v, 'contact_id'); }
        [$items, $next] = cursor_page($db, $where, $params, [['occurred_at', 'DESC'], ['id', 'DESC']],
            req_q('cursor'), req_q('limit', 50), 'm_contact_event');
        brix_items($items, $next);
    }
    if ($method === 'POST' && $r1 === null) {
        $c = need('contact_events', 'write');
        $b = req_body();
        $contact = own('contacts', $b['contact_id'] ?? null, $c['wid']);
        $eid = isset($b['id']) ? v_uuid($b['id']) : new_uuid();
        $db->prepare('INSERT INTO contact_events (id, workspace_id, contact_id, kind, title, body, related_id)
                      VALUES (?, ?, ?, ?, ?, ?, ?)')
           ->execute([$eid, $c['wid'], $contact['id'],
                      v_str(v_required($b, 'kind'), 'kind', 64),
                      v_str(v_required($b, 'title'), 'title', 255),
                      isset($b['body']) ? v_str($b['body'], 'body', 65535) : '',
                      v_opt_uuid($b['related_id'] ?? null, 'related_id')]);
        $st = $db->prepare('SELECT * FROM contact_events WHERE id = ?');
        $st->execute([$eid]);
        brix_json(m_contact_event($st->fetch()), 201);
    }
    if ($r1 !== null && $r2 === null) {
        if ($method === 'GET') {
            $c = need('contact_events', 'read');
            $st = $db->prepare('SELECT * FROM contact_events WHERE id = ?');
            $st->execute([$eid = own('contact_events', $r1, $c['wid'])['id']]);
            brix_json(m_contact_event($st->fetch()));
        }
        if ($method === 'PATCH') {
            $c = need('contact_events', 'write');
            $row = own('contact_events', $r1, $c['wid']);
            $b = req_body();
            $sets = []; $params = [];
            foreach (['title' => 255, 'body' => 65535, 'kind' => 64] as $f => $mx) {
                if (array_key_exists($f, $b)) { $sets[] = "$f = ?"; $params[] = v_str($b[$f], $f, $mx); }
            }
            if (!$sets) brix_fail('validation', 'Nothing to update', 422);
            $params[] = $row['id'];
            $db->prepare('UPDATE contact_events SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);
            $st = $db->prepare('SELECT * FROM contact_events WHERE id = ?');
            $st->execute([$row['id']]);
            brix_json(m_contact_event($st->fetch()));
        }
        if ($method === 'DELETE') {
            $c = need('contact_events', 'write');
            $row = own('contact_events', $r1, $c['wid']);
            $db->prepare('DELETE FROM contact_events WHERE id = ?')->execute([$row['id']]);
            brix_json(['deleted' => true]);
        }
    }
}

// ============================================================================
// tickets
// ============================================================================
function route_tickets(string $method, array $seg, $r1, $r2, $r3): void {
    $db = brix_db();

    if ($method === 'GET' && $r1 === null) {
        $c = need('tickets', 'read');
        $where = 'FROM tickets WHERE workspace_id = ?';
        $params = [$c['wid']];
        if (($v = req_q('status')) !== null) { $where .= ' AND status = ?'; $params[] = v_in($v, ['new', 'open', 'resolved'], 'status'); }
        if (($v = req_q('priority')) !== null) { $where .= ' AND priority = ?'; $params[] = v_in($v, ['low', 'medium', 'high', 'urgent'], 'priority'); }
        if (($v = req_q('assignee')) !== null) {
            if ($v === 'unassigned') $where .= ' AND assignee_id IS NULL';
            else { $where .= ' AND assignee_id = ?'; $params[] = v_uuid($v, 'assignee'); }
        }
        if (($v = req_q('category')) !== null) { $where .= ' AND category_id = ?'; $params[] = v_uuid($v, 'category'); }
        if (($q = req_q('q')) !== null && trim((string)$q) !== '') {
            $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], trim((string)$q)) . '%';
            $where .= " AND (subject LIKE ? ESCAPE '\\\\' OR requester_name LIKE ? ESCAPE '\\\\'
                       OR requester_email LIKE ? ESCAPE '\\\\' OR message LIKE ? ESCAPE '\\\\')";
            array_push($params, $like, $like, $like, $like);
        }
        [$items, $next] = cursor_page($db, $where, $params, [['created_at', 'DESC'], ['id', 'DESC']],
            req_q('cursor'), req_q('limit', 50), 'm_ticket');
        brix_items($items, $next);
    }

    if ($method === 'POST' && $r1 === null) {
        $c = need('tickets', 'write');
        $b = req_body();
        $tid = ticket_create($c, $b);
        audit_log($c['wid'], $c['member'], 'ticket.created', 'ticket', $tid, ['subject' => $b['subject'] ?? '']);
        notify_push($c['wid'], 'ticket.created', 'New ticket: ' . ($b['subject'] ?? ''), $b['message'] ?? '');
        brix_json(m_ticket(own('tickets', $tid, $c['wid'])), 201);
    }

    // POST /tickets/bulk
    if ($method === 'POST' && $r1 === 'bulk' && $r2 === null) {
        $c = need('tickets', 'write');
        $b = req_body();
        $ids = $b['ids'] ?? [];
        if (!is_array($ids) || !$ids) brix_fail('validation', 'ids must be a non-empty array', 422);
        $action = v_in($b['action'] ?? '', ['resolve', 'assign', 'spam'], 'action');
        $agentId = v_opt_uuid($b['agent_id'] ?? null, 'agent_id');
        if ($action === 'assign') {
            if (!$agentId) brix_fail('validation', 'agent_id required for assign', 422);
            own('members', $agentId, $c['wid']);
        }
        $updated = 0;
        foreach ($ids as $tid) {
            $tid = v_uuid($tid);
            $st = $db->prepare('SELECT id FROM tickets WHERE id = ? AND workspace_id = ?');
            $st->execute([$tid, $c['wid']]);
            if (!$st->fetch()) continue;
            if ($action === 'resolve') {
                $db->prepare("UPDATE tickets SET status = 'resolved' WHERE id = ?")->execute([$tid]);
            } elseif ($action === 'spam') {
                $db->prepare("UPDATE tickets SET status = 'resolved',
                    tags = JSON_ARRAY_APPEND(IFNULL(tags, JSON_ARRAY()), '$', 'spam') WHERE id = ?")->execute([$tid]);
            } else {
                $db->prepare('UPDATE tickets SET assignee_id = ? WHERE id = ?')->execute([$agentId, $tid]);
            }
            $updated++;
        }
        audit_log($c['wid'], $c['member'], 'ticket.bulk', 'ticket', '', ['action' => $action, 'updated' => $updated]);
        brix_json(['updated' => $updated]);
    }

    // POST /tickets/from-conversation
    if ($method === 'POST' && $r1 === 'from-conversation' && $r2 === null) {
        $c = need('tickets', 'write');
        $b = req_body();
        $conv = own('conversations', $b['conversation_id'] ?? null, $c['wid']);
        $st = $db->prepare('SELECT sender, text, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC, id ASC');
        $st->execute([$conv['id']]);
        $lines = [];
        foreach ($st->fetchAll() as $m) $lines[] = '[' . $m['sender'] . '] ' . $m['text'];
        $transcript = implode("\n", $lines);
        $payload = [
            'subject' => $b['subject'] ?? ('Chat transcript — ' . ($conv['visitor_name'] ?: 'Guest')),
            'message' => ($b['message'] ?? '') . "\n\n--- transcript ---\n" . $transcript,
            'requester_name' => $b['requester_name'] ?? $conv['visitor_name'],
            'requester_email' => $b['requester_email'] ?? $conv['visitor_email'],
            'property_id' => $conv['property_id'],
            'conversation_id' => $conv['id'],
        ];
        if (isset($b['priority'])) $payload['priority'] = $b['priority'];
        $tid = ticket_create($c, $payload);
        audit_log($c['wid'], $c['member'], 'ticket.created', 'ticket', $tid, ['from_conversation' => $conv['id']]);
        brix_json(m_ticket(own('tickets', $tid, $c['wid'])), 201);
    }

    if ($r1 === null) brix_fail('not_found', 'Unknown endpoint', 404);
    $tid = v_uuid($r1);

    // POST /tickets/:id/{status,assign,priority,merge,split}
    if ($r2 !== null && $r3 === null && $method === 'POST' && in_array($r2, ['status', 'assign', 'priority', 'merge', 'split'], true)) {
        $c = need('tickets', 'write');
        $t = own('tickets', $tid, $c['wid']);
        $b = req_body();
        if ($r2 === 'status') {
            $s = v_in($b['status'] ?? '', ['new', 'open', 'resolved'], 'status');
            $db->prepare('UPDATE tickets SET status = ? WHERE id = ?')->execute([$s, $t['id']]);
            audit_log($c['wid'], $c['member'], 'ticket.status_changed', 'ticket', $t['id'], ['from' => $t['status'], 'to' => $s]);
        }
        if ($r2 === 'assign') {
            $a = v_opt_uuid($b['agent_id'] ?? null, 'agent_id');
            if ($a) own('members', $a, $c['wid']);
            $db->prepare('UPDATE tickets SET assignee_id = ? WHERE id = ?')->execute([$a, $t['id']]);
            audit_log($c['wid'], $c['member'], 'ticket.assigned', 'ticket', $t['id']);
            if ($a) notify_push($c['wid'], 'chat.assigned', 'Ticket assigned to you', $t['subject'], null, $a);
        }
        if ($r2 === 'priority') {
            $p = v_in($b['priority'] ?? '', ['low', 'medium', 'high', 'urgent'], 'priority');
            $db->prepare('UPDATE tickets SET priority = ? WHERE id = ?')->execute([$p, $t['id']]);
            audit_log($c['wid'], $c['member'], 'ticket.priority_changed', 'ticket', $t['id'], ['to' => $p]);
        }
        if ($r2 === 'merge') {
            // Merge = close this ticket as merged into the target (audit records the link;
            // the schema has no parent_id/relation columns).
            $target = own('tickets', $b['target_id'] ?? null, $c['wid']);
            $db->prepare("UPDATE tickets SET status = 'resolved' WHERE id = ?")->execute([$t['id']]);
            audit_log($c['wid'], $c['member'], 'ticket.merged', 'ticket', $t['id'], ['into' => $target['id']]);
        }
        if ($r2 === 'split') {
            // Split = create a child ticket copying the requester context.
            $child = [
                'subject' => $b['subject'] ?? ($t['subject'] . ' (split)'),
                'message' => $b['message'] ?? '',
                'requester_name' => $t['requester_name'], 'requester_email' => $t['requester_email'],
                'property_id' => $t['property_id'], 'priority' => $t['priority'],
                'tags' => jdec($t['tags'] ?? null, []),
            ];
            $childId = ticket_create($c, $child);
            audit_log($c['wid'], $c['member'], 'ticket.split', 'ticket', $t['id'], ['child' => $childId]);
            brix_json(m_ticket(own('tickets', $childId, $c['wid'])), 201);
        }
        brix_json(m_ticket(own('tickets', $t['id'], $c['wid'])));
    }

    if ($r2 === null) {
        if ($method === 'GET') {
            $c = need('tickets', 'read');
            brix_json(m_ticket(own('tickets', $tid, $c['wid'])));
        }
        if ($method === 'PATCH') {
            $c = need('tickets', 'write');
            $t = own('tickets', $tid, $c['wid']);
            $b = req_body();
            $sets = []; $params = [];
            foreach (['subject' => 255, 'message' => 65535, 'requester_name' => 255, 'requester_email' => 255] as $f => $mx) {
                if (array_key_exists($f, $b)) { $sets[] = "$f = ?"; $params[] = $f === 'requester_email' ? v_email($b[$f]) : v_str($b[$f], $f, $mx); }
            }
            if (array_key_exists('status', $b)) { $sets[] = 'status = ?'; $params[] = v_in($b['status'], ['new', 'open', 'resolved'], 'status'); }
            if (array_key_exists('priority', $b)) { $sets[] = 'priority = ?'; $params[] = v_in($b['priority'], ['low', 'medium', 'high', 'urgent'], 'priority'); }
            if (array_key_exists('tags', $b)) { $sets[] = 'tags = ?'; $params[] = jenc(v_tags($b['tags'])); }
            if (array_key_exists('sla_due', $b)) {
                $sets[] = 'sla_due = ?';
                $params[] = $b['sla_due'] === null ? null : gmdate('Y-m-d H:i:s', strtotime((string)$b['sla_due']));
            }
            if (array_key_exists('property_id', $b)) {
                $p = v_opt_uuid($b['property_id'], 'property_id');
                if ($p) own('properties', $p, $c['wid']);
                $sets[] = 'property_id = ?'; $params[] = $p;
            }
            if (array_key_exists('assignee_id', $b)) {
                $a = v_opt_uuid($b['assignee_id'], 'assignee_id');
                if ($a) own('members', $a, $c['wid']);
                $sets[] = 'assignee_id = ?'; $params[] = $a;
            }
            if (array_key_exists('conversation_id', $b)) {
                $cv = v_opt_uuid($b['conversation_id'], 'conversation_id');
                if ($cv) own('conversations', $cv, $c['wid']);
                $sets[] = 'conversation_id = ?'; $params[] = $cv;
            }
            if (array_key_exists('category_id', $b)) {
                $cat = v_opt_uuid($b['category_id'], 'category_id');
                if ($cat) {
                    $st = $db->prepare('SELECT id FROM ticket_categories WHERE id = ? AND workspace_id = ?');
                    $st->execute([$cat, $c['wid']]);
                    if (!$st->fetch()) brix_fail('not_found', 'Ticket category not found', 404);
                }
                $sets[] = 'category_id = ?'; $params[] = $cat;
            }
            if (!$sets) brix_fail('validation', 'Nothing to update', 422);
            $params[] = $t['id'];
            $db->prepare('UPDATE tickets SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);
            audit_log($c['wid'], $c['member'], 'ticket.updated', 'ticket', $t['id']);
            brix_json(m_ticket(own('tickets', $t['id'], $c['wid'])));
        }
        if ($method === 'DELETE') {
            $c = need('tickets', 'write');
            $t = own('tickets', $tid, $c['wid']);
            $db->prepare('DELETE FROM tickets WHERE id = ?')->execute([$t['id']]);
            audit_log($c['wid'], $c['member'], 'ticket.deleted', 'ticket', $t['id']);
            brix_json(['deleted' => true]);
        }
    }
}

function ticket_create(array $c, array $b): string {
    $db = brix_db();
    $subject = v_str(v_required($b, 'subject'), 'subject', 255);
    $propId = v_opt_uuid($b['property_id'] ?? null, 'property_id');
    if ($propId) own('properties', $propId, $c['wid']);
    $assignee = v_opt_uuid($b['assignee_id'] ?? null, 'assignee_id');
    if ($assignee) own('members', $assignee, $c['wid']);
    $convId = v_opt_uuid($b['conversation_id'] ?? null, 'conversation_id');
    if ($convId) own('conversations', $convId, $c['wid']);
    $catId = v_opt_uuid($b['category_id'] ?? null, 'category_id');
    if ($catId) {
        $st = $db->prepare('SELECT id FROM ticket_categories WHERE id = ? AND workspace_id = ?');
        $st->execute([$catId, $c['wid']]);
        if (!$st->fetch()) brix_fail('not_found', 'Ticket category not found', 404);
    }
    $tid = isset($b['id']) ? v_uuid($b['id']) : new_uuid();
    $db->prepare("INSERT INTO tickets (id, workspace_id, property_id, subject, message, requester_name,
                  requester_email, status, priority, assignee_id, sla_due, conversation_id, tags, category_id)
                  VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?, ?, ?)")
       ->execute([$tid, $c['wid'], $propId, $subject,
                  isset($b['message']) ? v_str($b['message'], 'message', 65535) : '',
                  isset($b['requester_name']) ? v_str($b['requester_name'], 'requester_name', 255) : 'Guest',
                  isset($b['requester_email']) ? v_email($b['requester_email']) : '',
                  isset($b['priority']) ? v_in($b['priority'], ['low', 'medium', 'high', 'urgent'], 'priority') : 'medium',
                  $assignee,
                  isset($b['sla_due']) && $b['sla_due'] ? gmdate('Y-m-d H:i:s', strtotime((string)$b['sla_due'])) : null,
                  $convId, jenc(v_tags($b['tags'] ?? [])), $catId]);
    return $tid;
}

// ============================================================================
// notifications
// ============================================================================
function route_notifications(string $method, array $seg, $r1, $r2, $r3): void {
    $db = brix_db();
    if ($method === 'GET' && $r1 === null) {
        $c = need('notifications', 'read');
        $where = 'FROM notifications WHERE workspace_id = ? AND (member_id IS NULL OR member_id = ?)';
        $params = [$c['wid'], $c['mid']];
        if (v_bool(req_q('unreadOnly', false))) $where .= ' AND `read` = 0';
        [$items, $next] = cursor_page($db, $where, $params, [['created_at', 'DESC'], ['id', 'DESC']],
            req_q('cursor'), req_q('limit', 50), 'm_notification');
        brix_items($items, $next);
    }
    // POST /notifications — push (admin/agent)
    if ($method === 'POST' && $r1 === null) {
        $c = need('notifications', 'write');
        $b = req_body();
        $type = v_str(v_required($b, 'type'), 'type', 64);
        $title = v_str(v_required($b, 'title'), 'title', 255);
        $memberId = v_opt_uuid($b['member_id'] ?? null, 'member_id');
        if ($memberId) own('members', $memberId, $c['wid']);
        $nid = isset($b['id']) ? v_uuid($b['id']) : new_uuid();
        $db->prepare('INSERT INTO notifications (id, workspace_id, member_id, type, title, body, link)
                      VALUES (?, ?, ?, ?, ?, ?, ?)')
           ->execute([$nid, $c['wid'], $memberId, $type, $title,
                      isset($b['body']) ? v_str($b['body'], 'body', 65535) : '',
                      isset($b['link']) ? v_str($b['link'], 'link', 2048) : null]);
        $st = $db->prepare('SELECT * FROM notifications WHERE id = ?');
        $st->execute([$nid]);
        brix_json(m_notification($st->fetch()), 201);
    }
    if ($method === 'POST' && $r1 === 'read-all' && $r2 === null) {
        $c = need('notifications', 'read');
        $st = $db->prepare('UPDATE notifications SET `read` = 1
                            WHERE workspace_id = ? AND (member_id IS NULL OR member_id = ?) AND `read` = 0');
        $st->execute([$c['wid'], $c['mid']]);
        brix_json(['read' => $st->rowCount()]);
    }
    if ($method === 'POST' && $r1 !== null && $r2 === 'read' && $r3 === null) {
        $c = need('notifications', 'read');
        $nid = v_uuid($r1);
        $st = $db->prepare('UPDATE notifications SET `read` = 1 WHERE id = ? AND workspace_id = ?
                            AND (member_id IS NULL OR member_id = ?)');
        $st->execute([$nid, $c['wid'], $c['mid']]);
        if ($st->rowCount() === 0) brix_fail('not_found', 'Notification not found', 404);
        brix_json(['read' => true]);
    }
    if ($method === 'DELETE' && $r1 !== null && $r2 === null) {
        $c = auth_ctx();
        if ($c['role'] !== 'admin') brix_fail('forbidden', 'Insufficient permissions', 403);
        $nid = v_uuid($r1);
        $st = $db->prepare('DELETE FROM notifications WHERE id = ? AND workspace_id = ?');
        $st->execute([$nid, $c['wid']]);
        if ($st->rowCount() === 0) brix_fail('not_found', 'Notification not found', 404);
        brix_json(['deleted' => true]);
    }
}

// ============================================================================
// ratings (+ summary) and metrics
// ============================================================================
function route_ratings(string $method, array $seg, $r1, $r2, $r3): void {
    $db = brix_db();
    if ($method === 'GET' && $r1 === 'summary' && $r2 === null) {
        $c = need('ratings', 'read');
        $propId = v_uuid(req_q('property_id'), 'property_id');
        $days = v_int(req_q('days', 30), 'days', 1, 365);
        $cutoff = gmdate('Y-m-d H:i:s', time() - $days * 86400);
        $st = $db->prepare('SELECT kind, score, created_at FROM ratings
                            WHERE workspace_id = ? AND property_id = ? AND created_at >= ?');
        $st->execute([$c['wid'], $propId, $cutoff]);
        $rows = $st->fetchAll();
        $csat = array_filter($rows, fn($r) => $r['kind'] === 'csat');
        $nps = array_filter($rows, fn($r) => $r['kind'] === 'nps');
        $dist = [1 => 0, 2 => 0, 3 => 0, 4 => 0, 5 => 0];
        foreach ($csat as $r) $dist[(int)$r['score']]++;
        $csatAvg = $csat ? array_sum(array_column($csat, 'score')) / count($csat) : 0;
        $csatPct = $csat ? 100 * count(array_filter($csat, fn($r) => (int)$r['score'] >= 4)) / count($csat) : 0;
        $prom = count(array_filter($nps, fn($r) => (int)$r['score'] >= 9));
        $detr = count(array_filter($nps, fn($r) => (int)$r['score'] <= 6));
        $npsScore = $nps ? 100 * ($prom - $detr) / count($nps) : 0;
        $trend = [];
        foreach ($rows as $r) {
            $day = substr((string)$r['created_at'], 0, 10);
            $trend[$day]['total'] = ($trend[$day]['total'] ?? 0) + 1;
            $trend[$day]['sum'] = ($trend[$day]['sum'] ?? 0) + (int)$r['score'];
        }
        ksort($trend);
        brix_json([
            'csat_avg' => round($csatAvg, 2), 'csat_pct' => round($csatPct, 1),
            'rated' => count($csat), 'distribution' => $dist,
            'nps_score' => round($npsScore, 1),
            'promoters' => $prom, 'passives' => count($nps) - $prom - $detr, 'detractors' => $detr,
            'daily' => array_map(fn($d, $v) => ['date' => $d, 'avg' => round($v['sum'] / $v['total'], 2), 'count' => $v['total']],
                array_keys($trend), array_values($trend)),
        ]);
    }
    if ($method === 'GET' && $r1 === null) {
        $c = need('ratings', 'read');
        $where = 'FROM ratings WHERE workspace_id = ?';
        $params = [$c['wid']];
        if (($v = req_q('property_id')) !== null) { $where .= ' AND property_id = ?'; $params[] = v_uuid($v, 'property_id'); }
        if (($v = req_q('agent_id')) !== null) { $where .= ' AND member_id = ?'; $params[] = v_uuid($v, 'agent_id'); }
        if (($v = req_q('kind')) !== null) { $where .= ' AND kind = ?'; $params[] = v_in($v, ['csat', 'nps'], 'kind'); }
        if (($v = req_q('from')) !== null) { $where .= ' AND created_at >= ?'; $params[] = gmdate('Y-m-d H:i:s', (int)((int)$v / 1000)); }
        if (($v = req_q('to')) !== null) { $where .= ' AND created_at <= ?'; $params[] = gmdate('Y-m-d H:i:s', (int)((int)$v / 1000)); }
        [$items, $next] = cursor_page($db, $where, $params, [['created_at', 'DESC'], ['id', 'DESC']],
            req_q('cursor'), req_q('limit', 50), 'm_rating');
        brix_items($items, $next);
    }
    if ($method === 'POST' && $r1 === null) {
        $c = need('ratings', 'write');
        $b = req_body();
        $kind = v_in(v_required($b, 'kind'), ['csat', 'nps'], 'kind');
        $score = v_int(v_required($b, 'score'), 'score',
            $kind === 'csat' ? 1 : 0, $kind === 'csat' ? 5 : 10);
        $propId = v_opt_uuid($b['property_id'] ?? null, 'property_id');
        if ($propId) own('properties', $propId, $c['wid']);
        $convId = v_opt_uuid($b['conversation_id'] ?? null, 'conversation_id');
        if ($convId) own('conversations', $convId, $c['wid']);
        $agentId = v_opt_uuid($b['agent_id'] ?? null, 'agent_id');
        if ($agentId) own('members', $agentId, $c['wid']);
        $rid = isset($b['id']) ? v_uuid($b['id']) : new_uuid();
        $db->prepare('INSERT INTO ratings (id, workspace_id, property_id, conversation_id, member_id, kind, score, comment)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
           ->execute([$rid, $c['wid'], $propId, $convId, $agentId, $kind, $score,
                      isset($b['comment']) ? v_str($b['comment'], 'comment', 65535) : '']);
        if (($kind === 'csat' && $score <= 2) || ($kind === 'nps' && $score <= 6)) {
            notify_push($c['wid'], 'system', 'New low rating',
                "A $kind rating of $score was submitted" . ($b['comment'] ?? '' !== '' ? ': ' . ($b['comment'] ?? '') : ''));
        }
        $st = $db->prepare('SELECT * FROM ratings WHERE id = ?');
        $st->execute([$rid]);
        brix_json(m_rating($st->fetch()), 201);
    }
}

function route_metrics(string $method, array $seg, $r1, $r2, $r3): void {
    $db = brix_db();
    $c = need('tickets', 'read'); // any member
    if ($method !== 'GET') brix_fail('not_found', 'Unknown endpoint', 404);

    if ($r1 === 'chats') {
        $days = v_int(req_q('days', 30), 'days', 1, 90);
        $cutoff = gmdate('Y-m-d H:i:s', time() - $days * 86400);
        $st = $db->prepare("SELECT DATE(created_at) d, status, COUNT(*) n FROM conversations
                            WHERE workspace_id = ? AND created_at >= ? GROUP BY d, status");
        $st->execute([$c['wid'], $cutoff]);
        $byDay = [];
        foreach ($st->fetchAll() as $r) {
            $d = (string)$r['d'];
            $byDay[$d]['total'] = ($byDay[$d]['total'] ?? 0) + (int)$r['n'];
            if ($r['status'] === 'missed') $byDay[$d]['missed'] = ($byDay[$d]['missed'] ?? 0) + (int)$r['n'];
        }
        $out = [];
        for ($i = $days - 1; $i >= 0; $i--) {
            $d = gmdate('Y-m-d', time() - $i * 86400);
            $out[] = ['date' => $d, 'total' => $byDay[$d]['total'] ?? 0, 'missed' => $byDay[$d]['missed'] ?? 0];
        }
        brix_json($out);
    }
    if ($r1 === 'response-times') {
        $st = $db->prepare("SELECT m.conversation_id, m.sender, m.created_at FROM messages m
                            JOIN conversations co ON co.id = m.conversation_id
                            WHERE co.workspace_id = ? AND m.sender IN ('visitor','agent','ai')
                            ORDER BY m.conversation_id, m.created_at ASC, m.id ASC");
        $st->execute([$c['wid']]);
        $first = [];
        foreach ($st->fetchAll() as $m) {
            $cid = $m['conversation_id'];
            if (!isset($first[$cid]['visitor']) && $m['sender'] === 'visitor') $first[$cid]['visitor'] = strtotime($m['created_at'] . ' UTC');
            if (!isset($first[$cid]['reply']) && in_array($m['sender'], ['agent', 'ai'], true) && isset($first[$cid]['visitor'])) {
                $first[$cid]['reply'] = strtotime($m['created_at'] . ' UTC');
            }
        }
        $samples = [];
        foreach ($first as $f) {
            if (isset($f['visitor'], $f['reply']) && $f['reply'] >= $f['visitor']) $samples[] = $f['reply'] - $f['visitor'];
        }
        sort($samples);
        $n = count($samples);
        brix_json([
            'samples' => $n,
            'avg_first_response_sec' => $n ? round(array_sum($samples) / $n) : 0,
            'p95_first_response_sec' => $n ? $samples[min($n - 1, (int)ceil($n * 0.95) - 1)] : 0,
        ]);
    }
    if ($r1 === 'satisfaction') {
        $st = $db->prepare('SELECT rating, COUNT(*) n FROM conversations WHERE workspace_id = ? AND rating IS NOT NULL GROUP BY rating');
        $st->execute([$c['wid']]);
        $dist = [1 => 0, 2 => 0, 3 => 0, 4 => 0, 5 => 0];
        $rated = 0; $pos = 0;
        foreach ($st->fetchAll() as $r) {
            $dist[(int)$r['rating']] = (int)$r['n'];
            $rated += (int)$r['n'];
            if ((int)$r['rating'] >= 4) $pos += (int)$r['n'];
        }
        brix_json(['rated' => $rated, 'distribution' => $dist, 'csat_pct' => $rated ? round(100 * $pos / $rated, 1) : 0]);
    }
    if ($r1 === 'tickets') {
        $st = $db->prepare("SELECT status, COUNT(*) n FROM tickets WHERE workspace_id = ? GROUP BY status");
        $st->execute([$c['wid']]);
        $out = ['new' => 0, 'open' => 0, 'resolved' => 0];
        foreach ($st->fetchAll() as $r) $out[$r['status']] = (int)$r['n'];
        brix_json($out);
    }
    brix_fail('not_found', 'Unknown endpoint', 404);
}

// ============================================================================
// departments
// ============================================================================
function route_departments(string $method, array $seg, $r1, $r2, $r3): void {
    $db = brix_db();
    if ($method === 'GET' && $r1 === null) {
        $c = need('departments', 'read');
        $where = 'FROM departments WHERE workspace_id = ?';
        $params = [$c['wid']];
        if (($v = req_q('propertyId')) !== null) { $where .= ' AND property_id = ?'; $params[] = v_uuid($v, 'propertyId'); }
        $st = $db->prepare("SELECT * $where ORDER BY name ASC");
        $st->execute($params);
        brix_json(hydrate_departments($st->fetchAll()));
    }
    if ($method === 'POST' && $r1 === null) {
        $c = need('departments', 'write');
        $b = req_body();
        $prop = own('properties', $b['property_id'] ?? null, $c['wid']);
        $did = isset($b['id']) ? v_uuid($b['id']) : new_uuid();
        $name = v_str(v_required($b, 'name'), 'name', 255);
        $db->beginTransaction();
        try {
            $db->prepare("INSERT INTO departments (id, workspace_id, property_id, name, description, routing_mode, hours_override, offline_behavior)
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
               ->execute([$did, $c['wid'], $prop['id'], $name,
                          isset($b['description']) ? v_str($b['description'], 'description', 65535) : '',
                          isset($b['routing_mode']) ? v_in($b['routing_mode'], ['round-robin', 'least-busy', 'first-available'], 'routing_mode') : 'round-robin',
                          isset($b['hours_override']) ? jenc($b['hours_override']) : null,
                          isset($b['offline_behavior']) ? v_in($b['offline_behavior'], ['ticket', 'message', 'hide'], 'offline_behavior') : 'message']);
            dept_members_sync($c['wid'], $did, $b['agent_ids'] ?? []);
            $db->commit();
        } catch (Throwable $e) { $db->rollBack(); throw $e; }
        audit_log($c['wid'], $c['member'], 'department.created', 'department', $did, ['name' => $name]);
        brix_json(hydrate_departments([own('departments', $did, $c['wid'])])[0], 201);
    }
    if ($r1 !== null && $r2 === null) {
        if ($method === 'GET') {
            $c = need('departments', 'read');
            brix_json(hydrate_departments([own('departments', $r1, $c['wid'])])[0]);
        }
        if ($method === 'PATCH') {
            $c = need('departments', 'write');
            $d = own('departments', $r1, $c['wid']);
            $b = req_body();
            $sets = []; $params = [];
            if (array_key_exists('name', $b)) { $sets[] = 'name = ?'; $params[] = v_str($b['name'], 'name', 255); }
            if (array_key_exists('description', $b)) { $sets[] = 'description = ?'; $params[] = v_str($b['description'], 'description', 65535); }
            if (array_key_exists('routing_mode', $b)) { $sets[] = 'routing_mode = ?'; $params[] = v_in($b['routing_mode'], ['round-robin', 'least-busy', 'first-available'], 'routing_mode'); }
            if (array_key_exists('offline_behavior', $b)) { $sets[] = 'offline_behavior = ?'; $params[] = v_in($b['offline_behavior'], ['ticket', 'message', 'hide'], 'offline_behavior'); }
            if (array_key_exists('hours_override', $b)) { $sets[] = 'hours_override = ?'; $params[] = $b['hours_override'] === null ? null : jenc($b['hours_override']); }
            if (array_key_exists('property_id', $b)) {
                $p = v_opt_uuid($b['property_id'], 'property_id');
                if ($p) own('properties', $p, $c['wid']);
                $sets[] = 'property_id = ?'; $params[] = $p;
            }
            if ($sets) {
                $params[] = $d['id'];
                $db->prepare('UPDATE departments SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);
            }
            if (array_key_exists('agent_ids', $b)) dept_members_sync($c['wid'], $d['id'], $b['agent_ids']);
            audit_log($c['wid'], $c['member'], 'department.updated', 'department', $d['id']);
            brix_json(hydrate_departments([own('departments', $d['id'], $c['wid'])])[0]);
        }
        if ($method === 'DELETE') {
            $c = need('departments', 'write');
            $d = own('departments', $r1, $c['wid']);
            $db->prepare('DELETE FROM departments WHERE id = ?')->execute([$d['id']]);
            audit_log($c['wid'], $c['member'], 'department.deleted', 'department', $d['id']);
            brix_json(['deleted' => true]);
        }
    }
}

// Replace a department's member rows (each member must belong to the workspace).
function dept_members_sync(string $wid, string $did, mixed $agentIds): void {
    if (!is_array($agentIds)) brix_fail('validation', 'agent_ids must be an array', 422);
    $db = brix_db();
    $clean = [];
    foreach ($agentIds as $a) {
        $a = v_uuid($a, 'agent_id');
        $st = $db->prepare('SELECT id FROM members WHERE id = ? AND workspace_id = ?');
        $st->execute([$a, $wid]);
        if (!$st->fetch()) brix_fail('not_found', 'Member not found', 404);
        $clean[] = $a;
    }
    $db->prepare('DELETE FROM department_members WHERE department_id = ?')->execute([$did]);
    $st = $db->prepare('INSERT INTO department_members (department_id, member_id) VALUES (?, ?)');
    foreach (array_unique($clean) as $a) $st->execute([$did, $a]);
}

// ============================================================================
// categories (fans out across kb|canned|ticket category tables)
// ============================================================================
function category_tables(): array {
    return [
        'kb'      => ['kb_categories', 'kb'],
        'canned'  => ['canned_categories', 'canned'],
        'tickets' => ['ticket_categories', 'tickets'],
    ];
}

function route_categories(string $method, array $seg, $r1, $r2, $r3): void {
    $db = brix_db();
    $tables = category_tables();
    $scopeOf = function (array $row, string $table): string {
        foreach (category_tables() as $scope => [$t]) if ($t === $table) return $scope;
        return 'kb';
    };

    if ($method === 'GET' && $r1 === null) {
        $c = need('kb_categories', 'read');
        $scope = v_in(req_q('scope', 'kb'), ['kb', 'canned', 'tickets'], 'scope');
        [$table] = $tables[$scope];
        $where = "FROM `$table` WHERE workspace_id = ?";
        $params = [$c['wid']];
        if (($v = req_q('propertyId')) !== null && $v !== '') {
            $pid = v_uuid($v, 'propertyId');
            $where .= ' AND (property_id = ? OR property_id IS NULL)';
            $params[] = $pid;
        }
        $st = $db->prepare("SELECT * $where ORDER BY position ASC, name ASC");
        $st->execute($params);
        brix_items(array_map(fn($r) => m_category($r, $scope), $st->fetchAll()), null);
    }
    if ($method === 'POST' && $r1 === null) {
        $c = need('kb_categories', 'write');
        $b = req_body();
        $scope = v_in(v_required($b, 'scope'), ['kb', 'canned', 'tickets'], 'scope');
        [$table] = $tables[$scope];
        $propId = v_opt_uuid($b['property_id'] ?? null, 'property_id');
        if ($propId) own('properties', $propId, $c['wid']);
        $cid = isset($b['id']) ? v_uuid($b['id']) : new_uuid();
        $name = v_str(v_required($b, 'name'), 'name', 255);
        $db->prepare("INSERT INTO `$table` (id, workspace_id, property_id, name, color, position)
                      VALUES (?, ?, ?, ?, ?, ?)")
           ->execute([$cid, $c['wid'], $propId, $name,
                      isset($b['color']) ? v_str($b['color'], 'color', 32) : '#4f46e5',
                      isset($b['position']) ? v_int($b['position'], 'position', 0, 100000) : 0]);
        audit_log($c['wid'], $c['member'], 'category.created', 'category', $cid, ['scope' => $scope]);
        $st = $db->prepare("SELECT * FROM `$table` WHERE id = ?");
        $st->execute([$cid]);
        brix_json(m_category($st->fetch(), $scope), 201);
    }
    if ($r1 !== null && $r2 === null) {
        $cid = v_uuid($r1);
        if ($method === 'PATCH' || $method === 'DELETE') {
            $c = need('kb_categories', $method === 'PATCH' ? 'write' : 'write');
            $b = $method === 'PATCH' ? req_body() : [];
            $scope = isset($b['scope']) ? v_in($b['scope'], ['kb', 'canned', 'tickets'], 'scope') : null;
            $try = $scope ? [$tables[$scope][0]] : array_column($tables, 0);
            $found = null;
            foreach ($try as $table) {
                $st = $db->prepare("SELECT * FROM `$table` WHERE id = ? AND workspace_id = ?");
                $st->execute([$cid, $c['wid']]);
                if ($row = $st->fetch()) { $found = [$table, $row]; break; }
            }
            if (!$found) brix_fail('not_found', 'Category not found', 404);
            [$table, $row] = $found;
            if ($method === 'DELETE') {
                $db->prepare("DELETE FROM `$table` WHERE id = ?")->execute([$cid]);
                audit_log($c['wid'], $c['member'], 'category.deleted', 'category', $cid);
                brix_json(['deleted' => true]);
            }
            $sets = []; $params = [];
            if (array_key_exists('name', $b)) { $sets[] = 'name = ?'; $params[] = v_str($b['name'], 'name', 255); }
            if (array_key_exists('color', $b)) { $sets[] = 'color = ?'; $params[] = v_str($b['color'], 'color', 32); }
            if (array_key_exists('position', $b)) { $sets[] = 'position = ?'; $params[] = v_int($b['position'], 'position', 0, 100000); }
            if (!$sets) brix_fail('validation', 'Nothing to update', 422);
            $params[] = $cid;
            $db->prepare("UPDATE `$table` SET " . implode(', ', $sets) . ' WHERE id = ?')->execute($params);
            audit_log($c['wid'], $c['member'], 'category.updated', 'category', $cid);
            $scopeMap = ['kb_categories' => 'kb', 'canned_categories' => 'canned', 'ticket_categories' => 'tickets'];
            $st = $db->prepare("SELECT * FROM `$table` WHERE id = ?");
            $st->execute([$cid]);
            brix_json(m_category($st->fetch(), $scope ?? $scopeMap[$table]));
        }
        if ($method === 'GET') {
            $c = need('kb_categories', 'read');
            foreach (array_column($tables, 0) as $table) {
                $st = $db->prepare("SELECT * FROM `$table` WHERE id = ? AND workspace_id = ?");
                $st->execute([$cid, $c['wid']]);
                if ($row = $st->fetch()) brix_json(m_category($row, $scopeOf($row, $table)));
            }
            brix_fail('not_found', 'Category not found', 404);
        }
    }
}

// ============================================================================
// saved_views
// ============================================================================
function route_saved_views(string $method, array $seg, $r1, $r2, $r3): void {
    $db = brix_db();
    if ($method === 'GET' && $r1 === null) {
        $c = need('saved_views', 'read');
        $st = $db->prepare('SELECT * FROM saved_views WHERE workspace_id = ? ORDER BY created_at DESC');
        $st->execute([$c['wid']]);
        brix_items(array_map('m_view', $st->fetchAll()), null);
    }
    if ($method === 'POST' && $r1 === null) {
        $c = need('saved_views', 'write');
        $b = req_body();
        $vid = isset($b['id']) ? v_uuid($b['id']) : new_uuid();
        $db->prepare('INSERT INTO saved_views (id, workspace_id, member_id, name, filters) VALUES (?, ?, ?, ?, ?)')
           ->execute([$vid, $c['wid'], null, v_str(v_required($b, 'name'), 'name', 255), jenc($b['filters'] ?? new stdClass())]);
        $st = $db->prepare('SELECT * FROM saved_views WHERE id = ?');
        $st->execute([$vid]);
        brix_json(m_view($st->fetch()), 201);
    }
    if ($method === 'DELETE' && $r1 !== null && $r2 === null) {
        $c = need('saved_views', 'write');
        $row = own('saved_views', $r1, $c['wid']);
        $db->prepare('DELETE FROM saved_views WHERE id = ?')->execute([$row['id']]);
        brix_json(['deleted' => true]);
    }
}

// ============================================================================
// plays
// ============================================================================
function route_plays(string $method, array $seg, $r1, $r2, $r3): void {
    $db = brix_db();
    if ($method === 'GET' && $r1 === null) {
        $c = need('plays', 'read');
        $st = $db->prepare('SELECT * FROM plays WHERE workspace_id = ? ORDER BY created_at DESC');
        $st->execute([$c['wid']]);
        brix_items(array_map('m_play', $st->fetchAll()), null);
    }
    if ($method === 'POST' && $r1 === null) {
        $c = need('plays', 'write');
        $b = req_body();
        $steps = $b['steps'] ?? [];
        if (!is_array($steps) || !$steps) brix_fail('validation', 'steps must be a non-empty array', 422);
        $pid = isset($b['id']) ? v_uuid($b['id']) : new_uuid();
        $db->prepare('INSERT INTO plays (id, workspace_id, name, steps) VALUES (?, ?, ?, ?)')
           ->execute([$pid, $c['wid'], v_str(v_required($b, 'name'), 'name', 255), jenc(array_values($steps))]);
        $st = $db->prepare('SELECT * FROM plays WHERE id = ?');
        $st->execute([$pid]);
        brix_json(m_play($st->fetch()), 201);
    }
    if ($method === 'DELETE' && $r1 !== null && $r2 === null) {
        $c = need('plays', 'write');
        $row = own('plays', $r1, $c['wid']);
        $db->prepare('DELETE FROM plays WHERE id = ?')->execute([$row['id']]);
        brix_json(['deleted' => true]);
    }
    // POST /plays/:id/run
    if ($method === 'POST' && $r1 !== null && $r2 === 'run' && $r3 === null) {
        $c = need('plays', 'write');
        $play = own('plays', $r1, $c['wid']);
        $b = req_body();
        $conv = own('conversations', $b['conversation_id'] ?? null, $c['wid']);
        $applied = [];
        foreach (jdec($play['steps'] ?? null, []) as $step) {
            $kind = $step['kind'] ?? '';
            $value = $step['value'] ?? '';
            if ($kind === 'reply') {
                $db->prepare("INSERT INTO messages (id, workspace_id, conversation_id, sender, kind, text, metadata)
                              VALUES (?, ?, ?, 'agent', 'text', ?, ?)")
                   ->execute([new_uuid(), $c['wid'], $conv['id'], (string)$value, jenc(['play' => $play['name']])]);
                $applied[] = 'Sent reply';
            } elseif ($kind === 'tag') {
                $tags = array_unique(array_merge(jdec($conv['tags'] ?? null, []), v_tags(is_array($value) ? $value : [$value])));
                $db->prepare('UPDATE conversations SET tags = ? WHERE id = ?')->execute([jenc(array_values($tags)), $conv['id']]);
                $applied[] = 'Applied tag(s)';
            } elseif ($kind === 'assign') {
                $st = $db->prepare('SELECT id FROM departments WHERE workspace_id = ? AND LOWER(name) = LOWER(?) LIMIT 1');
                $st->execute([$c['wid'], (string)$value]);
                if ($d = $st->fetch()) {
                    $db->prepare('UPDATE conversations SET department_id = ? WHERE id = ?')->execute([$d['id'], $conv['id']]);
                    $applied[] = 'Assigned to department ' . $d['id'];
                } else {
                    $st = $db->prepare('SELECT id, display_name FROM members WHERE workspace_id = ? AND LOWER(display_name) = LOWER(?) LIMIT 1');
                    $st->execute([$c['wid'], (string)$value]);
                    if ($m = $st->fetch()) {
                        $db->prepare('UPDATE conversations SET assignee_id = ? WHERE id = ?')->execute([$m['id'], $conv['id']]);
                        $applied[] = 'Assigned to ' . $m['display_name'];
                    } else $applied[] = 'Assign skipped (no match)';
                }
            } elseif ($kind === 'priority') {
                $p = in_array($value, ['low', 'medium', 'high', 'urgent'], true) ? $value : 'medium';
                $db->prepare('UPDATE conversations SET priority = ? WHERE id = ?')->execute([$p, $conv['id']]);
                $applied[] = 'Set priority ' . $p;
            } elseif ($kind === 'note') {
                $db->prepare('INSERT INTO conversation_notes (id, workspace_id, conversation_id, author_member_id, author_name, text)
                              VALUES (?, ?, ?, ?, ?, ?)')
                   ->execute([new_uuid(), $c['wid'], $conv['id'], $c['mid'], $c['member']['display_name'] ?? '', (string)$value]);
                $applied[] = 'Added note';
            } else {
                $applied[] = 'Skipped unknown step';
            }
            $conv = own('conversations', $conv['id'], $c['wid']);
        }
        audit_log($c['wid'], $c['member'], 'play.run', 'play', $play['id'], ['conversation_id' => $conv['id']]);
        brix_json(['applied' => $applied]);
    }
}

// ============================================================================
// goals
// ============================================================================
function route_goals(string $method, array $seg, $r1, $r2, $r3): void {
    $db = brix_db();
    if ($method === 'GET' && $r1 === null) {
        $c = need('goals', 'read');
        $st = $db->prepare('SELECT * FROM goals WHERE workspace_id = ? ORDER BY created_at DESC');
        $st->execute([$c['wid']]);
        brix_items(array_map('m_goal', $st->fetchAll()), null);
    }
    if ($method === 'POST' && $r1 === null) {
        $c = need('goals', 'write');
        $b = req_body();
        $gid = isset($b['id']) ? v_uuid($b['id']) : new_uuid();
        $propId = v_opt_uuid($b['property_id'] ?? null, 'property_id');
        if ($propId) own('properties', $propId, $c['wid']);
        $db->prepare('INSERT INTO goals (id, workspace_id, property_id, name, event, revenue) VALUES (?, ?, ?, ?, ?, ?)')
           ->execute([$gid, $c['wid'], $propId, v_str(v_required($b, 'name'), 'name', 255),
                      v_str(v_required($b, 'event'), 'event', 255),
                      isset($b['revenue']) ? v_int($b['revenue'], 'revenue', 0) : 0]);
        audit_log($c['wid'], $c['member'], 'goal.created', 'goal', $gid);
        $st = $db->prepare('SELECT * FROM goals WHERE id = ?');
        $st->execute([$gid]);
        brix_json(m_goal($st->fetch()), 201);
    }
    if ($method === 'DELETE' && $r1 !== null && $r2 === null) {
        $c = need('goals', 'write');
        $row = own('goals', $r1, $c['wid']);
        $db->prepare('DELETE FROM goals WHERE id = ?')->execute([$row['id']]);
        brix_json(['deleted' => true]);
    }
    // POST /goals/:id/track
    if ($method === 'POST' && $r1 !== null && $r2 === 'track' && $r3 === null) {
        $c = need('goal_events', 'write');
        $goal = own('goals', $r1, $c['wid']);
        $b = req_body();
        $convId = v_opt_uuid($b['conversation_id'] ?? null, 'conversation_id');
        if ($convId) own('conversations', $convId, $c['wid']);
        $value = isset($b['value']) ? (float)$b['value'] : (float)$goal['revenue'];
        $geid = new_uuid();
        $db->prepare('INSERT INTO goal_events (id, workspace_id, goal_id, conversation_id, value) VALUES (?, ?, ?, ?, ?)')
           ->execute([$geid, $c['wid'], $goal['id'], $convId, $value]);
        audit_log($c['wid'], $c['member'], 'goal.tracked', 'goal', $goal['id'], ['value' => $value]);
        notify_push($c['wid'], 'system', 'Goal completed', $goal['name'] . ' (' . $value . ')');
        brix_json(['id' => $geid, 'goal_id' => $goal['id'], 'value' => $value]);
    }
    // GET /goals/funnel?days=
    if ($method === 'GET' && $r1 === 'funnel' && $r2 === null) {
        $c = need('goals', 'read');
        $days = v_int(req_q('days', 30), 'days', 1, 365);
        $cutoff = gmdate('Y-m-d H:i:s', time() - $days * 86400);
        $st = $db->prepare('SELECT visitor_name, visitor_email FROM conversations WHERE workspace_id = ? AND created_at >= ?');
        $st->execute([$c['wid'], $cutoff]);
        $visitors = [];
        $chats = 0;
        foreach ($st->fetchAll() as $r) {
            $chats++;
            $key = mb_strtolower(trim($r['visitor_name'] . '|' . $r['visitor_email']));
            if ($key !== '|') $visitors[$key] = true;
        }
        $st = $db->prepare('SELECT * FROM goals WHERE workspace_id = ?');
        $st->execute([$c['wid']]);
        $goals = $st->fetchAll();
        $st = $db->prepare('SELECT goal_id, COUNT(*) n, COALESCE(SUM(value),0) rev FROM goal_events
                            WHERE workspace_id = ? AND created_at >= ? GROUP BY goal_id');
        $st->execute([$c['wid'], $cutoff]);
        $agg = [];
        foreach ($st->fetchAll() as $r) $agg[$r['goal_id']] = $r;
        $out = [];
        foreach ($goals as $g) {
            $out[] = ['goal' => m_goal($g), 'count' => (int)($agg[$g['id']]['n'] ?? 0),
                      'revenue' => (float)($agg[$g['id']]['rev'] ?? 0)];
        }
        brix_json(['visitors' => count($visitors), 'chats' => $chats, 'goals' => $out]);
    }
}

// ============================================================================
// members
// ============================================================================
function route_members(string $method, array $seg, $r1, $r2, $r3): void {
    $db = brix_db();
    if ($method === 'GET' && $r1 === null) {
        $c = need('members', 'read');
        $st = $db->prepare('SELECT * FROM members WHERE workspace_id = ? ORDER BY display_name ASC');
        $st->execute([$c['wid']]);
        brix_json(hydrate_members($st->fetchAll()));
    }
    if ($method === 'POST' && $r1 === null) {
        $c = need('members', 'write'); // admin
        $mid = member_create($c, req_body());
        audit_log($c['wid'], $c['member'], 'member.created', 'member', $mid);
        brix_json(hydrate_members([own('members', $mid, $c['wid'])])[0], 201);
    }
    if ($r1 !== null && $r2 === null) {
        if ($method === 'GET') {
            $c = need('members', 'read');
            brix_json(hydrate_members([own('members', $r1, $c['wid'])])[0]);
        }
        if ($method === 'PATCH') {
            $c = need('members', 'write'); // admin
            brix_json(hydrate_members([member_update($c, $r1, req_body())])[0]);
        }
        if ($method === 'DELETE') {
            $c = need('members', 'write'); // admin
            $row = own('members', $r1, $c['wid']);
            $st = $db->prepare('SELECT COUNT(*) n FROM members WHERE workspace_id = ?');
            $st->execute([$c['wid']]);
            if ((int)$st->fetch()['n'] <= 1) brix_fail('validation', 'Cannot remove the last member', 422);
            $db->prepare('DELETE FROM members WHERE id = ?')->execute([$row['id']]);
            audit_log($c['wid'], $c['member'], 'member.removed', 'member', $row['id']);
            brix_json(['deleted' => true]);
        }
    }
    // POST /members/:id/passcode — self or admin, min 4 chars
    if ($method === 'POST' && $r1 !== null && $r2 === 'passcode' && $r3 === null) {
        $c = auth_ctx();
        $row = own('members', $r1, $c['wid']);
        if ($c['role'] !== 'admin' && $c['mid'] !== $row['id']) brix_fail('forbidden', 'Insufficient permissions', 403);
        $passcode = v_passcode(req_body()['passcode'] ?? null, 4, 128);
        $st = $db->prepare('SELECT member_id FROM member_credentials WHERE member_id = ?');
        $st->execute([$row['id']]);
        if ($st->fetch()) {
            $db->prepare('UPDATE member_credentials SET passcode_hash = ? WHERE member_id = ?')
               ->execute([password_hash($passcode, PASSWORD_BCRYPT), $row['id']]);
        } else {
            $db->prepare('INSERT INTO member_credentials (member_id, passcode_hash) VALUES (?, ?)')
               ->execute([$row['id'], password_hash($passcode, PASSWORD_BCRYPT)]);
        }
        audit_log($c['wid'], $c['member'], 'member.passcode_changed', 'member', $row['id']);
        brix_json(['updated' => true]);
    }
    // POST /members/:id/status — self or admin
    if ($method === 'POST' && $r1 !== null && $r2 === 'status' && $r3 === null) {
        $c = auth_ctx();
        $row = own('members', $r1, $c['wid']);
        if ($c['role'] !== 'admin' && $c['mid'] !== $row['id']) brix_fail('forbidden', 'Insufficient permissions', 403);
        $status = v_in(req_body()['status'] ?? '', ['online', 'away', 'offline'], 'status');
        $db->prepare('UPDATE members SET status = ? WHERE id = ?')->execute([$status, $row['id']]);
        brix_json(['status' => $status]);
    }
    // POST /members/:id/touch-login — refresh last_login_at + online
    if ($method === 'POST' && $r1 !== null && $r2 === 'touch-login' && $r3 === null) {
        $c = need('members', 'read');
        $row = own('members', $r1, $c['wid']);
        $db->prepare("UPDATE members SET last_login_at = UTC_TIMESTAMP(), status = 'online' WHERE id = ?")
           ->execute([$row['id']]);
        brix_json(hydrate_members([own('members', $row['id'], $c['wid'])])[0]);
    }
}

function member_create(array $c, array $b): string {
    $db = brix_db();
    $display = v_str(v_required($b, 'display_name'), 'display_name', 255);
    $role = v_in($b['role'] ?? 'agent', ['admin', 'agent', 'developer', 'viewer'], 'role');
    $passcode = v_passcode($b['passcode'] ?? null, 4, 128);
    // Duplicate display name (case-insensitive) -> 409.
    $st = $db->prepare('SELECT id FROM members WHERE workspace_id = ? AND LOWER(display_name) = LOWER(?)');
    $st->execute([$c['wid'], $display]);
    if ($st->fetch()) brix_fail('conflict', 'A member with this name already exists', 409);
    $mid = isset($b['id']) ? v_uuid($b['id']) : new_uuid();
    $palette = ['#4f46e5', '#0891b2', '#f59e0b', '#10b981', '#ef4444'];
    $st = $db->prepare('SELECT COUNT(*) n FROM members WHERE workspace_id = ?');
    $st->execute([$c['wid']]);
    $color = $palette[(int)$st->fetch()['n'] % count($palette)];
    $db->beginTransaction();
    try {
        $db->prepare('INSERT INTO members (id, workspace_id, display_name, initials, color, role, email, job_title, avatar_url, status)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
           ->execute([$mid, $c['wid'], $display, member_initials($display),
                      isset($b['color']) ? v_str($b['color'], 'color', 32) : $color, $role,
                      isset($b['email']) ? v_email($b['email']) : '',
                      isset($b['job_title']) ? v_str($b['job_title'], 'job_title', 255) : '',
                      isset($b['avatar_data_url']) ? v_str($b['avatar_data_url'], 'avatar_data_url', 65535) : null,
                      'offline']);
        $db->prepare('INSERT INTO member_credentials (member_id, passcode_hash) VALUES (?, ?)')
           ->execute([$mid, password_hash($passcode, PASSWORD_BCRYPT)]);
        if (array_key_exists('department_ids', $b)) dept_members_sync_member($c['wid'], $mid, $b['department_ids']);
        $db->commit();
    } catch (Throwable $e) { $db->rollBack(); throw $e; }
    return $mid;
}

function member_update(array $c, string $id, array $b): array {
    $db = brix_db();
    $row = own('members', $id, $c['wid']);
    $sets = []; $params = [];
    if (array_key_exists('display_name', $b)) {
        $display = v_str($b['display_name'], 'display_name', 255);
        if ($display === '') brix_fail('validation', 'display_name must not be empty', 422);
        $st = $db->prepare('SELECT id FROM members WHERE workspace_id = ? AND LOWER(display_name) = LOWER(?) AND id <> ?');
        $st->execute([$c['wid'], $display, $row['id']]);
        if ($st->fetch()) brix_fail('conflict', 'A member with this name already exists', 409);
        $sets[] = 'display_name = ?'; $params[] = $display;
        $sets[] = 'initials = ?'; $params[] = member_initials($display);
    }
    foreach (['color' => 32, 'job_title' => 255] as $f => $mx) {
        if (array_key_exists($f, $b)) { $sets[] = "$f = ?"; $params[] = v_str($b[$f], $f, $mx); }
    }
    if (array_key_exists('avatar_data_url', $b)) {
        $sets[] = 'avatar_url = ?'; $params[] = $b['avatar_data_url'] === null ? null : v_str($b['avatar_data_url'], 'avatar_data_url', 65535);
    }
    if (array_key_exists('email', $b)) { $sets[] = 'email = ?'; $params[] = v_email($b['email']); }
    if (array_key_exists('role', $b)) { $sets[] = 'role = ?'; $params[] = v_in($b['role'], ['admin', 'agent', 'developer', 'viewer'], 'role'); }
    if (array_key_exists('status', $b)) { $sets[] = 'status = ?'; $params[] = v_in($b['status'], ['online', 'away', 'offline'], 'status'); }
    if (array_key_exists('online', $b)) { $sets[] = 'status = ?'; $params[] = v_bool($b['online']) ? 'online' : 'offline'; }
    if ($sets) {
        $params[] = $row['id'];
        $db->prepare('UPDATE members SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);
    }
    if (array_key_exists('department_ids', $b)) dept_members_sync_member($c['wid'], $row['id'], $b['department_ids']);
    audit_log($c['wid'], $c['member'], 'member.updated', 'member', $row['id']);
    return own('members', $row['id'], $c['wid']);
}

// Sync join rows from the member side.
function dept_members_sync_member(string $wid, string $mid, mixed $deptIds): void {
    if (!is_array($deptIds)) brix_fail('validation', 'department_ids must be an array', 422);
    $db = brix_db();
    $clean = [];
    foreach ($deptIds as $d) {
        $d = v_uuid($d, 'department_id');
        $st = $db->prepare('SELECT id, workspace_id FROM departments WHERE id = ?');
        $st->execute([$d]);
        $row = $st->fetch();
        if (!$row || $row['workspace_id'] !== $wid) brix_fail('not_found', 'Department not found', 404);
        $clean[] = $d;
    }
    $db->prepare('DELETE FROM department_members WHERE member_id = ?')->execute([$mid]);
    $st = $db->prepare('INSERT INTO department_members (department_id, member_id) VALUES (?, ?)');
    foreach (array_unique($clean) as $d) $st->execute([$d, $mid]);
}

// ============================================================================
// integrations (registry merged with stored rows; rows may not exist)
// ============================================================================
function route_integrations(string $method, array $seg, $r1, $r2, $r3): void {
    $db = brix_db();
    if ($method === 'GET' && $r1 === null) {
        $c = need('integrations', 'read');
        $st = $db->prepare('SELECT * FROM integrations WHERE workspace_id = ?');
        $st->execute([$c['wid']]);
        $rows = [];
        foreach ($st->fetchAll() as $r) $rows[$r['provider']] = $r;
        brix_items(array_map(fn($reg) => m_integration($reg, $rows[$reg['provider']] ?? null), integration_registry()), null);
    }
    // PATCH /integrations/:provider — upsert on (workspace_id, provider)
    if ($method === 'PATCH' && $r1 !== null && $r2 === null) {
        $c = need('integrations', 'write');
        $provider = v_in($r1, array_column(integration_registry(), 'provider'), 'provider');
        $b = req_body();
        $st = $db->prepare('SELECT * FROM integrations WHERE workspace_id = ? AND provider = ?');
        $st->execute([$c['wid'], $provider]);
        $row = $st->fetch();
        $config = $row ? jdec($row['config'] ?? null, []) : [];
        if (array_key_exists('values', $b)) {
            if (!is_array($b['values'])) brix_fail('validation', 'values must be an object', 422);
            $config['values'] = $b['values'];
        }
        $enabled = array_key_exists('enabled', $b) ? (v_bool($b['enabled']) ? 1 : 0) : ($row ? (int)$row['enabled'] : 0);
        if ($row) {
            $db->prepare('UPDATE integrations SET config = ?, enabled = ? WHERE id = ?')
               ->execute([jenc($config), $enabled, $row['id']]);
            $id = $row['id'];
        } else {
            $id = new_uuid();
            $reg = current(array_filter(integration_registry(), fn($x) => $x['provider'] === $provider));
            $db->prepare('INSERT INTO integrations (id, workspace_id, provider, name, config, enabled)
                          VALUES (?, ?, ?, ?, ?, ?)')
               ->execute([$id, $c['wid'], $provider, $reg['name'], jenc($config), $enabled]);
        }
        audit_log($c['wid'], $c['member'], 'integration.updated', 'integration', $id, ['provider' => $provider]);
        $st = $db->prepare('SELECT * FROM integrations WHERE id = ?');
        $st->execute([$id]);
        $reg = current(array_filter(integration_registry(), fn($x) => $x['provider'] === $provider));
        brix_json(m_integration($reg, $st->fetch()));
    }
}

// ============================================================================
// unanswered_questions
// ============================================================================
function route_unanswered(string $method, array $seg, $r1, $r2, $r3): void {
    $db = brix_db();
    if ($method === 'GET' && $r1 === null) {
        $c = need('unanswered_questions', 'read');
        $where = 'FROM unanswered_questions WHERE workspace_id = ?';
        $params = [$c['wid']];
        if (!v_bool(req_q('includeDismissed', false))) $where .= ' AND dismissed = 0';
        [$items, $next] = cursor_page($db, $where, $params,
            [['`count`', 'DESC'], ['created_at', 'DESC'], ['id', 'DESC']],
            req_q('cursor'), req_q('limit', 50), 'm_unanswered');
        brix_items($items, $next);
    }
    if ($method === 'POST' && $r1 === null) {
        $c = need('unanswered_questions', 'write');
        $b = req_body();
        $question = v_str(v_required($b, 'question'), 'question', 2048);
        // Remote requires a conversation (NOT NULL property_id) — 501 otherwise.
        if (empty($b['conversation_id'])) {
            brix_fail('not_supported', 'A conversation is required to log an unanswered question', 501);
        }
        $conv = own('conversations', $b['conversation_id'], $c['wid']);
        // Dedupe on identical question (case-insensitive, not dismissed) -> count+1.
        $st = $db->prepare('SELECT id, `count` FROM unanswered_questions
                            WHERE workspace_id = ? AND dismissed = 0 AND LOWER(question) = LOWER(?) LIMIT 1');
        $st->execute([$c['wid'], $question]);
        if ($dup = $st->fetch()) {
            $db->prepare('UPDATE unanswered_questions SET `count` = `count` + 1 WHERE id = ?')->execute([$dup['id']]);
            $st = $db->prepare('SELECT * FROM unanswered_questions WHERE id = ?');
            $st->execute([$dup['id']]);
            brix_json(m_unanswered($st->fetch()));
        }
        $uid = isset($b['id']) ? v_uuid($b['id']) : new_uuid();
        $db->prepare('INSERT INTO unanswered_questions (id, workspace_id, property_id, question, conversation_id)
                      VALUES (?, ?, ?, ?, ?)')
           ->execute([$uid, $c['wid'], $conv['property_id'], $question, $conv['id']]);
        audit_log($c['wid'], $c['member'], 'unanswered.added', 'unanswered_question', $uid);
        $st = $db->prepare('SELECT * FROM unanswered_questions WHERE id = ?');
        $st->execute([$uid]);
        brix_json(m_unanswered($st->fetch()), 201);
    }
    if ($method === 'POST' && $r1 !== null && $r2 === 'dismiss' && $r3 === null) {
        $c = need('unanswered_questions', 'write');
        $row = own('unanswered_questions', $r1, $c['wid']);
        $db->prepare('UPDATE unanswered_questions SET dismissed = 1 WHERE id = ?')->execute([$row['id']]);
        audit_log($c['wid'], $c['member'], 'unanswered.dismissed', 'unanswered_question', $row['id']);
        brix_json(['dismissed' => true]);
    }
    // POST /unanswered/:id/promote — draft KB article + dismiss
    if ($method === 'POST' && $r1 !== null && $r2 === 'promote' && $r3 === null) {
        $c = need('unanswered_questions', 'write');
        $row = own('unanswered_questions', $r1, $c['wid']);
        // Ensure an 'Unanswered' KB category exists.
        $st = $db->prepare('SELECT id FROM kb_categories WHERE workspace_id = ? AND LOWER(name) = ? LIMIT 1');
        $st->execute([$c['wid'], 'unanswered']);
        $cat = $st->fetch();
        if (!$cat) {
            $catId = new_uuid();
            $db->prepare('INSERT INTO kb_categories (id, workspace_id, property_id, name, color, position)
                          VALUES (?, ?, NULL, ?, ?, 99)')
               ->execute([$catId, $c['wid'], 'Unanswered', '#6b7280']);
            $cat = ['id' => $catId];
        }
        $aid = kb_article_create($c, [
            'title' => $row['question'],
            'body' => 'Draft from the unanswered-questions log (asked ' . (int)$row['count'] . '×).',
            'category_id' => $cat['id'], 'status' => 'draft',
        ]);
        $db->prepare('UPDATE unanswered_questions SET dismissed = 1 WHERE id = ?')->execute([$row['id']]);
        audit_log($c['wid'], $c['member'], 'unanswered.promoted', 'unanswered_question', $row['id'], ['article_id' => $aid]);
        $st = $db->prepare('SELECT * FROM kb_articles WHERE id = ?');
        $st->execute([$aid]);
        brix_json(m_article($st->fetch(), 'Unanswered'), 201);
    }
}

// ============================================================================
// audit_log (append + list)
// ============================================================================
function route_audit_log(string $method, array $seg, $r1, $r2, $r3): void {
    $db = brix_db();
    if ($method === 'GET' && $r1 === null) {
        $c = need('audit_log', 'read'); // admin only
        $where = 'FROM audit_log WHERE workspace_id = ?';
        $params = [$c['wid']];
        if (($v = req_q('actor')) !== null && $v !== '') { $where .= ' AND actor_name LIKE ?'; $params[] = '%' . $v . '%'; }
        if (($v = req_q('action')) !== null && $v !== '') { $where .= ' AND action = ?'; $params[] = $v; }
        if (($v = req_q('from')) !== null && $v !== '') { $where .= ' AND created_at >= ?'; $params[] = gmdate('Y-m-d H:i:s', strtotime((string)$v)); }
        if (($v = req_q('to')) !== null && $v !== '') { $where .= ' AND created_at <= ?'; $params[] = gmdate('Y-m-d H:i:s', strtotime((string)$v)); }
        [$items, $next] = cursor_page($db, $where, $params, [['created_at', 'DESC'], ['id', 'DESC']],
            req_q('cursor'), req_q('limit', 50), 'm_audit');
        brix_items($items, $next);
    }
    // POST /audit-log — admin append (log_audit RPC equivalent; caller is stamped).
    if ($method === 'POST' && $r1 === null) {
        $c = need('audit_log', 'read');
        $b = req_body();
        $action = v_str(v_required($b, 'action'), 'action', 255);
        audit_log($c['wid'], $c['member'], $action,
            isset($b['entity']) ? v_str($b['entity'], 'entity', 64) : '',
            isset($b['entity_id']) ? v_str($b['entity_id'], 'entity_id', 255) : '',
            isset($b['meta']) && is_array($b['meta']) ? $b['meta'] : []);
        brix_json(['logged' => true], 201);
    }
}

// ============================================================================
// kb_articles
// ============================================================================
function route_kb(string $method, array $seg, $r1, $r2, $r3): void {
    $db = brix_db();
    // GET /kb/articles/search?q=
    if ($method === 'GET' && $r1 === 'articles' && $r2 === 'search' && $r3 === null) {
        $c = need('kb_articles', 'read');
        $q = trim((string)req_q('q', ''));
        if ($q === '') brix_json([]);
        $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $q) . '%';
        $st = $db->prepare("SELECT a.*, c.name AS category_name FROM kb_articles a
                            LEFT JOIN kb_categories c ON c.id = a.category_id
                            WHERE a.workspace_id = ? AND a.status = 'published'
                              AND (a.title LIKE ? ESCAPE '\\\\' OR a.body LIKE ? ESCAPE '\\\\')
                            ORDER BY a.updated_at DESC LIMIT 50");
        $st->execute([$c['wid'], $like, $like]);
        brix_items(array_map(fn($r) => m_article($r, $r['category_name']), $st->fetchAll()), null);
    }
    if ($method === 'GET' && $r1 === 'articles' && $r2 === null) {
        $c = need('kb_articles', 'read');
        $where = 'FROM kb_articles a WHERE a.workspace_id = ?';
        $params = [$c['wid']];
        if (($v = req_q('status')) !== null) { $where .= ' AND a.status = ?'; $params[] = v_in($v, ['draft', 'published'], 'status'); }
        if (($v = req_q('category')) !== null && $v !== '') {
            if (preg_match('/^[0-9a-f-]{36}$/i', (string)$v)) { $where .= ' AND a.category_id = ?'; $params[] = strtolower((string)$v); }
            else { $where .= ' AND EXISTS (SELECT 1 FROM kb_categories c WHERE c.id = a.category_id AND LOWER(c.name) = LOWER(?))'; $params[] = (string)$v; }
        }
        if (($v = req_q('propertyId')) !== null) { $where .= ' AND a.property_id = ?'; $params[] = v_uuid($v, 'propertyId'); }
        [$items, $next] = cursor_page($db, $where, $params, [['a.updated_at', 'DESC'], ['a.id', 'DESC']],
            req_q('cursor'), req_q('limit', 50),
            function ($r) { return $r; });
        // hydrate category names
        $catIds = array_values(array_unique(array_filter(array_column($items, 'category_id'))));
        $catMap = [];
        if ($catIds) {
            $in = implode(',', array_fill(0, count($catIds), '?'));
            $st = $db->prepare("SELECT id, name FROM kb_categories WHERE id IN ($in)");
            $st->execute($catIds);
            foreach ($st->fetchAll() as $x) $catMap[$x['id']] = $x['name'];
        }
        brix_items(array_map(fn($r) => m_article($r, $r['category_id'] ? ($catMap[$r['category_id']] ?? null) : null), $items), $next);
    }
    if ($method === 'POST' && $r1 === 'articles' && $r2 === null) {
        $c = need('kb_articles', 'write');
        $aid = kb_article_create($c, req_body());
        audit_log($c['wid'], $c['member'], 'kb_article.created', 'kb_article', $aid);
        $st = $db->prepare('SELECT a.*, c.name AS category_name FROM kb_articles a
                            LEFT JOIN kb_categories c ON c.id = a.category_id WHERE a.id = ?');
        $st->execute([$aid]);
        $r = $st->fetch();
        brix_json(m_article($r, $r['category_name']), 201);
    }
    if ($r1 === 'articles' && $r2 !== null && $r3 === null) {
        $aid = v_uuid($r2);
        if ($method === 'GET') {
            $c = need('kb_articles', 'read');
            $st = $db->prepare('SELECT a.*, c.name AS category_name FROM kb_articles a
                                LEFT JOIN kb_categories c ON c.id = a.category_id
                                WHERE a.id = ? AND a.workspace_id = ?');
            $st->execute([$aid, $c['wid']]);
            $r = $st->fetch();
            if (!$r) brix_fail('not_found', 'Article not found', 404);
            brix_json(m_article($r, $r['category_name']));
        }
        if ($method === 'PATCH') {
            $c = need('kb_articles', 'write');
            $b = req_body();
            $sets = []; $params = [];
            if (array_key_exists('title', $b)) { $sets[] = 'title = ?'; $params[] = v_str($b['title'], 'title', 255); }
            if (array_key_exists('body', $b)) { $sets[] = 'body = ?'; $params[] = v_str($b['body'], 'body', 16777215); }
            if (array_key_exists('status', $b)) { $sets[] = 'status = ?'; $params[] = v_in($b['status'], ['draft', 'published'], 'status'); }
            if (array_key_exists('category_id', $b) || array_key_exists('category', $b)) {
                $sets[] = 'category_id = ?';
                $params[] = kb_resolve_category($c['wid'], $b['category_id'] ?? null, $b['category'] ?? null);
            }
            if (array_key_exists('property_id', $b)) {
                $p = v_opt_uuid($b['property_id'], 'property_id');
                if ($p) own('properties', $p, $c['wid']);
                $sets[] = 'property_id = ?'; $params[] = $p;
            }
            if (!$sets) brix_fail('validation', 'Nothing to update', 422);
            $st = $db->prepare('SELECT id FROM kb_articles WHERE id = ? AND workspace_id = ?');
            $st->execute([$aid, $c['wid']]);
            if (!$st->fetch()) brix_fail('not_found', 'Article not found', 404);
            $params[] = $aid;
            $db->prepare('UPDATE kb_articles SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);
            audit_log($c['wid'], $c['member'], 'kb_article.updated', 'kb_article', $aid);
            $st = $db->prepare('SELECT a.*, c.name AS category_name FROM kb_articles a
                                LEFT JOIN kb_categories c ON c.id = a.category_id WHERE a.id = ?');
            $st->execute([$aid]);
            $r = $st->fetch();
            brix_json(m_article($r, $r['category_name']));
        }
        if ($method === 'DELETE') {
            $c = need('kb_articles', 'write');
            $st = $db->prepare('DELETE FROM kb_articles WHERE id = ? AND workspace_id = ?');
            $st->execute([$aid, $c['wid']]);
            if ($st->rowCount() === 0) brix_fail('not_found', 'Article not found', 404);
            audit_log($c['wid'], $c['member'], 'kb_article.deleted', 'kb_article', $aid);
            brix_json(['deleted' => true]);
        }
    }
}

// Slug = slugified title with numeric dedupe suffix (-2, -3...) like the frontend.
function kb_article_create(array $c, array $b): string {
    $db = brix_db();
    $title = v_str(v_required($b, 'title'), 'title', 255);
    $propId = v_opt_uuid($b['property_id'] ?? null, 'property_id');
    if ($propId) own('properties', $propId, $c['wid']);
    $catId = kb_resolve_category($c['wid'], $b['category_id'] ?? null, $b['category'] ?? null);
    $base = trim((string)preg_replace('/[^a-z0-9]+/', '-', mb_strtolower($title)), '-');
    if ($base === '') $base = 'article';
    $slug = $base; $n = 2;
    $st = $db->prepare('SELECT id FROM kb_articles WHERE workspace_id = ? AND slug = ?');
    while (true) {
        $st->execute([$c['wid'], $slug]);
        if (!$st->fetch()) break;
        $slug = $base . '-' . ($n++);
    }
    $aid = isset($b['id']) ? v_uuid($b['id']) : new_uuid();
    $db->prepare('INSERT INTO kb_articles (id, workspace_id, property_id, category_id, title, slug, body, status)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
       ->execute([$aid, $c['wid'], $propId, $catId, $title, $slug,
                  isset($b['body']) ? v_str($b['body'], 'body', 16777215) : '',
                  isset($b['status']) ? v_in($b['status'], ['draft', 'published'], 'status') : 'draft']);
    return $aid;
}

// Resolve category_id by explicit id or by (case-insensitive) name.
function kb_resolve_category(string $wid, mixed $id, mixed $name): ?string {
    $db = brix_db();
    if ($id !== null && $id !== '') {
        $id = v_uuid($id, 'category_id');
        $st = $db->prepare('SELECT id FROM kb_categories WHERE id = ? AND workspace_id = ?');
        $st->execute([$id, $wid]);
        if (!$st->fetch()) brix_fail('not_found', 'KB category not found', 404);
        return $id;
    }
    if ($name !== null && $name !== '') {
        $st = $db->prepare('SELECT id FROM kb_categories WHERE workspace_id = ? AND LOWER(name) = LOWER(?) LIMIT 1');
        $st->execute([$wid, v_str($name, 'category', 255)]);
        if ($row = $st->fetch()) return $row['id'];
    }
    return null;
}

// ============================================================================
// canned_responses
// ============================================================================
function route_canned(string $method, array $seg, $r1, $r2, $r3): void {
    $db = brix_db();
    if ($method === 'GET' && $r1 === null) {
        $c = need('canned_responses', 'read');
        $where = 'FROM canned_responses WHERE workspace_id = ?';
        $params = [$c['wid']];
        if (($v = req_q('category')) !== null && $v !== '') { $where .= ' AND category_id = ?'; $params[] = v_uuid($v, 'category'); }
        if (($v = req_q('propertyId')) !== null) { $where .= ' AND property_id = ?'; $params[] = v_uuid($v, 'propertyId'); }
        [$items, $next] = cursor_page($db, $where, $params, [['created_at', 'DESC'], ['id', 'DESC']],
            req_q('cursor'), req_q('limit', 50), 'm_canned');
        brix_items($items, $next);
    }
    if ($method === 'POST' && $r1 === null) {
        $c = need('canned_responses', 'write');
        $b = req_body();
        $propId = v_opt_uuid($b['property_id'] ?? null, 'property_id');
        if ($propId) own('properties', $propId, $c['wid']);
        $catId = v_opt_uuid($b['category_id'] ?? null, 'category_id');
        if ($catId) {
            $st = $db->prepare('SELECT id FROM canned_categories WHERE id = ? AND workspace_id = ?');
            $st->execute([$catId, $c['wid']]);
            if (!$st->fetch()) brix_fail('not_found', 'Canned category not found', 404);
        }
        $cid = isset($b['id']) ? v_uuid($b['id']) : new_uuid();
        $db->prepare('INSERT INTO canned_responses (id, workspace_id, property_id, category_id, shortcut, title, body, shared)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
           ->execute([$cid, $c['wid'], $propId, $catId,
                      isset($b['shortcut']) ? v_str($b['shortcut'], 'shortcut', 64) : '',
                      v_str(v_required($b, 'title'), 'title', 255),
                      v_str(v_required($b, 'body'), 'body', 65535),
                      array_key_exists('shared', $b) ? (v_bool($b['shared']) ? 1 : 0) : 1]);
        audit_log($c['wid'], $c['member'], 'canned.created', 'canned_response', $cid);
        $st = $db->prepare('SELECT * FROM canned_responses WHERE id = ?');
        $st->execute([$cid]);
        brix_json(m_canned($st->fetch()), 201);
    }
    if ($r1 !== null && $r2 === null) {
        $cid = v_uuid($r1);
        if ($method === 'GET') {
            $c = need('canned_responses', 'read');
            $st = $db->prepare('SELECT * FROM canned_responses WHERE id = ? AND workspace_id = ?');
            $st->execute([$cid, $c['wid']]);
            $r = $st->fetch();
            if (!$r) brix_fail('not_found', 'Canned response not found', 404);
            brix_json(m_canned($r));
        }
        if ($method === 'PATCH') {
            $c = need('canned_responses', 'write');
            $b = req_body();
            $st = $db->prepare('SELECT id FROM canned_responses WHERE id = ? AND workspace_id = ?');
            $st->execute([$cid, $c['wid']]);
            if (!$st->fetch()) brix_fail('not_found', 'Canned response not found', 404);
            $sets = []; $params = [];
            foreach (['shortcut' => 64, 'title' => 255, 'body' => 65535] as $f => $mx) {
                if (array_key_exists($f, $b)) { $sets[] = "$f = ?"; $params[] = v_str($b[$f], $f, $mx); }
            }
            if (array_key_exists('shared', $b)) { $sets[] = 'shared = ?'; $params[] = v_bool($b['shared']) ? 1 : 0; }
            if (array_key_exists('category_id', $b)) {
                $cat = v_opt_uuid($b['category_id'], 'category_id');
                if ($cat) {
                    $s2 = $db->prepare('SELECT id FROM canned_categories WHERE id = ? AND workspace_id = ?');
                    $s2->execute([$cat, $c['wid']]);
                    if (!$s2->fetch()) brix_fail('not_found', 'Canned category not found', 404);
                }
                $sets[] = 'category_id = ?'; $params[] = $cat;
            }
            if (!$sets) brix_fail('validation', 'Nothing to update', 422);
            $params[] = $cid;
            $db->prepare('UPDATE canned_responses SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);
            audit_log($c['wid'], $c['member'], 'canned.updated', 'canned_response', $cid);
            $st = $db->prepare('SELECT * FROM canned_responses WHERE id = ?');
            $st->execute([$cid]);
            brix_json(m_canned($st->fetch()));
        }
        if ($method === 'DELETE') {
            $c = need('canned_responses', 'write');
            $st = $db->prepare('DELETE FROM canned_responses WHERE id = ? AND workspace_id = ?');
            $st->execute([$cid, $c['wid']]);
            if ($st->rowCount() === 0) brix_fail('not_found', 'Canned response not found', 404);
            audit_log($c['wid'], $c['member'], 'canned.deleted', 'canned_response', $cid);
            brix_json(['deleted' => true]);
        }
    }
}

// ============================================================================
// triggers (+ /flows alias)
// ============================================================================
function route_triggers(string $method, array $seg, $r1, $r2, $r3): void {
    route_triggers_impl($method, $r1, $r2);
}
function route_flows(string $method, array $seg, $r1, $r2, $r3): void {
    route_triggers_impl($method, $r1, $r2);
}
function route_triggers_impl(string $method, $r1, $r2): void {
    $db = brix_db();
    if ($method === 'GET' && $r1 === null) {
        $c = need('triggers', 'read');
        $where = 'FROM triggers WHERE workspace_id = ?';
        $params = [$c['wid']];
        if (($v = req_q('propertyId')) !== null) { $where .= ' AND property_id = ?'; $params[] = v_uuid($v, 'propertyId'); }
        if (($v = req_q('kind')) !== null) { $where .= ' AND kind = ?'; $params[] = v_in($v, ['proactive', 'routing'], 'kind'); }
        $st = $db->prepare("SELECT * $where ORDER BY created_at DESC");
        $st->execute($params);
        brix_items(array_map('m_trigger', $st->fetchAll()), null);
    }
    if ($method === 'POST' && $r1 === null) {
        $c = need('triggers', 'write');
        $b = req_body();
        $propId = v_opt_uuid($b['property_id'] ?? null, 'property_id');
        if ($propId) own('properties', $propId, $c['wid']);
        $tid = isset($b['id']) ? v_uuid($b['id']) : new_uuid();
        $cg = $b['condition_groups'] ?? [];
        $ac = $b['actions'] ?? [];
        if (!is_array($cg) || !is_array($ac)) brix_fail('validation', 'condition_groups/actions must be arrays', 422);
        $db->prepare('INSERT INTO triggers (id, workspace_id, property_id, name, kind, event, condition_groups, actions, enabled)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
           ->execute([$tid, $c['wid'], $propId, v_str(v_required($b, 'name'), 'name', 255),
                      v_in($b['kind'] ?? 'proactive', ['proactive', 'routing'], 'kind'),
                      isset($b['event']) ? v_str($b['event'], 'event', 128) : 'chat.started',
                      jenc(array_values($cg)), jenc(array_values($ac)),
                      array_key_exists('enabled', $b) ? (v_bool($b['enabled']) ? 1 : 0) : 1]);
        audit_log($c['wid'], $c['member'], 'trigger.created', 'trigger', $tid);
        $st = $db->prepare('SELECT * FROM triggers WHERE id = ?');
        $st->execute([$tid]);
        brix_json(m_trigger($st->fetch()), 201);
    }
    if ($r1 !== null && $r2 === null) {
        $tid = v_uuid($r1);
        if ($method === 'GET') {
            $c = need('triggers', 'read');
            $st = $db->prepare('SELECT * FROM triggers WHERE id = ? AND workspace_id = ?');
            $st->execute([$tid, $c['wid']]);
            $r = $st->fetch();
            if (!$r) brix_fail('not_found', 'Trigger not found', 404);
            brix_json(m_trigger($r));
        }
        if ($method === 'PATCH') {
            $c = need('triggers', 'write');
            $b = req_body();
            $st = $db->prepare('SELECT id FROM triggers WHERE id = ? AND workspace_id = ?');
            $st->execute([$tid, $c['wid']]);
            if (!$st->fetch()) brix_fail('not_found', 'Trigger not found', 404);
            $sets = []; $params = [];
            if (array_key_exists('name', $b)) { $sets[] = 'name = ?'; $params[] = v_str($b['name'], 'name', 255); }
            if (array_key_exists('kind', $b)) { $sets[] = 'kind = ?'; $params[] = v_in($b['kind'], ['proactive', 'routing'], 'kind'); }
            if (array_key_exists('event', $b)) { $sets[] = 'event = ?'; $params[] = v_str($b['event'], 'event', 128); }
            if (array_key_exists('condition_groups', $b)) {
                if (!is_array($b['condition_groups'])) brix_fail('validation', 'condition_groups must be an array', 422);
                $sets[] = 'condition_groups = ?'; $params[] = jenc(array_values($b['condition_groups']));
            }
            if (array_key_exists('actions', $b)) {
                if (!is_array($b['actions'])) brix_fail('validation', 'actions must be an array', 422);
                $sets[] = 'actions = ?'; $params[] = jenc(array_values($b['actions']));
            }
            if (array_key_exists('enabled', $b)) { $sets[] = 'enabled = ?'; $params[] = v_bool($b['enabled']) ? 1 : 0; }
            if (!$sets) brix_fail('validation', 'Nothing to update', 422);
            $params[] = $tid;
            $db->prepare('UPDATE triggers SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);
            audit_log($c['wid'], $c['member'], 'trigger.updated', 'trigger', $tid);
            $st = $db->prepare('SELECT * FROM triggers WHERE id = ?');
            $st->execute([$tid]);
            brix_json(m_trigger($st->fetch()));
        }
        if ($method === 'DELETE') {
            $c = need('triggers', 'write');
            $st = $db->prepare('DELETE FROM triggers WHERE id = ? AND workspace_id = ?');
            $st->execute([$tid, $c['wid']]);
            if ($st->rowCount() === 0) brix_fail('not_found', 'Trigger not found', 404);
            audit_log($c['wid'], $c['member'], 'trigger.deleted', 'trigger', $tid);
            brix_json(['deleted' => true]);
        }
    }
}

// ============================================================================
// api_keys (raw key shown ONCE at create/rotate; key_hash never readable)
// ============================================================================
function route_api_keys(string $method, array $seg, $r1, $r2, $r3): void {
    $db = brix_db();
    $cols = 'id, workspace_id, name, prefix, scopes, revoked, usage_count, last_used_at, created_at, updated_at';
    if ($method === 'GET' && $r1 === null) {
        $c = need('api_keys', 'read');
        $st = $db->prepare("SELECT $cols FROM api_keys WHERE workspace_id = ? ORDER BY created_at DESC");
        $st->execute([$c['wid']]);
        brix_items(array_map('m_apikey', $st->fetchAll()), null);
    }
    if ($method === 'POST' && $r1 === null) {
        $c = need('api_keys', 'write');
        $b = req_body();
        $name = v_str(v_required($b, 'name'), 'name', 255);
        $scopes = $b['scopes'] ?? [];
        if (!is_array($scopes)) brix_fail('validation', 'scopes must be an array', 422);
        $scopes = array_values(array_unique(array_map(fn($s) => v_str($s, 'scope', 64), $scopes)));
        $kid = isset($b['id']) ? v_uuid($b['id']) : new_uuid();
        $raw = 'bk_live_' . bin2hex(random_bytes(24)); // 48 hex chars
        $db->prepare('INSERT INTO api_keys (id, workspace_id, name, prefix, key_hash, scopes)
                      VALUES (?, ?, ?, ?, ?, ?)')
           ->execute([$kid, $c['wid'], $name, substr($raw, 0, 14), hash('sha256', $raw), jenc($scopes)]);
        audit_log($c['wid'], $c['member'], 'api_key.created', 'api_key', $kid, ['name' => $name]);
        $st = $db->prepare('SELECT id, workspace_id, name, prefix, scopes, revoked, usage_count, last_used_at, created_at, updated_at
                            FROM api_keys WHERE id = ?');
        $st->execute([$kid]);
        brix_json(['record' => m_apikey($st->fetch()), 'key' => $raw], 201);
    }
    if ($method === 'GET' && $r1 !== null && $r2 === null) {
        $c = need('api_keys', 'read');
        $st = $db->prepare("SELECT $cols FROM api_keys WHERE id = ? AND workspace_id = ?");
        $st->execute([v_uuid($r1), $c['wid']]);
        $r = $st->fetch();
        if (!$r) brix_fail('not_found', 'API key not found', 404);
        brix_json(m_apikey($r));
    }
    // GET /api-keys/:id/reveal — always {key: null} (nothing persisted)
    if ($method === 'GET' && $r1 !== null && $r2 === 'reveal' && $r3 === null) {
        $c = need('api_keys', 'read');
        own('api_keys', $r1, $c['wid'], 'id');
        brix_json(['key' => null]);
    }
    // POST /api-keys/:id/rotate — delete + re-insert preserving id + created_at
    if ($method === 'POST' && $r1 !== null && $r2 === 'rotate' && $r3 === null) {
        $c = need('api_keys', 'write');
        $row = own('api_keys', $r1, $c['wid']);
        $raw = 'bk_live_' . bin2hex(random_bytes(24));
        $db->beginTransaction();
        try {
            $db->prepare('DELETE FROM api_keys WHERE id = ?')->execute([$row['id']]);
            $db->prepare('INSERT INTO api_keys (id, workspace_id, name, prefix, key_hash, scopes, revoked, usage_count, last_used_at, created_at)
                          VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)')
               ->execute([$row['id'], $c['wid'], $row['name'], substr($raw, 0, 14), hash('sha256', $raw),
                          $row['scopes'], (int)$row['usage_count'], $row['last_used_at'], $row['created_at']]);
            $db->commit();
        } catch (Throwable $e) { $db->rollBack(); throw $e; }
        audit_log($c['wid'], $c['member'], 'api_key.rotated', 'api_key', $row['id']);
        $st = $db->prepare("SELECT $cols FROM api_keys WHERE id = ?");
        $st->execute([$row['id']]);
        brix_json(['record' => m_apikey($st->fetch()), 'key' => $raw]);
    }
    if ($method === 'POST' && $r1 !== null && $r2 === 'revoke' && $r3 === null) {
        $c = need('api_keys', 'write');
        $row = own('api_keys', $r1, $c['wid']);
        $db->prepare('UPDATE api_keys SET revoked = 1 WHERE id = ?')->execute([$row['id']]);
        audit_log($c['wid'], $c['member'], 'api_key.revoked', 'api_key', $row['id']);
        brix_json(['revoked' => true]);
    }
    if ($method === 'DELETE' && $r1 !== null && $r2 === null) {
        $c = need('api_keys', 'write');
        $row = own('api_keys', $r1, $c['wid']);
        $db->prepare('DELETE FROM api_keys WHERE id = ?')->execute([$row['id']]);
        audit_log($c['wid'], $c['member'], 'api_key.deleted', 'api_key', $row['id']);
        brix_json(['deleted' => true]);
    }
}

// ============================================================================
// webhooks + webhook_deliveries
// ============================================================================
function route_webhooks(string $method, array $seg, $r1, $r2, $r3): void {
    $db = brix_db();
    $cols = 'id, workspace_id, property_id, url, disabled_reason, events, enabled, auto_disable, consecutive_failures, created_at, updated_at';
    if ($method === 'GET' && $r1 === null) {
        $c = need('webhooks', 'read');
        $st = $db->prepare("SELECT $cols FROM webhooks WHERE workspace_id = ? ORDER BY created_at DESC");
        $st->execute([$c['wid']]);
        $rows = $st->fetchAll();
        // secret_set: check separately without selecting the secret for members is
        // internal-only; admins/developers may know whether one is set.
        foreach ($rows as &$r) {
            $s = $db->prepare('SELECT secret FROM webhooks WHERE id = ?');
            $s->execute([$r['id']]);
            $r['secret'] = $s->fetch()['secret'];
        }
        brix_items(array_map('m_webhook', $rows), null);
    }
    if ($method === 'POST' && $r1 === null) {
        $c = need('webhooks', 'write');
        $b = req_body();
        $url = v_str(v_required($b, 'url'), 'url', 2048);
        if (!filter_var($url, FILTER_VALIDATE_URL) || !preg_match('#^https?://#i', $url)) {
            brix_fail('validation', 'url must be a valid http(s) URL', 422);
        }
        $events = $b['events'] ?? [];
        if (!is_array($events) || !$events) brix_fail('validation', 'events must be a non-empty array', 422);
        $events = array_values(array_unique(array_map(fn($e) => v_str($e, 'event', 128), $events)));
        foreach ($events as $ev) {
            if (!webhook_event_is_known($ev)) brix_fail('validation', "unknown webhook event '{$ev}'", 422);
        }
        // property_id is NOT NULL in the schema (FK to properties): a webhook
        // always belongs to one property.
        $propId = own('properties', v_required($b, 'property_id'), $c['wid'])['id'];
        $wid2 = isset($b['id']) ? v_uuid($b['id']) : new_uuid();
        $db->prepare('INSERT INTO webhooks (id, workspace_id, property_id, url, secret, events, enabled, auto_disable)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
           ->execute([$wid2, $c['wid'], $propId, $url,
                      array_key_exists('secret', $b) && $b['secret'] !== null ? v_str($b['secret'], 'secret', 1024) : null,
                      jenc($events),
                      array_key_exists('enabled', $b) ? (v_bool($b['enabled']) ? 1 : 0) : 1,
                      array_key_exists('auto_disable', $b) ? (v_bool($b['auto_disable']) ? 1 : 0) : 1]);
        audit_log($c['wid'], $c['member'], 'webhook.created', 'webhook', $wid2, ['url' => $url]);
        $st = $db->prepare("SELECT $cols FROM webhooks WHERE id = ?");
        $st->execute([$wid2]);
        $r = $st->fetch();
        $r['secret'] = !empty($b['secret']);
        brix_json(m_webhook($r), 201);
    }
    // POST /webhooks/:id/dispatch — enqueue + flush
    if ($method === 'POST' && $r1 !== null && $r2 === 'dispatch' && $r3 === null) {
        $c = need('webhooks', 'write');
        $wh = own('webhooks', $r1, $c['wid']);
        $b = req_body();
        $event = v_str(v_required($b, 'event'), 'event', 128);
        if (!webhook_event_is_known($event)) brix_fail('validation', "unknown webhook event '{$event}'", 422);
        $propId = v_opt_uuid($b['property_id'] ?? null, 'property_id');
        if ($propId) own('properties', $propId, $c['wid']);
        $enq = webhook_enqueue($c['wid'], $event, $propId, isset($b['data']) && is_array($b['data']) ? $b['data'] : [],
            isset($b['event_id']) ? v_str($b['event_id'], 'event_id', 64) : null);
        $stats = webhook_flush($c['wid'], null, 50);
        audit_log($c['wid'], $c['member'], 'webhook.dispatched', 'webhook', $wh['id'], ['event' => $event]);
        brix_json(array_merge($enq, $stats));
    }
    // GET /webhooks/:id/deliveries
    if ($method === 'GET' && $r1 !== null && $r2 === 'deliveries' && $r3 === null) {
        $c = need('webhook_deliveries', 'read');
        $wh = own('webhooks', $r1, $c['wid']);
        [$items, $next] = cursor_page($db, 'FROM webhook_deliveries WHERE webhook_id = ? AND workspace_id = ?',
            [$wh['id'], $c['wid']], [['created_at', 'DESC'], ['id', 'DESC']],
            req_q('cursor'), req_q('limit', 50), 'm_delivery');
        brix_items($items, $next);
    }
    if ($r1 !== null && $r2 === null) {
        if ($method === 'GET') {
            $c = need('webhooks', 'read');
            $st = $db->prepare("SELECT $cols FROM webhooks WHERE id = ? AND workspace_id = ?");
            $st->execute([v_uuid($r1), $c['wid']]);
            $r = $st->fetch();
            if (!$r) brix_fail('not_found', 'Webhook not found', 404);
            $s = $db->prepare('SELECT secret FROM webhooks WHERE id = ?');
            $s->execute([$r['id']]);
            $r['secret'] = $s->fetch()['secret'];
            brix_json(m_webhook($r));
        }
        if ($method === 'PATCH') {
            $c = need('webhooks', 'write');
            $wh = own('webhooks', $r1, $c['wid']);
            $b = req_body();
            $sets = []; $params = [];
            if (array_key_exists('url', $b)) {
                $url = v_str($b['url'], 'url', 2048);
                if (!filter_var($url, FILTER_VALIDATE_URL) || !preg_match('#^https?://#i', $url)) {
                    brix_fail('validation', 'url must be a valid http(s) URL', 422);
                }
                $sets[] = 'url = ?'; $params[] = $url;
            }
            if (array_key_exists('events', $b)) {
                if (!is_array($b['events']) || !$b['events']) brix_fail('validation', 'events must be a non-empty array', 422);
                $evs = array_values(array_unique(array_map(fn($e) => v_str($e, 'event', 128), $b['events'])));
                foreach ($evs as $ev) {
                    if (!webhook_event_is_known($ev)) brix_fail('validation', "unknown webhook event '{$ev}'", 422);
                }
                $sets[] = 'events = ?'; $params[] = jenc($evs);
            }
            if (array_key_exists('secret', $b)) { // rotation; null clears
                $sets[] = 'secret = ?'; $params[] = $b['secret'] === null ? null : v_str($b['secret'], 'secret', 1024);
            }
            if (array_key_exists('enabled', $b)) {
                $sets[] = 'enabled = ?'; $params[] = v_bool($b['enabled']) ? 1 : 0;
                if (v_bool($b['enabled'])) { $sets[] = 'consecutive_failures = 0'; $sets[] = 'disabled_reason = NULL'; }
            }
            if (array_key_exists('property_id', $b)) {
                $p = v_opt_uuid($b['property_id'], 'property_id');
                if ($p) own('properties', $p, $c['wid']);
                $sets[] = 'property_id = ?'; $params[] = $p;
            }
            if (!$sets) brix_fail('validation', 'Nothing to update', 422);
            $params[] = $wh['id'];
            $db->prepare('UPDATE webhooks SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);
            audit_log($c['wid'], $c['member'], 'webhook.updated', 'webhook', $wh['id']);
            $st = $db->prepare("SELECT $cols FROM webhooks WHERE id = ?");
            $st->execute([$wh['id']]);
            $r = $st->fetch();
            $s = $db->prepare('SELECT secret FROM webhooks WHERE id = ?');
            $s->execute([$r['id']]);
            $r['secret'] = $s->fetch()['secret'];
            brix_json(m_webhook($r));
        }
        if ($method === 'DELETE') {
            $c = need('webhooks', 'write');
            $wh = own('webhooks', $r1, $c['wid']);
            $db->prepare('DELETE FROM webhooks WHERE id = ?')->execute([$wh['id']]);
            audit_log($c['wid'], $c['member'], 'webhook.deleted', 'webhook', $wh['id']);
            brix_json(['deleted' => true]);
        }
    }
}

function route_webhook_deliveries(string $method, array $seg, $r1, $r2, $r3): void {
    $db = brix_db();
    if ($method === 'GET' && $r1 === null) {
        $c = need('webhook_deliveries', 'read');
        $where = 'FROM webhook_deliveries WHERE workspace_id = ?';
        $params = [$c['wid']];
        if (($v = req_q('webhook_id')) !== null) { $where .= ' AND webhook_id = ?'; $params[] = v_uuid($v, 'webhook_id'); }
        if (($v = req_q('status')) !== null) { $where .= ' AND status = ?'; $params[] = v_in($v, ['pending', 'delivered', 'failed', 'dead', 'test'], 'status'); }
        [$items, $next] = cursor_page($db, $where, $params, [['created_at', 'DESC'], ['id', 'DESC']],
            req_q('cursor'), req_q('limit', 50), 'm_delivery');
        brix_items($items, $next);
    }
    if ($method === 'GET' && $r1 !== null && $r2 === null) {
        $c = need('webhook_deliveries', 'read');
        $st = $db->prepare('SELECT * FROM webhook_deliveries WHERE id = ? AND workspace_id = ?');
        $st->execute([v_uuid($r1), $c['wid']]);
        $r = $st->fetch();
        if (!$r) brix_fail('not_found', 'Delivery not found', 404);
        brix_json(m_delivery($r));
    }
}

// ============================================================================
// invites (port of the invites edge function)
// ============================================================================
function route_invites(string $method, array $seg, $r1, $r2, $r3): void {
    $db = brix_db();
    // POST /invites/accept — public; the token is the credential
    if ($method === 'POST' && $r1 === 'accept' && $r2 === null) {
        $b = req_body();
        $inviteId = v_uuid($b['invite_id'] ?? null, 'invite_id');
        $token = v_str(v_required($b, 'token'), 'token', 64);
        $passcode = v_passcode($b['passcode'] ?? null, 8, 128);

        $st = $db->prepare('SELECT * FROM member_invites WHERE id = ?');
        $st->execute([$inviteId]);
        $inv = $st->fetch();
        if (!$inv) brix_fail('not_found', 'Invite not found', 404);
        if ($inv['used_at'] !== null) brix_fail('gone', 'Invite already used', 410);
        if (strtotime((string)$inv['expires_at'] . ' UTC') < time()) brix_fail('gone', 'Invite expired', 410);
        $hash = hash('sha256', $inv['token_salt'] . ':' . $token);
        if (!hash_equals((string)$inv['token_hash'], $hash)) brix_fail('unauthorized', 'Invalid invite token', 401);

        $display = isset($b['display_name']) ? v_str($b['display_name'], 'display_name', 60) : (string)$inv['display_name'];
        if (mb_strlen($display) < 2 || mb_strlen($display) > 60) brix_fail('validation', 'display_name must be 2-60 characters', 422);

        $db->beginTransaction();
        try {
            // Re-verify inside the transaction (atomic accept).
            $st = $db->prepare('SELECT * FROM member_invites WHERE id = ? FOR UPDATE');
            $st->execute([$inviteId]);
            $inv2 = $st->fetch();
            if (!$inv2 || $inv2['used_at'] !== null) { $db->rollBack(); brix_fail('gone', 'Invite already used', 410); }
            if (strtotime((string)$inv2['expires_at'] . ' UTC') < time()) { $db->rollBack(); brix_fail('gone', 'Invite expired', 410); }
            if (!hash_equals((string)$inv2['token_hash'], hash('sha256', $inv2['token_salt'] . ':' . $token))) {
                $db->rollBack(); brix_fail('unauthorized', 'Invalid invite token', 401);
            }
            $st = $db->prepare('SELECT id FROM members WHERE workspace_id = ? AND LOWER(display_name) = LOWER(?)');
            $st->execute([$inv2['workspace_id'], $display]);
            if ($st->fetch()) { $db->rollBack(); brix_fail('conflict', 'A member with this name already exists', 409); }
            $mid = new_uuid();
            $db->prepare('INSERT INTO members (id, workspace_id, display_name, initials, color, role, email, status)
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
               ->execute([$mid, $inv2['workspace_id'], $display, member_initials($display), '#4f46e5',
                          $inv2['role'], (string)$inv2['email'], 'offline']);
            $db->prepare('INSERT INTO member_credentials (member_id, passcode_hash) VALUES (?, ?)')
               ->execute([$mid, password_hash($passcode, PASSWORD_BCRYPT)]);
            $db->prepare('UPDATE member_invites SET used_at = UTC_TIMESTAMP() WHERE id = ?')->execute([$inviteId]);
            $db->commit();
        } catch (ApiError $e) { throw $e; }
        catch (Throwable $e) { try { $db->rollBack(); } catch (Throwable $ignored) {} throw $e; }

        $st = $db->prepare('SELECT * FROM members WHERE id = ?');
        $st->execute([$mid]);
        $member = hydrate_members([$st->fetch()])[0];
        brix_json(['member' => $member]);
    }

    // POST /invites — create (admin)
    if ($method === 'POST' && $r1 === null) {
        $c = need('members', 'write');
        $b = req_body();
        $display = v_str(v_required($b, 'display_name'), 'display_name', 60);
        if (mb_strlen($display) < 2) brix_fail('validation', 'display_name must be 2-60 characters', 422);
        $role = v_in($b['role'] ?? 'agent', ['admin', 'agent', 'developer', 'viewer'], 'role');
        $email = isset($b['email']) && $b['email'] !== '' ? v_email($b['email']) : '';
        $token = '';
        for ($i = 0; $i < 16; $i++) $token .= INVITE_ALPHABET[random_int(0, strlen(INVITE_ALPHABET) - 1)];
        $salt = bin2hex(random_bytes(16));
        $inviteId = new_uuid();
        $expires = gmdate('Y-m-d H:i:s', time() + 7 * 86400);
        $db->prepare('INSERT INTO member_invites (id, workspace_id, email, display_name, role, token_hash, token_salt, expires_at, created_by)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
           ->execute([$inviteId, $c['wid'], $email, $display, $role, hash('sha256', $salt . ':' . $token), $salt, $expires, $c['mid']]);
        $emailStatus = 'skipped';
        if ($email !== '' && !empty(brix_config()['MAIL_ENABLED'])) {
            $appUrl = rtrim((string)(brix_config()['SITE_ORIGIN'] ?? ''), '/');
            $link = $appUrl . '/invite/' . $inviteId;
            $headers = 'From: ' . brix_config()['MAIL_FROM'] . "\r\nContent-Type: text/plain; charset=utf-8";
            $emailStatus = @mail($email, 'You are invited to join ' . $c['workspace']['name'] . ' on Brix Chat',
                "Hi $display,\n\nYou have been invited as $role.\n\nAccept here: $link\nYour invite token: $token\n\nThis invite expires in 7 days.",
                $headers) ? 'sent' : 'failed';
        }
        audit_log($c['wid'], $c['member'], 'invite.created', 'member_invite', $inviteId, ['display_name' => $display]);
        brix_json([
            'invite_id' => $inviteId,
            'invite_url' => rtrim((string)(brix_config()['SITE_ORIGIN'] ?? ''), '/') . '/invite/' . $inviteId,
            'token' => $token, // returned ONCE
            'expires_at' => gmdate('Y-m-d\TH:i:s.000\Z', time() + 7 * 86400),
            'email' => $emailStatus,
        ], 201);
    }
    if ($method === 'GET' && $r1 === null) {
        $c = need('members', 'write'); // admin
        $st = $db->prepare('SELECT * FROM member_invites WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 100');
        $st->execute([$c['wid']]);
        brix_items(array_map('m_invite', $st->fetchAll()), null);
    }
}

// ============================================================================
// visitors
// ============================================================================
function route_visitors(string $method, array $seg, $r1, $r2, $r3): void {
    $db = brix_db();
    if ($method === 'GET' && $r1 === null) {
        $c = need('visitors', 'read');
        $where = 'FROM visitors WHERE workspace_id = ?';
        $params = [$c['wid']];
        if (($v = req_q('property_id')) !== null) { $where .= ' AND property_id = ?'; $params[] = v_uuid($v, 'property_id'); }
        if (($v = req_q('online')) !== null) { $where .= ' AND online = ?'; $params[] = v_bool($v) ? 1 : 0; }
        [$items, $next] = cursor_page($db, $where, $params, [['last_seen_at', 'DESC'], ['id', 'DESC']],
            req_q('cursor'), req_q('limit', 50), 'm_visitor');
        brix_items($items, $next);
    }
    if ($method === 'POST' && $r1 === null) {
        $c = need('visitors', 'write');
        $b = req_body();
        $prop = own('properties', $b['property_id'] ?? null, $c['wid']);
        $contactId = v_opt_uuid($b['contact_id'] ?? null, 'contact_id');
        if ($contactId) own('contacts', $contactId, $c['wid']);
        $vid = isset($b['id']) ? v_uuid($b['id']) : new_uuid();
        $db->prepare('INSERT INTO visitors (id, workspace_id, property_id, contact_id, name, email, page_url, pages,
                      country, city, device, browser, time_on_site_sec, typing_preview, online, custom_attributes)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
           ->execute([$vid, $c['wid'], $prop['id'], $contactId,
                      isset($b['name']) ? v_str($b['name'], 'name', 255) : 'Guest',
                      isset($b['email']) ? v_email($b['email']) : '',
                      isset($b['page_url']) ? v_str($b['page_url'], 'page_url', 2048) : '',
                      isset($b['pages']) ? v_int($b['pages'], 'pages', 0) : 1,
                      isset($b['country']) ? v_str($b['country'], 'country', 128) : '',
                      isset($b['city']) ? v_str($b['city'], 'city', 128) : '',
                      isset($b['device']) ? v_str($b['device'], 'device', 255) : '',
                      isset($b['browser']) ? v_str($b['browser'], 'browser', 255) : '',
                      isset($b['time_on_site_sec']) ? v_int($b['time_on_site_sec'], 'time_on_site_sec', 0) : 0,
                      isset($b['typing_preview']) ? v_str($b['typing_preview'], 'typing_preview', 1024) : null,
                      array_key_exists('online', $b) ? (v_bool($b['online']) ? 1 : 0) : 1,
                      jenc($b['custom_attributes'] ?? new stdClass())]);
        $st = $db->prepare('SELECT * FROM visitors WHERE id = ?');
        $st->execute([$vid]);
        brix_json(m_visitor($st->fetch()), 201);
    }
    if ($r1 !== null && $r2 === null) {
        if ($method === 'GET') {
            $c = need('visitors', 'read');
            $st = $db->prepare('SELECT * FROM visitors WHERE id = ? AND workspace_id = ?');
            $st->execute([v_uuid($r1), $c['wid']]);
            $r = $st->fetch();
            if (!$r) brix_fail('not_found', 'Visitor not found', 404);
            brix_json(m_visitor($r));
        }
        if ($method === 'PATCH') {
            $c = need('visitors', 'write');
            $st = $db->prepare('SELECT id FROM visitors WHERE id = ? AND workspace_id = ?');
            $st->execute([v_uuid($r1), $c['wid']]);
            if (!$st->fetch()) brix_fail('not_found', 'Visitor not found', 404);
            $b = req_body();
            $sets = ['last_seen_at = UTC_TIMESTAMP()']; $params = [];
            foreach (['name' => 255, 'email' => 255, 'page_url' => 2048, 'country' => 128, 'city' => 128,
                      'device' => 255, 'browser' => 255] as $f => $mx) {
                if (array_key_exists($f, $b)) { $sets[] = "$f = ?"; $params[] = $f === 'email' ? v_email($b[$f]) : v_str($b[$f], $f, $mx); }
            }
            foreach (['pages' => null, 'time_on_site_sec' => null] as $f => $_) {
                if (array_key_exists($f, $b)) { $sets[] = "$f = ?"; $params[] = v_int($b[$f], $f, 0); }
            }
            if (array_key_exists('typing_preview', $b)) {
                $sets[] = 'typing_preview = ?';
                $params[] = $b['typing_preview'] === null ? null : v_str($b['typing_preview'], 'typing_preview', 1024);
            }
            if (array_key_exists('online', $b)) { $sets[] = 'online = ?'; $params[] = v_bool($b['online']) ? 1 : 0; }
            if (array_key_exists('custom_attributes', $b)) { $sets[] = 'custom_attributes = ?'; $params[] = jenc($b['custom_attributes']); }
            $params[] = $r1;
            $db->prepare('UPDATE visitors SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);
            $st = $db->prepare('SELECT * FROM visitors WHERE id = ?');
            $st->execute([$r1]);
            brix_json(m_visitor($st->fetch()));
        }
        if ($method === 'DELETE') {
            $c = need('visitors', 'write');
            $st = $db->prepare('DELETE FROM visitors WHERE id = ? AND workspace_id = ?');
            $st->execute([v_uuid($r1), $c['wid']]);
            if ($st->rowCount() === 0) brix_fail('not_found', 'Visitor not found', 404);
            brix_json(['deleted' => true]);
        }
    }
}

// ============================================================================
// ai/copilot (port of the ai-copilot edge function)
// ============================================================================
function route_ai(string $method, array $seg, $r1, $r2, $r3): void {
    if ($r1 !== 'copilot' || $r2 !== null) brix_fail('not_found', 'Unknown endpoint', 404);
    if ($method === 'GET') {
        brix_json(['ok' => true, 'function' => 'ai-copilot',
            'modes' => ['reply', 'summary', 'rewrite'],
            'providers' => ['openai', 'anthropic']]);
    }
    if ($method !== 'POST') brix_fail('not_found', 'Unknown endpoint', 404);
    $c = auth_ctx();
    $b = req_body();
    $prompt = v_str(v_required($b, 'prompt'), 'prompt', 8000);
    if ($prompt === '') brix_fail('validation', 'prompt must not be empty', 422);
    $mode = v_in($b['mode'] ?? 'reply', ['reply', 'summary', 'rewrite'], 'mode');
    $tone = v_in($b['tone'] ?? 'friendly', ['friendly', 'professional', 'concise'], 'tone');
    $provider = v_in($b['provider'] ?? 'openai', ['openai', 'anthropic'], 'provider');

    $context = isset($b['context']) ? mb_substr(v_str($b['context'], 'context', 100000), 0, 2000) : '';
    $modeInstr = [
        'reply' => 'Write only the reply text to send to the visitor. No preamble, no quotes around it.',
        'summary' => 'Summarize the conversation so far in a few short sentences for the agent.',
        'rewrite' => 'Rewrite the draft below, improving clarity and tone. Return only the rewritten text.',
    ][$mode];
    $system = "You are Brix Chat's AI copilot, assisting a support agent. Tone: $tone. $modeInstr";
    $user = $prompt . ($context !== '' ? "\n\nAdditional context:\n$context" : '');

    $key = $provider === 'openai'
        ? (string)(brix_config()['AI_API_KEY'] ?? '')
        : (string)(brix_config()['AI_ANTHROPIC_KEY'] ?? '');
    if ($key === '') {
        brix_fail('not_configured', 'Connect an AI provider key in config.php', 501);
    }

    if ($provider === 'openai') {
        $resp = http_json('https://api.openai.com/v1/chat/completions', [
            'Authorization: Bearer ' . $key,
        ], [
            'model' => brix_config()['AI_MODEL'] ?? 'gpt-4o-mini',
            'messages' => [
                ['role' => 'system', 'content' => $system],
                ['role' => 'user', 'content' => $user],
            ],
            'temperature' => 0.4, 'max_tokens' => 600,
        ], 30);
    } else {
        $resp = http_json('https://api.anthropic.com/v1/messages', [
            'x-api-key: ' . $key, 'anthropic-version: 2023-06-01',
        ], [
            'model' => 'claude-sonnet-4-6',
            'max_tokens' => 600, 'temperature' => 0.4,
            'system' => $system,
            'messages' => [['role' => 'user', 'content' => $user]],
        ], 30);
    }

    if ($resp['curl_error'] !== '') brix_fail('ai_timeout', 'AI provider unreachable', 504);
    $http = $resp['http'];
    $body = $resp['body'];
    if ($http === 401 || $http === 403) brix_fail('ai_auth_failed', 'AI provider rejected the API key', 502);
    if ($http === 429) brix_fail('ai_rate_limited', 'AI provider rate limit hit', 429);
    if ($http < 200 || $http >= 300) brix_fail('ai_provider_error', 'AI provider error (HTTP ' . $http . ')', 502);
    $suggestion = $provider === 'openai'
        ? ($body['choices'][0]['message']['content'] ?? null)
        : (($body['content'][0]['text'] ?? null));
    if (!is_string($suggestion) || trim($suggestion) === '') brix_fail('ai_empty_response', 'AI provider returned an empty response', 502);
    brix_json(['suggestion' => $suggestion, 'provider' => $provider, 'mode' => $mode, 'tone' => $tone]);
}

// POST JSON helper with timeout. Returns ['http'=>int,'body'=>array,'curl_error'=>string].
function http_json(string $url, array $headers, array $payload, int $timeout): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => jenc($payload),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_HTTPHEADER => array_merge(['Content-Type: application/json'], $headers),
    ]);
    $raw = curl_exec($ch);
    $err = curl_error($ch);
    $http = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    $body = is_string($raw) ? (json_decode($raw, true) ?? []) : [];
    return ['http' => $http, 'body' => is_array($body) ? $body : [], 'curl_error' => $err];
}

// ============================================================================
// email/send (port of the send-email edge function — PHP mail() backend)
// ============================================================================
function route_email(string $method, array $seg, $r1, $r2, $r3): void {
    if ($r1 !== 'send' || $r2 !== null || $method !== 'POST') brix_fail('not_found', 'Unknown endpoint', 404);
    $c = need('notifications', 'write'); // any non-viewer member may send
    $b = req_body();
    $to = $b['to'] ?? null;
    $recipients = is_array($to) ? $to : [$to];
    $recipients = array_values(array_filter(array_map(fn($e) => is_string($e) ? trim($e) : '', $recipients)));
    if (!$recipients || count($recipients) > 50) brix_fail('validation', 'to must be 1-50 recipients', 422);
    foreach ($recipients as $e) {
        if (!filter_var($e, FILTER_VALIDATE_EMAIL)) brix_fail('validation', "Invalid recipient: $e", 422);
    }
    $subject = v_str(v_required($b, 'subject'), 'subject', 512);
    $html = isset($b['html']) ? (string)$b['html'] : '';
    $text = isset($b['text']) ? (string)$b['text'] : '';
    if (trim($html) === '' && trim($text) === '') brix_fail('validation', 'html or text is required', 422);

    if (empty(brix_config()['MAIL_ENABLED'])) {
        brix_fail('not_configured', 'Email is disabled. Set MAIL_ENABLED=1 and MAIL_FROM in api/config.php', 501);
    }
    $from = (string)(brix_config()['MAIL_FROM'] ?? '');
    $isHtml = trim($html) !== '';
    $body = $isHtml ? $html : $text;
    $headers = 'From: ' . $from . "\r\n"
             . 'MIME-Version: 1.0' . "\r\n"
             . 'Content-Type: ' . ($isHtml ? 'text/html' : 'text/plain') . '; charset=utf-8' . "\r\n"
             . 'X-Mailer: Brix-Chat-PHP-API';
    $ok = @mail(implode(', ', $recipients), $subject, $body, $headers);
    if (!$ok) brix_fail('email_failed', 'PHP mail() failed to hand the message to the MTA', 502);
    audit_log($c['wid'], $c['member'], 'email.sent', 'email', '', ['to' => count($recipients), 'subject' => $subject]);
    brix_json(['id' => 'phpmail-' . bin2hex(random_bytes(8))]);
}

// ============================================================================
// updates — polling replacement for realtime (conversations/messages/visitors)
// ============================================================================
function route_updates(string $method, array $seg, $r1, $r2, $r3): void {
    if ($method !== 'GET') brix_fail('not_found', 'Unknown endpoint', 404);
    $c = need('conversations', 'read');
    $since = req_q('since');
    if (!$since) brix_fail('validation', 'since (ISO-8601) is required', 422);
    $sinceSql = gmdate('Y-m-d H:i:s', strtotime((string)$since));
    if ($sinceSql === false) brix_fail('validation', 'Invalid since timestamp', 422);
    $db = brix_db();
    $events = [];
    $push = function (string $table, array $rows) use (&$events, $sinceSql) {
        foreach ($rows as $r) {
            $type = (strtotime((string)$r['created_at'] . ' UTC') >= strtotime($sinceSql . ' UTC')) ? 'INSERT' : 'UPDATE';
            $events[] = ['table' => $table, 'type' => $type, 'row' => $r];
        }
    };
    $st = $db->prepare('SELECT * FROM conversations WHERE workspace_id = ? AND updated_at >= ? ORDER BY updated_at ASC LIMIT 100');
    $st->execute([$c['wid'], $sinceSql]);
    $push('conversations', hydrate_conversations($st->fetchAll()));
    $st = $db->prepare('SELECT m.* FROM messages m JOIN conversations co ON co.id = m.conversation_id
                        WHERE co.workspace_id = ? AND m.created_at >= ? ORDER BY m.created_at ASC LIMIT 200');
    $st->execute([$c['wid'], $sinceSql]);
    $push('messages', array_map('m_message', $st->fetchAll()));
    $st = $db->prepare('SELECT * FROM visitors WHERE workspace_id = ? AND updated_at >= ? ORDER BY updated_at ASC LIMIT 100');
    $st->execute([$c['wid'], $sinceSql]);
    $push('visitors', array_map('m_visitor', $st->fetchAll()));
    brix_json(['events' => $events, 'server_time' => now_iso()]);
}

// ============================================================================
// Namespace aliases — table-name URLs map to the same handlers
// ============================================================================
function route_canned_responses(string $method, array $seg, $r1, $r2, $r3): void {
    route_canned($method, $seg, $r1, $r2, $r3);
}
function route_unanswered_questions(string $method, array $seg, $r1, $r2, $r3): void {
    route_unanswered($method, $seg, $r1, $r2, $r3);
}
function route_member_invites(string $method, array $seg, $r1, $r2, $r3): void {
    route_invites($method, $seg, $r1, $r2, $r3);
}
