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
// it never touches - doing again what was deleted since it was made, and only
// when this installation sealed it (anotoki-lib 0.5.0). A page's own error
// reaches the error log, scrubbed and capped; behind a trusted proxy the
// visitor's own address is counted (the error log's hash, the feedback's
// limits). While an update waits, the error log and the backups answer; a
// restore, the audit log, the feedback and the pages' errors do not.
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

/** The pages' own errors in a server's error log (its settings folder: $config), each line as written. */
function client_error_lines(?string $config = null): array
{
    $lines = [];
    foreach (glob(($config ?? $GLOBALS['app']['config']) . '/logs/errors-*.jsonl') ?: [] as $file) {
        foreach (preg_split('/\R/', (string) file_get_contents($file)) ?: [] as $line) {
            $entry = json_decode($line, true);
            if (is_array($entry) && ($entry['source'] ?? null) === 'client') {
                $lines[] = $entry;
            }
        }
    }
    return $lines;
}

/** The client hash ("client": a keyed hash of the address bucket) of the page's error that said $message. */
function client_hash_of(string $config, string $message): ?string
{
    foreach (client_error_lines($config) as $line) {
        if (($line['message'] ?? null) === $message) {
            return $line['client'] ?? null;
        }
    }
    return null;
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
    $reads = [
        'GET /api/admin/errors',
        'GET /api/admin/audit',
        'GET /api/admin/audit/facets',
        'GET /api/admin/feedback',
        'GET /api/admin/feedback/unread',
        'GET /api/admin/feedback/facets',
        'GET /api/admin/backups',
        'GET /api/admin/backups/proof',
        'GET /api/admin/people',
    ];
    // An ADMIN's token signed with a key of the same name that is not the IAM's (a forged one).
    $forger = Anotoki\Lib\Auth\Testing\TestIam::create(
        sys_get_temp_dir() . '/academy-test-forged-' . getmypid() . '-' . bin2hex(random_bytes(3)),
        'https://iam.test',
        'japanese-academy',
        'academy-test',
    );
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
    $writes = [
        ['POST', '/api/admin/backups', ['description' => 'mine']],
        ['DELETE', '/api/admin/errors', null],
        ['DELETE', '/api/admin/people/' . A_LEARNER, null],
        ['POST', '/api/admin/people/sync', null],
        ['PUT', '/api/admin/feedback/1/status', ['status' => 'spam']],
        ['DELETE', '/api/admin/feedback/1', null],
    ];
    foreach ($writes as [$method, $url, $body]) {
        foreach (
            ['a learner' => [test_bearer(test_token(A_LEARNER, ['MEMBER'])), 'staff_only'], 'an EDITOR' => [test_bearer(test_token(AN_EDITOR, ['EDITOR'])), 'admin_only']]
            as $name => [$headers, $code]
        ) {
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
    $paths = array_merge(...array_map(static fn(array $g): array => array_merge($g['paths'] ?? [], [$g['latest']['path'] ?? '']), $report['body']['groups'] ?? []));
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
    assert_same(
        [[AN_ADMIN, 'errors.cleared']],
        array_map(static fn(array $e): array => [(int) $e['actor_id'], $e['action']], db_all("SELECT actor_id, action FROM anotoki_audit_log WHERE action = 'errors.cleared'")),
    );
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

test(
    'feedback: the form takes a person\'s message - the address they send, none when they clear it, and neither id nor address without their name -, and while signing in is required nobody else\'s; nobody\'s while it is not; the honeypot keeps nothing; the badge counts the new ones',
    function (): void {
        $form = ['kind' => 'idea', 'section' => 'Kanji', 'message' => 'More N3 kanji, please.', 'page' => '/kanji?x=1#top', 'language' => 'sk', 'website' => ''];
        assert_same(
            [401, 'sign_in_required'],
            (static function () use ($form): array {
                $r = tools_call('POST', '/api/feedback', $form, no_token());
                return [$r['status'], $r['body']['code'] ?? null];
            })(),
            'nobody, while signing in is required',
        );
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

        assert_same(
            [
                [A_LEARNER, 'Kanji', null, '/kanji', 'sk', 'TestBrowser/1.0'],
                [A_LEARNER, null, 'learner@example.test', null, null, 'TestBrowser/1.0'],
                [null, null, null, null, null, 'TestBrowser/1.0'],
                [null, 'Exam', 'me@example.test', null, null, null],
            ],
            array_map(
                static fn(array $r): array => [
                    $r['user_id'] === null ? null : (int) $r['user_id'],
                    $r['section'],
                    $r['contact_email'],
                    $r['page'],
                    $r['language'],
                    $r['user_agent'] === null || str_contains((string) $r['user_agent'], 'TestBrowser') ? $r['user_agent'] : 'curl',
                ],
                db_all('SELECT user_id, section, contact_email, page, language, user_agent FROM anotoki_feedback ORDER BY id'),
            ),
            'four kept - the person\'s with the address they sent and none where they cleared it, the one without their name with neither -, nothing of the bot\'s',
        );
        assert_same(
            0,
            (int) db_value('SELECT count(*) FROM anotoki_feedback WHERE contact_email = ?', ['user' . A_LEARNER . '@example.test']),
            'their account\'s address, which their token carries, never put in by the server',
        );

        assert_same(['unread' => 4], tools_call('GET', '/api/admin/feedback/unread')['body'], 'the badge');
        $list = tools_call('GET', '/api/admin/feedback');
        $names = array_map(static fn(array $item): array => [$item['user_id'] ?? null, $item['user_name'] ?? null], $list['body']['items'] ?? []);
        assert_same(
            [4, [null, null], [null, null], [A_LEARNER, 'user' . A_LEARNER]],
            [$list['body']['total'] ?? null, $names[0] ?? null, $names[1] ?? null, $names[2] ?? null],
            'newest first, the person\'s under their name: ' . $list['raw'],
        );
        $id = (int) db_value('SELECT id FROM anotoki_feedback WHERE user_id = ? ORDER BY id LIMIT 1', [A_LEARNER]);
        // Opening one only reads it (anotoki-lib 0.8.1); the page marks a new one read by a PUT of its own.
        assert_same(200, tools_call('GET', "/api/admin/feedback/$id")['status']);
        assert_same(['unread' => 4], tools_call('GET', '/api/admin/feedback/unread')['body'], 'opened: still new - a GET marks nothing read');
        $marked = tools_call('PUT', "/api/admin/feedback/$id/read", new stdClass());
        assert_same([200, 'read'], [$marked['status'], $marked['body']['message']['status'] ?? null], 'marked read by its own write: ' . $marked['raw']);
        assert_same(['unread' => 3], tools_call('GET', '/api/admin/feedback/unread')['body'], 'one fewer to read');
        $resolved = tools_call('PUT', "/api/admin/feedback/$id/status", ['status' => 'resolved']);
        assert_same([200, 'resolved'], [$resolved['status'], $resolved['body']['message']['status'] ?? null], $resolved['raw']);
        $other = (int) db_value('SELECT id FROM anotoki_feedback WHERE user_id IS NULL ORDER BY id LIMIT 1');
        assert_same(200, tools_call('DELETE', "/api/admin/feedback/$other")['status']);
        assert_same(
            [['feedback.status_changed', (string) $id], ['feedback.deleted', (string) $other]],
            array_map(static fn(array $e): array => [$e['action'], $e['target_id']], db_all("SELECT action, target_id FROM anotoki_audit_log WHERE action LIKE 'feedback.%' ORDER BY id")),
            'recorded',
        );
        assert_same(['unread' => 2], tools_call('GET', '/api/admin/feedback/unread')['body']);
    },
);

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
    // Sealed by this installation (anotoki-lib 0.5.0: only a backup made here is restored here), its maker by name.
    assert_same(
        [[$id, true, true, 'user' . AN_ADMIN]],
        array_map(static fn(array $b): array => [$b['id'], $b['restorable'], $b['sealed'] ?? null, $b['created_by_name'] ?? null], $list['body']['backups'] ?? []),
        $list['raw'],
    );

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
    assert_same(
        [['k:山', 3]],
        array_map(static fn(array $r): array => [$r['item_id'], (int) $r['stage']], db_all('SELECT item_id, stage FROM srs_progress WHERE user_id = ? ORDER BY item_id', [A_LEARNER])),
        'as the backup had it',
    );
    // The IAM out of reach (no list of its deleted accounts here at all): the scrub after the restore did not finish, and
    // the restore says so - never one that looks complete -; the hour's stamp goes after the answer, so the next request runs it
    // (the library's People::afterRestore(), on this site's runner). Since anotoki-lib 0.6.0 the answer says it in the
    // library's fixed sentence, and why is the error log's (the Backups' onError): never a failure's own words in an answer.
    assert_same('What this site does after a restore did not all go through. The error log says what.', (string) ($restored['body']['after_restore_error'] ?? ''), $restored['raw']);
    assert_true(
        str_contains(error_log_text(), 'The accounts the IAM deleted were not checked again (the IAM could not be reached). Whoever it deleted since this backup was made may be named here'),
        'why, in the error log',
    );
    for ($i = 0; $i < 50 && is_file($stamp); $i++) {
        usleep(100000);
        clearstatcache(true, $stamp);
    }
    assert_false(is_file($stamp), 'the stamp gone after the answer: the next request scrubs again');
    touch($stamp); // as the other tests expect it: done for the hour
    assert_same(
        ['backup.created', 'backup.downloaded', 'backup.created', 'backup.restored'],
        array_column(db_all("SELECT action FROM anotoki_audit_log WHERE action LIKE 'backup.%' ORDER BY id"), 'action'),
        'every step recorded, the log kept through the restore',
    );
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
        assert_same([200, true, null], [$restored['status'], array_key_exists('after_restore_error', (array) $restored['body']), $restored['body']['after_restore_error'] ?? null], $restored['raw']);
        assert_same(
            ["deleted-$leaver", 1],
            [db_value('SELECT preferred_username FROM users WHERE id = ?', [$leaver]), (int) db_value('SELECT count(*) FROM users WHERE id = ? AND anonymized_at IS NOT NULL', [$leaver])],
            'the backup named them again, and the restore\'s own scrub blanked them before it answered',
        );
    } finally {
        test_anonymized(null);
    }
});

