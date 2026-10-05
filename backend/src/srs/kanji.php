<?php
/**
 * /api/kanji — the kanji SRS.
 *
 *   GET  /catalog        every study item (the same for everybody)
 *   GET  /progress       your SRS state + dashboard summary
 *   GET  /summary        just the summary (for the Academy home page)
 *   POST /learn          { id }                              lesson quiz passed
 *   POST /review         { id, meaningWrong, readingWrong }  scheduled review
 *   POST /practice       { id, firstTryCorrect, wrong }      practice (no SRS change)
 *   POST /item           { id, notes?, addSynonym?, removeSynonym?,
 *                          addReading?, removeReading? }
 *   POST /settings       { batchSize?, lessonTypes?, autoplay? }
 *   POST /reset-item     { id }
 *   POST /reset          { confirm: "RESET" }
 *
 * Each handler takes the user id of the person asking (the API's
 * learner_middleware() gets it: a signed-in person's from src/auth.php, a
 * visitor's - negative - from src/visitors.php, or 0 for nobody yet, which
 * matches no row: an empty learner) and returns [status, body]; its route in
 * backend/api/routes/kanji.php sends it. A save by nobody never runs with 0:
 * the middleware makes a visitor for it first, and the resets answer nobody
 * at once.
 */

declare(strict_types=1);

/** The catalog, in course order, with what the summary and the lesson checks need. */
function kanji_items(): array
{
    return array_map(static fn (array $r): array => [
        'id' => $r['id'],
        'type' => $r['type'],
        'lesson' => (int) $r['lesson'],
        'kanji' => json_decode($r['kanji'], true),
    ], db_all('SELECT id, type, lesson, kanji FROM srs_items ORDER BY ord'));
}

/** The catalog item a request names, or null. */
function kanji_item(array $body): ?array
{
    $id = js_truthy($body['id'] ?? null) ? js_string($body['id']) : '';
    $r = db_one('SELECT id, type, lesson, kanji FROM srs_items WHERE id = ?', [$id]);
    return $r ? ['id' => $r['id'], 'type' => $r['type'], 'lesson' => (int) $r['lesson'], 'kanji' => json_decode($r['kanji'], true)] : null;
}

/** Kanji are always available; vocabulary once all of its kanji are learned. */
function kanji_is_available(array $item, array $progress): bool
{
    if ($item['type'] === 'kanji') {
        return true;
    }
    foreach ($item['kanji'] as $c) {
        if (!srs_is_learned($progress["k:$c"] ?? null)) {
            return false;
        }
    }
    return true;
}

