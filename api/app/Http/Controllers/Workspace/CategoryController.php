<?php

namespace App\Http\Controllers\Workspace;

use App\Support\Api\Activity;
use App\Support\Api\Input;
use App\Support\Api\Json;
use App\Support\Api\Member;
use App\Support\Api\Serialize;
use App\Support\Api\Sql;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Categories for the knowledge base, saved replies and tickets. One API
 * over three tables; `scope` picks the table.
 */
class CategoryController extends ApiController
{
    /** scope => table */
    private const TABLES = ['kb' => 'kb_categories', 'canned' => 'canned_categories', 'tickets' => 'ticket_categories'];

    public function index(Request $request): JsonResponse
    {
        $c = $this->need('kb_categories', 'read');
        $scope = Input::in($this->query($request, 'scope', 'kb'), array_keys(self::TABLES), 'scope');
        $table = self::TABLES[$scope];
        $where = "FROM `$table` WHERE workspace_id = ?";
        $params = [$c->wid];
        if (($v = $this->query($request, 'propertyId')) !== null && $v !== '') {
            $where .= ' AND (property_id = ? OR property_id IS NULL)';
            $params[] = Input::uuid($v, 'propertyId');
        }
        $rows = Sql::all("SELECT * $where ORDER BY position ASC, name ASC", $params);

        return Json::items(array_map(fn ($r) => Serialize::category($r, $scope), $rows));
    }

    public function store(Request $request): JsonResponse
    {
        $c = $this->need('kb_categories', 'write');
        $b = $this->body($request);
        $scope = Input::in(Input::required($b, 'scope'), array_keys(self::TABLES), 'scope');
        $table = self::TABLES[$scope];
        $propertyId = Sql::ref('properties', $b['property_id'] ?? null, 'property_id', $c->wid);
        $id = isset($b['id']) ? Input::uuid($b['id']) : Sql::uuid();
        $name = Input::str(Input::required($b, 'name'), 'name', 255);
        Sql::run("INSERT INTO `$table` (id, workspace_id, property_id, name, color, position) VALUES (?, ?, ?, ?, ?, ?)", [
            $id, $c->wid, $propertyId, $name,
            isset($b['color']) ? Input::str($b['color'], 'color', 32) : '#4f46e5',
            isset($b['position']) ? Input::int($b['position'], 'position', 0, 100000) : 0,
        ]);
        Activity::log($c, 'category.created', 'category', $id, ['scope' => $scope]);

        return Json::ok(Serialize::category(Sql::one("SELECT * FROM `$table` WHERE id = ?", [$id]), $scope), 201);
    }

    public function show(string $id): JsonResponse
    {
        $id = Input::uuid($id);
        $c = $this->need('kb_categories', 'read');
        [$scope, $row] = self::find($c, $id, array_keys(self::TABLES));

        return Json::ok(Serialize::category($row, $scope));
    }

    /** An explicit `scope` narrows the lookup to that table. */
    public function update(Request $request, string $id): JsonResponse
    {
        $id = Input::uuid($id);
        $c = $this->need('kb_categories', 'write');
        $b = $this->body($request);
        $scope = isset($b['scope']) ? Input::in($b['scope'], array_keys(self::TABLES), 'scope') : null;
        [$found] = self::find($c, $id, $scope ? [$scope] : array_keys(self::TABLES));
        $table = self::TABLES[$found];

        $sets = $params = [];
        if (array_key_exists('name', $b)) {
            $sets[] = 'name = ?';
            $params[] = Input::str($b['name'], 'name', 255);
        }
        if (array_key_exists('color', $b)) {
            $sets[] = 'color = ?';
            $params[] = Input::str($b['color'], 'color', 32);
        }
        if (array_key_exists('position', $b)) {
            $sets[] = 'position = ?';
            $params[] = Input::int($b['position'], 'position', 0, 100000);
        }
        if (!$sets) {
            Json::fail('validation', 'Nothing to update', 422);
        }
        $params[] = $id;
        Sql::run("UPDATE `$table` SET ".implode(', ', $sets).' WHERE id = ?', $params);
        Activity::log($c, 'category.updated', 'category', $id);

        return Json::ok(Serialize::category(Sql::one("SELECT * FROM `$table` WHERE id = ?", [$id]), $found));
    }

    public function destroy(string $id): JsonResponse
    {
        $id = Input::uuid($id);
        $c = $this->need('kb_categories', 'write');
        [$scope] = self::find($c, $id, array_keys(self::TABLES));
        Sql::run('DELETE FROM `'.self::TABLES[$scope].'` WHERE id = ?', [$id]);
        Activity::log($c, 'category.deleted', 'category', $id);

        return Json::ok(['deleted' => true]);
    }

    /** First matching row across the given scopes: [scope, row], or 404. */
    private static function find(Member $c, string $id, array $scopes): array
    {
        foreach ($scopes as $scope) {
            $row = Sql::one('SELECT * FROM `'.self::TABLES[$scope].'` WHERE id = ? AND workspace_id = ?', [$id, $c->wid]);
            if ($row) {
                return [$scope, $row];
            }
        }
        Json::fail('not_found', 'Category not found', 404);
    }
}
