<?php
/**
 * The start-time work, done on requests. Neither server has a start of its
 * own: Apache runs PHP once per request, with no shell and no cron, and PHP's
 * built-in server on this computer (backend/router.php) does nothing before
 * its first request either. So the first request after the files changed (an
 * upload, a pull) looks: the study content is rebuilt when backend/data/ or
 * the code that builds it changed. (The day's backup is taken at the day's
 * first page load, by the API's daily_backup() middleware.)
 *
 * A migration is never applied by a request (since 2026-10-04, the owner's
 * decision): while one is there and whole, it waits for an administrator's
 * Apply on the admin panel's Migrations page, and the site answers 503
 * update_pending meanwhile to everything but the few addresses a page needs
 * to start, to sign somebody in and to reach that page (the anotoki library's
 * SiteGate, api/app.php). Every apply - the Migrations page's, the setup
 * page's, manage.php's - is the library's engine (db_migrator() in
 * src/db.php), after a raw copy of every table (upkeep_before_apply()), under
 * the upkeep's lock: never two at once, whichever starts them.
 *
 * Every request pays one cheap check: a stamp of the names, sizes and times
 * of the content files and the migrations, against the one stored in
 * content_state. Only when they differ does it look further, under the lock,
 * so two requests never do the work twice, and never while an Apply runs -
 * nor while a migration waits for one: the content is built for the tables
 * this version expects.
 */

declare(strict_types=1);

/**
 * A number for PostgreSQL's advisory locks: one rebuild of the content, or one
 * apply of the migrations (db_migrator()'s lock), at a time, per database.
 */
const UPKEEP_LOCK = 4210927;

/** What the setup page and manage.php say when another apply holds the lock (the Migrations page's Apply answers 409 busy). */
const UPKEEP_BUSY = 'Another database update is running, so nothing was applied: try again in a moment.';

/**
 * The names, sizes and times of the files the schema and the study content are
 * built from: the content files, and the migrations of both sets - this
 * site's own and the anotoki library's (db_migration_sets()).
 */
function upkeep_stamp(): string
{
    $migrations = [];
    foreach (db_migration_sets() as $set) {
        foreach (glob($set->directory . '/*.sql') ?: [] as $file) {
            $migrations[] = db_migration_path(['set' => $set->name, 'name' => basename($file)]);
        }
    }
    sort($migrations);
    $parts = [];
    foreach (array_merge(CONTENT_FILES, $migrations) as $file) {
        $stat = @stat(ROOT . '/' . $file);
        $parts[] = $file . ' ' . ($stat ? $stat['size'] . ' ' . $stat['mtime'] : 'missing');
    }
    return sha1(implode("\n", $parts));
}

/**
 * The raw copy of every table before the migrations $ready are applied, when
 * the database holds study data; null when none is needed. The copy is raw
 * because this version's queries may not fit the tables until the migrations
 * ran. One copy for one upload: a migration that fails may be tried again
 * (Apply pressed once more, the setup page sent again), and each try must not
 * add another full copy to the backups. The note of the copy names the files
 * it was taken with ($stamp) and the migrations pending then; while both are
 * the same, the tries are of the same files on the same tables (a failed one
 * rolls back, and nobody can study while one waits), so the copy is still
 * what is there. Another upload, a fixed file or the failing one put back
 * after the site was used, changes the stamp, and gets its own copy. (The
 * note is .before-migration-raw.json: the anotoki library's backup before an
 * update keeps a note of its own, .before-migration.json, in the same folder.)
 */
function upkeep_copy_before(array $ready, string $stamp): ?string
{
    if (!$ready || !db_value("SELECT to_regclass('srs_progress') IS NOT NULL") || !learner_has_data(true)) {
        return null;
    }
    $note = backup_dir() . '/.before-migration-raw.json';
    $now = ['database' => db_name(), 'stamp' => $stamp, 'pending' => $ready];
    $last = is_file($note) ? json_decode((string) @file_get_contents($note), true) : null;
    if (is_array($last) && array_intersect_key($last, $now) === $now) {
        return null;
    }
    $backup = backup_write_raw('before-migration');
    file_put_atomic($note, json_text($now + ['backup' => basename($backup)]) . "\n", true);
    return $backup;
}

/**
 * The engine's beforeApply (db_migrator()): the raw copy of every table before
 * the files $files ([{set, name}], in order) are applied - upkeep_copy_before()
 * - said in the apply's note, which the Migrations page shows ("A copy of
 * every table from before is in backups/…"); $backup gets the copy's path, for
 * the setup page and manage.php to name it. A copy that cannot be written
 * stops the apply before anything runs, with a sentence that says so: the
 * reason only to this computer (error_reason()), and to the error log.
 *
 * Then the anotoki library's backup of the whole database before an update
 * (academy_backups()'s beforeApplyHook(), src/admin.php: once for each list of
 * pending files, none for a database that has nothing applied yet), named in
 * the note too; one that cannot be made stops the apply as well. The two sit
 * side by side (the owner's choice may drop the raw copy one day).
 *
 * It runs once there is something to apply, so it also asks for the time the
 * work may take: the copies and the files, seconds perhaps, on a website whose
 * PHP stops a request after 30. Cut off by the time limit, or by the
 * administrator leaving the page, the file being applied would roll back
 * whole, and every try after it stop at the same place.
 */
