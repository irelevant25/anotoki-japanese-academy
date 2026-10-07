<?php
/**
 * Before an address with data, the start-time work a hosted site has no
 * start for (src/upkeep.php):
 *
 *   upkeep_middleware()   a content rebuild on the first request after an
 *                         upload (or a pull); every other request pays one
 *                         stamp check. Nothing is built while a migration
 *                         waits for an administrator's Apply.
 *
 * Whether the site can answer at all comes before it, in front of every
 * route: the anotoki library's SiteGate (api/app.php) - 503 not_set_up
 * without the settings (backend/config/*.local.php), 503 update_pending while
 * a migration waits, to everything but the addresses that stay open.
 */

declare(strict_types=1);

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Server\RequestHandlerInterface as RequestHandler;

function upkeep_middleware(): callable
{
    return static function (Request $request, RequestHandler $handler): Response {
        upkeep_run();
        return $handler->handle($request);
    };
}
