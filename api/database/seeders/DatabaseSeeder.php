<?php

namespace Database\Seeders;

use App\Models\Plan;
use App\Models\PlatformAdmin;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Platform reference data. Idempotent — safe to re-run.
 * Demo workspaces/members come from mysql/schema.sql.
 * Platform admin: PLATFORM_ADMIN_EMAIL / PLATFORM_ADMIN_PASSWORD in .env,
 * or later with `php artisan brix:admin you@example.com`.
 */
class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $plans = [
            ['id' => 'starter', 'name' => 'Starter', 'price' => 29, 'seats' => 3, 'sort_order' => 1,
                'features' => ['3 agent seats', '1 property', 'Core chat widget', 'Knowledge base', 'Email support']],
            ['id' => 'growth', 'name' => 'Growth', 'price' => 79, 'seats' => 10, 'sort_order' => 2,
                'features' => ['10 agent seats', '5 properties', 'AI copilot', 'Webhooks & API', 'Departments & routing', 'Priority support']],
            ['id' => 'scale', 'name' => 'Scale', 'price' => 199, 'seats' => 30, 'sort_order' => 3,
                'features' => ['30 agent seats', 'Unlimited properties', 'Everything in Growth', 'Dedicated success manager']],
        ];
        foreach ($plans as $plan) {
            Plan::firstOrCreate(['id' => $plan['id']], $plan);
        }

        // Workspaces that predate plans start on Starter.
        DB::table('workspaces')->whereNull('plan_id')->update(['plan_id' => 'starter']);

        $email = mb_strtolower(trim((string) env('PLATFORM_ADMIN_EMAIL', '')));
        $password = (string) env('PLATFORM_ADMIN_PASSWORD', '');
        if ($email !== '' && $password !== '' && !PlatformAdmin::where('email', $email)->exists()) {
            PlatformAdmin::create(['name' => 'Platform Admin', 'email' => $email, 'password' => $password]);
            $this->command?->info("Platform admin created: $email");
        }
    }
}
