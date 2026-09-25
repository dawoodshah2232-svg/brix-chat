<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;

/*
|--------------------------------------------------------------------------
| Console Routes
|--------------------------------------------------------------------------
|
| This file is where you may define all of your Closure based console
| commands. Each Closure is bound to a command instance allowing a
| simple approach to interacting with each command's IO methods.
|
*/

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Create (or reset the password of) a platform admin.
Artisan::command('brix:admin {email} {--name=Platform Admin} {--password=}', function (string $email) {
    $password = $this->option('password') ?: $this->secret('Password (min 10 chars)');
    if (strlen((string) $password) < 10) {
        $this->error('Password must be at least 10 characters.');

        return 1;
    }
    $admin = \App\Models\PlatformAdmin::updateOrCreate(
        ['email' => mb_strtolower(trim($email))],
        ['name' => $this->option('name'), 'password' => $password],
    );
    $admin->tokens()->delete();
    $this->info("Platform admin ready: {$admin->email}");
})->purpose('Create or reset a platform admin account');
