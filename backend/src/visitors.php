<?php
/**
 * Visitors: people who study without signing in, on a site whose IAM says it
 * does not require sign-in (src/access.php). A visitor gets what a learner
 * gets for their own data - kanji progress, the answer log, settings, exam
 * attempts with their reports - under a users row with a negative id (an IAM
 * user id is always positive; migration 007). Nothing but this file makes,
 * finds, sweeps or moves one. docs/kb/sign-in.md, *Visitors*, says the rules;
 * the anotoki build analyzer's visitor accounts are the pattern.
 *
 * The key: 32 random bytes the server makes, base64url without padding (43
 * characters). It leaves the server once, in the X-Visitor-Key header of the
 * answer whose save made the visitor (never in a body, an address or a log);
 * the browser keeps it and sends it back in the X-Visitor-Key request header.
 * The row keeps only its SHA-256, and a request is that visitor when the hash
 * of the key it sends is a row's - 256 bits, so a plain lookup is safe.
 *
 *   visitors_find()    the visitor of a key, seen now (written at most every
 *                      five minutes); unknown or malformed: 401 visitor_unknown
 *                      (visitors_of_key(): the anotoki library's Identify asks it,
 *                      src/auth.php)
 *   visitors_make()    a new visitor, after the limits (visitors at once, new
 *                      ones an hour per address and in all), inside the
 *                      transaction of the save that makes it: a save refused
 *                      or failed makes nobody and counts nothing
 *   visitors_check_caps()  a visitor's own caps: exam attempts, answers kept
 *   visitors_sweep()   visitors unseen for 30 days deleted with all of their
 *                      data, a few at a time, after somebody's answer
 *   visitors_move()    at sign-in, a visitor's data into the person's account
 *   visitors_count()   how many there are, for the admin panel and manage.php
 *
 * The limits are counted on the visitor rows themselves (the hash of the
 * address each was made from, users.visitor_from, and when), so there are no
 * counters to keep or give back. Every number has a default here and may be
 * set in backend/config/app.local.php, which is optional and never written by
 * the setup page: 'visitors' => ['max' => 300, …] (docs/kb/hosting.md).
 *
 * While migration 007 is not applied the database cannot keep visitors: the
 * sign-in rule (academy_sign_in_rule(), src/auth.php) then says sign-in is
 * required whatever the IAM says, so no visitor path is
 * reached; the move (which works whatever the switch) answers 503
 * visitors_unavailable, and the sweep does nothing.
 */

declare(strict_types=1);

use Psr\Http\Message\ServerRequestInterface as Request;

/** The request and answer header that carries a visitor's key. */
const VISITOR_HEADER = 'X-Visitor-Key';

/** What a key looks like: 43 characters of base64url, no padding. */
const VISITOR_KEY = '/^[A-Za-z0-9_-]{43}$/D';

/** The advisory lock under which a visitor is made, so that the limits count exactly. */
const VISITORS_LOCK = 4210928;

/**
 * The numbers, with their defaults: app.local.php's 'visitors' => [name => n]
 * replaces any of them. keep_days: unseen this long, a visitor is deleted.
 * max: visitors at once. new_per_hour_per_address / new_per_hour: visitors
 * made in the last hour from one address (IPv6: its /64), and from all.
 * max_attempts / max_answers: what one visitor keeps (exam attempts, lines of
 * the answer log). sweep_every_seconds: how often the sweep looks;
 * sweep_batch: visitors deleted per transaction; sweep_timeout_ms: how long
 * one statement of the sweep may take; move_lock_timeout_ms: how long the
 * move waits for a row somebody else holds.
 */
const VISITORS_DEFAULTS = [
    'keep_days' => 30,
    'max' => 300,
    'new_per_hour_per_address' => 10,
    'new_per_hour' => 60,
    'max_attempts' => 10,
    'max_answers' => 20000,
    'sweep_every_seconds' => 3600,
    'sweep_batch' => 20,
    'sweep_timeout_ms' => 2000,
    'move_lock_timeout_ms' => 5000,
];

/** One of the numbers of VISITORS_DEFAULTS, as app.local.php sets it (a whole number, at least $min) or its default. */
function visitors_setting(string $name, int $min = 0): int
{
    $value = config("app.visitors.$name");
    return is_int($value) && $value >= $min ? $value : VISITORS_DEFAULTS[$name];
}

/** How many days a visitor is kept after their last visit. */
function visitors_keep_days(): int
{
    return visitors_setting('keep_days', 1);
}

