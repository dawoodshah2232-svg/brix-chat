<?php

namespace App\Support\Api;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Thin query helpers over Laravel's connection that return associative
 * arrays (the serializers and handlers work on array rows).
 */
final class Sql
{
    public static function one(string $sql, array $params = []): ?array
    {
        $row = DB::selectOne($sql, $params);

        return $row === null ? null : (array) $row;
    }

    public static function all(string $sql, array $params = []): array
    {
        return array_map(fn ($row) => (array) $row, DB::select($sql, $params));
    }

    /** INSERT / UPDATE / DELETE; returns the affected row count. */
    public static function run(string $sql, array $params = []): int
    {
        return DB::affectingStatement($sql, $params);
    }

    public static function uuid(): string
    {
        return (string) Str::uuid();
    }

    /** "?, ?, ?" for an IN (...) list. */
    public static function marks(array $values): string
    {
        return implode(',', array_fill(0, count($values), '?'));
    }

    /**
     * Workspace-scoped row fetch: the id must be a UUID and the row must
     * belong to $wid, otherwise 422 / 404. Guards every cross-reference.
     */
    public static function own(string $table, mixed $id, string $wid, string $cols = '*'): array
    {
        $id = Input::uuid($id, $table.' id');
        $row = self::one("SELECT $cols FROM `$table` WHERE id = ? AND workspace_id = ?", [$id, $wid]);
        if ($row === null) {
            Json::fail('not_found', ucfirst(rtrim($table, 's')).' not found', 404);
        }

        return $row;
    }

    /**
     * Optional reference: null/'' -> null; otherwise a UUID that must name a
     * $table row in this workspace (422 / 404 otherwise).
     */
    public static function ref(string $table, mixed $value, string $name, string $wid): ?string
    {
        $id = Input::optUuid($value, $name);
        if ($id !== null) {
            self::own($table, $id, $wid);
        }

        return $id;
    }

    /**
     * Keyset pagination; the cursor is the last item's id.
     *
     * @param  string  $fromWhere  "FROM table WHERE ..." (no ORDER/LIMIT)
     * @param  array<int, array{0: string, 1: string}>  $order  [[column, ASC|DESC], ...]
     * @return array{0: array, 1: ?string} [mapped items, next cursor]
     */
    public static function page(string $fromWhere, array $params, array $order, mixed $cursor, mixed $limit, callable $map): array
    {
        $limit = (int) $limit;
        if ($limit < 1) {
            $limit = 50;
        }
        if ($limit > 200) {
            $limit = 200;
        }

        $cols = array_column($order, 0);
        $desc = strtoupper((string) ($order[0][1] ?? 'DESC')) === 'DESC';

        if ($cursor !== null && $cursor !== '') {
            if (!Input::isUuid($cursor)) {
                Json::fail('validation', 'Invalid cursor', 422);
            }
            $anchor = self::one('SELECT '.implode(', ', $cols)." $fromWhere AND id = ?", [...$params, strtolower($cursor)]);
            if ($anchor === null) {
                Json::fail('validation', 'Invalid cursor', 422);
            }
            $fromWhere .= ' AND ('.implode(', ', $cols).') '.($desc ? '<' : '>').' ('.self::marks($cols).')';
            foreach ($cols as $col) {
                $params[] = $anchor[self::key($col)];
            }
        }

        $orderSql = implode(', ', array_map(fn ($o) => $o[0].' '.$o[1], $order));
        $rows = self::all("SELECT * $fromWhere ORDER BY $orderSql LIMIT ".($limit + 1), $params);

        $hasMore = count($rows) > $limit;
        if ($hasMore) {
            array_pop($rows);
        }
        $next = $hasMore && $rows ? (string) end($rows)['id'] : null;

        return [array_map($map, $rows), $next];
    }

    /** Result-set key for an order column: "a.updated_at" -> "updated_at", "`count`" -> "count". */
    private static function key(string $column): string
    {
        $column = trim($column, '`');
        $dot = strrpos($column, '.');

        return $dot === false ? $column : substr($column, $dot + 1);
    }
}
