<?php
/**
 * The owner's data and their IAM user id. Until 2026-09-27 the database held
 * the owner's data only; migration 002 gave all of it to user 1, the owner's
 * id at the IAM. When their id there is another, their data moves to it here:
 * from the setup page ("your IAM user id") or php backend/manage.php --owner-id=N.
 */

declare(strict_types=1);

/**
 * Everything of user $from (the owner so far, auth.local_user_id) becomes
 * user $to's, after a backup of everybody's data. Refused (users_move()) when
 * user $to already has study data of their own; nothing to move when the data
 * is user $to's already (a backup restored under that id). The caller saves
 * $to as auth.local_user_id.
 *
 * @return array{message: string, backup: ?string, moved: array<string, int>}
 */
function owner_change(int $from, int $to): array
{
    if ($to < 1 || $from < 1) {
        throw new RuntimeException('User ids are whole numbers from 1.');
    }
    if ($to === $from) {
        return ['message' => "Your data is user $to's already.", 'backup' => null, 'moved' => []];
    }
    if (!learner_has_data_of($from) && learner_has_data_of($to)) {
        // A restored backup brought it in under that id already: nothing to move.
        return ['message' => "Your data is user $to's already (and user $from has none).", 'backup' => null, 'moved' => []];
    }
    $backup = learner_has_data() ? backup_write('before-owner-change') : null;
    $moved = users_move($from, $to);
    $rows = array_filter($moved);
    $what = $rows
        ? implode(', ', array_map(static fn (string $table, int $n): string => "$n in $table", array_keys($rows), $rows))
        : 'there was none yet';
    return ['message' => "Your data (user $from) is now user $to's: $what.", 'backup' => $backup, 'moved' => $moved];
}
