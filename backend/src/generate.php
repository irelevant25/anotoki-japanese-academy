<?php
/**
 * Builds the multiple-choice question bank from the course data in data/, and
 * lays out exam papers from it.
 *
 * Everything here is generated deterministically, so the same seed always
 * produces the same paper — which is what makes two attempts comparable. The
 * bank is built when the content is synced (src/content.php) and kept in the
 * exam_questions table; a paper is laid out from those rows, in bank order.
 */

declare(strict_types=1);

/* ------------------------------------------------------------ seeded random */

/** mulberry32, seeded from the string's UTF-16 code units — as the first (JavaScript) version did. */
function exam_rng(string $seed): Closure
{
    $s = 0;
    foreach (utf16_units($seed) as $unit) {
        $s = ($s * 31 + $unit) % 4294967296;
    }
    $s = $s ?: 1;
    return static function () use (&$s): float {
        $s = int32($s);
        $s = int32($s + 0x6D2B79F5);
        $t = imul($s ^ urshift($s, 15), 1 | $s);
        $t = int32($t + imul($t ^ urshift($t, 7), 61 | $t)) ^ $t;
        return urshift($t ^ urshift($t, 14), 0) / 4294967296;
    };
}

function exam_shuffle(array $arr, Closure $rng): array
{
    $a = array_values($arr);
    for ($i = count($a) - 1; $i > 0; $i--) {
        $j = (int) floor($rng() * ($i + 1));
        [$a[$i], $a[$j]] = [$a[$j], $a[$i]];
    }
    return $a;
}

function exam_pick(array $arr, int $n, Closure $rng): array
{
    return array_slice(exam_shuffle($arr, $rng), 0, $n);
}

/* --------------------------------------------------------------- helpers */

function exam_display_word(array $v): string
{
    return js_truthy($v['kanji'] ?? null) ? $v['kanji'] : $v['kana'];
}

function exam_norm($s): string
{
    return preg_replace('/\s+/u', ' ', mb_strtolower(js_trim(js_string($s))));
}

/** Drop distractors equal to the answer or to each other; pad if short. */
function exam_options($correct, array $candidates, Closure $rng, ?array $pool = null, int $count = 4): ?array
{
    $out = [];
    $seen = [exam_norm($correct) => true];
    foreach (exam_shuffle($candidates, $rng) as $c) {
        if (count($out) >= $count - 1) {
            break;
        }
        if (!js_truthy($c)) {
            continue;
        }
        $k = exam_norm($c);
        if (isset($seen[$k])) {
            continue;
        }
        $seen[$k] = true;
        $out[] = $c;
    }
    if (count($out) < $count - 1 && $pool !== null) {
        foreach (exam_shuffle($pool, $rng) as $c) {
            if (count($out) >= $count - 1) {
                break;
            }
            $k = exam_norm($c);
            if (isset($seen[$k])) {
                continue;
            }
            $seen[$k] = true;
            $out[] = $c;
        }
    }
    if (count($out) < $count - 1) {
        return null; // not enough distinct distractors
    }
    return ['correct' => $correct, 'distractors' => $out];
}

/**
 * Two glosses mean the same when they share a sense ("sake; alcohol" and "sake;
 * alcoholic drink"), ignoring (polite) and punctuation. Such a word is never a
 * distractor, or the question would have two right answers.
 */
function exam_senses(string $gloss): array
{
    static $cache = [];
    return $cache[$gloss] ??= array_map(
        static fn (string $s): string => js_trim(preg_replace('/[.!?]/u', '', preg_replace('/\((?:polite|casual|formal)\)/u', '', $s))),
        explode(';', mb_strtolower($gloss))
    );
}

function exam_same_meaning(string $a, string $b): bool
{
    $sb = exam_senses($b);
    foreach (exam_senses($a) as $s) {
        if (in_array($s, $sb, true)) {
            return true;
        }
    }
    return false;
}

/**
 * Part 1 is Greetings + Lessons 1–12, Part 2 is Lessons 13–23, so the lesson
 * number alone says which part an item belongs to.
 */
const BOOKS = [
    ['id' => 1, 'name' => 'Part 1', 'lessons' => [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]],
    ['id' => 2, 'name' => 'Part 2', 'lessons' => [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]],
];

function exam_book_of($lesson): int
{
    return js_number($lesson) <= 12 ? 1 : 2;
}

/** A question of the bank: its id and part first, as the bank has always listed them. */
function exam_q(int &$nextId, array $obj): array
{
    return ['id' => 'q' . (++$nextId), 'book' => exam_book_of($obj['lesson'])] + $obj;
}

/* ----------------------------------------------------- 1/2. vocabulary */