/**
 * Has the database what visitors need: users.visitor_key_hash, which
 * migration 007 adds? A database the question fails on cannot keep them
 * either. Asked once per request (users_time_zone_ready()'s pattern).
 */
function visitors_ready(): bool
{
    static $ready = null;
    if ($ready === null) {
        try {
            $ready = (bool) db_value("SELECT EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'visitor_key_hash')");
        } catch (Throwable $e) {
            $ready = false;
        }
    }
    return $ready;
}

/** The key a request sends (its X-Visitor-Key header), or null when it sends none: an empty header is none. */
function visitors_key_of(string $header): ?string
{
    $key = trim($header);
    return $key === '' ? null : $key;
}

function visitors_well_formed(string $key): bool
{
    return preg_match(VISITOR_KEY, $key) === 1;
}

function visitors_hash(string $key): string
{
    return hash('sha256', $key);
}

/** 401 visitor_unknown: a key nobody has (moved into an account, swept, never there) or that is not a key. */
function visitors_unknown(): HttpError
{
    return new HttpError(401, 'This browser\'s study without signing in has ended: it was deleted after a long time unused, or moved into an account.', [], 'visitor_unknown');
}

/** 503 visitors_unavailable: migration 007 is not applied here. */
function visitors_must_be_ready(): void
{
    if (!visitors_ready()) {
        throw new HttpError(503, 'Studying without signing in is not ready yet: an administrator applies the waiting database update on the Migrations page. Sign in to continue.',
            ['Retry-After: 60'], 'visitors_unavailable');
    }
}

/**
 * The visitor of this key: ['id' => negative, 'timeZone' => theirs for this
 * request]. Seen now: last_seen_at (and a time zone their browser named that
 * differs from the kept one) written at most every five minutes, as
 * people_seen() does for a person. The zone: the request's ($zone, checked),
 * else the one kept on their row, else UTC.
 */
function visitors_find(string $key, ?string $zone): array
{
    if (!visitors_well_formed($key)) {
        throw visitors_unknown();
    }
    visitors_must_be_ready();
    $row = db_one('SELECT id, time_zone FROM users WHERE visitor_key_hash = ? AND id < 0', [visitors_hash($key)]);
    if ($row === null) {
        throw visitors_unknown();
    }
    $id = (int) $row['id'];
    db_exec(
        "UPDATE users SET last_seen_at = now(), time_zone = coalesce(?, time_zone)
          WHERE id = ? AND (last_seen_at < now() - interval '5 minutes' OR time_zone IS DISTINCT FROM coalesce(?, time_zone))",
        [$zone, $id, $zone]
    );
    return ['id' => $id, 'timeZone' => $zone ?? time_zone_known($row['time_zone']) ?? 'UTC'];
}

/**
 * Who a key is, for the anotoki library's Identify (academy_identify(),
 * src/auth.php), which asks only for a request with a key and no token while
 * sign-in is not required here: the visitor (visitors_find(), seen now, in
 * the zone the request names), or null for a key that is nobody's or no key
 * at all - Identify answers that 401 visitor_unknown.
 */
function visitors_of_key(string $key): ?array
{
    if (!visitors_well_formed($key)) {
        return null;
    }
    try {
        return visitors_find($key, auth_time_zone_header($_SERVER));
    } catch (HttpError $e) {
        if ($e->errorCode === 'visitor_unknown') {
            return null;
        }
        throw $e;
    }
}

/**
 * A new visitor for the save that is about to run, and its key: [id, key].
 * Called inside that save's transaction (learner_first_save()), which it
 * holds VISITORS_LOCK for, so the limits count exactly; a save that is
 * refused or fails rolls the visitor back with it. Over a limit: 429
 * too_many_visitors, and nothing is made. $request: the save's, whose
 * address the limits count (client_address_counted()).
 */
