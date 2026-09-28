<?php

namespace App\Http\Controllers\Workspace;

use App\Http\Controllers\Controller;
use App\Support\Api\Input;
use App\Support\Api\Member;
use Illuminate\Http\Request;

/**
 * Base for the workspace (client dashboard) API. Routes using these
 * controllers sit behind the `member` middleware, which binds Member.
 */
abstract class ApiController extends Controller
{
    protected function member(): Member
    {
        return app(Member::class);
    }

    /** Current member, after enforcing the role matrix for $table/$op. */
    protected function need(string $table, string $op): Member
    {
        return $this->member()->need($table, $op);
    }

    protected function body(Request $request): array
    {
        return Input::body($request);
    }

    protected function query(Request $request, string $key, mixed $default = null): mixed
    {
        return Input::query($request, $key, $default);
    }
}
