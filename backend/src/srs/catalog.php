<?php
/**
 * The study items for the kanji SRS, built from the data the exam already uses:
 *
 *   kanji  — the 317 kanji of the course's kanji lists (々 aside: it has no
 *            reading of its own to ask for)
 *   vocab  — every word, from the vocabulary lists and the example compounds
 *            of the kanji lists, that is written only with those kanji (plus
 *            kana)
 *
 * As in WaniKani, a vocabulary item becomes available once all of its kanji have
 * been learned, and its "lesson" is the course lesson of its latest kanji — so
 * 大学 sits in Lesson 6, where both 大 and 学 are taught, not Lesson 1 where the
 * word first appears.
 *
 * Built when the content is synced into the database (src/content.php); the
 * server reads the result from the srs_items table.
 */

declare(strict_types=1);

function cat_is_kanji(string $c): bool
{
    return (bool) preg_match('/[一-龯]/u', $c);
}

function cat_is_kana(string $c): bool
{
    return (bool) preg_match('/[぀-ヿー々]/u', $c);
}

/** Parenthetical optional parts: 弟(さん), しずか(な), ざんねん(ですね). */
const OPTIONAL_PAREN = '/\((?:さん|な|ですね|でした|なさい|ございます)\)/u';

function cat_split(?string $s, string $re): array
{
    $out = [];
    foreach (preg_split($re, (string) $s) as $x) {
        $x = js_trim($x);
        if ($x !== '') {
            $out[] = $x;
        }
    }
    return $out;
}

/** "to eat [ru]" -> "to eat"; drops the list's grammatical annotations. */
function cat_clean_gloss(?string $s): string
{
    return js_trim(preg_replace('/\s+/u', ' ', preg_replace('/\s*\[(u|ru|irr\.)\]/u', '', (string) $s)));
}

/**
 * @param array $content ['kanji' => data/kanji.json, 'vocab' => data/vocab.json, 'audio' => data/audio.json]
 * @return array{items: list<array>, lessons: list<int>}
 */
