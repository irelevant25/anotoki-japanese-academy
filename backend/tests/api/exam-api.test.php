<?php
// The exam API end to end: the real server, with its own throwaway database.
declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and backup folder

$GLOBALS['app'] = null;
before(function (): void {
    $GLOBALS['app'] = start_app();
});

function api(string $method, string $url, $body = null): array
{
    return call($GLOBALS['app']['base'], $method, $url, $body);
}

test('meta', function (): void {
    $body = api('GET', '/api/meta')['body'];
    assert_same(2, count($body['books']));
    assert_same(24, count($body['lessons']));
    assert_same(0, $body['attempts'], 'isolated: none of your real attempts');
});

test('a paper never carries its answers', function (): void {
    $body = api('POST', '/api/exam', ['size' => 120, 'books' => [1, 2], 'seed' => 'leak'])['body'];
    $keys = [];
    $walk = static function ($o) use (&$walk, &$keys): void {
        if (is_array($o)) {
            foreach ($o as $k => $v) {
                $keys[(string) $k] = true;
                $walk($v);
            }
        }
    };
    $walk($body);
    foreach (['answerIndex', 'correct', 'distractors', 'explain'] as $k) {
        assert_false(isset($keys[$k]), $k);
    }
});

test('scoring: perfect, zero, and the 70% boundary', function (): void {
    $ex = api('POST', '/api/exam', ['size' => 200, 'books' => [1, 2], 'seed' => 'score'])['body'];
    $key = exam_paper(exam_normalize_spec($ex['spec'])); // the server rebuilds exactly this
    assert_same(array_column($ex['questions'], 'id'), array_column($key['questions'], 'id'));

    $answer = static function (callable $pick) use ($key): array {
        $out = [];
        foreach ($key['questions'] as $i => $q) {
            $out[$q['id']] = ['choice' => $pick($q, $i), 'ms' => 500];
        }
        return $out;
    };
    $r = api('POST', '/api/submit', ['spec' => $ex['spec'], 'responses' => $answer(static fn (array $q): int => $q['answerIndex'])]);
    assert_same(100, $r['body']['summary']['pct']);
    assert_same('A', $r['body']['summary']['grade']);
    assert_same(2, count($r['body']['byBook']));

    $r = api('POST', '/api/submit', ['spec' => $ex['spec'], 'responses' => $answer(static fn (array $q): int => ($q['answerIndex'] + 1) % count($q['options']))]);
    assert_same(0, $r['body']['summary']['pct']);
    assert_same(false, $r['body']['summary']['passed']);

    $need = (int) ceil(count($key['questions']) * 0.7);
    $r = api('POST', '/api/submit', ['spec' => $ex['spec'], 'responses' => $answer(static fn (array $q, int $i): int => $i < $need ? $q['answerIndex'] : ($q['answerIndex'] + 1) % count($q['options']))]);
    assert_true($r['body']['summary']['passed'] && $r['body']['summary']['pct'] >= 70);
});

test('answers for another paper are refused, not mis-scored', function (): void {
    $ex = api('POST', '/api/exam', ['size' => 40, 'seed' => 'mine'])['body'];
    $responses = array_fill_keys(array_column($ex['questions'], 'id'), ['choice' => 0]);
    $r = api('POST', '/api/submit', ['spec' => ['seed' => 'someone-else'] + $ex['spec'], 'responses' => $responses]);
    assert_same(409, $r['status']);
    assert_same(3, (int) db_value('SELECT count(*) FROM exam_attempts'), 'nothing saved');
});

test('report and history', function (): void {
    $ex = api('POST', '/api/exam', ['size' => 40, 'seed' => 'report'])['body'];
    $sub = api('POST', '/api/submit', ['spec' => $ex['spec'], 'responses' => new stdClass()])['body'];
    $rep = api('GET', $sub['reportUrl']);
    assert_same(200, $rep['status']);
    assert_match('/By skill/', $rep['raw']);
    assert_no_match('/undefined|\[object Object\]|NaN/', $rep['raw']);
    $hist = api('GET', '/api/attempts')['body'];
    assert_true(count($hist) >= 4);
    assert_same($sub['id'], $hist[0]['id'], 'newest first');
    assert_same(400, api('GET', '/report/bad%20id')['status']);
    assert_same(404, api('GET', '/report/no-such-report')['status']);
});

