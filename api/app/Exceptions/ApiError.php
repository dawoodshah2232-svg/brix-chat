<?php

namespace App\Exceptions;

use Exception;

/**
 * An expected API failure, rendered as {error: {code, message}} with its HTTP status.
 * Codes are part of the frontend contract (src/lib/php-client.ts maps them).
 */
class ApiError extends Exception
{
    public function __construct(public readonly string $errorCode, string $message, public readonly int $status = 400)
    {
        parent::__construct($message);
    }
}
