<?php

namespace App\Http\Controllers\Workspace;

use App\Support\Api\Activity;
use App\Support\Api\Input;
use App\Support\Api\Json;
use App\Support\Api\Serialize;
use App\Support\Api\Sql;
use App\Support\Api\Webhooks;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * API keys, webhooks and webhook deliveries (admin/developer).
 * Raw API keys are returned once; only their SHA-256 is stored. Webhook
 * secrets are write-only (responses carry `secret_set`).
 */
class DeveloperController extends ApiController
{
    private const KEY_COLS = 'id, workspace_id, name, prefix, scopes, revoked, usage_count, last_used_at, created_at, updated_at';

    // ---- API keys ----------------------------------------------------------------

    public function keys(): JsonResponse
    {
        $c = $this->need('api_keys', 'read');

        return Json::items(array_map([Serialize::class, 'apiKey'],
            Sql::all('SELECT '.self::KEY_COLS.' FROM api_keys WHERE workspace_id = ? ORDER BY created_at DESC', [$c->wid])));
    }

    public function storeKey(Request $request): JsonResponse
    {
        $c = $this->need('api_keys', 'write');
        $b = $this->body($request);
        $name = Input::str(Input::required($b, 'name'), 'name', 255);
        $scopes = $b['scopes'] ?? [];
        if (!is_array($scopes)) {
            Json::fail('validation', 'scopes must be an array', 422);
        }
        $scopes = array_values(array_unique(array_map(fn ($s) => Input::str($s, 'scope', 64), $scopes)));
        $id = isset($b['id']) ? Input::uuid($b['id']) : Sql::uuid();
        $raw = self::newKey();
        Sql::run('INSERT INTO api_keys (id, workspace_id, name, prefix, key_hash, scopes) VALUES (?, ?, ?, ?, ?, ?)',
            [$id, $c->wid, $name, substr($raw, 0, 14), hash('sha256', $raw), Json::encode($scopes)]);
        Activity::log($c, 'api_key.created', 'api_key', $id, ['name' => $name]);

        return Json::ok(['record' => self::key($id), 'key' => $raw], 201);
    }

    public function showKey(string $id): JsonResponse
    {
        $c = $this->need('api_keys', 'read');
        $row = Sql::one('SELECT '.self::KEY_COLS.' FROM api_keys WHERE id = ? AND workspace_id = ?', [Input::uuid($id), $c->wid]);
        if ($row === null) {
            Json::fail('not_found', 'API key not found', 404);
        }

        return Json::ok(Serialize::apiKey($row));
    }

    /** Keys cannot be revealed after creation: always {key: null}. */
    public function revealKey(string $id): JsonResponse
    {
        $c = $this->need('api_keys', 'read');
        Sql::own('api_keys', $id, $c->wid, 'id');

        return Json::ok(['key' => null]);
    }

    /** New secret, same id / created_at / usage. */
    public function rotateKey(string $id): JsonResponse
    {
        $c = $this->need('api_keys', 'write');
        $row = Sql::own('api_keys', $id, $c->wid);
        $raw = self::newKey();
        DB::transaction(function () use ($c, $row, $raw) {
            Sql::run('DELETE FROM api_keys WHERE id = ?', [$row['id']]);
            Sql::run('INSERT INTO api_keys (id, workspace_id, name, prefix, key_hash, scopes, revoked, usage_count, last_used_at, created_at)
                      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)',
                [$row['id'], $c->wid, $row['name'], substr($raw, 0, 14), hash('sha256', $raw), $row['scopes'], (int) $row['usage_count'], $row['last_used_at'], $row['created_at']]);
        });
        Activity::log($c, 'api_key.rotated', 'api_key', $row['id']);

