<?php
/**
 * The start of every entry point — the API (backend/api/app.php, through
 * backend/server.php here and backend/public/index.php under Apache), the
 * setup page, the command-line tools and the tests: the settings, the time
 * zone, error handling and the app's functions.
 *
 * PHP 8.1+ with the pdo_pgsql, mbstring and intl extensions (and openssl, to
 * check sign-ins). The HTTP side is Slim 4 (backend/api/); this is the domain
 * code under it, plain functions by area.
 */

declare(strict_types=1);

if (PHP_VERSION_ID < 80100) {
    file_put_contents('php://stderr', 'Japanese Academy needs PHP 8.1 or newer; this is PHP ' . PHP_VERSION . ' (' . PHP_BINARY . ").\n");
    exit(1);
}

/** The repository — on a hosted site, the site's folder: data/ and backups/ are here. */
define('ROOT', dirname(__DIR__, 2));

/** The backend: its code, settings, migrations and storage. */
define('BACKEND', dirname(__DIR__));

/** How many daily copies are kept, and how many of each person's before-reset copies. */
const BACKUPS_KEEP = 14;

mb_internal_encoding('UTF-8');

// A warning is a bug: fail loudly rather than carry on with a wrong value.
set_error_handler(static function (int $level, string $message, string $file, int $line): bool {
    if (!(error_reporting() & $level)) {
        return false;
    }
    throw new ErrorException($message, 0, $level, $file, $line);
});

require BACKEND . '/config/config.php';

/**
 * The time zone of review times and daily counts: the setting (app.local.php),
 * one zone for everybody. Before there is one (the setup page, a tool on a
 * copy not set up yet) this computer's, as ICU knows it; PHP itself would say UTC.
 */
function app_timezone(): string
{
    $tz = config('app.timezone');
    if (is_string($tz) && in_array($tz, DateTimeZone::listIdentifiers(DateTimeZone::ALL_WITH_BC), true)) {
        return $tz;
    }
    return app_computer_timezone();
}

/** This computer's time zone (the setup page offers it). */
function app_computer_timezone(): string
{
    if (class_exists('IntlTimeZone')) {
        $id = IntlTimeZone::createDefault()->getID();
        if (in_array($id, DateTimeZone::listIdentifiers(DateTimeZone::ALL_WITH_BC), true)) {
            return $id;
        }
    }
    return 'UTC';
}

/** A path from the settings or a default: relative ones are relative to the repository. */
function app_path(string $path): string
{
    return preg_match('~^([A-Za-z]:)?[\\\\/]~', $path) ? $path : ROOT . '/' . $path;
}

date_default_timezone_set(app_timezone());

require __DIR__ . '/util.php';
require __DIR__ . '/errors.php';
require __DIR__ . '/db.php';

// The IAM's SDK, a copy this app never edits (docs/kb/sign-in.md).
require __DIR__ . '/anotoki_iam.php';

require __DIR__ . '/auth.php';
require __DIR__ . '/users.php';
require __DIR__ . '/speech.php';
require __DIR__ . '/conjugate.php';
require __DIR__ . '/generate.php';
require __DIR__ . '/score.php';
require __DIR__ . '/report.php';
require __DIR__ . '/srs/srs.php';
require __DIR__ . '/srs/catalog.php';
require __DIR__ . '/srs/store.php';
require __DIR__ . '/srs/kanji.php';
require __DIR__ . '/content.php';
require __DIR__ . '/exam.php';
require __DIR__ . '/backup.php';
require __DIR__ . '/upkeep.php';
require __DIR__ . '/owner.php';