test('clips stream from data/audio, and nothing else does', function (): void {
    $ex = api('POST', '/api/exam', ['size' => 40, 'sections' => ['listening-word'], 'seed' => 'audio'])['body'];
    $clip = array_values(array_filter(array_column($ex['questions'], 'audio')))[0];
    $r = api('GET', "/audio/$clip");
    assert_same(200, $r['status']);
    assert_same('audio/mpeg', $r['headers']['content-type']);
    assert_same(file_get_contents(AUDIO_CLIPS . "/$clip"), $r['raw']);
    $part = call($GLOBALS['app']['base'], 'GET', "/audio/$clip", null, ['Range: bytes=10-19']);
    assert_same(206, $part['status'], 'browsers ask for byte ranges');
    assert_same(substr(file_get_contents(AUDIO_CLIPS . "/$clip"), 10, 10), $part['raw']);
    assert_same(404, api('GET', '/audio/nope.mp3')['status']);
    assert_same(404, api('GET', '/audio/0123456789abcdef.mp3')['status'], 'a well-formed name with no file');
    assert_same(404, api('GET', '/audio/..%2Fvocab.json')['status'], 'no way out of data/audio');
    $head = call($GLOBALS['app']['base'], 'HEAD', "/audio/$clip");
    assert_same([200, '', (string) filesize(AUDIO_CLIPS . "/$clip")], [$head['status'], $head['raw'], $head['headers']['content-length'] ?? null], 'HEAD: the headers alone');
});

test('the pages are the built app’s: its files as they are, a page’s address its index.html, and nothing else', function (): void {
    foreach (['/', '/kanji', '/kanji/reviews', '/kanji/item/k%3A%E5%A4%A7', '/exam', '/auth/callback'] as $url) {
        $page = api('GET', $url);
        assert_same(200, $page['status'], $url);
        assert_match('/<title>Japanese Academy<\/title>/', $page['raw'], "$url: the app, whose own router draws the page");
        assert_same('no-cache', $page['headers']['cache-control'] ?? null, "$url: asked for again each time");
    }
    $js = api('GET', '/main-TESTAPP1.js');
    assert_same([200, 'text/javascript; charset=utf-8'], [$js['status'], $js['headers']['content-type'] ?? null]);
    assert_match('/immutable/', $js['headers']['cache-control'] ?? '', 'named with a hash of its content: kept');
    assert_same(200, api('GET', '/favicon.svg')['status']);
    assert_same(404, api('GET', '/nothing.js')['status'], 'an address with a file extension that is no file of the app');
    assert_same(404, api('GET', '/api/nothing')['status'], 'an unknown API address is a 404, not the app');
    assert_same('not_found', api('GET', '/api/nothing')['body']['code'] ?? null);
    assert_same(200, api('GET', '/api/meta/')['status'], 'a trailing slash is the same address');
    // nothing of the backend, and nothing of Apache's, is ever sent
    foreach (['/server.php', '/backend/server.php', '/backend/config/config.php', '/src/config.local.php', '/index.php', '/.htaccess', '/../data/vocab.json'] as $url) {
        assert_same(404, api('GET', $url)['status'], $url);
    }
    assert_same([], server_problems($GLOBALS['app']), 'no PHP warnings or errors on the server');
});

test('without a built app, the pages say how to build it; the API answers all the same', function (): void {
    $bare = start_app(['frontend' => sys_get_temp_dir() . '/academy-test-no-such-build']);
    $page = call($bare['base'], 'GET', '/kanji');
    assert_same(503, $page['status']);
    assert_match('/npm run build:frontend/', $page['raw']);
    assert_same(200, call($bare['base'], 'GET', '/api/kanji/summary')['status']);
});

test('without sign-in the browser is told so, and no token is needed', function (): void {
    assert_same(['mode' => 'none'], api('GET', '/api/auth/config')['body']);
    $health = api('GET', '/api/health')['body'];
    assert_same('none', $health['auth']);
    assert_same(true, $health['contentCurrent']);
});
