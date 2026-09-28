<?php

namespace App\Http\Controllers\Workspace;

use App\Support\Api\Activity;
use App\Support\Api\Input;
use App\Support\Api\Json;
use App\Support\Api\Serialize;
use App\Support\Api\Sql;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Saved replies (canned responses) and triggers / chatbot flows. */
class AutomationController extends ApiController
{
    // ---- saved replies -----------------------------------------------------------

    public function canned(Request $request): JsonResponse
    {
        $c = $this->need('canned_responses', 'read');
        $where = 'FROM canned_responses WHERE workspace_id = ?';
        $params = [$c->wid];
        if (($v = $this->query($request, 'category')) !== null && $v !== '') {
            $where .= ' AND category_id = ?';
            $params[] = Input::uuid($v, 'category');
        }
        if (($v = $this->query($request, 'propertyId')) !== null) {
            $where .= ' AND property_id = ?';
            $params[] = Input::uuid($v, 'propertyId');
        }
        [$items, $next] = Sql::page($where, $params, [['created_at', 'DESC'], ['id', 'DESC']],
            $this->query($request, 'cursor'), $this->query($request, 'limit', 50), [Serialize::class, 'canned']);

        return Json::items($items, $next);
    }

    public function storeCanned(Request $request): JsonResponse
    {
        $c = $this->need('canned_responses', 'write');
        $b = $this->body($request);
        $propertyId = Sql::ref('properties', $b['property_id'] ?? null, 'property_id', $c->wid);
        $categoryId = $this->cannedCategory($c->wid, $b['category_id'] ?? null);
        $id = isset($b['id']) ? Input::uuid($b['id']) : Sql::uuid();
        Sql::run('INSERT INTO canned_responses (id, workspace_id, property_id, category_id, shortcut, title, body, shared) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
            $id, $c->wid, $propertyId, $categoryId,
            isset($b['shortcut']) ? Input::str($b['shortcut'], 'shortcut', 64) : '',
            Input::str(Input::required($b, 'title'), 'title', 255),
            Input::str(Input::required($b, 'body'), 'body'),
            array_key_exists('shared', $b) ? (Input::bool($b['shared']) ? 1 : 0) : 1,
        ]);
        Activity::log($c, 'canned.created', 'canned_response', $id);

