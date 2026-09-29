<?php
/**
 * Kanji progress, kept in PostgreSQL: srs_progress (one row per item),
 * srs_settings, srs_daily (the dashboard's day counts) and srs_log — every
 * row one person's (user_id). Each function here takes the user id first and
 * reads or writes that person's rows only.
 *
 * Losing weeks of SRS history would be the worst thing this app could do, so:
 *   - every answer is saved in one transaction: the item, the day's count and
 *     the log line land together or not at all
 *   - srs_log gets every answer and every reset, and is never rewritten
 *   - a copy of everything goes to backups/ once a day, when the server
 *     starts, and before a full reset (src/backup.php)
 *
 * The item records have the shape srs_blank() gives them — the shape the
 * browser, the exports and the backups use. Times are milliseconds.
 */

declare(strict_types=1);

const DEFAULT_SETTINGS = [
    'batchSize' => 5,        // lessons per batch
    'lessonTypes' => 'both', // 'both' | 'kanji' | 'vocab'
    'autoplay' => true,      // play vocabulary audio after the reading is answered
];

/** One person's rows: callers add " AND …" or " ORDER BY …", and pass the user id first. */
const STORE_SELECT = 'SELECT item_id, stage,
        academy_ms(learned_at) AS learned_at, academy_ms(next_review) AS next_review,
        academy_ms(last_review_at) AS last_review_at, academy_ms(burned_at) AS burned_at,
        meaning_correct, meaning_incorrect, reading_correct, reading_incorrect,
        meaning_streak, reading_streak, practice_correct, practice_incorrect,
        academy_ms(practice_last) AS practice_last, academy_ms(last_wrong_at) AS last_wrong_at,
        meaning_note, reading_note, synonyms, extra_readings
    FROM srs_progress WHERE user_id = ?';

function store_ms($v): ?int
{
    return $v === null ? null : (int) $v;
}

/** A srs_progress row as the item record the browser knows. */
function store_state_of(array $r): array
{
    return [
        'stage' => (int) $r['stage'],
        'learnedAt' => store_ms($r['learned_at']),
        'nextReview' => store_ms($r['next_review']),
        'lastReviewAt' => store_ms($r['last_review_at']),
        'burnedAt' => store_ms($r['burned_at']),
        'reviews' => [
            'meaning' => ['correct' => (int) $r['meaning_correct'], 'incorrect' => (int) $r['meaning_incorrect']],
            'reading' => ['correct' => (int) $r['reading_correct'], 'incorrect' => (int) $r['reading_incorrect']],
        ],
        'streak' => ['meaning' => (int) $r['meaning_streak'], 'reading' => (int) $r['reading_streak']],
        'practice' => [
            'correct' => (int) $r['practice_correct'],
            'incorrect' => (int) $r['practice_incorrect'],
            'last' => store_ms($r['practice_last']),
        ],
        'lastWrongAt' => store_ms($r['last_wrong_at']),
        'notes' => ['meaning' => $r['meaning_note'], 'reading' => $r['reading_note']],
        'synonyms' => json_decode($r['synonyms'], true),
        'extraReadings' => json_decode($r['extra_readings'], true),
    ];
}

/** Every item this person has touched: id => record. */
function store_items(int $uid): array
{
    $out = [];
    foreach (db_all(STORE_SELECT . ' ORDER BY item_id', [$uid]) as $r) {
        $out[$r['item_id']] = store_state_of($r);
    }
    return $out;
}

/** One item's record, or null if it was never touched. $lock holds the row until the transaction ends. */
function store_item(int $uid, string $id, bool $lock = false): ?array
{
    $r = db_one(STORE_SELECT . ' AND item_id = ?' . ($lock ? ' FOR UPDATE' : ''), [$uid, $id]);
    return $r ? store_state_of($r) : null;
}

/**
 * A record in the shape srs_blank() gives, from whatever an old file or a
 * request held: missing parts take their defaults, and nothing else is kept.
 */
