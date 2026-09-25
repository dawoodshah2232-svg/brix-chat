<?php

namespace App\Http\Controllers;

use App\Support\PlatformSettings;
use App\Support\WorkspaceToken;
use App\Support\Workspaces;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/**
 * Workspace member auth (client dashboard). Platform operators use
 * Admin\AuthController — workspace owners are never platform admins.
 */
class AuthController extends Controller
{
    private function ok(mixed $data, int $status = 200): JsonResponse
    {
        return response()->json(['data' => $data], $status);
    }

    private function fail(string $code, string $message, int $status): JsonResponse
    {
        return response()->json(['error' => ['code' => $code, 'message' => $message]], $status);
    }

    private function suspended(): JsonResponse
    {
        return $this->fail('suspended', 'This workspace is suspended. Contact the platform operator to reactivate it.', 403);
    }

    /** Find which workspace an email/username belongs to (login step 1). */
    public function lookup(Request $request): JsonResponse
    {
        $needle = mb_strtolower(trim((string) $request->input('identity', '')));
        if ($needle === '') {
            return $this->ok(['found' => false]);
        }
        $member = DB::table('members')
            ->where(fn ($q) => $q->whereRaw('LOWER(email) = ?', [$needle])->orWhereRaw('LOWER(display_name) = ?', [$needle]))
            ->orderByRaw("email = '' , FIELD(role, 'owner', 'admin', 'agent', 'developer', 'viewer')")
            ->first();
        $workspace = $member ? DB::table('workspaces')->where('id', $member->workspace_id)->first() : null;
        if (!$workspace) {
            return $this->ok(['found' => false]);
        }

        return $this->ok([
            'found' => true,
            'workspace' => Workspaces::serializeWorkspace($workspace),
            'member' => ['id' => $member->id, 'display_name' => $member->display_name, 'email' => $member->email],
        ]);
    }

    public function signup(Request $request): JsonResponse
    {
        if (!PlatformSettings::get('allow_signup')) {
            return $this->fail('forbidden', 'New signups are currently closed.', 403);
        }
        $minPasscode = (int) PlatformSettings::get('passcode_min_length');
        $input = $request->validate([
            'workspace' => ['required', 'string', 'max:120'],
            'display_name' => ['required', 'string', 'max:60'],
            'email' => ['required', 'email', 'max:190'],
            'passcode' => ['required', 'string', "min:$minPasscode", 'max:128'],
        ]);
        if (DB::table('members')->whereRaw('LOWER(email) = ?', [mb_strtolower($input['email'])])->where('role', 'owner')->exists()) {
            return $this->fail('conflict', 'That email already owns a workspace — log in instead.', 409);
        }
        $defaultPlan = DB::table('plans')->orderBy('sort_order')->value('id');

        [$workspace, $member] = Workspaces::createWithOwner(
            ['name' => $input['workspace'], 'plan_id' => $defaultPlan, 'status' => 'trial'],
            $input['display_name'], $input['email'], $input['passcode'],
        );

        return $this->ok(Workspaces::session($workspace, $member), 201);
    }

    public function login(Request $request): JsonResponse
    {
        $slug = mb_strtolower(trim((string) $request->input('workspace', '')));
        $identity = mb_strtolower(trim((string) ($request->input('display_name') ?: $request->input('identity', ''))));
        $passcode = (string) $request->input('passcode', '');
        if ($slug === '' || $identity === '' || $passcode === '') {
            return $this->fail('validation', 'Workspace, username/email and passcode are required.', 422);
        }
        $workspace = DB::table('workspaces')->where('slug', $slug)->first();
        if (!$workspace) {
            return $this->fail('not_found', 'Workspace not found.', 404);
        }
        $member = DB::table('members')
            ->where('workspace_id', $workspace->id)
            ->where(fn ($q) => $q->whereRaw('LOWER(display_name) = ?', [$identity])->orWhereRaw('LOWER(email) = ?', [$identity]))
            ->first();
        $credential = $member ? DB::table('member_credentials')->where('member_id', $member->id)->first() : null;
        if (!$credential || !Hash::check($passcode, $credential->passcode_hash)) {
            return $this->fail('unauthorized', 'Invalid username/email or passcode.', 401);
        }
        if ($workspace->status === 'suspended') {
            return $this->suspended();
        }

        DB::table('members')->where('id', $member->id)->update(['last_login_at' => now(), 'status' => 'online', 'updated_at' => now()]);

        return $this->ok(Workspaces::session($workspace, DB::table('members')->where('id', $member->id)->first()));
    }

    public function me(Request $request): JsonResponse
    {
        if (!preg_match('/^Bearer\s+(.+)$/i', trim((string) $request->header('Authorization', '')), $m)) {
            return $this->fail('unauthorized', 'Missing bearer token.', 401);
        }
        $token = WorkspaceToken::verify($m[1]);
        if (!$token) {
            return $this->fail('unauthorized', 'Invalid or expired token.', 401);
        }
        $workspace = DB::table('workspaces')->where('id', $token['wid'])->first();
        $member = DB::table('members')->where('id', $token['mid'])->where('workspace_id', $token['wid'])->first();
        if (!$workspace || !$member) {
            return $this->fail('unauthorized', 'Session is no longer valid.', 401);
        }
        if ($workspace->status === 'suspended') {
            return $this->suspended();
        }

        return $this->ok(['workspace' => Workspaces::serializeWorkspace($workspace), 'member' => Workspaces::serializeMember($member)]);
    }
}
