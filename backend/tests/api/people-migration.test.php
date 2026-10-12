<?php
// Migration 010 and the anotoki library's people, on a database as its owner
// left it: built up to 009 and the library's words of the round before
// (anotoki_translations 001 and 002) - an installed site of the release before -
// with people's study data, exam papers with a name on them, a visitor, and the
// owner's rewording of the words of a sign-in that failed. The check at 010's
// end fails it, changing nothing, when a row or a string did not come through
// as it was; the upload (the library's admin tools, 010, the library's words
// and people) keeps every row and string, moves the reworded words under the
// library's keys and lets the library's own say the rest. Then the scrub of the
// accounts the IAM deleted (src/people.php): the person's name the IAM's
// placeholder, the name typed on their exam papers gone - from the attempt and
// from its report -, their feedback's address and browser and their names in
// the audit log too, and nothing else of theirs, nothing of anybody else's,
// never a visitor's; again and again, the same.
declare(strict_types=1);

use Anotoki\Lib\Auth\Person;

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and backup folder

const MIGRATION_010 = '010_people_and_signing_in.sql';

/** The owner: user 1, as 002 made every row of before theirs. */
const THE_OWNER = 1;
/** Somebody whose account the IAM deletes, and somebody who stays. */
const LEAVER = 9001;
const STAYER = 9002;
/** When the IAM deleted LEAVER's account, as its list says it. */
const LEAVER_GONE_AT = '2026-11-06T10:00:00Z';

/** Every row of every table of people and their data, as JSON, in a stable order - users without what 010 adds. */
function people_rows(): array
{
    $order = ['users' => 'id', 'srs_settings' => 'user_id', 'srs_progress' => 'user_id, item_id', 'srs_daily' => 'user_id, day',
        'srs_log' => 'id', 'exam_attempts' => 'user_id, id', 'imports' => 'user_id, source'];
    $out = [];
    foreach ($order as $table => $by) {
        $out[$table] = array_column(db_all("SELECT (to_jsonb(t) - 'anonymized_at')::text AS r FROM $table t ORDER BY $by"), 'r');
    }
    return $out;
}

/** Every string of the database: [key][language] => [text, who wrote it, when]. */
function every_string_now(): array
{
    $words = [];
    foreach (db_all('SELECT key_name, language_code, value, updated_by, updated_at::text AS at FROM translations ORDER BY key_name COLLATE "C", language_code') as $row) {
        $words[$row['key_name']][$row['language_code']] = [$row['value'], $row['updated_by'] === null ? null : (int) $row['updated_by'], $row['at']];
    }
    return $words;
}

/** The header of an exam report, as report_render() writes it for a paper with this name (or without one). */
function report_header(string $name, string $seed): string
{
    return "<!doctype html>\n<html lang=\"en\">\n<body>\n<div class=\"wrap\">\n  <header>\n    <h1>Japanese Academy — Exam report</h1>\n    <div class=\"sub\">"
        . report_esc($name === '' ? 'Unnamed candidate' : $name) . " ·\n      1 Oct 2026, 10:00 ·\n      paper <code>$seed</code></div>\n  </header>\n</div>\n</body>\n</html>\n";
}

/** An exam attempt of $user's with this name on the paper, as the app stores one (exam_save_attempt()): the attempt, its report. */
function named_attempt(int $user, string $id, string $name): void
{
    $attempt = ['id' => $id, 'finishedAt' => '2026-10-01T08:00:00.000Z', 'exam' => ['seed' => "seed-$id"], 'meta' => ['candidate' => $name, 'mode' => 'mock'],
        'summary' => ['total' => 5, 'right' => 4, 'pct' => 80.5, 'grade' => 'B', 'passed' => true], 'breakdown' => new stdClass()];
    exam_save_attempt($user, $attempt, report_header($name, "seed-$id"));
}

/** This person's study rows - every table of theirs but the exam papers -, as JSON. */
function study_rows(int $id): array
{
    $rows = [];
    foreach (array_diff(USER_TABLES, ['exam_attempts']) as $table) {
        $rows[$table] = array_column(db_all("SELECT to_jsonb(t)::text AS r FROM $table t WHERE user_id = ? ORDER BY to_jsonb(t)::text", [$id]), 'r');
    }
    return $rows;
}

