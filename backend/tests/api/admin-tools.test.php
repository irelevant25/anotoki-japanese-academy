<?php
// The admin tools this site takes from the anotoki library (src/admin.php,
// api/routes/admin.php), on the real server: the error log, the audit log, the
// feedback - with the visitors' form -, the backups, and the People page. Each
// is the site's ADMIN's alone: nobody is asked to sign in, a learner and an
// EDITOR are refused in this site's words, and nothing they asked for happens.
// Then what each does here: the error log writes a 404 down without its query
// string; the audit log keeps who changed the words; a message from the form
// is a person's, or nobody's while signing in is not required, and its badge
// counts it; a backup asks for a fresh sign-in, is downloaded once by its
// ticket, and restored in place - beside this site's own JSON copies, which
// it never touches. While an update waits, the error log and the backups
// answer; a restore, the audit log and the feedback do not.
declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and backup folder

const AN_ADMIN = 5101;
const AN_EDITOR = 5102;
const A_LEARNER = 5103;

/** A request of the site's ADMIN, signed in now - or $extra's way (an auth_time of an hour ago). */
function as_admin(array $extra = []): array
{
    return test_bearer(test_token(AN_ADMIN, ['ADMIN'], $extra));
}

function tools_call(string $method, string $url, $body = null, ?array $headers = null): array
{
    return call($GLOBALS['app']['base'], $method, $url, $body, $headers ?? as_admin());
}

/** Every file of the error log, as one text. */
function error_log_text(): string
{
    return implode("\n", array_map('file_get_contents', glob($GLOBALS['app']['config'] . '/logs/errors-*.jsonl') ?: []));
}

/** The library's backups in the folder, by name (this site's own JSON copies aside). */
function library_backups(): array
{
    $files = array_map('basename', glob(backup_dir() . '/*.anotoki-backup') ?: []);
    sort($files);
    return $files;
}

before(function (): void {
    test_db();
    db_migrate();
    test_access(true); // the IAM: signing in is required here
    // One of this site's own JSON copies, as src/backup.php writes them: the library's backups never touch it.
    if (!is_dir(backup_dir())) {
        mkdir(backup_dir(), 0700, true);
    }
    file_put_contents(backup_dir() . '/academy-daily-2026-10-01.json', '{"version":1,"people":[]}');
    $GLOBALS['app'] = start_app();
});