function upkeep_before_apply(?string &$backup = null): Closure
{
    return academy_backups()->beforeApplyHook(upkeep_raw_copy_before_apply($backup));
}

/** upkeep_before_apply()'s first half: this site's raw copy of every table. */
function upkeep_raw_copy_before_apply(?string &$backup = null): Closure
{
    return static function (PDO $pdo, array $files) use (&$backup): ?string {
        if (function_exists('set_time_limit')) {
            @set_time_limit(300);
        }
        if (function_exists('ignore_user_abort')) {
            ignore_user_abort(true);
        }
        try {
            $backup = upkeep_copy_before(array_map('db_migration_label', $files), upkeep_stamp());
        } catch (Throwable $e) {
            error_log('[upkeep] the copy before the migrations could not be written: ' . $e->getMessage());
            $reason = error_reason($e);
            throw new RuntimeException('The copy of every table could not be written, so nothing was applied' . ($reason !== null ? ": $reason" : '. The server\'s error log says more.'));
        }
        return $backup === null ? null : 'A copy of every table from before is in backups/' . basename($backup) . '.';
    };
}

/**
 * The migrations that can run now, applied, for the setup page and
 * backend/manage.php: the engine on a connection of its own, after a raw copy
 * of every table, the same way and under the same lock as the Migrations
 * page's Apply. Returns ['backup' => the copy's path or null, 'applied' =>
 * the files (db_migration_label())]. A migration that fails throws, naming its
 * file, and nothing of it stays (the ones before it do); so does a copy that
 * could not be written (nothing applied), and another apply at it (UPKEEP_BUSY).
 */
function upkeep_migrate(): array
{
    $backup = null;
    $done = db_migrator(db_connect(), upkeep_before_apply($backup))->apply();
    if ($done['busy']) {
        throw new RuntimeException(UPKEEP_BUSY);
    }
    if ($done['failed'] !== null) {
        throw new RuntimeException(db_migration_path($done['failed']) . ": {$done['error']}");
    }
    if ($done['error'] !== null) {
        throw new RuntimeException((string) $done['error']);
    }
    return ['backup' => $backup, 'applied' => array_map('db_migration_label', $done['applied'])];
}

/**
 * The stamp stored with the study content - null before migration 003, and
 * for a database the migrations have yet to build (no content_state at all:
 * an update that waits for its Apply, which the site says meanwhile).
 */
function upkeep_stored_stamp(): ?string
{
    try {
        $stored = db_value("SELECT to_jsonb(c)->>'stamp' FROM content_state c");
    } catch (PDOException $e) {
        if (($e->errorInfo[0] ?? (string) $e->getCode()) === '42P01') {
            // undefined_table
            return null;
        }
        throw $e;
    }
    return $stored === null ? null : (string) $stored;
}

/**
 * Brings the study content up to date with the files, when the stamp says
 * they changed. Returns what it did: null when the stamp matched, [] when it
 * looked and there was nothing to do, or nothing it may do yet, else
 * ['content' => …]. While a migration waits for an administrator's Apply
 * nothing is built and nothing saved - the site answers update_pending
 * meanwhile, and only the addresses that stay open come here, without taking
 * the lock an Apply holds -, so the first request after the Apply builds. One
 * that is not whole yet (a draft, or a file still on its way) stops nothing:
 * the stamp says this much is done, and the rest of the upload changes it.
 */
function upkeep_run(): ?array
{
    $stored = upkeep_stored_stamp();
    // Taken before anything is read: a file that lands while the work goes on
    // leaves the stored stamp behind the files, and the next request looks again.
    $stamp = upkeep_stamp();
    if ($stored === $stamp) {
        return null;
    }
    if (db_migrations_ready()) {
        return [];
    }

    // Seconds of work, perhaps. Cut off by the time limit, or by the person
    // leaving the page, it would roll back, and the next request start again.
    if (function_exists('set_time_limit')) {
        @set_time_limit(300);
    }
    if (function_exists('ignore_user_abort')) {
        ignore_user_abort(true);
    }

    return db_tx(static function () use ($stamp): array {
        // The other requests that saw the new stamp wait here, then find the work done; so does an Apply's end.
        db_value('SELECT pg_advisory_xact_lock(?::bigint)', [UPKEEP_LOCK]);
        if (db_value("SELECT to_jsonb(c)->>'stamp' FROM content_state c") === $stamp) {
            return [];
        }
        if (db_migrations_ready()) {
            return []; // one arrived whole meanwhile: it waits for its Apply, and the content with it
        }
        if (db_pending_migrations()) {
            // One is not whole yet: still being written, or uploaded. The content may need
            // it; the rest of the upload changes the stamp, and a request then finds it
            // waiting. Until then the stamp says this much is done.
            upkeep_save_stamp($stamp);
            return [];
        }
        $synced = content_sync(false, $stamp); // with the content, the stamp it was built from
        if ($synced) {
            return ['content' => $synced];
        }
        upkeep_save_stamp($stamp);
        return [];
    });
}

/** The stamp of what is done — if there is a column for it yet (migration 003 might be the one still arriving). */
function upkeep_save_stamp(string $stamp): void
{
    if (db_value("SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'content_state' AND column_name = 'stamp')")) {
        db_exec('UPDATE content_state SET stamp = ?', [$stamp]);
    }
}
