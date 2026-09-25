<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

/** Cross-workspace metrics for the platform console — one grouped query per metric. */
class WorkspaceStats
{
    /** @return array<string, array{chats_today:int, chats_month:int, open_chats:int, unassigned:int, messages_total:int, members:int, properties:int, csat:float|null, oldest_unassigned_at:string|null}> */
    public static function perWorkspace(): array
    {
        $today = now()->startOfDay();
        $month = now()->startOfMonth();

        $convs = DB::table('conversations')
            ->selectRaw('workspace_id,
                SUM(created_at >= ?) AS chats_today,
                SUM(created_at >= ?) AS chats_month,
                SUM(status = \'open\') AS open_chats,
                SUM(status = \'open\' AND assignee_id IS NULL) AS unassigned,
                MIN(CASE WHEN status = \'open\' AND assignee_id IS NULL THEN updated_at END) AS oldest_unassigned_at',
                [$today, $month])
            ->groupBy('workspace_id')->get()->keyBy('workspace_id');
        $messages = DB::table('messages')->selectRaw('workspace_id, COUNT(*) AS n')->groupBy('workspace_id')->pluck('n', 'workspace_id');
        $members = DB::table('members')->selectRaw('workspace_id, COUNT(*) AS n')->groupBy('workspace_id')->pluck('n', 'workspace_id');
        $properties = DB::table('properties')->selectRaw('workspace_id, COUNT(*) AS n')->groupBy('workspace_id')->pluck('n', 'workspace_id');
        $csat = DB::table('ratings')->where('kind', 'csat')->selectRaw('workspace_id, AVG(score) AS avg')->groupBy('workspace_id')->pluck('avg', 'workspace_id');

        $out = [];
        foreach (DB::table('workspaces')->pluck('id') as $id) {
            $c = $convs[$id] ?? null;
            $out[$id] = [
                'chats_today' => (int) ($c->chats_today ?? 0),
                'chats_month' => (int) ($c->chats_month ?? 0),
                'open_chats' => (int) ($c->open_chats ?? 0),
                'unassigned' => (int) ($c->unassigned ?? 0),
                'oldest_unassigned_at' => $c->oldest_unassigned_at ?? null,
                'messages_total' => (int) ($messages[$id] ?? 0),
                'members' => (int) ($members[$id] ?? 0),
                'properties' => (int) ($properties[$id] ?? 0),
                'csat' => isset($csat[$id]) ? round((float) $csat[$id], 2) : null,
            ];
        }

        return $out;
    }

    /** Chats created per day across all workspaces, oldest first. */
    public static function chatsPerDay(int $days = 7): array
    {
        $from = now()->subDays($days - 1)->startOfDay();
        $counts = DB::table('conversations')
            ->where('created_at', '>=', $from)
            ->selectRaw('DATE(created_at) AS d, COUNT(*) AS n')
            ->groupBy('d')->pluck('n', 'd');

        $out = [];
        for ($i = 0; $i < $days; $i++) {
            $day = $from->copy()->addDays($i)->toDateString();
            $out[] = ['date' => $day, 'count' => (int) ($counts[$day] ?? 0)];
        }

        return $out;
    }
}
