<?php
/**
 * Verb and adjective conjugation, following the course's first conjugation
 * chart (book 1) and the adjective rules of L5/L7.
 *
 * Every function takes the dictionary form as written in the book (kanji +
 * okurigana, or kana where the book gives no kanji) and returns the same
 * orthography with the ending swapped, so 食べる -> 食べます, かう -> かいます.
 */

declare(strict_types=1);

/* u-verb endings: [masu-stem, te, ta, nai] keyed by the final kana. */
const U_ENDINGS = [
    'う' => ['い', 'って', 'った', 'わ'],
    'つ' => ['ち', 'って', 'った', 'た'],
    'る' => ['り', 'って', 'った', 'ら'],
    'む' => ['み', 'んで', 'んだ', 'ま'],
    'ぶ' => ['び', 'んで', 'んだ', 'ば'],
    'ぬ' => ['に', 'んで', 'んだ', 'な'],
    'く' => ['き', 'いて', 'いた', 'か'],
    'ぐ' => ['ぎ', 'いで', 'いだ', 'が'],
    'す' => ['し', 'して', 'した', 'さ'],
];

/**
 * The Part 2 conjugation chart (book 2), keyed by the
 * u-verb's final kana: [potential, volitional, ba, passive, causative,
 * causative-passive] — each the ending that replaces the final kana.
 */
const U_ADVANCED = [
    'う' => ['える', 'おう', 'えば', 'われる', 'わせる', 'わされる'],
    'つ' => ['てる', 'とう', 'てば', 'たれる', 'たせる', 'たされる'],
    'る' => ['れる', 'ろう', 'れば', 'られる', 'らせる', 'らされる'],
    'む' => ['める', 'もう', 'めば', 'まれる', 'ませる', 'まされる'],
    'ぶ' => ['べる', 'ぼう', 'べば', 'ばれる', 'ばせる', 'ばされる'],
    'ぬ' => ['ねる', 'のう', 'ねば', 'なれる', 'なせる', 'なされる'],
    'く' => ['ける', 'こう', 'けば', 'かれる', 'かせる', 'かされる'],
    'ぐ' => ['げる', 'ごう', 'げば', 'がれる', 'がせる', 'がされる'],
    'す' => ['せる', 'そう', 'せば', 'される', 'させる', 'させられる'],
];
const ADV_KEYS = ['potential', 'volitional', 'ba', 'passive', 'causative', 'causativePassive'];

/**
 * The five keigo u-verbs whose ます-form is irregular (L19–L20):
 * くださる → くださいます, not くださります. The stem loses its final ru and
 * takes い rather than り.
 */
const IRREGULAR_MASU_STEM = [
    'くださる' => 'くださ', '下さる' => '下さ',
    'いらっしゃる' => 'いらっしゃ',
    'おっしゃる' => 'おっしゃ',
    'なさる' => 'なさ',
    'ござる' => 'ござ',
];

/** いく's て- and た-forms, which the chart stars as exceptions (ある's starred negatives are handled below). */
function conj_exception(string $dict): ?array
{
    if ($dict === 'いく' || $dict === '行く') {
        $stem = mb_substr($dict, 0, -1);
        return ['te' => $stem . 'って', 'ta' => $stem . 'った'];
    }
    return null;
}

/**
 * All the forms the course teaches for one verb.
 *
 * @param string $dict dictionary form, e.g. 食べる / かう / 勉強する
 * @param string $cls  'u' | 'ru' | 'irr'
 */
