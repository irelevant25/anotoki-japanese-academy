<?php
/**
 * Who is asking, for every address with somebody's data: auth_user()
 * (src/auth.php) — in auth mode iam the person of a verified access token, in
 * mode none the owner — and nobody else. Their IAM user id goes on the request
 * as 'uid', and every handler passes it down: the only place a user id comes
 * from. No token: 401; a token that does not verify: 401; no role here: 403.
 *
 * daily_backup_middleware(): the first page load of a new day takes the day's
 * backup, of everybody's data — on a server left running overnight, and on a
 * hosted site, which has no start. A page load, never an answer; once a day it
 * costs a moment, and a failure must not cost the page.
 */

declare(strict_types=1);

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Server\RequestHandlerInterface as RequestHandler;

function person_middleware(): callable
{
    return static function (Request $request, RequestHandler $handler): Response {
        return $handler->handle($request->withAttribute('uid', auth_user()['id']));
    };
}

function daily_backup_middleware(): callable
{
    return static function (Request $request, RequestHandler $handler): Response {
        try {
            backup_daily();
        } catch (Throwable $e) {
            error_log('[backup] skipped: ' . $e->getMessage());
        }
        return $handler->handle($request);
    };
}

/** The person of this request, as person_middleware() found them. */
function uid(Request $request): int
{
    return (int) $request->getAttribute('uid');
}