function store_normalize(array $s): array
{
    $b = srs_blank();
    $int = static fn ($v, int $default = 0): int => is_numeric($v) ? (int) $v : $default;
    $ms = static fn ($v): ?int => is_numeric($v) ? (int) $v : null;
    $texts = static fn ($v): array => is_array($v) ? array_values(array_filter($v, 'is_string')) : [];
    $part = static fn (string $a, string $b) => $s[$a][$b] ?? null;
    return [
        'stage' => max(0, min(9, $int($s['stage'] ?? 0))),
        'learnedAt' => $ms($s['learnedAt'] ?? null),
        'nextReview' => $ms($s['nextReview'] ?? null),
        'lastReviewAt' => $ms($s['lastReviewAt'] ?? null),
        'burnedAt' => $ms($s['burnedAt'] ?? null),
        'reviews' => [
            'meaning' => ['correct' => $int($s['reviews']['meaning']['correct'] ?? 0), 'incorrect' => $int($s['reviews']['meaning']['incorrect'] ?? 0)],
            'reading' => ['correct' => $int($s['reviews']['reading']['correct'] ?? 0), 'incorrect' => $int($s['reviews']['reading']['incorrect'] ?? 0)],
        ],
        'streak' => ['meaning' => $int($part('streak', 'meaning')), 'reading' => $int($part('streak', 'reading'))],
        'practice' => [
            'correct' => $int($part('practice', 'correct')),
            'incorrect' => $int($part('practice', 'incorrect')),
            'last' => $ms($part('practice', 'last')),
        ],
        'lastWrongAt' => $ms($s['lastWrongAt'] ?? null),
        'notes' => [
            'meaning' => is_string($part('notes', 'meaning')) ? $part('notes', 'meaning') : $b['notes']['meaning'],
            'reading' => is_string($part('notes', 'reading')) ? $part('notes', 'reading') : $b['notes']['reading'],
        ],
        'synonyms' => $texts($s['synonyms'] ?? []),
        'extraReadings' => $texts($s['extraReadings'] ?? []),
    ];
}

/** Saves one item's record, and marks the progress as changed (an import leaves that to the end). */
function store_put(int $uid, string $id, array $s, bool $touch = true): void
{
    $s = store_normalize($s);
    db_exec(
        'INSERT INTO srs_progress (user_id, item_id, stage, learned_at, next_review, last_review_at, burned_at,
            meaning_correct, meaning_incorrect, reading_correct, reading_incorrect, meaning_streak, reading_streak,
            practice_correct, practice_incorrect, practice_last, last_wrong_at, meaning_note, reading_note,
            synonyms, extra_readings, updated_at)
         VALUES (?, ?, ?, academy_time(?), academy_time(?), academy_time(?), academy_time(?),
            ?, ?, ?, ?, ?, ?, ?, ?, academy_time(?), academy_time(?), ?, ?, ?::jsonb, ?::jsonb, now())
         ON CONFLICT (user_id, item_id) DO UPDATE SET
            stage = EXCLUDED.stage, learned_at = EXCLUDED.learned_at, next_review = EXCLUDED.next_review,
            last_review_at = EXCLUDED.last_review_at, burned_at = EXCLUDED.burned_at,
            meaning_correct = EXCLUDED.meaning_correct, meaning_incorrect = EXCLUDED.meaning_incorrect,
            reading_correct = EXCLUDED.reading_correct, reading_incorrect = EXCLUDED.reading_incorrect,
            meaning_streak = EXCLUDED.meaning_streak, reading_streak = EXCLUDED.reading_streak,
            practice_correct = EXCLUDED.practice_correct, practice_incorrect = EXCLUDED.practice_incorrect,
            practice_last = EXCLUDED.practice_last, last_wrong_at = EXCLUDED.last_wrong_at,
            meaning_note = EXCLUDED.meaning_note, reading_note = EXCLUDED.reading_note,
            synonyms = EXCLUDED.synonyms, extra_readings = EXCLUDED.extra_readings, updated_at = now()',
        [
            $uid, $id, $s['stage'], $s['learnedAt'], $s['nextReview'], $s['lastReviewAt'], $s['burnedAt'],
            $s['reviews']['meaning']['correct'], $s['reviews']['meaning']['incorrect'],
            $s['reviews']['reading']['correct'], $s['reviews']['reading']['incorrect'],
            $s['streak']['meaning'], $s['streak']['reading'],
            $s['practice']['correct'], $s['practice']['incorrect'], $s['practice']['last'], $s['lastWrongAt'],
            $s['notes']['meaning'], $s['notes']['reading'],
            json_text($s['synonyms']), json_text($s['extraReadings']),
        ]
    );
    if ($touch) {
        store_touch($uid);
    }
}

/**
 * The progress changed now (the export's updatedAt). A person's first change
 * makes their settings row, so its created_at says when their progress began.
 */
function store_touch(int $uid): void
{
    db_exec('INSERT INTO srs_settings (user_id) VALUES (?) ON CONFLICT (user_id) DO UPDATE SET updated_at = now()', [$uid]);
}

function store_settings(int $uid): array
{
    $r = db_one('SELECT batch_size, lesson_types, autoplay FROM srs_settings WHERE user_id = ?', [$uid]);
    if (!$r) {
        return DEFAULT_SETTINGS;
    }
    return ['batchSize' => (int) $r['batch_size'], 'lessonTypes' => $r['lesson_types'], 'autoplay' => (bool) $r['autoplay']];
}

