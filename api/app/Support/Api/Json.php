<?php

namespace App\Support\Api;

use App\Exceptions\ApiError;
use DateTimeImmutable;
use DateTimeZone;
use Illuminate\Http\JsonResponse;

/**
 * Response envelopes and value formatting shared by the workspace API.
 * Success: {data: T}. Lists: {data: {items, next_cursor}}. Failure: ApiError.
 */
final class Json
{
    public const FLAGS = JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE;

    public static function ok(mixed $data, int $status = 200): JsonResponse
    {
        return response()->json(['data' => $data], $status, [], self::FLAGS);
    }

    public static function items(array $items, ?string $nextCursor = null, int $status = 200): JsonResponse
    {
        return self::ok(['items' => $items, 'next_cursor' => $nextCursor], $status);
    }

    public static function fail(string $code, string $message, int $status = 400): never
    {
        throw new ApiError($code, $message, $status);
    }

    /** MySQL TIMESTAMP (UTC session) -> ISO-8601 'Z' string. */
    public static function iso(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        return (new DateTimeImmutable((string) $value, new DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.000\Z');
    }

    /** Epoch milliseconds (ratings, departments and categories use this for created_at). */
    public static function ms(mixed $value): ?int
    {
        if ($value === null || $value === '') {
            return null;
        }

        return (int) (strtotime($value.' UTC') * 1000);
    }

    public static function now(): string
    {
        return gmdate('Y-m-d\TH:i:s.000\Z');
    }

    /** Decode a JSON column; anything that is not an array/object yields $fallback. */
    public static function decode(mixed $value, mixed $fallback = []): mixed
    {
        if ($value === null || $value === '') {
            return $fallback;
        }
        if (is_array($value)) {
            return $value;
        }
        $decoded = json_decode((string) $value, true);

        return is_array($decoded) ? $decoded : $fallback;
    }

    public static function encode(mixed $value): string
    {
        return json_encode($value, self::FLAGS);
    }
}
