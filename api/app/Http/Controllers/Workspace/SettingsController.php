<?php

namespace App\Http\Controllers\Workspace;

use App\Support\Api\Activity;
use App\Support\Api\Catalog;
use App\Support\Api\Input;
use App\Support\Api\Json;
use App\Support\Api\Serialize;
use App\Support\Api\Sql;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Integrations and the workspace audit log. */
class SettingsController extends ApiController
{
    /** The full registry, with any stored config/enabled state merged in. */
    public function integrations(): JsonResponse
    {
        $c = $this->need('integrations', 'read');
        $rows = [];
        foreach (Sql::all('SELECT * FROM integrations WHERE workspace_id = ?', [$c->wid]) as $row) {
            $rows[$row['provider']] = $row;
        }

        return Json::items(array_map(fn ($entry) => Serialize::integration($entry, $rows[$entry['provider']] ?? null), Catalog::integrations()));
    }

    /** Upsert on (workspace, provider). */
    public function updateIntegration(Request $request, string $provider): JsonResponse
    {
        $c = $this->need('integrations', 'write');
        $provider = Input::in($provider, array_column(Catalog::integrations(), 'provider'), 'provider');
        $entry = Catalog::integration($provider);
        $b = $this->body($request);
        $row = Sql::one('SELECT * FROM integrations WHERE workspace_id = ? AND provider = ?', [$c->wid, $provider]);
        $config = $row ? Json::decode($row['config'] ?? null, []) : [];
        if (array_key_exists('values', $b)) {
            if (!is_array($b['values'])) {
                Json::fail('validation', 'values must be an object', 422);
            }
            $config['values'] = $b['values'];
        }
        $enabled = array_key_exists('enabled', $b) ? (Input::bool($b['enabled']) ? 1 : 0) : ($row ? (int) $row['enabled'] : 0);
        if ($row) {
            $id = $row['id'];
            Sql::run('UPDATE integrations SET config = ?, enabled = ? WHERE id = ?', [Json::encode($config), $enabled, $id]);
        } else {
            $id = Sql::uuid();
            Sql::run('INSERT INTO integrations (id, workspace_id, provider, name, config, enabled) VALUES (?, ?, ?, ?, ?, ?)',
                [$id, $c->wid, $provider, $entry['name'], Json::encode($config), $enabled]);
        }
        Activity::log($c, 'integration.updated', 'integration', $id, ['provider' => $provider]);

        return Json::ok(Serialize::integration($entry, Sql::one('SELECT * FROM integrations WHERE id = ?', [$id])));
    }

    /** Admins only. Filters: actor (substring), action, from, to. */
    public function auditLog(Request $request): JsonResponse
    {
        $c = $this->need('audit_log', 'read');
        $where = 'FROM audit_log WHERE workspace_id = ?';
        $params = [$c->wid];
        if (($v = $this->query($request, 'actor')) !== null && $v !== '') {
            $where .= ' AND actor_name LIKE ?';
            $params[] = '%'.$v.'%';
        }
        if (($v = $this->query($request, 'action')) !== null && $v !== '') {
            $where .= ' AND action = ?';
            $params[] = $v;
        }
        if (($v = $this->query($request, 'from')) !== null && $v !== '') {
            $where .= ' AND created_at >= ?';
            $params[] = gmdate('Y-m-d H:i:s', strtotime((string) $v));
        }
        if (($v = $this->query($request, 'to')) !== null && $v !== '') {
            $where .= ' AND created_at <= ?';
            $params[] = gmdate('Y-m-d H:i:s', strtotime((string) $v));
        }
        [$items, $next] = Sql::page($where, $params, [['created_at', 'DESC'], ['id', 'DESC']],
            $this->query($request, 'cursor'), $this->query($request, 'limit', 50), [Serialize::class, 'audit']);

        return Json::items($items, $next);
    }

    /** Admin append; the caller is recorded as the actor. */
    public function appendAudit(Request $request): JsonResponse
    {
        $c = $this->need('audit_log', 'read');
        $b = $this->body($request);
        Activity::log($c, Input::str(Input::required($b, 'action'), 'action', 255),
            isset($b['entity']) ? Input::str($b['entity'], 'entity', 64) : '',
            isset($b['entity_id']) ? Input::str($b['entity_id'], 'entity_id', 255) : '',
            isset($b['meta']) && is_array($b['meta']) ? $b['meta'] : []);

        return Json::ok(['logged' => true], 201);
    }
}
