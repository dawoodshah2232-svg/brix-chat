<?php

use App\Http\Controllers\Admin;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\LegacyApiController;
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

// --- Everything else: legacy workspace API (being migrated area by area) --------
Route::any('/{route?}', LegacyApiController::class)->where('route', '^(?!admin/).*');
