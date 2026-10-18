<?php
// Invariants of the data the app is built from. If a data edit breaks one of
// these, fix the data (or consciously update the expected figure here).
declare(strict_types=1);

require __DIR__ . '/../lib.php';

$GLOBALS['catalog'] = catalog_build(content_load());

test('kanji data: all 317 kanji of the course, numbered 1–317 without gaps', function (): void {
    $kanji = read_json(BACKEND . '/data/kanji.json');
    assert_same(317, count($kanji));
    $nos = array_column($kanji, 'no');
    sort($nos);
    assert_same(range(1, 317), $nos);
    $perLesson = array_count_values(array_column($kanji, 'lesson'));
    ksort($perLesson);
    // per-lesson totals as printed on the Kanji List pages
    assert_same(
        [
            3 => 15,
            4 => 14,
            5 => 14,
            6 => 15,
            7 => 14,
            8 => 14,
            9 => 15,
            10 => 14,
            11 => 16,
            12 => 14,
            13 => 16,
            14 => 16,
            15 => 16,
            16 => 16,
            17 => 15,
            18 => 16,
            19 => 16,
            20 => 15,
            21 => 15,
            22 => 16,
            23 => 15,
        ],
        $perLesson,
    );
});

test('vocabulary data covers greetings and lessons 1–23', function (): void {
    $vocab = read_json(BACKEND . '/data/vocab.json');
    assert_true(count($vocab) >= 1700, count($vocab) . ' entries');
    $lessons = array_unique(array_column($vocab, 'lesson'));
    for ($L = 0; $L <= 23; $L++) {
        assert_true(in_array($L, $lessons, true), "lesson $L");
    }
});

test('SRS catalog: ids unique, kanji first in course order, vocab only uses the course kanji', function (): void {
    $items = $GLOBALS['catalog']['items'];
    $byId = array_column($items, null, 'id');
    assert_same(count($items), count($byId), 'unique ids');
    $K = array_values(array_filter($items, static fn(array $i): bool => $i['type'] === 'kanji'));
    $V = array_values(array_filter($items, static fn(array $i): bool => $i['type'] === 'vocab'));
    assert_same(316, count($K), 'every kanji but 々');
    assert_true(count($V) > 1000, count($V) . ' vocabulary items');
    assert_same(range(3, 23), $GLOBALS['catalog']['lessons']);

    $kanjiSet = array_flip(array_column($K, 'chars'));
    foreach ($V as $v) {
        assert_true((bool) $v['kanji'], "{$v['id']} has kanji");
        foreach ($v['kanji'] as $c) {
            assert_true(isset($kanjiSet[$c]), "{$v['id']}: $c is a course kanji");
        }
        $latest = max(array_map(static fn(string $c): int => $byId["k:$c"]['lesson'], $v['kanji']));
        assert_same($latest, $v['lesson'], "{$v['id']} sits in the lesson of its latest kanji");
    }
    // order: within a lesson, kanji before vocabulary
    foreach ($items as $i => $it) {
        assert_same($i, $it['order']);
        if ($i > 0) {
            $a = $items[$i - 1];
            assert_true($a['lesson'] < $it['lesson'] || ($a['lesson'] === $it['lesson'] && !($a['type'] === 'vocab' && $it['type'] === 'kanji')), "{$a['id']} before {$it['id']}");
        }
    }
    foreach ($K as $k) {
        foreach ($k['examples'] as $ex) {
            assert_true(isset($byId[$ex]), "{$k['id']} example $ex");
        }
    }
});

test('audio: every vocabulary item has a clip in each voice, and every clip exists', function (): void {
    $index = read_json(AUDIO_INDEX);
    assert_same(2, count($index['voices']), 'two voices: run node backend/tools/php.js backend/tools/build-audio.php');
    $silent = array_values(array_filter($GLOBALS['catalog']['items'], static fn(array $i): bool => $i['type'] === 'vocab' && count($i['audio'] ?? []) !== 2));
    assert_same([], array_column($silent, 'id'));
    $missing = [];
    foreach ($index['clips'] as $clips) {
        foreach ($clips as $f) {
            if (!is_file(AUDIO_CLIPS . "/$f")) {
                $missing[] = $f;
            }
        }
    }
    assert_same([], $missing);
});
