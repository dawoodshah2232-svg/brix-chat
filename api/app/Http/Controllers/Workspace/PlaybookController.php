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
use stdClass;

/** Saved inbox views, plays (one-click macros) and conversion goals. */
class PlaybookController extends ApiController
{
    // ---- saved views -----------------------------------------------------------

    public function views(): JsonResponse
    {
        $c = $this->need('saved_views', 'read');

        return Json::items(array_map([Serialize::class, 'view'],
            Sql::all('SELECT * FROM saved_views WHERE workspace_id = ? ORDER BY created_at DESC', [$c->wid])));
    }

    public function storeView(Request $request): JsonResponse
    {
        $c = $this->need('saved_views', 'write');
        $b = $this->body($request);
        $id = isset($b['id']) ? Input::uuid($b['id']) : Sql::uuid();
        Sql::run('INSERT INTO saved_views (id, workspace_id, member_id, name, filters) VALUES (?, ?, ?, ?, ?)',
            [$id, $c->wid, null, Input::str(Input::required($b, 'name'), 'name', 255), Json::encode($b['filters'] ?? new stdClass())]);

        return Json::ok(Serialize::view(Sql::one('SELECT * FROM saved_views WHERE id = ?', [$id])), 201);
    }

    public function destroyView(string $id): JsonResponse
    {
        $c = $this->need('saved_views', 'write');
        $row = Sql::own('saved_views', $id, $c->wid);
        Sql::run('DELETE FROM saved_views WHERE id = ?', [$row['id']]);

        return Json::ok(['deleted' => true]);
    }

    // ---- plays -----------------------------------------------------------------

    public function plays(): JsonResponse
    {
        $c = $this->need('plays', 'read');

        return Json::items(array_map([Serialize::class, 'play'],
            Sql::all('SELECT * FROM plays WHERE workspace_id = ? ORDER BY created_at DESC', [$c->wid])));
    }

    public function storePlay(Request $request): JsonResponse
    {
        $c = $this->need('plays', 'write');
        $b = $this->body($request);
        $steps = $b['steps'] ?? [];
        if (!is_array($steps) || !$steps) {
            Json::fail('validation', 'steps must be a non-empty array', 422);
        }
        $id = isset($b['id']) ? Input::uuid($b['id']) : Sql::uuid();
        Sql::run('INSERT INTO plays (id, workspace_id, name, steps) VALUES (?, ?, ?, ?)',
            [$id, $c->wid, Input::str(Input::required($b, 'name'), 'name', 255), Json::encode(array_values($steps))]);

        return Json::ok(Serialize::play(Sql::one('SELECT * FROM plays WHERE id = ?', [$id])), 201);
    }

    public function destroyPlay(string $id): JsonResponse
    {
        $c = $this->need('plays', 'write');
        $row = Sql::own('plays', $id, $c->wid);
        Sql::run('DELETE FROM plays WHERE id = ?', [$row['id']]);

        return Json::ok(['deleted' => true]);
    }

    /** Apply a play's steps (reply, tag, assign, priority, note) to a conversation, in order. */
    public function runPlay(Request $request, string $id): JsonResponse
    {
        $c = $this->need('plays', 'write');
        $play = Sql::own('plays', $id, $c->wid);
        $b = $this->body($request);
        $conv = Sql::own('conversations', $b['conversation_id'] ?? null, $c->wid);
        $applied = [];
        foreach (Json::decode($play['steps'] ?? null, []) as $step) {
            $value = $step['value'] ?? '';
            switch ($step['kind'] ?? '') {
                case 'reply':
                    Sql::run("INSERT INTO messages (id, workspace_id, conversation_id, sender, kind, text, metadata) VALUES (?, ?, ?, 'agent', 'text', ?, ?)",
                        [Sql::uuid(), $c->wid, $conv['id'], (string) $value, Json::encode(['play' => $play['name']])]);
                    $applied[] = 'Sent reply';
                    break;
                case 'tag':
                    $tags = array_unique(array_merge(Json::decode($conv['tags'] ?? null, []), Input::tags(is_array($value) ? $value : [$value])));
                    Sql::run('UPDATE conversations SET tags = ? WHERE id = ?', [Json::encode(array_values($tags)), $conv['id']]);
                    $applied[] = 'Applied tag(s)';
                    break;
                case 'assign':
                    $applied[] = self::assign($c->wid, $conv['id'], (string) $value);
                    break;
                case 'priority':
                    $priority = in_array($value, Catalog::PRIORITIES, true) ? $value : 'medium';
                    Sql::run('UPDATE conversations SET priority = ? WHERE id = ?', [$priority, $conv['id']]);
                    $applied[] = 'Set priority '.$priority;
                    break;
                case 'note':
                    Sql::run('INSERT INTO conversation_notes (id, workspace_id, conversation_id, author_member_id, author_name, text) VALUES (?, ?, ?, ?, ?, ?)',
                        [Sql::uuid(), $c->wid, $conv['id'], $c->mid, $c->name(), (string) $value]);
                    $applied[] = 'Added note';
                    break;
                default:
                    $applied[] = 'Skipped unknown step';
            }
            $conv = Sql::own('conversations', $conv['id'], $c->wid);
        }
        Activity::log($c, 'play.run', 'play', $play['id'], ['conversation_id' => $conv['id']]);

        return Json::ok(['applied' => $applied]);
    }