        return Json::ok(['record' => self::key($row['id']), 'key' => $raw]);
    }

    public function revokeKey(string $id): JsonResponse
    {
        $c = $this->need('api_keys', 'write');
        $row = Sql::own('api_keys', $id, $c->wid);
        Sql::run('UPDATE api_keys SET revoked = 1 WHERE id = ?', [$row['id']]);
        Activity::log($c, 'api_key.revoked', 'api_key', $row['id']);

        return Json::ok(['revoked' => true]);
    }

    public function destroyKey(string $id): JsonResponse
    {
        $c = $this->need('api_keys', 'write');
        $row = Sql::own('api_keys', $id, $c->wid);
        Sql::run('DELETE FROM api_keys WHERE id = ?', [$row['id']]);
        Activity::log($c, 'api_key.deleted', 'api_key', $row['id']);

        return Json::ok(['deleted' => true]);
    }

    private static function newKey(): string
    {
        return 'bk_live_'.bin2hex(random_bytes(24));
    }

    private static function key(string $id): array
    {
        return Serialize::apiKey(Sql::one('SELECT '.self::KEY_COLS.' FROM api_keys WHERE id = ?', [$id]));
    }

    // ---- webhooks ------------------------------------------------------------------

    public function webhooks(): JsonResponse
    {
        $c = $this->need('webhooks', 'read');

        return Json::items(array_map([Serialize::class, 'webhook'],
            Sql::all('SELECT * FROM webhooks WHERE workspace_id = ? ORDER BY created_at DESC', [$c->wid])));
    }

    /** Every webhook belongs to one website (property_id is required). */
    public function storeWebhook(Request $request): JsonResponse
    {
        $c = $this->need('webhooks', 'write');
        $b = $this->body($request);
        $url = self::url($b['url'] ?? null, true);
        $events = self::events($b['events'] ?? []);
        $propertyId = Sql::own('properties', Input::required($b, 'property_id'), $c->wid)['id'];
        $id = isset($b['id']) ? Input::uuid($b['id']) : Sql::uuid();
        Sql::run('INSERT INTO webhooks (id, workspace_id, property_id, url, secret, events, enabled, auto_disable) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
            $id, $c->wid, $propertyId, $url,
            array_key_exists('secret', $b) && $b['secret'] !== null ? Input::str($b['secret'], 'secret', 1024) : null,
            Json::encode($events),
            array_key_exists('enabled', $b) ? (Input::bool($b['enabled']) ? 1 : 0) : 1,
            array_key_exists('auto_disable', $b) ? (Input::bool($b['auto_disable']) ? 1 : 0) : 1,
        ]);
        Activity::log($c, 'webhook.created', 'webhook', $id, ['url' => $url]);

        return Json::ok(self::webhook($id), 201);
    }

    public function showWebhook(string $id): JsonResponse
    {
        $c = $this->need('webhooks', 'read');
        $row = Sql::one('SELECT * FROM webhooks WHERE id = ? AND workspace_id = ?', [Input::uuid($id), $c->wid]);
        if ($row === null) {
            Json::fail('not_found', 'Webhook not found', 404);
        }

        return Json::ok(Serialize::webhook($row));
    }

    /** Re-enabling resets the failure counter; `secret: null` clears the secret. */
    public function updateWebhook(Request $request, string $id): JsonResponse
    {
        $c = $this->need('webhooks', 'write');
        $hook = Sql::own('webhooks', $id, $c->wid);
        $b = $this->body($request);
        $sets = $params = [];
        if (array_key_exists('url', $b)) {
            $sets[] = 'url = ?';
            $params[] = self::url($b['url'], false);
        }
        if (array_key_exists('events', $b)) {
            $sets[] = 'events = ?';
            $params[] = Json::encode(self::events($b['events']));
        }
        if (array_key_exists('secret', $b)) {
            $sets[] = 'secret = ?';
            $params[] = $b['secret'] === null ? null : Input::str($b['secret'], 'secret', 1024);
        }
        if (array_key_exists('enabled', $b)) {
            $sets[] = 'enabled = ?';
            $params[] = Input::bool($b['enabled']) ? 1 : 0;
            if (Input::bool($b['enabled'])) {
                array_push($sets, 'consecutive_failures = 0', 'disabled_reason = NULL');
            }
        }
        if (array_key_exists('property_id', $b)) {
            $sets[] = 'property_id = ?';
            $params[] = Sql::ref('properties', $b['property_id'], 'property_id', $c->wid);
        }
        if (!$sets) {
            Json::fail('validation', 'Nothing to update', 422);
        }
        $params[] = $hook['id'];
        Sql::run('UPDATE webhooks SET '.implode(', ', $sets).' WHERE id = ?', $params);
        Activity::log($c, 'webhook.updated', 'webhook', $hook['id']);

        return Json::ok(self::webhook($hook['id']));
    }

    public function destroyWebhook(string $id): JsonResponse
    {
        $c = $this->need('webhooks', 'write');
        $hook = Sql::own('webhooks', $id, $c->wid);
        Sql::run('DELETE FROM webhooks WHERE id = ?', [$hook['id']]);
        Activity::log($c, 'webhook.deleted', 'webhook', $hook['id']);

        return Json::ok(['deleted' => true]);
    }

    /** Queue an event and immediately attempt due deliveries. */
    public function dispatch(Request $request, string $id): JsonResponse
    {
        $c = $this->need('webhooks', 'write');
        $hook = Sql::own('webhooks', $id, $c->wid);
        $b = $this->body($request);
        $event = Input::str(Input::required($b, 'event'), 'event', 128);
        if (!Webhooks::known($event)) {
            Json::fail('validation', "unknown webhook event '{$event}'", 422);
        }
        $propertyId = Sql::ref('properties', $b['property_id'] ?? null, 'property_id', $c->wid);
        $queued = Webhooks::enqueue($c->wid, $event, $propertyId, isset($b['data']) && is_array($b['data']) ? $b['data'] : [],
            isset($b['event_id']) ? Input::str($b['event_id'], 'event_id', 64) : null);
        $stats = Webhooks::flush($c->wid, null, 50);
        Activity::log($c, 'webhook.dispatched', 'webhook', $hook['id'], ['event' => $event]);

        return Json::ok(array_merge($queued, $stats));
    }

    public function webhookDeliveries(Request $request, string $id): JsonResponse
    {
        $c = $this->need('webhook_deliveries', 'read');
        $hook = Sql::own('webhooks', $id, $c->wid);
        [$items, $next] = Sql::page('FROM webhook_deliveries WHERE webhook_id = ? AND workspace_id = ?', [$hook['id'], $c->wid],
            [['created_at', 'DESC'], ['id', 'DESC']], $this->query($request, 'cursor'), $this->query($request, 'limit', 50), [Serialize::class, 'delivery']);

        return Json::items($items, $next);
    }

    public function deliveries(Request $request): JsonResponse
    {
        $c = $this->need('webhook_deliveries', 'read');
        $where = 'FROM webhook_deliveries WHERE workspace_id = ?';
        $params = [$c->wid];
        if (($v = $this->query($request, 'webhook_id')) !== null) {
            $where .= ' AND webhook_id = ?';
            $params[] = Input::uuid($v, 'webhook_id');
        }
        if (($v = $this->query($request, 'status')) !== null) {
            $where .= ' AND status = ?';
            $params[] = Input::in($v, ['pending', 'delivered', 'failed', 'dead', 'test'], 'status');
        }
        [$items, $next] = Sql::page($where, $params, [['created_at', 'DESC'], ['id', 'DESC']],
            $this->query($request, 'cursor'), $this->query($request, 'limit', 50), [Serialize::class, 'delivery']);

        return Json::items($items, $next);
    }

    public function delivery(string $id): JsonResponse
    {
        $c = $this->need('webhook_deliveries', 'read');
        $row = Sql::one('SELECT * FROM webhook_deliveries WHERE id = ? AND workspace_id = ?', [Input::uuid($id), $c->wid]);
        if ($row === null) {
            Json::fail('not_found', 'Delivery not found', 404);
        }

        return Json::ok(Serialize::delivery($row));
    }

    private static function url(mixed $value, bool $required): string
    {
        $url = Input::str($required ? Input::required(['url' => $value], 'url') : $value, 'url', 2048);
        if (!filter_var($url, FILTER_VALIDATE_URL) || !preg_match('#^https?://#i', $url)) {
            Json::fail('validation', 'url must be a valid http(s) URL', 422);
        }

        return $url;
    }

    private static function events(mixed $events): array
    {
        if (!is_array($events) || !$events) {
            Json::fail('validation', 'events must be a non-empty array', 422);
        }
        $events = array_values(array_unique(array_map(fn ($e) => Input::str($e, 'event', 128), $events)));
        foreach ($events as $event) {
            if (!Webhooks::known($event)) {
                Json::fail('validation', "unknown webhook event '{$event}'", 422);
            }
        }

        return $events;
    }

    private static function webhook(string $id): array
    {
        return Serialize::webhook(Sql::one('SELECT * FROM webhooks WHERE id = ?', [$id]));
    }
}
