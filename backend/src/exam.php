<?php
/**
 * The exam's side of the API: the setup screen's numbers, papers drawn from
 * the stored question bank, scoring, and the attempts with their reports.
 *
 * Two rules keep the scoring honest:
 *   - a paper goes to the browser without its answers (exam_paper_public())
 *   - submit rebuilds the paper from the spec it was built from, echoed back
 *     by the browser, and refuses answers to questions that aren't on it
 */

declare(strict_types=1);

/** Bank rows in bank order: the sections a spec asks for (and its lessons, when they are plain numbers). */
function exam_pool(array $spec): array
{
    $scope = exam_scope($spec);
    $sql = 'SELECT id, section, lesson, book, question, hint, reading, audio, correct, distractors, explain, ref
            FROM exam_questions WHERE section IN (SELECT json_array_elements_text(?::json))';
    $params = [json_text(array_column($scope['sections'], 'id'))];
    $lessons = $scope['lessons'];
    // anything else (a NaN from Number('x')) matches no lesson; exam_build_paper() filters those itself
    if ($lessons !== null && !array_filter($lessons, static fn ($l): bool => !is_int($l))) {
        $sql .= ' AND lesson IN (SELECT json_array_elements_text(?::json)::int)';
        $params[] = json_text($lessons);
    }
    return array_map(static fn (array $r): array => [
        'id' => $r['id'],
        'section' => $r['section'],
        'lesson' => (int) $r['lesson'],
        'book' => (int) $r['book'],
        'question' => $r['question'],
        'hint' => $r['hint'],
        'reading' => $r['reading'],
        'audio' => $r['audio'],
        'correct' => $r['correct'],
        'distractors' => json_decode($r['distractors'], true),
        'explain' => $r['explain'],
        'ref' => $r['ref'],
    ], db_all($sql . ' ORDER BY seq', $params));
}

/** The paper a spec gives, laid out from the stored bank. */
function exam_paper(array $spec): array
{
    return exam_build_paper($spec, exam_pool($spec));
}

/** Counts per section and part, from the stored bank. */
function exam_stats(): array
{
    $stats = ['total' => 0, 'bySection' => [], 'byBook' => [], 'bySectionBook' => []];
    foreach (db_all('SELECT section, book, count(*) AS n FROM exam_questions GROUP BY section, book ORDER BY min(seq)') as $r) {
        $n = (int) $r['n'];
        $book = (int) $r['book'];
        $stats['total'] += $n;
        $stats['bySection'][$r['section']] = ($stats['bySection'][$r['section']] ?? 0) + $n;
        $stats['byBook'][$book] = ($stats['byBook'][$book] ?? 0) + $n;
        $stats['bySectionBook'][$book][$r['section']] = $n;
    }
    return $stats;
}

/** GET /api/meta: what the setup screen offers, with this person's number of attempts. */
function exam_meta(int $uid): array
{
    $stats = exam_stats();
    $lessons = [['id' => 0, 'name' => 'Greetings (あいさつ)', 'book' => 1]];
    for ($i = 1; $i <= 23; $i++) {
        $lessons[] = ['id' => $i, 'name' => "Lesson $i", 'book' => $i <= 12 ? 1 : 2];
    }
    return [
        'books' => array_map(static fn (array $b): array => [
            'id' => $b['id'],
            'name' => $b['name'],
            'lessons' => $b['lessons'],
            'available' => $stats['byBook'][$b['id']] ?? 0,
            'bySection' => $stats['bySectionBook'][$b['id']] ?? new stdClass(),
        ], BOOKS),
        'sections' => array_map(static fn (array $s): array => [
            'id' => $s['id'],
            'name' => $s['name'],
            'audio' => !empty($s['audio']),
            'available' => $stats['bySection'][$s['id']] ?? 0,
        ], SECTIONS),
        'lessons' => $lessons,
        'bankSize' => $stats['total'],
        'attempts' => (int) db_value('SELECT count(*) FROM exam_attempts WHERE user_id = ?', [$uid]),
    ];
}

/** POST /api/exam: a paper, without its answers. */
function exam_start(array $body): array
{
    $spec = exam_normalize_spec($body);
    $exam = exam_paper($spec);
    return [
        'spec' => array_merge($spec, ['seed' => $exam['seed']]),
        'seed' => $exam['seed'],
        'size' => $exam['size'],
        'createdAt' => $exam['createdAt'],
        'sections' => $exam['sections'],
        'lessons' => $exam['lessons'],
        'books' => $exam['books'],
        // The client must not receive the answers.
        'questions' => array_map(static fn (array $q): array => [
            'n' => $q['n'],
            'id' => $q['id'],
            'section' => $q['section'],
            'sectionName' => $q['sectionName'],
            'lesson' => $q['lesson'],
            'book' => $q['book'],
            'question' => $q['question'],
            'hint' => $q['hint'],
            'reading' => $q['reading'],
            'audio' => $q['audio'],
            'options' => $q['options'],
        ], $exam['questions']),
    ];
}