test('every tool is the site\'s ADMIN\'s alone: nobody is asked to sign in, a learner and an EDITOR are refused in this site\'s words', function (): void {
    $reads = ['GET /api/admin/errors', 'GET /api/admin/audit', 'GET /api/admin/audit/facets', 'GET /api/admin/feedback', 'GET /api/admin/feedback/unread',
        'GET /api/admin/feedback/facets', 'GET /api/admin/backups', 'GET /api/admin/backups/proof', 'GET /api/admin/people'];
    // An ADMIN's token signed with a key of the same name that is not the IAM's (a forged one).
    $forger = Anotoki\Lib\Auth\Testing\TestIam::create(sys_get_temp_dir() . '/academy-test-forged-' . getmypid() . '-' . bin2hex(random_bytes(3)),
        'https://iam.test', 'japanese-academy', 'academy-test');
    $iam = test_iam()['iam'];
    $who = [
        'nobody' => [no_token(), 401, 'sign_in_required'],
        'a visitor\'s key alone' => [array_merge(no_token(), ['X-Visitor-Key: ' . str_repeat('A', 43)]), 401, 'sign_in_required'],
        'a token that is no good' => [test_bearer('not.a.token'), 401, 'invalid_token'],
        'an ADMIN\'s token run out an hour ago' => [as_admin(['exp' => time() - 3600, 'iat' => time() - 4200, 'auth_time' => time() - 4200]), 401, 'invalid_token'],
        'an ADMIN\'s token for another app' => [as_admin(['aud' => 'anotoki-survey', 'client_id' => 'anotoki-survey']), 401, 'invalid_token'],
        'an ADMIN\'s ID token' => [test_bearer(test_token(AN_ADMIN, ['ADMIN'], [], 'JWT')), 401, 'invalid_token'],
        'an ADMIN\'s token naming a key the IAM has not' => [test_bearer($iam->sign($iam->claims(AN_ADMIN, ['ADMIN']), 'at+jwt', 'RS256', ['kid' => 'forged'])), 401, 'invalid_token'],
        'an ADMIN\'s token signed with another key of the IAM\'s key\'s name' => [test_bearer($forger->sign($forger->claims(AN_ADMIN, ['ADMIN']))), 401, 'invalid_token'],
        'a learner' => [test_bearer(test_token(A_LEARNER, ['MEMBER'])), 403, 'staff_only'],
        'an EDITOR' => [test_bearer(test_token(AN_EDITOR, ['EDITOR'])), 403, 'admin_only'],
    ];
    try {
        foreach ($reads as $route) {
            [$method, $url] = explode(' ', $route);
            foreach ($who as $name => [$headers, $status, $code]) {
                $r = tools_call($method, $url, null, $headers);
                assert_same([$status, $code], [$r['status'], $r['body']['code'] ?? null], "$route, $name: {$r['raw']}");
            }
            $r = tools_call($method, $url);
            assert_same(200, $r['status'], "$route, the ADMIN: {$r['raw']}");
        }
    } finally {
        test_remove_folder($forger->dir, '/academy-test-forged-');
    }

    // What they would change, unchanged: no backup made, the log not cleared, nobody's data deleted, no scrub run.
    test_page($GLOBALS['app']['base'], '/api/nothing-here');
    $log = error_log_text();
    assert_true($log !== '', 'a 404 is in the log');
    $writes = [['POST', '/api/admin/backups', ['description' => 'mine']], ['DELETE', '/api/admin/errors', null], ['DELETE', '/api/admin/people/' . A_LEARNER, null],
        ['POST', '/api/admin/people/sync', null], ['PUT', '/api/admin/feedback/1/status', ['status' => 'spam']], ['DELETE', '/api/admin/feedback/1', null]];
    foreach ($writes as [$method, $url, $body]) {
        foreach (['a learner' => [test_bearer(test_token(A_LEARNER, ['MEMBER'])), 'staff_only'], 'an EDITOR' => [test_bearer(test_token(AN_EDITOR, ['EDITOR'])), 'admin_only']] as $name => [$headers, $code]) {
            $r = tools_call($method, $url, $body, $headers);
            assert_same([403, $code], [$r['status'], $r['body']['code'] ?? null], "$method $url, $name: {$r['raw']}");
        }
    }
    assert_same([], library_backups(), 'no backup');
    assert_true(str_contains(error_log_text(), '/api/nothing-here'), 'the log as it was');
    assert_same(0, (int) db_value("SELECT count(*) FROM anotoki_audit_log WHERE action IN ('backup.created', 'errors.cleared', 'person.data_deleted', 'people.synced')"));
    assert_same([], server_problems($GLOBALS['app']));
});

test('the error log: a 404 written down without its query string - never a token -, read on the Errors page, cleared by the ADMIN (recorded)', function (): void {
    test_page($GLOBALS['app']['base'], '/api/no-such-thing?ticket=secret-ticket-123&code=abc', ['Authorization: Bearer secret.token.here']);
    $log = error_log_text();
    assert_true(str_contains($log, '/api/no-such-thing'), 'the path');
    foreach (['secret-ticket-123', 'code=abc', 'secret.token.here', '127.0.0.1'] as $never) {
        assert_false(str_contains($log, $never), "never $never");
    }
    $report = tools_call('GET', '/api/admin/errors?days=1&status=404');
    assert_same(200, $report['status'], $report['raw']);
    $paths = array_merge(...array_map(static fn (array $g): array => array_merge($g['paths'] ?? [], [$g['latest']['path'] ?? '']), $report['body']['groups'] ?? []));
    assert_true(in_array('/api/no-such-thing', $paths, true), 'the Errors page shows it: ' . json_encode($paths));
    assert_true(($report['body']['total'] ?? 0) >= 1);

    // A refusal is an answer, not a failure: a 401, a 403, a 422 is never written.
    $before = error_log_text();
    tools_call('GET', '/api/admin/audit', null, no_token());
    tools_call('GET', '/api/admin/audit', null, test_bearer(test_token(AN_EDITOR, ['EDITOR'])));
    assert_same($before, error_log_text(), 'nothing written for a refusal');

    $cleared = tools_call('DELETE', '/api/admin/errors');
    assert_same(200, $cleared['status'], $cleared['raw']);
    assert_same('', error_log_text(), 'cleared');
    assert_same([[AN_ADMIN, 'errors.cleared']], array_map(static fn (array $e): array => [(int) $e['actor_id'], $e['action']],
        db_all("SELECT actor_id, action FROM anotoki_audit_log WHERE action = 'errors.cleared'")));
});