/** The dashboard: what is learned and due, the forecast, and the day counts. */
function kanji_summarize(int $uid, ?int $now = null): array
{
    $now ??= now_ms();
    $items = kanji_items();
    $progress = store_items($uid);

    // with each group's name (WaniKani's, never translated): the home page draws them without the catalog
    $groups = [];
    foreach (SRS_GROUPS as $g) {
        $groups[$g['id']] = ['name' => $g['name'], 'total' => 0, 'kanji' => 0, 'vocab' => 0];
    }
    $lessonsAvailable = 0;
    $reviewsDue = 0;
    $learned = 0;
    $nextReviewAt = null;
    $forecastHours = array_fill(0, 24, 0);
    $forecastDays = array_fill(0, 7, 0);
    $byLesson = [];
    $startOfToday = local_wall_ms(local_time($now)->format('Y-m-d 00:00:00'));

    foreach ($items as $it) {
        $st = $progress[$it['id']] ?? null;
        $byLesson[$it['lesson']] ??= [
            'kanji' => ['total' => 0, 'learned' => 0, 'guru' => 0],
            'vocab' => ['total' => 0, 'learned' => 0, 'guru' => 0],
        ];
        $L = &$byLesson[$it['lesson']][$it['type']];
        $L['total'] += 1;

        if (!srs_is_learned($st)) {
            if (kanji_is_available($it, $progress)) {
                $lessonsAvailable += 1;
            }
            unset($L);
            continue;
        }
        $learned += 1;
        $L['learned'] += 1;
        if ($st['stage'] >= 5) {
            $L['guru'] += 1;
        }
        unset($L);

        $g = SRS_STAGES[$st['stage']]['group'];
        $groups[$g]['total'] += 1;
        $groups[$g][$it['type']] += 1;

        if (srs_is_due($st, $now)) {
            $reviewsDue += 1;
        } elseif ($st['nextReview']) {
            if ($nextReviewAt === null || $st['nextReview'] < $nextReviewAt) {
                $nextReviewAt = $st['nextReview'];
            }
            $h = (int) floor(($st['nextReview'] - $now) / HOUR_MS);
            if ($h >= 0 && $h < 24) {
                $forecastHours[$h] += 1;
            }
            $d = (int) floor(($st['nextReview'] - $startOfToday) / (24 * HOUR_MS));
            if ($d >= 0 && $d < 7) {
                $forecastDays[$d] += 1;
            }
        }
    }

    // Each forecast day by the person's date it stands for: day i is the 24 hours from startOfToday + i * 24 h,
    // and its middle is on that date even next to a change of summer time (a 23- or 25-hour day moves the
    // start an hour, never the middle). The page names the days from these, never from steps of its own.
    $forecastDates = [];
    for ($i = 0; $i < 7; $i++) {
        $forecastDates[] = local_date($startOfToday + $i * 24 * HOUR_MS + 12 * HOUR_MS);
    }

    $daily = store_daily($uid);
    $history = [];
    foreach (array_slice($daily, -14, null, true) as $date => $counts) {
        $history[] = ['date' => (string) $date] + $counts;
    }

    return [
        'now' => $now,
        'total' => count($items),
        'learned' => $learned,
        'lessonsAvailable' => $lessonsAvailable,
        'reviewsDue' => $reviewsDue,
        'nextReviewAt' => $nextReviewAt,
        'groups' => $groups,
        'forecastHours' => $forecastHours,
        'forecastDays' => $forecastDays,
        'forecastDates' => $forecastDates,
        'byLesson' => (object) $byLesson,
        'today' => $daily[local_date($now)] ?? ['lessons' => 0, 'reviews' => 0, 'reviewsCorrect' => 0, 'practice' => 0, 'practiceCorrect' => 0],
        'history' => $history,
    ];
}

/** 0–50 wrong answers: Math.max(0, Math.min(50, Math.floor(Number(v) || 0))). */
function kanji_count($v): int
{
    $n = js_number($v);
    return is_float($n) && is_nan($n) ? 0 : (int) max(0, min(50, floor($n)));
}

/** A learner's text: String(v).slice(0, n), '' for null. */
function kanji_clip($v, int $n): string
{
    return str_clip($v === null ? '' : js_string($v), $n);
}

/* ---------------------------------------------------------------- reads */

function kanji_catalog_json(): string
{
    $items = db_value("SELECT coalesce(json_agg(data ORDER BY ord), '[]') FROM srs_items");
    $lessons = db_value('SELECT lessons FROM content_state') ?? '[]';
    return '{"items":' . $items . ',"lessons":' . $lessons . ',"stages":' . json_text(SRS_STAGES) . ',"groups":' . json_text(SRS_GROUPS) . '}';
}

function kanji_progress(int $uid): array
{
    return db_tx(static fn (): array => [
        'settings' => store_settings($uid),
        'items' => store_items($uid) ?: new stdClass(),
        'summary' => kanji_summarize($uid),
    ]);
}

/* --------------------------------------------------------------- writes */

