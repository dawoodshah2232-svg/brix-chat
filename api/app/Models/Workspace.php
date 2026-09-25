<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Workspace extends Model
{
    use HasUuids;

    public const STATUSES = ['active', 'trial', 'suspended'];

    protected $fillable = ['name', 'slug', 'plan_id', 'status', 'seats', 'notes'];

    protected $casts = ['seats' => 'integer'];

    public function plan(): BelongsTo
    {
        return $this->belongsTo(Plan::class);
    }

    public function isSuspended(): bool
    {
        return $this->status === 'suspended';
    }
}