function catalog_build(array $content): array
{
    $kanjiData = $content['kanji'];
    $vocabData = $content['vocab'];
    $audio = $content['audio'];

    /* ------------------------------------------------------------- kanji */

    $kanjiByChar = [];
    $items = [];

    foreach ($kanjiData as $k) {
        if (!$k['on'] && !$k['kun']) {
            continue; // 々
        }
        $kanjiByChar[$k['kanji']] = $k;
    }

    foreach ($kanjiByChar as $k) {
        // Readings to accept: every on/kun reading, plus the dictionary form of
        // words that are just this kanji and okurigana (食べる → たべる).
        $accept = array_merge($k['on'], $k['kun']);
        foreach ($k['compounds'] as $c) {
            $w = chars(explode('/', $c['word'])[0]);
            if (($w[0] ?? null) === $k['kanji'] && !array_filter(array_slice($w, 1), static fn (string $ch): bool => !preg_match('/[぀-ゟ]/u', $ch))) {
                foreach (explode('/', $c['reading']) as $r) {
                    $accept[] = js_trim($r);
                }
            }
        }
        $items[] = [
            'id' => 'k:' . $k['kanji'],
            'type' => 'kanji',
            'chars' => $k['kanji'],
            'no' => $k['no'],
            'lesson' => $k['lesson'],
            'courseLesson' => $k['lesson'],
            'meanings' => cat_split($k['meaning'], '/;/u'),
            'on' => $k['on'],
            'kun' => $k['kun'],
            'readings' => unique_list($accept),
            'audio' => null,
        ];
    }

    /* ------------------------------------------------------------- vocab */

    $vocab = []; // chars -> item under construction

    /** Word must be the course's kanji + kana only, with at least one kanji. */
    $usable = static function (string $word) use ($kanjiByChar): bool {
        $cs = chars($word);
        if (!array_filter($cs, 'cat_is_kanji')) {
            return false;
        }
        foreach ($cs as $c) {
            if (cat_is_kanji($c) ? !isset($kanjiByChar[$c]) : !cat_is_kana($c)) {
                return false;
            }
        }
        return true;
    };

    $addVocab = static function (string $word, array $readings, array $meanings, int $courseLesson, string $source, array $extra = []) use (&$vocab, $usable): void {
        if (!$usable($word) || !$readings || !$meanings) {
            return;
        }
        if (!isset($vocab[$word])) {
            $vocab[$word] = [
                'id' => 'v:' . $word,
                'type' => 'vocab',
                'chars' => $word,
                'readings' => [],
                'meanings' => [],
                'courseLesson' => $courseLesson,
                'sources' => [],
            ];
        }
        $v = &$vocab[$word];
        foreach ($readings as $r) {
            if (!in_array($r, $v['readings'], true)) {
                $v['readings'][] = $r;
            }
        }
        foreach ($meanings as $m) {
            $lower = mb_strtolower($m);
            if (!array_filter($v['meanings'], static fn (string $x): bool => mb_strtolower($x) === $lower)) {
                $v['meanings'][] = $m;
            }
        }
        $v['courseLesson'] = min($v['courseLesson'], $courseLesson);
        if (!in_array($source, $v['sources'], true)) {
            $v['sources'][] = $source;
        }
        foreach ($extra as $key => $val) {
            if (js_truthy($val) && !js_truthy($v[$key] ?? null)) {
                $v[$key] = $val;
            }
        }
        unset($v);
    };

    // (a) The vocabulary lists.
    foreach ($vocabData as $e) {
        if (!js_truthy($e['kanji'] ?? null)) {
            continue;
        }
        $kanji = $e['kanji'];
        // "なにも + negative" — the note belongs to the meaning, not the reading.
        $kana = preg_replace('/\s*\+\s*negative/iu', '', $e['kana'], 1);
        if (preg_match('/[〜～A-Za-z○]/u', $kanji)) {
            continue;
        }
        // "言う(文句を)" is a phrase marker, not an optional suffix — skip those.
        preg_match_all('/\(([^)]*)\)/u', $kanji, $parens);
        if (array_filter($parens[0], static fn (string $p): bool => (bool) preg_match('/[一-龯をにが]/u', $p))) {
            continue;
        }
        $kanji = preg_replace(OPTIONAL_PAREN, '', $kanji);
        $kana = preg_replace(OPTIONAL_PAREN, '', $kana);
        if (preg_match('/[()]/u', $kanji)) {
            continue;
        }

        $readings = array_map(static fn (string $r): string => preg_replace('/\s+/u', '', $r), cat_split($kana, '/\//u'));
        foreach (cat_split($kanji, '/\//u') as $word) {
            $addVocab(
                $word,
                $readings,
                cat_split(cat_clean_gloss(js_truthy($e['gloss'] ?? null) ? $e['gloss'] : $e['english']), '/;/u'),
                $e['lesson'],
                'vocab-list',
                ['verbClass' => $e['verbClass'] ?? null, 'adjClass' => $e['adjClass'] ?? null, 'pos' => $e['pos'] ?? null]
            );
        }
    }

    // (b) The example compounds printed with each kanji of the kanji lists.
    foreach ($kanjiByChar as $k) {
        foreach ($k['compounds'] as $c) {
            if (preg_match('/[〜～]/u', $c['word']) || preg_match('/^Mr\.\/Ms\./u', $c['english'])) {
                continue;
            }
            $readings = cat_split($c['reading'], '/\//u');
            foreach (cat_split($c['word'], '/\//u') as $word) {
                $rs = $readings;
                // 親切な(しんせつな) is listed with its な; the vocabulary list has 親切.
                $last = array_slice(chars($word), -2);
                if (
                    str_ends_with($word, 'な')
                    && count($last) === 2
                    && cat_is_kanji($last[0])
                    && !array_filter($rs, static fn (string $r): bool => !str_ends_with($r, 'な'))
                ) {
                    $word = mb_substr($word, 0, -1);
                    $rs = array_map(static fn (string $r): string => mb_substr($r, 0, -1), $rs);
                }
                $addVocab($word, $rs, cat_split($c['english'], '/[;,]/u'), $k['lesson'], 'kanji-list');
            }
        }
    }

    // 入口 / 入り口 are one word spelt two ways — same kanji, same reading. Keep
    // the spelling the vocabulary list uses and drop the other.
    $variantKey = static function (array $v): string {
        $readings = $v['readings'];
        sort($readings, SORT_STRING);
        return implode('', unique_list(array_values(array_filter(chars($v['chars']), 'cat_is_kanji')))) . '|' . implode('/', $readings);
    };
    $order = array_keys($vocab);
    $fromList = static fn (string $w): int => in_array('vocab-list', $vocab[$w]['sources'], true) ? 1 : 0;
    usort($order, static fn (string $a, string $b): int => $fromList($b) - $fromList($a));
    $seenVariant = [];
    foreach ($order as $word) {
        $word = (string) $word;
        $key = $variantKey($vocab[$word]);
        if (!isset($seenVariant[$key])) {
            $seenVariant[$key] = $word;
            continue;
        }
        $keep = $seenVariant[$key];
        foreach ($vocab[$word]['meanings'] as $m) {
            if (!in_array($m, $vocab[$keep]['meanings'], true)) {
                $vocab[$keep]['meanings'][] = $m;
            }
        }
        $vocab[$keep]['spellings'][] = $word;
        unset($vocab[$word]);
    }

    // Keigo verbs are glossed "honorific expression for くれる", which gives you
    // nothing to type. Resolve each to the plain verb's meaning, so 下さる accepts
    // "to give (me)" — the gloss stays, the plain meaning is added after it.
    $byLesson = $vocabData;
    usort($byLesson, static fn (array $a, array $b): int => $a['lesson'] <=> $b['lesson']);
    $plainByKana = [];
    foreach ($byLesson as $e) {
        $k = js_trim(preg_replace('/\(.*?\)/u', '', $e['kana']));
        if (!array_key_exists($k, $plainByKana)) {
            $plainByKana[$k] = cat_clean_gloss(js_truthy($e['gloss'] ?? null) ? $e['gloss'] : $e['english']);
        }
    }
    foreach ($vocab as $word => $v) {
        $add = [];
        foreach ($v['meanings'] as $m) {
            if (!preg_match('/^(honorific|humble|extra-modest) expression for (.+)$/iuD', $m, $km)) {
                continue;
            }
            // "and" as a word, as JavaScript's ASCII \b saw it (PHP's \b under /u is Unicode-aware)
            foreach (preg_split('/,|(?<![A-Za-z0-9_])and(?![A-Za-z0-9_])/u', $km[2]) as $target) {
                $target = js_trim($target);
                $plain = $target === '' ? null : ($plainByKana[$target] ?? null);
                if (js_truthy($plain)) {
                    $add[] = cat_split($plain, '/;/u')[0] . ' (' . mb_strtolower($km[1]) . ')';
                }
            }
        }
        foreach ($add as $a) {
            if (!in_array($a, $vocab[$word]['meanings'], true)) {
                $vocab[$word]['meanings'][] = $a;
            }
        }
    }

    foreach ($vocab as $v) {
        $v['kanji'] = unique_list(array_values(array_filter(chars($v['chars']), 'cat_is_kanji')));
        $v['lesson'] = max(array_map(static fn (string $c): int => $kanjiByChar[$c]['lesson'], $v['kanji']));
        // one clip per voice, spoken with the first reading
        $v['audio'] = speech_clips_for(speech_spoken($v['readings'][0], $v['chars']), $audio);
        $items[] = $v;
    }

    /* ------------------------------------------------- examples & order */

    $vocabItems = array_values(array_filter($items, static fn (array $it): bool => $it['type'] === 'vocab'));
    foreach ($items as &$it) {
        if ($it['type'] !== 'kanji') {
            continue;
        }
        $ex = array_values(array_filter($vocabItems, static fn (array $v): bool => str_contains($v['chars'], $it['chars'])));
        usort($ex, static fn (array $a, array $b): int => ($b['audio'] ? 1 : 0) - ($a['audio'] ? 1 : 0)
            ?: $a['lesson'] - $b['lesson']
            ?: js_len($a['chars']) - js_len($b['chars']));
        $it['examples'] = array_column($ex, 'id');
    }
    unset($it);

    // Course order: lesson by lesson, the kanji first (in list order), then the
    // vocabulary those kanji unlock.
    $collator = new Collator('ja');
    usort($items, static function (array $a, array $b) use ($collator): int {
        return $a['lesson'] - $b['lesson']
            ?: ($a['type'] === 'kanji' ? 0 : 1) - ($b['type'] === 'kanji' ? 0 : 1)
            ?: ($a['type'] === 'kanji'
                ? $a['no'] - $b['no']
                : ($a['courseLesson'] - $b['courseLesson']
                    ?: js_len($a['chars']) - js_len($b['chars'])
                    ?: (int) $collator->compare($a['chars'], $b['chars'])));
    });
    foreach ($items as $i => &$it) {
        $it['order'] = $i;
    }
    unset($it);

    $lessons = array_values(array_unique(array_column($items, 'lesson')));
    sort($lessons);

    return ['items' => $items, 'lessons' => $lessons];
}