    /** "assign" steps name a department first, then a member (case-insensitive). */
    private static function assign(string $wid, string $conversationId, string $name): string
    {
        $department = Sql::one('SELECT id FROM departments WHERE workspace_id = ? AND LOWER(name) = LOWER(?) LIMIT 1', [$wid, $name]);
        if ($department) {
            Sql::run('UPDATE conversations SET department_id = ? WHERE id = ?', [$department['id'], $conversationId]);

            return 'Assigned to department '.$department['id'];
        }
        $member = Sql::one('SELECT id, display_name FROM members WHERE workspace_id = ? AND LOWER(display_name) = LOWER(?) LIMIT 1', [$wid, $name]);
        if ($member) {
            Sql::run('UPDATE conversations SET assignee_id = ? WHERE id = ?', [$member['id'], $conversationId]);

            return 'Assigned to '.$member['display_name'];
        }

        return 'Assign skipped (no match)';
    }

    // ---- goals -----------------------------------------------------------------

    public function goals(): JsonResponse
    {
        $c = $this->need('goals', 'read');

        return Json::items(array_map([Serialize::class, 'goal'],
            Sql::all('SELECT * FROM goals WHERE workspace_id = ? ORDER BY created_at DESC', [$c->wid])));
    }

    public function storeGoal(Request $request): JsonResponse
    {
        $c = $this->need('goals', 'write');
        $b = $this->body($request);
        $id = isset($b['id']) ? Input::uuid($b['id']) : Sql::uuid();
        $propertyId = Sql::ref('properties', $b['property_id'] ?? null, 'property_id', $c->wid);
        Sql::run('INSERT INTO goals (id, workspace_id, property_id, name, event, revenue) VALUES (?, ?, ?, ?, ?, ?)', [
            $id, $c->wid, $propertyId,
            Input::str(Input::required($b, 'name'), 'name', 255),
            Input::str(Input::required($b, 'event'), 'event', 255),
            isset($b['revenue']) ? Input::int($b['revenue'], 'revenue', 0) : 0,
        ]);
        Activity::log($c, 'goal.created', 'goal', $id);

        return Json::ok(Serialize::goal(Sql::one('SELECT * FROM goals WHERE id = ?', [$id])), 201);
    }

    public function destroyGoal(string $id): JsonResponse
    {
        $c = $this->need('goals', 'write');
        $row = Sql::own('goals', $id, $c->wid);
        Sql::run('DELETE FROM goals WHERE id = ?', [$row['id']]);

        return Json::ok(['deleted' => true]);
    }

    /** Record a completion; value defaults to the goal's revenue. */
    public function trackGoal(Request $request, string $id): JsonResponse
    {
        $c = $this->need('goal_events', 'write');
        $goal = Sql::own('goals', $id, $c->wid);
        $b = $this->body($request);
        $conversationId = Sql::ref('conversations', $b['conversation_id'] ?? null, 'conversation_id', $c->wid);
        $value = isset($b['value']) ? (float) $b['value'] : (float) $goal['revenue'];
        $eventId = Sql::uuid();
        Sql::run('INSERT INTO goal_events (id, workspace_id, goal_id, conversation_id, value) VALUES (?, ?, ?, ?, ?)',
            [$eventId, $c->wid, $goal['id'], $conversationId, $value]);
        Activity::log($c, 'goal.tracked', 'goal', $goal['id'], ['value' => $value]);
        Activity::notify($c->wid, 'system', 'Goal completed', $goal['name'].' ('.$value.')');

        return Json::ok(['id' => $eventId, 'goal_id' => $goal['id'], 'value' => $value]);
    }

    /** Visitors -> chats -> goal completions over the last N days. */
    public function funnel(Request $request): JsonResponse
    {
        $c = $this->need('goals', 'read');
        $days = Input::int($this->query($request, 'days', 30), 'days', 1, 365);
        $cutoff = gmdate('Y-m-d H:i:s', time() - $days * 86400);
        $visitors = [];
        $chats = 0;
        foreach (Sql::all('SELECT visitor_name, visitor_email FROM conversations WHERE workspace_id = ? AND created_at >= ?', [$c->wid, $cutoff]) as $r) {
            $chats++;
            $key = mb_strtolower(trim($r['visitor_name'].'|'.$r['visitor_email']));
            if ($key !== '|') {
                $visitors[$key] = true;
            }
        }
        $totals = [];
        foreach (Sql::all('SELECT goal_id, COUNT(*) n, COALESCE(SUM(value),0) rev FROM goal_events WHERE workspace_id = ? AND created_at >= ? GROUP BY goal_id',
            [$c->wid, $cutoff]) as $r) {
            $totals[$r['goal_id']] = $r;
        }
        $goals = array_map(fn ($g) => [
            'goal' => Serialize::goal($g),
            'count' => (int) ($totals[$g['id']]['n'] ?? 0),
            'revenue' => (float) ($totals[$g['id']]['rev'] ?? 0),
        ], Sql::all('SELECT * FROM goals WHERE workspace_id = ?', [$c->wid]));

        return Json::ok(['visitors' => count($visitors), 'chats' => $chats, 'goals' => $goals]);
    }
}
