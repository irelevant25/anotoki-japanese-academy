<?php
// The SRS engine against WaniKani's rules.
declare(strict_types=1);

require __DIR__ . '/../lib.php';

const H = HOUR_MS;
define('NOW', local_wall_ms('2026-09-23 10:37:12')); // 10:37:12 local

function at(int $stage): array
{
    return array_merge(srs_blank(), ['stage' => $stage, 'learnedAt' => NOW, 'nextReview' => NOW]);
}

test('learning puts an item at Apprentice I, first review on the hour 4 h out', function (): void {
    $s = srs_learn(null, NOW);
    assert_same(1, $s['stage']);
    $d = local_time($s['nextReview']);
    assert_same('14:00', $d->format('H:i'));
});

test('clean reviews climb 1 → 9 with the WaniKani intervals', function (): void {
    $s = srs_learn(null, NOW);
    $hours = [];
    for ($i = 1; $i <= 8; $i++) {
        $t = $s['nextReview'];
        $r = srs_review($s, [], $t);
        if ($r['state']['nextReview']) {
            $hours[] = (int) round(($r['state']['nextReview'] - $t) / H);
        }
        $s = $r['state'];
    }
    assert_same(9, $s['stage']);
    assert_same(null, $s['nextReview'], 'burned items are never scheduled');
    assert_true($s['burnedAt'] !== null);
    foreach ([8, 23, 47, 167, 335, 719, 2879] as $i => $nominal) {
        assert_true(abs($hours[$i] - $nominal) <= 1, "interval $i: {$hours[$i]}h vs {$nominal}h");
    }
});

test('penalty: ceil(misses / 2), doubled from Guru, never below Apprentice I', function (): void {
    foreach ([
        [4, ['meaningWrong' => 1], 3],
        [4, ['meaningWrong' => 1, 'readingWrong' => 1], 3],
        [4, ['meaningWrong' => 3], 2],
        [2, ['readingWrong' => 5], 1],
        [5, ['meaningWrong' => 1], 3],
        [7, ['meaningWrong' => 1], 5],
        [8, ['meaningWrong' => 2, 'readingWrong' => 2], 4],
        [6, [], 7],
    ] as [$from, $wrong, $to]) {
        assert_same($to, srs_review(at($from), $wrong, NOW)['to'], "$from " . json_encode($wrong));
    }
});

test('review statistics and streaks', function (): void {
    $s = srs_review(at(3), ['meaningWrong' => 2], NOW)['state'];
    assert_same(['correct' => 1, 'incorrect' => 2], $s['reviews']['meaning']);
    assert_same(['correct' => 1, 'incorrect' => 0], $s['reviews']['reading']);
    assert_same(0, $s['streak']['meaning']);
    assert_same(1, $s['streak']['reading']);
});

test('practice never touches the schedule', function (): void {
    $before = array_merge(at(5), ['nextReview' => NOW + 100 * H]);
    $p = srs_practice($before, ['firstTryCorrect' => false, 'wrong' => 3], NOW);
    assert_same(5, $p['stage']);
    assert_same($before['nextReview'], $p['nextReview']);
    assert_same(1, $p['practice']['incorrect']);
    assert_same(NOW, $p['lastWrongAt']);
});

test('isDue', function (): void {
    assert_true(srs_is_due(at(4), NOW));
    assert_false(srs_is_due(array_merge(at(4), ['nextReview' => NOW + H]), NOW));
    assert_false(srs_is_due(at(9), NOW), 'burned is never due');
    assert_false(srs_is_due(at(0), NOW), 'unlearned is never due');
});

test('the autumn’s repeated hour floors to its first occurrence', function (): void {
    date_default_timezone_set('Europe/Bratislava');
    // 02:30 CET, the second time the clock shows 02:30 on 2026-10-25
    $t = ms_of(new DateTimeImmutable('2026-10-25T01:30:00Z'));
    assert_same(ms_of(new DateTimeImmutable('2026-10-25T00:00:00Z')), srs_floor_hour($t), '02:00 CEST, as the browser-era app did it');
    date_default_timezone_set(app_timezone());
});
