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

/** Support tickets. */
class TicketController extends ApiController
{
    private const STATUSES = ['new', 'open', 'resolved'];

    public function index(Request $request): JsonResponse
    {
        $c = $this->need('tickets', 'read');
        $where = 'FROM tickets WHERE workspace_id = ?';
        $params = [$c->wid];
        if (($v = $this->query($request, 'status')) !== null) {
            $where .= ' AND status = ?';
            $params[] = Input::in($v, self::STATUSES, 'status');
        }
        if (($v = $this->query($request, 'priority')) !== null) {
            $where .= ' AND priority = ?';
            $params[] = Input::in($v, Catalog::PRIORITIES, 'priority');
        }
        if (($v = $this->query($request, 'assignee')) !== null) {
            if ($v === 'unassigned') {
                $where .= ' AND assignee_id IS NULL';
            } else {
                $where .= ' AND assignee_id = ?';
                $params[] = Input::uuid($v, 'assignee');
            }
        }
        if (($v = $this->query($request, 'category')) !== null) {
            $where .= ' AND category_id = ?';
            $params[] = Input::uuid($v, 'category');
        }
        if (($q = $this->query($request, 'q')) !== null && trim((string) $q) !== '') {
            $like = Input::like(trim((string) $q));
            $where .= " AND (subject LIKE ? ESCAPE '\\\\' OR requester_name LIKE ? ESCAPE '\\\\'
                       OR requester_email LIKE ? ESCAPE '\\\\' OR message LIKE ? ESCAPE '\\\\')";
            array_push($params, $like, $like, $like, $like);
        }
        [$items, $next] = Sql::page($where, $params, [['created_at', 'DESC'], ['id', 'DESC']],
            $this->query($request, 'cursor'), $this->query($request, 'limit', 50), [Serialize::class, 'ticket']);

