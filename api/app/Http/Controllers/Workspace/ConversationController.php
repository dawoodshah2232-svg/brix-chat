<?php

namespace App\Http\Controllers\Workspace;

use App\Support\Api\Activity;
use App\Support\Api\Catalog;
use App\Support\Api\Input;
use App\Support\Api\Json;
use App\Support\Api\Member;
use App\Support\Api\Serialize;
use App\Support\Api\Sql;
use App\Support\Api\Webhooks;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use stdClass;

/** Conversations, their messages and internal notes. */
class ConversationController extends ApiController
{
    private const STATUSES = ['open', 'closed', 'spam', 'missed'];

    private const SENDERS = ['visitor', 'agent', 'ai', 'system'];

    private const KINDS = ['text', 'file', 'voice', 'rating'];

    public function index(Request $request): JsonResponse
    {
        $c = $this->need('conversations', 'read');
        $where = 'FROM conversations WHERE workspace_id = ?';
        $params = [$c->wid];
        if (($v = $this->query($request, 'propertyId')) !== null) {
            $where .= ' AND property_id = ?';
            $params[] = Input::uuid($v, 'propertyId');
        }
        if (($v = $this->query($request, 'status')) !== null) {
            $where .= ' AND status = ?';
            $params[] = Input::in($v, self::STATUSES, 'status');
        }
        if (($v = $this->query($request, 'priority')) !== null) {
            $where .= ' AND priority = ?';
            $params[] = Input::in($v, Catalog::PRIORITIES, 'priority');
        }
        if (($v = $this->query($request, 'tag')) !== null) {
            $where .= ' AND JSON_CONTAINS(tags, JSON_QUOTE(?))';
            $params[] = mb_strtolower(trim((string) $v));
        }
        if (($v = $this->query($request, 'assignee')) !== null) {
            if ($v === 'unassigned') {
                $where .= ' AND assignee_id IS NULL';
            } else {
                $where .= ' AND assignee_id = ?';
                $params[] = Input::uuid($v, 'assignee');
            }
        }
        if (($q = $this->query($request, 'q')) !== null && trim((string) $q) !== '') {
            $like = Input::like(trim((string) $q));
            $where .= " AND (visitor_name LIKE ? ESCAPE '\\\\' OR visitor_email LIKE ? ESCAPE '\\\\'
                       OR EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = conversations.id AND m.text LIKE ? ESCAPE '\\\\'))";
            array_push($params, $like, $like, $like);
        }
        [$rows, $next] = Sql::page($where, $params, [['updated_at', 'DESC'], ['id', 'DESC']],
            $this->query($request, 'cursor'), $this->query($request, 'limit', 50), fn ($r) => $r);

        return Json::items(Serialize::conversations($rows), $next);
    }

    /** Start a session: auto-routes to a department named "Support" and posts the widget greeting. */
    public function store(Request $request): JsonResponse
    {
        $c = $this->need('conversations', 'write');
        $b = $this->body($request);
        $property = Sql::own('properties', $b['property_id'] ?? null, $c->wid);
        $id = isset($b['id']) ? Input::uuid($b['id']) : Sql::uuid();
        $name = isset($b['name']) ? Input::str($b['name'], 'name', 255) : 'Guest';
        $department = Sql::one('SELECT id FROM departments WHERE workspace_id = ? AND property_id = ? AND LOWER(name) = ? LIMIT 1',
            [$c->wid, $property['id'], 'support']);

        Sql::run(
            "INSERT INTO conversations (id, workspace_id, property_id, visitor_name, visitor_email, page_url, referrer, status,
             department_id, tags, priority, unread) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, 0)",
            [$id, $c->wid, $property['id'], $name,
                isset($b['email']) ? Input::email($b['email']) : '',
                isset($b['page_url']) ? Input::str($b['page_url'], 'page_url', 2048) : '',
                isset($b['referrer']) ? Input::str($b['referrer'], 'referrer', 2048) : '',
                $department['id'] ?? null, Json::encode(Input::tags($b['tags'] ?? [])),
                isset($b['priority']) ? Input::in($b['priority'], Catalog::PRIORITIES, 'priority') : 'medium'],
        );
        $greeting = array_merge(Catalog::widgetDefaults(), Json::decode($property['widget_config'] ?? null, []))['greeting'];
        Sql::run("INSERT INTO messages (id, workspace_id, conversation_id, sender, kind, text, metadata) VALUES (?, ?, ?, 'agent', 'text', ?, ?)",
            [Sql::uuid(), $c->wid, $id, $greeting, Json::encode(['greeting' => true])]);
        Activity::log($c, 'conversation.started', 'conversation', $id);

        return Json::ok(self::hydrated($c, $id), 201);
    }

    public function show(string $id): JsonResponse
    {
        $c = $this->need('conversations', 'read');

        return Json::ok(self::hydrated($c, $id));
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $c = $this->need('conversations', 'write');
        $conv = Sql::own('conversations', $id, $c->wid);
        $b = $this->body($request);
        $sets = $params = [];
        foreach (['visitor_name' => 255, 'visitor_email' => 255, 'page_url' => 2048, 'referrer' => 2048] as $field => $max) {
            if (array_key_exists($field, $b)) {
                $sets[] = "$field = ?";
                $params[] = Input::str($b[$field], $field, $max);
            }
        }
        if (array_key_exists('priority', $b)) {
            $sets[] = 'priority = ?';
            $params[] = Input::in($b['priority'], Catalog::PRIORITIES, 'priority');
        }
        if (array_key_exists('status', $b)) {
            $status = Input::in($b['status'], self::STATUSES, 'status');
            array_push($sets, 'status = ?', 'closed_at = ?');
            array_push($params, $status, $status === 'closed' ? gmdate('Y-m-d H:i:s') : null);
        }
        foreach (['department_id' => 'departments', 'assignee_id' => 'members'] as $field => $table) {
            if (array_key_exists($field, $b)) {
                $sets[] = "$field = ?";
                $params[] = Sql::ref($table, $b[$field], $field, $c->wid);
            }
        }
        if (array_key_exists('tags', $b)) {
            $sets[] = 'tags = ?';
            $params[] = Json::encode(Input::tags($b['tags']));
        }
        if (array_key_exists('contact_id', $b)) {
            $sets[] = 'contact_id = ?';
            $params[] = Sql::ref('contacts', $b['contact_id'], 'contact_id', $c->wid);
        }
        if (!$sets) {
            Json::fail('validation', 'Nothing to update', 422);
        }
        $params[] = $conv['id'];
        Sql::run('UPDATE conversations SET '.implode(', ', $sets).' WHERE id = ?', $params);
        Activity::log($c, 'conversation.updated', 'conversation', $conv['id']);

        return Json::ok(self::hydrated($c, $conv['id']));
    }

    public function destroy(string $id): JsonResponse
    {
        $c = $this->need('conversations', 'write');
        $conv = Sql::own('conversations', $id, $c->wid);
        Sql::run('DELETE FROM conversations WHERE id = ?', [$conv['id']]);
        Activity::log($c, 'conversation.deleted', 'conversation', $conv['id']);

        return Json::ok(['deleted' => true]);
    }

    // ---- messages ----------------------------------------------------------

    public function messages(Request $request, string $id): JsonResponse
    {
        $c = $this->need('messages', 'read');
        $conv = Sql::own('conversations', $id, $c->wid);
        [$items, $next] = Sql::page('FROM messages WHERE conversation_id = ? AND workspace_id = ?', [$conv['id'], $c->wid],
            [['created_at', 'ASC'], ['id', 'ASC']], $this->query($request, 'cursor'), $this->query($request, 'limit', 50),
            [Serialize::class, 'message']);

        return Json::items($items, $next);
    }

    /** Visitor messages bump unread and fan out `message.received`; any message reopens a closed chat. */
    public function sendMessage(Request $request, string $id): JsonResponse
    {
        $c = $this->need('messages', 'write');
        $conv = Sql::own('conversations', $id, $c->wid);
        $b = $this->body($request);
        $text = Input::str(Input::required($b, 'text'), 'text');
        if ($text === '') {
            Json::fail('validation', 'text must not be empty', 422);
        }
        $sender = Input::in($b['sender'] ?? 'agent', self::SENDERS, 'sender');
        $kind = Input::in($b['kind'] ?? 'text', self::KINDS, 'kind');
        $mid = isset($b['id']) ? Input::uuid($b['id']) : Sql::uuid();
        Sql::run('INSERT INTO messages (id, workspace_id, conversation_id, sender, kind, text, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [$mid, $c->wid, $conv['id'], $sender, $kind, $text, Json::encode($b['metadata'] ?? new stdClass())]);

        $sets = $sender === 'visitor' ? 'unread = unread + 1,' : '';
        if ($conv['status'] !== 'open') {
            $sets .= "status = 'open', closed_at = NULL,";
        }
        if ($sets !== '') {
            Sql::run("UPDATE conversations SET $sets updated_at = UTC_TIMESTAMP() WHERE id = ?", [$conv['id']]);
        }
        Activity::log($c, 'message.sent', 'conversation', $conv['id'], ['sender' => $sender]);

        if ($sender === 'visitor') {
            $property = Sql::one('SELECT name FROM properties WHERE id = ?', [$conv['property_id']]);
            Webhooks::enqueue($c->wid, 'message.received', $conv['property_id'], [
                'event' => 'message.received',
                'conversation_id' => $conv['id'],
                'visitor_id' => $conv['contact_id'] ?? null,
                'visitor_name' => $conv['visitor_name'],
                'message_text' => $text,
                'property_id' => $conv['property_id'],
                'property_name' => $property['name'] ?? null,
                'timestamp' => Json::now(),
            ]);
        }

        return Json::ok(Serialize::message(Sql::one('SELECT * FROM messages WHERE id = ?', [$mid])), 201);
    }

    /** PATCH /messages/{id} */
    public function updateMessage(Request $request, string $messageId): JsonResponse
    {
        $c = $this->need('messages', 'write');
        $mid = Input::uuid($messageId);
        $message = Sql::one('SELECT m.* FROM messages m JOIN conversations co ON co.id = m.conversation_id WHERE m.id = ? AND co.workspace_id = ?',
            [$mid, $c->wid]);
        if ($message === null) {
            Json::fail('not_found', 'Message not found', 404);
        }
        $b = $this->body($request);
        $sets = $params = [];
        if (array_key_exists('text', $b)) {
            $sets[] = 'text = ?';
            $params[] = Input::str($b['text'], 'text');
        }
        if (array_key_exists('kind', $b)) {
            $sets[] = 'kind = ?';
            $params[] = Input::in($b['kind'], self::KINDS, 'kind');
        }
        if (array_key_exists('metadata', $b)) {
            $sets[] = 'metadata = ?';
            $params[] = Json::encode($b['metadata']);
        }
        if (!$sets) {
            Json::fail('validation', 'Nothing to update', 422);
        }
        $params[] = $mid;
        Sql::run('UPDATE messages SET '.implode(', ', $sets).' WHERE id = ?', $params);

        return Json::ok(Serialize::message(Sql::one('SELECT * FROM messages WHERE id = ?', [$mid])));
    }

    // ---- notes -------------------------------------------------------------

    public function notes(string $id): JsonResponse
    {
        $c = $this->need('conversation_notes', 'read');
        $conv = Sql::own('conversations', $id, $c->wid);
        $rows = Sql::all('SELECT * FROM conversation_notes WHERE conversation_id = ? ORDER BY created_at ASC, id ASC', [$conv['id']]);

        return Json::items(array_map([Serialize::class, 'note'], $rows));
    }

    public function addNote(Request $request, string $id): JsonResponse
    {
        $c = $this->need('conversation_notes', 'write');
        $conv = Sql::own('conversations', $id, $c->wid);
        $b = $this->body($request);
        $text = Input::str(Input::required($b, 'text'), 'text');
        $author = isset($b['author']) ? Input::str($b['author'], 'author', 255) : $c->name();
        $nid = isset($b['id']) ? Input::uuid($b['id']) : Sql::uuid();
        self::insertNote($c, $conv['id'], $text, $author, $nid);

        return Json::ok(['author' => $author, 'text' => $text, 'created_at' => Json::now()], 201);
    }

    // ---- actions (POST /conversations/{id}/{action}) -------------------------

    public function assign(Request $request, string $id): JsonResponse
    {
        [$c, $conv, $b] = $this->action($request, $id);
        $agentId = Input::optUuid($b['agent_id'] ?? $b['assignee_id'] ?? null, 'agent_id');
        $departmentId = null;
        if (isset($b['department']) && $b['department'] !== '') {
            // By name: the frontend passes department names.
            $department = Sql::one('SELECT id, name FROM departments WHERE workspace_id = ? AND LOWER(name) = LOWER(?) LIMIT 1',
                [$c->wid, Input::str($b['department'], 'department', 255)]);
            if ($department === null) {
                Json::fail('not_found', 'Department not found', 404);
            }
            $departmentId = $department['id'];
        } elseif (array_key_exists('department_id', $b)) {
            $departmentId = Sql::ref('departments', $b['department_id'], 'department_id', $c->wid);
        }
        if ($agentId) {
            Sql::own('members', $agentId, $c->wid);
        }
        Sql::run('UPDATE conversations SET assignee_id = ?, department_id = COALESCE(?, department_id) WHERE id = ?', [$agentId, $departmentId, $conv['id']]);
        Activity::log($c, 'conversation.assigned', 'conversation', $conv['id']);

        return Json::ok(self::hydrated($c, $conv['id']));
    }

    /** Hand over to an agent and/or department; leaves a note, a system message and a notification. */
    public function transfer(Request $request, string $id): JsonResponse
    {
        [$c, $conv, $b] = $this->action($request, $id);
        $agentId = Input::optUuid($b['agent_id'] ?? null, 'agent_id');
        $departmentId = Input::optUuid($b['department_id'] ?? null, 'department_id');
        if ($agentId) {
            Sql::own('members', $agentId, $c->wid);
        }
        if ($departmentId) {
            Sql::own('departments', $departmentId, $c->wid);
        }
        Sql::run('UPDATE conversations SET assignee_id = COALESCE(?, assignee_id), department_id = COALESCE(?, department_id) WHERE id = ?',
            [$agentId, $departmentId, $conv['id']]);

        $note = isset($b['note']) ? Input::str($b['note'], 'note') : '';
        $target = 'the team';
        if ($agentId) {
            $target = Sql::one('SELECT display_name FROM members WHERE id = ?', [$agentId])['display_name'] ?? $target;
        }
        $summary = 'Transferred to '.$target.($note !== '' ? ' — '.$note : '');
        self::insertNote($c, $conv['id'], $summary, $c->name());
        Sql::run("INSERT INTO messages (id, workspace_id, conversation_id, sender, kind, text, metadata) VALUES (?, ?, ?, 'system', 'text', ?, ?)",
            [Sql::uuid(), $c->wid, $conv['id'], '🔀 '.$summary, Json::encode(['transfer' => true])]);
        if ($agentId) {
            Activity::notify($c->wid, 'chat.assigned', 'Chat transferred to you', $summary, null, $agentId);
        }
        Activity::log($c, 'conversation.transferred', 'conversation', $conv['id'], ['to' => $target]);

        return Json::ok(self::hydrated($c, $conv['id']));
    }

    public function status(Request $request, string $id): JsonResponse
    {
        [$c, $conv, $b] = $this->action($request, $id);

        return $this->setStatus($c, $conv, Input::in($b['status'] ?? '', self::STATUSES, 'status'));
    }

    public function close(Request $request, string $id): JsonResponse
    {
        [$c, $conv] = $this->action($request, $id);

        return $this->setStatus($c, $conv, 'closed');
    }

    public function reopen(Request $request, string $id): JsonResponse
    {
        [$c, $conv] = $this->action($request, $id);

        return $this->setStatus($c, $conv, 'open');
    }

    public function tags(Request $request, string $id): JsonResponse
    {
        [$c, $conv, $b] = $this->action($request, $id);
        Sql::run('UPDATE conversations SET tags = ? WHERE id = ?', [Json::encode(Input::tags($b['tags'] ?? [])), $conv['id']]);

        return Json::ok(self::hydrated($c, $conv['id']));
    }

    public function rating(Request $request, string $id): JsonResponse
    {
        [$c, $conv, $b] = $this->action($request, $id);
        Sql::run('UPDATE conversations SET rating = ? WHERE id = ?', [Input::int($b['rating'] ?? null, 'rating', 1, 5), $conv['id']]);

        return Json::ok(self::hydrated($c, $conv['id']));
    }

    public function read(Request $request, string $id): JsonResponse
    {
        [, $conv] = $this->action($request, $id);
        Sql::run('UPDATE conversations SET unread = 0 WHERE id = ?', [$conv['id']]);

        return Json::ok(['unread' => 0]);
    }

    /** Shared preamble for the POST actions: write permission, ownership, parsed body. */
    private function action(Request $request, string $id): array
    {
        $c = $this->need('conversations', 'write');
        $conv = Sql::own('conversations', $id, $c->wid);

        return [$c, $conv, $this->body($request)];
    }

    private function setStatus(Member $c, array $conv, string $status): JsonResponse
    {
        $unread = $status !== 'open' ? ', unread = 0' : '';
        Sql::run("UPDATE conversations SET status = ?, closed_at = ? $unread WHERE id = ?",
            [$status, $status === 'closed' ? gmdate('Y-m-d H:i:s') : null, $conv['id']]);
        Activity::log($c, 'conversation.status_changed', 'conversation', $conv['id'], ['from' => $conv['status'], 'to' => $status]);

        return Json::ok(self::hydrated($c, $conv['id']));
    }

    private static function insertNote(Member $c, string $conversationId, string $text, string $author, ?string $id = null): void
    {
        Sql::run('INSERT INTO conversation_notes (id, workspace_id, conversation_id, author_member_id, author_name, text) VALUES (?, ?, ?, ?, ?, ?)',
            [$id ?? Sql::uuid(), $c->wid, $conversationId, $c->mid, $author, $text]);
    }

    private static function hydrated(Member $c, string $id): array
    {
        return Serialize::conversations([Sql::own('conversations', $id, $c->wid)])[0];
    }
}
