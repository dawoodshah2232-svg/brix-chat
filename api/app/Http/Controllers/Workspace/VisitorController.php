<?php

namespace App\Http\Controllers\Workspace;

use App\Support\Api\Input;
use App\Support\Api\Json;
use App\Support\Api\Serialize;
use App\Support\Api\Sql;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use stdClass;

/** Live website visitors, and the polling feed that stands in for realtime. */
class VisitorController extends ApiController
{
    public function index(Request $request): JsonResponse
    {
        $c = $this->need('visitors', 'read');
        $where = 'FROM visitors WHERE workspace_id = ?';
        $params = [$c->wid];
        if (($v = $this->query($request, 'property_id')) !== null) {
            $where .= ' AND property_id = ?';
            $params[] = Input::uuid($v, 'property_id');
        }
        if (($v = $this->query($request, 'online')) !== null) {
            $where .= ' AND online = ?';
            $params[] = Input::bool($v) ? 1 : 0;
        }
        [$items, $next] = Sql::page($where, $params, [['last_seen_at', 'DESC'], ['id', 'DESC']],
            $this->query($request, 'cursor'), $this->query($request, 'limit', 50), [Serialize::class, 'visitor']);

        return Json::items($items, $next);
    }

    public function store(Request $request): JsonResponse
    {
        $c = $this->need('visitors', 'write');
        $b = $this->body($request);
        $property = Sql::own('properties', $b['property_id'] ?? null, $c->wid);
        $contactId = Sql::ref('contacts', $b['contact_id'] ?? null, 'contact_id', $c->wid);
        $id = isset($b['id']) ? Input::uuid($b['id']) : Sql::uuid();
        Sql::run('INSERT INTO visitors (id, workspace_id, property_id, contact_id, name, email, page_url, pages, country, city, device, browser,
                  time_on_site_sec, typing_preview, online, custom_attributes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
            $id, $c->wid, $property['id'], $contactId,
            isset($b['name']) ? Input::str($b['name'], 'name', 255) : 'Guest',
            isset($b['email']) ? Input::email($b['email']) : '',
            isset($b['page_url']) ? Input::str($b['page_url'], 'page_url', 2048) : '',
            isset($b['pages']) ? Input::int($b['pages'], 'pages', 0) : 1,
            isset($b['country']) ? Input::str($b['country'], 'country', 128) : '',
            isset($b['city']) ? Input::str($b['city'], 'city', 128) : '',
            isset($b['device']) ? Input::str($b['device'], 'device', 255) : '',
            isset($b['browser']) ? Input::str($b['browser'], 'browser', 255) : '',
            isset($b['time_on_site_sec']) ? Input::int($b['time_on_site_sec'], 'time_on_site_sec', 0) : 0,
            isset($b['typing_preview']) ? Input::str($b['typing_preview'], 'typing_preview', 1024) : null,
            array_key_exists('online', $b) ? (Input::bool($b['online']) ? 1 : 0) : 1,
            Json::encode($b['custom_attributes'] ?? new stdClass()),
        ]);