        return Json::items($items, $next);
    }

    public function store(Request $request): JsonResponse
    {
        $c = $this->need('tickets', 'write');
        $b = $this->body($request);
        $id = self::create($c, $b);
        Activity::log($c, 'ticket.created', 'ticket', $id, ['subject' => $b['subject'] ?? '']);
        Activity::notify($c->wid, 'ticket.created', 'New ticket: '.($b['subject'] ?? ''), $b['message'] ?? '');

        return Json::ok(self::serialized($c, $id), 201);
    }

    public function bulk(Request $request): JsonResponse
    {
        $c = $this->need('tickets', 'write');
        $b = $this->body($request);
        $ids = $b['ids'] ?? [];
        if (!is_array($ids) || !$ids) {
            Json::fail('validation', 'ids must be a non-empty array', 422);
        }
        $action = Input::in($b['action'] ?? '', ['resolve', 'assign', 'spam'], 'action');
        $agentId = Input::optUuid($b['agent_id'] ?? null, 'agent_id');
        if ($action === 'assign') {
            if (!$agentId) {
                Json::fail('validation', 'agent_id required for assign', 422);
            }
            Sql::own('members', $agentId, $c->wid);
        }
        $updated = 0;
        foreach ($ids as $id) {
            $id = Input::uuid($id);
            if (!Sql::one('SELECT id FROM tickets WHERE id = ? AND workspace_id = ?', [$id, $c->wid])) {
                continue;
            }
            match ($action) {
                'resolve' => Sql::run("UPDATE tickets SET status = 'resolved' WHERE id = ?", [$id]),
                'spam' => Sql::run("UPDATE tickets SET status = 'resolved', tags = JSON_ARRAY_APPEND(IFNULL(tags, JSON_ARRAY()), '$', 'spam') WHERE id = ?", [$id]),
                default => Sql::run('UPDATE tickets SET assignee_id = ? WHERE id = ?', [$agentId, $id]),
            };
            $updated++;
        }
        Activity::log($c, 'ticket.bulk', 'ticket', '', ['action' => $action, 'updated' => $updated]);

        return Json::ok(['updated' => $updated]);
    }

    /** Create a ticket carrying the chat transcript. */
    public function fromConversation(Request $request): JsonResponse
    {
        $c = $this->need('tickets', 'write');
        $b = $this->body($request);
        $conv = Sql::own('conversations', $b['conversation_id'] ?? null, $c->wid);
        $lines = array_map(fn ($m) => '['.$m['sender'].'] '.$m['text'],
            Sql::all('SELECT sender, text, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC, id ASC', [$conv['id']]));
        $payload = [
            'subject' => $b['subject'] ?? ('Chat transcript — '.($conv['visitor_name'] ?: 'Guest')),
            'message' => ($b['message'] ?? '')."\n\n--- transcript ---\n".implode("\n", $lines),
            'requester_name' => $b['requester_name'] ?? $conv['visitor_name'],
            'requester_email' => $b['requester_email'] ?? $conv['visitor_email'],
            'property_id' => $conv['property_id'],
            'conversation_id' => $conv['id'],
        ];
        if (isset($b['priority'])) {
            $payload['priority'] = $b['priority'];
        }
        $id = self::create($c, $payload);
        Activity::log($c, 'ticket.created', 'ticket', $id, ['from_conversation' => $conv['id']]);

        return Json::ok(self::serialized($c, $id), 201);
    }

    public function show(string $id): JsonResponse
    {
        $id = Input::uuid($id);
        $c = $this->need('tickets', 'read');

        return Json::ok(self::serialized($c, $id));
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $id = Input::uuid($id);
        $c = $this->need('tickets', 'write');
        $ticket = Sql::own('tickets', $id, $c->wid);
        $b = $this->body($request);
        $sets = $params = [];
        foreach (['subject' => 255, 'message' => 65535, 'requester_name' => 255, 'requester_email' => 255] as $field => $max) {
            if (array_key_exists($field, $b)) {
                $sets[] = "$field = ?";
                $params[] = $field === 'requester_email' ? Input::email($b[$field]) : Input::str($b[$field], $field, $max);
            }
        }
        if (array_key_exists('status', $b)) {
            $sets[] = 'status = ?';
            $params[] = Input::in($b['status'], self::STATUSES, 'status');
        }
        if (array_key_exists('priority', $b)) {
            $sets[] = 'priority = ?';
            $params[] = Input::in($b['priority'], Catalog::PRIORITIES, 'priority');
        }
        if (array_key_exists('tags', $b)) {
            $sets[] = 'tags = ?';
            $params[] = Json::encode(Input::tags($b['tags']));
        }
        if (array_key_exists('sla_due', $b)) {
            $sets[] = 'sla_due = ?';
            $params[] = $b['sla_due'] === null ? null : gmdate('Y-m-d H:i:s', strtotime((string) $b['sla_due']));
        }
        foreach (['property_id' => 'properties', 'assignee_id' => 'members', 'conversation_id' => 'conversations'] as $field => $table) {
            if (array_key_exists($field, $b)) {
                $sets[] = "$field = ?";
                $params[] = Sql::ref($table, $b[$field], $field, $c->wid);
            }
        }
        if (array_key_exists('category_id', $b)) {
            $sets[] = 'category_id = ?';
            $params[] = self::category($c, $b['category_id']);
        }
        if (!$sets) {
            Json::fail('validation', 'Nothing to update', 422);
        }
        $params[] = $ticket['id'];
        Sql::run('UPDATE tickets SET '.implode(', ', $sets).' WHERE id = ?', $params);
        Activity::log($c, 'ticket.updated', 'ticket', $ticket['id']);

        return Json::ok(self::serialized($c, $ticket['id']));
    }

    public function destroy(string $id): JsonResponse
    {
        $id = Input::uuid($id);
        $c = $this->need('tickets', 'write');
        $ticket = Sql::own('tickets', $id, $c->wid);
        Sql::run('DELETE FROM tickets WHERE id = ?', [$ticket['id']]);
        Activity::log($c, 'ticket.deleted', 'ticket', $ticket['id']);

        return Json::ok(['deleted' => true]);
    }

    // ---- POST /tickets/{id}/{action} ------------------------------------------

    public function status(Request $request, string $id): JsonResponse
    {
        [$c, $ticket, $b] = $this->action($request, $id);
        $status = Input::in($b['status'] ?? '', self::STATUSES, 'status');
        Sql::run('UPDATE tickets SET status = ? WHERE id = ?', [$status, $ticket['id']]);
        Activity::log($c, 'ticket.status_changed', 'ticket', $ticket['id'], ['from' => $ticket['status'], 'to' => $status]);

        return Json::ok(self::serialized($c, $ticket['id']));
    }

    public function assign(Request $request, string $id): JsonResponse
    {
        [$c, $ticket, $b] = $this->action($request, $id);
        $agentId = Sql::ref('members', $b['agent_id'] ?? null, 'agent_id', $c->wid);
        Sql::run('UPDATE tickets SET assignee_id = ? WHERE id = ?', [$agentId, $ticket['id']]);
        Activity::log($c, 'ticket.assigned', 'ticket', $ticket['id']);
        if ($agentId) {
            Activity::notify($c->wid, 'chat.assigned', 'Ticket assigned to you', $ticket['subject'], null, $agentId);
        }

        return Json::ok(self::serialized($c, $ticket['id']));
    }

    public function priority(Request $request, string $id): JsonResponse
    {
        [$c, $ticket, $b] = $this->action($request, $id);
        $priority = Input::in($b['priority'] ?? '', Catalog::PRIORITIES, 'priority');
        Sql::run('UPDATE tickets SET priority = ? WHERE id = ?', [$priority, $ticket['id']]);
        Activity::log($c, 'ticket.priority_changed', 'ticket', $ticket['id'], ['to' => $priority]);

        return Json::ok(self::serialized($c, $ticket['id']));
    }

    /** Merge = resolve this ticket into the target (the link lives in the audit log). */
    public function merge(Request $request, string $id): JsonResponse
    {
        [$c, $ticket, $b] = $this->action($request, $id);
        $target = Sql::own('tickets', $b['target_id'] ?? null, $c->wid);
        Sql::run("UPDATE tickets SET status = 'resolved' WHERE id = ?", [$ticket['id']]);
        Activity::log($c, 'ticket.merged', 'ticket', $ticket['id'], ['into' => $target['id']]);

        return Json::ok(self::serialized($c, $ticket['id']));
    }

    /** Split = new ticket copying the requester context. */
    public function split(Request $request, string $id): JsonResponse
    {
        [$c, $ticket, $b] = $this->action($request, $id);
        $childId = self::create($c, [
            'subject' => $b['subject'] ?? ($ticket['subject'].' (split)'),
            'message' => $b['message'] ?? '',
            'requester_name' => $ticket['requester_name'], 'requester_email' => $ticket['requester_email'],
            'property_id' => $ticket['property_id'], 'priority' => $ticket['priority'],
            'tags' => Json::decode($ticket['tags'] ?? null, []),
        ]);
        Activity::log($c, 'ticket.split', 'ticket', $ticket['id'], ['child' => $childId]);

        return Json::ok(self::serialized($c, $childId), 201);
    }

    private function action(Request $request, string $id): array
    {
        $id = Input::uuid($id);
        $c = $this->need('tickets', 'write');
        $ticket = Sql::own('tickets', $id, $c->wid);

        return [$c, $ticket, $this->body($request)];
    }

    /** Insert a ticket from an API-shaped payload; returns its id. */
    private static function create(Member $c, array $b): string
    {
        $subject = Input::str(Input::required($b, 'subject'), 'subject', 255);
        $propertyId = Sql::ref('properties', $b['property_id'] ?? null, 'property_id', $c->wid);
        $assignee = Sql::ref('members', $b['assignee_id'] ?? null, 'assignee_id', $c->wid);
        $conversationId = Sql::ref('conversations', $b['conversation_id'] ?? null, 'conversation_id', $c->wid);
        $categoryId = self::category($c, $b['category_id'] ?? null);
        $id = isset($b['id']) ? Input::uuid($b['id']) : Sql::uuid();
        Sql::run(
            "INSERT INTO tickets (id, workspace_id, property_id, subject, message, requester_name, requester_email, status, priority,
             assignee_id, sla_due, conversation_id, tags, category_id) VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?, ?, ?)",
            [$id, $c->wid, $propertyId, $subject,
                isset($b['message']) ? Input::str($b['message'], 'message') : '',
                isset($b['requester_name']) ? Input::str($b['requester_name'], 'requester_name', 255) : 'Guest',
                isset($b['requester_email']) ? Input::email($b['requester_email']) : '',
                isset($b['priority']) ? Input::in($b['priority'], Catalog::PRIORITIES, 'priority') : 'medium',
                $assignee,
                isset($b['sla_due']) && $b['sla_due'] ? gmdate('Y-m-d H:i:s', strtotime((string) $b['sla_due'])) : null,
                $conversationId, Json::encode(Input::tags($b['tags'] ?? [])), $categoryId],
        );

        return $id;
    }

    /** Optional ticket category id that must exist in this workspace. */
    private static function category(Member $c, mixed $value): ?string
    {
        $id = Input::optUuid($value, 'category_id');
        if ($id && !Sql::one('SELECT id FROM ticket_categories WHERE id = ? AND workspace_id = ?', [$id, $c->wid])) {
            Json::fail('not_found', 'Ticket category not found', 404);
        }

        return $id;
    }

    private static function serialized(Member $c, string $id): array
    {
        return Serialize::ticket(Sql::own('tickets', $id, $c->wid));
    }
}