/**
 * POST /api/submit: score the answers against the paper rebuilt from its
 * spec, store the attempt and its report as this person's. Returns [status, body].
 */
function exam_submit(int $uid, array $body): array
{
    $spec = exam_normalize_spec(is_array($body['spec'] ?? null) ? $body['spec'] : $body);
    if ($spec['seed'] === null) {
        return [400, ['error' => 'spec.seed is required', 'code' => 'seed_required']];
    }
    $responses = is_array($body['responses'] ?? null) ? $body['responses'] : [];

    // Rebuild the identical paper from the spec — the answers never left the server.
    $exam = exam_paper($spec);

    // Guard against a spec/answer mismatch silently scoring the wrong paper.
    $ids = array_flip(array_column($exam['questions'], 'id'));
    $stray = array_filter(array_keys($responses), static fn ($id): bool => !isset($ids[(string) $id]));
    if ($stray) {
        return [409, [
            'error' => 'The submitted answers do not belong to this paper (' . count($stray) . ' unknown question id(s)). Nothing was saved.',
            'code' => 'paper_mismatch',
        ]];
    }

    $result = score_attempt($exam, $responses);
    $now = now_ms();
    $finishedAt = iso_time($now);
    $id = preg_replace_callback(
        '/[^A-Za-z0-9_-]/u',
        static fn (array $m): string => str_repeat('-', js_len($m[0])),
        str_replace([':', '.'], '-', $finishedAt) . '-' . $exam['seed']
    );
    $meta = $body['meta'] ?? null;
    $meta = js_truthy($meta) ? ($meta === [] ? new stdClass() : $meta) : new stdClass();
    $startedAt = $body['startedAt'] ?? null;

    $attempt = [
        'id' => $id,
        'startedAt' => js_truthy($startedAt) ? $startedAt : null,
        'finishedAt' => $finishedAt,
        'meta' => $meta,
        'exam' => [
            'seed' => $exam['seed'],
            'size' => $exam['size'],
            'books' => $exam['books'],
            'lessons' => $exam['lessons'],
            'sections' => $exam['sections'],
        ],
        'summary' => [
            'total' => $result['total'],
            'answered' => $result['answered'],
            'unanswered' => $result['unanswered'],
            'right' => $result['right'],
            'wrong' => $result['wrong'],
            'pct' => $result['pct'],
            'grade' => $result['grade'],
            'passed' => $result['passed'],
            'passMark' => $result['passMark'],
            'totalMs' => $result['totalMs'],
            'avgMs' => $result['avgMs'],
        ],
        'bySection' => $result['bySection'],
        'byLesson' => $result['byLesson'],
        'byBook' => $result['byBook'],
        'responses' => array_map(static fn (array $r): array => [
            'n' => $r['n'],
            'id' => $r['id'],
            'section' => $r['section'],
            'lesson' => $r['lesson'],
            'book' => $r['book'],
            'audio' => $r['audio'],
            'question' => $r['question'],
            'chosen' => $r['chosenAnswer'],
            'correctAnswer' => $r['correctAnswer'],
            'correct' => $r['correct'],
            'ms' => $r['ms'],
        ], $result['rows']),
    ];

    db_tx(static function () use ($uid, $attempt, $result): void {
        users_hold($uid); // an import or a delete of their data first, if one is under way
        // the report lists every attempt of this person, this one included
        $history = exam_history($uid);
        $history[] = exam_history_row($attempt);
        usort($history, static fn (array $a, array $b): int => (ms_from_iso($a['finishedAt']) ?? 0) <=> (ms_from_iso($b['finishedAt']) ?? 0));
        exam_save_attempt($uid, $attempt, report_render($attempt, $result, $history));
    });

    return [200, [
        'id' => $id,
        'summary' => $attempt['summary'],
        'bySection' => $result['bySection'],
        'byLesson' => $result['byLesson'],
        'weakSections' => $result['weakSections'],
        'weakLessons' => $result['weakLessons'],
        'reportUrl' => "/report/$id",
        'byBook' => $result['byBook'],
        // Made here and sent once: an attempt is stored without them (its responses hold the section's id).
        // The page words a section from sectionId; the name stays for anything that reads it.
        'review' => array_map(static fn (array $r): array => [
            'n' => $r['n'],
            'section' => $r['sectionName'],
            'sectionId' => $r['section'],
            'lesson' => $r['lesson'],
            'audio' => $r['audio'],
            'question' => $r['question'],
            'chosen' => $r['chosenAnswer'],
            'correctAnswer' => $r['correctAnswer'],
            'correct' => $r['correct'],
            'explain' => $r['explain'],
            'ref' => $r['ref'],
        ], $result['rows']),
    ]];
}

