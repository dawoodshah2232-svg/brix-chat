<?php

namespace App\Http\Controllers\Workspace;

use App\Support\Api\Activity;
use App\Support\Api\Catalog;
use App\Support\Api\Input;
use App\Support\Api\Json;
use App\Support\Api\Member;
use App\Support\Api\Serialize;
use App\Support\Api\Sql;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Team members of the workspace. */
class MemberController extends ApiController
{
    public function index(): JsonResponse
    {
        $c = $this->need('members', 'read');

        return Json::ok(Serialize::members(Sql::all('SELECT * FROM members WHERE workspace_id = ? ORDER BY display_name ASC', [$c->wid])));
    }

    public function store(Request $request): JsonResponse
    {
        $c = $this->need('members', 'write');
        $b = $this->body($request);
        $display = Input::str(Input::required($b, 'display_name'), 'display_name', 255);
        $role = Input::in($b['role'] ?? 'agent', Catalog::ROLES, 'role');
        $passcode = Input::passcode($b['passcode'] ?? null);
        self::assertUniqueName($c, $display);
        $id = isset($b['id']) ? Input::uuid($b['id']) : Sql::uuid();
        $count = (int) Sql::one('SELECT COUNT(*) n FROM members WHERE workspace_id = ?', [$c->wid])['n'];
        $color = Catalog::MEMBER_COLORS[$count % count(Catalog::MEMBER_COLORS)];

        DB::transaction(function () use ($c, $b, $id, $display, $role, $passcode, $color) {
            Sql::run('INSERT INTO members (id, workspace_id, display_name, initials, color, role, email, job_title, avatar_url, status)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
                $id, $c->wid, $display, Catalog::initials($display),
                isset($b['color']) ? Input::str($b['color'], 'color', 32) : $color, $role,
                isset($b['email']) ? Input::email($b['email']) : '',
                isset($b['job_title']) ? Input::str($b['job_title'], 'job_title', 255) : '',
                isset($b['avatar_data_url']) ? Input::str($b['avatar_data_url'], 'avatar_data_url') : null,
                'offline',
            ]);
            Sql::run('INSERT INTO member_credentials (member_id, passcode_hash) VALUES (?, ?)', [$id, password_hash($passcode, PASSWORD_BCRYPT)]);
            if (array_key_exists('department_ids', $b)) {
                self::syncDepartments($c, $id, $b['department_ids']);
            }
        });
        Activity::log($c, 'member.created', 'member', $id);

