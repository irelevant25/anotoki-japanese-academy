<?php
/**
 * The admin area's addresses (/api/admin/…: the app's own words, its
 * languages, its people, the admin tools and the migrations), after the
 * anotoki library's Identify found who is asking (src/auth.php). The checks
 * sit on the route groups (api/routes/translations.php, admin.php,
 * migrations.php), so an address added to a group later cannot forget them,
 * and they are the library's RequireRole - the roles from the person's
 * verified token, never a table, so they work while a migration waits too:
 *
 *   staff_middleware()        every /api/admin group: the IAM role EDITOR or
 *                             ADMIN of this application, else 403 staff_only
 *                             (nobody: 401 sign_in_required)
 *   body_limit_middleware()   after it, on the groups of the words and the
 *                             languages: a body over 1 MiB, 413 too_large (the
 *                             library's own groups keep their own limits)
 *   admin_middleware()        after them, on the groups of what only ADMIN may
 *                             do (adding, changing and deleting languages; the
 *                             people, and deleting a person's data; the error
 *                             and audit logs, the feedback, the backups; the
 *                             migrations): else 403 admin_only
 *
 * The library's own admin groups (the people, the error log, the audit log,
 * the feedback, the backups) guard themselves as well: its ADMIN check runs
 * after these, so a group mounted without them would still open to nobody.
 * These answer first, in this site's words. The pages only hide what this
 * refuses.
 *
 * Every request here carries a bearer token, never a cookie, so another
 * site's page cannot make a signed-in browser send one: there is no Origin
 * check (the setup page, a cookie and a form, keeps its own). Every write is a
 * PUT or a DELETE, or a POST whose change is in its JSON body, taken as JSON
 * only: by the anotoki library's routes (anything else is 415
 * unsupported_media_type).
 */

declare(strict_types=1);

use Anotoki\Lib\Auth\Http\RequireRole;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Server\RequestHandlerInterface as RequestHandler;

function staff_middleware(): RequireRole
{
    return RequireRole::any(ROLE_ADMIN, ROLE_EDITOR)->refusing('staff_only', 'This is for the site\'s editors and administrators.');
}

function admin_middleware(): RequireRole
{
    return RequireRole::admin()->refusing('admin_only', 'This is for the site\'s administrators.');
}

function body_limit_middleware(): callable
{
    return static function (Request $request, RequestHandler $handler): Response {
        // Before anything reads the body, in this app's own words: the library's routes keep the same 1 MiB after this.
        $body = $request->getBody();
        if (($body->getSize() ?? strlen((string) $body)) > TRANSLATIONS_BODY_LIMIT) {
            throw new HttpError(413, 'That is more than this site takes in one go.', [], 'too_large');
        }
        return $handler->handle($request);
    };
}

/**
 * The checks of a group that answers while a migration waits (the Migrations
 * page's, the error log's, the backups'): Identify (the person's alone,
 * academy_identify_person(): a visitor's key is never read), then EDITOR or
 * ADMIN, then ADMIN - all from the token, no table read, no person's row
 * written: the migration that waits may be the one that makes them. (Slim
 * runs the last added first.)
 *
 * @param Slim\Interfaces\RouteGroupInterface|Slim\Interfaces\RouteInterface $group
 */
function admin_token_checks($group): void
{
    $group->add(admin_middleware());
    $group->add(staff_middleware());
    $group->add(academy_identify_person());
}
