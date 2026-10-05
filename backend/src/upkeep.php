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
 * Apply on the admin panel's Migrations page (upkeep_apply(), after a raw copy
 * of every table, as the setup page takes one), and every address with data
 * answers 503 not_up_to_date meanwhile (upkeep_waiting()); the Migrations
 * page's own addresses do not wait (api/routes/migrations.php). The setup page
 * and backend/manage.php apply them as before (upkeep_migrate()), the same
 * way and under the same lock: never two at once, whichever starts them.
 *
 * Every request pays one cheap check: a stamp of the names, sizes and times
 * of the content files and the migrations, against the one stored in
 * content_state. Only when they differ does it look further, under a lock, so
 * two requests never do the work twice, and never while an Apply runs.
 */

declare(strict_types=1);

/** A number for pg_advisory_xact_lock(): one upkeep, or one Apply, at a time, per database. */
const UPKEEP_LOCK = 4210927;

/**
 * How long applying waits for the lock before it says busy. While a migration
 * waits, every request with data takes the lock for a moment to look
 * (upkeep_run()): an Apply that tried only once could be refused again and
 * again on a site in use. Another Apply, the setup page or manage.php running
 * longer than this: busy, try again.
 */
const UPKEEP_LOCK_WAIT_MS = 10000;

/** What applying says when the lock stays taken: another Apply, the setup page or manage.php is at it. */
const UPKEEP_BUSY = 'The database is being brought up to date already. Try again in a moment.';

/**
 * The upkeep's lock, for the transaction this runs in: waited for at most
 * $waitMs (the requests that look take it for a moment), then HttpError 409
 * busy. The wait bounds this statement alone: the migrations that run after it
 * wait for their own locks as they always did.
 */
function upkeep_lock(int $waitMs): void
{
    $before = (string) db_value("SELECT current_setting('lock_timeout')");
    db_value("SELECT set_config('lock_timeout', ?, true)", [max(1, $waitMs) . 'ms']); // 0 would be no limit at all
    try {
        db_value('SELECT pg_advisory_xact_lock(?::bigint)', [UPKEEP_LOCK]);
    } catch (PDOException $e) {
        if (($e->errorInfo[0] ?? (string) $e->getCode()) === '55P03') { // lock_not_available: the wait ran out
            throw new HttpError(409, UPKEEP_BUSY, [], 'busy');
        }
        throw $e;
    }
    db_value("SELECT set_config('lock_timeout', ?, true)", [$before]);
}