test('the audit log: who changed the words, under their name, found by it; read-only', function (): void {
    $saved = tools_call('PUT', '/api/admin/translations', ['values' => ['common.tryAgain' => ['sk' => 'Skús to ešte raz']]], test_bearer(test_token(AN_EDITOR, ['EDITOR'])));
    assert_same(200, $saved['status'], $saved['raw']);
    $page = tools_call('GET', '/api/admin/audit?action=translations.');
    assert_same(200, $page['status'], $page['raw']);
    $entry = $page['body']['items'][0] ?? [];
    assert_same(['translations.saved', (string) AN_EDITOR, 'user' . AN_EDITOR], [$entry['action'] ?? null, (string) ($entry['actor_id'] ?? ''), $entry['actor_username'] ?? null]);
    $byName = tools_call('GET', '/api/admin/audit?actor=user' . AN_EDITOR);
    assert_same(['translations.saved'], array_values(array_unique(array_column($byName['body']['items'] ?? [], 'action'))), 'found by the name: ' . $byName['raw']);
    $facets = tools_call('GET', '/api/admin/audit/facets');
    assert_true(in_array('translations.saved', $facets['body']['actions'] ?? [], true), $facets['raw']);
    foreach (['POST', 'PUT', 'DELETE'] as $method) {
        assert_same(405, tools_call($method, '/api/admin/audit')['status'], "$method: nobody writes the log by hand");
    }
});

