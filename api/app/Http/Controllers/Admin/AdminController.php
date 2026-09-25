<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\PlatformAdmin;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Base for /api/admin/* — same {data} / {error:{code,message}} envelope as the workspace API. */
abstract class AdminController extends Controller
{
    protected function ok(mixed $data, int $status = 200): JsonResponse
    {
        return response()->json(['data' => $data], $status);
    }

    protected function fail(string $code, string $message, int $status): JsonResponse
    {
        return response()->json(['error' => ['code' => $code, 'message' => $message]], $status);
    }

    protected function admin(Request $request): PlatformAdmin
    {
        return $request->user();
    }
}
