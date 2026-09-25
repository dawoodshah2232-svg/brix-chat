<?php

namespace App\Http\Controllers\Admin;

use App\Models\Workspace;
use App\Support\PlatformAudit;
use App\Support\PlatformSettings;
use App\Support\WorkspaceStats;
use App\Support\Workspaces;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class WorkspaceController extends AdminController
{
    public function index(): JsonResponse
    {
        $stats = WorkspaceStats::perWorkspace();
        $rows = Workspace::orderBy('name')->get()->map(fn (Workspace $w) => $this->serialize($w) + ['stats' => $stats[$w->id] ?? null]);

        return $this->ok($rows);
    }

    public function store(Request $request): JsonResponse
    {
        $minPasscode = (int) PlatformSettings::get('passcode_min_length');
        $input = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'slug' => ['nullable', 'string', 'max:60', 'regex:/^[a-z0-9]+(?:-[a-z0-9]+)*$/'],
            'plan_id' => ['nullable', 'string', 'exists:plans,id'],
            'status' => ['nullable', Rule::in(Workspace::STATUSES)],
            'seats' => ['nullable', 'integer', 'min:1', 'max:10000'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'owner_name' => ['required', 'string', 'max:60'],
            'owner_email' => ['required', 'email', 'max:190'],
            'owner_passcode' => ['required', 'string', "min:$minPasscode", 'max:128'],
        ]);
        if (!empty($input['slug']) && DB::table('workspaces')->where('slug', $input['slug'])->exists()) {
            return $this->fail('conflict', 'That workspace slug is already taken.', 409);
        }

        [$workspace] = Workspaces::createWithOwner($input, $input['owner_name'], $input['owner_email'], $input['owner_passcode']);
        PlatformAudit::log($this->admin($request), 'client.created', 'workspace', $workspace->id, ['name' => $workspace->name, 'slug' => $workspace->slug]);

        return $this->ok($this->serialize(Workspace::findOrFail($workspace->id)), 201);
    }

    public function update(Request $request, Workspace $workspace): JsonResponse
    {
        $input = $request->validate([
            'name' => ['sometimes', 'string', 'max:120'],
            'plan_id' => ['sometimes', 'nullable', 'string', 'exists:plans,id'],
            'status' => ['sometimes', Rule::in(Workspace::STATUSES)],
            'seats' => ['sometimes', 'integer', 'min:1', 'max:10000'],
            'notes' => ['sometimes', 'nullable', 'string', 'max:2000'],
        ]);
        $before = $workspace->only(array_keys($input));
        $workspace->fill($input)->save();

        $action = match (true) {
            isset($input['status']) && $input['status'] !== ($before['status'] ?? null)
                => $input['status'] === 'suspended' ? 'client.suspended' : 'client.status_changed',
            array_key_exists('plan_id', $input) && $input['plan_id'] !== ($before['plan_id'] ?? null) => 'client.plan_changed',
            default => 'client.updated',
        };
        PlatformAudit::log($this->admin($request), $action, 'workspace', $workspace->id, ['name' => $workspace->name, 'before' => $before, 'after' => $input]);

        return $this->ok($this->serialize($workspace));
    }

    /** View-as: a short-lived workspace token for the workspace owner (or its first admin). */
    public function impersonate(Request $request, Workspace $workspace): JsonResponse
    {
        $member = DB::table('members')->where('workspace_id', $workspace->id)
            ->orderByRaw("FIELD(role, 'owner', 'admin', 'agent', 'developer', 'viewer')")
            ->orderBy('created_at')
            ->first();
        if (!$member) {
            return $this->fail('not_found', 'This workspace has no members to view as.', 404);
        }
        PlatformAudit::log($this->admin($request), 'client.viewed_as', 'workspace', $workspace->id, ['name' => $workspace->name, 'member' => $member->display_name]);

        $row = DB::table('workspaces')->where('id', $workspace->id)->first();

        return $this->ok(Workspaces::session($row, $member, 2 * 3600));
    }

    private function serialize(Workspace $w): array
    {
        return [
            'id' => $w->id,
            'name' => $w->name,
            'slug' => $w->slug,
            'plan_id' => $w->plan_id,
            'status' => $w->status,
            'seats' => $w->seats,
            'notes' => $w->notes,
            'created_at' => $w->created_at?->toIso8601String(),
        ];
    }
}