function exam_vocab_questions(array $vocab, int &$nextId): array
{
    $out = [];
    $testable = array_values(array_filter($vocab, static fn (array $v): bool => !$v['extra'] && js_len($v['gloss']) <= 60));

    // Words whose English gloss is shared with another word cannot be used for
    // English -> Japanese, because more than one option would be correct.
    $glossCount = [];
    $byLessonPos = [];
    $byPos = [];
    foreach ($testable as $i => $v) {
        $k = exam_norm($v['gloss']);
        $glossCount[$k] = ($glossCount[$k] ?? 0) + 1;
        $byLessonPos[$v['lesson'] . '|' . $v['pos']][] = $i;
        $byPos[$v['pos']][] = $i;
    }

    $rng = exam_rng('vocab');
    $others = static function (array $list, int $self) use ($testable): array {
        $out = [];
        foreach ($list as $i) {
            if ($i !== $self) {
                $out[] = $testable[$i];
            }
        }
        return $out;
    };

    foreach ($testable as $i => $v) {
        $sameLesson = $others($byLessonPos[$v['lesson'] . '|' . $v['pos']] ?? [], $i);
        $samePos = $others($byPos[$v['pos']] ?? [], $i);

        // Japanese -> English
        $differs = static fn (array $x): bool => !exam_same_meaning($x['gloss'], $v['gloss']);
        $o = exam_options(
            $v['gloss'],
            array_column(array_filter($sameLesson, $differs), 'gloss'),
            $rng,
            array_column(array_filter($samePos, $differs), 'gloss')
        );
        if ($o) {
            $word = exam_display_word($v);
            $out[] = exam_q($nextId, [
                'section' => 'vocab-jp-en',
                'lesson' => $v['lesson'],
                'question' => "What does 「{$word}」 mean?",
                'reading' => js_truthy($v['kanji']) ? $v['kana'] : null,
            ] + $o + [
                'explain' => "{$word}（{$v['kana']}）= {$v['gloss']}",
                'ref' => $v['tag'],
            ]);
        }

        // English -> Japanese
        if ($glossCount[exam_norm($v['gloss'])] === 1) {
            $o = exam_options(
                exam_display_word($v),
                array_map('exam_display_word', $sameLesson),
                $rng,
                array_map('exam_display_word', $samePos)
            );
            if ($o) {
                $out[] = exam_q($nextId, [
                    'section' => 'vocab-en-jp',
                    'lesson' => $v['lesson'],
                    'question' => "Which word means \"{$v['gloss']}\"?",
                ] + $o + [
                    'explain' => "{$v['gloss']} = " . exam_display_word($v) . "（{$v['kana']}）",
                    'ref' => $v['tag'],
                ]);
            }
        }
    }
    return $out;
}

/* ------------------------------------------------------------ 3/4/5. kanji */

/**
 * Build wrong readings for a compound out of the component kanji's own
 * readings, keeping any kana in the word exactly where it is — so 山川さん
 * yields さんかわさん, not やまかわ, and 食べる yields しょくべる.
 */
function exam_fake_readings(string $word, string $correctReading, array $kanjiByChar): array
{
    $cs = chars($word);
    if (!array_filter($cs, static fn (string $c): bool => isset($kanjiByChar[$c]))) {
        return [];
    }
    $per = [];
    foreach ($cs as $c) {
        $k = $kanjiByChar[$c] ?? null;
        $per[] = $k === null ? [$c] : array_values(array_filter(unique_list(array_merge($k['on'], $k['kun'])), 'js_truthy'));
    }
    $out = [];
    // Cartesian product, capped — these are the "read every kanji with its other
    // reading" mistakes, which is exactly what the exercises test.
    $build = static function (int $i, string $acc) use (&$build, &$out, $per, $correctReading): void {
        if (count($out) > 24) {
            return;
        }
        if ($i === count($per)) {
            if ($acc !== '' && $acc !== $correctReading && js_len($acc) > 1 && !in_array($acc, $out, true)) {
                $out[] = $acc;
            }
            return;
        }
        foreach ($per[$i] as $r) {
            $build($i + 1, $acc . $r);
        }
    };
    $build(0, '');
    return $out;
}

