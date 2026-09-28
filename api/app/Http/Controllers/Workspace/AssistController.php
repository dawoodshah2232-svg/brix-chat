<?php

namespace App\Http\Controllers\Workspace;

use App\Support\Api\Activity;
use App\Support\Api\Input;
use App\Support\Api\Json;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Response;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Throwable;

/** AI copilot suggestions and outbound email. */
class AssistController extends ApiController
{
    private const MODES = [
        'reply' => 'Write only the reply text to send to the visitor. No preamble, no quotes around it.',
        'summary' => 'Summarize the conversation so far in a few short sentences for the agent.',
        'rewrite' => 'Rewrite the draft below, improving clarity and tone. Return only the rewritten text.',
    ];

    /** Public capability probe. */
    public function copilotInfo(): JsonResponse
    {
        return Json::ok(['ok' => true, 'function' => 'ai-copilot', 'modes' => array_keys(self::MODES), 'providers' => ['openai', 'anthropic']]);
    }

    /** One suggestion from the chosen provider. 501 until that provider's key is set in api/.env. */
    public function copilot(Request $request): JsonResponse
    {
        $this->member();
        $b = $this->body($request);
        $prompt = Input::str(Input::required($b, 'prompt'), 'prompt', 8000);
        if ($prompt === '') {
            Json::fail('validation', 'prompt must not be empty', 422);
        }
        $mode = Input::in($b['mode'] ?? 'reply', array_keys(self::MODES), 'mode');
        $tone = Input::in($b['tone'] ?? 'friendly', ['friendly', 'professional', 'concise'], 'tone');
        $provider = Input::in($b['provider'] ?? 'openai', ['openai', 'anthropic'], 'provider');
        $context = isset($b['context']) ? mb_substr(Input::str($b['context'], 'context', 100000), 0, 2000) : '';

        $system = "You are Brix Chat's AI copilot, assisting a support agent. Tone: $tone. ".self::MODES[$mode];
        $user = $prompt.($context !== '' ? "\n\nAdditional context:\n$context" : '');
        $key = (string) config($provider === 'openai' ? 'brix.ai.openai_key' : 'brix.ai.anthropic_key');
        if ($key === '') {
            Json::fail('not_configured', 'Connect an AI provider key in api/.env ('.($provider === 'openai' ? 'AI_API_KEY' : 'AI_ANTHROPIC_KEY').')', 501);
        }

        try {
            $response = $provider === 'openai' ? self::openai($key, $system, $user) : self::anthropic($key, $system, $user);
        } catch (ConnectionException) {
            Json::fail('ai_timeout', 'AI provider unreachable', 504);
        }
        $status = $response->status();
        if ($status === 401 || $status === 403) {
            Json::fail('ai_auth_failed', 'AI provider rejected the API key', 502);
        }
        if ($status === 429) {
            Json::fail('ai_rate_limited', 'AI provider rate limit hit', 429);
        }
        if ($status < 200 || $status >= 300) {
            Json::fail('ai_provider_error', 'AI provider error (HTTP '.$status.')', 502);
        }
        $suggestion = $provider === 'openai' ? $response->json('choices.0.message.content') : $response->json('content.0.text');
        if (!is_string($suggestion) || trim($suggestion) === '') {
            Json::fail('ai_empty_response', 'AI provider returned an empty response', 502);
        }

        return Json::ok(['suggestion' => $suggestion, 'provider' => $provider, 'mode' => $mode, 'tone' => $tone]);
    }

    private static function openai(string $key, string $system, string $user): Response
    {
        return Http::timeout(30)->connectTimeout(10)->withToken($key)->post('https://api.openai.com/v1/chat/completions', [
            'model' => config('brix.ai.model'),
            'messages' => [['role' => 'system', 'content' => $system], ['role' => 'user', 'content' => $user]],
            'temperature' => 0.4, 'max_tokens' => 600,
        ]);
    }

    private static function anthropic(string $key, string $system, string $user): Response
    {
        return Http::timeout(30)->connectTimeout(10)
            ->withHeaders(['x-api-key' => $key, 'anthropic-version' => '2023-06-01'])
            ->post('https://api.anthropic.com/v1/messages', [
                'model' => 'claude-sonnet-4-6',
                'max_tokens' => 600, 'temperature' => 0.4,
                'system' => $system,
                'messages' => [['role' => 'user', 'content' => $user]],
            ]);
    }

    /** Send an email (1-50 recipients, html or text) through Laravel's mailer. 501 while MAIL_ENABLED is off. */
    public function email(Request $request): JsonResponse
    {
        $c = $this->need('notifications', 'write');
        $b = $this->body($request);
        $to = $b['to'] ?? null;
        $recipients = array_values(array_filter(array_map(fn ($e) => is_string($e) ? trim($e) : '', is_array($to) ? $to : [$to])));
        if (!$recipients || count($recipients) > 50) {
            Json::fail('validation', 'to must be 1-50 recipients', 422);
        }
        foreach ($recipients as $address) {
            if (!filter_var($address, FILTER_VALIDATE_EMAIL)) {
                Json::fail('validation', "Invalid recipient: $address", 422);
            }
        }
        $subject = Input::str(Input::required($b, 'subject'), 'subject', 512);
        $html = isset($b['html']) ? (string) $b['html'] : '';
        $text = isset($b['text']) ? (string) $b['text'] : '';
        if (trim($html) === '' && trim($text) === '') {
            Json::fail('validation', 'html or text is required', 422);
        }
        if (!config('brix.mail_enabled')) {
            Json::fail('not_configured', 'Email is disabled. Set MAIL_ENABLED=true and the MAIL_* settings in api/.env', 501);
        }
        try {
            $send = fn ($message) => $message->to($recipients)->subject($subject);
            trim($html) !== '' ? Mail::html($html, $send) : Mail::raw($text, $send);
        } catch (Throwable) {
            Json::fail('email_failed', 'The mail server did not accept the message', 502);
        }
        Activity::log($c, 'email.sent', 'email', '', ['to' => count($recipients), 'subject' => $subject]);

        return Json::ok(['id' => 'mail-'.bin2hex(random_bytes(8))]);
    }
}
