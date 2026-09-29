<?php
/**
 * The command-line helpers, for a copy that is set up (the setup page,
 * /setup.php, does the setting up):
 *
 *   php backend/manage.php --check          what isn't ready (changes nothing); exit code 1 if anything
 *   php backend/manage.php --sync           rebuild the study content even if data/ didn't change
 *   php backend/manage.php --backup         write a backup of all the study data now (backups/)
 *   php backend/manage.php --restore=FILE   replace the study data with a backup's; what is there now is
 *                                           backed up first. A backup from before user ids (version 1)
 *                                           replaces only your own data, and one taken before somebody's
 *                                           reset (academy-before-reset-user-N-…) only that person's
 *   php backend/manage.php --import=FOLDER  import progress/, results/ and reports/ from FOLDER into your
 *                                           account (only when it holds no study data yet)
 *   php backend/manage.php --owner-id=N     your data becomes IAM user N's, for when your user id at the
 *                                           IAM is not 1; backed up first, and saved as auth.local_user_id
 *
 * "Your" data is the owner's: IAM user auth.local_user_id (1 unless set), whom
 * the app acts as without sign-in. The old JSON files are only ever read.
 * Nothing here deletes study data, except --restore, which backs it up first.
 * (npm run manage -- --backup does the same with a PHP that can run the app.)
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
if (PHP_VERSION_ID < 80100) {
    stop('PHP 8.1 or newer is needed; this is PHP ' . PHP_VERSION . ' (' . PHP_BINARY . ').');
}
$missing = array_values(array_filter(['pdo_pgsql', 'mbstring', 'intl'], static fn (string $ext): bool => !extension_loaded($ext)));
if ($missing) {
    stop('PHP ' . PHP_VERSION . ' (' . PHP_BINARY . ') lacks the extension(s) ' . implode(', ', $missing) . '.'
        . ' Enable them in ' . (php_ini_loaded_file() ?: 'php.ini') . ' (extension=' . implode(', extension=', $missing) . ').');
}

require __DIR__ . '/src/bootstrap.php';

$opts = getopt('', ['check', 'sync', 'backup', 'restore:', 'import:', 'owner-id:']);
if (!$opts) {
    stop('Say what to do: --check, --sync, --backup, --restore=FILE, --import=FOLDER or --owner-id=N (the top of backend/manage.php explains each).'
        . ' Setting the app up is the setup page\'s job: start it (php backend/server.php) and open /setup.php.');
}

/** --owner-id=N: the owner's data becomes user N's, and N is saved as auth.local_user_id. */
function manage_owner_id(string $value): void
{
    if (!ctype_digit($value) || (int) $value < 1 || strlen($value) > 18) {
        stop('--owner-id needs your IAM user id: a whole number from 1.');
    }
    $to = (int) $value;
    $done = owner_change(auth_local_user_id(), $to);
    if ($done['backup']) {
        say('Backup first: ' . $done['backup']);
    }
    say($done['message']);
    $auth = config_read_file('auth') ?? [];
    if (($auth['local_user_id'] ?? null) !== $to) {
        $auth['local_user_id'] = $to;
        config_write('auth', $auth, 'backend/manage.php --owner-id');
        say("  Saved auth.local_user_id = $to in " . CONFIG_FILES['auth'] . ": without sign-in, the app is user $to.");
    }
}

try {
    $problem = config_problem();
    if ($problem !== null) {
        say("Not set up yet: $problem. Start the app (php backend/server.php, or the launcher) and open /setup.php.");
        exit(1);
    }

    // --check: report, change nothing
    if (isset($opts['check'])) {
        $todo = [];
        if (!db_exists()) {
            $todo[] = 'create the database ' . db_name();
        } elseif ($pending = db_pending_migrations()) {
            $todo[] = 'apply ' . implode(', ', $pending);
        } elseif (!content_current()) {
            $todo[] = 'rebuild the study content from data/';
        }
        say($todo ? 'To do: ' . implode('; ', $todo) . '. The setup page (/setup.php) or php backend/server.php does it.'
            : 'Ready: database ' . db_name() . ', tables and study content up to date.');
        exit($todo ? 1 : 0);
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
        stop("backend/migrations/{$waiting[0]} does not end with its last line, \"-- end of " . substr($waiting[0], 0, 3) . '": '
            . 'it is not applied (is it still being written or copied?), and nor is anything after it.');
    }

    $synced = content_sync(isset($opts['sync']));
    if ($synced) {
        say("Built the study content: {$synced['items']} kanji items and {$synced['questions']} exam questions ({$synced['seconds']} s).");
    }

    if (isset($opts['owner-id'])) {
        manage_owner_id((string) $opts['owner-id']);
    }

    if (isset($opts['backup'])) {
        say('Backup: ' . backup_write('manual'));
    }

    if (isset($opts['restore'])) {
        $file = (string) $opts['restore'];
        $data = backup_read($file);
        say('Backup of what was there: ' . backup_write('before-restore'));
        $counts = backup_restore($data);
        $whose = $data['version'] === 1
            ? 'your data (user ' . auth_local_user_id() . '), '
            : "{$counts['people']} " . ($counts['people'] === 1 ? 'person' : 'people')
                . (($data['everybody'] ?? true) === false ? ' (the file holds theirs alone: everybody else\'s data is as it was)' : '') . ', ';
        say("Restored from $file" . (isset($data['database']) ? " (a copy of the database {$data['database']})" : '') . ': '
            . $whose . "{$counts['items']} kanji items, {$counts['log']} answers, {$counts['attempts']} exam attempts.");
    }

    if (isset($opts['import'])) {
        $root = rtrim(str_replace('\\', '/', (string) $opts['import']), '/');
        if (!is_dir($root)) {
            stop("No folder $root.");
        }
        $r = legacy_import($root, auth_local_user_id());
        if (isset($r['skipped'])) {
            say('Nothing imported: ' . $r['skipped'] . '.');
        } else {
            say("Imported your study history from {$r['from']}: {$r['items']} kanji items, {$r['days']} days, "
                . "{$r['log']} answers, {$r['attempts']} exam attempts ({$r['reports']} with a report).");
            foreach ($r['problems'] as $p) {
                say("  left out: $p");
            }
            say('  The files themselves are unchanged; from now on the database holds your progress.');
        }
    }
} catch (PDOException $e) {
    stop('Database error: ' . $e->getMessage());
} catch (Throwable $e) {
    stop($e->getMessage());
}
