<?php
/**
 * The people whose data this database holds. The IAM owns identity: a users
 * row is only the id the study rows belong to, plus the name from the
 * person's latest token (so a backup says whose data is whose), filled in as
 * their requests arrive.
 */

declare(strict_types=1);

/** The tables whose rows each belong to one person (their user_id). */
const USER_TABLES = ['srs_settings', 'srs_progress', 'srs_daily', 'srs_log', 'exam_attempts', 'imports'];

/**
 * A request from this person: their row, made the first time, with the name
 * from their token and when they were last here. Written at most every five
 * minutes (or when the name changed), so studying doesn't write it on every
 * answer.
 */
function users_seen(int $id, ?string $username): void
{
    db_exec(
        "INSERT INTO users (id, preferred_username) VALUES (?, ?)
         ON CONFLICT (id) DO UPDATE SET preferred_username = coalesce(EXCLUDED.preferred_username, users.preferred_username), last_seen_at = now()
         WHERE users.last_seen_at < now() - interval '5 minutes'
            OR users.preferred_username IS DISTINCT FROM coalesce(EXCLUDED.preferred_username, users.preferred_username)",
        [$id, $username]
    );
}

/** A row for this id, if there is none yet (an import into a new id). */
function users_ensure(int $id): void
{
    if ($id < 1) {
        throw new RuntimeException("Not a user id: $id");
    }
    db_exec('INSERT INTO users (id) VALUES (?) ON CONFLICT (id) DO NOTHING', [$id]);
}

/** Everybody, by id: {id, username, createdAt, lastSeenAt}, times in milliseconds. */
function users_all(): array
{
    return array_map(static fn (array $r): array => [
        'id' => (int) $r['id'],
        'username' => $r['preferred_username'],
        'createdAt' => (int) $r['created_at'],
        'lastSeenAt' => (int) $r['last_seen_at'],
    ], db_all('SELECT id, preferred_username, academy_ms(created_at) AS created_at, academy_ms(last_seen_at) AS last_seen_at FROM users ORDER BY id'));
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

/**
 * Gives user $to everything user $from has (owner_change(): the setup page, manage.php --owner-id): the
 * users row takes the new id, and the foreign keys carry every study row
 * along (ON UPDATE CASCADE). Refused when $to already has anything here; a
 * bare row $to got only by signing in is replaced. Returns the rows moved,
 * per table.
 */
function users_move(int $from, int $to): array
{
    if ($from < 1 || $to < 1) {
        throw new RuntimeException('User ids are whole numbers from 1.');
    }
    return db_tx(static function () use ($from, $to): array {
        $moved = [];
        foreach (USER_TABLES as $table) {
            $moved[$table] = $from === $to ? 0 : (int) db_value("SELECT count(*) FROM $table WHERE user_id = ?", [$from]);
        }
        if ($from === $to) {
            return $moved;
        }
        if (users_has_rows($to)) {
            throw new RuntimeException("User $to already has data here, so nothing was moved.");
        }
        $name = db_value('SELECT preferred_username FROM users WHERE id = ?', [$to]);
        db_exec('DELETE FROM users WHERE id = ?', [$to]);
        if (!db_exec('UPDATE users SET id = ?, preferred_username = coalesce(?, preferred_username) WHERE id = ?', [$to, $name, $from])) {
            users_ensure($to); // $from never had a row: nothing to carry
        }
        return $moved;
    });
}
