<?php
/**
 * The people whose data this database holds. The IAM owns identity: a users
 * row is only the id the study rows belong to, plus the name from the
 * person's latest token (so a backup says whose data is whose), filled in as
 * their requests arrive - and their time zone, which their browser names.
 * The anotoki library's people module writes the row from the token
 * (people_seen(), src/people.php) and blanks it when the IAM deleted the
 * account (users.anonymized_at, migration 010). A row with a negative id is a
 * visitor's, somebody studying without signing in (src/visitors.php,
 * migration 007): their study rows are like anybody's, and only
 * src/visitors.php makes, finds or deletes the row.
 */

declare(strict_types=1);

/** The tables whose rows each belong to one person (their user_id). */
const USER_TABLES = ['srs_settings', 'srs_progress', 'srs_daily', 'srs_log', 'exam_attempts', 'imports'];

/**
 * Has users its time_zone column (migration 005)? An upload whose 005 is still
 * on its way (or a copy that has not applied it) must not answer 500 for a
 * column that is not there yet: without it, a request's zone still counts for
 * that request, and nothing is kept. Asked once per request.
 */
function users_time_zone_ready(): bool
{
    static $ready = null;
    return $ready ??= (bool) db_value("SELECT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'time_zone')");
}

/** Keeps this person's time zone ($zone, checked: time_zone_known()), when there is a column for it. */
function users_set_time_zone(int $id, string $zone): void
{
    if (users_time_zone_ready()) {
        db_exec('UPDATE users SET time_zone = ? WHERE id = ? AND time_zone IS DISTINCT FROM ?', [$zone, $id, $zone]);
    }
}

/**
 * Inside a transaction that writes this person's study rows (an answer, a
 * reset, a submitted exam): holds their users row FOR SHARE until it ends.
 * An import of their data, or an administrator deleting it, holds the row FOR
 * UPDATE (users_lock()), so the two take turns: an answer that arrives
 * meanwhile waits, then works on what the import left. When the row went
 * meanwhile (their data was deleted), it is made again - they are signed in,
 * and what they do next starts their data afresh - instead of a write that
 * would fail on the missing row. A visitor's row ($id < 0) is never made
 * again: it went because it was moved into an account at sign-in (in another
 * tab) or swept, and its key opens nothing any more - 401 visitor_unknown,
 * nothing written.
 */
function users_hold(int $id): void
{
    if (db_value('SELECT 1 FROM users WHERE id = ? FOR SHARE', [$id]) === null) {
        if ($id < 0) {
            throw visitors_unknown();
        }
        users_ensure($id);
        db_value('SELECT 1 FROM users WHERE id = ? FOR SHARE', [$id]);
    }
}

/**
 * Inside a transaction that replaces or deletes all of this person's data:
 * holds their users row FOR UPDATE until it ends, so no answer of theirs
 * writes in between (users_hold()). Returns false when there is no row.
 */
function users_lock(int $id): bool
{
    return db_value('SELECT 1 FROM users WHERE id = ? FOR UPDATE', [$id]) !== null;
}

/** A row for this id, if there is none yet (an import into a new id). */
function users_ensure(int $id): void
{
    if ($id < 1) {
        throw new RuntimeException("Not a user id: $id");
    }
    db_exec('INSERT INTO users (id) VALUES (?) ON CONFLICT (id) DO NOTHING', [$id]);
}

/**
 * Everybody, by id: {id, username, createdAt, lastSeenAt, timeZone}, times in
 * milliseconds; timeZone null for somebody who never named one (and for
 * everybody before migration 005). People only: never a visitor (id < 0),
 * whose data is in no backup and on no People page (src/visitors.php).
 */
function users_all(): array
{
    $zone = users_time_zone_ready() ? 'time_zone' : 'NULL::text AS time_zone';
    return array_map(
        static fn(array $r): array => [
            'id' => (int) $r['id'],
            'username' => $r['preferred_username'],
            'createdAt' => (int) $r['created_at'],
            'lastSeenAt' => (int) $r['last_seen_at'],
            'timeZone' => $r['time_zone'],
        ],
        db_all("SELECT id, preferred_username, academy_ms(created_at) AS created_at, academy_ms(last_seen_at) AS last_seen_at, $zone FROM users WHERE id > 0 ORDER BY id"),
    );
}

/** Does this person have anything here at all: study data, settings, an import? */
function users_has_rows(int $id): bool
{
    foreach (USER_TABLES as $table) {
        if (db_value("SELECT EXISTS (SELECT 1 FROM $table WHERE user_id = ?)", [$id])) {
            return true;
        }
    }
    return false;
}