function store_save_settings(int $uid, array $settings): void
{
    db_exec(
        'INSERT INTO srs_settings (user_id, batch_size, lesson_types, autoplay) VALUES (?, ?, ?, ?)
         ON CONFLICT (user_id) DO UPDATE SET batch_size = EXCLUDED.batch_size, lesson_types = EXCLUDED.lesson_types,
            autoplay = EXCLUDED.autoplay, updated_at = now()',
        [$uid, $settings['batchSize'], $settings['lessonTypes'], $settings['autoplay']]
    );
}

/** Today's counters: lessons, reviews, practice — for the dashboard. */
function store_bump_daily(int $uid, string $kind, bool $correct, int $t): void
{
    $d = ['lesson' => [1, 0, 0, 0, 0], 'review' => [0, 1, $correct ? 1 : 0, 0, 0], 'practice' => [0, 0, 0, 1, $correct ? 1 : 0]][$kind] ?? null;
    if ($d === null) {
        return;
    }
    db_exec(
        'INSERT INTO srs_daily (user_id, day, lessons, reviews, reviews_correct, practice, practice_correct) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (user_id, day) DO UPDATE SET lessons = srs_daily.lessons + EXCLUDED.lessons, reviews = srs_daily.reviews + EXCLUDED.reviews,
            reviews_correct = srs_daily.reviews_correct + EXCLUDED.reviews_correct, practice = srs_daily.practice + EXCLUDED.practice,
            practice_correct = srs_daily.practice_correct + EXCLUDED.practice_correct',
        array_merge([$uid, local_date($t)], $d)
    );
}

/** The day counts, oldest day first: date => counters. */
function store_daily(int $uid): array
{
    $out = [];
    foreach (db_all("SELECT to_char(day, 'YYYY-MM-DD') AS day, lessons, reviews, reviews_correct, practice, practice_correct
                     FROM srs_daily WHERE user_id = ? ORDER BY day", [$uid]) as $r) {
        $out[$r['day']] = [
            'lessons' => (int) $r['lessons'],
            'reviews' => (int) $r['reviews'],
            'reviewsCorrect' => (int) $r['reviews_correct'],
            'practice' => (int) $r['practice'],
            'practiceCorrect' => (int) $r['practice_correct'],
        ];
    }
    return $out;
}

/** One line of the answer log: { kind, id?, ...details }, at $t. */
function store_log(int $uid, array $event, ?int $t = null): void
{
    $kind = (string) $event['kind'];
    $id = $event['id'] ?? null;
    unset($event['kind'], $event['id'], $event['t']);
    db_exec(
        'INSERT INTO srs_log (user_id, at, kind, item_id, details) VALUES (?, academy_time(?), ?, ?, ?::json)',
        [$uid, $t ?? now_ms(), $kind, $id, json_text($event ?: new stdClass())]
    );
}

/** The whole log, oldest first, as the lines of the old kanji-log.jsonl: { t, kind, id?, ...details }. */
function store_log_all(int $uid): array
{
    $out = [];
    foreach (db_all('SELECT academy_ms(at) AS t, kind, item_id, details FROM srs_log WHERE user_id = ? ORDER BY id', [$uid]) as $r) {
        $e = ['t' => (int) $r['t'], 'kind' => $r['kind']];
        if ($r['item_id'] !== null) {
            $e['id'] = $r['item_id'];
        }
        $out[] = $e + (json_decode($r['details'], true) ?: []);
    }
    return $out;
}

/** This person's kanji progress in the shape of the old progress/kanji.json: the export and the backups use it. */
function store_export(int $uid): array
{
    $meta = db_one('SELECT academy_ms(created_at) AS created_at, academy_ms(updated_at) AS updated_at FROM srs_settings WHERE user_id = ?', [$uid]);
    return [
        'version' => 1,
        'createdAt' => (int) ($meta['created_at'] ?? now_ms()),
        'updatedAt' => (int) ($meta['updated_at'] ?? now_ms()),
        'settings' => store_settings($uid),
        'items' => store_items($uid) ?: new stdClass(),
        'daily' => store_daily($uid) ?: new stdClass(),
    ];
}

/**
 * A full reset of one person's progress: every item and day count goes, the
 * settings and the log stay. Their data is backed up first.
 */
function store_reset(int $uid): void
{
    backup_before_reset($uid);
    db_tx(static function () use ($uid): void {
        db_exec('DELETE FROM srs_progress WHERE user_id = ?', [$uid]);
        db_exec('DELETE FROM srs_daily WHERE user_id = ?', [$uid]);
        db_exec('INSERT INTO srs_settings (user_id) VALUES (?) ON CONFLICT (user_id) DO UPDATE SET created_at = now(), updated_at = now()', [$uid]);
        store_log($uid, ['kind' => 'reset']);
    });
}
