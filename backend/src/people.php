<?php
/**
 * The people whose data this site holds - the anotoki library's people module
 * (Anotoki\Lib\People, the Composer package anotoki/lib - every anotoki
 * site's, since anotoki-lib 0.4.0), set up here for this site's `users`
 * table: the record of each person from their token, the scrub of the
 * accounts the IAM deleted, and the administrators' People page
 * (GET /api/admin/people…, api/routes/people.php; the page is the library's).
 *
 * The table stays this site's (src/users.php): every study table refers to
 * it, the visitors' rows (negative ids) are in it, and an answer holds its
 * person's row (users_hold()). The library reads and writes it through a
 * mapping - the name of the person's token in preferred_username, created_at
 * when they came first, last_seen_at when they were last here - and the one
 * column it adds, anonymized_at (migration 010): when the IAM deleted the
 * account. A visitor's row is never the library's to read or write.
 *
 *   people_seen()     a request of a person: their row made or kept up to
 *                     date (the library's PeopleRecorder: the name kept to
 *                     the token's, last seen at most every five minutes) with
 *                     their time zone, this site's own column
 *   the scrub         every hour, after an answer, the library asks the IAM
 *                     which accounts it deleted, thirty days after their owner
 *                     asked (GET {issuer}/api/public/anonymized-accounts), and
 *                     blanks this site's copies of who each was: their name
 *                     becomes the IAM's placeholder deleted-<id>, and the hook
 *                     here blanks the rest (people_scrub_copies(): the name
 *                     typed on an exam paper, the address and the browser of
 *                     their feedback, their names and addresses in the audit
 *                     log). Their study data stays, nobody's now: only UPDATEs
 *   the People page   everybody signed in once, the latest seen first, with
 *                     their time zone, how much they learned and their exam
 *                     attempts; how many visitors there are; deleting a
 *                     person's data (people_delete()) - for ADMIN alone
 *
 * Deleting takes a copy of all of that person's data first
 * (academy-before-delete-user-<id>-…, their last 14 kept), then deletes their
 * rows in every table of USER_TABLES and their users row, in one transaction
 * that holds that row FOR UPDATE: a request of theirs still on its way waits,
 * then finds no row and starts their data afresh (users_hold()), instead of
 * failing. The strings they reworded stay, with nobody as who saved them
 * (translations.updated_by empties by its foreign key). Their account is the
 * IAM's: they may still sign in, and start again with nothing. The library
 * records every delete in the audit log (person.data_deleted).
 */

declare(strict_types=1);

use Anotoki\Lib\Admin\Schema as AdminSchema;
use Anotoki\Lib\Auth\Person;
use Anotoki\Lib\People\People;
use Anotoki\Lib\People\PeopleColumn;
use Anotoki\Lib\People\PeopleTable;

/** What a stored exam report says for a candidate who gave no name, or whose account the IAM deleted (src/report.php). */
const PEOPLE_UNNAMED_CANDIDATE = 'Unnamed candidate';

/**
 * This site's people, for the library (one per process): its table and its
 * columns, its connection, its IAM, and the hook the scrub calls for the
 * copies of who somebody was kept elsewhere (people_scrub_copies()).
 */
function academy_people(): People
{
    static $people = null;
    if ($people === null) {
        $people = new People(
            new PeopleTable('users', 'preferred_username', 'created_at', 'last_seen_at'),
            static function (): PDO {
                return db();
            },
            academy_iam(),
            [
                static function (PDO $pdo, int $sub, ?array $former): void {
                    people_scrub_copies($pdo, $sub);
                },
            ]
        );
    }
    return $people;
}