        return Json::ok(Serialize::canned(Sql::one('SELECT * FROM canned_responses WHERE id = ?', [$id])), 201);
    }

    public function showCanned(string $id): JsonResponse
    {
        $id = Input::uuid($id);
        $c = $this->need('canned_responses', 'read');

        return Json::ok(Serialize::canned($this->findCanned($id, $c->wid)));
    }

    public function updateCanned(Request $request, string $id): JsonResponse
    {
        $id = Input::uuid($id);
        $c = $this->need('canned_responses', 'write');
        $b = $this->body($request);
        $this->findCanned($id, $c->wid);
        $sets = $params = [];
        foreach (['shortcut' => 64, 'title' => 255, 'body' => 65535] as $field => $max) {
            if (array_key_exists($field, $b)) {
                $sets[] = "$field = ?";
                $params[] = Input::str($b[$field], $field, $max);
            }
        }
        if (array_key_exists('shared', $b)) {
            $sets[] = 'shared = ?';
            $params[] = Input::bool($b['shared']) ? 1 : 0;
        }
        if (array_key_exists('category_id', $b)) {
            $sets[] = 'category_id = ?';
            $params[] = $this->cannedCategory($c->wid, $b['category_id']);
        }
        if (!$sets) {
            Json::fail('validation', 'Nothing to update', 422);
        }
        $params[] = $id;
        Sql::run('UPDATE canned_responses SET '.implode(', ', $sets).' WHERE id = ?', $params);
        Activity::log($c, 'canned.updated', 'canned_response', $id);

        return Json::ok(Serialize::canned(Sql::one('SELECT * FROM canned_responses WHERE id = ?', [$id])));
    }

    public function destroyCanned(string $id): JsonResponse
    {
        $id = Input::uuid($id);
        $c = $this->need('canned_responses', 'write');
        if (Sql::run('DELETE FROM canned_responses WHERE id = ? AND workspace_id = ?', [$id, $c->wid]) === 0) {
            Json::fail('not_found', 'Canned response not found', 404);
        }
        Activity::log($c, 'canned.deleted', 'canned_response', $id);

        return Json::ok(['deleted' => true]);
    }

    private function findCanned(string $id, string $wid): array
    {
        return Sql::one('SELECT * FROM canned_responses WHERE id = ? AND workspace_id = ?', [$id, $wid])
            ?? Json::fail('not_found', 'Canned response not found', 404);
    }

    private function cannedCategory(string $wid, mixed $value): ?string
    {
        $id = Input::optUuid($value, 'category_id');
        if ($id && !Sql::one('SELECT id FROM canned_categories WHERE id = ? AND workspace_id = ?', [$id, $wid])) {
            Json::fail('not_found', 'Canned category not found', 404);
        }

        return $id;
    }

    // ---- triggers (also served as /flows) --------------------------------------

    public function triggers(Request $request): JsonResponse
    {
        $c = $this->need('triggers', 'read');
        $where = 'FROM triggers WHERE workspace_id = ?';
        $params = [$c->wid];
        if (($v = $this->query($request, 'propertyId')) !== null) {
            $where .= ' AND property_id = ?';
            $params[] = Input::uuid($v, 'propertyId');
        }
        if (($v = $this->query($request, 'kind')) !== null) {
            $where .= ' AND kind = ?';
            $params[] = Input::in($v, ['proactive', 'routing'], 'kind');
        }

        return Json::items(array_map([Serialize::class, 'trigger'], Sql::all("SELECT * $where ORDER BY created_at DESC", $params)));
    }

    public function storeTrigger(Request $request): JsonResponse
    {
        $c = $this->need('triggers', 'write');
        $b = $this->body($request);
        $propertyId = Sql::ref('properties', $b['property_id'] ?? null, 'property_id', $c->wid);
        $id = isset($b['id']) ? Input::uuid($b['id']) : Sql::uuid();
        $groups = $b['condition_groups'] ?? [];
        $actions = $b['actions'] ?? [];
        if (!is_array($groups) || !is_array($actions)) {
            Json::fail('validation', 'condition_groups/actions must be arrays', 422);
        }
        $name = Input::str(Input::required($b, 'name'), 'name', 255);
        $kind = Input::in($b['kind'] ?? 'proactive', ['proactive', 'routing'], 'kind');
        $event = isset($b['event']) ? Input::str($b['event'], 'event', 128) : 'chat.started';
        // Every trigger belongs to a website (triggers.property_id is NOT NULL).
        if ($propertyId === null) {
            Json::fail('validation', 'property_id is required', 422);
        }
        Sql::run('INSERT INTO triggers (id, workspace_id, property_id, name, kind, event, condition_groups, actions, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
            $id, $c->wid, $propertyId, $name, $kind, $event,
            Json::encode(array_values($groups)), Json::encode(array_values($actions)),
            array_key_exists('enabled', $b) ? (Input::bool($b['enabled']) ? 1 : 0) : 1,
        ]);
        Activity::log($c, 'trigger.created', 'trigger', $id);

        return Json::ok(Serialize::trigger(Sql::one('SELECT * FROM triggers WHERE id = ?', [$id])), 201);
    }

    public function showTrigger(string $id): JsonResponse
    {
        $id = Input::uuid($id);
        $c = $this->need('triggers', 'read');

        return Json::ok(Serialize::trigger($this->findTrigger($id, $c->wid)));
    }

    public function updateTrigger(Request $request, string $id): JsonResponse
    {
        $id = Input::uuid($id);
        $c = $this->need('triggers', 'write');
        $b = $this->body($request);
        $this->findTrigger($id, $c->wid);
        $sets = $params = [];
        if (array_key_exists('name', $b)) {
            $sets[] = 'name = ?';
            $params[] = Input::str($b['name'], 'name', 255);
        }
        if (array_key_exists('kind', $b)) {
            $sets[] = 'kind = ?';
            $params[] = Input::in($b['kind'], ['proactive', 'routing'], 'kind');
        }
        if (array_key_exists('event', $b)) {
            $sets[] = 'event = ?';
            $params[] = Input::str($b['event'], 'event', 128);
        }
        foreach (['condition_groups', 'actions'] as $field) {
            if (array_key_exists($field, $b)) {
                if (!is_array($b[$field])) {
                    Json::fail('validation', "$field must be an array", 422);
                }
                $sets[] = "$field = ?";
                $params[] = Json::encode(array_values($b[$field]));
            }
        }
        if (array_key_exists('enabled', $b)) {
            $sets[] = 'enabled = ?';
            $params[] = Input::bool($b['enabled']) ? 1 : 0;
        }
        if (!$sets) {
            Json::fail('validation', 'Nothing to update', 422);
        }
        $params[] = $id;
        Sql::run('UPDATE triggers SET '.implode(', ', $sets).' WHERE id = ?', $params);
        Activity::log($c, 'trigger.updated', 'trigger', $id);

        return Json::ok(Serialize::trigger(Sql::one('SELECT * FROM triggers WHERE id = ?', [$id])));
    }

    public function destroyTrigger(string $id): JsonResponse
    {
        $id = Input::uuid($id);
        $c = $this->need('triggers', 'write');
        if (Sql::run('DELETE FROM triggers WHERE id = ? AND workspace_id = ?', [$id, $c->wid]) === 0) {
            Json::fail('not_found', 'Trigger not found', 404);
        }
        Activity::log($c, 'trigger.deleted', 'trigger', $id);

        return Json::ok(['deleted' => true]);
    }

    private function findTrigger(string $id, string $wid): array
    {
        return Sql::one('SELECT * FROM triggers WHERE id = ? AND workspace_id = ?', [$id, $wid])
            ?? Json::fail('not_found', 'Trigger not found', 404);
    }
}