test(
    'a restore does again what was deleted since its backup - a person\'s data deleted on the People page, a feedback message -, inside it, on its own connection: it completes, and keeps no copy for that',
    function (): void {
        $leaver = 5104;
        $stayer = 5105;
        foreach ([[$leaver, 'k:山'], [$stayer, 'k:川']] as [$who, $item]) {
            users_ensure($who);
            db_exec('INSERT INTO srs_progress (user_id, item_id, stage) VALUES (?, ?, 4) ON CONFLICT DO NOTHING', [$who, $item]);
        }
        foreach ([[$leaver, 'Leaving soon.'], [$stayer, 'Delete this one, please.']] as [$who, $words]) {
            $sent = tools_call(
                'POST',
                '/api/feedback',
                ['kind' => 'idea', 'message' => $words, 'email' => "person-$who@example.test"],
                array_merge(test_bearer(test_token($who, ['MEMBER'])), ['User-Agent: ReplayBrowser/1.0']),
            );
            assert_same(201, $sent['status'], $sent['raw']);
        }
        $made = tools_call('POST', '/api/admin/backups', ['description' => 'before the deletes']);
        assert_same(201, $made['status'], $made['raw']);
        $id = (string) $made['body']['backup']['id'];

        // After the backup: the leaver's data deleted on the People page (a copy kept first), the stayer's message deleted.
        $deleted = tools_call('DELETE', "/api/admin/people/$leaver");
        assert_same([200, ['Kanji and words' => 1, 'Answers' => 0, 'Exam attempts' => 0]], [$deleted['status'], $deleted['body']['deleted'] ?? null], $deleted['raw']);
        $copies = glob(backup_dir() . "/academy-before-delete-user-$leaver-*.json") ?: [];
        assert_same(1, count($copies), 'the page\'s delete keeps a copy of what it deletes');
        $message = (int) db_value('SELECT id FROM anotoki_feedback WHERE user_id = ?', [$stayer]);
        assert_same(200, tools_call('DELETE', "/api/admin/feedback/$message")['status']);

        test_anonymized([]); // the IAM answers (nobody deleted): the scrub after the restore goes through
        try {
            $started = microtime(true);
            $restored = tools_call('POST', "/api/admin/backups/$id/restore", ['confirm' => substr($id, -6)]);
            $took = microtime(true) - $started;
        } finally {
            test_anonymized(null);
        }
        assert_same([200, null], [$restored['status'], $restored['body']['after_restore_error'] ?? null], $restored['raw']);
        // A delete hook on the site's own connection would wait on the restore's locks, and the restore be ended a minute later.
        assert_true($took < 30, sprintf('the restore went through at once (%.1f s), the deletes done again on its own connection', $took));

        assert_same(
            [0, 0],
            [(int) db_value('SELECT count(*) FROM users WHERE id = ?', [$leaver]), (int) db_value('SELECT count(*) FROM srs_progress WHERE user_id = ?', [$leaver])],
            'the leaver\'s data the backup held: deleted again before anybody saw it',
        );
        assert_same(
            [['k:川', 4]],
            array_map(static fn(array $r): array => [$r['item_id'], (int) $r['stage']], db_all('SELECT item_id, stage FROM srs_progress WHERE user_id = ?', [$stayer])),
            'everybody else\'s as the backup had it',
        );
        assert_same(0, (int) db_value('SELECT count(*) FROM anotoki_feedback WHERE id = ?', [$message]), 'the message deleted since: deleted again');
        assert_same(
            [['Leaving soon.', null, null]],
            array_map(
                static fn(array $f): array => [$f['message'], $f['contact_email'], $f['user_agent']],
                db_all('SELECT message, contact_email, user_agent FROM anotoki_feedback WHERE user_id = ?', [$leaver]),
            ),
            'the leaver\'s message keeps its words, but neither where to answer nor their browser - forgotten again with their data',
        );
        assert_same($copies, glob(backup_dir() . "/academy-before-delete-user-$leaver-*.json") ?: [], 'no copy for the restore\'s delete: what it deletes again is the backup\'s, which keeps it');
        assert_same(
            ['person.data_deleted', 'feedback.deleted', 'backup.restored'],
            array_column(
                db_all(
                    "SELECT action FROM anotoki_audit_log WHERE action IN ('person.data_deleted', 'feedback.deleted', 'backup.restored')
            AND id > (SELECT id FROM anotoki_audit_log WHERE action = 'backup.created' AND target_id = ?) ORDER BY id",
                    [$id],
                ),
                'action',
            ),
            'the deletes recorded once, the restore after them - doing them again writes no entry',
        );
        assert_same([], server_problems($GLOBALS['app']));
    },
);

