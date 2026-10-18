<?php
// What a word is spoken as, and the audio builder, with a fake voice in temp
// folders: nothing is sent to Google and backend/data/audio is never touched.
declare(strict_types=1);

require __DIR__ . '/../lib.php';
require BACKEND . '/tools/build-audio.php';

test('spoken: optional parts, notes and punctuation go; the kanji spelling stays', function (): void {
    $s = static function (?string $kana, ?string $kanji = null): ?string {
        $r = speech_spoken($kana, $kanji);
        return $r ? "{$r['text']}|{$r['reading']}" : null;
    };
    assert_same('意地悪|いじわる', $s('いじわる(な)', '意地悪'));
    assert_same('妹|いもうと', $s('いもうと(さん)', '妹(さん)'));
    assert_same('おかえり|おかえり', $s('おかえり(なさい)'));
    assert_same('ください|ください', $s('ください(〜を)'));
    assert_same('あまり|あまり', $s('あまり + negative'));
    assert_same('おはようございます|おはようございます', $s('おはよう ございます。'));
    assert_same('入り口|いりぐち', $s('いりぐち', '入り口/入口'), 'the first spelling');
    assert_same('放っておく|ほうっておく', $s('ほ(う)っておく', '放っておく'), 'brackets inside a word are part of it');
    assert_same('そんなことはない|そんなことはない', $s('そんなこと(は)ない'));
    assert_same('鍵をかける|かぎをかける', $s('かける(かぎを)', 'かける(鍵を)'), 'a phrase is spoken whole');
    assert_same('文句を言う|もんくをいう', $s('いう(もんくを)', '言う(文句を)'));
    assert_same(null, $s('〜えん', '〜円'), 'a suffix is not a word');
    assert_same(null, $s('〜か〜'));
    assert_same(null, $s('Tシャツ'), 'letters are not voiced');
});

test('requests: kana as text, a kanji word with its reading as yomigana', function (): void {
    $kana = audio_request(['text' => 'ねこ', 'reading' => 'ねこ'], VOICES[0]);
    assert_same(['text' => 'ねこ'], $kana['input']);
    assert_same(VOICES[0]['name'], $kana['voice']['name']);
    assert_same('MP3', $kana['audioConfig']['audioEncoding']);
    $kanji = audio_request(['text' => '今日', 'reading' => 'きょう'], VOICES[1]);
    assert_same('<speak><phoneme alphabet="yomigana" ph="きょう">今日</phoneme></speak>', $kanji['input']['ssml']);
    assert_match('/A&#38;B/', audio_request(['text' => 'A&B', 'reading' => 'えい'], VOICES[0])['input']['ssml']);
});

/** A temp folder with an audio/ dir and an index, and a fake voice that records what it was asked. */
function sandbox(): object
{
    $sb = new stdClass();
    $sb->base = str_replace('\\', '/', sys_get_temp_dir()) . '/academy-audio-' . bin2hex(random_bytes(4));
    mkdir($sb->base);
    $sb->dir = "$sb->base/audio";
    $sb->indexFile = "$sb->base/audio.json";
    $sb->sent = [];
    $sb->synth = static function (array $req) use ($sb): string {
        $sb->sent[] = $req;
        return 'mp3 ' . json_text($req['input']) . ' ' . $req['voice']['name'];
    };
    $sb->run = static fn(array $words, array $opts = []): array => audio_build(
        $opts + [
            'words' => $words,
            'dir' => $sb->dir,
            'indexFile' => $sb->indexFile,
            'synth' => $sb->synth,
            'log' => static function (): void {},
        ],
    );
    $sb->index = static fn(): array => read_json($sb->indexFile);
    $sb->files = static function () use ($sb): array {
        $f = array_values(array_diff(scandir($sb->dir) ?: [], ['.', '..']));
        sort($f);
        return $f;
    };
    $GLOBALS['sandboxes'][] = $sb->base;
    return $sb;
}

after(function (): void {
    foreach ($GLOBALS['sandboxes'] ?? [] as $base) {
        foreach (array_merge(glob("$base/audio/*") ?: [], glob("$base/*") ?: []) as $f) {
            is_dir($f) ? @rmdir($f) : @unlink($f);
        }
        @rmdir("$base/audio");
        @rmdir($base);
    }
});

function W(string $text, ?string $reading = null): array
{
    $reading ??= $text;
    return ['text' => $text, 'reading' => $reading, 'key' => "$text|$reading"];
}

function listed(array $index): array
{
    $out = [];
    foreach ($index['clips'] as $clips) {
        foreach ($clips as $f) {
            $out[] = $f;
        }
    }
    sort($out);
    return $out;
}

