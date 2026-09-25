<?php

namespace App\Models;

use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

/** Platform operator account. Separate from workspace members. */
class PlatformAdmin extends Authenticatable
{
    use HasApiTokens;

    protected $fillable = ['name', 'email', 'password', 'last_login_at'];

    protected $hidden = ['password'];

    protected $casts = [
        'password' => 'hashed',
        'last_login_at' => 'datetime',
    ];
}
