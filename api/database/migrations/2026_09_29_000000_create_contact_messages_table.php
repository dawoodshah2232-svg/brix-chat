<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Public contact-form inbox. Messages land here from the marketing site's
 * contact page (POST /api/contact, throttled + honeypot-checked). The
 * platform admin console reads them; no workspace scoping — these are
 * pre-account inquiries to the Brix Chat team itself.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('contact_messages', function (Blueprint $table) {
            $table->char('id', 36)->primary();
            $table->string('name', 120);
            $table->string('email', 190);
            $table->string('subject', 190)->default('Website contact');
            $table->text('message');
            $table->string('ip', 45)->nullable();
            $table->string('user_agent', 512)->nullable();
            $table->boolean('read')->default(false);
            $table->timestamp('created_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('contact_messages');
    }
};
