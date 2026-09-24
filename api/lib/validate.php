<?php
declare(strict_types=1);

// --- Input --------------------------------------------------------------------
function req_body(): array {
    $raw = file_get_contents('php://input');
    if ($raw === '' || $raw === false || $raw === null) return [];
    $d = json_decode($raw, true);
    if (!is_array($d)) brix_fail('validation', 'Invalid JSON body', 400);
    return $d;
}

function req_q(string $k, mixed $def = null): mixed {
    return $_GET[$k] ?? $def;
}

// --- Validators ----------------------------------------------------------------
function v_uuid(mixed $v, string $name = 'id'): string {
    if (!is_string($v) || !preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $v)) {
        brix_fail('validation', "Invalid $name", 422);
    }
    return strtolower($v);
}

function v_opt_uuid(mixed $v, string $name = 'id'): ?string {
    if ($v === null || $v === '') return null;
    return v_uuid($v, $name);
}

function v_required(array $b, string $k): mixed {
    if (!array_key_exists($k, $b) || $b[$k] === '' || $b[$k] === null) {
        brix_fail('validation', "$k is required", 422);
    }
    return $b[$k];
}

function v_str(mixed $v, string $name, ?int $max = 65535): string {
    if (!is_string($v)) brix_fail('validation', "$name must be a string", 422);
    $v = trim($v);
    if ($max !== null && mb_strlen($v) > $max) brix_fail('validation', "$name too long", 422);
    return $v;
}

function v_opt_str(mixed $v, string $name, ?int $max = 65535): ?string {
    if ($v === null) return null;
    return v_str($v, $name, $max);
}

function v_in(mixed $v, array $allowed, string $name): string {
    if (!is_string($v) || !in_array($v, $allowed, true)) {
        brix_fail('validation', "Invalid $name", 422);
    }
    return $v;
}

function v_email(mixed $v, string $name = 'email'): string {
    $v = v_str($v, $name, 255);
    if ($v !== '' && !filter_var($v, FILTER_VALIDATE_EMAIL)) {
        brix_fail('validation', "Invalid $name", 422);
    }
    return $v;
}

function v_int(mixed $v, string $name, ?int $min = null, ?int $max = null): int {
    if (is_bool($v) || (is_string($v) && !is_numeric($v))) brix_fail('validation', "Invalid $name", 422);
    $i = (int)$v;
    if ($min !== null && $i < $min) brix_fail('validation', "Invalid $name", 422);
    if ($max !== null && $i > $max) brix_fail('validation', "Invalid $name", 422);
    return $i;
}

function v_bool(mixed $v): bool {
    return filter_var($v, FILTER_VALIDATE_BOOLEAN);
}

// Tags normalized exactly like the frontend: trim -> lowercase -> dedupe.
function v_tags(mixed $v): array {
    if ($v === null) return [];
    if (!is_array($v)) brix_fail('validation', 'tags must be an array', 422);
    $out = [];
    foreach ($v as $t) {
        if (!is_string($t)) continue;
        $t = mb_strtolower(trim($t));
        if ($t !== '' && !in_array($t, $out, true)) $out[] = $t;
    }
    return $out;
}

function v_passcode(mixed $v, int $min = 4, int $max = 128): string {
    if (!is_string($v) || mb_strlen($v) < $min || mb_strlen($v) > $max) {
        brix_fail('validation', "Passcode must be $min-$max characters", 422);
    }
    return $v;
}
