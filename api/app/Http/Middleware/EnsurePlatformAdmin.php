<?php

namespace App\Http\Middleware;

use App\Models\PlatformAdmin;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Only Sanctum tokens issued to a PlatformAdmin (ability platform-admin) pass. */
class EnsurePlatformAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if (!$user instanceof PlatformAdmin || !$user->tokenCan('platform-admin')) {
            return response()->json(['error' => ['code' => 'forbidden', 'message' => 'Platform admin access required.']], 403);
        }

        return $next($request);
    }
}
