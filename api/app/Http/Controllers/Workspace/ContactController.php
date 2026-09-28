<?php

namespace App\Http\Controllers\Workspace;

use App\Support\Api\Activity;
use App\Support\Api\Input;
use App\Support\Api\Json;
use App\Support\Api\Serialize;
use App\Support\Api\Sql;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Contacts and their timeline events. */
class ContactController extends ApiController
{
    public function index(Request $request): JsonResponse
    {
        $c = $this->need('contacts', 'read');
        $where = 'FROM contacts WHERE workspace_id = ?';
        $params = [$c->wid];
        if (($v = $this->query($request, 'propertyId')) !== null) {
            $where .= ' AND property_id = ?';
            $params[] = Input::uuid($v, 'propertyId');
        }
        if (($v = $this->query($request, 'tag')) !== null) {
            $where .= ' AND JSON_CONTAINS(tags, JSON_QUOTE(?))';
            $params[] = mb_strtolower(trim((string) $v));
        }
        if (($q = $this->query($request, 'q')) !== null && trim((string) $q) !== '') {
            $like = Input::like(trim((string) $q));
            $where .= " AND (name LIKE ? ESCAPE '\\\\' OR email LIKE ? ESCAPE '\\\\')";
            array_push($params, $like, $like);
        }
        [$items, $next] = Sql::page($where, $params, [['last_seen_at', 'DESC'], ['id', 'DESC']],
            $this->query($request, 'cursor'), $this->query($request, 'limit', 50), [Serialize::class, 'contact']);

        return Json::items($items, $next);
    }

    public function store(Request $request): JsonResponse
    {
        $c = $this->need('contacts', 'write');
        $b = $this->body($request);
        $name = Input::str(Input::required($b, 'name'), 'name', 255);
        $propertyId = Sql::ref('properties', $b['property_id'] ?? null, 'property_id', $c->wid);
        $id = isset($b['id']) ? Input::uuid($b['id']) : Sql::uuid();
        Sql::run(
            'INSERT INTO contacts (id, workspace_id, property_id, name, email, phone, country, tags, notes, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [$id, $c->wid, $propertyId, $name,
                isset($b['email']) ? Input::email($b['email']) : '',
                isset($b['phone']) ? Input::str($b['phone'], 'phone', 64) : '',
                isset($b['country']) ? Input::str($b['country'], 'country', 128) : '',
                Json::encode(Input::tags($b['tags'] ?? [])),
                isset($b['notes']) ? Input::str($b['notes'], 'notes') : '',
                isset($b['source']) ? Input::str($b['source'], 'source', 64) : 'api'],
        );
        Activity::log($c, 'contact.created', 'contact', $id, ['name' => $name]);