function visitors_make(Request $request, ?string $zone): array
{
    if (!db()->inTransaction()) {
        throw new LogicException('A visitor is made inside the transaction of the save that makes it.');
    }
    visitors_must_be_ready();
    db_value('SELECT pg_advisory_xact_lock(?::bigint)', [VISITORS_LOCK]);
    $from = visitors_address_hash($request);
    $counts = db_one(
        "SELECT count(*) AS everybody,
                count(*) FILTER (WHERE created_at > now() - interval '1 hour') AS this_hour,
                count(*) FILTER (WHERE created_at > now() - interval '1 hour' AND visitor_from = ?) AS from_here
           FROM users WHERE id < 0",
        [$from]
    );
    if ((int) $counts['everybody'] >= visitors_setting('max')
        || (int) $counts['from_here'] >= visitors_setting('new_per_hour_per_address')
        || (int) $counts['this_hour'] >= visitors_setting('new_per_hour')) {
        throw new HttpError(429, 'Too many people are using the site without signing in just now. Sign in to continue, or try again later.',
            ['Retry-After: 3600'], 'too_many_visitors');
    }
    $key = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
    $id = (int) db_value(
        "INSERT INTO users (id, visitor_key_hash, visitor_from, time_zone) VALUES (nextval('visitor_ids'), ?, ?, ?) RETURNING id",
        [visitors_hash($key), $from, $zone]
    );
    return [$id, $key];
}

/**
 * A visitor's own caps, checked before a save that would grow what they
 * keep: 'attempts' (a paper, and its submit: their exam attempts) or
 * 'answers' (a kanji answer or reset: their answer log). At a cap: 422
 * visitor_limit, with the limit and its number (the page words it, and
 * offers to sign in). Counted before the save, so two saves at once may pass
 * one over: harmless. A person ($id > 0) has no caps.
 */
function visitors_check_caps(int $id, string $limit): void
{
    if ($id >= 0) {
        return;
    }
    if ($limit === 'attempts') {
        $max = visitors_setting('max_attempts');
        if ((int) db_value('SELECT count(*) FROM exam_attempts WHERE user_id = ?', [$id]) >= $max) {
            throw new HttpError(422, "Without signing in, this browser keeps at most $max exam attempts. Sign in to keep more.", [], 'visitor_limit', null,
                ['limit' => 'attempts', 'max' => $max]);
        }
        return;
    }
    if ($limit === 'answers') {
        $max = visitors_setting('max_answers');
        if ((int) db_value('SELECT count(*) FROM srs_log WHERE user_id = ?', [$id]) >= $max) {
            throw new HttpError(422, "Without signing in, this browser keeps at most $max answers. Sign in to go on.", [], 'visitor_limit', null,
                ['limit' => 'answers', 'max' => $max]);
        }
        return;
    }
    throw new LogicException("No visitor limit $limit.");
}

/**
 * The sweep, for after somebody's answer (after_response_add()): at most once
 * every sweep_every_seconds across the site (a stamp file in the app's cache
 * folder, claimed before the sweep runs), whether or not the site requires
 * sign-in now - visitors of before still go after their 30 days. Never fails:
 * whatever goes wrong is logged.
 */
function visitors_sweep_now_and_then(): void
{
    try {
        $dir = auth_cache_dir();
        $stamp = "$dir/visitors-swept";
        clearstatcache(true, $stamp);
        if (is_file($stamp) && filemtime($stamp) > time() - visitors_setting('sweep_every_seconds')) {
            return;
        }
        if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
            throw new RuntimeException("Cannot make $dir");
        }
        touch($stamp);
        visitors_sweep();
    } catch (Throwable $e) {
        error_log('[visitors] the sweep stopped: ' . auth_log_text($e->getMessage()));
    }
}

/**
 * Deletes the visitors unseen for keep_days, with every row of theirs: up to
 * five batches of sweep_batch, each one transaction whose statements may take
 * sweep_timeout_ms, the rows taken FOR UPDATE SKIP LOCKED (a visitor busy
 * with a save, or being moved, waits for the next sweep), within ten seconds
 * in all. Nothing while migration 007 is not applied. Returns how many went;
 * a statement that fails throws (visitors_sweep_now_and_then() logs it).
 */
function visitors_sweep(): int
{
    if (!visitors_ready()) {
        return 0;
    }
    ignore_user_abort(true);
    $days = visitors_keep_days();
    $batch = visitors_setting('sweep_batch', 1);
    $timeout = visitors_setting('sweep_timeout_ms', 1);
    $until = microtime(true) + 10;
    $swept = 0;
    for ($round = 0; $round < 5 && microtime(true) < $until; $round++) {
        $gone = db_tx(static function () use ($days, $batch, $timeout): int {
            db_value("SELECT set_config('statement_timeout', ?, true)", [(string) $timeout]);
            $ids = array_map('intval', array_column(db_all(
                'SELECT id FROM users WHERE id < 0 AND last_seen_at < now() - make_interval(days => ?::int)
                  ORDER BY last_seen_at LIMIT ?::int FOR UPDATE SKIP LOCKED',
                [$days, $batch]
            ), 'id'));
            if (!$ids) {
                return 0;
            }
            $list = json_text($ids);
            foreach (USER_TABLES as $table) {
                db_exec("DELETE FROM $table WHERE user_id IN (SELECT json_array_elements_text(?::json)::bigint)", [$list]);
            }
            db_exec('DELETE FROM users WHERE id < 0 AND id IN (SELECT json_array_elements_text(?::json)::bigint)', [$list]);
            return count($ids);
        });
        $swept += $gone;
        if ($gone < $batch) {
            break;
        }
    }
    if ($swept > 0) {
        error_log("[visitors] unseen for $days days, deleted: $swept");
    }
    return $swept;
}

