<?php
/**
 * The command-line helpers, for a copy that is set up (the setup page,
 * /setup.php, does the setting up):
 *
 *   php backend/manage.php --check          what isn't ready (changes nothing); exit code 1 if anything
 *   php backend/manage.php --sync           rebuild the study content even if backend/data/ didn't change
 *                                           (the migrations that wait are applied first, after a copy, as
 *                                           every option but --check does: the anotoki library's engine,
 *                                           db_migrator(), the same as the Migrations page's Apply)
 *   php backend/manage.php --backup         write a backup of all the study data now (backend/storage/backups/),
 *                                           also while a migration waits (one still being written)
 *   php backend/manage.php --restore=FILE   replace the study data with a backup's; what is there now is
 *                                           backed up first. A copy of somebody's data alone (taken
 *                                           before their reset, import or delete: academy-before-…-user-N-…)
 *                                           replaces only that person's
 *
 * People are the IAM's users, by their user id there; nothing here acts as
 * anybody. Nothing here deletes study data, except --restore, which backs it
 * up first. (node backend/tools/php.js backend/manage.php --backup does the
 * same with a PHP that can run the app, where an older php comes first on PATH.)
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

function say(string $line = ''): void
{
    fwrite(STDOUT, $line . PHP_EOL);
}

function stop(string $message): never
{
    fwrite(STDERR, PHP_EOL . 'manage: ' . $message . PHP_EOL . PHP_EOL);
    exit(1);
}

// PHP itself first: without these the app can't even load.
if (PHP_VERSION_ID < 80200) {
    stop('PHP 8.2 or newer is needed; this is PHP ' . PHP_VERSION . ' (' . PHP_BINARY . ').');
}
$missing = array_values(array_filter(['pdo_pgsql', 'mbstring', 'intl'], static fn (string $ext): bool => !extension_loaded($ext)));
if ($missing) {
    stop('PHP ' . PHP_VERSION . ' (' . PHP_BINARY . ') lacks the extension(s) ' . implode(', ', $missing) . '.'
        . ' Enable them in ' . (php_ini_loaded_file() ?: 'php.ini') . ' (extension=' . implode(', extension=', $missing) . ').');
}

require __DIR__ . '/src/bootstrap.php';

$opts = getopt('', ['check', 'sync', 'backup', 'restore:']);
if (!array_intersect_key($opts, ['check' => 1, 'sync' => 1, 'backup' => 1, 'restore' => 1])) {
    stop('Say what to do: --check, --sync, --backup or --restore=FILE (the top of backend/manage.php explains each).'
        . ' Setting the app up is the setup page\'s job: start the app (composer start in backend/) and open /setup.php.');
}

try {
    $problem = config_problem();
    if ($problem !== null) {
        say("Not set up yet: $problem. Start the app (composer start in backend/) and open /setup.php.");
        exit(1);
    }

    // --check: report, change nothing
    if (isset($opts['check'])) {
        $todo = [];
        $who = '';
        if (!db_exists()) {
            $todo[] = 'create the database ' . db_name();
            $who = 'The setup page (/setup.php) does it.';
        } elseif ($pending = db_pending_migrations()) {
            $ready = db_migrations_ready();
            if (count($ready) < count($pending)) {
                // A migration still being written (no last line) waits: nothing applies it until it is whole.
                $draft = $pending[count($ready)];
                say("Waiting: backend/migrations/$draft does not end with its last line, \"-- end of " . substr($draft, 0, 3) . '": '
                    . 'it is still being written (or half copied), and nothing applies it, or anything after it, until it does.');
            }
            if ($ready) {
                // No request applies a migration: until somebody does, the site says it is being updated.
                $todo[] = 'apply ' . implode(', ', $ready);
                $who = 'An ADMIN applies it on the admin panel\'s Migrations page (/admin/migrations: Apply pending), or manage.php --sync does'
                    . ' (the setup page too). Until then the site tells everybody it is being updated.';
            } else {
                exit(1);
            }
        } elseif (!content_current()) {
            $todo[] = 'rebuild the study content from backend/data/';
            $who = 'The app\'s first request, manage.php --sync or the setup page (/setup.php) does it.';
        }
        if ($todo) {
            say('To do: ' . implode('; ', $todo) . '. ' . $who);
            exit(1);
        }
        $people = (int) db_value('SELECT count(*) FROM users WHERE id > 0');
        $visitors = visitors_count(); // somebody studying without signing in (src/visitors.php): no person
        say('Ready: database ' . db_name() . ', tables and study content up to date; '
            . $people . ' ' . ($people === 1 ? 'person' : 'people') . ', '
            . ($visitors['ready'] ? $visitors['count'] . ' ' . ($visitors['count'] === 1 ? 'visitor' : 'visitors') . ' (not signed in), ' : '')
            . db_value('SELECT count(*) FROM srs_items') . ' kanji items, ' . exam_stats()['total'] . ' exam questions.');
        exit(0);
    }

    if (!db_exists() || db_value("SELECT to_regclass('migrations') IS NULL")) {
        stop('The database ' . db_name() . ' is not set up yet: open /setup.php.');
    }
    // New migrations first, after a raw copy of every table: this version's queries may need them.
    $migrated = upkeep_migrate();
    if ($migrated['backup']) {
        say('Backup before the update: ' . $migrated['backup']);
    }
    if ($migrated['applied']) {
        say('Applied: ' . implode(', ', $migrated['applied']) . '.');
    }
    if ($waiting = db_pending_migrations()) {
        $why = "backend/migrations/{$waiting[0]} does not end with its last line, \"-- end of " . substr($waiting[0], 0, 3) . '": '
            . 'it is not applied (is it still being written or copied?), and nor is anything after it.';
        // A backup reads the tables as they are, with or without it: a migration still
        // being written must never stand between the owner and a copy of their data.
        if (isset($opts['sync']) || isset($opts['restore']) || !isset($opts['backup'])) {
            stop($why);
        }
        say("Note: $why The study content is left as it is until then.");
    } else {
        $synced = content_sync(isset($opts['sync']));
        if ($synced) {
            say("Built the study content: {$synced['items']} kanji items and {$synced['questions']} exam questions ({$synced['seconds']} s).");
        }
    }

    if (isset($opts['backup'])) {
        say('Backup: ' . backup_write('manual'));
    }

    if (isset($opts['restore'])) {
        $file = (string) $opts['restore'];
        $data = backup_read($file);
        say('Backup of what was there: ' . backup_write('before-restore'));
        $counts = backup_restore($data);
        $whose = "{$counts['people']} " . ($counts['people'] === 1 ? 'person' : 'people')
            . (($data['everybody'] ?? true) === false ? ' (the file holds theirs alone: everybody else\'s data is as it was)' : '') . ', ';
        say("Restored from $file" . (isset($data['database']) ? " (a copy of the database {$data['database']})" : '') . ': '
            . $whose . "{$counts['items']} kanji items, {$counts['log']} answers, {$counts['attempts']} exam attempts.");
    }
} catch (PDOException $e) {
    stop('Database error: ' . $e->getMessage());
} catch (Throwable $e) {
    stop($e->getMessage());
}
