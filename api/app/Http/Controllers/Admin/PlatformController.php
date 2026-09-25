<?php

namespace App\Http\Controllers\Admin;

use App\Support\PlatformAudit;
use App\Support\PlatformSettings;
use App\Support\WorkspaceStats;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Read-mostly platform views: overview, properties, audit, system, settings. */
class PlatformController extends AdminController
{
    public function overview(): JsonResponse
    {
        $stats = WorkspaceStats::perWorkspace();
        $workspaces = DB::table('workspaces')->select('id', 'name', 'slug', 'plan_id', 'status')->orderBy('name')->get();
        $plans = DB::table('plans')->orderBy('sort_order')->get(['id', 'name', 'price']);
        $price = $plans->pluck('price', 'id');

        $clients = $workspaces->map(fn ($w) => (array) $w + ['stats' => $stats[$w->id]]);
        $csats = array_filter(array_column($stats, 'csat'), fn ($v) => $v !== null);
        $oldest = array_filter(array_column($stats, 'oldest_unassigned_at'));

        return $this->ok([
            'totals' => [
                'clients' => $workspaces->count(),
                'active' => $workspaces->where('status', 'active')->count(),
                'trial' => $workspaces->where('status', 'trial')->count(),
                'suspended' => $workspaces->where('status', 'suspended')->count(),
                'chats_today' => array_sum(array_column($stats, 'chats_today')),
                'messages_total' => array_sum(array_column($stats, 'messages_total')),
                'open_chats' => array_sum(array_column($stats, 'open_chats')),
                'unassigned' => array_sum(array_column($stats, 'unassigned')),
                'csat' => $csats ? round(array_sum($csats) / count($csats), 2) : null,
                'oldest_unassigned_at' => $oldest ? min($oldest) : null,
                'mrr' => (float) $workspaces->where('status', '!=', 'suspended')->sum(fn ($w) => (float) ($price[$w->plan_id] ?? 0)),
            ],
            'chats_per_day' => WorkspaceStats::chatsPerDay(7),
            'plans' => $plans->map(fn ($p) => ['id' => $p->id, 'name' => $p->name, 'clients' => $workspaces->where('plan_id', $p->id)->count()]),
            'clients' => $clients,
        ]);
    }

    public function properties(): JsonResponse
    {
        $rows = DB::table('properties as p')
            ->join('workspaces as w', 'w.id', '=', 'p.workspace_id')
            ->orderBy('w.name')->orderBy('p.name')
            ->get(['p.id', 'p.name', 'p.domain', 'p.public_key', 'p.created_at', 'w.id as workspace_id', 'w.name as workspace_name', 'w.slug as workspace_slug']);

        return $this->ok($rows);
    }

    public function audit(Request $request): JsonResponse
    {
        $limit = min(max((int) $request->query('limit', 300), 1), 1000);

        $platform = DB::table('platform_audit')
            ->selectRaw("CONCAT('p', id) AS id, NULL AS workspace_id, 'platform' AS workspace_slug, 'Platform (operator)' AS workspace_name, actor, action, entity, entity_id, meta, created_at")
            ->orderByDesc('created_at')->limit($limit);
        $workspace = DB::table('audit_log as a')
            ->join('workspaces as w', 'w.id', '=', 'a.workspace_id')
            ->selectRaw('a.id, a.workspace_id, w.slug AS workspace_slug, w.name AS workspace_name, a.actor_name AS actor, a.action, a.entity, a.entity_id, a.meta, a.created_at')
            ->orderByDesc('a.created_at')->limit($limit);

        $rows = DB::query()->fromSub($platform->unionAll($workspace), 'x')
            ->orderByDesc('created_at')->limit($limit)->get()
            ->map(function ($r) {
                $r->meta = $r->meta ? json_decode($r->meta, true) : (object) [];

                return $r;
            });

        return $this->ok($rows);
    }

    public function system(): JsonResponse
    {
        $tables = ['workspaces', 'members', 'properties', 'conversations', 'messages', 'contacts', 'tickets', 'audit_log', 'webhook_deliveries'];
        $counts = [];
        foreach ($tables as $t) {
            $counts[$t] = DB::table($t)->count();
        }
        $size = DB::selectOne('SELECT COALESCE(SUM(data_length + index_length), 0) AS bytes FROM information_schema.tables WHERE table_schema = DATABASE()');

        return $this->ok([
            'php' => PHP_VERSION,
            'laravel' => app()->version(),
            'database' => DB::selectOne('SELECT VERSION() AS v')->v,
            'database_bytes' => (int) $size->bytes,
            'environment' => app()->environment(),
            'debug' => (bool) config('app.debug'),
            'counts' => $counts,
            'failed_webhooks' => DB::table('webhook_deliveries')->where('status', 'failed')->count(),
        ]);
    }

    public function settings(): JsonResponse
    {
        return $this->ok(PlatformSettings::all());
    }

    public function updateSettings(Request $request): JsonResponse
    {
        $input = $request->validate([
            'platform_name' => ['sometimes', 'string', 'min:1', 'max:80'],
            'logo_data_url' => ['sometimes', 'nullable', 'string', 'max:700000', 'starts_with:data:image/'],
            'session_timeout_mins' => ['sometimes', 'integer', 'min:5', 'max:1440'],
            'passcode_min_length' => ['sometimes', 'integer', 'min:4', 'max:12'],
            'allow_signup' => ['sometimes', 'boolean'],
        ]);
        $settings = PlatformSettings::put($input);
        PlatformAudit::log($request->user(), 'settings.updated', 'settings', '', ['keys' => array_keys($input)]);

        return $this->ok($settings);
    }
}