/**
 * At sign-in: what this key's visitor studied becomes $person's, in one
 * transaction, and the visitor (with its key) is gone. Where both have the
 * same thing, the person's stays:
 *
 *   srs_progress   an item both have keeps the person's row as it is (kept);
 *                  every other item of the visitor's moves (items)
 *   srs_daily      a day both have: the counts added (both sets of answers
 *                  were given); every other day moves
 *   srs_log        every line moves (answers), but the visitor's full resets
 *                  and its resets of items the person kept: they touched only
 *                  the visitor's copy, and would misreport the person's history
 *   exam_attempts  every attempt moves (attempts), its report the snapshot it
 *                  was; an id both have (the same finishing time and seed)
 *                  keeps the person's
 *   srs_settings   the person's, when they have them; else the visitor's
 *   users.time_zone  the person's, or else the visitor's
 *
 * When the person has study data of their own, a copy of it is taken first
 * (academy-before-move-user-<id>-…, outside the transaction, as before a
 * reset) - and only once the key is known, so a key moved already takes no
 * copy. Never a copy of the visitor's: a visitor has no data file.
 *
 * Returns {found, items, kept, attempts, answers}; found false (and zeros)
 * when no visitor has this key - moved already (by another tab, say), swept,
 * or never there - so the move may be asked again. The visitor's row is
 * locked first, then the person's, each waited for at most
 * move_lock_timeout_ms; a lock not had in time, a deadlock or a write that
 * met another (SQLSTATE 55P03, 40P01, 40001, 23505): 503 visitor_move_retry,
 * nothing moved, ask again.
 */