test(
    'a backup without this installation\'s seal - every plain one made before anotoki-lib 0.5.0, a file put into the folder - is listed so, never restored here (offline alone), and can still be downloaded',
    function (): void {
        $made = tools_call('POST', '/api/admin/backups', ['description' => 'its seal taken away']);
        assert_same(201, $made['status'], $made['raw']);
        $id = (string) $made['body']['backup']['id'];
        $sidecar = backup_dir() . "/$id.anotoki-backup.json";
        $info = json_decode((string) file_get_contents($sidecar), true);
        assert_true(is_string($info['seal'] ?? null), 'a plain backup made here carries its seal');
        unset($info['seal']); // as a backup of before 0.5.0: no seal
        file_put_contents($sidecar, json_encode($info, JSON_UNESCAPED_SLASHES));

        $listed = array_column(tools_call('GET', '/api/admin/backups')['body']['backups'] ?? [], null, 'id');
        assert_same([false, false], [$listed[$id]['sealed'] ?? null, $listed[$id]['restorable'] ?? null], 'listed as not made here');
        $rows = (int) db_value('SELECT count(*) FROM srs_progress');
        $refused = tools_call('POST', "/api/admin/backups/$id/restore", ['confirm' => substr($id, -6)]);
        assert_same([422, 'archive_invalid'], [$refused['status'], $refused['body']['code'] ?? null], $refused['raw']);
        // The answer in the library's fixed sentence (anotoki-lib 0.6.0), which the page shows; why, in the error log.
        assert_match('/not made here - the error log says which\. One not made here is restored offline/', (string) ($refused['body']['error'] ?? ''), $refused['raw']);
        assert_true(
            str_contains(error_log_text(), 'It carries no seal of this site\'s - it was not made here, or it was changed since - so it is not restored here'),
            'why, in the library\'s words, in the error log',
        );
        assert_same($rows, (int) db_value('SELECT count(*) FROM srs_progress'), 'nothing restored');
        $ticket = tools_call('POST', "/api/admin/backups/$id/ticket", new stdClass());
        assert_same(200, $ticket['status'], 'downloaded for a restore offline: ' . $ticket['raw']);
        assert_same(200, test_page($GLOBALS['app']['base'], (string) $ticket['body']['url'])['status']);
        assert_same(200, tools_call('DELETE', "/api/admin/backups/$id", new stdClass())['status'], 'and deleted by the ADMIN');
    },
);

