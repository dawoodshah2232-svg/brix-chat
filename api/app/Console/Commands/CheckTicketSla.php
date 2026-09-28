<?php

namespace App\Console\Commands;

use App\Support\Api\Json;
use App\Support\Api\Sql;
use App\Support\Api\Webhooks;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Mail;
use Throwable;

/**
 * Marks unresolved tickets past their SLA as breached, audits it, queues the
 * `ticket.sla_breached` webhook and (optionally) emails the assignee.
 */
class CheckTicketSla extends Command
{
    protected $signature = 'brix:sla-check';

    protected $description = 'Flag tickets that passed their SLA due time';

    public function handle(): int
    {
        $tickets = Sql::all("SELECT t.*, m.email AS assignee_email, m.display_name AS assignee_name
            FROM tickets t LEFT JOIN members m ON m.id = t.assignee_id
            WHERE t.sla_breached = 0 AND t.sla_due IS NOT NULL AND t.sla_due <= UTC_TIMESTAMP() AND t.status NOT IN ('resolved')
            ORDER BY t.sla_due ASC LIMIT 200");
        $emailAssignee = (bool) config('brix.sla_email_assignee');
        $breached = [];

        foreach ($tickets as $t) {
            // Claim the ticket; a concurrent run that got there first skips it.
            if (Sql::run('UPDATE tickets SET sla_breached = 1 WHERE id = ? AND sla_breached = 0', [$t['id']]) === 0) {
                continue;
            }
            try {
                Sql::run('INSERT INTO audit_log (id, workspace_id, actor_name, action, entity, entity_id, meta) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [Sql::uuid(), $t['workspace_id'], 'system', 'ticket.sla_breached', 'ticket', $t['id'], Json::encode(['subject' => $t['subject']])]);
            } catch (Throwable) {
                // best effort
            }

            $event = 'queued';
            try {
                Webhooks::enqueue($t['workspace_id'], 'ticket.sla_breached', $t['property_id'], [
                    'ticket_id' => $t['id'], 'subject' => $t['subject'], 'priority' => $t['priority'],
                    'requester_name' => $t['requester_name'], 'requester_email' => $t['requester_email'],
                    'sla_due' => Json::iso($t['sla_due']),
                    'overdue_minutes' => max(0, (int) ((time() - strtotime($t['sla_due'].' UTC')) / 60)),
                ]);
            } catch (Throwable) {
                $event = 'dispatcher_error';
            }

            $email = 'skipped';
            if ($emailAssignee && empty($t['assignee_email'])) {
                $email = 'no_assignee_email';
            } elseif ($emailAssignee && config('brix.mail_enabled')) {
                $email = $this->mailAssignee($t);
            }
            $breached[] = ['ticket_id' => $t['id'], 'event' => $event, 'email' => $email];
        }

        $this->line(Json::encode(['data' => ['checked' => count($tickets), 'breached' => $breached]]));

        return self::SUCCESS;
    }

    private function mailAssignee(array $t): string
    {
        $body = 'Hi '.($t['assignee_name'] ?: 'there').",\n\n"
            .'Ticket "'.$t['subject'].'" breached its SLA (due '.Json::iso($t['sla_due']).").\n"
            .'Requester: '.$t['requester_name'].' <'.$t['requester_email'].">\n";
        try {
            Mail::raw($body, fn ($message) => $message->to($t['assignee_email'])->subject('[Brix Chat] SLA breached: '.$t['subject']));

            return 'sent';
        } catch (Throwable) {
            return 'failed';
        }
    }
}
