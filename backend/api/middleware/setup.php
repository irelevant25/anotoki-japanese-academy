<?php
/**
 * Before any address with data: is this copy set up, and is its database up
 * to date with the files?
 *
 *   set_up_middleware()   the settings (backend/config/*.local.php) are
 *                         required: without them 503 {"code": "not_set_up"},
 *                         and the frontend shows its "not set up yet" page,
 *                         pointing at /setup.php. There is nothing to fall
 *                         back on.
 *   upkeep_middleware()   the start-time work a hosted site has no start for:
 *                         new migrations and a content rebuild on the first
 *                         request after an upload (src/upkeep.php); every other
 *                         request pays one stamp check. A database without its
 *                         tables is 503 not_set_up too: the setup page's job.
 */

declare(strict_types=1);

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Server\RequestHandlerInterface as RequestHandler;

function set_up_middleware(): callable
{
    return static function (Request $request, RequestHandler $handler): Response {
        $problem = config_problem();
        if ($problem !== null) {
            $body = ['error' => NOT_SET_UP, 'code' => 'not_set_up', 'setup' => '/setup.php'];
            // what is missing, for the owner on their own computer; a website keeps it to itself
            if (auth_from_this_computer($request->getServerParams())) {
                $body['reason'] = $problem;
            }
            return json_response(new Slim\Psr7\Response(), $body, 503);
        }
        return $handler->handle($request);
    };
}

function upkeep_middleware(): callable
{
    return static function (Request $request, RequestHandler $handler): Response {
        upkeep_run();
        return $handler->handle($request);
    };
}