test('a restore of a database that ever had visitors goes through, and never gives a visitor\'s id again (anotoki-lib 0.5.1: visitor_ids counts down)', function (): void {
    // A visitor's row as src/visitors.php makes one: the next id of visitor_ids (-1, -2, …), a key's hash, a hash of the address.
    $visitor = static function (): int {
        return (int) db_value("INSERT INTO users (id, visitor_key_hash, visitor_from) VALUES (nextval('visitor_ids'), ?, ?) RETURNING id", [bin2hex(random_bytes(32)), bin2hex(random_bytes(32))]);
    };
    $before = $visitor();
    $made = tools_call('POST', '/api/admin/backups', ['description' => 'with a visitor']);
    assert_same(201, $made['status'], $made['raw']);
    $id = (string) $made['body']['backup']['id'];
    $since = $visitor(); // made after the backup: gone with the restore, its id never given again
    test_anonymized([]);
    try {
        $restored = tools_call('POST', "/api/admin/backups/$id/restore", ['confirm' => substr($id, -6)]);
    } finally {
        test_anonymized(null);
    }
    assert_same([200, null], [$restored['status'], $restored['body']['after_restore_error'] ?? null], 'the restore went through (0.5.0 set the sequence past its MAXVALUE): ' . $restored['raw']);
    assert_same(
        [1, 0],
        [(int) db_value('SELECT count(*) FROM users WHERE id = ?', [$before]), (int) db_value('SELECT count(*) FROM users WHERE id = ?', [$since])],
        'the backup\'s visitor back, the one made since gone',
    );
    $next = $visitor();
    assert_true($next < $since, "the next visitor's id is one never given ($next, after $since)");
    db_exec('DELETE FROM users WHERE id IN (?, ?)', [$before, $next]);
});

