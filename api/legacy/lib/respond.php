<?php
declare(strict_types=1);

// --- Error type ---------------------------------------------------------------
class ApiError extends Exception {
    public string $ecode;
    public int $estatus;
    public function __construct(string $code, string $message, int $status = 400) {
        parent::__construct($message);
        $this->ecode = $code;
        $this->estatus = $status;
    }
}

/** Throw an API error: { error: { code, message } } with the HTTP status. */
function brix_fail(string $code, string $message, int $status = 400): never {
    throw new ApiError($code, $message, $status);
}

// --- Success envelopes --------------------------------------------------------
// Success: { data: <T> }. Lists: { data: { items: [...], next_cursor: <id|null> } }.
function brix_json(mixed $data, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['data' => $data], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function brix_items(array $items, ?string $next_cursor, int $status = 200): never {
    brix_json(['items' => $items, 'next_cursor' => $next_cursor], $status);
}

// --- Time formatting ----------------------------------------------------------
// MySQL TIMESTAMP ('Y-m-d H:i:s', UTC session) -> ISO-8601 UTC 'Z' string.
function iso_dt(mixed $v): ?string {
    if ($v === null || $v === '') return null;
    $dt = new DateTimeImmutable((string)$v, new DateTimeZone('UTC'));
    return $dt->format('Y-m-d\TH:i:s.000\Z');
}

// Epoch-millis number (used by ApiRating/ApiDepartment/ApiCategory created_at).
function ms_epoch(mixed $v): ?int {
    if ($v === null || $v === '') return null;
    return (int)(strtotime((string)$v . ' UTC') * 1000);
}

function now_iso(): string {
    return gmdate('Y-m-d\TH:i:s.000\Z');
}

// --- JSON columns ---------------------------------------------------------------
function jdec(mixed $v, mixed $fallback = []): mixed {
    if ($v === null || $v === '') return $fallback;
    if (is_array($v)) return $v;
    $d = json_decode((string)$v, true);
    return is_array($d) ? $d : $fallback;
}

function jenc(mixed $v): string {
    return json_encode($v, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
}

function to_bool(mixed $v): bool {
    return (bool)$v;
}

// --- Cursor pagination ----------------------------------------------------------
// Keyset pagination with cursor = last item's id (frontend contract).
// $order: list of [column, 'ASC'|'DESC']; cursor row is resolved under $whereSql.
function cursor_page(PDO $db, string $fromWhere, array $params, array $order,
                     ?string $cursor, mixed $limit, callable $map): array {
    $limit = (int)$limit;
    if ($limit < 1) $limit = 50;
    if ($limit > 200) $limit = 200;

    $cols = array_column($order, 0);
    $desc = strtoupper((string)($order[0][1] ?? 'DESC')) === 'DESC';
    $op = $desc ? '<' : '>';

    if ($cursor !== null && $cursor !== '') {
        if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $cursor)) {
            brix_fail('validation', 'Invalid cursor', 422);
        }
        $st = $db->prepare("SELECT " . implode(', ', $cols) . " $fromWhere AND id = ?");
        $st->execute([...$params, strtolower($cursor)]);
        $crow = $st->fetch();
        if (!$crow) brix_fail('validation', 'Invalid cursor', 422);
        $tuple = '(' . implode(', ', $cols) . ") $op (" . implode(', ', array_fill(0, count($cols), '?')) . ')';
        $vals = [];
        foreach ($cols as $c) $vals[] = $crow[trim($c, '`')];
        $fromWhere .= " AND $tuple";
        $params = [...$params, ...$vals];
    }

    $orderSql = implode(', ', array_map(fn($o) => $o[0] . ' ' . $o[1], $order));
    $st = $db->prepare("SELECT * $fromWhere ORDER BY $orderSql LIMIT " . ($limit + 1));
    $st->execute($params);
    $rows = $st->fetchAll();

    $hasMore = count($rows) > $limit;
    if ($hasMore) array_pop($rows);
    $items = array_map($map, $rows);
    $next = $hasMore && $rows ? (string)end($rows)['id'] : null;
    return [$items, $next];
}
