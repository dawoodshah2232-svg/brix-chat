<?php

use App\Http\Controllers\Admin;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\ContactController;
use App\Http\Controllers\Workspace;
use Illuminate\Support\Facades\Route;

Route::get('/health', fn () => response()->json(['data' => ['ok' => true, 'service' => 'brix-chat-api']]));

// --- Workspace member auth (client dashboard) ---------------------------------
Route::prefix('auth')->group(function () {
    Route::post('lookup', [AuthController::class, 'lookup'])->middleware('throttle:30,1');
    Route::post('signup', [AuthController::class, 'signup'])->middleware('throttle:10,1');
    Route::post('login', [AuthController::class, 'login'])->middleware('throttle:20,1');
    Route::get('me', [AuthController::class, 'me']);
});

// --- Platform admin (operator console) ------------------------------------------
Route::prefix('admin')->group(function () {
    Route::post('auth/login', [Admin\AuthController::class, 'login'])->middleware('throttle:10,1');

    Route::middleware(['auth:sanctum', 'platform.admin'])->group(function () {
        Route::get('auth/me', [Admin\AuthController::class, 'me']);
        Route::post('auth/logout', [Admin\AuthController::class, 'logout']);

        Route::get('overview', [Admin\PlatformController::class, 'overview']);
        Route::get('properties', [Admin\PlatformController::class, 'properties']);
        Route::get('audit', [Admin\PlatformController::class, 'audit']);
        Route::get('system', [Admin\PlatformController::class, 'system']);
        Route::get('settings', [Admin\PlatformController::class, 'settings']);
        Route::patch('settings', [Admin\PlatformController::class, 'updateSettings']);

        Route::get('workspaces', [Admin\WorkspaceController::class, 'index']);
        Route::post('workspaces', [Admin\WorkspaceController::class, 'store']);
        Route::patch('workspaces/{workspace}', [Admin\WorkspaceController::class, 'update']);
        Route::post('workspaces/{workspace}/impersonate', [Admin\WorkspaceController::class, 'impersonate']);

        Route::get('plans', [Admin\PlanController::class, 'index']);
        Route::post('plans', [Admin\PlanController::class, 'store']);
        Route::patch('plans/{plan}', [Admin\PlanController::class, 'update']);
        Route::delete('plans/{plan}', [Admin\PlanController::class, 'destroy']);
    });
});

// --- Workspace API (client dashboard) ---------------------------------------------
// Multi-word resources answer on both spellings (saved-views and saved_views),
// and a few resources keep their table-name aliases, as the SPA has always used.
$paths = fn (string ...$names) => array_values(array_unique(array_merge(...array_map(
    fn ($name) => [$name, str_replace('-', '_', $name)], $names,
))));

// Public: accepting an invite (the token is the credential) and the copilot capability probe.
foreach ($paths('invites', 'member-invites') as $p) {
    Route::post("$p/accept", [Workspace\InviteController::class, 'accept'])->middleware('throttle:20,1');
}
Route::get('ai/copilot', [Workspace\AssistController::class, 'copilotInfo']);

// Public contact form: server-side validation + honeypot + throttle.
Route::post('contact', [ContactController::class, 'store'])->middleware('throttle:5,1');