function exam_kanji_questions(array $kanjiList, int &$nextId): array
{
    $rng = exam_rng('kanji');
    $out = [];
    $kanjiByChar = array_column($kanjiList, null, 'kanji');

    // 3. reading of a compound
    foreach ($kanjiList as $ki => $k) {
        $otherReadings = [];
        foreach ($kanjiList as $xi => $x) {
            if ($x['lesson'] === $k['lesson'] && $xi !== $ki) {
                foreach ($x['compounds'] as $cc) {
                    $otherReadings[] = $cc['reading'];
                }
            }
        }
        foreach ($k['compounds'] as $c) {
            if (!preg_match('/[一-龯]/u', $c['word'])) {
                continue;
            }
            $cs = chars($c['word']);
            // A bare kanji has several legitimate readings (一 = いち and ひと), so a
            // single-character "how do you read this" item has no one right answer.
            if (count($cs) < 2) {
                continue;
            }
            // Every kanji must be one we hold readings for; otherwise the generated
            // distractors keep that character literally (雨期 -> "あめ期") and the
            // all-kana option gives the answer away.
            if (array_filter($cs, static fn (string $ch): bool => preg_match('/[一-龯]/u', $ch) && !isset($kanjiByChar[$ch]))) {
                continue;
            }
            $fakes = array_values(array_filter(
                exam_fake_readings($c['word'], $c['reading'], $kanjiByChar),
                static fn (string $r): bool => !preg_match('/[一-龯]/u', $r)
            ));
            $o = exam_options($c['reading'], $fakes, $rng, $otherReadings);
            if (!$o) {
                continue;
            }
            $out[] = exam_q($nextId, [
                'section' => 'kanji-reading',
                'lesson' => $k['lesson'],
                'question' => "How do you read 「{$c['word']}」?",
                'hint' => $c['english'],
            ] + $o + [
                'explain' => "{$c['word']}（{$c['reading']}）= {$c['english']}",
                'ref' => "Kanji {$k['no']} 「{$k['kanji']}」 L{$k['lesson']}",
            ]);
        }
    }

    // 4. meaning of a single kanji
    foreach ($kanjiList as $ki => $k) {
        $others = [];
        $near = [];
        foreach ($kanjiList as $xi => $x) {
            if ($xi === $ki) {
                continue;
            }
            $others[] = $x['meaning'];
            if (abs($x['lesson'] - $k['lesson']) <= 1) {
                $near[] = $x['meaning'];
            }
        }
        $o = exam_options($k['meaning'], $near, $rng, $others);
        if (!$o) {
            continue;
        }
        $on = implode('、', $k['on']) ?: '—';
        $kun = implode('、', $k['kun']) ?: '—';
        $out[] = exam_q($nextId, [
            'section' => 'kanji-meaning',
            'lesson' => $k['lesson'],
            'question' => "What does the kanji 「{$k['kanji']}」 mean?",
        ] + $o + [
            'explain' => "{$k['kanji']} = {$k['meaning']}（on: {$on} / kun: {$kun}）",
            'ref' => "Kanji {$k['no']} L{$k['lesson']}",
        ]);
    }

    // 5. choose the correct kanji spelling for a word given in kana
    $allChars = array_column($kanjiList, 'kanji');
    foreach ($kanjiList as $k) {
        foreach ($k['compounds'] as $c) {
            $cs = chars($c['word']);
            if (!array_filter($cs, static fn (string $ch): bool => isset($kanjiByChar[$ch]))) {
                continue;
            }
            // Two characters or more, so the distractors differ by one kanji rather
            // than being four unrelated characters.
            if (count($cs) < 2 || count($cs) > 4) {
                continue;
            }
            $fakes = [];
            foreach ($cs as $i => $ch) {
                if (!isset($kanjiByChar[$ch])) {
                    continue;
                }
                foreach (exam_pick($allChars, 6, $rng) as $sub) {
                    if ($sub === $ch) {
                        continue;
                    }
                    $copy = $cs;
                    $copy[$i] = $sub;
                    $fake = implode('', $copy);
                    if (!in_array($fake, $fakes, true)) {
                        $fakes[] = $fake;
                    }
                }
            }
            $o = exam_options($c['word'], $fakes, $rng);
            if (!$o) {
                continue;
            }
            $out[] = exam_q($nextId, [
                'section' => 'kanji-writing',
                'lesson' => $k['lesson'],
                'question' => "Which is the correct kanji for 「{$c['reading']}」 ({$c['english']})?",
            ] + $o + [
                'explain' => "{$c['reading']} = {$c['word']}（{$c['english']}）",
                'ref' => "Kanji {$k['no']} L{$k['lesson']}",
            ]);
        }
    }

    return $out;
}

/* ------------------------------------------------ 6/7. verbs and adjectives */

/**
 * Each testable form, with the lesson that teaches it. The item is filed under
 * the later of "lesson the verb appears in" and "lesson the form is taught",
 * so the potential of 食べる is a Lesson 13 question, not a Lesson 3 one.
 */
const FORM_LABELS = [
    'masu' => ['ます-form (long present)', 3],
    'masenDeshita' => ['ませんでした-form (long past negative)', 4],
    'te' => ['て-form', 6],
    'shortNeg' => ['short present negative (ない-form)', 8],
    'shortPast' => ['short past (た-form)', 9],
    'shortPastNeg' => ['short past negative', 9],
    'tai' => ['〜たい form (want to)', 11],
    // Part 2 — the second conjugation chart
    'potential' => ['potential form (can do)', 13],
    'volitional' => ['volitional form (let’s / I shall)', 15],
    'ba' => ['ば-form (conditional)', 18],
    'passive' => ['passive form', 21],
    'causative' => ['causative form (make/let someone do)', 22],
    'causativePassive' => ['causative-passive form', 23],
];

const PART2_FORMS = ['potential', 'volitional', 'ba', 'passive', 'causative', 'causativePassive'];