/** The names, sizes and times of the files the schema and the study content are built from. */
function upkeep_stamp(): string
{
    $migrations = array_map(static fn (string $f): string => 'backend/migrations/' . basename($f), glob(MIGRATIONS_DIR . '/*.sql') ?: []);
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
 * after the site was used, changes the stamp, and gets its own copy.
 */
function upkeep_copy_before(array $ready, string $stamp): ?string
{
    if (!$ready || !db_value("SELECT to_regclass('srs_progress') IS NOT NULL") || !learner_has_data(true)) {
        return null;
    }
    $note = backup_dir() . '/.before-migration.json';
    $now = ['database' => db_name(), 'stamp' => $stamp, 'pending' => $ready];
    $last = is_file($note) ? json_decode((string) @file_get_contents($note), true) : null;
    if (is_array($last) && array_intersect_key($last, $now) === $now) {
        return null;
    }
    $backup = backup_write_raw('before-migration');
    file_put_atomic($note, json_text($now + ['backup' => basename($backup)]) . "\n");
    return $backup;
}

/**
 * The migrations that can run now, applied: what the Migrations page's Apply,
 * the setup page and backend/manage.php all do. Under the upkeep's lock
 * (upkeep_lock(): one at a time, whichever of them asks; 409 busy when it
 * stays taken for $waitMs), after a raw copy of every table
 * (upkeep_copy_before()), in order, each under a savepoint of its own; the
 * first that fails is rolled back whole and the run stops there, the ones
 * before it stay applied.
 *
 * Returns ['applied' => names, 'failed' => the file that failed or null,
 * 'exception' => its PDOException or null, 'backup' => the copy's path or null].
 */
function upkeep_apply_ready(?string $stamp, int $waitMs): array
{
    if (function_exists('set_time_limit')) {
        @set_time_limit(300);
    }
    if (function_exists('ignore_user_abort')) {
        ignore_user_abort(true); // the administrator leaving the page does not cut a migration in half
    }
    return db_tx(static function () use ($stamp, $waitMs): array {
        upkeep_lock($waitMs);
        $result = ['applied' => [], 'failed' => null, 'exception' => null, 'backup' => null];
        $ready = db_migrations_ready();
        if (!$ready) {
            return $result;
        }
        $result['backup'] = upkeep_copy_before($ready, $stamp ?? upkeep_stamp());
        db_migrations_table(); // a new database: the setup page's first run
        $pdo = db();
        foreach ($ready as $name) {
            $sql = db_migration_sql($name);
            if ($sql === null) {
                break; // it stopped being whole since it was looked at: it waits
            }
            $pdo->exec('SAVEPOINT migration');
            try {
                $pdo->exec($sql);
                db_exec('INSERT INTO migrations (name) VALUES (?)', [$name]);
                $pdo->exec('RELEASE SAVEPOINT migration');
            } catch (PDOException $e) {
                $pdo->exec('ROLLBACK TO SAVEPOINT migration');
                $result['failed'] = $name;
                $result['exception'] = $e;
                break;
            }
            $result['applied'][] = $name;
        }
        return $result;
    });
}

/**
 * The migrations that can run now, applied — after a raw copy of every table,
 * under the lock an Apply takes (upkeep_apply_ready()). The setup page and
 * backend/manage.php come here; a migration that fails throws, naming its
 * file, and nothing of it stays (the ones before it do). Another Apply, setup
 * page or manage.php at it longer than $waitMs: HttpError 409 busy.
 * Returns ['backup' => the copy or null, 'applied' => names].
 */
function upkeep_migrate(?string $stamp = null, int $waitMs = UPKEEP_LOCK_WAIT_MS): array
{
    $done = upkeep_apply_ready($stamp, $waitMs);
    if ($done['exception'] !== null) {
        throw new PDOException("backend/migrations/{$done['failed']}: " . $done['exception']->getMessage(), 0, $done['exception']);
    }
    return ['backup' => $done['backup'], 'applied' => $done['applied']];
}

/**
 * The Migrations page's Apply (POST /api/admin/migrations/apply, an
 * administrator's): upkeep_apply_ready(). One at a time, under the upkeep's
 * lock: waited for while the requests that look take it for a moment; while
 * another Apply, the setup page or manage.php holds it longer than $waitMs,
 * 409 busy. The study content is rebuilt by the next request, once nothing
 * waits.
 *
 * Returns ['applied' => names, 'failed' => the file that failed or null,
 * 'error' => why it failed, PostgreSQL's own words, or null, 'backup' => the
 * copy's file name or null]. The error goes to the administrator on this
 * computer and on a website alike, as the IAM's Migrations page shows it (the
 * owner's decision, 2026-10-04: it says what to fix, and a host's error log is
 * hard to reach); it is logged as well. This answer is the one exception to
 * error_reason()'s rule: every other failure tells a website no more than a
 * sentence.
 */
function upkeep_apply(int $waitMs = UPKEEP_LOCK_WAIT_MS): array
{
    $done = upkeep_apply_ready(null, $waitMs);
    if ($done['exception'] !== null) {
        error_log("[upkeep] a migration failed: backend/migrations/{$done['failed']}: " . $done['exception']->getMessage());
    }
    return [
        'applied' => $done['applied'],
        'failed' => $done['failed'],
        'error' => $done['exception'] !== null ? $done['exception']->getMessage() : null,
        'backup' => $done['backup'] !== null ? basename($done['backup']) : null,
    ];
}

/**
 * What the Migrations page shows (GET /api/admin/migrations): the files
 * applied, the first first, each with when (milliseconds); and the ones
 * pending, in the order they will run, each with whether it is whole (a file
 * without its last line is still being uploaded, or written, and waits with
 * every one after it: db_migration_sql()).
 */
function upkeep_migrations(): array
{
    $applied = db_all('SELECT name, academy_ms(applied_at) AS applied_at FROM migrations ORDER BY name');
    $ready = db_migrations_ready();
    return [
        'applied' => array_map(static fn (array $r): array => ['name' => $r['name'], 'appliedAt' => (int) $r['applied_at']], $applied),
        'pending' => array_map(static fn (string $name): array => ['name' => $name, 'whole' => in_array($name, $ready, true)], db_pending_migrations()),
    ];
}

/**
 * Is this copy's database set up at all? Its stored stamp (null before
 * migration 003, too) — or HttpError 503 not_set_up for a database that does
 * not exist or has no tables yet: the setup page's job, not a request's.
 */
function upkeep_stored_stamp(): ?string
{
    try {
        $stored = db_value("SELECT to_jsonb(c)->>'stamp' FROM content_state c");
    } catch (PDOException $e) {
        if (db_missing_error($e) || db_value("SELECT to_regclass('migrations') IS NULL")) {
            throw not_set_up();
        }
        throw $e;
    }
    return $stored === null ? null : (string) $stored;
}

/**
 * Brings the study content up to date with the files, when the stamp says
 * they changed. Returns what it did: null when the stamp matched, [] when
 * nothing had really changed, else ['content' => …]. A migration that is
 * whole and not applied stops it: HttpError 503 not_up_to_date
 * (upkeep_waiting()) until an administrator applies it; one that is not
 * whole yet (still on its way) does not, and the site goes on as it is. A
 * database that was never set up: HttpError 503 not_set_up (so is one that
 * does not exist yet).
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

    // Seconds of work, perhaps. Cut off by the time limit, or by the person
    // leaving the page, it would roll back, and the next request start again.
    if (function_exists('set_time_limit')) {
        @set_time_limit(300);
    }
    if (function_exists('ignore_user_abort')) {
        ignore_user_abort(true);
    }

    return db_tx(static function () use ($stamp): array {
        // The other requests that saw the new stamp wait here, then find the work done.
        db_value('SELECT pg_advisory_xact_lock(?::bigint)', [UPKEEP_LOCK]);
        if (db_value("SELECT to_jsonb(c)->>'stamp' FROM content_state c") === $stamp) {
            return [];
        }
        $ready = db_migrations_ready();
        if ($ready) {
            // Not saved: every request looks again, until an administrator applied them.
            throw upkeep_waiting($ready);
        }
        if (db_pending_migrations()) {
            // One is not whole yet: still being uploaded. The content may need
            // it; the rest of the upload changes the stamp, and a request then
            // finds it waiting. Until then the stamp says this much is done.
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

/** What every address with data says while a migration waits for an administrator's Apply. */
const UPKEEP_WAITING = 'The database is not up to date with this version of the app yet: an administrator applies the update on the Migrations page.';

/**
 * The 503 of migrations that wait for an administrator: every address with
 * data answers it until they are applied. The files' names go out as the
 * answer's "detail", which only this computer is given (answer_to()).
 */
function upkeep_waiting(array $ready): HttpError
{
    return new HttpError(503, UPKEEP_WAITING, [], 'not_up_to_date', 'Waiting to be applied: ' . implode(', ', $ready) . '.');
}

/** The stamp of what is done — if there is a column for it yet (migration 003 might be the one still arriving). */
function upkeep_save_stamp(string $stamp): void
{
    if (db_value("SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'content_state' AND column_name = 'stamp')")) {
        db_exec('UPDATE content_state SET stamp = ?', [$stamp]);
    }
}