test('the pages\' own errors: a thrown error reaches the error log, scrubbed, as the person\'s or nobody\'s; 20 an hour from one sender, each budget its own', function (): void {
    $learner = test_bearer(test_token(A_LEARNER, ['MEMBER']));
    $thrown = [
        'type' => 'TypeError',
        'message' => 'Cannot read properties of undefined for someone@example.com from 203.0.113.5 with Bearer abc.def.ghi password=hunter2',
        'page' => '/kanji/item/k:大?token=secret-in-query#a-fragment',
        'stack' => ['TypeError: Cannot read properties of undefined', '    at KanjiItem.show (https://japanese.example/main-ABC.js:1:2345)'],
    ];
    $r = tools_call('POST', '/api/client-errors', $thrown, $learner);
    assert_same(204, $r['status'], $r['raw']);
    $lines = client_error_lines();
    assert_same(1, count($lines), 'one line, from the page');
    $line = $lines[0];
    assert_same(['client', 'TypeError', (string) A_LEARNER], [$line['source'] ?? null, $line['type'] ?? null, (string) ($line['user_id'] ?? '')], json_encode($line));
    assert_true(str_contains((string) $line['message'], 'Cannot read properties of undefined'), (string) $line['message']);
    assert_true(str_starts_with((string) ($line['path'] ?? ''), '/kanji/item/'), 'the page\'s path: ' . ($line['path'] ?? ''));
    foreach (['someone@example.com', '203.0.113.5', 'abc.def.ghi', 'hunter2', 'secret-in-query', 'a-fragment', '127.0.0.1'] as $never) {
        assert_false(str_contains(json_encode($line, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), $never), "never $never");
    }
    assert_same(
        [422, 'message_required'],
        (static function () use ($learner): array {
            $r = tools_call('POST', '/api/client-errors', ['type' => 'Error', 'message' => ' '], $learner);
            return [$r['status'], $r['body']['code'] ?? null];
        })(),
        'a report says what went wrong',
    );
    assert_same(413, tools_call('POST', '/api/client-errors', ['message' => str_repeat('x', 9000)], $learner)['status'], '8 KB at most');
    assert_same(
        [401, 'invalid_token'],
        (static function (): array {
            $r = tools_call('POST', '/api/client-errors', ['message' => 'with a bad token'], test_bearer('not.a.token'));
            return [$r['status'], $r['body']['code'] ?? null];
        })(),
        'a token that is no good: refused, as on every route',
    );

    // Nobody signed in is counted by their address bucket - this server trusts no proxy of this computer's: all are
    // 127.0.0.1 -, 20 an hour.
    for ($i = 1; $i <= 20; $i++) {
        $r = tools_call('POST', '/api/client-errors', ['message' => "a visitor's error $i"], no_token());
        assert_same(204, $r['status'], "report $i: {$r['raw']}");
    }
    $over = tools_call('POST', '/api/client-errors', ['message' => 'one too many'], no_token());
    assert_same([429, 'too_many'], [$over['status'], $over['body']['code'] ?? null], $over['raw']);
    assert_true((int) ($over['headers']['retry-after'] ?? 0) > 0, 'with its wait');
    assert_same(null, client_hash_of($GLOBALS['app']['config'], 'one too many'), 'not written');
    // The people signed in have budgets of their own: the visitors' reports never use them up.
    assert_same(204, tools_call('POST', '/api/client-errors', ['message' => 'still written'], $learner)['status']);
    assert_same(204, tools_call('POST', '/api/client-errors', ['message' => 'another person\'s'], test_bearer(test_token(AN_EDITOR, ['EDITOR'])))['status']);
    assert_same(23, count(client_error_lines()), 'each written once');
    assert_same([], server_problems($GLOBALS['app']));
});

