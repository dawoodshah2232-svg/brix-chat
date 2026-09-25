<?php

namespace App\Support;

use RuntimeException;

/**
 * Workspace member bearer token, shared with the legacy API (api/legacy/lib/auth.php):
 *   base64url(json {wid, mid, exp}) . '.' . hex hmac_sha256(payload, APP_SECRET)
 */
class WorkspaceToken
{
    public const TTL = 2592000; // 30 days

    public static function issue(string $workspaceId, string $memberId, int $ttl = self::TTL): string
    {
        $payload = self::b64u(json_encode([
            'wid' => $workspaceId,
            'mid' => $memberId,
            'exp' => time() + $ttl,
        ], JSON_UNESCAPED_SLASHES));

        return $payload.'.'.hash_hmac('sha256', $payload, self::secret());
    }

    public static function verify(string $token): ?array
    {
        $parts = explode('.', $token);
        if (count($parts) !== 2 || $parts[0] === '' || $parts[1] === '') {
            return null;
        }
        $expected = hash_hmac('sha256', $parts[0], self::secret());
        if (!hash_equals($expected, strtolower($parts[1]))) {
            return null;
        }
        $json = base64_decode(strtr($parts[0], '-_', '+/'), true);
        $data = $json === false ? null : json_decode($json, true);
        if (!is_array($data) || empty($data['wid']) || empty($data['mid']) || empty($data['exp'])) {
            return null;
        }

        return (int) $data['exp'] < time() ? null : $data;
    }

    /** Legacy config wins so tokens stay valid across both API layers. */
    private static function secret(): string
    {
        $legacy = base_path('legacy/config.php');
        if (is_file($legacy)) {
            $config = require $legacy;
            if (is_array($config) && !empty($config['APP_SECRET'])) {
                return (string) $config['APP_SECRET'];
            }
        }
        $secret = (string) env('APP_SECRET', '');
        if ($secret === '') {
            throw new RuntimeException('APP_SECRET is not configured (api/.env or api/legacy/config.php).');
        }

        return $secret;
    }

    private static function b64u(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }
}
