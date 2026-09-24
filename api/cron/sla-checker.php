<?php
declare(strict_types=1);
// Brix Chat — SLA checker (port of the sla-checker edge function).
//
// Scans open tickets past their SLA, flags sla_breached=1 (idempotent — the
// conditional update means two runners can't double-fire), writes an audit
// row per breach, enqueues a 'ticket.sla_breached' webhook event, and
// optionally emails the assignee.
//
// cPanel cron (every 15 minutes):
//   */15 * * * * /usr/bin/php /home/USERNAME/public_html/api/cron/sla-checker.php >/dev/null 2>&1
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

$db = brix_db();
$st = $db->query("SELECT t.*, m.email AS assignee_email, m.display_name AS assignee_name
    FROM tickets t LEFT JOIN members m ON m.id = t.assignee_id
    WHERE t.sla_breached = 0 AND t.sla_due IS NOT NULL AND t.sla_due <= UTC_TIMESTAMP()
      AND t.status NOT IN ('resolved')
    ORDER BY t.sla_due ASC LIMIT 200");
$tickets = $st->fetchAll();

$checked = count($tickets);
$breached = [];
$emailAssignee = !empty($cfg['SLA_EMAIL_ASSIGNEE']);

foreach ($tickets as $t) {
    // Conditional update = idempotent across concurrent runners.
    $up = $db->prepare('UPDATE tickets SET sla_breached = 1 WHERE id = ? AND sla_breached = 0');
    $up->execute([$t['id']]);
    if ($up->rowCount() === 0) continue;

    try {
        $db->prepare('INSERT INTO audit_log (id, workspace_id, actor_name, action, entity, entity_id, meta)
                      VALUES (?, ?, ?, ?, ?, ?, ?)')
           ->execute([new_uuid(), $t['workspace_id'], 'system', 'ticket.sla_breached', 'ticket', $t['id'],
                      jenc(['subject' => $t['subject']])]);
    } catch (Throwable $e) {}

    $slaDue = strtotime((string)$t['sla_due'] . ' UTC');
    $eventStatus = 'skipped';
    try {
        webhook_enqueue($t['workspace_id'], 'ticket.sla_breached', $t['property_id'], [
            'ticket_id' => $t['id'], 'subject' => $t['subject'], 'priority' => $t['priority'],
            'requester_name' => $t['requester_name'], 'requester_email' => $t['requester_email'],
            'sla_due' => iso_dt($t['sla_due']),
            'overdue_minutes' => max(0, (int)((time() - $slaDue) / 60)),
        ]);
        $eventStatus = 'queued';
    } catch (Throwable $e) {
        $eventStatus = 'dispatcher_error';
    }

    $emailStatus = 'skipped';
    if ($emailAssignee && !empty($t['assignee_email']) && !empty($cfg['MAIL_ENABLED'])) {
        $to = (string)$t['assignee_email'];
        $subject = '[Brix Chat] SLA breached: ' . $t['subject'];
        $body = "Hi " . ($t['assignee_name'] ?: 'there') . ",\n\n"
              . "Ticket \"" . $t['subject'] . "\" breached its SLA (due " . iso_dt($t['sla_due']) . ").\n"
              . "Requester: " . $t['requester_name'] . " <" . $t['requester_email'] . ">\n";
        $headers = 'From: ' . $cfg['MAIL_FROM'] . "\r\nContent-Type: text/plain; charset=utf-8";
        $emailStatus = @mail($to, $subject, $body, $headers) ? 'sent' : 'failed';
    } elseif ($emailAssignee && empty($t['assignee_email'])) {
        $emailStatus = 'no_assignee_email';
    }

    $breached[] = ['ticket_id' => $t['id'], 'event' => $eventStatus, 'email' => $emailStatus];
}

echo json_encode(['data' => ['checked' => $checked, 'breached' => $breached]],
    JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . PHP_EOL;
