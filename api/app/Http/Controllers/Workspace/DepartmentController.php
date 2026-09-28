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
use Illuminate\Support\Facades\DB;

/** Departments and their agent membership. */
class DepartmentController extends ApiController
{
    private const ROUTING = ['round-robin', 'least-busy', 'first-available'];

    private const OFFLINE = ['ticket', 'message', 'hide'];

    public function index(Request $request): JsonResponse
    {
        $c = $this->need('departments', 'read');
        $where = 'FROM departments WHERE workspace_id = ?';
        $params = [$c->wid];
        if (($v = $this->query($request, 'propertyId')) !== null) {
            $where .= ' AND property_id = ?';
            $params[] = Input::uuid($v, 'propertyId');
        }

        return Json::ok(Serialize::departments(Sql::all("SELECT * $where ORDER BY name ASC", $params)));
    }

    public function store(Request $request): JsonResponse
    {
        $c = $this->need('departments', 'write');
        $b = $this->body($request);
        $property = Sql::own('properties', $b['property_id'] ?? null, $c->wid);
        $id = isset($b['id']) ? Input::uuid($b['id']) : Sql::uuid();
        $name = Input::str(Input::required($b, 'name'), 'name', 255);
        DB::transaction(function () use ($c, $b, $property, $id, $name) {
            Sql::run(
                'INSERT INTO departments (id, workspace_id, property_id, name, description, routing_mode, hours_override, offline_behavior)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [$id, $c->wid, $property['id'], $name,
                    isset($b['description']) ? Input::str($b['description'], 'description') : '',
                    isset($b['routing_mode']) ? Input::in($b['routing_mode'], self::ROUTING, 'routing_mode') : 'round-robin',
                    isset($b['hours_override']) ? Json::encode($b['hours_override']) : null,
                    isset($b['offline_behavior']) ? Input::in($b['offline_behavior'], self::OFFLINE, 'offline_behavior') : 'message'],
            );
            self::syncAgents($c, $id, $b['agent_ids'] ?? []);
        });
        Activity::log($c, 'department.created', 'department', $id, ['name' => $name]);

        return Json::ok(self::serialized($c, $id), 201);
    }

    public function show(string $id): JsonResponse
    {
        $c = $this->need('departments', 'read');

        return Json::ok(self::serialized($c, $id));
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $c = $this->need('departments', 'write');
        $department = Sql::own('departments', $id, $c->wid);
        $b = $this->body($request);
        $sets = $params = [];
        if (array_key_exists('name', $b)) {
            $sets[] = 'name = ?';
            $params[] = Input::str($b['name'], 'name', 255);
        }
        if (array_key_exists('description', $b)) {
            $sets[] = 'description = ?';
            $params[] = Input::str($b['description'], 'description');
        }
        if (array_key_exists('routing_mode', $b)) {
            $sets[] = 'routing_mode = ?';
            $params[] = Input::in($b['routing_mode'], self::ROUTING, 'routing_mode');
        }
        if (array_key_exists('offline_behavior', $b)) {
            $sets[] = 'offline_behavior = ?';
            $params[] = Input::in($b['offline_behavior'], self::OFFLINE, 'offline_behavior');
        }
        if (array_key_exists('hours_override', $b)) {
            $sets[] = 'hours_override = ?';
            $params[] = $b['hours_override'] === null ? null : Json::encode($b['hours_override']);
        }
        if (array_key_exists('property_id', $b)) {
            $sets[] = 'property_id = ?';
            $params[] = Sql::ref('properties', $b['property_id'], 'property_id', $c->wid);
        }
        if ($sets) {
            $params[] = $department['id'];
            Sql::run('UPDATE departments SET '.implode(', ', $sets).' WHERE id = ?', $params);
        }
        if (array_key_exists('agent_ids', $b)) {
            self::syncAgents($c, $department['id'], $b['agent_ids']);
        }
        Activity::log($c, 'department.updated', 'department', $department['id']);

        return Json::ok(self::serialized($c, $department['id']));
    }

    public function destroy(string $id): JsonResponse
    {
        $c = $this->need('departments', 'write');
        $department = Sql::own('departments', $id, $c->wid);
        Sql::run('DELETE FROM departments WHERE id = ?', [$department['id']]);
        Activity::log($c, 'department.deleted', 'department', $department['id']);

        return Json::ok(['deleted' => true]);
    }

    /** Replace a department's agents; each must be a member of this workspace. */
    private static function syncAgents(Member $c, string $departmentId, mixed $agentIds): void
    {
        if (!is_array($agentIds)) {
            Json::fail('validation', 'agent_ids must be an array', 422);
        }
        $clean = [];
        foreach ($agentIds as $agentId) {
            $agentId = Input::uuid($agentId, 'agent_id');
            if (!Sql::one('SELECT id FROM members WHERE id = ? AND workspace_id = ?', [$agentId, $c->wid])) {
                Json::fail('not_found', 'Member not found', 404);
            }
            $clean[] = $agentId;
        }
        Sql::run('DELETE FROM department_members WHERE department_id = ?', [$departmentId]);
        foreach (array_unique($clean) as $agentId) {
            Sql::run('INSERT INTO department_members (department_id, member_id) VALUES (?, ?)', [$departmentId, $agentId]);
        }
    }

    private static function serialized(Member $c, string $id): array
    {
        return Serialize::departments([Sql::own('departments', $id, $c->wid)])[0];
    }
}
