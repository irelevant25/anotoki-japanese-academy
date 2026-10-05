<?php
/**
 * The admin area's addresses (/api/admin/…: the app's own words, its
 * languages and its people), after the person middleware found who is asking. The checks sit
 * on the route groups (api/routes/translations.php), so an address added to a
 * group later cannot forget them:
 *
 *   staff_middleware()   the whole /api/admin group: the IAM role EDITOR or
 *                        ADMIN of this application, else 403 staff_only; and
 *                        a body over 1 MiB, 413 too_large
 *   admin_middleware()   the group inside it, for what only ADMIN may do
 *                        (adding, changing and deleting languages; the people,
 *                        and deleting a person's data): else 403 admin_only
 *
 * The roles come from the person's verified token and nowhere else
 * (src/auth.php). The pages only hide what this refuses.
 *
 * Every request here carries a bearer token, never a cookie, so another
 * site's page cannot make a signed-in browser send one: there is no Origin
 * check (the setup page, a cookie and a form, keeps its own). Every write is a
 * PUT or a DELETE, or a POST whose change is in its JSON body, which
 * request_body() takes as JSON only.
 */

declare(strict_types=1);

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Server\RequestHandlerInterface as RequestHandler;

function staff_middleware(): callable
{
    return static function (Request $request, RequestHandler $handler): Response {
        auth_require_role(...ROLES_STAFF);
        // request_body() has no limit of its own: every other body of the app is a few hundred bytes.
        $body = $request->getBody();
        if (($body->getSize() ?? strlen((string) $body)) > TRANSLATIONS_BODY_LIMIT) {
            throw new HttpError(413, 'That is more than this site takes in one go.', [], 'too_large');
        }
        return $handler->handle($request);
    };
}

function admin_middleware(): callable
{
    return static function (Request $request, RequestHandler $handler): Response {
        auth_require_role(ROLE_ADMIN);
        return $handler->handle($request);
    };
}
