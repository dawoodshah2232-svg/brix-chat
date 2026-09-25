<?php
declare(strict_types=1);

// --- PDO singleton -----------------------------------------------------------
function brix_config(): array {
    static $cfg = null;
    if ($cfg === null) {
        $file = __DIR__ . '/../config.php';
        if (!is_file($file)) {
            http_response_code(500);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['error' => ['code' => 'not_configured',
                'message' => 'API not configured: copy api/config.sample.php to api/config.php and fill in values.']]);
            exit;
        }
        $cfg = require $file;
        if (!is_array($cfg)) {
            http_response_code(500);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['error' => ['code' => 'not_configured', 'message' => 'config.php must return an array.']]);
            exit;
        }
    }
    return $cfg;
}

function brix_db(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $c = brix_config();
        $dsn = sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', $c['DB_HOST'], $c['DB_NAME']);
        $pdo = new PDO($dsn, (string)$c['DB_USER'], (string)$c['DB_PASS'], [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
        // All reads/writes in UTC; the schema import also sets +00:00.
        $pdo->exec("SET time_zone = '+00:00'");
        $pdo->exec("SET NAMES utf8mb4");
    }
    return $pdo;
}

// Mint a v4 UUID (client may also supply IDs — accept them verbatim).
function new_uuid(): string {
    $b = random_bytes(16);
    $b[6] = chr(ord($b[6]) & 0x0f | 0x40);
    $b[8] = chr(ord($b[8]) & 0x3f | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
}
