<?php

namespace App\Http\Controllers\Workspace;

use App\Support\Api\Input;
use App\Support\Api\Json;
use App\Support\Api\Sql;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Dashboard metrics (any member). */
class MetricsController extends ApiController
{
    /** GET /metrics/{kind}; other methods and unknown kinds 404 after auth, like the rest of the API. */
    public function __invoke(Request $request, string $kind): JsonResponse
    {
        $c = $this->need('tickets', 'read');
        if (!$request->isMethod('GET')) {
            Json::fail('not_found', 'Unknown endpoint', 404);
        }

        return match ($kind) {
            'chats' => $this->chats($request, $c->wid),
            'response-times' => $this->responseTimes($c->wid),
            'satisfaction' => $this->satisfaction($c->wid),
            'tickets' => $this->tickets($c->wid),
            default => Json::fail('not_found', 'Unknown endpoint', 404),
        };
    }

    /** Daily chat totals and misses for the last N days (oldest first). */
    private function chats(Request $request, string $wid): JsonResponse
    {
        $days = Input::int($this->query($request, 'days', 30), 'days', 1, 90);
        $byDay = [];
        $rows = Sql::all('SELECT DATE(created_at) d, status, COUNT(*) n FROM conversations WHERE workspace_id = ? AND created_at >= ? GROUP BY d, status',
            [$wid, gmdate('Y-m-d H:i:s', time() - $days * 86400)]);
        foreach ($rows as $r) {
            $day = (string) $r['d'];
            $byDay[$day]['total'] = ($byDay[$day]['total'] ?? 0) + (int) $r['n'];
            if ($r['status'] === 'missed') {
                $byDay[$day]['missed'] = ($byDay[$day]['missed'] ?? 0) + (int) $r['n'];
            }
        }
        $out = [];
        for ($i = $days - 1; $i >= 0; $i--) {
            $day = gmdate('Y-m-d', time() - $i * 86400);
            $out[] = ['date' => $day, 'total' => $byDay[$day]['total'] ?? 0, 'missed' => $byDay[$day]['missed'] ?? 0];
        }

        return Json::ok($out);
    }

    /** First visitor message -> first agent/AI reply, per conversation. */
    private function responseTimes(string $wid): JsonResponse
    {
        $rows = Sql::all("SELECT m.conversation_id, m.sender, m.created_at FROM messages m JOIN conversations co ON co.id = m.conversation_id
                          WHERE co.workspace_id = ? AND m.sender IN ('visitor','agent','ai') ORDER BY m.conversation_id, m.created_at ASC, m.id ASC", [$wid]);
        $first = [];
        foreach ($rows as $m) {
            $id = $m['conversation_id'];
            if (!isset($first[$id]['visitor']) && $m['sender'] === 'visitor') {
                $first[$id]['visitor'] = strtotime($m['created_at'].' UTC');
            }
            if (!isset($first[$id]['reply']) && in_array($m['sender'], ['agent', 'ai'], true) && isset($first[$id]['visitor'])) {
                $first[$id]['reply'] = strtotime($m['created_at'].' UTC');
            }
        }
        $samples = [];
        foreach ($first as $f) {
            if (isset($f['visitor'], $f['reply']) && $f['reply'] >= $f['visitor']) {
                $samples[] = $f['reply'] - $f['visitor'];
            }
        }
        sort($samples);
        $n = count($samples);

        return Json::ok([
            'samples' => $n,
            'avg_first_response_sec' => $n ? round(array_sum($samples) / $n) : 0,
            'p95_first_response_sec' => $n ? $samples[min($n - 1, (int) ceil($n * 0.95) - 1)] : 0,
        ]);
    }

    private function satisfaction(string $wid): JsonResponse
    {
        $distribution = [1 => 0, 2 => 0, 3 => 0, 4 => 0, 5 => 0];
        $rated = $positive = 0;
        foreach (Sql::all('SELECT rating, COUNT(*) n FROM conversations WHERE workspace_id = ? AND rating IS NOT NULL GROUP BY rating', [$wid]) as $r) {
            $distribution[(int) $r['rating']] = (int) $r['n'];
            $rated += (int) $r['n'];
            if ((int) $r['rating'] >= 4) {
                $positive += (int) $r['n'];
            }
        }

        return Json::ok(['rated' => $rated, 'distribution' => $distribution, 'csat_pct' => $rated ? round(100 * $positive / $rated, 1) : 0]);
    }

    private function tickets(string $wid): JsonResponse
    {
        $out = ['new' => 0, 'open' => 0, 'resolved' => 0];
        foreach (Sql::all('SELECT status, COUNT(*) n FROM tickets WHERE workspace_id = ? GROUP BY status', [$wid]) as $r) {
            $out[$r['status']] = (int) $r['n'];
        }

        return Json::ok($out);
    }
}