/**
 * Verbs written as a single word — skip お風呂に入る, たばこを吸う, and the
 * 〜 patterns (〜ていらっしゃる), which are suffixes rather than verbs.
 */
function exam_simple_verbs(array $vocab): array
{
    return array_values(array_filter($vocab, static fn (array $v): bool => js_truthy($v['verbClass'] ?? null)
        && !$v['extra']
        && !preg_match('/[をにがへ・〜～]/u', $v['kana'])
        && !preg_match('/[をにがへ・〜～]/u', (string) ($v['kanji'] ?? ''))
        && js_len(exam_display_word($v)) >= 2));
}

/**
 * Honorific, humble and extra-modest verbs (いらっしゃる, おっしゃる, 申す …).
 * Their polite forms are worth drilling, but a causative-passive of a honorific
 * verb is not Japanese anyone writes, so the Part 2 forms are skipped for them.
 */
function exam_is_keigo_verb(array $v): bool
{
    return (bool) preg_match('/(honorific|humble|extra-modest) expression/iu', $v['english']);
}

function exam_verb_questions(array $vocab, int &$nextId): array
{
    $rng = exam_rng('verbs');
    $out = [];

    foreach (exam_simple_verbs($vocab) as $v) {
        $dict = exam_display_word($v);
        $forms = conjugate_verb($dict, $v['verbClass']);
        if (!$forms) {
            continue;
        }

        foreach (FORM_LABELS as $key => [$label, $lessonTaught]) {
            $correct = $forms[$key] ?? null;
            if (!js_truthy($correct)) {
                continue;
            }
            if (in_array($key, PART2_FORMS, true) && exam_is_keigo_verb($v)) {
                continue;
            }
            $o = exam_options($correct, wrong_verb_forms($dict, $v['verbClass'], $key), $rng);
            if (!$o) {
                continue;
            }
            $out[] = exam_q($nextId, [
                'section' => 'verb-conjugation',
                'lesson' => max($v['lesson'], $lessonTaught),
                'question' => "Give the {$label} of 「{$dict}」 ({$v['gloss']}).",
                'hint' => $v['verbClass'] === 'irr' ? 'irregular' : $v['verbClass'] . '-verb',
            ] + $o + [
                'explain' => "{$dict} [{$v['verbClass']}] → {$correct}",
                'ref' => $v['tag'],
            ]);
        }

        // verb class identification (three options — it is a three-way choice)
        $label = ['u' => 'u-verb', 'ru' => 'ru-verb', 'irr' => 'irregular verb'];
        $out[] = exam_q($nextId, [
            'section' => 'verb-class',
            'lesson' => max($v['lesson'], 3),
            'question' => "What kind of verb is 「{$dict}」 ({$v['gloss']})?",
            'correct' => $label[$v['verbClass']] ?? null,
            'distractors' => array_values(array_diff_key($label, [$v['verbClass'] => true])),
            'explain' => "{$dict} is " . js_string($label[$v['verbClass']] ?? null) . " → ます-form {$forms['masu']}, て-form {$forms['te']}",
            'ref' => $v['tag'],
        ]);
    }
    return $out;
}

const ADJ_FORMS = [
    'negPolite' => ['polite negative (〜くないです / 〜じゃないです)', 5],
    'pastPolite' => ['polite past', 5],
    'pastNegPolite' => ['polite past negative', 5],
    'te' => ['て-form', 7],
    'adverb' => ['adverbial form (used before なる)', 10],
];

function exam_adjective_questions(array $vocab, int &$nextId): array
{
    $rng = exam_rng('adj');
    $out = [];
    $adjs = array_filter($vocab, static fn (array $v): bool => js_truthy($v['adjClass'] ?? null) && !$v['extra'] && !preg_match('/[をにがへ]/u', $v['kana']));

    foreach ($adjs as $a) {
        $word = exam_display_word($a);
        $forms = conjugate_adj($word, $a['adjClass']);
        $isI = $a['adjClass'] === 'i';

        foreach (ADJ_FORMS as $key => [$label, $lesson]) {
            $correct = $forms[$key] ?? null;
            if (!js_truthy($correct)) {
                continue;
            }
            $o = exam_options($correct, wrong_adj_forms($word, $a['adjClass'], $key), $rng);
            if (!$o) {
                continue;
            }
            $out[] = exam_q($nextId, [
                'section' => 'adjective',
                'lesson' => max($a['lesson'], $lesson),
                'question' => "Give the {$label} of 「{$word}」 ({$a['gloss']}).",
                'hint' => $isI ? 'い-adjective' : 'な-adjective',
            ] + $o + [
                'explain' => "{$word} is " . ($isI ? 'an い-adjective' : 'a な-adjective') . " → {$correct}",
                'ref' => $a['tag'],
            ]);
        }

        $out[] = exam_q($nextId, [
            'section' => 'adjective',
            'lesson' => max($a['lesson'], 5),
            'question' => "Is 「{$word}」 ({$a['gloss']}) an い-adjective or a な-adjective?",
            'correct' => $isI ? 'い-adjective' : 'な-adjective',
            'distractors' => [$isI ? 'な-adjective' : 'い-adjective'],
            'explain' => "{$word} → {$forms['pastPolite']} (polite past), {$forms['te']} (て-form)",
            'ref' => $a['tag'],
        ]);
    }
    return $out;
}

