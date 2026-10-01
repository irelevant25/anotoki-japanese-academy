<?php
/**
 * The addresses every page needs before anything else: how this copy signs
 * people in, whether it answers, and the audio clips — plus data_route(), the
 * middleware every address with somebody's data gets.
 */

declare(strict_types=1);

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\Interfaces\RouteInterface;

/**
 * An address with somebody's data: a set-up copy, its database up to date,
 * a signed-in person; $pageLoad also takes the day's backup (a page load of a
 * new day, never an answer). They run in that order.
 */
function data_route(RouteInterface $route, bool $pageLoad = false): void
{
    if ($pageLoad) {
        $route->add(daily_backup_middleware());
    }
    $route->add(person_middleware());
    $route->add(upkeep_middleware());
    $route->add(set_up_middleware());
}

function academy_site_routes(Slim\App $app): void
{
    // How to sign in: the browser's first question. No sign-in needed, but a
    // copy without sign-in says so only to this computer.
    $app->get('/api/auth/config', static function (Request $request, Response $response): Response {
        if (auth_mode() === 'none' && !auth_none_allowed(PHP_SAPI, $request->getServerParams())) {
            throw auth_none_only();
        }
        return json_response($response, auth_public_config());
    })->add(set_up_middleware());

    // For the tests and the launchers on this computer; a website keeps its
    // database's name, its folders and its owner to itself, and so does this
    // computer from a request that came some other way (a tunnel).
    $app->get('/api/health', static function (Request $request, Response $response): Response {
        $health = ['ok' => true, 'auth' => auth_mode(), 'contentCurrent' => content_current()];
        if (auth_none_allowed(PHP_SAPI, $request->getServerParams())) {
            $health['database'] = db_name();
            $health['backups'] = backup_dir();
            $health['owner'] = auth_local_user_id();
        }
        return json_response($response, $health);
    })->add(upkeep_middleware())->add(set_up_middleware());

    // The clips made by backend/tools/build-audio.php: shared content, for
    // everybody, set up or not. A clip's name never changes (a new recording
    // gets a new name), so the browser may cache it for good.
    $app->get('/audio/{name}', static function (Request $request, Response $response, array $args): Response {
        $name = (string) $args['name'];
        if (!preg_match(CLIP_NAME, $name) || !is_file(AUDIO_CLIPS . "/$name")) {
            // the caching headers go out only with a clip, never with a 404
            return text_response($response, 404, '', 'text/plain; charset=utf-8');
        }
        return file_response($request, $response, AUDIO_CLIPS . "/$name", 'audio/mpeg', ['Cache-Control: public, max-age=31536000, immutable']);
    });
}
