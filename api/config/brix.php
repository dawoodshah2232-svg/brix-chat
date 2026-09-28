<?php

// Brix Chat application settings (formerly api/legacy/config.php).

return [
    // Signs workspace member bearer tokens. Changing it signs everyone out.
    'secret' => env('APP_SECRET', ''),

    // The dashboard origin: CORS allow-list and links in invite emails.
    'site_origin' => rtrim((string) env('SITE_ORIGIN', env('FRONTEND_URL', 'http://localhost:5173')), '/'),

    // AI copilot providers. An empty key makes /ai/copilot answer 501.
    'ai' => [
        'openai_key' => env('AI_API_KEY', ''),
        'anthropic_key' => env('AI_ANTHROPIC_KEY', ''),
        'model' => env('AI_MODEL', 'gpt-4o-mini'),
    ],

    // Outbound email (invites, /email/send, SLA alerts) through Laravel's mailer.
    // Off by default: endpoints then answer 501 / "skipped".
    'mail_enabled' => (bool) env('MAIL_ENABLED', false),

    // Email a ticket's assignee when the SLA checker marks it breached.
    'sla_email_assignee' => (bool) env('SLA_EMAIL_ASSIGNEE', false),

    // Requests per minute per client IP across the API (the `api` rate limiter).
    'rate_limit' => (int) env('API_RATE_LIMIT', 60),
];
