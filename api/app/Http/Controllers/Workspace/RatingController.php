<?php

namespace App\Http\Controllers\Workspace;

use App\Support\Api\Activity;
use App\Support\Api\Input;
use App\Support\Api\Json;
use App\Support\Api\Serialize;
use App\Support\Api\Sql;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** CSAT (1-5) and NPS (0-10) ratings. */
class RatingController extends ApiController
{
    public function index(Request $request): JsonResponse
    {
        $c = $this->need('ratings', 'read');
        $where = 'FROM ratings WHERE workspace_id = ?';
        $params = [$c->wid];
        if (($v = $this->query($request, 'property_id')) !== null) {
            $where .= ' AND property_id = ?';
            $params[] = Input::uuid($v, 'property_id');
        }
        if (($v = $this->query($request, 'agent_id')) !== null) {
            $where .= ' AND member_id = ?';
            $params[] = Input::uuid($v, 'agent_id');
        }
        if (($v = $this->query($request, 'kind')) !== null) {
            $where .= ' AND kind = ?';
            $params[] = Input::in($v, ['csat', 'nps'], 'kind');
        }
        // from/to are epoch milliseconds.
        if (($v = $this->query($request, 'from')) !== null) {
            $where .= ' AND created_at >= ?';
            $params[] = gmdate('Y-m-d H:i:s', (int) ((int) $v / 1000));
        }
        if (($v = $this->query($request, 'to')) !== null) {
            $where .= ' AND created_at <= ?';
            $params[] = gmdate('Y-m-d H:i:s', (int) ((int) $v / 1000));
        }
        [$items, $next] = Sql::page($where, $params, [['created_at', 'DESC'], ['id', 'DESC']],
            $this->query($request, 'cursor'), $this->query($request, 'limit', 50), [Serialize::class, 'rating']);

        return Json::items($items, $next);
    }

    /** Low scores (CSAT <= 2, NPS <= 6) raise a workspace notification. */
    public function store(Request $request): JsonResponse
    {
        $c = $this->need('ratings', 'write');
        $b = $this->body($request);
        $kind = Input::in(Input::required($b, 'kind'), ['csat', 'nps'], 'kind');
        $score = Input::int(Input::required($b, 'score'), 'score', $kind === 'csat' ? 1 : 0, $kind === 'csat' ? 5 : 10);
        $propertyId = Sql::ref('properties', $b['property_id'] ?? null, 'property_id', $c->wid);
        $conversationId = Sql::ref('conversations', $b['conversation_id'] ?? null, 'conversation_id', $c->wid);
        $agentId = Sql::ref('members', $b['agent_id'] ?? null, 'agent_id', $c->wid);
        $id = isset($b['id']) ? Input::uuid($b['id']) : Sql::uuid();
        Sql::run('INSERT INTO ratings (id, workspace_id, property_id, conversation_id, member_id, kind, score, comment) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [$id, $c->wid, $propertyId, $conversationId, $agentId, $kind, $score, isset($b['comment']) ? Input::str($b['comment'], 'comment') : '']);
        if (($kind === 'csat' && $score <= 2) || ($kind === 'nps' && $score <= 6)) {
            $comment = $b['comment'] ?? '';
            Activity::notify($c->wid, 'system', 'New low rating', "A $kind rating of $score was submitted".($comment ? ': '.$comment : ''));
        }

        return Json::ok(Serialize::rating(Sql::one('SELECT * FROM ratings WHERE id = ?', [$id])), 201);
    }

    public function summary(Request $request): JsonResponse
    {
        $c = $this->need('ratings', 'read');
        $propertyId = Input::uuid($this->query($request, 'property_id'), 'property_id');
        $days = Input::int($this->query($request, 'days', 30), 'days', 1, 365);
        $rows = Sql::all('SELECT kind, score, created_at FROM ratings WHERE workspace_id = ? AND property_id = ? AND created_at >= ?',
            [$c->wid, $propertyId, gmdate('Y-m-d H:i:s', time() - $days * 86400)]);

        $csat = array_filter($rows, fn ($r) => $r['kind'] === 'csat');
        $nps = array_filter($rows, fn ($r) => $r['kind'] === 'nps');
        $distribution = [1 => 0, 2 => 0, 3 => 0, 4 => 0, 5 => 0];
        foreach ($csat as $r) {
            $distribution[(int) $r['score']]++;
        }
        $promoters = count(array_filter($nps, fn ($r) => (int) $r['score'] >= 9));
        $detractors = count(array_filter($nps, fn ($r) => (int) $r['score'] <= 6));
        $daily = [];
        foreach ($rows as $r) {
            $day = substr((string) $r['created_at'], 0, 10);
            $daily[$day]['total'] = ($daily[$day]['total'] ?? 0) + 1;
            $daily[$day]['sum'] = ($daily[$day]['sum'] ?? 0) + (int) $r['score'];
        }
        ksort($daily);

        return Json::ok([
            'csat_avg' => round($csat ? array_sum(array_column($csat, 'score')) / count($csat) : 0, 2),
            'csat_pct' => round($csat ? 100 * count(array_filter($csat, fn ($r) => (int) $r['score'] >= 4)) / count($csat) : 0, 1),
            'rated' => count($csat), 'distribution' => $distribution,
            'nps_score' => round($nps ? 100 * ($promoters - $detractors) / count($nps) : 0, 1),
            'promoters' => $promoters, 'passives' => count($nps) - $promoters - $detractors, 'detractors' => $detractors,
            'daily' => array_map(fn ($day, $v) => ['date' => $day, 'avg' => round($v['sum'] / $v['total'], 2), 'count' => $v['total']],
                array_keys($daily), array_values($daily)),
        ]);
    }
}
