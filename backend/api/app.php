<?php
/**
 * The API: every address of Japanese Academy that answers with data, as a
 * Slim 4 application — the routes in routes/, the middleware in middleware/,
 * and under them the domain code of backend/src/ (the SRS, the exam, the
 * content, the backups, the upkeep), plain functions by area.
 *
 *   GET  /api/site-status     where the site stands: {state: ready|not_set_up|update_pending|unavailable,
 *                             installed} (the anotoki library's, below; for everybody, always answered)
 *   GET  /api/auth/config     how to sign in at the IAM: {issuer, clientId, loginRequired, visitorKeepDays}
 *   GET  /api/health          it answers (and, to this computer under PHP's built-in server,
 *                             with which database and backup folder)
 *   GET  /api/meta            exam: parts, sections, lessons, bank size, your attempt count
 *   POST /api/exam            exam: build a paper  {size, books, lessons, sections, seed}
 *   POST /api/submit          exam: score it, store your attempt and its report
 *   GET  /api/attempts        exam: your past attempts, newest first
 *   GET  /report/{id}         exam: the HTML report of one of your attempts
 *   *    /api/kanji/...       the kanji SRS (routes/kanji.php)
 *   GET  /api/me/data         all of your data, as a file; PUT brings one back (routes/me.php)
 *   POST /api/visitor/move    at sign-in: what this browser studied without signing in, into
 *                             your account (routes/visitor.php)
 *   GET  /audio/{name}        a vocabulary clip from backend/data/audio (shared content: no sign-in)
 *   GET  /api/translations/{code}   the app's own words in a language, the same for everybody
 *                             (routes/translations.php)
 *   *    /api/admin/...       the admin area: the languages and the words, reworded (the same file);
 *                             the people, and deleting a person's data; how many visitors there
 *                             are (routes/people.php)
 *   *    /api/admin/migrations   the Migrations page: what is applied and what waits, a file's SQL,
 *                             and Apply (routes/migrations.php; ADMIN, judged from the token alone)
 *
 * In front of every route, whether the site can answer at all: the anotoki
 * library's SiteGate (anotoki/lib, the same on every anotoki site), from where
 * the site stands (academy_site_state()), decided afresh for each request:
 *
 *   not_set_up       no settings (backend/config/*.local.php, config_problem()): every address
 *                    answers 503 {code: "not_set_up", installed, message}, with "setup":
 *                    "/setup.php" only while the site was never installed (INSTALLED_LOCK)
 *   update_pending   a migration waits for an administrator's Apply: 503 {code:
 *                    "update_pending", message} with Retry-After: 60 - except the addresses
 *                    that keep the pages going (SITE_OPEN_PATHS): how to sign in, the words,
 *                    the health check, the clips and the Migrations page's own
 *   unavailable      the settings are there but the database does not answer: every address
 *                    goes on, and answers as the database lets it (503 database_unavailable)
 *   ready            everything as usual
 *
 * Every /api and /report address needs a signed-in person (middleware/person.php)
 * and answers with that person's data only, except /api/site-status,
 * /api/auth/config, /api/health and /api/translations/{code} (the app's own
 * words, the same for everybody) - and the study addresses (the kanji SRS, the
 * exam, the reports), where the IAM says this site does not require sign-in:
 * then a request without a token is a visitor (their key in X-Visitor-Key) or
 * nobody yet, whose first save makes a visitor (learner_middleware(),
 * src/visitors.php). Each person's request runs in their own time zone (their
 * browser's X-Time-Zone, else the one kept for them, else UTC). The
 * /api/admin addresses are for the IAM roles EDITOR and ADMIN, some for ADMIN
 * alone (middleware/staff.php, on the route groups). Before an address with
 * data, the start-time work a hosted site has no start for (src/upkeep.php,
 * middleware/upkeep.php).
 *
 * front.php runs it for the addresses that are the API's; the rest is the
 * frontend's (the built Angular app) or the setup page's.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/vendor/autoload.php';
require_once dirname(__DIR__) . '/src/bootstrap.php';
require_once __DIR__ . '/http.php';
require_once __DIR__ . '/middleware/errors.php';
require_once __DIR__ . '/middleware/security.php';
require_once __DIR__ . '/middleware/upkeep.php';
require_once __DIR__ . '/middleware/person.php';
require_once __DIR__ . '/middleware/staff.php';
require_once __DIR__ . '/routes/site.php';
require_once __DIR__ . '/routes/exam.php';
require_once __DIR__ . '/routes/kanji.php';
require_once __DIR__ . '/routes/me.php';
require_once __DIR__ . '/routes/visitor.php';
require_once __DIR__ . '/routes/people.php';
require_once __DIR__ . '/routes/migrations.php';
require_once __DIR__ . '/routes/translations.php';

use Anotoki\Lib\Migrations\Http\MigrationsRoutes;
use Anotoki\Lib\Migrations\Http\SiteGate;
use Anotoki\Lib\Migrations\Http\SiteState;
use Anotoki\Lib\Migrations\Migrator;
use Slim\Factory\AppFactory;

/**
 * What answers while a migration waits for an administrator's Apply - nothing
 * else does (the SiteGate's open paths: exact paths, or a pattern when one
 * starts with ~). So the pages start and have their words, an administrator
 * signs in and reaches the Migrations page (its list, a file's SQL, Apply),
 * and the clips (shared content, nobody's data) play on.
 *
 * Each is its route and nothing under it - one segment where the route takes
 * one, never a prefix: the gate reads the path decoded once, and a prefix
 * would let a crafted path past it (/api/admin/migrations/../x, %2e%2e, %2F)
 * to wherever a server in front of the app resolves it. $ is the very end
 * (D): a trailing newline (%0A) is no part of a route either.
 */
const SITE_OPEN_PATHS = [
    '/api/auth/config',
    '~^/api/translations/[^/]+$~D',
    '/api/health',
    '~^/audio/[^/]+$~D',
    '~^/api/admin/migrations(/file|/apply)?$~D',
];

/**
 * Where the site stands, for the SiteGate and GET /api/site-status (the
 * anotoki library's SiteState): its settings (config_problem()), whether its
 * setup page finished on a website (INSTALLED_LOCK: after that nobody is
 * offered the setup page again), and the migrations' engine (db_migrator()),
 * asked only once the settings are there. A database that cannot be reached
 * is `unavailable`.
 */
function academy_site_state(): SiteState
{
    return new SiteState(
        static function (): ?string {
            return config_problem();
        },
        static function (): bool {
            return is_file(INSTALLED_LOCK);
        },
        static function (): Migrator {
            return db_migrator();
        }
    );
}

/**
 * The application, built once: its routes, and the middleware around them.
 * Added in this order, they run the other way round: the security headers
 * first, then the error handling, the trailing-slash rule, the SiteGate and
 * the routing.
 */
function academy_app(): Slim\App
{
    static $app = null;
    if ($app !== null) {
        return $app;
    }
    $app = AppFactory::create();
    $state = academy_site_state();

    MigrationsRoutes::status($app, $state); // GET /api/site-status
    academy_site_routes($app);
    academy_exam_routes($app);
    academy_kanji_routes($app);
    academy_me_routes($app);
    academy_visitor_routes($app);
    academy_translation_routes($app);
    academy_migration_routes($app);

    $app->addRoutingMiddleware();
    // After the trailing-slash rule, so it judges /api/health/ as /api/health; inside the error handling.
    $app->add(new SiteGate($state, $app->getResponseFactory(), SITE_OPEN_PATHS));
    $app->add(trailing_slash_middleware());
    $app->add(errors_middleware());
    $app->add(security_headers_middleware());
    return $app;
}