function visitors_move(int $person, string $key): array
{
    if ($person < 1) {
        throw new LogicException('Only a signed-in person takes a visitor in.');
    }
    visitors_must_be_ready();
    $none = ['found' => false, 'items' => 0, 'kept' => 0, 'attempts' => 0, 'answers' => 0];
    $hash = visitors_hash($key);
    if (!visitors_well_formed($key) || db_value('SELECT 1 FROM users WHERE visitor_key_hash = ? AND id < 0', [$hash]) === null) {
        return $none;
    }
    if (learner_has_data_of($person)) {
        backup_person_copy('before-move', $person);
    }
    try {
        return db_tx(static function () use ($person, $hash, $none): array {
            db_value("SELECT set_config('lock_timeout', ?, true)", [visitors_setting('move_lock_timeout_ms', 1) . 'ms']);
            $found = db_value('SELECT id FROM users WHERE visitor_key_hash = ? AND id < 0 FOR UPDATE', [$hash]);
            if ($found === null) {
                return $none;
            }
            $visitor = (int) $found;
            if (!users_lock($person)) {
                users_ensure($person); // their data was deleted meanwhile: they are signed in, and start afresh with this
                users_lock($person);
            }

            // The log first, while the person's items show which of the visitor's resets to leave out.
            db_exec(
                "DELETE FROM srs_log l WHERE l.user_id = ? AND (l.kind = 'reset'
                    OR (l.kind = 'reset-item' AND EXISTS (SELECT 1 FROM srs_progress p WHERE p.user_id = ? AND p.item_id = l.item_id)))",
                [$visitor, $person]
            );
            $kept = db_exec('DELETE FROM srs_progress v USING srs_progress p WHERE v.user_id = ? AND p.user_id = ? AND p.item_id = v.item_id', [$visitor, $person]);
            $items = db_exec('UPDATE srs_progress SET user_id = ? WHERE user_id = ?', [$person, $visitor]);

            db_exec(
                'INSERT INTO srs_daily (user_id, day, lessons, reviews, reviews_correct, practice, practice_correct)
                 SELECT ?, day, lessons, reviews, reviews_correct, practice, practice_correct FROM srs_daily WHERE user_id = ?
                 ON CONFLICT (user_id, day) DO UPDATE SET lessons = srs_daily.lessons + EXCLUDED.lessons,
                    reviews = srs_daily.reviews + EXCLUDED.reviews, reviews_correct = srs_daily.reviews_correct + EXCLUDED.reviews_correct,
                    practice = srs_daily.practice + EXCLUDED.practice, practice_correct = srs_daily.practice_correct + EXCLUDED.practice_correct',
                [$person, $visitor]
            );
            db_exec('DELETE FROM srs_daily WHERE user_id = ?', [$visitor]);

            $answers = db_exec('UPDATE srs_log SET user_id = ? WHERE user_id = ?', [$person, $visitor]);

            db_exec('DELETE FROM exam_attempts v USING exam_attempts p WHERE v.user_id = ? AND p.user_id = ? AND p.id = v.id', [$visitor, $person]);
            $attempts = db_exec('UPDATE exam_attempts SET user_id = ? WHERE user_id = ?', [$person, $visitor]);

            db_exec('UPDATE srs_settings SET user_id = ? WHERE user_id = ? AND NOT EXISTS (SELECT 1 FROM srs_settings WHERE user_id = ?)', [$person, $visitor, $person]);
            db_exec('DELETE FROM srs_settings WHERE user_id = ?', [$visitor]);
            db_exec('DELETE FROM imports WHERE user_id = ?', [$visitor]); // a visitor never has one: no data file

            db_exec('UPDATE users SET time_zone = (SELECT time_zone FROM users WHERE id = ?) WHERE id = ? AND time_zone IS NULL', [$visitor, $person]);
            db_exec('DELETE FROM users WHERE id = ? AND id < 0', [$visitor]);

            return ['found' => true, 'items' => $items, 'kept' => $kept, 'attempts' => $attempts, 'answers' => $answers];
        });
    } catch (PDOException $e) {
        $state = (string) ($e->errorInfo[0] ?? $e->getCode());
        if (in_array($state, ['23505', '40001', '40P01', '55P03'], true)) {
            error_log("[visitors] a move was interrupted, to be asked again: SQLSTATE $state");
            throw new HttpError(503, 'Moving what this browser studied into your account did not finish. Try again in a moment.',
                ['Retry-After: 2'], 'visitor_move_retry');
        }
        throw $e;
    }
}

/**
 * For the admin panel and manage.php --check: {ready, count, oldestSeenAt
 * (ms or null), keepDays, max}; ready false (and no visitors) while migration
 * 007 is not applied.
 */
function visitors_count(): array
{
    $about = ['keepDays' => visitors_keep_days(), 'max' => visitors_setting('max')];
    if (!visitors_ready()) {
        return ['ready' => false, 'count' => 0, 'oldestSeenAt' => null] + $about;
    }
    $row = db_one('SELECT count(*) AS n, academy_ms(min(last_seen_at)) AS oldest FROM users WHERE id < 0');
    return ['ready' => true, 'count' => (int) $row['n'], 'oldestSeenAt' => $row['oldest'] === null ? null : (int) $row['oldest']] + $about;
}

/**
 * The address bucket a request counts as (client_address_counted(): an IPv6
 * address by its /64), as kept on a visitor's row: HMAC-SHA-256 under the
 * site's own secret, so the database - and every copy of it - holds no
 * address. It is a stable pseudonym of that bucket for as long as the secret
 * lasts: whoever holds the secret can test an address against it (the few
 * billion IPv4 addresses are quickly tried), nobody without it.
 */
function visitors_address_hash(Request $request): string
{
    return hash_hmac('sha256', client_address_counted($request), visitors_address_secret());
}

/**
 * The secret of visitors_address_hash(): visitor-address.key in the app's
 * cache folder (auth_cache_dir(): backend/storage/cache/, never a shared temp
 * folder), made the first time. Losing it only restarts the counts of the
 * hour.
 */
function visitors_address_secret(): string
{
    $file = auth_cache_dir() . '/visitor-address.key';
    $secret = is_file($file) ? trim((string) file_get_contents($file)) : '';
    if (preg_match('/^[0-9a-f]{64}$/D', $secret)) {
        return $secret;
    }
    $dir = dirname($file);
    if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
        throw new RuntimeException("Cannot make $dir");
    }
    file_put_atomic($file, bin2hex(random_bytes(32)) . "\n", true);
    return trim((string) file_get_contents($file));
}
