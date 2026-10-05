<?php
/**
 * The admin panel's Migrations page (src/upkeep.php does the work), for the
 * administrators alone. A migration uploaded (or pulled) waits for them here:
 * no request applies one by itself, and every other address with data
 * answers 503 not_up_to_date meanwhile. So these two must answer while one
 * waits: their group has the set-up check, the tables' check
 * (tables_middleware(), in place of the upkeep), the person, the editors'
 * check and the administrators' check — anybody else 403 staff_only or
 * admin_only.
 *
 *   GET  /api/admin/migrations         {applied: [{name, appliedAt}], pending: [{name, whole}]}: the files applied, the
 *                                      first first (appliedAt in milliseconds), and the ones pending in the order they
 *                                      will run (whole: false for a file without its last line, still on its way,
 *                                      which waits with every one after it)
 *   POST /api/admin/migrations/apply   {applied: [names], failed: name|null, error: string|null, backup: file|null}: the
 *                                      pending ones that are whole, in order, after a raw copy of every table (its
 *                                      file's name in backups/), each rolled back whole when it fails, which stops the
 *                                      run there; error: PostgreSQL's own words, on this computer and on a website alike
 *                                      (as the IAM's page; logged too); 409 busy while another Apply, or the content's
 *                                      rebuild, runs
 */

declare(strict_types=1);

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\Routing\RouteCollectorProxy;

function academy_migration_routes(Slim\App $app): void
{
    $group = $app->group('/api/admin/migrations', static function (RouteCollectorProxy $group): void {
        $group->get('', static function (Request $request, Response $response): Response {
            return json_response($response, upkeep_migrations());
        });

        $group->post('/apply', static function (Request $request, Response $response): Response {
            return json_response($response, upkeep_apply());
        });
    });
    // Added in this order, they run the other way round: set-up, the tables, the person, the editors', the administrators'.
    $group->add(admin_middleware());
    $group->add(staff_middleware());
    $group->add(person_middleware());
    $group->add(tables_middleware());
    $group->add(set_up_middleware());
}
