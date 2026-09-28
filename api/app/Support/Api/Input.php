<?php

namespace App\Support\Api;

use Illuminate\Http\Request;

/**
 * Request input + validators for the workspace API.
 *
 * Body and query are read raw (not through $request->input()) because the
 * global TrimStrings / ConvertEmptyStringsToNull middleware would change
 * values the validators below are specified against.
 */
final class Input
{
    private const UUID = '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i';

    /** Decoded JSON body ([] when empty). Invalid JSON -> 400. */
    public static function body(Request $request): array
    {
        $raw = $request->getContent();
        if ($raw === '') {
            return [];
        }
        $decoded = json_decode($raw, true);
        if (!is_array($decoded)) {
            Json::fail('validation', 'Invalid JSON body', 400);
        }

        return $decoded;
    }

    /** Raw query-string value, as PHP's $_GET would see it. */
    public static function query(Request $request, string $key, mixed $default = null): mixed
    {
        parse_str((string) $request->server('QUERY_STRING', ''), $query);

        return $query[$key] ?? $default;
    }

    public static function uuid(mixed $value, string $name = 'id'): string
    {
        if (!is_string($value) || !preg_match(self::UUID, $value)) {
            Json::fail('validation', "Invalid $name", 422);
        }

        return strtolower($value);
    }

    public static function isUuid(mixed $value): bool
    {
        return is_string($value) && preg_match(self::UUID, $value) === 1;
    }

    public static function optUuid(mixed $value, string $name = 'id'): ?string
    {
        return $value === null || $value === '' ? null : self::uuid($value, $name);
    }

    public static function required(array $body, string $key): mixed
    {
        if (!array_key_exists($key, $body) || $body[$key] === '' || $body[$key] === null) {
            Json::fail('validation', "$key is required", 422);
        }

        return $body[$key];
    }

    public static function str(mixed $value, string $name, ?int $max = 65535): string
    {
        if (!is_string($value)) {
            Json::fail('validation', "$name must be a string", 422);
        }
        $value = trim($value);
        if ($max !== null && mb_strlen($value) > $max) {
            Json::fail('validation', "$name too long", 422);
        }

        return $value;
    }

    public static function in(mixed $value, array $allowed, string $name): string
    {
        if (!is_string($value) || !in_array($value, $allowed, true)) {
            Json::fail('validation', "Invalid $name", 422);
        }

        return $value;
    }

    public static function email(mixed $value, string $name = 'email'): string
    {
        $value = self::str($value, $name, 255);
        if ($value !== '' && !filter_var($value, FILTER_VALIDATE_EMAIL)) {
            Json::fail('validation', "Invalid $name", 422);
        }

        return $value;
    }

    public static function int(mixed $value, string $name, ?int $min = null, ?int $max = null): int
    {
        if (is_bool($value) || (is_string($value) && !is_numeric($value))) {
            Json::fail('validation', "Invalid $name", 422);
        }
        $int = (int) $value;
        if (($min !== null && $int < $min) || ($max !== null && $int > $max)) {
            Json::fail('validation', "Invalid $name", 422);
        }

        return $int;
    }

    public static function bool(mixed $value): bool
    {
        return filter_var($value, FILTER_VALIDATE_BOOLEAN);
    }

    /** Tags normalized like the frontend: trim, lowercase, dedupe. */
    public static function tags(mixed $value): array
    {
        if ($value === null) {
            return [];
        }
        if (!is_array($value)) {
            Json::fail('validation', 'tags must be an array', 422);
        }
        $out = [];
        foreach ($value as $tag) {
            if (!is_string($tag)) {
                continue;
            }
            $tag = mb_strtolower(trim($tag));
            if ($tag !== '' && !in_array($tag, $out, true)) {
                $out[] = $tag;
            }
        }

        return $out;
    }

    public static function passcode(mixed $value, int $min = 4, int $max = 128): string
    {
        if (!is_string($value) || mb_strlen($value) < $min || mb_strlen($value) > $max) {
            Json::fail('validation', "Passcode must be $min-$max characters", 422);
        }

        return $value;
    }

    /** SQL LIKE pattern for a free-text search (escape char: backslash). */
    public static function like(string $term): string
    {
        return '%'.str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $term).'%';
    }
}
