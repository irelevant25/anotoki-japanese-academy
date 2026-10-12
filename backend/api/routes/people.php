<?php
/**
 * The People page of the admin area: the anotoki library's routes
 * (Anotoki\Lib\People\Http\PeopleRoutes, every anotoki site's), on this
 * site's people (academy_people(), src/people.php), for the administrators
 * alone: upkeep, who is asking, a signed-in person, the editors' check and
 * the administrators' (this site's words: 403 staff_only, admin_only), then
 * the library's own ADMIN check, which the group carries whatever is put
 * around it. One wire format for every anotoki site: snake_case, times as ISO
 * 8601 UTC, an IAM id as a string.
 *
 *   GET    /api/admin/people?q=&page=   {people: [{sub, name, first_seen_at, last_seen_at, anonymized_at, iam_url,
 *                                       time_zone, learned, attempts}], columns, total, page, page_size: 50,
 *                                       visitors: {count, oldest_seen_at, keep_days, max} | null, sync, ready,
 *                                       problems}: the latest seen first; q finds a name or an IAM id; the visitors
 *                                       (somebody studying without signing in) are a line of their own, null while
 *                                       the database cannot keep them; sync where the scrub of the IAM's deleted
 *                                       accounts stands
 *   DELETE /api/admin/people/{sub}      that person's data goes, after a copy of it ->
 *                                       {deleted: {"Kanji and words": n, "Answers": n, "Exam attempts": n}, note: the
 *                                       copy's file}; 404 not_found for an id the site has nobody of; recorded in the
 *                                       audit log (person.data_deleted) inside the delete's own transaction - no
 *                                       delete without its entry, which a restore does the delete again by: 503
 *                                       feature_unavailable while the audit log's table waits for its update
 *   POST   /api/admin/people/sync       the scrub, now -> {run, sync}; recorded (people.synced)
 *
 * The delete is people_delete_hook() (src/people.php), the one a restore does
 * again with (academy_backups(), src/admin.php): the library holds its
 * transaction (People::delete()) and forgets the person's feedback in it.
 */

declare(strict_types=1);

use Anotoki\Lib\People\Http\PeopleRoutes;
use Anotoki\Lib\Support\Refusal;
use Psr\Http\Message\ResponseInterface as Response;

function academy_people_routes(Slim\App $app): void
{
    $group = PeopleRoutes::admin(
        $app,
        '/api/admin/people',
        academy_people(),
        people_columns(),
        static function (PDO $pdo): ?array {
            return people_visitors();
        },
        people_delete_hook(),
        static function (Response $response, Refusal $refusal): Response {
            return academy_refusal($response, $refusal);
        },
        academy_audit(),
        academy_admin_context()
    );
    $group->add(admin_middleware());
    $group->add(staff_middleware());
    data_route($group);
}
