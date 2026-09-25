<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

/** Key/value platform settings with typed defaults. */
class PlatformSettings
{
    public const DEFAULTS = [
        'platform_name' => 'Brix Chat',
        'logo_data_url' => null,
        'session_timeout_mins' => 480,
        'passcode_min_length' => 4,
        'allow_signup' => true,
    ];

    public static function all(): array
    {
        $stored = DB::table('platform_settings')->pluck('value', 'key')
            ->map(fn ($v) => json_decode($v, true))
            ->all();

        return array_merge(self::DEFAULTS, array_intersect_key($stored, self::DEFAULTS));
    }

    public static function get(string $key): mixed
    {
        return self::all()[$key] ?? null;
    }

    public static function put(array $values): array
    {
        $now = now();
        foreach (array_intersect_key($values, self::DEFAULTS) as $key => $value) {
            DB::table('platform_settings')->updateOrInsert(
                ['key' => $key],
                ['value' => json_encode($value), 'updated_at' => $now],
            );
        }

        return self::all();
    }
}