/** The rows the scrub may touch, as they are now: users, exam papers, feedback, the audit log. */
function scrub_rows(): array
{
    return [db_all('SELECT * FROM users ORDER BY id'), db_all('SELECT * FROM exam_attempts ORDER BY user_id, id'),
        db_all('SELECT * FROM anotoki_feedback ORDER BY id'), db_all('SELECT * FROM anotoki_audit_log ORDER BY id')];
}

// Once for the file: its tests go on from each other - the check before the upload, the upload, the scrub, the page.
before(function (): void {
    test_db_empty();
    db_migrations_table();
    // Up to 009 and the library's words 001 and 002: this upload's files taken for applied, then off the list again.
    $upload = array_merge(library_migrations('anotoki_admin'), [MIGRATION_010], array_slice(library_migrations(), 2), library_migrations('anotoki_people'));
    foreach ($upload as $name) {
        db_exec('INSERT INTO migrations (name) VALUES (?)', [$name]);
    }
    db_migrate();
    foreach ($upload as $name) {
        db_exec('DELETE FROM migrations WHERE name = ?', [$name]);
    }
    $GLOBALS['upload'] = $upload;

    // People, their study and their exam papers - one with a name typed on it -, and a visitor.
    users_ensure(LEAVER);
    users_ensure(STAYER);
    db_exec("UPDATE users SET preferred_username = 'lea', time_zone = 'Europe/Bratislava' WHERE id = ?", [LEAVER]);
    db_exec("UPDATE users SET preferred_username = 'stan' WHERE id = ?", [STAYER]);
    db_exec("INSERT INTO srs_progress (user_id, item_id, stage, meaning_note) VALUES (?, 'k:大', 4, 'arms spread'), (?, 'k:学', 1, '')", [LEAVER, STAYER]);
    db_exec("INSERT INTO srs_log (user_id, at, kind, item_id) VALUES (?, now(), 'lesson', 'k:大'), (?, now(), 'lesson', 'k:学')", [LEAVER, STAYER]);
    named_attempt(LEAVER, 'a-1', 'Lea <Verne>');
    named_attempt(LEAVER, 'a-2', '');
    named_attempt(STAYER, 'a-1', 'Stan');
    db_exec("INSERT INTO users (id, visitor_key_hash) VALUES (nextval('visitor_ids'), ?)", [str_repeat('a', 64)]);

    // The owner's rewordings of a sign-in that failed: Slovak of one of its words, and a language of their own for another.
    users_ensure(THE_OWNER);
    db_exec("UPDATE translations SET value = 'Nevyšlo to ({code}).', updated_by = ?, updated_at = '2026-10-08 09:00:00+00' WHERE key_name = 'signIn.failed' AND language_code = 'sk'", [THE_OWNER]);
    db_exec("INSERT INTO languages (code, name, native_name, enabled, sort_order) VALUES ('de', 'German', 'Deutsch', true, 3)");
    db_exec("INSERT INTO translations (key_name, language_code, value, updated_by, updated_at) VALUES ('signIn.notCompleted', 'de', 'Nicht angemeldet.', ?, '2026-10-08 09:01:00+00')", [THE_OWNER]);
});