function conjugate_verb(string $dict, string $cls): ?array
{
    $F = [];

    // Only the class decides: つくる and おくる end in くる but are ordinary u-verbs.
    if ($cls === 'irr') {
        if (preg_match('/する$/uD', $dict)) {
            $s = mb_substr($dict, 0, -2); // 勉強 / '' for bare する
            $F['masuStem'] = $s . 'し';
            $F['te'] = $s . 'して';
            $F['shortPast'] = $s . 'した';
            $F['shortNeg'] = $s . 'しない';
            $F['shortPastNeg'] = $s . 'しなかった';
        } else {
            $s = preg_replace('/(くる|来る)$/uD', '', $dict); // もって / つれて / ''
            $kanji = (bool) preg_match('/来る$/uD', $dict);
            $F['masuStem'] = $s . ($kanji ? '来' : 'き');
            $F['te'] = $s . ($kanji ? '来て' : 'きて');
            $F['shortPast'] = $s . ($kanji ? '来た' : 'きた');
            $F['shortNeg'] = $s . ($kanji ? '来ない' : 'こない');
            $F['shortPastNeg'] = $s . ($kanji ? '来なかった' : 'こなかった');
        }
    } elseif ($cls === 'ru') {
        $s = mb_substr($dict, 0, -1); // drop る
        $F['masuStem'] = $s;
        $F['te'] = $s . 'て';
        $F['shortPast'] = $s . 'た';
        $F['shortNeg'] = $s . 'ない';
        $F['shortPastNeg'] = $s . 'なかった';
    } else {
        $e = U_ENDINGS[mb_substr($dict, -1)] ?? null;
        if (!$e) {
            return null;
        }
        $s = mb_substr($dict, 0, -1);
        $ex = conj_exception($dict);
        $F['masuStem'] = $s . $e[0];
        $F['te'] = $ex ? $ex['te'] : $s . $e[1];
        $F['shortPast'] = $ex ? $ex['ta'] : $s . $e[2];
        // ある is the chart's other exception: short negative is ない, not あらない.
        if ($dict === 'ある') {
            $F['shortNeg'] = 'ない';
            $F['shortPastNeg'] = 'なかった';
        } else {
            $F['shortNeg'] = $s . $e[3] . 'ない';
            $F['shortPastNeg'] = $s . $e[3] . 'なかった';
        }
    }

    /* ---- Part 2 forms (the second conjugation chart) ---- */
    if ($cls === 'irr') {
        if (preg_match('/する$/uD', $dict)) {
            $s = mb_substr($dict, 0, -2);
            $F['potential'] = $s . 'できる';
            $F['volitional'] = $s . 'しよう';
            $F['ba'] = $s . 'すれば';
            $F['passive'] = $s . 'される';
            $F['causative'] = $s . 'させる';
            $F['causativePassive'] = $s . 'させられる';
        } else {
            $s = preg_replace('/(くる|来る)$/uD', '', $dict);
            $k = (bool) preg_match('/来る$/uD', $dict);
            $F['potential'] = $s . ($k ? '来られる' : 'こられる');
            $F['volitional'] = $s . ($k ? '来よう' : 'こよう');
            $F['ba'] = $s . ($k ? '来れば' : 'くれば');
            $F['passive'] = $s . ($k ? '来られる' : 'こられる');
            $F['causative'] = $s . ($k ? '来させる' : 'こさせる');
            $F['causativePassive'] = $s . ($k ? '来させられる' : 'こさせられる');
        }
    } elseif ($cls === 'ru') {
        $s = mb_substr($dict, 0, -1);
        $F['potential'] = $s . 'られる';
        $F['volitional'] = $s . 'よう';
        $F['ba'] = $s . 'れば';
        $F['passive'] = $s . 'られる';
        $F['causative'] = $s . 'させる';
        $F['causativePassive'] = $s . 'させられる';
    } else {
        $adv = U_ADVANCED[mb_substr($dict, -1)] ?? null;
        if ($adv) {
            $s = mb_substr($dict, 0, -1);
            foreach (ADV_KEYS as $i => $k) {
                $F[$k] = $s . $adv[$i];
            }
        }
    }

    // くださる → くださいます (and the four other keigo verbs like it)
    if (isset(IRREGULAR_MASU_STEM[$dict])) {
        $F['masuStem'] = IRREGULAR_MASU_STEM[$dict] . 'い';
        $F['irregularMasu'] = true;
    }

    $F['dict'] = $dict;
    $F['masu'] = $F['masuStem'] . 'ます';
    $F['masen'] = $F['masuStem'] . 'ません';
    $F['mashita'] = $F['masuStem'] . 'ました';
    $F['masenDeshita'] = $F['masuStem'] . 'ませんでした';
    $F['masho'] = $F['masuStem'] . 'ましょう';
    $F['tai'] = $F['masuStem'] . 'たい';
    $F['nakute'] = preg_replace('/ない$/uD', 'なくて', $F['shortNeg']);
    $F['naide'] = $F['shortNeg'] . 'で';
    $F['tari'] = $F['shortPast'] . 'り';
    return $F;
}

/**
 * The irregular adjectives whose stem becomes よ- : いい and the compounds
 * built on it. かわいい is NOT one of them — it is a single word whose stem is
 * かわい, giving かわいくて, not かわよくて.
 */
const II_IRREGULAR = ['いい', 'かっこいい', 'かっこういい', '格好いい'];

/** The vocabulary list writes な-adjectives as 元気(な); conjugation works on the stem. */
function conj_bare_adj(string $w): string
{
    return preg_replace('/^\s+|\s+$/u', '', preg_replace('/\(な\)$/uD', '', $w));
}

