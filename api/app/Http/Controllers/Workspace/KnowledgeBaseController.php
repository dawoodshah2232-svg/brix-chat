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

/** Knowledge-base articles, plus the unanswered-questions log that feeds them. */
class KnowledgeBaseController extends ApiController
{
    private const WITH_CATEGORY = 'SELECT a.*, c.name AS category_name FROM kb_articles a LEFT JOIN kb_categories c ON c.id = a.category_id';

    public function index(Request $request): JsonResponse
    {
        $c = $this->need('kb_articles', 'read');
        $where = 'FROM kb_articles a WHERE a.workspace_id = ?';
        $params = [$c->wid];
        if (($v = $this->query($request, 'status')) !== null) {
            $where .= ' AND a.status = ?';
            $params[] = Input::in($v, ['draft', 'published'], 'status');
        }
        if (($v = $this->query($request, 'category')) !== null && $v !== '') {
            // A category id, or a category name (case-insensitive).
            if (preg_match('/^[0-9a-f-]{36}$/i', (string) $v)) {
                $where .= ' AND a.category_id = ?';
                $params[] = strtolower((string) $v);
            } else {
                $where .= ' AND EXISTS (SELECT 1 FROM kb_categories c WHERE c.id = a.category_id AND LOWER(c.name) = LOWER(?))';
                $params[] = (string) $v;
            }
        }
        if (($v = $this->query($request, 'propertyId')) !== null) {
            $where .= ' AND a.property_id = ?';
            $params[] = Input::uuid($v, 'propertyId');
        }
        [$rows, $next] = Sql::page($where, $params, [['a.updated_at', 'DESC'], ['a.id', 'DESC']],
            $this->query($request, 'cursor'), $this->query($request, 'limit', 50), fn ($r) => $r);

        $names = [];
        $categoryIds = array_values(array_unique(array_filter(array_column($rows, 'category_id'))));
        if ($categoryIds) {
            foreach (Sql::all('SELECT id, name FROM kb_categories WHERE id IN ('.Sql::marks($categoryIds).')', $categoryIds) as $x) {
                $names[$x['id']] = $x['name'];
            }
        }

        return Json::items(array_map(fn ($r) => Serialize::article($r, $r['category_id'] ? ($names[$r['category_id']] ?? null) : null), $rows), $next);
    }

