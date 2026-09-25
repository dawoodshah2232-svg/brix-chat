<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/** Workspace creation + the auth-payload serializers shared by signup, login and admin view-as. */
class Workspaces
{
    public static function uniqueSlug(string $name): string
    {
        $base = trim(Str::slug($name), '-') ?: 'workspace';
        $slug = $base;
        for ($i = 2; DB::table('workspaces')->where('slug', $slug)->exists(); $i++) {
            $slug = $base.'-'.$i;
        }

        return $slug;
    }

    /**
     * Create a workspace plus its owner member and passcode credential.
     *
     * @return array{0: object, 1: object} [workspace row, member row]
     */
    public static function createWithOwner(array $workspace, string $ownerName, string $ownerEmail, string $passcode): array
    {
        return DB::transaction(function () use ($workspace, $ownerName, $ownerEmail, $passcode) {
            $now = now();
            $workspaceId = (string) Str::uuid();
            $memberId = (string) Str::uuid();

            DB::table('workspaces')->insert([
                'id' => $workspaceId,
                'name' => $workspace['name'],
                'slug' => $workspace['slug'] ?? self::uniqueSlug($workspace['name']),
                'plan_id' => $workspace['plan_id'] ?? null,
                'status' => $workspace['status'] ?? 'active',
                'seats' => $workspace['seats'] ?? 3,
                'notes' => $workspace['notes'] ?? null,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
            DB::table('members')->insert([
                'id' => $memberId,
                'workspace_id' => $workspaceId,
                'display_name' => $ownerName,
                'initials' => mb_strtoupper(mb_substr($ownerName, 0, 2)),
                'color' => '#4f46e5',
                'role' => 'owner',
                'email' => mb_strtolower($ownerEmail),
                'job_title' => 'Workspace Owner',
                'status' => 'offline',
                'created_at' => $now,
                'updated_at' => $now,
            ]);
            DB::table('member_credentials')->insert([
                'member_id' => $memberId,
                'passcode_hash' => Hash::make($passcode),
                'updated_at' => $now,
            ]);

            return [
                DB::table('workspaces')->where('id', $workspaceId)->first(),
                DB::table('members')->where('id', $memberId)->first(),
            ];
        });
    }

    public static function serializeWorkspace(object $w): array
    {
        return ['id' => $w->id, 'name' => $w->name, 'slug' => $w->slug, 'status' => $w->status ?? 'active'];
    }

    public static function serializeMember(object $m): array
    {
        return [
            'id' => $m->id,
            'workspace_id' => $m->workspace_id,
            'display_name' => $m->display_name,
            'initials' => $m->initials,
            'color' => $m->color,
            'role' => $m->role,
            'email' => $m->email,
            'job_title' => $m->job_title,
            'avatar_url' => $m->avatar_url,
            'status' => $m->status,
            'last_login_at' => $m->last_login_at,
            'created_at' => $m->created_at,
            'updated_at' => $m->updated_at,
        ];
    }

    /** {token, workspace, member} — the payload every workspace login returns. */
    public static function session(object $workspace, object $member, int $ttl = WorkspaceToken::TTL): array
    {
        return [
            'token' => WorkspaceToken::issue($workspace->id, $member->id, $ttl),
            'workspace' => self::serializeWorkspace($workspace),
            'member' => self::serializeMember($member),
        ];
    }
}
