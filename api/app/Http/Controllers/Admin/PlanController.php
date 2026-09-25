<?php

namespace App\Http\Controllers\Admin;

use App\Models\Plan;
use App\Models\Workspace;
use App\Support\PlatformAudit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class PlanController extends AdminController
{
    public function index(): JsonResponse
    {
        return $this->ok(Plan::orderBy('sort_order')->orderBy('price')->get());
    }

    public function store(Request $request): JsonResponse
    {
        $input = $this->validated($request);
        $id = Str::slug($input['name']) ?: 'plan';
        if (Plan::whereKey($id)->exists()) {
            return $this->fail('conflict', 'A plan with that name already exists.', 409);
        }
        $plan = Plan::create($input + ['id' => $id, 'sort_order' => (int) Plan::max('sort_order') + 1]);
        PlatformAudit::log($this->admin($request), 'plan.created', 'plan', $plan->id, ['name' => $plan->name, 'price' => $plan->price]);

        return $this->ok($plan, 201);
    }

    public function update(Request $request, Plan $plan): JsonResponse
    {
        $plan->fill($this->validated($request))->save();
        PlatformAudit::log($this->admin($request), 'plan.updated', 'plan', $plan->id, ['name' => $plan->name, 'price' => $plan->price]);

        return $this->ok($plan);
    }

    public function destroy(Request $request, Plan $plan): JsonResponse
    {
        $inUse = Workspace::where('plan_id', $plan->id)->count();
        if ($inUse > 0) {
            return $this->fail('conflict', "Cannot delete — $inUse client".($inUse > 1 ? 's are' : ' is').' on this plan. Move them first.', 409);
        }
        $plan->delete();
        PlatformAudit::log($this->admin($request), 'plan.deleted', 'plan', $plan->id, ['name' => $plan->name]);

        return $this->ok(['ok' => true]);
    }

    private function validated(Request $request): array
    {
        $input = $request->validate([
            'name' => ['required', 'string', 'max:80'],
            'price' => ['required', 'numeric', 'min:0', 'max:1000000'],
            'seats' => ['required', 'integer', 'min:1', 'max:10000'],
            'features' => ['present', 'array', 'max:30'],
            'features.*' => ['string', 'max:120'],
        ]);
        $input['features'] = array_values(array_filter(array_map('trim', $input['features'])));

        return $input;
    }
}