test('behind the proxies the site trusts, the error log and the feedback count the visitor\'s own address - the proxy\'s header believed from them alone', function (): void {
    // This computer standing in for Cloudflare's edge (app.local.php's trusted_proxies): its CF-Connecting-IP is believed.
    $edge = start_app(['app' => ['client_address' => ['trusted_proxies' => ['127.0.0.1', '::1']]]]);
    $report = static function (array $server, string $message, string $address): int {
        return call($server['base'], 'POST', '/api/client-errors', ['message' => $message], array_merge(no_token(), ["CF-Connecting-IP: $address"]))['status'];
    };
    assert_same([204, 204, 204], [$report($edge, 'from A', '198.51.100.1'), $report($edge, 'from A again', '198.51.100.1'), $report($edge, 'from B', '2001:db8:1:2::1')]);
    $a = client_hash_of($edge['config'], 'from A');
    assert_match('/^[0-9a-f]{12}$/', (string) $a, 'a keyed hash of the address bucket, never the address');
    assert_same($a, client_hash_of($edge['config'], 'from A again'), 'one visitor, one hash');
    assert_false($a === client_hash_of($edge['config'], 'from B'), 'another visitor, another hash');
    for ($i = 3; $i <= 20; $i++) {
        assert_same(204, $report($edge, "from A, $i", '198.51.100.1'));
    }
    assert_same(429, $report($edge, 'from A, one too many', '198.51.100.1'), 'A\'s hour is up');
    assert_same(204, $report($edge, 'from B, again', '2001:db8:1:2::ffff'), 'B - the same /64 - is not A');
    // The headers Cloudflare passes on as the visitor wrote them are never believed from it: each of these counts as the
    // edge itself, whatever it names (the header is pinned in the code: Cloudflare's own).
    foreach (['X-Real-IP', 'True-Client-IP', 'X-Forwarded-For'] as $i => $header) {
        $sent = call($edge['base'], 'POST', '/api/client-errors', ['message' => "by $header"], array_merge(no_token(), ["$header: 198.51.100.6$i"]));
        assert_same(204, $sent['status'], "$header: {$sent['raw']}");
    }
    $own = client_hash_of($edge['config'], 'by X-Real-IP');
    assert_same([$own, $own], [client_hash_of($edge['config'], 'by True-Client-IP'), client_hash_of($edge['config'], 'by X-Forwarded-For')], 'one bucket for all three: the edge\'s own');
    assert_false(in_array($own, [$a, client_hash_of($edge['config'], 'from B')], true), 'nobody else\'s');

    // The feedback form's limits (5 an hour from one sender) the same way - while visitors may write it.
    test_access(false);
    try {
        $feedback = static function (string $address) use ($edge): int {
            return call($edge['base'], 'POST', '/api/feedback', ['kind' => 'idea', 'message' => "From $address."], array_merge(no_token(), ["CF-Connecting-IP: $address"]))['status'];
        };
        for ($i = 1; $i <= 5; $i++) {
            assert_same(201, $feedback('198.51.100.7'), "message $i");
        }
        assert_same([429, 201], [$feedback('198.51.100.7'), $feedback('198.51.100.8')], 'one visitor\'s hour up, never another\'s');
    } finally {
        test_access(true);
    }

    // With no app.local.php of its own, a server trusts Cloudflare's ranges alone, and this computer is none of them: the
    // header counts for nothing - anybody could send one.
    $plain = start_app();
    assert_same([204, 204], [$report($plain, 'by its header C', '198.51.100.31'), $report($plain, 'by its header D', '198.51.100.32')]);
    assert_same(client_hash_of($plain['config'], 'by its header C'), client_hash_of($plain['config'], 'by its header D'), 'both 127.0.0.1');
    assert_same([], server_problems($edge));
    assert_same([], server_problems($plain));
});

