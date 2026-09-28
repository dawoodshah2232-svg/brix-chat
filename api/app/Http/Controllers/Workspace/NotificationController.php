<?php

namespace App\Http\Controllers\Workspace;

use App\Support\Api\Input;
use App\Support\Api\Json;
use App\Support\Api\Serialize;
use App\Support\Api\Sql;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** In-app notifications: workspace-wide (member_id NULL) or addressed to one member. */
class NotificationController extends ApiController
{
    public function index(Request $request): JsonResponse
    {
        $c = $this->need('notifications', 'read');
        $where = 'FROM notifications WHERE workspace_id = ? AND (member_id IS NULL OR member_id = ?)';
        if (Input::bool($this->query($request, 'unreadOnly', false))) {
            $where .= ' AND `read` = 0';
        }
        [$items, $next] = Sql::page($where, [$c->wid, $c->mid], [['created_at', 'DESC'], ['id', 'DESC']],
            $this->query($request, 'cursor'), $this->query($request, 'limit', 50), [Serialize::class, 'notification']);

        return Json::items($items, $next);
    }

    public function store(Request $request): JsonResponse
    {
        $c = $this->need('notifications', 'write');
        $b = $this->body($request);
        $type = Input::str(Input::required($b, 'type'), 'type', 64);
        $title = Input::str(Input::required($b, 'title'), 'title', 255);
        $memberId = Sql::ref('members', $b['member_id'] ?? null, 'member_id', $c->wid);
        $id = isset($b['id']) ? Input::uuid($b['id']) : Sql::uuid();
        Sql::run('INSERT INTO notifications (id, workspace_id, member_id, type, title, body, link) VALUES (?, ?, ?, ?, ?, ?, ?)', [
            $id, $c->wid, $memberId, $type, $title,
            isset($b['body']) ? Input::str($b['body'], 'body') : '',
            isset($b['link']) ? Input::str($b['link'], 'link', 2048) : null,
        ]);

        return Json::ok(Serialize::notification(Sql::one('SELECT * FROM notifications WHERE id = ?', [$id])), 201);
    }

    public function readAll(): JsonResponse
    {
        $c = $this->need('notifications', 'read');
        $count = Sql::run('UPDATE notifications SET `read` = 1 WHERE workspace_id = ? AND (member_id IS NULL OR member_id = ?) AND `read` = 0',
            [$c->wid, $c->mid]);

        return Json::ok(['read' => $count]);
    }

    public function read(string $id): JsonResponse
    {
        $c = $this->need('notifications', 'read');
        $count = Sql::run('UPDATE notifications SET `read` = 1 WHERE id = ? AND workspace_id = ? AND (member_id IS NULL OR member_id = ?)',
            [Input::uuid($id), $c->wid, $c->mid]);
        if ($count === 0) {
            Json::fail('not_found', 'Notification not found', 404);
        }

        return Json::ok(['read' => true]);
    }

    /** The admin role only (owners are refused, as they always were). */
    public function destroy(string $id): JsonResponse
    {
        $c = $this->member();
        if ($c->role !== 'admin') {
            Json::fail('forbidden', 'Insufficient permissions', 403);
        }
        $count = Sql::run('DELETE FROM notifications WHERE id = ? AND workspace_id = ?', [Input::uuid($id), $c->wid]);
        if ($count === 0) {
            Json::fail('not_found', 'Notification not found', 404);
        }

        return Json::ok(['deleted' => true]);
    }
}
