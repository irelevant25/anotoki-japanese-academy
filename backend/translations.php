<?php
/**
 * The app's own strings from the command line, for a computer with a shell
 * and the whole repository. It is never uploaded (a website's strings are
 * reworded on its Translations page).
 *
 *   php backend/translations.php --status            the keys the frontend uses against the database's;
 *                                                    exit code 1 when one is missing, has no English string,
 *                                                    or is asked for in a way the scan does not let through
 *   php backend/translations.php --export sk [FILE]  a language's own strings as flat JSON (to the screen
 *                                                    without a file)
 *   php backend/translations.php --import sk FILE    and back in: checked as a save on the Translations page
 *                                                    is, all of it or none of it; an empty string is passed
 *                                                    over. FILE is a flat export, or a backup of everybody
 *                                                    (backend/storage/backups/academy-….json), from which the strings of that
 *                                                    language are taken
 *
 * The strings live in the database so the owner can reword them in the
 * browser, which means nothing stops a page asking for a key no migration
 * wrote: it would show the key itself. --status is the check for that, and
 * the same scan runs in the tests (tools/translation_keys.php says how a key
 * is recognised; tests/unit/translations.test.php holds the database to it).
 *
 * It works on the database of this copy's settings (backend/config/, which
 * the setup page writes) and applies no migration: on a database that is
 * behind the files it says so and stops. What it writes is written by nobody
 * (updated_by null), as a migration's strings are.
 */

declare(strict_types=1);

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

/** The frontend's keys against the database's, and how much of each language there is. */
function translations_cli_status(): int
{
    $root = translation_keys_frontend_root();
    if (!is_dir($root)) {
        translations_cli_stop('There is no frontend here to read the keys from (frontend/src/app).');
    }

    $keys = array_column(db_all('SELECT name FROM translation_keys ORDER BY name COLLATE "C"'), 'name');
    $scan = translation_keys_scan($root, $keys);
    $noEnglish = array_column(db_all(
        'SELECT k.name FROM translation_keys k
          WHERE NOT EXISTS (SELECT 1 FROM translations t WHERE t.key_name = k.name AND t.language_code = ?)
          ORDER BY k.name COLLATE "C"',
        [TRANSLATION_FALLBACK]
    ), 'name');

    translations_cli_say(sprintf('  the database has     %d key%s', count($keys), count($keys) === 1 ? '' : 's'));
    translations_cli_say(sprintf('  the frontend uses    %d of them', count($scan['used'])));

    if ($scan['missing']) {
        translations_cli_say();
        translations_cli_say('  Used by the frontend, not in the database: the page shows the key itself.');
        foreach ($scan['missing'] as $key => $where) {
            translations_cli_say("    $key");
            foreach (array_unique($where) as $place) {
                translations_cli_say("        $place");
            }
        }
    }
    if ($noEnglish) {
        translations_cli_say();
        translations_cli_say('  No English string, so nothing to fall back to:');
        foreach ($noEnglish as $key) {
            translations_cli_say("    $key");
        }
    }
    if ($scan['problems']) {
        translations_cli_say();
        translations_cli_say('  What the scan does not let through:');
        foreach ($scan['problems'] as $problem) {
            translations_cli_say("    $problem");
        }
    }
    if ($scan['unused']) {
        translations_cli_say();
        translations_cli_say('  In the database, used nowhere (a migration deletes a key the code has stopped using):');
        foreach ($scan['unused'] as $key) {
            translations_cli_say("    $key");
        }
    }

    translations_cli_say();
    $languages = db_all(
        'SELECT l.code, l.name, l.enabled, (SELECT count(*) FROM translations t WHERE t.language_code = l.code) AS strings
           FROM languages l ORDER BY l.sort_order, l.name, l.code'
    );
    foreach ($languages as $language) {
        translations_cli_say(sprintf('  %-6s %-20s %4d / %d%s', $language['code'], $language['name'], $language['strings'], count($keys), $language['enabled'] ? '' : '   (not offered)'));
    }
    translations_cli_say();

    if ($scan['missing'] || $noEnglish || $scan['problems']) {
        translations_cli_say('  Not clean.');
        return 1;
    }
    translations_cli_say('  Clean.');
    return 0;
}

/** A language's own strings, not merged with English, to a file or to the screen. */
function translations_cli_export(string $code, ?string $file): int
{
    [$status, $body] = translations_export($code);
    if ($status !== 200) {
        translations_cli_stop($body['error']);
    }
    $values = (array) $body;
    if ($file === null) {
        echo translations_file_text($values);
        return 0;
    }
    translation_file_write($file, $values);
    translations_cli_say('  ' . count($values) . ' string' . (count($values) === 1 ? '' : 's') . " of \"$code\" written to $file");
    return 0;
}

/** A file of strings into a language: checked like a save on the Translations page, written by nobody (updated_by null). */
function translations_cli_import(string $code, string $file): int
{
    if (!language_code_ok($code)) {
        translations_cli_stop('There is no such language.');
    }
    $values = translation_file_strings($file, $code);
    $before = translations_of($code);
    [$status, $body] = translations_import($code, $values, null);
    if ($status !== 200) {
        // What the API would have answered: the sentence, and the keys it is about.
        fwrite(STDERR, PHP_EOL . '  Refused (' . $body['code'] . '): ' . $body['error'] . PHP_EOL);
        foreach ($body['keys'] ?? [] as $key) {
            fwrite(STDERR, "    $key" . PHP_EOL);
        }
        fwrite(STDERR, PHP_EOL);
        return 1;
    }
    $changed = count(array_diff_assoc(translations_of($code), $before));
    translations_cli_say('  ' . count($values) . ' string' . (count($values) === 1 ? '' : 's') . " in $file: $changed changed in \"$code\", the rest as they were (or empty, and passed over).");
    return 0;
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

    switch ($command) {
        case '--status':
            translations_cli_say();
            translations_cli_say('== Japanese Academy (' . db_name() . '): the app\'s own strings');
            translations_cli_say();
            exit(translations_cli_status());

        case '--export':
            if (!isset($argv[2])) {
                translations_cli_stop('usage: php backend/translations.php --export CODE [FILE]');
            }
            exit(translations_cli_export((string) $argv[2], isset($argv[3]) ? (string) $argv[3] : null));

        case '--import':
            if (!isset($argv[2], $argv[3])) {
                translations_cli_stop('usage: php backend/translations.php --import CODE FILE');
            }
            exit(translations_cli_import((string) $argv[2], (string) $argv[3]));

        default:
            translations_cli_stop("Unknown command $command. " . TRANSLATIONS_CLI_USAGE);
    }
} catch (PDOException $e) {
    translations_cli_stop('Database error: ' . $e->getMessage());
} catch (Throwable $e) {
    translations_cli_stop($e->getMessage());
}