        return Json::ok(Serialize::visitor(Sql::one('SELECT * FROM visitors WHERE id = ?', [$id])), 201);
    }

    public function show(string $id): JsonResponse
    {
        $c = $this->need('visitors', 'read');
        $row = Sql::one('SELECT * FROM visitors WHERE id = ? AND workspace_id = ?', [Input::uuid($id), $c->wid]);
        if ($row === null) {
            Json::fail('not_found', 'Visitor not found', 404);
        }

        return Json::ok(Serialize::visitor($row));
    }

    /** Any update also refreshes last_seen_at. */
    public function update(Request $request, string $id): JsonResponse
    {
        $c = $this->need('visitors', 'write');
        $id = Input::uuid($id);
        if (!Sql::one('SELECT id FROM visitors WHERE id = ? AND workspace_id = ?', [$id, $c->wid])) {
            Json::fail('not_found', 'Visitor not found', 404);
        }
        $b = $this->body($request);
        $sets = ['last_seen_at = UTC_TIMESTAMP()'];
        $params = [];
        foreach (['name' => 255, 'email' => 255, 'page_url' => 2048, 'country' => 128, 'city' => 128, 'device' => 255, 'browser' => 255] as $field => $max) {
            if (array_key_exists($field, $b)) {
                $sets[] = "$field = ?";
                $params[] = $field === 'email' ? Input::email($b[$field]) : Input::str($b[$field], $field, $max);
            }
        }
        foreach (['pages', 'time_on_site_sec'] as $field) {
            if (array_key_exists($field, $b)) {
                $sets[] = "$field = ?";
                $params[] = Input::int($b[$field], $field, 0);
            }
        }
        if (array_key_exists('typing_preview', $b)) {
            $sets[] = 'typing_preview = ?';
            $params[] = $b['typing_preview'] === null ? null : Input::str($b['typing_preview'], 'typing_preview', 1024);
        }
        if (array_key_exists('online', $b)) {
            $sets[] = 'online = ?';
            $params[] = Input::bool($b['online']) ? 1 : 0;
        }
        if (array_key_exists('custom_attributes', $b)) {
            $sets[] = 'custom_attributes = ?';
            $params[] = Json::encode($b['custom_attributes']);
        }
        $params[] = $id;
        Sql::run('UPDATE visitors SET '.implode(', ', $sets).' WHERE id = ?', $params);

        return Json::ok(Serialize::visitor(Sql::one('SELECT * FROM visitors WHERE id = ?', [$id])));
    }

    public function destroy(string $id): JsonResponse
    {
        $c = $this->need('visitors', 'write');
        if (Sql::run('DELETE FROM visitors WHERE id = ? AND workspace_id = ?', [Input::uuid($id), $c->wid]) === 0) {
            Json::fail('not_found', 'Visitor not found', 404);
        }

        return Json::ok(['deleted' => true]);
    }

    /**
     * GET /updates?since=ISO: conversations, messages and visitors changed since
     * the timestamp, as INSERT/UPDATE events. The dashboard polls this every few seconds.
     */
    public function updates(Request $request): JsonResponse
    {
        $c = $this->need('conversations', 'read');
        $since = $this->query($request, 'since');
        if (!$since) {
            Json::fail('validation', 'since (ISO-8601) is required', 422);
        }
        $sinceTs = strtotime((string) $since);
        if ($sinceTs === false) {
            Json::fail('validation', 'Invalid since timestamp', 422);
        }
        $sinceSql = gmdate('Y-m-d H:i:s', $sinceTs);

        $events = [];
        $push = function (string $table, array $rows) use (&$events, $sinceTs) {
            foreach ($rows as $row) {
                $events[] = ['table' => $table, 'type' => strtotime((string) $row['created_at']) >= $sinceTs ? 'INSERT' : 'UPDATE', 'row' => $row];
            }
        };
        $push('conversations', Serialize::conversations(
            Sql::all('SELECT * FROM conversations WHERE workspace_id = ? AND updated_at >= ? ORDER BY updated_at ASC LIMIT 100', [$c->wid, $sinceSql])));
        $push('messages', array_map([Serialize::class, 'message'],
            Sql::all('SELECT m.* FROM messages m JOIN conversations co ON co.id = m.conversation_id
                      WHERE co.workspace_id = ? AND m.created_at >= ? ORDER BY m.created_at ASC LIMIT 200', [$c->wid, $sinceSql])));
        $push('visitors', array_map([Serialize::class, 'visitor'],
            Sql::all('SELECT * FROM visitors WHERE workspace_id = ? AND updated_at >= ? ORDER BY updated_at ASC LIMIT 100', [$c->wid, $sinceSql])));

        return Json::ok(['events' => $events, 'server_time' => Json::now()]);
    }
}