/**
 * A request of this person: their row, made the first time, with the name
 * from their token and when they were last here, and the time zone their
 * request names ($zone, already checked: time_zone_known()) - the library's
 * PeopleRecorder, which writes it at most every five minutes, or when the
 * name or the zone changed, so studying doesn't write it on every answer, and
 * never writes the row of an account the IAM deleted.
 *
 * Returns the person's time zone for this request: $zone when the request
 * named one, else the one kept on their row, else null (they never sent one:
 * the caller then takes UTC). Until migration 005 is in there is no column
 * for it (users_time_zone_ready()): $zone still counts for the request, and
 * nothing is kept.
 */
function people_seen(Person $person, ?string $zone): ?string
{
    $kept = users_time_zone_ready();
    academy_people()->recorder()->seen(db(), $person, $kept ? ['time_zone' => $zone] : []);
    if ($zone !== null || !$kept) {
        return $zone;
    }
    // A request that named no zone (a tool, a browser that would not say): the one they last brought.
    return time_zone_known(db_value('SELECT time_zone FROM users WHERE id = ?', [$person->sub]));
}

/**
 * The People page's own columns, beside the name, the IAM id and when they
 * were first and last here: their time zone, the items they have learned,
 * their exam attempts - for one page of people at a time.
 *
 * @return list<PeopleColumn>
 */
function people_columns(): array
{
    return [
        new PeopleColumn('time_zone', 'Time zone', 'text', static function (PDO $pdo, array $subs): array {
            if (!users_time_zone_ready()) {
                return [];
            }
            return people_values('SELECT id, time_zone FROM users WHERE id IN (SELECT json_array_elements_text(?::json)::bigint)', $subs);
        }),
        new PeopleColumn('learned', 'Learned', 'count', static function (PDO $pdo, array $subs): array {
            return people_values('SELECT user_id, count(*) FROM srs_progress WHERE stage > 0 AND user_id IN (SELECT json_array_elements_text(?::json)::bigint) GROUP BY user_id', $subs, 0);
        }),
        new PeopleColumn('attempts', 'Exam', 'count', static function (PDO $pdo, array $subs): array {
            return people_values('SELECT user_id, count(*) FROM exam_attempts WHERE user_id IN (SELECT json_array_elements_text(?::json)::bigint) GROUP BY user_id', $subs, 0);
        }),
    ];
}

/**
 * A column's values for these people: [id => value], from a query of two
 * columns over the ids (a JSON list); somebody the query has no row of gets
 * $none (a count's 0), or no value at all.
 *
 * @param mixed $none
 */
function people_values(string $sql, array $subs, $none = null): array
{
    $values = $none === null ? [] : array_fill_keys(array_map('intval', $subs), $none);
    foreach (db_query($sql, [json_text(array_values($subs))])->fetchAll(PDO::FETCH_NUM) as [$id, $value]) {
        $values[(int) $id] = $value;
    }
    return $values;
}

/**
 * The People page's line about the visitors (somebody studying without
 * signing in, src/visitors.php), who are never on its list: how many the site
 * keeps now, the longest unseen, and the limits - null while the database
 * cannot keep them (migration 007).
 */
function people_visitors(): ?array
{
    $visitors = visitors_count();
    if (!$visitors['ready']) {
        return null;
    }
    return [
        'count' => $visitors['count'],
        'oldest_seen_at' => $visitors['oldestSeenAt'] === null ? null : iso_time((int) $visitors['oldestSeenAt']),
        'keep_days' => $visitors['keepDays'],
        'max' => $visitors['max'],
    ];
}

/**
 * Deletes all of this person's data, after a copy of it: the People page's
 * Delete (the library's delete hook). Returns what went, by the page's labels,
 * with the copy's file named in a note - or null when the site has nobody of
 * that id. Their feedback keeps its words, but no longer the address to answer
 * them at nor their browser (the library's Feedback::forgetPeople(), as the
 * scrub of a deleted account does), in the same transaction.
 */
