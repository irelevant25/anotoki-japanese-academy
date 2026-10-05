<?php
/**
 * The People page of the admin area (src/people.php does the work), for the
 * administrators alone: academy_people_routes() is called inside the ADMIN
 * group of /api/admin (routes/translations.php), so set-up, upkeep, the
 * person, the editors' check and the administrators' check run first; anybody
 * else 403 staff_only or admin_only.
 *
 *   GET    /api/admin/people        {people: [{id, username, createdAt, lastSeenAt, timeZone, items, attempts}]},
 *                                   the latest seen first
 *   DELETE /api/admin/people/{id}   that person's data goes, after a copy of it -> {deleted: id, copy: its file's
 *                                   name}; 404 not_found for an id the site has nobody of
 *   GET    /api/admin/visitors      {ready, count, oldestSeenAt, keepDays, max}: how many visitors (somebody
 *                                   studying without signing in, src/visitors.php) the site keeps now, the
 *                                   longest unseen, and the limits; ready false while migration 007 waits
 */

declare(strict_types=1);

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\Routing\RouteCollectorProxy;

function academy_people_routes(RouteCollectorProxy $only): void
{
    $only->get('/people', static function (Request $request, Response $response): Response {
        return json_response($response, ['people' => people_list()]);
    });

    $only->get('/visitors', static function (Request $request, Response $response): Response {
        return json_response($response, visitors_count());
    });

    $only->delete('/people/{id}', static function (Request $request, Response $response, array $args): Response {
        $id = (string) $args['id'];
        $copy = preg_match('/^[1-9][0-9]{0,17}$/D', $id) ? people_delete((int) $id) : null;
        if ($copy === null) {
            throw new HttpError(404, 'There is nobody of that id here.', [], 'not_found');
        }
        return json_response($response, ['deleted' => (int) $id, 'copy' => $copy]);
    });
}
