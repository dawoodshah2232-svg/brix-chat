<?php

namespace App\Console\Commands;

use App\Support\Api\Json;
use App\Support\Api\Webhooks;
use Illuminate\Console\Command;

/** Attempts due webhook deliveries across all workspaces (retries with back-off). */
class RetryWebhooks extends Command
{
    protected $signature = 'brix:webhooks-retry';

    protected $description = 'Deliver pending and retry failed webhook deliveries';

    public function handle(): int
    {
        $this->line(Json::encode(['data' => array_merge(['mode' => 'retry_sweep'], Webhooks::flush(null, null, 100))]));

        return self::SUCCESS;
    }
}