test('the check at 010\'s end fails it by name when a row or a reworded string did not come through as it was - and then nothing of it stays', function (): void {
    $rows = people_rows();
    $strings = every_string_now();
    $sql = (string) file_get_contents(MIGRATIONS_DIR . '/' . MIGRATION_010);
    $at = strrpos($sql, 'DO $$');
    foreach ([
        // somebody's study row gone on the way
        ['DELETE FROM srs_log WHERE user_id = ' . STAYER, '/010_people_and_signing_in: tables whose rows changed: srs_log \(2 -> 1\)/'],
        // the owner's Slovak word changed under the library's key
        ["UPDATE translations SET value = 'Nevyšlo.' WHERE key_name = 'anotoki.signIn.failed' AND language_code = 'sk'",
            "/010_people_and_signing_in: strings that did not come under the library's keys as they were: anotoki\\.signIn\\.failed \\(sk\\)/"],
        // a string of a key that stays, changed
        ["UPDATE translations SET value = 'Again!' WHERE key_name = 'common.tryAgain' AND language_code = 'en'", '/010_people_and_signing_in: strings that are not as they were: common\.tryAgain \(en\)/'],
        // a language the app's key did not have, under the library's key
        ["INSERT INTO translations (key_name, language_code, value) VALUES ('anotoki.signIn.notCompleted', 'fr', 'Non.')",
            "/strings under the library's keys the app's keys did not have: anotoki\\.signIn\\.notCompleted \\(fr\\)/"],
        // somebody's account marked deleted by a migration: only the scrub does that
        ['UPDATE users SET anonymized_at = now() WHERE id = ' . LEAVER, '/users\.anonymized_at is filled in for somebody/'],
    ] as [$tamper, $message]) {
        db()->beginTransaction();
        try {
            db()->exec(substr($sql, 0, $at));
            if (str_contains($tamper, "'fr'")) {
                db_exec("INSERT INTO languages (code, name, native_name, enabled, sort_order) VALUES ('fr', 'French', 'Français', true, 4)");
            }
            db()->exec($tamper);
            assert_throws(static fn () => db()->exec(substr($sql, $at)), $message);
        } finally {
            db()->rollBack();
        }
    }
    assert_same([$rows, $strings], [people_rows(), every_string_now()], 'every row and every string as it was');
    assert_same(null, db_value("SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'anonymized_at'"), 'no column');
    assert_same(null, db_value('SELECT name FROM migrations WHERE name = ?', [MIGRATION_010]), 'not applied');
});

