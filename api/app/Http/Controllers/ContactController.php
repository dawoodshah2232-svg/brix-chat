<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Support\Api\Input;
use App\Support\Api\Json;
use App\Support\Api\Sql;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Public contact form (marketing site). Server-side validation +
 * honeypot ("website" must stay empty) + route-level throttle.
 * Honeypot hits are silently accepted so bots learn nothing.
 */
class ContactController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $b = Input::body($request);

        // Honeypot: real users never fill this (hidden field). Silently
        // accept so automated submitters get no signal.
        if (isset($b['website']) && trim((string) $b['website']) !== '') {
            return Json::ok(['id' => null, 'received' => true]);
        }

        $name = Input::str(Input::required($b, 'name'), 'name', 120);
        if (mb_strlen($name) < 2) {
            Json::fail('validation', 'name must be at least 2 characters', 422);
        }
        $email = Input::email(Input::required($b, 'email'), 'email');
        $subject = isset($b['subject']) ? Input::str($b['subject'], 'subject', 190) : '';
        if ($subject === '') {
            $subject = 'Website contact';
        }
        $message = Input::str(Input::required($b, 'message'), 'message', 10000);
        if (mb_strlen($message) < 10) {
            Json::fail('validation', 'message must be at least 10 characters', 422);
        }

        $id = Sql::uuid();
        Sql::run(
            'INSERT INTO contact_messages (id, name, email, subject, message, ip, user_agent, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())',
            [
                $id,
                $name,
                $email,
                $subject,
                $message,
                substr((string) $request->ip(), 0, 45),
                substr((string) $request->userAgent(), 0, 512),
            ]
        );

        return Json::ok([
            'id' => $id,
            'name' => $name,
            'email' => $email,
            'subject' => $subject,
            'message' => $message,
            'read' => false,
            'created_at' => Json::now(),
        ], 201);
    }
}
