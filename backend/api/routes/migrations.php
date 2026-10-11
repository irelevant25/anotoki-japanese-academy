<?php
/**
 * The admin panel's Migrations page's addresses, for the administrators
 * alone: the anotoki library's (MigrationsRoutes, anotoki/lib - every anotoki
 * site's), on this site's engine (db_migrator() in src/db.php). A migration
 * uploaded (or pulled) waits for them here: no request applies one by itself,
 * and the rest of the site answers 503 update_pending meanwhile (the
 * SiteGate, api/app.php, which lets these through). Their check is ADMIN in
 * the person's token and nothing else (admin_token_checks(),
 * middleware/staff.php): it needs no table, since the migration that waits
 * may be the one that makes them. Anybody else 401, or 403 staff_only or
 * admin_only. An Apply is recorded in the audit log (migrations.applied),
 * after the entries that waited for its table.
 *
 *   GET  /api/admin/migrations         {sets: ["anotoki_admin", "academy", "anotoki_translations", "anotoki_people"],
 *                                      applied: [{set, name, applied_at}], pending: [{set, name, ready, blocked}],
 *                                      missing: [{set, name, applied_at}]}: the files applied, in the order they ran
 *                                      (applied_at ISO 8601, UTC); the ones pending, in the order they will run - the
 *                                      anotoki library's admin tools first, this site's own, then the library's words and
 *                                      people (db_migration_sets()) - (ready false: a draft - a file without its last
 *                                      line, still being written or uploaded - which waits, and every one after it with
 *                                      it: blocked); the ones the table lists that are no file here
 *   GET  /api/admin/migrations/file?set=academy&name=…   {set, name, sql}: a file's text (set=anotoki_…: one of the
 *                                      library's); 404 not_found for anything that is not one of the sets' files
 *   POST /api/admin/migrations/apply   {applied: [{set, name}], failed: {set, name}|null, error: string|null, note:
 *                                      string|null}: the pending ones up to the first draft, in order, after a raw copy
 *                                      of every table and the library's backup of the database (the note names both),
 *                                      each in a transaction of its own, rolled back whole when it fails, which stops the
 *                                      run there; error: PostgreSQL's own words, on this computer and on a website alike
 *                                      (as the IAM's page shows them; logged too); 409 busy while another apply, a
 *                                      backup, or the content's rebuild, holds the lock
 */

declare(strict_types=1);

use Anotoki\Lib\Migrations\Http\MigrationsRoutes;
use Anotoki\Lib\Migrations\Migrator;
use Psr\Http\Message\ServerRequestInterface as Request;

function academy_migration_routes(Slim\App $app): void
{
    admin_token_checks(MigrationsRoutes::admin($app, '/api/admin/migrations', static function (): Migrator {
        // A connection of its own: an apply's lock is its connection's (db_migrator()); before anything runs,
        // this site's raw copy of every table, then the anotoki library's backup of the database (upkeep_before_apply()).
        return db_migrator(db_connect(), upkeep_before_apply());
    }, static function (Request $request, array $result): void {
        // The administrator reads why on the page; the site's error log has it as well. (A copy that could
        // not be written logs itself: upkeep_before_apply().)
        if ($result['failed'] !== null) {
            error_log('[upkeep] a migration failed: ' . db_migration_path($result['failed']) . ": {$result['error']}");
        }
        // What waited for the audit log's table goes in now, then this Apply's own entry.
        academy_audit()->flushPending();
        if ($result['applied'] !== []) {
            academy_audit_record($request, 'migrations.applied', null, null, ['files' => array_map('db_migration_label', $result['applied'])]
                + ($result['failed'] !== null ? ['failed' => db_migration_label($result['failed'])] : []));
        }
    }));
}