/**
 * Stores one of this person's attempts (a new one, or one read from the old
 * files or a backup) with its report. Ids are unique per person: two people's
 * attempts may share one.
 */
function exam_save_attempt(int $uid, array $attempt, ?string $report): void
{
    $summary = is_array($attempt['summary'] ?? null) ? $attempt['summary'] : [];
    $meta = is_array($attempt['meta'] ?? null) ? $attempt['meta'] : [];
    if (($attempt['meta'] ?? null) === []) {
        $attempt['meta'] = new stdClass(); // {} read back from JSON is [] in PHP; it is an object
    }
    $finished = ms_from_iso($attempt['finishedAt'] ?? null);
    if ($finished === null) {
        throw new RuntimeException('Attempt ' . js_string($attempt['id'] ?? '?') . ' has no finishedAt time.');
    }
    db_exec(
        'INSERT INTO exam_attempts (user_id, id, started_at, finished_at, candidate, seed, total, right_count, pct, grade, passed, attempt, report)
         VALUES (?, ?, academy_time(?), academy_time(?), ?, ?, ?, ?, ?, ?, ?, ?::json, ?)
         ON CONFLICT (user_id, id) DO UPDATE SET started_at = EXCLUDED.started_at, finished_at = EXCLUDED.finished_at,
            candidate = EXCLUDED.candidate, seed = EXCLUDED.seed, total = EXCLUDED.total, right_count = EXCLUDED.right_count,
            pct = EXCLUDED.pct, grade = EXCLUDED.grade, passed = EXCLUDED.passed, attempt = EXCLUDED.attempt, report = EXCLUDED.report',
        [
            $uid,
            (string) $attempt['id'],
            ms_from_iso($attempt['startedAt'] ?? null),
            $finished,
            js_truthy($meta['candidate'] ?? null) ? js_string($meta['candidate']) : '',
            js_string($attempt['exam']['seed'] ?? ''),
            (int) ($summary['total'] ?? 0),
            (int) ($summary['right'] ?? 0),
            (float) ($summary['pct'] ?? 0),
            (string) ($summary['grade'] ?? ''),
            (bool) ($summary['passed'] ?? false),
            json_text($attempt),
            $report,
        ]
    );
}

/** An attempt's line in the history. */
function exam_history_row(array $attempt): array
{
    $meta = is_array($attempt['meta'] ?? null) ? $attempt['meta'] : [];
    return [
        'id' => $attempt['id'],
        'finishedAt' => $attempt['finishedAt'],
        'total' => $attempt['summary']['total'],
        'right' => $attempt['summary']['right'],
        'pct' => $attempt['summary']['pct'],
        'grade' => $attempt['summary']['grade'],
        'passed' => $attempt['summary']['passed'],
        'candidate' => js_truthy($meta['candidate'] ?? null) ? $meta['candidate'] : '',
    ];
}

/** This person's attempts, oldest first. GET /api/attempts sends them newest first. */
function exam_history(int $uid): array
{
    return array_map(static fn (array $r): array => [
        'id' => $r['id'],
        'finishedAt' => $r['finished_iso'],
        'total' => (int) $r['total'],
        'right' => (int) $r['right_count'],
        'pct' => js_number((float) $r['pct']),
        'grade' => $r['grade'],
        'passed' => (bool) $r['passed'],
        'candidate' => $r['candidate'],
    ], db_all("SELECT id, attempt->>'finishedAt' AS finished_iso, total, right_count, pct, grade, passed, candidate
               FROM exam_attempts WHERE user_id = ? ORDER BY exam_attempts.finished_at, id", [$uid]));
}

/** The HTML report of one of this person's attempts, or null (another person's is not theirs to see). */
function exam_report(int $uid, string $id): ?string
{
    $report = db_value('SELECT report FROM exam_attempts WHERE user_id = ? AND id = ?', [$uid, $id]);
    return is_string($report) ? $report : null;
}

/** This person's attempts with their reports, oldest first — for the backups. */
function exam_attempts_all(int $uid): array
{
    return array_map(
        static fn (array $r): array => ['attempt' => json_decode($r['attempt'], true), 'report' => $r['report']],
        db_all('SELECT attempt, report FROM exam_attempts WHERE user_id = ? ORDER BY finished_at, id', [$uid])
    );
}
