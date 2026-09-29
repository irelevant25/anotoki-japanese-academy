<?php
/**
 * The spaced-repetition schedule — WaniKani's, kept exactly.
 *
 * Stage  Name             Next review after
 *   1    Apprentice I      4 h
 *   2    Apprentice II     8 h
 *   3    Apprentice III   23 h   (≈1 day — the hour is shaved off because
 *   4    Apprentice IV    47 h    review times are rounded down to the hour)
 *   5    Guru I          167 h   (≈1 week)
 *   6    Guru II         335 h   (≈2 weeks)
 *   7    Master          719 h   (≈1 month)
 *   8    Enlightened    2879 h   (≈4 months)
 *   9    Burned            —
 *
 * A review with no mistakes moves the item up one stage. With mistakes it drops
 *   ceil(mistakes / 2) × (2 if it was Guru or above, else 1)
 * stages, never below Apprentice I.
 *
 * What is deliberately NOT WaniKani here: nothing is locked behind time. Lessons
 * are unlimited, and practice (see srs_practice()) never touches the schedule,
 * so drilling as often as you like cannot knock an item off its intervals.
 *
 * Times are milliseconds since 1970, as the browser keeps them.
 */

declare(strict_types=1);

const SRS_STAGES = [
    ['n' => 0, 'name' => 'Lesson', 'group' => 'lesson', 'hours' => null],
    ['n' => 1, 'name' => 'Apprentice I', 'group' => 'apprentice', 'hours' => 4],
    ['n' => 2, 'name' => 'Apprentice II', 'group' => 'apprentice', 'hours' => 8],
    ['n' => 3, 'name' => 'Apprentice III', 'group' => 'apprentice', 'hours' => 23],
    ['n' => 4, 'name' => 'Apprentice IV', 'group' => 'apprentice', 'hours' => 47],
    ['n' => 5, 'name' => 'Guru I', 'group' => 'guru', 'hours' => 167],
    ['n' => 6, 'name' => 'Guru II', 'group' => 'guru', 'hours' => 335],
    ['n' => 7, 'name' => 'Master', 'group' => 'master', 'hours' => 719],
    ['n' => 8, 'name' => 'Enlightened', 'group' => 'enlightened', 'hours' => 2879],
    ['n' => 9, 'name' => 'Burned', 'group' => 'burned', 'hours' => null],
];

const SRS_GROUPS = [
    ['id' => 'apprentice', 'name' => 'Apprentice', 'stages' => [1, 2, 3, 4]],
    ['id' => 'guru', 'name' => 'Guru', 'stages' => [5, 6]],
    ['id' => 'master', 'name' => 'Master', 'stages' => [7]],
    ['id' => 'enlightened', 'name' => 'Enlightened', 'stages' => [8]],
    ['id' => 'burned', 'name' => 'Burned', 'stages' => [9]],
];

/** Round down to the start of the local hour, as WaniKani does. */
function srs_floor_hour(int $t): int
{
    return local_wall_ms(local_time($t)->format('Y-m-d H:00:00'));
}

function srs_next_review_at(int $stage, int $now): ?int
{
    $hours = SRS_STAGES[$stage]['hours'] ?? null;
    return $hours ? srs_floor_hour($now + $hours * HOUR_MS) : null;
}

/** A fresh per-item record. Items with no record at all have never been touched. */
function srs_blank(): array
{
    return [
        'stage' => 0,
        'learnedAt' => null,
        'nextReview' => null,
        'lastReviewAt' => null,
        'burnedAt' => null,
        'reviews' => ['meaning' => ['correct' => 0, 'incorrect' => 0], 'reading' => ['correct' => 0, 'incorrect' => 0]],
        'streak' => ['meaning' => 0, 'reading' => 0],
        'practice' => ['correct' => 0, 'incorrect' => 0, 'last' => null],
        'lastWrongAt' => null,
        'notes' => ['meaning' => '', 'reading' => ''],
        'synonyms' => [],
        'extraReadings' => [],
    ];
}

/** Lesson finished (its quiz passed): the item enters the schedule at Apprentice I. */
function srs_learn(?array $state, int $now): array
{
    $s = array_merge(srs_blank(), $state ?? []);
    $s['stage'] = 1;
    $s['learnedAt'] = $now;
    $s['nextReview'] = srs_next_review_at(1, $now);
    return $s;
}

/**
 * A scheduled review. meaningWrong / readingWrong are how many wrong answers
 * the item collected in the session before both halves were answered right.
 *
 * @return array{state: array, from: int, to: int}
 */
function srs_review(?array $state, array $wrong, int $now): array
{
    $s = array_merge(srs_blank(), $state ?? []);
    $meaningWrong = (int) ($wrong['meaningWrong'] ?? 0);
    $readingWrong = (int) ($wrong['readingWrong'] ?? 0);
    $from = (int) $s['stage'];
    $total = $meaningWrong + $readingWrong;

    if ($total === 0) {
        $to = min(9, $from + 1);
    } else {
        $adjust = (int) ceil($total / 2);
        $factor = $from >= 5 ? 2 : 1;
        $to = max(1, $from - $adjust * $factor);
    }

    $s['stage'] = $to;
    $s['lastReviewAt'] = $now;
    $s['nextReview'] = srs_next_review_at($to, $now);
    if ($to === 9) {
        $s['burnedAt'] = $now;
    }

    foreach (['meaning' => $meaningWrong, 'reading' => $readingWrong] as $part => $n) {
        // Each half counts once as right (it was eventually answered) and once per miss.
        $s['reviews'][$part]['correct'] += 1;
        $s['reviews'][$part]['incorrect'] += $n;
        $s['streak'][$part] = $n ? 0 : $s['streak'][$part] + 1;
    }
    if ($total) {
        $s['lastWrongAt'] = $now;
    }

    return ['state' => $s, 'from' => $from, 'to' => $to];
}

/**
 * Practice: recorded for the item's statistics (and the "weakest" / "recent
 * mistakes" practice sets), but the SRS stage and schedule are left alone.
 */
function srs_practice(?array $state, array $answer, int $now): array
{
    $s = array_merge(srs_blank(), $state ?? []);
    if (!empty($answer['firstTryCorrect'])) {
        $s['practice']['correct'] += 1;
    } else {
        $s['practice']['incorrect'] += 1;
    }
    $s['practice']['last'] = $now;
    if (!empty($answer['wrong'])) {
        $s['lastWrongAt'] = $now;
    }
    return $s;
}

function srs_is_learned(?array $s): bool
{
    return $s !== null && ($s['stage'] ?? 0) >= 1;
}

function srs_is_due(?array $s, int $now): bool
{
    return $s !== null && ($s['stage'] ?? 0) >= 1 && $s['stage'] <= 8
        && ($s['nextReview'] ?? null) !== null && $s['nextReview'] <= $now;
}
