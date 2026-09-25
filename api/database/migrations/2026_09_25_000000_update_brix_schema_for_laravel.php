<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('workspaces') || !Schema::hasTable('members')) {
            throw new RuntimeException('Brix base schema is missing. Import mysql/schema.sql first, then run php artisan migrate.');
        }

        DB::statement("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci");

        $this->replaceRoleCheck('members', 'members_role_check');
        if (Schema::hasTable('member_invites')) {
            $this->replaceRoleCheck('member_invites', 'member_invites_role_check');
        }
    }

    public function down(): void
    {
        // Keep the 'owner' (workspace owner) role; reversing would orphan owner members.
    }

    private function replaceRoleCheck(string $table, string $constraint): void
    {
        if ($this->checkConstraintExists($constraint)) {
            try {
                DB::statement("ALTER TABLE `$table` DROP CHECK `$constraint`");
            } catch (Throwable $e) {
                DB::statement("ALTER TABLE `$table` DROP CONSTRAINT `$constraint`");
            }
        }

        DB::statement("ALTER TABLE `$table` ADD CONSTRAINT `$constraint` CHECK (`role` IN ('owner','admin','agent','developer','viewer'))");
    }

    private function checkConstraintExists(string $constraint): bool
    {
        return (bool) DB::table('information_schema.CHECK_CONSTRAINTS')
            ->whereRaw('CONSTRAINT_SCHEMA = DATABASE()')
            ->where('CONSTRAINT_NAME', $constraint)
            ->exists();
    }
};