test('feedback: the form takes a person\'s message - the address they send, none when they clear it, and neither id nor address without their name -, and while signing in is required nobody else\'s; nobody\'s while it is not; the honeypot keeps nothing; the badge counts the new ones', function (): void {
    $form = ['kind' => 'idea', 'section' => 'Kanji', 'message' => 'More N3 kanji, please.', 'page' => '/kanji?x=1#top', 'language' => 'sk', 'website' => ''];
    assert_same([401, 'sign_in_required'], (static function () use ($form): array {
        $r = tools_call('POST', '/api/feedback', $form, no_token());
        return [$r['status'], $r['body']['code'] ?? null];
    })(), 'nobody, while signing in is required');
    $asLearner = array_merge(test_bearer(test_token(A_LEARNER, ['MEMBER'])), ['User-Agent: TestBrowser/1.0']);
    // The address field cleared (the page writes their account's in): no address kept - the server never adds one.
    $learner = tools_call('POST', '/api/feedback', $form, $asLearner);
    assert_same([201, ['ok' => true]], [$learner['status'], $learner['body']], $learner['raw']);
    // The address they send - their account's, as the page wrote it in, or any other - is the one for an answer.
    $answer = tools_call('POST', '/api/feedback', ['kind' => 'bug', 'message' => 'Please answer me.', 'email' => 'learner@example.test'], $asLearner);
    assert_same(201, $answer['status'], $answer['raw']);
    // "Send it without my name": neither their id nor an address, even one typed (the owner's decision of 2026-10-11: their choice).
    $unnamed = tools_call('POST', '/api/feedback', ['kind' => 'other', 'message' => 'No name, please.', 'anonymous' => true, 'email' => 'learner@example.test'], $asLearner);
    assert_same(201, $unnamed['status'], $unnamed['raw']);
    test_access(false);
    $nobody = tools_call('POST', '/api/feedback', ['kind' => 'bug', 'message' => 'A typo on the exam page.', 'section' => 'Exam', 'email' => 'me@example.test'], no_token());
    assert_same(201, $nobody['status'], 'nobody, while it is not: ' . $nobody['raw']);
    $bot = tools_call('POST', '/api/feedback', ['kind' => 'idea', 'message' => 'Buy now', 'website' => 'http://spam.example'], no_token());
    assert_same([201, ['ok' => true]], [$bot['status'], $bot['body']], 'the honeypot\'s answer, word for word');
    $refused = tools_call('POST', '/api/feedback', ['kind' => 'idea', 'message' => 'x', 'section' => 'piano'], no_token());
    assert_same([422, 'section_unknown'], [$refused['status'], $refused['body']['code'] ?? null], 'a place this site does not list');
    test_access(true);

    assert_same([
        [A_LEARNER, 'Kanji', null, '/kanji', 'sk', 'TestBrowser/1.0'],
        [A_LEARNER, null, 'learner@example.test', null, null, 'TestBrowser/1.0'],
        [null, null, null, null, null, 'TestBrowser/1.0'],
        [null, 'Exam', 'me@example.test', null, null, null],
    ], array_map(static fn (array $r): array => [$r['user_id'] === null ? null : (int) $r['user_id'], $r['section'], $r['contact_email'], $r['page'], $r['language'],
        $r['user_agent'] === null || str_contains((string) $r['user_agent'], 'TestBrowser') ? $r['user_agent'] : 'curl'],
        db_all('SELECT user_id, section, contact_email, page, language, user_agent FROM anotoki_feedback ORDER BY id')),
        'four kept - the person\'s with the address they sent and none where they cleared it, the one without their name with neither -, nothing of the bot\'s');
    assert_same(0, (int) db_value('SELECT count(*) FROM anotoki_feedback WHERE contact_email = ?', ['user' . A_LEARNER . '@example.test']),
        'their account\'s address, which their token carries, never put in by the server');

    assert_same(['unread' => 4], tools_call('GET', '/api/admin/feedback/unread')['body'], 'the badge');
    $list = tools_call('GET', '/api/admin/feedback');
    $names = array_map(static fn (array $item): array => [$item['user_id'] ?? null, $item['user_name'] ?? null], $list['body']['items'] ?? []);
    assert_same([4, [null, null], [null, null], [A_LEARNER, 'user' . A_LEARNER]], [$list['body']['total'] ?? null, $names[0] ?? null, $names[1] ?? null, $names[2] ?? null],
        'newest first, the person\'s under their name: ' . $list['raw']);
    $id = (int) db_value('SELECT id FROM anotoki_feedback WHERE user_id = ? ORDER BY id LIMIT 1', [A_LEARNER]);
    assert_same(200, tools_call('GET', "/api/admin/feedback/$id")['status']);
    assert_same(['unread' => 3], tools_call('GET', '/api/admin/feedback/unread')['body'], 'opened: read');
    $resolved = tools_call('PUT', "/api/admin/feedback/$id/status", ['status' => 'resolved']);
    assert_same([200, 'resolved'], [$resolved['status'], $resolved['body']['message']['status'] ?? null], $resolved['raw']);
    $other = (int) db_value('SELECT id FROM anotoki_feedback WHERE user_id IS NULL ORDER BY id LIMIT 1');
    assert_same(200, tools_call('DELETE', "/api/admin/feedback/$other")['status']);
    assert_same([['feedback.status_changed', (string) $id], ['feedback.deleted', (string) $other]], array_map(static fn (array $e): array => [$e['action'], $e['target_id']],
        db_all("SELECT action, target_id FROM anotoki_audit_log WHERE action LIKE 'feedback.%' ORDER BY id")), 'recorded');
    assert_same(['unread' => 2], tools_call('GET', '/api/admin/feedback/unread')['body']);
});

