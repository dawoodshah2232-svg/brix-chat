<?php

namespace App\Http\Controllers\Admin;

use App\Models\PlatformAdmin;
use App\Support\PlatformAudit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class AuthController extends AdminController
{
    public function login(Request $request): JsonResponse
    {
        $input = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
            'remember' => ['sometimes', 'boolean'],
        ]);

        $admin = PlatformAdmin::where('email', mb_strtolower(trim($input['email'])))->first();
        if (!$admin || !Hash::check($input['password'], $admin->password)) {
            return $this->fail('unauthorized', 'Invalid email or password.', 401);
        }

        $admin->forceFill(['last_login_at' => now()])->save();
        $expires = ($input['remember'] ?? false) ? now()->addDays(30) : now()->addHours(12);
        $token = $admin->createToken('platform-admin', ['platform-admin'], $expires)->plainTextToken;
        PlatformAudit::log($admin, 'admin.login', 'admin', (string) $admin->id);

        return $this->ok(['token' => $token, 'expires_at' => $expires->toIso8601String(), 'admin' => $this->serialize($admin)]);
    }

    public function me(Request $request): JsonResponse
    {
        return $this->ok(['admin' => $this->serialize($this->admin($request))]);
    }

    public function logout(Request $request): JsonResponse
    {
        $this->admin($request)->currentAccessToken()?->delete();

        return $this->ok(['ok' => true]);
    }

    private function serialize(PlatformAdmin $admin): array
    {
        return [
            'id' => $admin->id,
            'name' => $admin->name,
            'email' => $admin->email,
            'last_login_at' => $admin->last_login_at?->toIso8601String(),
        ];
    }
}