/** The forms Part 1 teaches for い- and な-adjectives. */
function conjugate_adj(string $rawWord, string $cls): array
{
    $word = conj_bare_adj($rawWord);
    $F = ['dict' => $word];
    if ($cls === 'i') {
        $stem = in_array($word, II_IRREGULAR, true) ? mb_substr($word, 0, -2) . 'よ' : mb_substr($word, 0, -1);
        $F['present'] = $word;
        $F['presentPolite'] = $word . 'です';
        $F['neg'] = $stem . 'くない';
        $F['negPolite'] = $stem . 'くないです';
        $F['past'] = $stem . 'かった';
        $F['pastPolite'] = $stem . 'かったです';
        $F['pastNeg'] = $stem . 'くなかった';
        $F['pastNegPolite'] = $stem . 'くなかったです';
        $F['te'] = $stem . 'くて';
        $F['adverb'] = $stem . 'く';
        $F['becomes'] = $stem . 'くなる';
    } else {
        $stem = preg_replace('/な$/uD', '', $word);
        $F['present'] = $stem . 'だ';
        $F['presentPolite'] = $stem . 'です';
        $F['neg'] = $stem . 'じゃない';
        $F['negPolite'] = $stem . 'じゃないです';
        $F['past'] = $stem . 'だった';
        $F['pastPolite'] = $stem . 'でした';
        $F['pastNeg'] = $stem . 'じゃなかった';
        $F['pastNegPolite'] = $stem . 'じゃなかったです';
        $F['te'] = $stem . 'で';
        $F['adverb'] = $stem . 'に';
        $F['becomes'] = $stem . 'になる';
        $F['attributive'] = $stem . 'な';
        $F['stem'] = $stem;
    }
    return $F;
}

/**
 * Wrong-but-plausible forms: conjugate the word as if it belonged to each of
 * the other verb classes. These make far better distractors than random words,
 * because they are exactly the mistakes the conjugation rules invite.
 */
function wrong_verb_forms(string $dict, string $trueClass, string $formKey): array
{
    $out = [];
    $add = static function ($v) use (&$out): void {
        if (!in_array($v, $out, true)) {
            $out[] = $v;
        }
    };
    $correct = conjugate_verb($dict, $trueClass);
    $truth = $correct[$formKey] ?? null;

    foreach (['u', 'ru', 'irr'] as $cls) {
        if ($cls === $trueClass) {
            continue;
        }
        // Treating 座る as irregular would produce 座るきて — not a mistake anyone
        // makes. Only offer the irregular reading when the word could be read that way.
        if ($cls === 'irr' && !preg_match('/(する|くる|来る)$/uD', $dict)) {
            continue;
        }
        $f = conjugate_verb($dict, $cls);
        $form = $f[$formKey] ?? null;
        if (js_truthy($form) && $form !== $truth) {
            $add($form);
        }
    }

    // くださります / いらっしゃります — the regularised form is the mistake these
    // five verbs actually invite, so offer it.
    if ($correct && !empty($correct['irregularMasu'])) {
        $plainStem = mb_substr($dict, 0, -1) . 'り';
        $map = [
            'masu' => $plainStem . 'ます',
            'masen' => $plainStem . 'ません',
            'mashita' => $plainStem . 'ました',
            'masenDeshita' => $plainStem . 'ませんでした',
            'masho' => $plainStem . 'ましょう',
            'tai' => $plainStem . 'たい',
        ];
        if (isset($map[$formKey]) && $map[$formKey] !== $truth) {
            $add($map[$formKey]);
        }
    }

    // For u-verbs, also mis-apply the other u-verb ending groups.
    if ($trueClass === 'u') {
        $last = mb_substr($dict, -1);
        $s = mb_substr($dict, 0, -1);
        foreach (U_ENDINGS as $end => $e) {
            if ($end === $last) {
                continue;
            }
            // graft the wrong ending onto the real stem
            $cand = conjugate_verb($s . $end, 'u')[$formKey] ?? null;
            if (!js_truthy($cand)) {
                continue;
            }
            if ($cand !== $truth) {
                $add($cand);
            }
        }
    }
    return array_values(array_filter($out, 'js_truthy'));
}

function wrong_adj_forms(string $rawWord, string $trueClass, string $formKey): array
{
    $word = conj_bare_adj($rawWord);
    $other = $trueClass === 'i' ? 'na' : 'i';
    $out = [];
    $add = static function ($v) use (&$out): void {
        if (!in_array($v, $out, true)) {
            $out[] = $v;
        }
    };
    $truth = conjugate_adj($word, $trueClass)[$formKey] ?? null;
    $form = conjugate_adj($word, $other)[$formKey] ?? null;
    if (js_truthy($form) && $form !== $truth) {
        $add($form);
    }

    // Common learner errors: い-adjective treated with です-negation, and the
    // な-adjective past applied to an い-adjective.
    if ($trueClass === 'i') {
        $stem = mb_substr($word, 0, -1);
        $add($word . 'じゃないです');
        $add($word . 'でした');
        $add($stem . 'くでした');
    } else {
        $add($word . 'かったです');
        $add($word . 'くないです');
        $add($word . 'くて');
    }
    $out = array_values(array_filter($out, static fn ($x): bool => $x !== $truth));
    return array_values(array_filter($out, 'js_truthy'));
}
