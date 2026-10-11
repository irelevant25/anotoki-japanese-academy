<?php
/**
 * The app's own strings from the command line, for a computer with a shell
 * and the whole repository. It is never uploaded (a website's strings are
 * reworded on its Translations page).
 *
 *   php backend/translations.php --status            the keys the frontend uses against the database's;
 *                                                    exit code 1 when one is missing, has no English string,
 *                                                    or is asked for in a way the scan does not let through
 *                                                    (a key nothing uses, and a stored string a save would
 *                                                    refuse, are said too, and fail nothing)
 *   php backend/translations.php --export sk [FILE]  a language's own strings as flat JSON (to the screen
 *                                                    without a file); --export=sk too
 *   php backend/translations.php --import sk FILE    and back in: checked as a save on the Translations page
 *                                                    is, all of it or none of it; an empty string is passed
 *                                                    over. FILE is a flat export, or a backup of everybody
 *                                                    (backend/storage/backups/academy-….json), from which the strings of that
 *                                                    language are taken (translation_file_strings())
 *
 * The work is the anotoki library's command (Anotoki\Lib\Translations\Cli\
 * TranslationsCommand, every anotoki site's), on this app's translations
 * (academy_translations()) and its scan of the frontend
 * (translation_key_scanner(), tools/translation_keys.php, which says how a key
 * is recognised; tests/unit/translations.test.php holds the database to it).
 * This file keeps the app's own name for it and its own sentences for a copy
 * that is not ready.
 *
 * The strings live in the database so the owner can reword them in the
 * browser, which means nothing stops a page asking for a key no migration
 * wrote: it would show the key itself. --status is the check for that.
 *
 * It works on the database of this copy's settings (backend/config/, which
 * the setup page writes) and applies no migration: on a database that is
 * behind the files it says so and stops. What it writes is written by nobody
 * (updated_by null), as a migration's strings are.
 */

declare(strict_types=1);

use Anotoki\Lib\Translations\Cli\TranslationsCommand;
use Anotoki\Lib\Translations\Translations;

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/src/bootstrap.php';
require __DIR__ . '/tools/translation_keys.php';

const TRANSLATIONS_CLI_USAGE = 'php backend/translations.php --status | --export CODE [FILE] | --import CODE FILE';

function translations_cli_say(string $line = ''): void
{
    fwrite(STDOUT, $line . PHP_EOL);
}

/** Says why not, on the error output, and ends with 1. */
function translations_cli_stop(string $message): never
{
    fwrite(STDERR, PHP_EOL . 'translations: ' . $message . PHP_EOL . PHP_EOL);
    exit(1);
}

$command = $argv[1] ?? '--status';
if (in_array($command, ['--help', '-h'], true)) {
    translations_cli_say(TRANSLATIONS_CLI_USAGE);
    translations_cli_say();
    translations_cli_say('  --status            the keys the frontend uses against the database\'s; exit code 1 when one is missing, has no');
    translations_cli_say('                      English string, or is asked for in a way the scan does not let through');
    translations_cli_say('  --export CODE       a language\'s own strings as flat JSON, to FILE or to the screen');
    translations_cli_say('  --import CODE FILE  and back in, from a flat export or a backup: checked as a save is, all of it or none of it');
    exit(0);
}
// The library's command knows the same three (and --export=CODE): anything else is said in this app's own words.
if (preg_match('/^--(status|export|import)(=.*)?$/sD', $command) !== 1) {
    translations_cli_stop("Unknown command $command. " . TRANSLATIONS_CLI_USAGE);
}

try {
    $problem = config_problem();
    if ($problem !== null) {
        translations_cli_stop("Not set up yet: $problem. Start the app (composer start in backend/) and open /setup.php.");
    }
    if (!db_exists()) {
        translations_cli_stop('The database ' . db_name() . ' is not set up yet: open /setup.php.');
    }
    // Nothing is applied from here, nor by a request: an ADMIN's Apply on the Migrations page, the setup page and
    // manage.php do that, after a copy.
    if (!translations_ready()) {
        translations_cli_stop('The database ' . db_name() . ' does not hold the app\'s words yet (migration 004 is not applied).'
            . ' Apply it on the admin panel\'s Migrations page (/admin/migrations, as an ADMIN) or run php backend/manage.php --sync,'
            . ' then try again.');
    }
    $pending = db_pending_migrations();
    if ($pending) {
        translations_cli_stop('The database ' . db_name() . ' is behind the files (' . implode(', ', $pending) . ').'
            . ' Apply them on the admin panel\'s Migrations page (/admin/migrations, as an ADMIN) or run php backend/manage.php --sync,'
            . ' then try again.');
    }
} catch (PDOException $e) {
    translations_cli_stop('Database error: ' . $e->getMessage());
}

// Its arguments in order (this file stays parseable by PHP 7.4, CLAUDE.md): the translations, the scan, no audit log
// (the app keeps none), the migrations waiting, the heading of --status, the outputs and colours as they are, and the
// reader of a file to import - a flat export, or a backup of everybody.
$translations = new TranslationsCommand(
    static function (): Translations {
        return academy_translations();
    },
    translation_key_scanner(),
    null,
    static function (): array {
        return db_pending_migrations();
    },
    'Japanese Academy (' . db_name() . '): the app\'s own strings',
    null,
    null,
    null,
    static function (string $path, string $code): array {
        return translation_file_strings($path, $code);
    }
);
try {
    exit($translations->run($argv));
} catch (PDOException $e) {
    translations_cli_stop('Database error: ' . $e->getMessage());
} catch (Throwable $e) {
    translations_cli_stop($e->getMessage());
}