function kanji_learn(int $uid, array $b): array
{
    $it = kanji_item($b);
    if (!$it) {
        return [404, ['error' => 'No such item.', 'code' => 'no_such_item']];
    }
    return db_tx(static function () use ($uid, $it): array {
        users_hold($uid); // an import or a delete of their data first, if one is under way
        $st = store_item($uid, $it['id'], true);
        if (srs_is_learned($st)) {
            return [409, ['error' => 'Already learned.', 'code' => 'already_learned', 'state' => $st]];
        }
        if (!kanji_is_available($it, kanji_states($uid, array_map(static fn (string $c): string => "k:$c", $it['kanji'])))) {
            return [409, ['error' => 'Learn its kanji first.', 'code' => 'kanji_first']];
        }
        $now = now_ms();
        $state = srs_learn($st, $now);
        store_put($uid, $it['id'], $state);
        store_bump_daily($uid, 'lesson', true, $now);
        store_log($uid, ['kind' => 'lesson', 'id' => $it['id']], $now);
        return [200, ['state' => $state]];
    });
}

/** The records of some items (for the availability check), id => record. */
function kanji_states(int $uid, array $ids): array
{
    if (!$ids) {
        return [];
    }
    $out = [];
    foreach (db_all(STORE_SELECT . ' AND item_id IN (SELECT json_array_elements_text(?::json))', [$uid, json_text($ids)]) as $r) {
        $out[$r['item_id']] = store_state_of($r);
    }
    return $out;
}

function kanji_review(int $uid, array $b): array
{
    $it = kanji_item($b);
    if (!$it) {
        return [404, ['error' => 'No such item.', 'code' => 'no_such_item']];
    }
    return db_tx(static function () use ($uid, $it, $b): array {
        users_hold($uid);
        $now = now_ms();
        $st = store_item($uid, $it['id'], true);
        // A minute's grace for clock edges; anything else means a double submit.
        if (!srs_is_learned($st) || !srs_is_due($st, $now + 60 * 1000)) {
            return [409, ['error' => 'That item is not due for review.', 'code' => 'not_due'] + ($st ? ['state' => $st] : [])];
        }
        $meaningWrong = kanji_count($b['meaningWrong'] ?? null);
        $readingWrong = kanji_count($b['readingWrong'] ?? null);
        $r = srs_review($st, ['meaningWrong' => $meaningWrong, 'readingWrong' => $readingWrong], $now);
        store_put($uid, $it['id'], $r['state']);
        store_bump_daily($uid, 'review', $meaningWrong + $readingWrong === 0, $now);
        store_log($uid, ['kind' => 'review', 'id' => $it['id'], 'meaningWrong' => $meaningWrong, 'readingWrong' => $readingWrong, 'from' => $r['from'], 'to' => $r['to']], $now);
        return [200, ['state' => $r['state'], 'from' => $r['from'], 'to' => $r['to']]];
    });
}

function kanji_practice(int $uid, array $b): array
{
    $it = kanji_item($b);
    if (!$it) {
        return [404, ['error' => 'No such item.', 'code' => 'no_such_item']];
    }
    return db_tx(static function () use ($uid, $it, $b): array {
        users_hold($uid);
        $st = store_item($uid, $it['id'], true);
        if (!srs_is_learned($st)) {
            return [409, ['error' => 'Only learned items can be practised.', 'code' => 'not_learned']];
        }
        $now = now_ms();
        $firstTryCorrect = js_truthy($b['firstTryCorrect'] ?? null);
        $wrong = kanji_count($b['wrong'] ?? null);
        $state = srs_practice($st, ['firstTryCorrect' => $firstTryCorrect, 'wrong' => $wrong], $now);
        store_put($uid, $it['id'], $state);
        store_bump_daily($uid, 'practice', $firstTryCorrect, $now);
        store_log($uid, ['kind' => 'practice', 'id' => $it['id'], 'firstTryCorrect' => $firstTryCorrect, 'wrong' => $wrong], $now);
        return [200, ['state' => $state]];
    });
}

