<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Plan extends Model
{
    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = ['id', 'name', 'price', 'seats', 'features', 'sort_order'];

    protected $casts = [
        'price' => 'float',
        'seats' => 'integer',
        'features' => 'array',
        'sort_order' => 'integer',
    ];
}