test('backups: made by the ADMIN after a fresh sign-in, downloaded once by a ticket, restored in place - beside this site\'s own JSON copies, which stay', function (): void {
    $stale = tools_call('POST', '/api/admin/backups', ['description' => 'too late'], as_admin(['auth_time' => time() - 3600]));
    assert_same([403, 'reauth_required'], [$stale['status'], $stale['body']['code'] ?? null], 'a sign-in of an hour ago: ' . $stale['raw']);
    assert_same(['kind' => 'recent_sign_in'], tools_call('GET', '/api/admin/backups/proof')['body'], 'what the page asks for');
    assert_same([], library_backups());

    users_ensure(A_LEARNER);
    db_exec("INSERT INTO srs_progress (user_id, item_id, stage) VALUES (?, 'k:山', 3)", [A_LEARNER]);
    $made = tools_call('POST', '/api/admin/backups', ['description' => 'before the test']);
    assert_same(201, $made['status'], $made['raw']);
    $id = (string) ($made['body']['backup']['id'] ?? '');
    assert_match('/^\d{8}-\d{6}Z-manual-[0-9a-f]{32}$/', $id);
    assert_same([$id . '.anotoki-backup'], library_backups(), 'in the site\'s backup folder');
    assert_true(is_file(backup_dir() . '/academy-daily-2026-10-01.json'), 'this site\'s own copy beside it');
    $list = tools_call('GET', '/api/admin/backups');
    assert_same([[$id, true]], array_map(static fn (array $b): array => [$b['id'], $b['restorable']], $list['body']['backups'] ?? []), $list['raw']);

    // The download: a ticket, used once, by a navigation that sends no token.
    $ticket = tools_call('POST', "/api/admin/backups/$id/ticket", new stdClass());
    assert_same(200, $ticket['status'], $ticket['raw']);
    $url = (string) $ticket['body']['url'];
    assert_match('~^/api/admin/backups/' . preg_quote($id, '~') . '/file\?ticket=~', $url);
    $file = test_page($GLOBALS['app']['base'], $url);
    assert_same(200, $file['status']);
    assert_same(filesize(backup_dir() . "/$id.anotoki-backup"), strlen($file['raw']), 'the whole archive');
    $again = call($GLOBALS['app']['base'], 'GET', $url, null, no_token());
    assert_same([403, 'ticket_invalid'], [$again['status'], $again['body']['code'] ?? null], 'once');

    // The restore: what changed since is gone, the audit log keeps its entries, and a copy of before stays.
    db_exec("INSERT INTO srs_progress (user_id, item_id, stage) VALUES (?, 'k:川', 1)", [A_LEARNER]);
    db_exec("UPDATE srs_progress SET stage = 7 WHERE user_id = ? AND item_id = 'k:山'", [A_LEARNER]);
    $wrong = tools_call('POST', "/api/admin/backups/$id/restore", ['confirm' => 'nope00']);
    assert_same([422, 'confirm_mismatch'], [$wrong['status'], $wrong['body']['code'] ?? null]);
    $stamp = $GLOBALS['app']['config'] . '/cache/' . Anotoki\Lib\People\Http\PeopleUpkeep::STAMP;
    assert_true(is_file($stamp), 'the scrub ran this hour (a test server\'s stamp)');
    $restored = tools_call('POST', "/api/admin/backups/$id/restore", ['confirm' => substr($id, -6)]);
    assert_same(200, $restored['status'], $restored['raw']);
    assert_same([['k:山', 3]], array_map(static fn (array $r): array => [$r['item_id'], (int) $r['stage']],
        db_all('SELECT item_id, stage FROM srs_progress WHERE user_id = ? ORDER BY item_id', [A_LEARNER])), 'as the backup had it');
    // The IAM out of reach (no list of its deleted accounts here at all): the scrub after the restore did not finish, and
    // the restore says so - never one that looks complete -; the hour's stamp goes after the answer, so the next request runs it.
    assert_match('/^the accounts the IAM deleted were not checked again \(.+\)\. Whoever it deleted since this backup was made may be named here/',
        (string) ($restored['body']['after_restore_error'] ?? ''), $restored['raw']);
    for ($i = 0; $i < 50 && is_file($stamp); $i++) {
        usleep(100000);
        clearstatcache(true, $stamp);
    }
    assert_false(is_file($stamp), 'the stamp gone after the answer: the next request scrubs again');
    touch($stamp); // as the other tests expect it: done for the hour
    assert_same(['backup.created', 'backup.downloaded', 'backup.created', 'backup.restored'], array_column(db_all("SELECT action FROM anotoki_audit_log WHERE action LIKE 'backup.%' ORDER BY id"), 'action'),
        'every step recorded, the log kept through the restore');
    assert_same(2, count(library_backups()), 'and the copy of what was there before the restore');
    assert_true(is_file(backup_dir() . '/academy-daily-2026-10-01.json'), 'this site\'s own copy, untouched');
    assert_same([], server_problems($GLOBALS['app']));
});

