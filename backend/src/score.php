<?php
/**
 * Scoring and analysis of a completed attempt.
 *
 * The course runs over 23 lessons, so the report breaks the result down by
 * lesson as well as by skill section — that is what tells you *what to revise*,
 * which a single percentage cannot.
 */

declare(strict_types=1);

const PASS_MARK = 70; // overall % required to pass
const SECTION_FLOOR = 60; // % below which a section is flagged as a weakness

/**
 * @param array $exam      a paper from exam_build_paper()
 * @param array $responses [questionId => ['choice' => int|null, 'ms' => number]]
 */
function score_attempt(array $exam, array $responses): array
{
    $rows = [];
    foreach ($exam['questions'] as $q) {
        $r = $responses[$q['id']] ?? [];
        $r = is_array($r) ? $r : [];
        $choice = js_number_or_null($r['choice'] ?? null);
        $chosen = $choice === null ? null : ($q['options'][$choice] ?? null);
        $ms = js_number($r['ms'] ?? null);
        $rows[] = [
            'n' => $q['n'],
            'id' => $q['id'],
            'section' => $q['section'],
            'sectionName' => $q['sectionName'],
            'lesson' => $q['lesson'],
            'book' => $q['book'],
            'question' => $q['question'],
            'hint' => $q['hint'] ?? null,
            'audio' => $q['audio'] ?? null,
            'options' => $q['options'],
            'answerIndex' => $q['answerIndex'],
            'correctAnswer' => $q['options'][$q['answerIndex']],
            'chosenIndex' => $choice,
            'chosenAnswer' => $chosen,
            'correct' => $choice !== null && $choice === $q['answerIndex'],
            'answered' => $choice !== null,
            'ms' => is_nan((float) $ms) ? 0 : $ms,
            'explain' => $q['explain'],
            'ref' => $q['ref'],
        ];
    }

    $total = count($rows);
    $right = count(array_filter($rows, static fn (array $r): bool => $r['correct']));
    $answered = count(array_filter($rows, static fn (array $r): bool => $r['answered']));
    $pct = $total ? ($right / $total) * 100 : 0;

    $group = static function (callable $keyFn, callable $nameFn) use ($rows): array {
        $m = [];
        foreach ($rows as $r) {
            $k = $keyFn($r);
            $m[$k] ??= ['key' => $k, 'name' => $nameFn($r), 'total' => 0, 'right' => 0, 'ms' => 0];
            $m[$k]['total']++;
            if ($r['correct']) {
                $m[$k]['right']++;
            }
            $m[$k]['ms'] += $r['ms'];
        }
        return array_map(static fn (array $g): array => $g + ['pct' => $g['total'] ? ($g['right'] / $g['total']) * 100 : 0], array_values($m));
    };

    $sectionOrder = array_flip(array_column(SECTIONS, 'id'));
    $bySection = $group(static fn (array $r) => $r['section'], static fn (array $r) => $r['sectionName']);
    usort($bySection, static fn (array $a, array $b): int => ($sectionOrder[$a['key']] ?? 99) - ($sectionOrder[$b['key']] ?? 99));

    $byLesson = $group(static fn (array $r) => $r['lesson'], static fn (array $r) => $r['lesson'] === 0 ? 'Greetings' : "Lesson {$r['lesson']}");
    usort($byLesson, static fn (array $a, array $b): int => $a['key'] <=> $b['key']);

    $byBook = $group(static fn (array $r) => $r['book'], static fn (array $r) => "Part {$r['book']}");
    usort($byBook, static fn (array $a, array $b): int => $a['key'] <=> $b['key']);

    $weakSections = array_values(array_filter($bySection, static fn (array $s): bool => $s['pct'] < SECTION_FLOOR));
    usort($weakSections, static fn (array $a, array $b): int => $a['pct'] <=> $b['pct']);
    $weakLessons = array_values(array_filter($byLesson, static fn (array $l): bool => $l['pct'] < SECTION_FLOOR && $l['total'] >= 3));
    usort($weakLessons, static fn (array $a, array $b): int => $a['pct'] <=> $b['pct']);

    $totalMs = array_sum(array_column($rows, 'ms'));

    return [
        'total' => $total,
        'answered' => $answered,
        'unanswered' => $total - $answered,
        'right' => $right,
        'wrong' => $answered - $right,
        'pct' => js_round($pct * 10) / 10,
        'passMark' => PASS_MARK,
        'passed' => $pct >= PASS_MARK,
        'grade' => score_grade($pct),
        'bySection' => $bySection,
        'byLesson' => $byLesson,
        'byBook' => $byBook,
        'weakSections' => $weakSections,
        'weakLessons' => $weakLessons,
        'totalMs' => $totalMs,
        'avgMs' => $total ? js_round($totalMs / $total) : 0,
        'rows' => $rows,
    ];
}

/** An answer's option index: a whole number, or null (unanswered, or something that is no answer). */
function js_number_or_null($v): ?int
{
    if (is_int($v)) {
        return $v;
    }
    if (is_float($v) && is_finite($v) && floor($v) === $v) {
        return (int) $v;
    }
    return null;
}

function score_grade(float $pct): string
{
    if ($pct >= 90) {
        return 'A';
    }
    if ($pct >= 80) {
        return 'B';
    }
    if ($pct >= 70) {
        return 'C';
    }
    if ($pct >= 60) {
        return 'D';
    }
    return 'F';
}