/* ------------------------------------------------------------------- kana */

const HIRAGANA = [
    ['あ', 'a'], ['い', 'i'], ['う', 'u'], ['え', 'e'], ['お', 'o'],
    ['か', 'ka'], ['き', 'ki'], ['く', 'ku'], ['け', 'ke'], ['こ', 'ko'],
    ['さ', 'sa'], ['し', 'shi'], ['す', 'su'], ['せ', 'se'], ['そ', 'so'],
    ['た', 'ta'], ['ち', 'chi'], ['つ', 'tsu'], ['て', 'te'], ['と', 'to'],
    ['な', 'na'], ['に', 'ni'], ['ぬ', 'nu'], ['ね', 'ne'], ['の', 'no'],
    ['は', 'ha'], ['ひ', 'hi'], ['ふ', 'fu'], ['へ', 'he'], ['ほ', 'ho'],
    ['ま', 'ma'], ['み', 'mi'], ['む', 'mu'], ['め', 'me'], ['も', 'mo'],
    ['や', 'ya'], ['ゆ', 'yu'], ['よ', 'yo'],
    ['ら', 'ra'], ['り', 'ri'], ['る', 'ru'], ['れ', 're'], ['ろ', 'ro'],
    ['わ', 'wa'], ['を', 'o (particle)'], ['ん', 'n'],
    ['が', 'ga'], ['ぎ', 'gi'], ['ぐ', 'gu'], ['げ', 'ge'], ['ご', 'go'],
    ['ざ', 'za'], ['じ', 'ji'], ['ず', 'zu'], ['ぜ', 'ze'], ['ぞ', 'zo'],
    ['だ', 'da'], ['で', 'de'], ['ど', 'do'],
    ['ば', 'ba'], ['び', 'bi'], ['ぶ', 'bu'], ['べ', 'be'], ['ぼ', 'bo'],
    ['ぱ', 'pa'], ['ぴ', 'pi'], ['ぷ', 'pu'], ['ぺ', 'pe'], ['ぽ', 'po'],
];

const KATAKANA = [
    ['ア', 'a'], ['イ', 'i'], ['ウ', 'u'], ['エ', 'e'], ['オ', 'o'],
    ['カ', 'ka'], ['キ', 'ki'], ['ク', 'ku'], ['ケ', 'ke'], ['コ', 'ko'],
    ['サ', 'sa'], ['シ', 'shi'], ['ス', 'su'], ['セ', 'se'], ['ソ', 'so'],
    ['タ', 'ta'], ['チ', 'chi'], ['ツ', 'tsu'], ['テ', 'te'], ['ト', 'to'],
    ['ナ', 'na'], ['ニ', 'ni'], ['ヌ', 'nu'], ['ネ', 'ne'], ['ノ', 'no'],
    ['ハ', 'ha'], ['ヒ', 'hi'], ['フ', 'fu'], ['ヘ', 'he'], ['ホ', 'ho'],
    ['マ', 'ma'], ['ミ', 'mi'], ['ム', 'mu'], ['メ', 'me'], ['モ', 'mo'],
    ['ヤ', 'ya'], ['ユ', 'yu'], ['ヨ', 'yo'],
    ['ラ', 'ra'], ['リ', 'ri'], ['ル', 'ru'], ['レ', 're'], ['ロ', 'ro'],
    ['ワ', 'wa'], ['ン', 'n'],
    ['ガ', 'ga'], ['ジ', 'ji'], ['ズ', 'zu'], ['ダ', 'da'], ['デ', 'de'], ['ド', 'do'],
    ['バ', 'ba'], ['ビ', 'bi'], ['ブ', 'bu'], ['ベ', 'be'], ['ボ', 'bo'],
    ['パ', 'pa'], ['ピ', 'pi'], ['プ', 'pu'], ['ペ', 'pe'], ['ポ', 'po'],
];

function exam_kana_questions(int &$nextId): array
{
    $rng = exam_rng('kana');
    $out = [];
    foreach ([['hiragana', HIRAGANA, 1], ['katakana', KATAKANA, 2]] as [$name, $table, $lesson]) {
        foreach ($table as [$ch, $romaji]) {
            $others = [];
            $otherChars = [];
            foreach ($table as [$c, $r]) {
                if ($c !== $ch) {
                    $others[] = $r;
                }
                if ($r !== $romaji) {
                    $otherChars[] = $c;
                }
            }
            $o = exam_options($romaji, $others, $rng);
            if ($o) {
                $out[] = exam_q($nextId, [
                    'section' => 'kana',
                    'lesson' => $lesson,
                    'question' => "How is 「{$ch}」 read?",
                ] + $o + [
                    'explain' => "{$ch} = {$romaji} ({$name})",
                    'ref' => "{$name} chart",
                ]);
            }
            $o2 = exam_options($ch, $otherChars, $rng);
            if ($o2) {
                $out[] = exam_q($nextId, [
                    'section' => 'kana',
                    'lesson' => $lesson,
                    'question' => "Which {$name} is read \"{$romaji}\"?",
                ] + $o2 + [
                    'explain' => "{$romaji} = {$ch} ({$name})",
                    'ref' => "{$name} chart",
                ]);
            }
        }
    }
    return $out;
}