test('the upload: the library\'s admin tools, 010, the library\'s words and people; every row as it was, the reworded words under the library\'s keys as they were, the library\'s own for the rest', function (): void {
    $rows = people_rows();
    $before = every_string_now();
    $upload = db_migrate();
    assert_same($GLOBALS['upload'], $upload, 'the library\'s admin tools first, then 010, then the library\'s words and people');
    assert_same([], db_pending_migrations(), 'nothing waits');
    assert_same($rows, people_rows(), 'every row of people and their data as it was');
    assert_same([['timestamp with time zone', 'YES']], array_map('array_values', db_all("SELECT data_type, is_nullable FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'anonymized_at'")), 'users.anonymized_at, as the library reads it');
    assert_same(0, (int) db_value('SELECT count(*) FROM users WHERE anonymized_at IS NOT NULL'), 'empty: only the scrub fills it');
    assert_true((bool) db_value("SELECT to_regclass('anotoki_people_sync') IS NOT NULL AND to_regclass('anotoki_people_anonymized') IS NOT NULL
        AND to_regclass('anotoki_audit_log') IS NOT NULL AND to_regclass('anotoki_feedback') IS NOT NULL"), 'the library\'s tables');

    $after = every_string_now();
    // Reworded in some language: every language moved, its text, who wrote it and when.
    assert_same($before['signIn.failed'], $after['anotoki.signIn.failed'] ?? null, 'signIn.failed (the owner\'s Slovak) under the library\'s key, every language as it was');
    assert_same($before['signIn.notCompleted'], $after['anotoki.signIn.notCompleted'] ?? null, 'signIn.notCompleted (the owner\'s German) the same');
    assert_same(['de', 'en', 'sk'], array_keys($after['anotoki.signIn.notCompleted']));
    // Never reworded: the library's own words, by nobody.
    assert_same(['Signing you in…', null], array_slice($after['anotoki.signIn.signingIn']['en'], 0, 2), 'signIn.signingIn as seeded: the library\'s words');
    assert_same(['Prihlasujeme ťa…', null], array_slice($after['anotoki.signIn.signingIn']['sk'], 0, 2));
    foreach (['signIn.notCompleted', 'signIn.failed', 'signIn.signingIn'] as $gone) {
        assert_false(isset($after[$gone]), "$gone: gone, its strings with it");
        assert_same(null, db_value('SELECT name FROM translation_keys WHERE name = ?', [$gone]));
    }
    // Every other string of the app's as it was.
    $own = static fn (array $words): array => array_filter($words, static fn (string $key): bool => !str_starts_with($key, 'anotoki.')
        && !in_array($key, ['signIn.notCompleted', 'signIn.failed', 'signIn.signingIn'], true), ARRAY_FILTER_USE_KEY);
    assert_same($own($before), $own($after), 'every other string as it was');
    assert_same(count(Anotoki\Lib\Translations\LibraryWords::keys()), count(array_filter(array_keys($after), static fn (string $key): bool => str_starts_with($key, 'anotoki.'))),
        'every word of the library, with a string');
    assert_same([], academy_translations()->storedRefusals(), 'and nothing stored that a save would refuse');
});

test('the scrub of the accounts the IAM deleted: the name the IAM\'s placeholder, the names on their exam papers gone, nothing else changed - nobody else\'s, never a visitor\'s', function (): void {
    db_migrate();
    // What the person left with the admin tools: a feedback message with an address for an answer; entries about them and by them in the audit log.
    db_exec("INSERT INTO anotoki_feedback (kind, message, contact_email, user_id, user_agent) VALUES ('idea', 'More kanji, please.', 'lea@example.test', ?, 'Firefox')", [LEAVER]);
    db_exec("INSERT INTO anotoki_feedback (kind, message, contact_email, user_id, user_agent) VALUES ('bug', 'A typo.', 'stan@example.test', ?, 'Edge')", [STAYER]);
    db_exec("INSERT INTO anotoki_audit_log (actor_id, action, target_type, target_id, details, ip)
             VALUES (?, 'person.data_deleted', 'user', ?, '{\"username\": \"lea\", \"deleted\": {\"Answers\": 1}}', '203.0.113.9'),
                    (?, 'translations.saved', NULL, NULL, '{\"keys\": 1}', '198.51.100.7'),
                    (?, 'translations.saved', NULL, NULL, '{\"keys\": 2}', '198.51.100.8')", [THE_OWNER, LEAVER, LEAVER, STAYER]);
    $before = scrub_rows();
    $study = study_rows(LEAVER);
    $attempt = json_decode((string) db_value('SELECT attempt FROM exam_attempts WHERE user_id = ? AND id = ?', [LEAVER, 'a-1']), true);

    test_anonymized([LEAVER => LEAVER_GONE_AT, 9999 => LEAVER_GONE_AT]);
    $run = academy_people()->scrubber()->run();
    assert_same(['state' => 'done', 'handled' => 2, 'scrubbed' => 1, 'error' => null], array_intersect_key($run, array_flip(['state', 'handled', 'scrubbed', 'error'])),
        'two ids listed, one of them somebody of this site\'s');

    // Their row: the IAM's placeholder, the IAM's time; the rest of it as it was.
    assert_same(['deleted-' . LEAVER, '2026-11-06 10:00:00+00', 'Europe/Bratislava'],
        array_values(db_one("SELECT preferred_username, to_char(anonymized_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') || '+00' AS at, time_zone FROM users WHERE id = ?", [LEAVER])));
    // Their exam papers: no name in the column, the attempt or the report - and nothing else changed in them.
    assert_same(['', ''], array_column(db_all('SELECT candidate FROM exam_attempts WHERE user_id = ? ORDER BY id', [LEAVER]), 'candidate'));
    $scrubbed = json_decode((string) db_value('SELECT attempt FROM exam_attempts WHERE user_id = ? AND id = ?', [LEAVER, 'a-1']), true);
    unset($attempt['meta']['candidate']);
    assert_same($attempt, $scrubbed, 'the attempt as it was, less the name');
    assert_same(['mode' => 'mock'], $scrubbed['meta']);
    assert_same([report_header('', 'seed-a-1'), report_header('', 'seed-a-2')], array_column(db_all('SELECT report FROM exam_attempts WHERE user_id = ? ORDER BY id', [LEAVER]), 'report'),
        'each report says "Unnamed candidate", as a paper without a name always did');
    // Their study stays, nobody's now.
    assert_same($study, study_rows(LEAVER), 'their progress, their answers, their settings as they were');
    // Their feedback: no address, no browser; the message stays.
    assert_same([null, null, 'More kanji, please.'], array_values(db_one('SELECT contact_email, user_agent, message FROM anotoki_feedback WHERE user_id = ?', [LEAVER])));
    // The audit log: no name in what is said about them, no address on what they did; the owner's own address stays on the owner's entry.
    $log = db_all('SELECT actor_id, ip, details::text AS details FROM anotoki_audit_log ORDER BY id');
    assert_same([[THE_OWNER, '203.0.113.9', ['deleted' => ['Answers' => 1]]], [LEAVER, null, ['keys' => 1]], [STAYER, '198.51.100.8', ['keys' => 2]]],
        array_map(static fn (array $r): array => [(int) $r['actor_id'], $r['ip'], json_decode((string) $r['details'], true)], $log));
    // Nobody else's, never a visitor's.
    $others = static function (array $rows): array {
        [$users, $papers, $feedback] = $rows;
        $theirs = static fn (array $row): bool => (int) ($row['id'] ?? 0) !== LEAVER;
        $notLeaver = static fn (array $row): bool => (int) $row['user_id'] !== LEAVER;
        return [array_values(array_filter($users, $theirs)), array_values(array_filter($papers, $notLeaver)), array_values(array_filter($feedback, $notLeaver))];
    };
    assert_same($others($before), $others(scrub_rows()), 'every other row as it was, the visitor\'s among them');
    // The library's own record: every id listed, whether the site knew the person or not.
    assert_same([[LEAVER, true], [9999, false]], array_map(static fn (array $r): array => [(int) $r['sub'], in_array($r['had_row'], [true, 't', 1, '1'], true)],
        db_all('SELECT sub, had_row FROM anotoki_people_anonymized ORDER BY sub')));

    // Again: the same ids, nothing more to change.
    $scrubbedRows = scrub_rows();
    $again = academy_people()->scrubber()->run();
    assert_same(['done', 0], [$again['state'], $again['scrubbed']], 'nothing left to scrub');
    assert_same($scrubbedRows, scrub_rows(), 'and nothing changed');

    // A token of the deleted account (the IAM issues none by then; still): their row is never written again.
    people_seen(Person::fromClaims(['sub' => (string) LEAVER, 'preferred_username' => 'lea', 'roles' => []]), 'Asia/Tokyo');
    assert_same(['deleted-' . LEAVER, 'Europe/Bratislava'], array_values(db_one('SELECT preferred_username, time_zone FROM users WHERE id = ?', [LEAVER])));
    // An IAM that cannot be reached: the run says so, and changes nothing.
    test_anonymized(null);
    $down = academy_people()->scrubber()->run();
    assert_same(['unreachable', 0, 'The IAM could not be reached.'], [$down['state'], $down['scrubbed'], $down['error']]);
    assert_same($scrubbedRows, scrub_rows());
});

test('the scrub\'s hook writes only on the connection it is given: with every table it touches locked there - as a restore\'s connection holds them -, it goes through, never on the site\'s own', function (): void {
    db_migrate();
    $who = 9004;
    users_ensure($who);
    named_attempt($who, 'h-1', 'Hana Named');
    db_exec("INSERT INTO anotoki_feedback (kind, message, contact_email, user_id, user_agent) VALUES ('idea', 'Locked out.', 'hana@example.test', ?, 'Safari')", [$who]);
    db_exec("INSERT INTO anotoki_audit_log (actor_id, action, target_type, target_id, details, ip) VALUES (?, 'translations.saved', NULL, NULL, '{\"keys\": 3}', '198.51.100.44')", [$who]);

    // Another connection, holding the tables as a restore does until it commits; the site's own (db()) gives up after 3 s.
    $other = db_connect();
    $other->beginTransaction();
    $other->exec('LOCK TABLE users, exam_attempts, anotoki_feedback, anotoki_audit_log IN ACCESS EXCLUSIVE MODE');
    db()->exec("SET lock_timeout = '3s'");
    try {
        people_scrub_copies($other, $who);
        $other->commit();
    } finally {
        if ($other->inTransaction()) {
            $other->rollBack();
        }
        db()->exec('RESET lock_timeout');
    }
    assert_same(['', report_header('', 'seed-h-1')], array_values(db_one('SELECT candidate, report FROM exam_attempts WHERE user_id = ? AND id = ?', [$who, 'h-1'])),
        'the name gone from the paper and its report');
    assert_same([null, null, 'Locked out.'], array_values(db_one('SELECT contact_email, user_agent, message FROM anotoki_feedback WHERE user_id = ?', [$who])),
        'their feedback\'s address and browser gone, on that connection');
    assert_same(null, db_value("SELECT ip FROM anotoki_audit_log WHERE actor_id = ? AND action = 'translations.saved'", [$who]), 'and their address in the audit log');
});

test('the People page: Check now runs the scrub - an IAM out of reach said so -, recorded in the audit log; the accounts the IAM deleted listed under its placeholder; an ADMIN\'s alone', function (): void {
    // (The tests of a file share its database: LEAVER was scrubbed by the test before. Another account goes now.)
    $nora = 9003;
    $noraGoneAt = '2026-11-07T08:30:00Z';
    users_ensure($nora);
    db_exec("UPDATE users SET preferred_username = 'nora' WHERE id = ?", [$nora]);
    db_exec("INSERT INTO srs_progress (user_id, item_id, stage) VALUES (?, 'k:学', 2)", [$nora]);
    $app = start_app();
    $admin = test_bearer(test_token(4801, ['ADMIN']));

    test_anonymized(null);
    $down = call($app['base'], 'POST', '/api/admin/people/sync', null, $admin);
    assert_same([200, 'unreachable', 'The IAM could not be reached.'], [$down['status'], $down['body']['run']['state'] ?? null, $down['body']['sync']['error'] ?? null], $down['raw']);

    test_anonymized([LEAVER => LEAVER_GONE_AT, $nora => $noraGoneAt]);
    $sync = call($app['base'], 'POST', '/api/admin/people/sync', null, $admin);
    assert_same([200, 'done', 2, 1], [$sync['status'], $sync['body']['run']['state'] ?? null, $sync['body']['run']['handled'] ?? null, $sync['body']['run']['scrubbed'] ?? null], $sync['raw']);
    assert_true(array_key_exists('error', $sync['body']['sync'] ?? []) && $sync['body']['sync']['error'] === null, 'a good run clears the error');
    assert_same($noraGoneAt, $sync['body']['sync']['since'] ?? null, 'and the scrub stands at the newest it handled');
    assert_same([[4801, 'unreachable'], [4801, 'done']], array_map(static fn (array $e): array => [(int) $e['actor_id'], json_decode((string) $e['details'], true)['state']],
        db_all("SELECT actor_id, details::text AS details FROM anotoki_audit_log WHERE action = 'people.synced' ORDER BY id")), 'each run audited');

    $page = call($app['base'], 'GET', '/api/admin/people', null, $admin);
    assert_same(200, $page['status'], $page['raw']);
    $people = array_column($page['body']['people'], null, 'sub');
    $row = static fn (array $p): array => [$p['name'] ?? null, $p['anonymized_at'] ?? null, $p['time_zone'] ?? null, $p['learned'] ?? null, $p['attempts'] ?? null];
    assert_same(['deleted-' . LEAVER, LEAVER_GONE_AT, 'Europe/Bratislava', 1, 2], $row($people[(string) LEAVER] ?? []), 'their data stays, nobody\'s now');
    assert_same(['deleted-' . $nora, $noraGoneAt, null, 1, 0], $row($people[(string) $nora] ?? []));
    assert_same(['stan', null], array_slice($row($people[(string) STAYER] ?? []), 0, 2), 'and nobody else is touched');

    foreach (['EDITOR' => [403, 'admin_only'], 'MEMBER' => [403, 'staff_only']] as $role => $refused) {
        $r = call($app['base'], 'POST', '/api/admin/people/sync', null, test_bearer(test_token(4802, [$role])));
        assert_same($refused, [$r['status'], $r['body']['code'] ?? null], "$role: {$r['raw']}");
    }
    $r = call($app['base'], 'POST', '/api/admin/people/sync', null, no_token());
    assert_same([401, 'sign_in_required'], [$r['status'], $r['body']['code'] ?? null], $r['raw']);
    assert_same(2, (int) db_value("SELECT count(*) FROM anotoki_audit_log WHERE action = 'people.synced'"), 'a refused one runs nothing');
    assert_same([], server_problems($app));
});