test('build: each word once per voice, then only what is missing', function (): void {
    $sb = sandbox();
    $words = [W('ねこ'), W('今日', 'きょう'), W('大学', 'だいがく')];
    $r = ($sb->run)($words);
    assert_same(count($words) * count(VOICES), $r['made']);
    assert_same(6, count($sb->sent));
    $idx = ($sb->index)();
    assert_same(VOICES, $idx['voices']);
    foreach ($words as $w) {
        $c = $idx['clips'][$w['key']];
        $ids = array_keys($c);
        sort($ids);
        $want = array_column(VOICES, 'id');
        sort($want);
        assert_same($want, $ids, $w['key']);
        foreach ($c as $f) {
            assert_match('/^[0-9a-f]{16}\.mp3$/', $f, 'a random name that gives nothing away');
            assert_true(is_file("$sb->dir/$f"));
        }
    }
    assert_same(6, count(($sb->files)()));

    // A second run sends nothing.
    $r = ($sb->run)($words);
    assert_same(0, $r['made']);
    assert_same(6, count($sb->sent));

    // A word leaves the list and another joins: one new word is voiced, and the
    // clips of the old one are removed.
    $gone = array_values(($sb->index)()['clips']['ねこ|ねこ']);
    $r = ($sb->run)([W('いぬ'), W('今日', 'きょう'), W('大学', 'だいがく')]);
    assert_same(2, $r['made']);
    assert_same(2, $r['removed']);
    assert_same([], array_intersect($gone, ($sb->files)()));
    assert_same(6, count(($sb->files)()));
});

test('build: a failed request keeps every clip made so far and deletes nothing', function (): void {
    $sb = sandbox();
    ($sb->run)([W('ねこ')]);
    $calls = 0;
    $flaky = static function (array $req) use (&$calls): string {
        if (++$calls > 3) {
            throw new RuntimeException('quota');
        }
        return 'mp3 ' . $req['voice']['name'];
    };
    assert_throws(static fn() => ($sb->run)([W('ねこ'), W('いぬ'), W('とり'), W('さかな')], ['synth' => $flaky]), '/quota/');
    $listed = listed(($sb->index)());
    assert_same(2 + 3, count($listed), 'the old word, plus the three clips made before the failure');
    assert_same(($sb->files)(), $listed, 'every file is listed, every listed file exists');
});

test('build: a recipe or voice change remakes clips; a --limit run leaves the rest to do', function (): void {
    $sb = sandbox();
    $words = [W('ねこ'), W('いぬ'), W('とり')];
    ($sb->run)($words, ['recipe' => 'r1']);
    $r = ($sb->run)($words, ['recipe' => 'r2', 'limit' => 1]);
    assert_same(1, $r['made']);
    assert_same(0, $r['removed'], 'nothing is deleted after a partial run');
    $r = ($sb->run)($words, ['recipe' => 'r2']);
    assert_same(5, $r['made'], 'the other five are still outdated');
    assert_same(6, $r['removed'], 'every r1 clip goes once all are replaced');
    assert_same(0, ($sb->run)($words, ['recipe' => 'r2'])['made']);
    $renamed = [VOICES[0], ['name' => 'another-voice'] + VOICES[1]];
    $r = ($sb->run)($words, ['recipe' => 'r2', 'voices' => $renamed]);
    assert_same(3, $r['made'], 'only the voice that changed');
    $stamped = array_keys(($sb->index)()['made']);
    sort($stamped);
    assert_same(($sb->files)(), $stamped, 'every clip is stamped, every stamp is a clip');
});

test('build: an unreadable index stops the build and deletes nothing', function (): void {
    $sb = sandbox();
    ($sb->run)([W('ねこ')]);
    file_put_contents($sb->indexFile, '<<<<<<< a merge conflict');
    assert_throws(static fn() => ($sb->run)([W('ねこ')]), '/unreadable/');
    assert_same(2, count(($sb->files)()), 'the clips are still there');
    assert_same(2, count($sb->sent), 'nothing more was sent');
});

test('build: a word Google refuses is skipped, and the others are still made', function (): void {
    $sb = sandbox();
    $refuse = static function (array $req): string {
        if (str_contains(json_text($req['input']), 'とり')) {
            throw new TtsError(400, 'Text-to-Speech answered 400: bad input');
        }
        return 'mp3';
    };
    $r = ($sb->run)([W('ねこ'), W('とり'), W('いぬ')], ['synth' => $refuse]);
    assert_same(4, $r['made']);
    assert_same(2, count($r['skipped']));
    assert_same([], ($sb->index)()['clips']['とり|とり']);
});

test('build: a stop request ends the run cleanly, with every clip made so far listed', function (): void {
    $sb = sandbox();
    $words = array_map('W', ['ねこ', 'いぬ', 'とり', 'うま', 'さる']);
    $r = ($sb->run)($words, ['shouldStop' => static fn(): bool => count($sb->sent) >= 3]);
    assert_same(true, $r['stopped']);
    assert_same(3, $r['made']);
    assert_same(0, $r['removed']);
    assert_same(($sb->files)(), listed(($sb->index)()));
    assert_same(7, ($sb->run)($words)['made'], 'the next run makes only the rest');
});

test('build: a dry run sends and writes nothing', function (): void {
    $sb = sandbox();
    $r = ($sb->run)([W('ねこ'), W('今日', 'きょう')], ['dryRun' => true]);
    assert_same(4, $r['todo']);
    assert_true($r['chars'] > 0);
    assert_same(0, count($sb->sent));
    assert_false(is_file("$sb->base/audio.json"));
    assert_false(is_dir($sb->dir));
});