/* ------------------------------------------------------------- listening */

/**
 * Kana-level similarity, used to pick distractors that are genuinely hard to
 * tell apart by ear rather than merely "another word from this lesson".
 * Shared first mora and a matching length are what make a pair confusable.
 */
function exam_ear_similarity(string $a, string $b): float
{
    if ($a === $b) {
        return -1;
    }
    $ca = chars($a);
    $cb = chars($b);
    $score = 0;
    if (($ca[0] ?? null) === ($cb[0] ?? null)) {
        $score += 3;
    }
    if (end($ca) === end($cb)) {
        $score += 1;
    }
    $score -= abs(js_len($a) - js_len($b));
    // shared mora anywhere
    $setB = array_flip($cb);
    foreach (unique_list($ca) as $ch) {
        if (isset($setB[$ch])) {
            $score += 0.5;
        }
    }
    return $score;
}

function exam_listening_questions(array $vocab, array $audio, int &$nextId): array
{
    $rng = exam_rng('listening');
    $out = [];

    // Every voiced word of the vocabulary list, once per lesson and meaning.
    $seen = [];
    $words = [];
    foreach ($vocab as $v) {
        if ($v['extra'] || js_len($v['gloss']) > 60) {
            continue;
        }
        $s = speech_spoken($v['kana'], $v['kanji'] ?? null);
        $clips = speech_clips_for($s, $audio);
        if (!$clips) {
            continue;
        }
        $key = "{$v['lesson']}|{$s['reading']}|{$v['gloss']}";
        if (isset($seen[$key])) {
            continue;
        }
        $seen[$key] = true;
        $words[] = ['v' => $v, 'word' => $s['reading'], 'clips' => $clips];
    }

    $byLesson = [];
    foreach ($words as $i => $w) {
        $byLesson[$w['v']['lesson']][] = $i;
    }

    foreach ($words as $wi => $w) {
        $v = $w['v'];
        $word = $w['word'];
        // A word that sounds the same can't be told apart by ear, so it is never a
        // distractor (はし: bridge or chopsticks).
        $peers = [];
        foreach ($byLesson[$v['lesson']] ?? [] as $pi) {
            if ($pi !== $wi && $words[$pi]['word'] !== $word) {
                $peers[] = $words[$pi];
            }
        }
        $nearest = static function (int $n, array $list) use ($word): array {
            $scored = array_map(static fn (array $p): array => [exam_ear_similarity($word, $p['word']), $p], $list);
            usort($scored, static fn (array $x, array $y): int => $y[0] <=> $x[0]);
            return array_column(array_slice($scored, 0, $n), 1);
        };
        $audioClip = $w['clips'][(int) floor($rng() * count($w['clips']))]; // one of the voices
        $shown = js_truthy($v['kanji'] ?? null) ? "{$v['kanji']}（{$word}）" : $word;

        // 1. Hear it, choose the meaning — never a meaning this word also has.
        $others = array_values(array_filter($peers, static fn (array $p): bool => !exam_same_meaning($p['v']['gloss'], $v['gloss'])));
        $o = exam_options(
            $v['gloss'],
            array_map(static fn (array $p): string => $p['v']['gloss'], $nearest(10, $others)),
            $rng,
            array_map(static fn (array $p): string => $p['v']['gloss'], $others)
        );
        if ($o) {
            $out[] = exam_q($nextId, [
                'section' => 'listening-meaning',
                'lesson' => $v['lesson'],
                'question' => 'Listen, then choose what the word means.',
                'audio' => $audioClip,
            ] + $o + [
                'explain' => "{$shown} = {$v['gloss']}",
                'ref' => $v['tag'],
            ]);
        }

        // 2. Hear it, choose the word — options in kana throughout, so the script
        //    itself never hints at the answer.
        $o = exam_options(
            $word,
            array_column($nearest(12, $peers), 'word'),
            $rng,
            array_column($peers, 'word')
        );
        if ($o) {
            $out[] = exam_q($nextId, [
                'section' => 'listening-word',
                'lesson' => $v['lesson'],
                'question' => 'Listen, then choose the word you heard.',
                'hint' => $v['gloss'],
                'audio' => $audioClip,
            ] + $o + [
                'explain' => "{$shown} = {$v['gloss']}",
                'ref' => $v['tag'],
            ]);
        }
    }
    return $out;
}

