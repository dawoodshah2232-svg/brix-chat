<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use RuntimeException;

/**
 * Creates the base Brix Chat schema (mysql/schema.sql) in an EMPTY database.
 * Safe to run on every deploy: it does nothing once the tables exist, so
 * existing data is never touched. Laravel migrations run after it.
 *
 * The demo workspaces at the end of schema.sql (public passcodes) are skipped
 * unless --demo is given.
 */
class InstallSchema extends Command
{
    protected $signature = 'brix:install-schema
        {--path= : Schema file (default: ../mysql/schema.sql next to the api folder)}
        {--demo : Also create the demo and acme workspaces (public passcodes, never in production)}';

    protected $description = 'Create the base schema in an empty database (no-op when it already exists)';

    /** First line of the demo-seed section in mysql/schema.sql. */
    private const SEED_MARKER = '/^-- Demo \+ Acme seed/';

    public function handle(): int
    {
        if (Schema::hasTable('workspaces')) {
            $this->info('Schema already installed; nothing to do.');

            return self::SUCCESS;
        }

        $path = $this->option('path') ?: base_path('../mysql/schema.sql');
        if (!is_file($path)) {
            $this->error("Schema file not found: $path");

            return self::FAILURE;
        }

        $statements = $this->statements((string) file_get_contents($path), (bool) $this->option('demo'));
        $pdo = DB::connection()->getPdo();
        foreach ($statements as $i => $sql) {
            try {
                $pdo->exec($sql);
            } catch (\Throwable $e) {
                throw new RuntimeException('Schema statement '.($i + 1).' failed: '.$e->getMessage()."\n".mb_substr($sql, 0, 300), 0, $e);
            }
        }
        $this->info('Base schema installed ('.count($statements).' statements'.($this->option('demo') ? ', with demo data' : '').').');

        return self::SUCCESS;
    }

    /**
     * Split a mysql-client script into statements, honouring DELIMITER lines
     * (used around triggers and procedures). Stops at the demo seed unless $demo.
     */
    private function statements(string $script, bool $demo): array
    {
        $delimiter = ';';
        $buffer = '';
        $out = [];
        foreach (preg_split('/\R/', $script) as $line) {
            if (!$demo && preg_match(self::SEED_MARKER, $line)) {
                break;
            }
            if (preg_match('/^\s*DELIMITER\s+(\S+)\s*$/i', $line, $m)) {
                $delimiter = $m[1];

                continue;
            }
            $buffer .= $line."\n";
            if (str_ends_with(rtrim($line), $delimiter)) {
                $sql = trim(substr(rtrim($buffer), 0, -strlen($delimiter)));
                if (self::hasCode($sql)) {
                    $out[] = $sql;
                }
                $buffer = '';
            }
        }
        if (self::hasCode(trim($buffer))) {
            $out[] = trim($buffer);
        }

        return $out;
    }

    /** True when the chunk contains more than comments and whitespace. */
    private static function hasCode(string $sql): bool
    {
        return trim((string) preg_replace('/^\s*--.*$/m', '', $sql)) !== '';
    }
}