function people_delete(int $id): ?array
{
    return db_tx(static function () use ($id): ?array {
        if (!users_lock($id)) {
            return null;
        }
        $copy = backup_person_copy('before-delete', $id);
        $gone = [];
        foreach (USER_TABLES as $table) {
            $gone[$table] = db_exec("DELETE FROM $table WHERE user_id = ?", [$id]);
        }
        db_exec('DELETE FROM users WHERE id = ?', [$id]);
        // The library's Feedback works on db() too: the same transaction.
        if (AdminSchema::has(db(), AdminSchema::FEEDBACK_TABLE)) {
            academy_feedback()->forgetPeople([$id]);
        }
        return [
            'deleted' => ['Kanji and words' => $gone['srs_progress'], 'Answers' => $gone['srs_log'], 'Exam attempts' => $gone['exam_attempts']],
            'note' => 'A copy of their data is in backups/' . basename($copy) . '.',
        ];
    });
}

/**
 * The scrub's hook (academy_people()): the copies of who the person whose
 * account the IAM deleted ($sub) was, kept beside their row - blanked, in the
 * scrub's transaction for that account, on its connection. Everything else of
 * theirs stays, nobody's now. Done again for an id that comes again: nothing
 * left to change, nothing changes.
 *
 *   - an exam paper's name ("Your name (for the report)", typed by the
 *     person): exam_attempts.candidate empty, the attempt's meta.candidate
 *     gone, and its stored report says "Unnamed candidate" where it said the
 *     name - as a report of a paper without a name always did;
 *   - their feedback: the address they gave for an answer and their browser
 *     (the library's Feedback::forgetPeople(); the message stays);
 *   - the audit log: no address on their entries, and their names gone from
 *     the details of the entries about them (AuditLog::scrubPeople()).
 */
function people_scrub_copies(PDO $pdo, int $sub): void
{
    // (No jsonb ? operator: PDO would read its ? as a parameter.)
    $rows = $pdo->prepare("SELECT id, candidate, attempt::text AS attempt, report FROM exam_attempts
                            WHERE user_id = ? AND (candidate <> '' OR (attempt::jsonb -> 'meta' -> 'candidate') IS NOT NULL)");
    $rows->execute([$sub]);
    $update = $pdo->prepare('UPDATE exam_attempts SET candidate = \'\', attempt = ?::json, report = ? WHERE user_id = ? AND id = ?');
    foreach ($rows->fetchAll(PDO::FETCH_ASSOC) as $row) {
        // Read as objects, so an empty {} stays an object: the record is written back as it was, less the name.
        $attempt = json_decode((string) $row['attempt'], false, 512, JSON_THROW_ON_ERROR);
        $named = is_object($attempt) && isset($attempt->meta) && is_object($attempt->meta) && property_exists($attempt->meta, 'candidate');
        $name = $named ? $attempt->meta->candidate : $row['candidate'];
        if ($named) {
            unset($attempt->meta->candidate);
        }
        $update->execute([json_text($attempt), people_unnamed_report($row['report'], $name), $sub, $row['id']]);
    }

    if (AdminSchema::has($pdo, AdminSchema::FEEDBACK_TABLE)) {
        academy_feedback()->forgetPeople([$sub]);
    }
    if (AdminSchema::has($pdo, AdminSchema::AUDIT_TABLE)) {
        academy_audit()->scrubPeople([$sub]);
    }
}

/**
 * A stored report with the candidate's name ($name, as the paper had it) taken
 * out of its header: "Unnamed candidate" there, as a report of a paper without
 * a name says (report_html(), src/report.php). A report without that header
 * stays as it is.
 *
 * @param mixed $name
 */
function people_unnamed_report(?string $report, $name): ?string
{
    if ($report === null || !js_truthy($name)) {
        return $report;
    }
    $header = '<div class="sub">' . report_esc($name) . ' ·';
    $at = strpos($report, $header);
    return $at === false ? $report : substr_replace($report, '<div class="sub">' . PEOPLE_UNNAMED_CANDIDATE . ' ·', $at, strlen($header));
}
