<?php
/**
 * The addresses every page needs before anything else: how to sign in,
 * whether it answers, and the audio clips — plus data_route() and
 * study_route(), the middleware every address with somebody's data gets.
 * (Where the site stands, GET /api/site-status, is the anotoki library's:
 * api/app.php.)
 */

declare(strict_types=1);

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\Interfaces\RouteGroupInterface;
use Slim\Interfaces\RouteInterface;

/**
 * An address with somebody's data, or a group of them: the study content up
 * to date with the files, a signed-in person; $pageLoad also takes the day's
 * backup (a page load of a new day, never an answer). They run in that order,
 * after the SiteGate (api/app.php) let the request through: a site set up,
 * and no migration waiting.
 *
 * @param RouteInterface|RouteGroupInterface $route
 */
function data_route($route, bool $pageLoad = false): void
{
    if ($pageLoad) {
        $route->add(daily_backup_middleware());
    }
    $route->add(person_middleware());
    $route->add(upkeep_middleware());
}

/**
 * A study address (the kanji SRS, the exam, a report): as data_route(), but
 * whoever learner_middleware() finds - a signed-in person, or where the IAM
 * lets people study without signing in, a visitor, or nobody yet (an empty
 * learner). $mayMake: a save by nobody makes a visitor for it. $cap: what a
 * visitor's request would grow ('attempts', 'answers'), refused at its cap.
 *
 * @param RouteInterface|RouteGroupInterface $route
 */
function study_route($route, bool $pageLoad = false, bool $mayMake = false, ?string $cap = null): void
{
    if ($pageLoad) {
        $route->add(daily_backup_middleware());
    }
    $route->add(learner_middleware($mayMake, $cap));
    $route->add(upkeep_middleware());
}

function academy_site_routes(Slim\App $app): void
{
    // How to sign in: the browser's first question. No sign-in needed: the
    // IAM's address and this app's client id are no secret. It answers while
    // a migration waits too (the SiteGate lets it through): an administrator
    // signs in to apply it.
    $app->get('/api/auth/config', static function (Request $request, Response $response): Response {
        return json_response($response, auth_public_config());
    });

    // That it answers. To a request straight from this computer under PHP's
    // built-in server (the tests, a developer) also which database and
    // backup folder; a website keeps them to itself, and so does this
    // computer from a request that came some other way (a tunnel). It answers
    // while a migration waits too - on a database the migrations have yet to
    // build, with no content to be current.
    $app->get('/api/health', static function (Request $request, Response $response): Response {
        $built = (bool) db_value("SELECT to_regclass('content_state') IS NOT NULL");
        $health = ['ok' => true, 'contentCurrent' => $built && content_current()];
        if (PHP_SAPI === 'cli-server' && auth_from_this_computer($request->getServerParams())) {
            $health['database'] = db_name();
            $health['backups'] = backup_dir();
        }
        return json_response($response, $health);
    })->add(upkeep_middleware());

    // The clips made by backend/tools/build-audio.php: shared content, for
    // everybody, also while a migration waits (they are no data of anybody's).
    // A clip's name never changes (a new recording gets a new name), so the
    // browser may cache it for good.
    $app->get('/audio/{name}', static function (Request $request, Response $response, array $args): Response {
        $name = (string) $args['name'];
        if (!preg_match(CLIP_NAME, $name) || !is_file(AUDIO_CLIPS . "/$name")) {
            // the caching headers go out only with a clip, never with a 404
            return text_response($response, 404, '', 'text/plain; charset=utf-8');
        }
        return file_response($request, $response, AUDIO_CLIPS . "/$name", 'audio/mpeg', ['Cache-Control: public, max-age=31536000, immutable']);
    });
}
