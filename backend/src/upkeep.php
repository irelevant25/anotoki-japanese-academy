<?php
/**
 * The start-time work, done on requests. php backend/server.php does it when
 * it starts, but a hosted site has no start: Apache runs PHP once per request,
 * and there is no shell and no cron. So the first request after an upload
 * does it — the migrations not yet applied (after a raw copy of every table,
 * as the setup page takes one), and the study content rebuilt when data/ or
 * the code that builds it changed. (The day's backup is taken at the day's
 * first page load, by the API's daily_backup() middleware.)
 *
 * Every request pays one cheap check: a stamp of the names, sizes and times
 * of the content files and the migrations, against the one stored in
 * content_state. Only when they differ does it look further, under a lock, so
 * two requests never do the work twice.
 */

declare(strict_types=1);

/** A number for pg_advisory_xact_lock(): one upkeep at a time, per database. */
const UPKEEP_LOCK = 4210927;

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
 * The migrations that can run now, applied (the setup page, backend/server.php
 * at its start and a request after an upload all come here) — after a raw copy of every table
 * when the database holds study data. The copy is raw because this version's
 * queries may not fit the tables until the migrations ran. One copy for one
 * upload: a migration that fails is tried again by every request, and each
 * try must not add another full copy to backups/. The note of the copy names
 * the files it was taken with ($stamp) and the migrations pending then; while
 * both are the same, the tries are of the same files on the same tables (a
 * failed one rolls back, and nobody can study while one fails), so the copy
 * is still what is there. Another upload, a fixed file or the failing one put
 * back after the site was used, changes the stamp, and gets its own copy.
 * Returns ['backup' => the copy or null, 'applied' => names].
 */
function upkeep_migrate(?string $stamp = null): array
{
    $stamp ??= upkeep_stamp();
    $ready = db_migrations_ready();
    $backup = null;
    if ($ready && db_value("SELECT to_regclass('srs_progress') IS NOT NULL") && learner_has_data()) {
        $note = backup_dir() . '/.before-migration.json';
        $now = ['database' => db_name(), 'stamp' => $stamp, 'pending' => $ready];
        $last = is_file($note) ? json_decode((string) @file_get_contents($note), true) : null;
        if (!is_array($last) || array_intersect_key($last, $now) !== $now) {
            $backup = backup_write_raw('before-migration');
            file_put_atomic($note, json_text($now + ['backup' => basename($backup)]) . "\n");
        }
    }
    return ['backup' => $backup, 'applied' => $ready ? db_migrate() : []];
}

/**
 * Brings the database up to date with the files, when the stamp says they
 * changed. Returns what it did: null when the stamp matched, [] when nothing
 * had really changed, else 'backup', 'migrations', 'content'. A database that
 * was never set up is the setup page's job, not a request's: HttpError 503
 * not_set_up (so is one that does not exist yet).
 */
function upkeep_run(): ?array
{
    try {
        $stored = db_value("SELECT to_jsonb(c)->>'stamp' FROM content_state c"); // null before migration 003, too
    } catch (PDOException $e) {
        if (db_missing_error($e) || db_value("SELECT to_regclass('migrations') IS NULL")) {
            throw not_set_up();
        }
        throw $e;
    }
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
        $done = [];
        if (db_pending_migrations()) {
            try {
                $migrated = upkeep_migrate($stamp);
            } catch (PDOException $e) {
                error_log('[upkeep] a migration failed: ' . $e->getMessage());
                throw upkeep_failed($e);
            }
            if ($migrated['backup']) {
                $done['backup'] = $migrated['backup'];
            }
            $done['migrations'] = $migrated['applied'];
            if (db_pending_migrations()) {
                // One is not whole yet: still being uploaded. The content may need
                // it; the rest of the upload changes the stamp, and a request then
                // does both. Until then the stamp says this much is done.
                upkeep_save_stamp($stamp);
                return $done;
            }
        }
        $synced = content_sync(false, $stamp); // with the content, the stamp it was built from
        if ($synced) {
            $done['content'] = $synced;
        } else {
            upkeep_save_stamp($stamp);
        }
        return $done;
    });
}

/**
 * The 503 of a migration that failed: every request answers it until the file
 * is fixed. The message names the migration and says why, so it goes out —
 * in the sentence and as the answer's "detail" — under PHP's built-in server
 * only (this computer); a website's error log has it ($sapi is PHP_SAPI; a
 * test names another).
 */
function upkeep_failed(PDOException $e, string $sapi = PHP_SAPI): HttpError
{
    $reason = error_reason($e, $sapi);
    return new HttpError(503, 'The database could not be brought up to date with the upload'
        . ($reason !== null ? ': ' . $reason : '. The server\'s error log says more.'), [], 'not_up_to_date', $reason);
}

/** The stamp of what is done — if there is a column for it yet (migration 003 might be the one still arriving). */
function upkeep_save_stamp(string $stamp): void
{
    if (db_value("SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'content_state' AND column_name = 'stamp')")) {
        db_exec('UPDATE content_state SET stamp = ?', [$stamp]);
    }
}