Route::middleware('member')->group(function () use ($paths) {
    Route::controller(Workspace\WorkspaceController::class)->group(function () {
        Route::post('workspaces', 'store');
        foreach (['workspaces', 'workspaces/current'] as $p) {
            Route::get($p, 'show');
            Route::patch($p, 'update');
            Route::delete($p, 'destroy');
        }
    });

    Route::controller(Workspace\PropertyController::class)->prefix('properties')->group(function () {
        Route::get('/', 'index');
        Route::post('/', 'store');
        Route::get('by-key/{key}', 'byKey');
        Route::get('{id}', 'show');
        Route::patch('{id}', 'update');
        Route::delete('{id}', 'destroy');
        Route::post('{id}/regenerate-key', 'regenerateKey');
        Route::get('{id}/widget-config', 'widgetConfig');
        Route::patch('{id}/widget-config', 'updateWidgetConfig');
        Route::get('{id}/settings', 'settings');
        Route::patch('{id}/settings', 'updateSettings');
    });

    Route::controller(Workspace\ConversationController::class)->group(function () {
        Route::prefix('conversations')->group(function () {
            Route::get('/', 'index');
            Route::post('/', 'store');
            Route::get('{id}', 'show');
            Route::patch('{id}', 'update');
            Route::delete('{id}', 'destroy');
            Route::get('{id}/messages', 'messages');
            Route::post('{id}/messages', 'sendMessage');
            Route::get('{id}/notes', 'notes');
            Route::post('{id}/notes', 'addNote');
            foreach (['assign', 'transfer', 'status', 'tags', 'rating', 'read', 'close', 'reopen'] as $action) {
                Route::post("{id}/$action", $action);
            }
        });
        Route::patch('messages/{id}', 'updateMessage');
    });

    Route::controller(Workspace\ContactController::class)->group(function () use ($paths) {
        Route::get('contacts', 'index');
        Route::post('contacts', 'store');
        Route::get('contacts/{id}', 'show');
        Route::patch('contacts/{id}', 'update');
        Route::delete('contacts/{id}', 'destroy');
        foreach ($paths('contact-events') as $p) {
            Route::get($p, 'events');
            Route::post($p, 'storeEvent');
            Route::get("$p/{id}", 'showEvent');
            Route::patch("$p/{id}", 'updateEvent');
            Route::delete("$p/{id}", 'destroyEvent');
        }
    });

    Route::controller(Workspace\TicketController::class)->prefix('tickets')->group(function () {
        Route::get('/', 'index');
        Route::post('/', 'store');
        Route::post('bulk', 'bulk');
        Route::post('from-conversation', 'fromConversation');
        Route::get('{id}', 'show');
        Route::patch('{id}', 'update');
        Route::delete('{id}', 'destroy');
        foreach (['status', 'assign', 'priority', 'merge', 'split'] as $action) {
            Route::post("{id}/$action", $action);
        }
    });

    Route::controller(Workspace\NotificationController::class)->prefix('notifications')->group(function () {
        Route::get('/', 'index');
        Route::post('/', 'store');
        Route::post('read-all', 'readAll');
        Route::post('{id}/read', 'read');
        Route::delete('{id}', 'destroy');
    });

    Route::controller(Workspace\RatingController::class)->prefix('ratings')->group(function () {
        Route::get('summary', 'summary');
        Route::get('/', 'index');
        Route::post('/', 'store');
    });

    Route::any('metrics/{kind}', Workspace\MetricsController::class);

    Route::controller(Workspace\DepartmentController::class)->prefix('departments')->group(function () {
        Route::get('/', 'index');
        Route::post('/', 'store');
        Route::get('{id}', 'show');
        Route::patch('{id}', 'update');
        Route::delete('{id}', 'destroy');
    });

    Route::controller(Workspace\CategoryController::class)->prefix('categories')->group(function () {
        Route::get('/', 'index');
        Route::post('/', 'store');
        Route::get('{id}', 'show');
        Route::patch('{id}', 'update');
        Route::delete('{id}', 'destroy');
    });

    Route::controller(Workspace\PlaybookController::class)->group(function () use ($paths) {
        foreach ($paths('saved-views') as $p) {
            Route::get($p, 'views');
            Route::post($p, 'storeView');
            Route::delete("$p/{id}", 'destroyView');
        }
        Route::get('plays', 'plays');
        Route::post('plays', 'storePlay');
        Route::delete('plays/{id}', 'destroyPlay');
        Route::post('plays/{id}/run', 'runPlay');
        Route::get('goals', 'goals');
        Route::post('goals', 'storeGoal');
        Route::get('goals/funnel', 'funnel');
        Route::delete('goals/{id}', 'destroyGoal');
        Route::post('goals/{id}/track', 'trackGoal');
    });

    Route::controller(Workspace\MemberController::class)->prefix('members')->group(function () {
        Route::get('/', 'index');
        Route::post('/', 'store');
        Route::get('{id}', 'show');
        Route::patch('{id}', 'update');
        Route::delete('{id}', 'destroy');
        Route::post('{id}/passcode', 'passcode');
        Route::post('{id}/status', 'status');
        Route::post('{id}/touch-login', 'touchLogin');
    });

    foreach ($paths('invites', 'member-invites') as $p) {
        Route::get($p, [Workspace\InviteController::class, 'index']);
        Route::post($p, [Workspace\InviteController::class, 'store']);
    }

    Route::controller(Workspace\KnowledgeBaseController::class)->group(function () use ($paths) {
        Route::get('kb/articles/search', 'search');
        Route::get('kb/articles', 'index');
        Route::post('kb/articles', 'store');
        Route::get('kb/articles/{id}', 'show');
        Route::patch('kb/articles/{id}', 'update');
        Route::delete('kb/articles/{id}', 'destroy');
        foreach ($paths('unanswered', 'unanswered-questions') as $p) {
            Route::get($p, 'unanswered');
            Route::post($p, 'logUnanswered');
            Route::post("$p/{id}/dismiss", 'dismissUnanswered');
            Route::post("$p/{id}/promote", 'promoteUnanswered');
        }
    });

    Route::controller(Workspace\AutomationController::class)->group(function () use ($paths) {
        foreach ($paths('canned', 'canned-responses') as $p) {
            Route::get($p, 'canned');
            Route::post($p, 'storeCanned');
            Route::get("$p/{id}", 'showCanned');
            Route::patch("$p/{id}", 'updateCanned');
            Route::delete("$p/{id}", 'destroyCanned');
        }
        foreach (['triggers', 'flows'] as $p) {
            Route::get($p, 'triggers');
            Route::post($p, 'storeTrigger');
            Route::get("$p/{id}", 'showTrigger');
            Route::patch("$p/{id}", 'updateTrigger');
            Route::delete("$p/{id}", 'destroyTrigger');
        }
    });

    Route::controller(Workspace\DeveloperController::class)->group(function () use ($paths) {
        foreach ($paths('api-keys') as $p) {
            Route::get($p, 'keys');
            Route::post($p, 'storeKey');
            Route::get("$p/{id}", 'showKey');
            Route::get("$p/{id}/reveal", 'revealKey');
            Route::post("$p/{id}/rotate", 'rotateKey');
            Route::post("$p/{id}/revoke", 'revokeKey');
            Route::delete("$p/{id}", 'destroyKey');
        }
        Route::get('webhooks', 'webhooks');
        Route::post('webhooks', 'storeWebhook');
        Route::get('webhooks/{id}', 'showWebhook');
        Route::patch('webhooks/{id}', 'updateWebhook');
        Route::delete('webhooks/{id}', 'destroyWebhook');
        Route::post('webhooks/{id}/dispatch', 'dispatch');
        Route::get('webhooks/{id}/deliveries', 'webhookDeliveries');
        foreach ($paths('webhook-deliveries') as $p) {
            Route::get($p, 'deliveries');
            Route::get("$p/{id}", 'delivery');
        }
    });

    Route::controller(Workspace\SettingsController::class)->group(function () use ($paths) {
        Route::get('integrations', 'integrations');
        Route::patch('integrations/{provider}', 'updateIntegration');
        foreach ($paths('audit-log') as $p) {
            Route::get($p, 'auditLog');
            Route::post($p, 'appendAudit');
        }
    });

    Route::controller(Workspace\VisitorController::class)->group(function () {
        Route::get('visitors', 'index');
        Route::post('visitors', 'store');
        Route::get('visitors/{id}', 'show');
        Route::patch('visitors/{id}', 'update');
        Route::delete('visitors/{id}', 'destroy');
        Route::get('updates', 'updates');
    });

    Route::post('ai/copilot', [Workspace\AssistController::class, 'copilot']);
    Route::post('email/send', [Workspace\AssistController::class, 'email']);
});