        return Json::ok(self::serialized($c, $id), 201);
    }

    public function show(string $id): JsonResponse
    {
        $c = $this->need('members', 'read');

        return Json::ok(self::serialized($c, $id));
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $c = $this->need('members', 'write');
        $b = $this->body($request);
        $row = Sql::own('members', $id, $c->wid);
        $sets = $params = [];
        if (array_key_exists('display_name', $b)) {
            $display = Input::str($b['display_name'], 'display_name', 255);
            if ($display === '') {
                Json::fail('validation', 'display_name must not be empty', 422);
            }
            self::assertUniqueName($c, $display, $row['id']);
            array_push($sets, 'display_name = ?', 'initials = ?');
            array_push($params, $display, Catalog::initials($display));
        }
        foreach (['color' => 32, 'job_title' => 255] as $field => $max) {
            if (array_key_exists($field, $b)) {
                $sets[] = "$field = ?";
                $params[] = Input::str($b[$field], $field, $max);
            }
        }
        if (array_key_exists('avatar_data_url', $b)) {
            $sets[] = 'avatar_url = ?';
            $params[] = $b['avatar_data_url'] === null ? null : Input::str($b['avatar_data_url'], 'avatar_data_url');
        }
        if (array_key_exists('email', $b)) {
            $sets[] = 'email = ?';
            $params[] = Input::email($b['email']);
        }
        if (array_key_exists('role', $b)) {
            $sets[] = 'role = ?';
            $params[] = Input::in($b['role'], Catalog::ROLES, 'role');
        }
        if (array_key_exists('status', $b)) {
            $sets[] = 'status = ?';
            $params[] = Input::in($b['status'], ['online', 'away', 'offline'], 'status');
        }
        if (array_key_exists('online', $b)) {
            $sets[] = 'status = ?';
            $params[] = Input::bool($b['online']) ? 'online' : 'offline';
        }
        if ($sets) {
            $params[] = $row['id'];
            Sql::run('UPDATE members SET '.implode(', ', $sets).' WHERE id = ?', $params);
        }
        if (array_key_exists('department_ids', $b)) {
            self::syncDepartments($c, $row['id'], $b['department_ids']);
        }
        Activity::log($c, 'member.updated', 'member', $row['id']);

        return Json::ok(self::serialized($c, $row['id']));
    }

    public function destroy(string $id): JsonResponse
    {
        $c = $this->need('members', 'write');
        $row = Sql::own('members', $id, $c->wid);
        if ((int) Sql::one('SELECT COUNT(*) n FROM members WHERE workspace_id = ?', [$c->wid])['n'] <= 1) {
            Json::fail('validation', 'Cannot remove the last member', 422);
        }
        Sql::run('DELETE FROM members WHERE id = ?', [$row['id']]);
        Activity::log($c, 'member.removed', 'member', $row['id']);

        return Json::ok(['deleted' => true]);
    }

    /** Self or admin. */
    public function passcode(Request $request, string $id): JsonResponse
    {
        $c = $this->member();
        $row = Sql::own('members', $id, $c->wid);
        $c->selfOrAdmin($row['id']);
        $hash = password_hash(Input::passcode($this->body($request)['passcode'] ?? null), PASSWORD_BCRYPT);
        if (Sql::one('SELECT member_id FROM member_credentials WHERE member_id = ?', [$row['id']])) {
            Sql::run('UPDATE member_credentials SET passcode_hash = ? WHERE member_id = ?', [$hash, $row['id']]);
        } else {
            Sql::run('INSERT INTO member_credentials (member_id, passcode_hash) VALUES (?, ?)', [$row['id'], $hash]);
        }
        Activity::log($c, 'member.passcode_changed', 'member', $row['id']);

        return Json::ok(['updated' => true]);
    }

    /** Self or admin. */
    public function status(Request $request, string $id): JsonResponse
    {
        $c = $this->member();
        $row = Sql::own('members', $id, $c->wid);
        $c->selfOrAdmin($row['id']);
        $status = Input::in($this->body($request)['status'] ?? '', ['online', 'away', 'offline'], 'status');
        Sql::run('UPDATE members SET status = ? WHERE id = ?', [$status, $row['id']]);

        return Json::ok(['status' => $status]);
    }

    /** Refresh last login and mark online. */
    public function touchLogin(string $id): JsonResponse
    {
        $c = $this->need('members', 'read');
        $row = Sql::own('members', $id, $c->wid);
        Sql::run("UPDATE members SET last_login_at = UTC_TIMESTAMP(), status = 'online' WHERE id = ?", [$row['id']]);

        return Json::ok(self::serialized($c, $row['id']));
    }

    /** Display names are unique per workspace (case-insensitive). */
    public static function assertUniqueName(Member $c, string $display, ?string $exceptId = null): void
    {
        $sql = 'SELECT id FROM members WHERE workspace_id = ? AND LOWER(display_name) = LOWER(?)';
        $params = [$c->wid, $display];
        if ($exceptId !== null) {
            $sql .= ' AND id <> ?';
            $params[] = $exceptId;
        }
        if (Sql::one($sql, $params)) {
            Json::fail('conflict', 'A member with this name already exists', 409);
        }
    }

    /** Replace a member's departments; each must belong to this workspace. */
    private static function syncDepartments(Member $c, string $memberId, mixed $departmentIds): void
    {
        if (!is_array($departmentIds)) {
            Json::fail('validation', 'department_ids must be an array', 422);
        }
        $clean = [];
        foreach ($departmentIds as $departmentId) {
            $departmentId = Input::uuid($departmentId, 'department_id');
            $row = Sql::one('SELECT id, workspace_id FROM departments WHERE id = ?', [$departmentId]);
            if (!$row || $row['workspace_id'] !== $c->wid) {
                Json::fail('not_found', 'Department not found', 404);
            }
            $clean[] = $departmentId;
        }
        Sql::run('DELETE FROM department_members WHERE member_id = ?', [$memberId]);
        foreach (array_unique($clean) as $departmentId) {
            Sql::run('INSERT INTO department_members (department_id, member_id) VALUES (?, ?)', [$departmentId, $memberId]);
        }
    }

    private static function serialized(Member $c, string $id): array
    {
        return Serialize::members([Sql::own('members', $id, $c->wid)])[0];
    }
}
