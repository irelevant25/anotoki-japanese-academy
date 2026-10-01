<?php
/**
 * The API: every address of Japanese Academy that answers with data, as a
 * Slim 4 application — the routes in routes/, the middleware in middleware/,
 * and under them the domain code of backend/src/ (the SRS, the exam, the
 * content, the backups, the upkeep), plain functions by area.
 *
 *   GET  /api/auth/config     how this copy signs people in: {mode} or {mode, issuer, clientId}
 *   GET  /api/health          it answers (and, to this computer under php backend/server.php,
 *                             with which database, backup folder and owner)
 *   GET  /api/meta            exam: parts, sections, lessons, bank size, your attempt count
 *   POST /api/exam            exam: build a paper  {size, books, lessons, sections, seed}
 *   POST /api/submit          exam: score it, store your attempt and its report
 *   GET  /api/attempts        exam: your past attempts, newest first
 *   GET  /report/{id}         exam: the HTML report of one of your attempts
 *   *    /api/kanji/...       the kanji SRS (routes/kanji.php)
 *   GET  /audio/{name}        a vocabulary clip from data/audio (shared content: no sign-in)
 *   GET  /api/translations/{code}   the app's own words in a language, the same for everybody
 *                             (routes/translations.php)
 *   *    /api/owner/...       the owner's: the languages and the words, reworded (the same file)
 *
 * Every /api and /report address needs a signed-in person (middleware/person.php)
 * and answers with that person's data only, except /api/auth/config,
 * /api/health and /api/translations/{code} (the app's own words, the same
 * for everybody). The /api/owner addresses are for the owner alone
 * (middleware/owner.php): the ADMIN role, or this computer without sign-in.
 * Before them, whether this copy is set up at all (middleware/setup.php: 503
 * {"code": "not_set_up"} until /setup.php has run) and the start-time work a
 * hosted site has no start for (src/upkeep.php).
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
require_once __DIR__ . '/middleware/setup.php';
require_once __DIR__ . '/middleware/person.php';
require_once __DIR__ . '/middleware/owner.php';
require_once __DIR__ . '/routes/site.php';
require_once __DIR__ . '/routes/exam.php';
require_once __DIR__ . '/routes/kanji.php';
require_once __DIR__ . '/routes/translations.php';

use Slim\Factory\AppFactory;

/**
 * The application, built once: its routes, and the middleware around them.
 * Added in this order, they run the other way round: the security headers
 * first, then the error handling, the trailing-slash rule and the routing.
 */
function academy_app(): Slim\App
{
    static $app = null;
    if ($app !== null) {
        return $app;
    }
    $app = AppFactory::create();

    academy_site_routes($app);
    academy_exam_routes($app);
    academy_kanji_routes($app);
    academy_translation_routes($app);

    $app->addRoutingMiddleware();
    $app->add(trailing_slash_middleware());
    $app->add(errors_middleware());
    $app->add(security_headers_middleware());
    return $app;
}
