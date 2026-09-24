<?php
declare(strict_types=1);

// Webhook dispatcher — port of the webhook-dispatcher edge function.
// Shared by POST /webhooks/:id/dispatch and api/cron/webhook-retry.php.

const WEBHOOK_BACKOFF_SEC = [60, 600, 3600, 21600]; // 1m, 10m, 1h, 6h
const WEBHOOK_MAX_ATTEMPTS = 5;
const WEBHOOK_DISABLE_AFTER = 10;

// Enqueue one delivery per subscribed, enabled webhook.
function webhook_enqueue(string $wid, string $event, ?string $property_id, array $data, ?string $event_id = null): array {
    $db = brix_db();
    $sql = "SELECT id FROM webhooks WHERE workspace_id = ? AND enabled = 1
            AND JSON_CONTAINS(events, JSON_QUOTE(?))";
    $params = [$wid, $event];
    if ($property_id !== null) {
        $sql .= " AND (property_id = ? OR property_id IS NULL)";
        $params[] = $property_id;
    }
    $st = $db->prepare($sql);
    $st->execute($params);
    $hooks = $st->fetchAll();

    $event_id = $event_id ?: new_uuid();
    $enqueued = 0;
    $now = gmdate('Y-m-d H:i:s');
    foreach ($hooks as $h) {
        $st = $db->prepare('INSERT INTO webhook_deliveries
            (id, workspace_id, webhook_id, property_id, event, event_id, payload, status, next_attempt_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $st->execute([new_uuid(), $wid, $h['id'], $property_id, $event, $event_id, jenc($data), 'pending', $now]);
        $enqueued++;
    }
    return ['enqueued' => $enqueued, 'event' => $event, 'event_id' => $event_id];
}

// Flush due deliveries (claim with SKIP LOCKED semantics, then attempt each).
// $wid = null => service-level sweep across all workspaces (cron).
function webhook_flush(?string $wid = null, ?string $webhook_id = null, int $batch = 50): array {
    $db = brix_db();
    $stats = ['processed' => 0, 'delivered' => 0, 'failed' => 0, 'dead' => 0];

    $db->beginTransaction();
    try {
        $sql = "SELECT id FROM webhook_deliveries
                WHERE status IN ('pending','failed')
                  AND next_attempt_at IS NOT NULL
                  AND next_attempt_at <= UTC_TIMESTAMP()
                  AND (claimed_at IS NULL OR claimed_at < UTC_TIMESTAMP() - INTERVAL 10 MINUTE)";
        $params = [];
        if ($wid !== null) { $sql .= " AND workspace_id = ?"; $params[] = $wid; }
        if ($webhook_id !== null) { $sql .= " AND webhook_id = ?"; $params[] = $webhook_id; }
        $sql .= " ORDER BY next_attempt_at ASC LIMIT " . (int)$batch . " FOR UPDATE SKIP LOCKED";
        $st = $db->prepare($sql);
        $st->execute($params);
        $ids = array_column($st->fetchAll(), 'id');
        if ($ids) {
            $in = implode(',', array_fill(0, count($ids), '?'));
            $st = $db->prepare("UPDATE webhook_deliveries SET claimed_at = UTC_TIMESTAMP() WHERE id IN ($in)");
            $st->execute($ids);
        }
        $db->commit();
    } catch (Throwable $e) {
        $db->rollBack();
        throw $e;
    }

    foreach ($ids as $id) {
        $st = $db->prepare('SELECT * FROM webhook_deliveries WHERE id = ?');
        $st->execute([$id]);
        $d = $st->fetch();
        if (!$d) continue;
        $stats['processed']++;
        $outcome = webhook_attempt($d);
        $stats[$outcome]++;
    }
    return $stats;
}

// One delivery attempt. Returns 'delivered' | 'failed' | 'dead'.
function webhook_attempt(array $d): string {
    $db = brix_db();
    $st = $db->prepare('SELECT * FROM webhooks WHERE id = ? AND workspace_id = ?');
    $st->execute([$d['webhook_id'], $d['workspace_id']]);
    $wh = $st->fetch();

    if (!$wh || !(bool)$wh['enabled']) {
        mark_delivery($d['id'], 'dead', null, 'webhook missing or disabled', (int)$d['attempt_count'] + 1);
        return 'dead';
    }

    $payload = [
        'event' => $d['event'], 'event_id' => $d['event_id'],
        'property_id' => $d['property_id'], 'timestamp' => now_iso(),
        'data' => jdec($d['payload'] ?? null, new stdClass()),
    ];
    $raw = jenc($payload);
    $ts = (string)time();
    // Signature: hex(HMAC-SHA256(secret, "<unix_seconds>.<raw_json_body>"))
    $sig = !empty($wh['secret']) ? hash_hmac('sha256', $ts . '.' . $raw, $wh['secret']) : '';

    $attempt = (int)$d['attempt_count'] + 1;
    $ch = curl_init((string)$wh['url']);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $raw,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'X-Brix-Event: ' . $d['event'],
            'X-Brix-Event-Id: ' . $d['event_id'],
            'X-Brix-Timestamp: ' . $ts,
            'X-Brix-Delivery-Attempt: ' . $attempt,
            'X-Brix-Signature: ' . $sig,
        ],
    ]);
    $t0 = microtime(true);
    curl_exec($ch);
    $latency = (int)((microtime(true) - $t0) * 1000);
    $http = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);

    if ($err === '' && $http >= 200 && $http < 300) {
        $st = $db->prepare("UPDATE webhook_deliveries SET status='delivered', http_status=?, latency_ms=?,
            attempt_count=?, attempts=?, claimed_at=NULL, last_error=NULL, next_attempt_at=NULL WHERE id=?");
        $st->execute([$http, $latency, $attempt, $attempt, $d['id']]);
        $st = $db->prepare('UPDATE webhooks SET consecutive_failures = 0 WHERE id = ?');
        $st->execute([$wh['id']]);
        return 'delivered';
    }

    $dead = $attempt >= WEBHOOK_MAX_ATTEMPTS;
    $error = $err !== '' ? substr($err, 0, 500) : ('HTTP ' . $http);
    $next = null;
    if (!$dead) {
        $backoff = WEBHOOK_BACKOFF_SEC[min($attempt - 1, count(WEBHOOK_BACKOFF_SEC) - 1)];
        $next = gmdate('Y-m-d H:i:s', time() + $backoff);
    }
    mark_delivery($d['id'], $dead ? 'dead' : 'failed', $next, $error, $attempt, $http ?: null, $latency);

    $cf = (int)$wh['consecutive_failures'] + 1;
    if ($cf >= WEBHOOK_DISABLE_AFTER) {
        $st = $db->prepare("UPDATE webhooks SET consecutive_failures = ?, enabled = 0,
            disabled_reason = 'Auto-disabled after 10 consecutive failures' WHERE id = ?");
        $st->execute([$cf, $wh['id']]);
    } else {
        $st = $db->prepare('UPDATE webhooks SET consecutive_failures = ? WHERE id = ?');
        $st->execute([$cf, $wh['id']]);
    }
    return $dead ? 'dead' : 'failed';
}

function mark_delivery(string $id, string $status, ?string $next, string $error, int $attempt, ?int $http = null, ?int $latency = null): void {
    $db = brix_db();
    $st = $db->prepare("UPDATE webhook_deliveries SET status=?, next_attempt_at=?, last_error=?,
        attempt_count=?, attempts=?, claimed_at=NULL, http_status=?, latency_ms=? WHERE id=?");
    $st->execute([$status, $next, substr($error, 0, 500), $attempt, $attempt, $http, $latency, $id]);
}
