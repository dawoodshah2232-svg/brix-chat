<?php

namespace App\Support;

use App\Models\PlatformAdmin;
use Illuminate\Support\Facades\DB;

class PlatformAudit
{
    public static function log(?PlatformAdmin $admin, string $action, string $entity, string $entityId = '', array $meta = []): void
    {
        DB::table('platform_audit')->insert([
            'admin_id' => $admin?->id,
            'actor' => $admin?->email ?? 'system',
            'action' => $action,
            'entity' => $entity,
            'entity_id' => $entityId,
            'meta' => json_encode($meta, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
            'created_at' => now(),
        ]);
    }
}
