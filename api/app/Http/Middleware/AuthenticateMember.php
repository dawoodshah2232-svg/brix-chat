<?php

namespace App\Http\Middleware;

use App\Support\Api\Json;
use App\Support\Api\Member;
use App\Support\Api\Sql;
use App\Support\WorkspaceToken;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Authenticates a workspace member from `Authorization: Bearer <token>` and
 * binds the App\Support\Api\Member context for the request.
 */
class AuthenticateMember
{
    public function handle(Request $request, Closure $next): Response
    {
        if (!preg_match('/^Bearer\s+(.+)$/i', trim((string) $request->header('Authorization', '')), $m)) {
            Json::fail('unauthorized', 'Missing bearer token', 401);
        }
        $token = WorkspaceToken::verify(trim($m[1]));
        if (!$token) {
            Json::fail('unauthorized', 'Invalid or expired token', 401);
        }

        $workspace = Sql::one('SELECT id, name, slug, status FROM workspaces WHERE id = ?', [$token['wid']]);
        $member = Sql::one('SELECT * FROM members WHERE id = ? AND workspace_id = ?', [$token['mid'], $token['wid']]);
        if (!$workspace || !$member) {
            Json::fail('unauthorized', 'Session is no longer valid', 401);
        }
        if (($workspace['status'] ?? 'active') === 'suspended') {
            Json::fail('suspended', 'This workspace is suspended. Contact the platform operator to reactivate it.', 403);
        }

        app()->instance(Member::class, new Member($workspace['id'], $member['id'], $member['role'], $member, $workspace));

        return $next($request);
    }
}
