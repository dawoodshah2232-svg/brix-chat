<?php

namespace App\Http\Controllers\Workspace;

use App\Support\Api\Activity;
use App\Support\Api\Catalog;
use App\Support\Api\Input;
use App\Support\Api\Json;
use App\Support\Api\Serialize;
use App\Support\Api\Sql;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Throwable;

/**
 * Team invites. The raw token is shown once at creation; only a salted
 * SHA-256 of it is stored. Invites expire after 7 days.
 */
class InviteController extends ApiController
{
    private const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    private const TTL_DAYS = 7;

    public function index(): JsonResponse
    {
        $c = $this->need('members', 'write');

        return Json::items(array_map([Serialize::class, 'invite'],
            Sql::all('SELECT * FROM member_invites WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 100', [$c->wid])));
    }

    public function store(Request $request): JsonResponse
    {
        $c = $this->need('members', 'write');
        $b = $this->body($request);
        $display = Input::str(Input::required($b, 'display_name'), 'display_name', 60);
        if (mb_strlen($display) < 2) {
            Json::fail('validation', 'display_name must be 2-60 characters', 422);
        }
        $role = Input::in($b['role'] ?? 'agent', Catalog::ROLES, 'role');
        $email = isset($b['email']) && $b['email'] !== '' ? Input::email($b['email']) : '';

        $token = '';
        for ($i = 0; $i < 16; $i++) {
            $token .= self::ALPHABET[random_int(0, strlen(self::ALPHABET) - 1)];
        }
        $salt = bin2hex(random_bytes(16));
        $id = Sql::uuid();
        $expires = time() + self::TTL_DAYS * 86400;
        Sql::run('INSERT INTO member_invites (id, workspace_id, email, display_name, role, token_hash, token_salt, expires_at, created_by)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [$id, $c->wid, $email, $display, $role, hash('sha256', $salt.':'.$token), $salt, gmdate('Y-m-d H:i:s', $expires), $c->mid]);

        $url = config('brix.site_origin').'/invite/'.$id;
        $emailStatus = 'skipped';
        if ($email !== '' && config('brix.mail_enabled')) {
            $emailStatus = self::send($email, 'You are invited to join '.$c->workspace['name'].' on Brix Chat',
                "Hi $display,\n\nYou have been invited as $role.\n\nAccept here: $url\nYour invite token: $token\n\nThis invite expires in 7 days.");
        }
        Activity::log($c, 'invite.created', 'member_invite', $id, ['display_name' => $display]);

        return Json::ok([
            'invite_id' => $id,
            'invite_url' => $url,
            'token' => $token, // returned once
            'expires_at' => gmdate('Y-m-d\TH:i:s.000\Z', $expires),
            'email' => $emailStatus,
        ], 201);
    }

    /** Public: create the member from a valid, unused, unexpired invite. */
    public function accept(Request $request): JsonResponse
    {
        $b = $this->body($request);
        $inviteId = Input::uuid($b['invite_id'] ?? null, 'invite_id');
        $token = Input::str(Input::required($b, 'token'), 'token', 64);
        $passcode = Input::passcode($b['passcode'] ?? null, 8, 128);

        $invite = Sql::one('SELECT * FROM member_invites WHERE id = ?', [$inviteId]);
        if ($invite === null) {
            Json::fail('not_found', 'Invite not found', 404);
        }
        self::assertUsable($invite, $token);

        $display = isset($b['display_name']) ? Input::str($b['display_name'], 'display_name', 60) : (string) $invite['display_name'];
        if (mb_strlen($display) < 2 || mb_strlen($display) > 60) {
            Json::fail('validation', 'display_name must be 2-60 characters', 422);
        }

        $memberId = DB::transaction(function () use ($inviteId, $token, $display, $passcode) {
            // Re-check under a row lock so an invite can only be accepted once.
            $invite = Sql::one('SELECT * FROM member_invites WHERE id = ? FOR UPDATE', [$inviteId]);
            if ($invite === null || $invite['used_at'] !== null) {
                Json::fail('gone', 'Invite already used', 410);
            }
            self::assertUsable($invite, $token);
            if (Sql::one('SELECT id FROM members WHERE workspace_id = ? AND LOWER(display_name) = LOWER(?)', [$invite['workspace_id'], $display])) {
                Json::fail('conflict', 'A member with this name already exists', 409);
            }
            $memberId = Sql::uuid();
            Sql::run('INSERT INTO members (id, workspace_id, display_name, initials, color, role, email, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [$memberId, $invite['workspace_id'], $display, Catalog::initials($display), '#4f46e5', $invite['role'], (string) $invite['email'], 'offline']);
            Sql::run('INSERT INTO member_credentials (member_id, passcode_hash) VALUES (?, ?)', [$memberId, password_hash($passcode, PASSWORD_BCRYPT)]);
            Sql::run('UPDATE member_invites SET used_at = UTC_TIMESTAMP() WHERE id = ?', [$inviteId]);

            return $memberId;
        });

        return Json::ok(['member' => Serialize::members([Sql::one('SELECT * FROM members WHERE id = ?', [$memberId])])[0]]);
    }

    private static function assertUsable(array $invite, string $token): void
    {
        if ($invite['used_at'] !== null) {
            Json::fail('gone', 'Invite already used', 410);
        }
        if (strtotime($invite['expires_at'].' UTC') < time()) {
            Json::fail('gone', 'Invite expired', 410);
        }
        if (!hash_equals((string) $invite['token_hash'], hash('sha256', $invite['token_salt'].':'.$token))) {
            Json::fail('unauthorized', 'Invalid invite token', 401);
        }
    }

    /** Plain-text mail through Laravel's configured mailer: 'sent' | 'failed'. */
    private static function send(string $to, string $subject, string $text): string
    {
        try {
            Mail::raw($text, fn ($message) => $message->to($to)->subject($subject));

            return 'sent';
        } catch (Throwable) {
            return 'failed';
        }
    }
}
