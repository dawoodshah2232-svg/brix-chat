<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Platform (operator) layer, separate from client workspaces:
 *  - platform_admins   operator accounts (Sanctum tokens), never workspace members
 *  - plans             billing catalog
 *  - platform_settings key/value platform config
 *  - platform_audit    operator actions (suspend, plan change, view-as, ...)
 *  - workspaces        + plan_id / status / seats / notes
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('platform_admins', function (Blueprint $table) {
            $table->id();
            $table->string('name', 120);
            $table->string('email', 190)->unique();
            $table->string('password');
            $table->timestamp('last_login_at')->nullable();
            $table->timestamps();
        });

        Schema::create('plans', function (Blueprint $table) {
            $table->string('id', 40)->primary();
            $table->string('name', 80);
            $table->decimal('price', 10, 2)->default(0);
            $table->unsignedInteger('seats')->default(1);
            $table->json('features');
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::create('platform_settings', function (Blueprint $table) {
            $table->string('key', 80)->primary();
            $table->json('value');
            $table->timestamp('updated_at')->nullable();
        });

        Schema::create('platform_audit', function (Blueprint $table) {
            $table->id();
            $table->foreignId('admin_id')->nullable()->constrained('platform_admins')->nullOnDelete();
            $table->string('actor', 190);
            $table->string('action', 80);
            $table->string('entity', 40);
            $table->string('entity_id', 64)->default('');
            $table->json('meta')->nullable();
            $table->timestamp('created_at')->useCurrent()->index();
        });

        Schema::table('workspaces', function (Blueprint $table) {
            $table->string('plan_id', 40)->nullable()->after('slug');
            $table->string('status', 20)->default('active')->after('plan_id');
            $table->unsignedInteger('seats')->default(3)->after('status');
            $table->text('notes')->nullable()->after('seats');
            $table->foreign('plan_id')->references('id')->on('plans')->restrictOnDelete();
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::table('workspaces', function (Blueprint $table) {
            $table->dropForeign(['plan_id']);
            $table->dropIndex(['status']);
            $table->dropColumn(['plan_id', 'status', 'seats', 'notes']);
        });
        Schema::dropIfExists('platform_audit');
        Schema::dropIfExists('platform_settings');
        Schema::dropIfExists('plans');
        Schema::dropIfExists('platform_admins');
    }
};