test('a restore runs the scrub of the IAM\'s deleted accounts at once: whoever it deleted since the backup was made is blanked again before the answer', function (): void {
    $leaver = 5199;
    db_exec("INSERT INTO users (id, preferred_username) VALUES (?, 'leaver-name') ON CONFLICT (id) DO UPDATE SET preferred_username = EXCLUDED.preferred_username, anonymized_at = NULL", [$leaver]);
    $made = tools_call('POST', '/api/admin/backups', ['description' => 'with the leaver named']);
    assert_same(201, $made['status'], $made['raw']);
    $id = (string) $made['body']['backup']['id'];
    test_anonymized([$leaver => gmdate('Y-m-d\TH:i:s\Z')]); // the IAM deletes the account after the backup
    try {
        $sync = tools_call('POST', '/api/admin/people/sync', new stdClass());
        assert_same([200, 'done'], [$sync['status'], $sync['body']['run']['state'] ?? null], $sync['raw']);
        assert_same("deleted-$leaver", db_value('SELECT preferred_username FROM users WHERE id = ?', [$leaver]), 'blanked by the scrub');

        $restored = tools_call('POST', "/api/admin/backups/$id/restore", ['confirm' => substr($id, -6)]);
        assert_same([200, true, null], [$restored['status'], array_key_exists('after_restore_error', (array) $restored['body']), $restored['body']['after_restore_error'] ?? null],
            $restored['raw']);
        assert_same(["deleted-$leaver", 1], [db_value('SELECT preferred_username FROM users WHERE id = ?', [$leaver]),
            (int) db_value('SELECT count(*) FROM users WHERE id = ? AND anonymized_at IS NOT NULL', [$leaver])],
            'the backup named them again, and the restore\'s own scrub blanked them before it answered');
    } finally {
        test_anonymized(null);
    }
});

test('how many backups are kept is the library\'s rotation by number - 14 daily, 5 before an update, 5 before a restore -, the ADMIN\'s own until the owner deletes them, none for its age (the owner\'s decision of 2026-10-11)', function (): void {
    $retention = (new ReflectionProperty(Anotoki\Lib\Backups\Backups::class, 'retention'))->getValue(academy_backups());
    assert_same(['daily' => 14, 'before-migration' => 5, 'before-restore' => 5], $retention, 'the library\'s counts, as every anotoki site and the IAM keep them');
});

test('the day\'s backup: after the first page load of the day, beside this site\'s own; once', function (): void {
    @unlink($GLOBALS['app']['config'] . '/cache/anotoki-backup-daily.json');
    $before = library_backups();
    $r = call($GLOBALS['app']['base'], 'GET', '/api/kanji/summary', null, test_bearer(test_token(A_LEARNER, ['MEMBER'])));
    assert_same(200, $r['status'], $r['raw']);
    for ($i = 0; $i < 100 && count(library_backups()) === count($before); $i++) {
        usleep(100000);
    }
    $daily = array_values(array_filter(array_diff(library_backups(), $before), static fn (string $f): bool => str_contains($f, '-daily-')));
    assert_same(1, count($daily), 'one daily backup, after the answer: ' . json_encode(library_backups()));
    call($GLOBALS['app']['base'], 'GET', '/api/kanji/summary', null, test_bearer(test_token(A_LEARNER, ['MEMBER'])));
    usleep(500000);
    assert_same(1, count(array_filter(library_backups(), static fn (string $f): bool => str_contains($f, '-daily-'))), 'and no second one that day');
});

test('while an update waits, the error log and the backups answer the ADMIN; a restore, the audit log, the feedback and the People page do not', function (): void {
    db_exec("DELETE FROM migrations WHERE name = 'anotoki_people/001_people.sql'");
    try {
        $pending = ['code' => 'update_pending', 'message' => 'The site is being updated. Try again in a few minutes.'];
        assert_same(200, tools_call('GET', '/api/admin/errors')['status']);
        $list = tools_call('GET', '/api/admin/backups');
        assert_same(200, $list['status'], $list['raw']);
        $id = (string) ($list['body']['backups'][0]['id'] ?? '');
        assert_same(200, tools_call('GET', "/api/admin/backups/$id")['status']);
        foreach (['POST /api/admin/backups/' . $id . '/restore', 'GET /api/admin/audit', 'GET /api/admin/feedback/unread', 'POST /api/feedback', 'GET /api/admin/people'] as $route) {
            [$method, $url] = explode(' ', $route);
            $r = tools_call($method, $url, $method === 'POST' ? ['confirm' => substr($id, -6), 'kind' => 'idea', 'message' => 'x'] : null);
            assert_same([503, $pending], [$r['status'], $r['body']], $route);
        }
        // Still the ADMIN's alone.
        assert_same([403, 'admin_only'], (static function (): array {
            $r = tools_call('GET', '/api/admin/errors', null, test_bearer(test_token(AN_EDITOR, ['EDITOR'])));
            return [$r['status'], $r['body']['code'] ?? null];
        })());
    } finally {
        db_exec("INSERT INTO migrations (name) VALUES ('anotoki_people/001_people.sql')");
    }
    assert_same(200, tools_call('GET', '/api/admin/audit')['status'], 'and back once it is applied');
});
