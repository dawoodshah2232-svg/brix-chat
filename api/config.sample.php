<?php
// Brix Chat PHP API — configuration.
// 1. Copy this file to config.php  (cp config.sample.php config.php)
// 2. Fill in the real values.
// 3. NEVER commit config.php — it is in .gitignore.
//
// Generate a strong APP_SECRET with:
//   php -r 'echo bin2hex(random_bytes(32)), PHP_EOL;'

return [
    // --- Database (MySQL/MariaDB) -------------------------------------------
    'DB_HOST' => '127.0.0.1',
    'DB_NAME' => 'brixchat',
    'DB_USER' => 'brixchat',
    'DB_PASS' => 'CHANGE_ME',

    // --- Auth ----------------------------------------------------------------
    // HMAC secret for the session tokens (base64url(payload).hex(hmac_sha256)).
    // Keep this private; rotating it logs out every session.
    'APP_SECRET' => 'CHANGE_ME_GENERATE_WITH_random_bytes',

    // --- CORS ----------------------------------------------------------------
    // Exact origin allowed to call this API (no trailing slash).
    'SITE_ORIGIN' => 'https://app.example.com',
    // When 1, localhost dev origins are also allowed (never enable in prod).
    'APP_DEBUG' => 0,

    // --- Cron ----------------------------------------------------------------
    // Optional shared secret so cron scripts can also be triggered over HTTP:
    //   https://host/api/cron/sla-checker.php?secret=XXX
    // Leave empty to allow CLI-only execution.
    'CRON_SECRET' => '',

    // --- AI copilot (POST /ai/copilot) ---------------------------------------
    // Set one to enable; leave empty and the endpoint returns an honest 501.
    'AI_API_KEY'      => '', // OpenAI key (chat completions)
    'AI_ANTHROPIC_KEY'=> '', // Anthropic key
    'AI_MODEL'        => 'gpt-4o-mini',

    // --- Email (POST /email/send) --------------------------------------------
    'MAIL_ENABLED' => 0, // 1 = use PHP mail(); 0 = endpoint returns honest 501
    'MAIL_FROM'    => 'Brix Chat <noreply@example.com>',
    // Reserved for a future Resend-backed sender.
    'RESEND_API_KEY' => '',

    // --- SLA checker ----------------------------------------------------------
    // When 1, sla-checker.php emails the ticket assignee on breach.
    'SLA_EMAIL_ASSIGNEE' => 0,
];