        return Json::ok(Serialize::contact(Sql::own('contacts', $id, $c->wid)), 201);
    }

    public function show(string $id): JsonResponse
    {
        $c = $this->need('contacts', 'read');

        return Json::ok(Serialize::contact(Sql::own('contacts', $id, $c->wid)));
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $c = $this->need('contacts', 'write');
        $row = Sql::own('contacts', $id, $c->wid);
        $b = $this->body($request);
        $sets = $params = [];
        foreach (['name' => 255, 'email' => 255, 'phone' => 64, 'country' => 128, 'notes' => 65535, 'source' => 64] as $field => $max) {
            if (array_key_exists($field, $b)) {
                $sets[] = "$field = ?";
                $params[] = $field === 'email' ? Input::email($b[$field]) : Input::str($b[$field], $field, $max);
            }
        }
        if (array_key_exists('tags', $b)) {
            $sets[] = 'tags = ?';
            $params[] = Json::encode(Input::tags($b['tags']));
        }
        if (array_key_exists('property_id', $b)) {
            $sets[] = 'property_id = ?';
            $params[] = Sql::ref('properties', $b['property_id'], 'property_id', $c->wid);
        }
        if (!$sets) {
            Json::fail('validation', 'Nothing to update', 422);
        }
        $sets[] = 'last_seen_at = UTC_TIMESTAMP()';
        $params[] = $row['id'];
        Sql::run('UPDATE contacts SET '.implode(', ', $sets).' WHERE id = ?', $params);
        Activity::log($c, 'contact.updated', 'contact', $row['id']);

        return Json::ok(Serialize::contact(Sql::own('contacts', $row['id'], $c->wid)));
    }

    public function destroy(string $id): JsonResponse
    {
        $c = $this->need('contacts', 'write');
        $row = Sql::own('contacts', $id, $c->wid);
        Sql::run('DELETE FROM contacts WHERE id = ?', [$row['id']]);
        Activity::log($c, 'contact.deleted', 'contact', $row['id']);

        return Json::ok(['deleted' => true]);
    }

    // ---- contact events --------------------------------------------------------

    public function events(Request $request): JsonResponse
    {
        $c = $this->need('contact_events', 'read');
        $where = 'FROM contact_events WHERE workspace_id = ?';
        $params = [$c->wid];
        if (($v = $this->query($request, 'contact_id')) !== null) {
            $where .= ' AND contact_id = ?';
            $params[] = Input::uuid($v, 'contact_id');
        }
        [$items, $next] = Sql::page($where, $params, [['occurred_at', 'DESC'], ['id', 'DESC']],
            $this->query($request, 'cursor'), $this->query($request, 'limit', 50), [Serialize::class, 'contactEvent']);

        return Json::items($items, $next);
    }

    public function storeEvent(Request $request): JsonResponse
    {
        $c = $this->need('contact_events', 'write');
        $b = $this->body($request);
        $contact = Sql::own('contacts', $b['contact_id'] ?? null, $c->wid);
        $id = isset($b['id']) ? Input::uuid($b['id']) : Sql::uuid();
        Sql::run('INSERT INTO contact_events (id, workspace_id, contact_id, kind, title, body, related_id) VALUES (?, ?, ?, ?, ?, ?, ?)', [
            $id, $c->wid, $contact['id'],
            Input::str(Input::required($b, 'kind'), 'kind', 64),
            Input::str(Input::required($b, 'title'), 'title', 255),
            isset($b['body']) ? Input::str($b['body'], 'body') : '',
            Input::optUuid($b['related_id'] ?? null, 'related_id'),
        ]);

        return Json::ok(Serialize::contactEvent(Sql::one('SELECT * FROM contact_events WHERE id = ?', [$id])), 201);
    }

    public function showEvent(string $id): JsonResponse
    {
        $c = $this->need('contact_events', 'read');

        return Json::ok(Serialize::contactEvent(Sql::own('contact_events', $id, $c->wid)));
    }

    public function updateEvent(Request $request, string $id): JsonResponse
    {
        $c = $this->need('contact_events', 'write');
        $row = Sql::own('contact_events', $id, $c->wid);
        $b = $this->body($request);
        $sets = $params = [];
        foreach (['title' => 255, 'body' => 65535, 'kind' => 64] as $field => $max) {
            if (array_key_exists($field, $b)) {
                $sets[] = "$field = ?";
                $params[] = Input::str($b[$field], $field, $max);
            }
        }
        if (!$sets) {
            Json::fail('validation', 'Nothing to update', 422);
        }
        $params[] = $row['id'];
        Sql::run('UPDATE contact_events SET '.implode(', ', $sets).' WHERE id = ?', $params);

        return Json::ok(Serialize::contactEvent(Sql::one('SELECT * FROM contact_events WHERE id = ?', [$row['id']])));
    }

    public function destroyEvent(string $id): JsonResponse
    {
        $c = $this->need('contact_events', 'write');
        $row = Sql::own('contact_events', $id, $c->wid);
        Sql::run('DELETE FROM contact_events WHERE id = ?', [$row['id']]);

        return Json::ok(['deleted' => true]);
    }
}
