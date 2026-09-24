<?php
declare(strict_types=1);
// Brix Chat — webhook retry sweeper (port of the webhook-dispatcher retry mode).
//
// Flushes due webhook deliveries across ALL workspaces (service-level).
//
// cPanel cron (every 5 minutes):
//   */5 * * * * /usr/bin/php /home/USERNAME/public_html/api/cron/webhook-retry.php >/dev/null 2>&1
//
// Guard: CLI only, unless ?secret= matches CRON_SECRET in config.php.

chdir(__DIR__ . '/..');
require __DIR__ . '/../lib/db.php';
require __DIR__ . '/../lib/respond.php';
require __DIR__ . '/../lib/webhooks.php';

$cfg = brix_config();
$secret = $argv[1] ?? ($_GET['secret'] ?? null);
if (php_sapi_name() !== 'cli') {
    $cs = (string)($cfg['CRON_SECRET'] ?? '');
    if ($cs === '' || $secret !== $cs) {
        http_response_code(403);
        header('Content-Type: application/json');
        echo json_encode(['error' => ['code' => 'forbidden', 'message' => 'CLI only']]);
        exit;
    }
    header('Content-Type: application/json; charset=utf-8');
}

$stats = webhook_flush(null, null, 100);
echo json_encode(['data' => array_merge(['mode' => 'retry_sweep'], $stats)],
    JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . PHP_EOL;