/* -------------------------------------------------------- authored items */

function exam_authored_questions(array $authored, int &$nextId): array
{
    $out = [];
    foreach ($authored as $a) {
        $out[] = exam_q($nextId, [
            'section' => $a['section'],
            'lesson' => $a['lesson'],
            'question' => $a['question'],
            'hint' => js_truthy($a['hint'] ?? null) ? $a['hint'] : null,
            'correct' => $a['correct'],
            'distractors' => $a['distractors'],
            'explain' => $a['explain'],
            'ref' => js_truthy($a['ref'] ?? null) ? $a['ref'] : null,
        ]);
    }
    return $out;
}

/* ---------------------------------------------------------------- assembly */

/**
 * The whole bank, in the order papers are laid out from.
 *
 * @param array $content ['vocab', 'kanji', 'audio', 'authored'] — see content_load()
 */
function exam_build_bank(array $content): array
{
    $nextId = 0;
    $bank = array_merge(
        exam_vocab_questions($content['vocab'], $nextId),
        exam_kanji_questions($content['kanji'], $nextId),
        exam_verb_questions($content['vocab'], $nextId),
        exam_adjective_questions($content['vocab'], $nextId),
        exam_kana_questions($nextId),
        exam_listening_questions($content['vocab'], $content['audio'], $nextId),
        exam_authored_questions($content['authored'], $nextId)
    );
    return array_values(array_filter($bank, static fn (array $x): bool => js_truthy($x['correct'] ?? null)
        && is_array($x['distractors'] ?? null) && count($x['distractors']) >= 1));
}

/** Section metadata: display name, and the weight used to lay out a full paper. */
const SECTIONS = [
    ['id' => 'listening-word', 'name' => 'Listening — the word', 'weight' => 7, 'audio' => true],
    ['id' => 'listening-meaning', 'name' => 'Listening — the meaning', 'weight' => 7, 'audio' => true],
    ['id' => 'kana', 'name' => 'Hiragana & Katakana', 'weight' => 6],
    ['id' => 'vocab-jp-en', 'name' => 'Vocabulary (Japanese → English)', 'weight' => 14],
    ['id' => 'vocab-en-jp', 'name' => 'Vocabulary (English → Japanese)', 'weight' => 12],
    ['id' => 'kanji-reading', 'name' => 'Kanji readings', 'weight' => 11],
    ['id' => 'kanji-meaning', 'name' => 'Kanji meanings', 'weight' => 6],
    ['id' => 'kanji-writing', 'name' => 'Kanji writing', 'weight' => 7],
    ['id' => 'verb-class', 'name' => 'Verb classes', 'weight' => 4],
    ['id' => 'verb-conjugation', 'name' => 'Verb conjugation', 'weight' => 14],
    ['id' => 'adjective', 'name' => 'Adjectives', 'weight' => 8],
    ['id' => 'particle', 'name' => 'Particles', 'weight' => 8],
    ['id' => 'grammar', 'name' => 'Grammar patterns', 'weight' => 14],
    ['id' => 'counter', 'name' => 'Numbers, counters & time', 'weight' => 6],
    ['id' => 'translation', 'name' => 'Sentence translation', 'weight' => 7],
];

/**
 * The exact arguments a paper was built from. The client echoes this back on
 * submit so the server rebuilds the identical paper — passing the *resulting*
 * question count back instead would rebuild a different one.
 */
function exam_normalize_spec($in): array
{
    $in = is_array($in) ? $in : [];
    $list = static fn ($v): bool => is_array($v) && array_is_list($v) && $v !== [];
    // Number() of each; a NaN matches no lesson and goes back to the browser as null, as JSON writes it
    $numbers = static fn (array $v): array => array_map(static function ($x) {
        $n = js_number($x);
        return is_float($n) && is_nan($n) ? null : $n;
    }, $v);
    $size = js_number($in['size'] ?? null);
    $seed = $in['seed'] ?? null;
    return [
        'size' => min(max(is_nan((float) $size) || $size == 0 ? 250 : $size, 5), 1200),
        'books' => $list($in['books'] ?? null) ? $numbers($in['books']) : null,
        'lessons' => $list($in['lessons'] ?? null) ? $numbers($in['lessons']) : null,
        'sections' => $list($in['sections'] ?? null) ? $in['sections'] : null,
        'seed' => is_scalar($seed) && js_truthy($seed) ? js_string($seed) : null,
    ];
}

/** The sections and lessons a spec asks for: what exam_build_paper() will draw from. */
function exam_scope(array $spec): array
{
    $sections = [];
    foreach (SECTIONS as $s) {
        if ($spec['sections'] === null || js_includes($spec['sections'], $s['id'])) {
            $sections[] = $s;
        }
    }
    // A book selection is just shorthand for its lessons; an explicit lesson list
    // wins where both are given.
    $lessons = $spec['lessons'];
    if (!$lessons && $spec['books']) {
        $lessons = [];
        foreach (BOOKS as $b) {
            if (js_includes($spec['books'], $b['id'])) {
                $lessons = array_merge($lessons, $b['lessons']);
            }
        }
    }
    return ['sections' => $sections, 'lessons' => $lessons ?: null];
}