    /** Published articles matching title or body (max 50). */
    public function search(Request $request): JsonResponse
    {
        $c = $this->need('kb_articles', 'read');
        $q = trim((string) $this->query($request, 'q', ''));
        if ($q === '') {
            return Json::ok([]);
        }
        $like = Input::like($q);
        $rows = Sql::all(self::WITH_CATEGORY." WHERE a.workspace_id = ? AND a.status = 'published'
                          AND (a.title LIKE ? ESCAPE '\\\\' OR a.body LIKE ? ESCAPE '\\\\') ORDER BY a.updated_at DESC LIMIT 50", [$c->wid, $like, $like]);

        return Json::items(array_map(fn ($r) => Serialize::article($r, $r['category_name']), $rows));
    }

    public function store(Request $request): JsonResponse
    {
        $c = $this->need('kb_articles', 'write');
        $id = self::create($c, $this->body($request));
        Activity::log($c, 'kb_article.created', 'kb_article', $id);

        return Json::ok(self::serialized($id), 201);
    }

    public function show(string $id): JsonResponse
    {
        $id = Input::uuid($id);
        $c = $this->need('kb_articles', 'read');
        $row = Sql::one(self::WITH_CATEGORY.' WHERE a.id = ? AND a.workspace_id = ?', [$id, $c->wid]);
        if ($row === null) {
            Json::fail('not_found', 'Article not found', 404);
        }

        return Json::ok(Serialize::article($row, $row['category_name']));
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $id = Input::uuid($id);
        $c = $this->need('kb_articles', 'write');
        $b = $this->body($request);
        $sets = $params = [];
        if (array_key_exists('title', $b)) {
            $sets[] = 'title = ?';
            $params[] = Input::str($b['title'], 'title', 255);
        }
        if (array_key_exists('body', $b)) {
            $sets[] = 'body = ?';
            $params[] = Input::str($b['body'], 'body', 16777215);
        }
        if (array_key_exists('status', $b)) {
            $sets[] = 'status = ?';
            $params[] = Input::in($b['status'], ['draft', 'published'], 'status');
        }
        if (array_key_exists('category_id', $b) || array_key_exists('category', $b)) {
            $sets[] = 'category_id = ?';
            $params[] = self::category($c, $b['category_id'] ?? null, $b['category'] ?? null);
        }
        if (array_key_exists('property_id', $b)) {
            $sets[] = 'property_id = ?';
            $params[] = Sql::ref('properties', $b['property_id'], 'property_id', $c->wid);
        }
        if (!$sets) {
            Json::fail('validation', 'Nothing to update', 422);
        }
        if (!Sql::one('SELECT id FROM kb_articles WHERE id = ? AND workspace_id = ?', [$id, $c->wid])) {
            Json::fail('not_found', 'Article not found', 404);
        }
        $params[] = $id;
        Sql::run('UPDATE kb_articles SET '.implode(', ', $sets).' WHERE id = ?', $params);
        Activity::log($c, 'kb_article.updated', 'kb_article', $id);

        return Json::ok(self::serialized($id));
    }

    public function destroy(string $id): JsonResponse
    {
        $id = Input::uuid($id);
        $c = $this->need('kb_articles', 'write');
        if (Sql::run('DELETE FROM kb_articles WHERE id = ? AND workspace_id = ?', [$id, $c->wid]) === 0) {
            Json::fail('not_found', 'Article not found', 404);
        }
        Activity::log($c, 'kb_article.deleted', 'kb_article', $id);

        return Json::ok(['deleted' => true]);
    }

    // ---- unanswered questions ---------------------------------------------------

    public function unanswered(Request $request): JsonResponse
    {
        $c = $this->need('unanswered_questions', 'read');
        $where = 'FROM unanswered_questions WHERE workspace_id = ?';
        if (!Input::bool($this->query($request, 'includeDismissed', false))) {
            $where .= ' AND dismissed = 0';
        }
        [$items, $next] = Sql::page($where, [$c->wid], [['`count`', 'DESC'], ['created_at', 'DESC'], ['id', 'DESC']],
            $this->query($request, 'cursor'), $this->query($request, 'limit', 50), [Serialize::class, 'unanswered']);

        return Json::items($items, $next);
    }

    /** Log a question the bot could not answer; repeats (case-insensitive) bump its count. */
    public function logUnanswered(Request $request): JsonResponse
    {
        $c = $this->need('unanswered_questions', 'write');
        $b = $this->body($request);
        $question = Input::str(Input::required($b, 'question'), 'question', 2048);
        if (empty($b['conversation_id'])) {
            Json::fail('not_supported', 'A conversation is required to log an unanswered question', 501);
        }
        $conv = Sql::own('conversations', $b['conversation_id'], $c->wid);
        $duplicate = Sql::one('SELECT id, `count` FROM unanswered_questions WHERE workspace_id = ? AND dismissed = 0 AND LOWER(question) = LOWER(?) LIMIT 1',
            [$c->wid, $question]);
        if ($duplicate) {
            Sql::run('UPDATE unanswered_questions SET `count` = `count` + 1 WHERE id = ?', [$duplicate['id']]);

            return Json::ok(Serialize::unanswered(Sql::one('SELECT * FROM unanswered_questions WHERE id = ?', [$duplicate['id']])));
        }
        $id = isset($b['id']) ? Input::uuid($b['id']) : Sql::uuid();
        Sql::run('INSERT INTO unanswered_questions (id, workspace_id, property_id, question, conversation_id) VALUES (?, ?, ?, ?, ?)',
            [$id, $c->wid, $conv['property_id'], $question, $conv['id']]);
        Activity::log($c, 'unanswered.added', 'unanswered_question', $id);

        return Json::ok(Serialize::unanswered(Sql::one('SELECT * FROM unanswered_questions WHERE id = ?', [$id])), 201);
    }

    public function dismissUnanswered(string $id): JsonResponse
    {
        $c = $this->need('unanswered_questions', 'write');
        $row = Sql::own('unanswered_questions', $id, $c->wid);
        Sql::run('UPDATE unanswered_questions SET dismissed = 1 WHERE id = ?', [$row['id']]);
        Activity::log($c, 'unanswered.dismissed', 'unanswered_question', $row['id']);

        return Json::ok(['dismissed' => true]);
    }

    /** Turn a question into a draft article (category "Unanswered") and dismiss it. */
    public function promoteUnanswered(string $id): JsonResponse
    {
        $c = $this->need('unanswered_questions', 'write');
        $row = Sql::own('unanswered_questions', $id, $c->wid);
        $category = Sql::one('SELECT id FROM kb_categories WHERE workspace_id = ? AND LOWER(name) = ? LIMIT 1', [$c->wid, 'unanswered']);
        if (!$category) {
            $category = ['id' => Sql::uuid()];
            Sql::run('INSERT INTO kb_categories (id, workspace_id, property_id, name, color, position) VALUES (?, ?, NULL, ?, ?, 99)',
                [$category['id'], $c->wid, 'Unanswered', '#6b7280']);
        }
        $articleId = self::create($c, [
            'title' => $row['question'],
            'body' => 'Draft from the unanswered-questions log (asked '.(int) $row['count'].'×).',
            'category_id' => $category['id'], 'status' => 'draft',
        ]);
        Sql::run('UPDATE unanswered_questions SET dismissed = 1 WHERE id = ?', [$row['id']]);
        Activity::log($c, 'unanswered.promoted', 'unanswered_question', $row['id'], ['article_id' => $articleId]);

        return Json::ok(Serialize::article(Sql::one('SELECT * FROM kb_articles WHERE id = ?', [$articleId]), 'Unanswered'), 201);
    }

    /** Slug = slugified title, de-duplicated with -2, -3, ... */
    private static function create(Member $c, array $b): string
    {
        $title = Input::str(Input::required($b, 'title'), 'title', 255);
        $propertyId = Sql::ref('properties', $b['property_id'] ?? null, 'property_id', $c->wid);
        $categoryId = self::category($c, $b['category_id'] ?? null, $b['category'] ?? null);
        $base = Catalog::slug($title, 'article');
        $slug = $base;
        for ($n = 2; Sql::one('SELECT id FROM kb_articles WHERE workspace_id = ? AND slug = ?', [$c->wid, $slug]); $n++) {
            $slug = $base.'-'.$n;
        }
        $id = isset($b['id']) ? Input::uuid($b['id']) : Sql::uuid();
        Sql::run('INSERT INTO kb_articles (id, workspace_id, property_id, category_id, title, slug, body, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
            $id, $c->wid, $propertyId, $categoryId, $title, $slug,
            isset($b['body']) ? Input::str($b['body'], 'body', 16777215) : '',
            isset($b['status']) ? Input::in($b['status'], ['draft', 'published'], 'status') : 'draft',
        ]);

        return $id;
    }

    /** Category by explicit id (must exist) or by name (unknown names -> none). */
    private static function category(Member $c, mixed $id, mixed $name): ?string
    {
        if ($id !== null && $id !== '') {
            $id = Input::uuid($id, 'category_id');
            if (!Sql::one('SELECT id FROM kb_categories WHERE id = ? AND workspace_id = ?', [$id, $c->wid])) {
                Json::fail('not_found', 'KB category not found', 404);
            }

            return $id;
        }
        if ($name !== null && $name !== '') {
            $row = Sql::one('SELECT id FROM kb_categories WHERE workspace_id = ? AND LOWER(name) = LOWER(?) LIMIT 1', [$c->wid, Input::str($name, 'category', 255)]);

            return $row['id'] ?? null;
        }

        return null;
    }

    private static function serialized(string $id): array
    {
        $row = Sql::one(self::WITH_CATEGORY.' WHERE a.id = ?', [$id]);

        return Serialize::article($row, $row['category_name']);
    }
}