function kanji_edit_item(int $uid, array $b): array
{
    $it = kanji_item($b);
    if (!$it) {
        return [404, ['error' => 'No such item.', 'code' => 'no_such_item']];
    }
    return db_tx(static function () use ($uid, $it, $b): array {
        users_hold($uid);
        $st = array_merge(srs_blank(), store_item($uid, $it['id'], true) ?? []);

        if (is_array($b['notes'] ?? null)) {
            foreach (['meaning', 'reading'] as $part) {
                if (array_key_exists($part, $b['notes'])) {
                    $st['notes'][$part] = kanji_clip($b['notes'][$part], 2000);
                }
            }
        }
        $addTo = static function (array $list, $v, int $n): array {
            $x = js_trim(kanji_clip($v, $n));
            if ($x !== '' && !in_array($x, $list, true)) {
                $list[] = $x;
            }
            return $list;
        };
        $remove = static fn (array $list, $v): array => array_values(array_filter($list, static fn ($x): bool => $x !== $v));
        if (js_truthy($b['addSynonym'] ?? null)) {
            $st['synonyms'] = $addTo($st['synonyms'], $b['addSynonym'], 80);
        }
        if (js_truthy($b['removeSynonym'] ?? null)) {
            $st['synonyms'] = $remove($st['synonyms'], $b['removeSynonym']);
        }
        if (js_truthy($b['addReading'] ?? null)) {
            $st['extraReadings'] = $addTo($st['extraReadings'], $b['addReading'], 40);
        }
        if (js_truthy($b['removeReading'] ?? null)) {
            $st['extraReadings'] = $remove($st['extraReadings'], $b['removeReading']);
        }

        store_put($uid, $it['id'], $st);
        return [200, ['state' => $st]];
    });
}

function kanji_settings(int $uid, array $b): array
{
    return db_tx(static function () use ($uid, $b): array {
        users_hold($uid);
        $s = store_settings($uid);
        if (($b['batchSize'] ?? null) !== null) {
            $n = js_number($b['batchSize']);
            $s['batchSize'] = (is_float($n) && is_nan($n)) || !$n ? 5 : (int) max(1, min(20, floor($n)));
        }
        if (in_array($b['lessonTypes'] ?? null, ['both', 'kanji', 'vocab'], true)) {
            $s['lessonTypes'] = $b['lessonTypes'];
        }
        if (($b['autoplay'] ?? null) !== null) {
            $s['autoplay'] = js_truthy($b['autoplay']);
        }
        store_save_settings($uid, $s);
        return [200, ['settings' => $s]];
    });
}

function kanji_reset_item(int $uid, array $b): array
{
    $it = kanji_item($b);
    if (!$it) {
        return [404, ['error' => 'No such item.', 'code' => 'no_such_item']];
    }
    if ($uid === 0) {
        return [200, ['state' => srs_blank()]]; // nobody yet: nothing to reset, and no visitor made for it
    }
    return db_tx(static function () use ($uid, $it): array {
        users_hold($uid);
        $old = store_item($uid, $it['id'], true);
        // Keep what the learner wrote; forget the schedule.
        $state = array_merge(srs_blank(), [
            'notes' => $old['notes'] ?? srs_blank()['notes'],
            'synonyms' => $old['synonyms'] ?? [],
            'extraReadings' => $old['extraReadings'] ?? [],
        ]);
        store_put($uid, $it['id'], $state);
        store_log($uid, ['kind' => 'reset-item', 'id' => $it['id']]);
        return [200, ['state' => $state]];
    });
}

function kanji_reset(int $uid, array $b): array
{
    if (($b['confirm'] ?? null) !== 'RESET') {
        return [400, ['error' => 'Send { confirm: "RESET" } to erase all kanji progress.']];
    }
    if ($uid === 0) {
        return [200, ['ok' => true]]; // nobody yet: nothing to reset, and no visitor made for it
    }
    store_reset($uid);
    return [200, ['ok' => true]];
}