/**
 * Lay out an exam: sample each section in proportion to its weight, spreading
 * the picks evenly over the requested lessons so no lesson dominates.
 *
 * @param array $spec from exam_normalize_spec()
 * @param array $pool bank questions in bank order; at least those in scope (others are skipped)
 */
function exam_build_paper(array $spec, array $pool): array
{
    $size = $spec['size'];
    $usedSeed = $spec['seed'] ?? ('exam-' . now_ms() . '-' . random_int(0, 999999));
    $rng = exam_rng($usedSeed);
    $scope = exam_scope($spec);
    $wantSections = $scope['sections'];
    $wantLessons = $scope['lessons'];

    // Greetings is lesson 0 and is selectable like any other lesson, so it must
    // be excluded when the caller leaves it out.
    $sectionIds = array_column($wantSections, 'id');
    $inScope = static fn (array $x): bool => in_array($x['section'], $sectionIds, true)
        && ($wantLessons === null || js_includes($wantLessons, $x['lesson']));
    $pool = array_values(array_filter($pool, $inScope));
    $totalWeight = array_sum(array_column($wantSections, 'weight'));

    $chosen = [];
    foreach ($wantSections as $s) {
        $target = max(1, js_round(($size * $s['weight']) / $totalWeight));
        // group by lesson so the sample is spread across the book
        $byLesson = [];
        foreach ($pool as $x) {
            if ($x['section'] === $s['id']) {
                $byLesson[$x['lesson']][] = $x;
            }
        }
        if (!$byLesson) {
            continue;
        }
        $buckets = array_map(static fn ($k): array => exam_shuffle($byLesson[$k], $rng), exam_shuffle(array_keys($byLesson), $rng));

        $take = [];
        for ($i = 0; count($take) < $target; $i++) {
            $progressed = false;
            foreach ($buckets as $b) {
                if (count($take) >= $target) {
                    break;
                }
                if (isset($b[$i])) {
                    $take[] = $b[$i];
                    $progressed = true;
                }
            }
            if (!$progressed) {
                break;
            }
        }
        array_push($chosen, ...$take);
    }

    // Present the paper section by section, in the canonical order.
    $order = array_flip(array_column(SECTIONS, 'id'));
    usort($chosen, static fn (array $a, array $b): int => $order[$a['section']] - $order[$b['section']]);
    $names = array_column(SECTIONS, 'name', 'id');

    // Freeze the option order now, so scoring is by index and the paper is
    // reproducible from the seed alone.
    $questions = [];
    foreach ($chosen as $idx => $x) {
        $opts = exam_shuffle(array_merge([$x['correct']], $x['distractors']), $rng);
        $questions[] = [
            'n' => $idx + 1,
            'id' => $x['id'],
            'section' => $x['section'],
            'sectionName' => $names[$x['section']] ?? $x['section'],
            'lesson' => $x['lesson'],
            'book' => $x['book'],
            'question' => $x['question'],
            'hint' => js_truthy($x['hint'] ?? null) ? $x['hint'] : null,
            'reading' => js_truthy($x['reading'] ?? null) ? $x['reading'] : null,
            'audio' => js_truthy($x['audio'] ?? null) ? $x['audio'] : null,
            'options' => $opts,
            'answerIndex' => (int) array_search($x['correct'], $opts, true),
            'explain' => $x['explain'],
            'ref' => js_truthy($x['ref'] ?? null) ? $x['ref'] : null,
        ];
    }

    return [
        'seed' => $usedSeed,
        'createdAt' => iso_time(now_ms()),
        'size' => count($questions),
        'requestedSize' => $size,
        'books' => $spec['books'] ?? array_column(BOOKS, 'id'),
        'lessons' => $wantLessons ?? 'all',
        'sections' => $sectionIds,
        'questions' => $questions,
    ];
}

/** Counts per section, lesson and part — for the exam's setup screen. */
function exam_bank_stats(array $bank): array
{
    $stats = ['total' => count($bank), 'bySection' => [], 'byLesson' => [], 'byBook' => [], 'bySectionBook' => []];
    foreach ($bank as $x) {
        $stats['bySection'][$x['section']] = ($stats['bySection'][$x['section']] ?? 0) + 1;
        $stats['byLesson'][$x['lesson']] = ($stats['byLesson'][$x['lesson']] ?? 0) + 1;
        $stats['byBook'][$x['book']] = ($stats['byBook'][$x['book']] ?? 0) + 1;
        $stats['bySectionBook'][$x['book']][$x['section']] = ($stats['bySectionBook'][$x['book']][$x['section']] ?? 0) + 1;
    }
    return $stats;
}