test(
    'how many backups are kept is the library\'s rotation by number - 14 daily, 5 before an update, 5 before a restore -, the ADMIN\'s own until the owner deletes them, none for its age (the owner\'s decision of 2026-10-11)',
    function (): void {
        $retention = (new ReflectionProperty(Anotoki\Lib\Backups\Backups::class, 'retention'))->getValue(academy_backups());
        assert_same(['daily' => 14, 'before-migration' => 5, 'before-restore' => 5], $retention, 'the library\'s counts, as every anotoki site and the IAM keep them');
    },
);

test('the day\'s backup: after the first page load of the day, beside this site\'s own; once', function (): void {
    @unlink($GLOBALS['app']['config'] . '/cache/anotoki-backup-daily.json');
    $before = library_backups();
    $r = call($GLOBALS['app']['base'], 'GET', '/api/kanji/summary', null, test_bearer(test_token(A_LEARNER, ['MEMBER'])));
    assert_same(200, $r['status'], $r['raw']);
    for ($i = 0; $i < 100 && count(library_backups()) === count($before); $i++) {
        usleep(100000);
    }
    $daily = array_values(array_filter(array_diff(library_backups(), $before), static fn(string $f): bool => str_contains($f, '-daily-')));
    assert_same(1, count($daily), 'one daily backup, after the answer: ' . json_encode(library_backups()));
    call($GLOBALS['app']['base'], 'GET', '/api/kanji/summary', null, test_bearer(test_token(A_LEARNER, ['MEMBER'])));
    usleep(500000);
    assert_same(1, count(array_filter(library_backups(), static fn(string $f): bool => str_contains($f, '-daily-'))), 'and no second one that day');
});

test('while an update waits, the error log and the backups answer the ADMIN; a restore, the audit log, the feedback, the pages\' own errors and the People page do not', function (): void {
    db_exec("DELETE FROM migrations WHERE name = 'anotoki_people/001_people.sql'");
    try {
        $pending = ['code' => 'update_pending', 'message' => 'The site is being updated. Try again in a few minutes.'];
        assert_same(200, tools_call('GET', '/api/admin/errors')['status']);
        $list = tools_call('GET', '/api/admin/backups');
        assert_same(200, $list['status'], $list['raw']);
        $id = (string) ($list['body']['backups'][0]['id'] ?? '');
        assert_same(200, tools_call('GET', "/api/admin/backups/$id")['status']);
        foreach (
            ['POST /api/admin/backups/' . $id . '/restore', 'GET /api/admin/audit', 'GET /api/admin/feedback/unread', 'POST /api/feedback', 'POST /api/client-errors', 'GET /api/admin/people']
            as $route
        ) {
            [$method, $url] = explode(' ', $route);
            $r = tools_call($method, $url, $method === 'POST' ? ['confirm' => substr($id, -6), 'kind' => 'idea', 'message' => 'x'] : null);
            assert_same([503, $pending], [$r['status'], $r['body']], $route);
        }
        // Still the ADMIN's alone.
        assert_same(
            [403, 'admin_only'],
            (static function (): array {
                $r = tools_call('GET', '/api/admin/errors', null, test_bearer(test_token(AN_EDITOR, ['EDITOR'])));
                return [$r['status'], $r['body']['code'] ?? null];
            })(),
        );
    } finally {
        db_exec("INSERT INTO migrations (name) VALUES ('anotoki_people/001_people.sql')");
    }
    assert_same(200, tools_call('GET', '/api/admin/audit')['status'], 'and back once it is applied');
});
