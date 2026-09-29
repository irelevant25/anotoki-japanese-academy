<?php
// The exam question bank and paper assembly.
declare(strict_types=1);

require __DIR__ . '/../lib.php';

$GLOBALS['bank'] = exam_build_bank(content_load());

function paper(array $spec): array
{
    return exam_build_paper(exam_normalize_spec($spec), $GLOBALS['bank']);
}

test('bank: size, both parts, every section populated', function (): void {
    $s = exam_bank_stats($GLOBALS['bank']);
    assert_true($s['total'] > 11000, "{$s['total']} questions");
    assert_true($s['byBook'][1] > 5000 && $s['byBook'][2] > 5000);
    foreach (SECTIONS as $sec) {
        assert_true(($s['bySection'][$sec['id']] ?? 0) > 0, $sec['id']);
    }
});

test('bank: every question has one right answer among distinct options', function (): void {
    foreach ($GLOBALS['bank'] as $q) {
        $opts = array_merge([$q['correct']], $q['distractors']);
        assert_same(count($opts), count(array_unique($opts)), "{$q['id']} {$q['question']}: duplicate options");
        foreach ($opts as $o) {
            assert_true(trim((string) $o) !== '', "{$q['id']}: empty option");
        }
        assert_true(count($q['distractors']) >= 1 && count($q['distractors']) <= 3, $q['id']);
    }
});

test('paper: a seed reproduces the identical paper', function (): void {
    $spec = ['size' => 120, 'books' => [1, 2], 'seed' => 'repro'];
    assert_same(paper($spec)['questions'], paper($spec)['questions']);
});

test('paper: book and lesson scope are honoured', function (): void {
    foreach (paper(['size' => 150, 'books' => [1], 'seed' => 'p1'])['questions'] as $q) {
        assert_true($q['lesson'] <= 12);
    }
    foreach (paper(['size' => 150, 'books' => [2], 'seed' => 'p2'])['questions'] as $q) {
        assert_true($q['lesson'] >= 13);
    }
    foreach (paper(['size' => 40, 'lessons' => [5, 6], 'seed' => 'l56'])['questions'] as $q) {
        assert_true($q['lesson'] === 5 || $q['lesson'] === 6);
    }
});

test('paper: the answer index points at the correct option', function (): void {
    $bank = array_column($GLOBALS['bank'], null, 'id');
    foreach (paper(['size' => 250, 'seed' => 'idx'])['questions'] as $q) {
        assert_same($bank[$q['id']]['correct'], $q['options'][$q['answerIndex']], $q['id']);
    }
});

test('paper: the seeded RNG is the first version’s (mulberry32 over UTF-16), so old seeds give old papers', function (): void {
    // the first values the JavaScript version gave for these seeds
    foreach ([
        'vocab' => [0.6907778605818748, 0.3155516260303557, 0.7313600182533264],
        '日本語' => [0.17659905506297946, 0.8051097048446536, 0.04092332278378308],
        'emoji😀' => [0.15788616705685854, 0.1757496518548578, 0.4077528789639473],
    ] as $seed => $values) {
        $r = exam_rng((string) $seed);
        assert_same($values, [$r(), $r(), $r()], (string) $seed);
    }
});
