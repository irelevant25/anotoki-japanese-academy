<?php
/**
 * The people whose data this site holds, for its administrators (the IAM role
 * ADMIN; GET and DELETE /api/admin/people…, api/routes/people.php): who they
 * are as far as the site knows (the id and name of their tokens, when they
 * came first and last, their time zone), how much they have studied, and
 * deleting a person's data.
 *
 * Deleting takes a copy of all of that person's data first
 * (academy-before-delete-user-<id>-…, their last 14 kept), then deletes their
 * rows in every table of USER_TABLES and their users row, in one transaction
 * that holds that row FOR UPDATE: a request of theirs still on its way waits,
 * then finds no row and starts their data afresh (users_hold()), instead of
 * failing. The strings they reworded stay, with nobody as who saved them
 * (translations.updated_by empties by its foreign key). Their account is the
 * IAM's: they may still sign in, and start again with nothing.
 */

declare(strict_types=1);

/**
 * Everybody, the latest seen first: {id, username, createdAt, lastSeenAt,
 * timeZone, items, attempts} - items they have learned, exam attempts they
 * have finished; times in milliseconds. People only: the visitors (somebody
 * studying without signing in, src/visitors.php) are a number of their own,
 * visitors_count() (GET /api/admin/visitors).
 */
function people_list(): array
{
    $counts = [];
    foreach (db_all('SELECT u.id,
            (SELECT count(*) FROM srs_progress p WHERE p.user_id = u.id AND p.stage > 0) AS items,
            (SELECT count(*) FROM exam_attempts a WHERE a.user_id = u.id) AS attempts
        FROM users u WHERE u.id > 0') as $r) {
        $counts[(int) $r['id']] = ['items' => (int) $r['items'], 'attempts' => (int) $r['attempts']];
    }
    $people = array_map(static fn (array $u): array => $u + ($counts[$u['id']] ?? ['items' => 0, 'attempts' => 0]), users_all());
    usort($people, static fn (array $a, array $b): int => [$b['lastSeenAt'], $a['id']] <=> [$a['lastSeenAt'], $b['id']]);
    return $people;
}

/**
 * Deletes all of this person's data, after a copy of it. Returns the copy's
 * file name, or null when the site has nobody of that id.
 */
function people_delete(int $id): ?string
{
    return db_tx(static function () use ($id): ?string {
        if (!users_lock($id)) {
            return null;
        }
        $copy = backup_person_copy('before-delete', $id);
        foreach (USER_TABLES as $table) {
            db_exec("DELETE FROM $table WHERE user_id = ?", [$id]);
        }
        db_exec('DELETE FROM users WHERE id = ?', [$id]);
        return basename($copy);
    });
}
