<?php

namespace App\Http\Controllers\Workspace;

use App\Support\Api\Activity;
use App\Support\Api\Catalog;
use App\Support\Api\Input;
use App\Support\Api\Json;
use App\Support\Api\Serialize;
use App\Support\Api\Sql;
use App\Support\WorkspaceToken;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** The caller's workspace (owner/admin only), plus creating an extra workspace. */
class WorkspaceController extends ApiController
{
    public function show(): JsonResponse
    {
        $c = $this->need('workspaces', 'read');

        return Json::ok(['id' => $c->workspace['id'], 'name' => $c->workspace['name'], 'slug' => $c->workspace['slug']]);
    }

    public function update(Request $request): JsonResponse
    {
        $c = $this->need('workspaces', 'write');
        $b = $this->body($request);
        $sets = $params = [];
        if (array_key_exists('name', $b)) {
            $sets[] = 'name = ?';
            $params[] = Input::str($b['name'], 'name', 255);
        }
        if (array_key_exists('slug', $b)) {
            $slug = mb_strtolower(trim(Input::str($b['slug'], 'slug', 255)));
            if (!preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $slug)) {
                Json::fail('validation', 'Invalid slug', 422);
            }
            $sets[] = 'slug = ?';
            $params[] = $slug;
        }
        if (!$sets) {
            Json::fail('validation', 'Nothing to update', 422);
        }
        $params[] = $c->wid;
        Sql::run('UPDATE workspaces SET '.implode(', ', $sets).' WHERE id = ?', $params);
        Activity::log($c, 'workspace.updated', 'workspace', $c->wid);

        return Json::ok(Sql::one('SELECT id, name, slug FROM workspaces WHERE id = ?', [$c->wid]));
    }

    /** Destructive: every child row cascade-deletes. */
    public function destroy(): JsonResponse
    {
        $c = $this->need('workspaces', 'write');
        Sql::run('DELETE FROM workspaces WHERE id = ?', [$c->wid]);

        return Json::ok(['deleted' => true]);
    }

    /** Any member may create another workspace; they become its admin. */
    public function store(Request $request): JsonResponse
    {
        $this->member();
        $b = $this->body($request);
        $name = Input::str(Input::required($b, 'name'), 'name', 255);
        $display = Input::str(Input::required($b, 'display_name'), 'display_name', 60);
        $passcode = Input::passcode($b['passcode'] ?? null);

        $slug = Catalog::slug($name, 'workspace').'-'.substr(md5(random_bytes(16)), 0, 6);
        $wsId = Sql::uuid();
        $mid = Sql::uuid();
        $initials = Catalog::initials($display);
        DB::transaction(function () use ($wsId, $mid, $name, $slug, $display, $initials, $passcode) {
            Sql::run('INSERT INTO workspaces (id, name, slug) VALUES (?, ?, ?)', [$wsId, $name, $slug]);
            Sql::run(
                "INSERT INTO members (id, workspace_id, display_name, initials, color, role, status) VALUES (?, ?, ?, ?, ?, 'admin', 'online')",
                [$mid, $wsId, $display, $initials, '#4f46e5'],
            );
            Sql::run('INSERT INTO member_credentials (member_id, passcode_hash) VALUES (?, ?)', [$mid, password_hash($passcode, PASSWORD_BCRYPT)]);
        });

        $now = gmdate('Y-m-d H:i:s');
        $member = ['id' => $mid, 'workspace_id' => $wsId, 'display_name' => $display, 'initials' => $initials,
            'color' => '#4f46e5', 'role' => 'admin', 'email' => '', 'job_title' => '', 'avatar_url' => null,
            'status' => 'online', 'last_login_at' => $now, 'created_at' => $now, 'updated_at' => $now];
        Activity::audit($wsId, $member, 'workspace.created', 'workspace', $wsId, ['name' => $name]);

        return Json::ok([
            'token' => WorkspaceToken::issue($wsId, $mid),
            'workspace' => ['id' => $wsId, 'name' => $name, 'slug' => $slug],
            'member' => Serialize::member($member),
        ], 201);
    }
}
