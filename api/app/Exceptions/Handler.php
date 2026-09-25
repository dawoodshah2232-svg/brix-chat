<?php

namespace App\Exceptions;

use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Exceptions\Handler as ExceptionHandler;
use Illuminate\Http\Exceptions\ThrottleRequestsException;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Throwable;

class Handler extends ExceptionHandler
{
    /**
     * The list of the inputs that are never flashed to the session on validation exceptions.
     *
     * @var array<int, string>
     */
    protected $dontFlash = [
        'current_password',
        'password',
        'password_confirmation',
    ];

    public function register(): void
    {
        // Every /api response uses the {error: {code, message}} envelope the SPA expects.
        $this->renderable(function (Throwable $e, Request $request) {
            if (!$request->is('api/*')) {
                return null;
            }
            [$status, $code, $message] = match (true) {
                $e instanceof ValidationException => [422, 'validation', collect($e->errors())->flatten()->first() ?? 'Invalid input.'],
                $e instanceof AuthenticationException => [401, 'unauthorized', 'Please sign in again.'],
                $e instanceof ModelNotFoundException => [404, 'not_found', 'Not found.'],
                $e instanceof ThrottleRequestsException => [429, 'rate_limited', 'Too many attempts. Wait a minute and try again.'],
                $e instanceof HttpExceptionInterface => [$e->getStatusCode(), $e->getStatusCode() === 404 ? 'not_found' : 'http_error', $e->getMessage() ?: 'Request failed.'],
                default => [500, 'server_error', config('app.debug') ? $e->getMessage() : 'Internal server error.'],
            };

            return response()->json(['error' => ['code' => $code, 'message' => $message]], $status);
        });
    }
}
