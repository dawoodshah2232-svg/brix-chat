<?php

namespace App\Support\Api;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use stdClass;
use Throwable;

/**
 * Outbound webhooks: queue one delivery per subscribed webhook, then attempt
 * due deliveries with back-off. Used by the API and the brix:webhooks-retry command.
 *
 * Signature: X-Brix-Signature = hex(HMAC-SHA256(secret, "<unix_seconds>.<raw_json_body>")).
 */
final class Webhooks
{
    private const BACKOFF_SECONDS = [60, 600, 3600, 21600]; // 1m, 10m, 1h, 6h

    private const MAX_ATTEMPTS = 5;

    private const DISABLE_AFTER = 10;

    public static function known(string $event): bool
    {
        return array_key_exists($event, Catalog::WEBHOOK_EVENTS);
    }

    /** Queue $event for every enabled webhook subscribed to it. */
    public static function enqueue(string $wid, string $event, ?string $propertyId, array $data, ?string $eventId = null): array
    {
        $sql = 'SELECT id FROM webhooks WHERE workspace_id = ? AND enabled = 1 AND JSON_CONTAINS(events, JSON_QUOTE(?))';
        $params = [$wid, $event];
        if ($propertyId !== null) {
            $sql .= ' AND (property_id = ? OR property_id IS NULL)';
            $params[] = $propertyId;
        }
        $eventId = $eventId ?: Sql::uuid();
        $now = gmdate('Y-m-d H:i:s');
        $hooks = Sql::all($sql, $params);
        foreach ($hooks as $hook) {
            Sql::run(
                'INSERT INTO webhook_deliveries (id, workspace_id, webhook_id, property_id, event, event_id, payload, status, next_attempt_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [Sql::uuid(), $wid, $hook['id'], $propertyId, $event, $eventId, Json::encode($data), 'pending', $now],
            );
        }

        return ['enqueued' => count($hooks), 'event' => $event, 'event_id' => $eventId];
    }

    /**
     * Attempt due deliveries. $wid = null sweeps every workspace (cron).
     * Rows are claimed inside a short transaction so concurrent sweeps skip them.
     */
    public static function flush(?string $wid = null, ?string $webhookId = null, int $batch = 50): array
    {
        $stats = ['processed' => 0, 'delivered' => 0, 'failed' => 0, 'dead' => 0];

        $ids = DB::transaction(function () use ($wid, $webhookId, $batch) {
            $sql = "SELECT id FROM webhook_deliveries
                    WHERE status IN ('pending','failed')
                      AND next_attempt_at IS NOT NULL
                      AND next_attempt_at <= UTC_TIMESTAMP()
                      AND (claimed_at IS NULL OR claimed_at < UTC_TIMESTAMP() - INTERVAL 10 MINUTE)";
            $params = [];
            if ($wid !== null) {
                $sql .= ' AND workspace_id = ?';
                $params[] = $wid;
            }
            if ($webhookId !== null) {
                $sql .= ' AND webhook_id = ?';
                $params[] = $webhookId;
            }
            $ids = array_column(Sql::all($sql.' ORDER BY next_attempt_at ASC LIMIT '.(int) $batch.' FOR UPDATE', $params), 'id');
            if ($ids) {
                Sql::run('UPDATE webhook_deliveries SET claimed_at = UTC_TIMESTAMP() WHERE id IN ('.Sql::marks($ids).')', $ids);
            }

            return $ids;
        });

        foreach ($ids as $id) {
            $delivery = Sql::one('SELECT * FROM webhook_deliveries WHERE id = ?', [$id]);
            if ($delivery === null) {
                continue;
            }
            $stats['processed']++;
            $stats[self::attempt($delivery)]++;
        }

        return $stats;
    }

    /** One delivery attempt: 'delivered' | 'failed' | 'dead'. */
    private static function attempt(array $d): string
    {
        $hook = Sql::one('SELECT * FROM webhooks WHERE id = ? AND workspace_id = ?', [$d['webhook_id'], $d['workspace_id']]);
        $attempt = (int) $d['attempt_count'] + 1;
        if (!$hook || !(bool) $hook['enabled']) {
            self::mark($d['id'], 'dead', null, 'webhook missing or disabled', $attempt);

            return 'dead';
        }

        $raw = Json::encode([
            'event' => $d['event'], 'event_id' => $d['event_id'],
            'property_id' => $d['property_id'], 'timestamp' => Json::now(),
            'data' => Json::decode($d['payload'] ?? null, new stdClass()),
        ]);
        $ts = (string) time();
        $signature = !empty($hook['secret']) ? hash_hmac('sha256', $ts.'.'.$raw, $hook['secret']) : '';

        $http = 0;
        $error = '';
        $started = microtime(true);
        try {
            $response = Http::timeout(10)->connectTimeout(5)
                ->withHeaders([
                    'X-Brix-Event' => $d['event'],
                    'X-Brix-Event-Id' => $d['event_id'],
                    'X-Brix-Timestamp' => $ts,
                    'X-Brix-Delivery-Attempt' => (string) $attempt,
                    'X-Brix-Signature' => $signature,
                ])
                ->withBody($raw, 'application/json')
                ->post((string) $hook['url']);
            $http = $response->status();
        } catch (Throwable $e) {
            $error = $e->getMessage();
        }
        $latency = (int) ((microtime(true) - $started) * 1000);

        if ($error === '' && $http >= 200 && $http < 300) {
            Sql::run(
                "UPDATE webhook_deliveries SET status='delivered', http_status=?, latency_ms=?, attempt_count=?, attempts=?,
                 claimed_at=NULL, last_error=NULL, next_attempt_at=NULL WHERE id=?",
                [$http, $latency, $attempt, $attempt, $d['id']],
            );
            Sql::run('UPDATE webhooks SET consecutive_failures = 0 WHERE id = ?', [$hook['id']]);

            return 'delivered';
        }

        $dead = $attempt >= self::MAX_ATTEMPTS;
        $next = $dead ? null : gmdate('Y-m-d H:i:s', time() + self::BACKOFF_SECONDS[min($attempt - 1, count(self::BACKOFF_SECONDS) - 1)]);
        self::mark($d['id'], $dead ? 'dead' : 'failed', $next, $error !== '' ? substr($error, 0, 500) : 'HTTP '.$http, $attempt, $http ?: null, $latency);

        $failures = (int) $hook['consecutive_failures'] + 1;
        if ($failures >= self::DISABLE_AFTER) {
            Sql::run(
                "UPDATE webhooks SET consecutive_failures = ?, enabled = 0, disabled_reason = 'Auto-disabled after 10 consecutive failures' WHERE id = ?",
                [$failures, $hook['id']],
            );
        } else {
            Sql::run('UPDATE webhooks SET consecutive_failures = ? WHERE id = ?', [$failures, $hook['id']]);
        }

        return $dead ? 'dead' : 'failed';
    }

    private static function mark(string $id, string $status, ?string $next, string $error, int $attempt, ?int $http = null, ?int $latency = null): void
    {
        Sql::run(
            'UPDATE webhook_deliveries SET status=?, next_attempt_at=?, last_error=?, attempt_count=?, attempts=?, claimed_at=NULL, http_status=?, latency_ms=? WHERE id=?',
            [$status, $next, substr($error, 0, 500), $attempt, $attempt, $http, $latency, $id],
        );
    }
}
