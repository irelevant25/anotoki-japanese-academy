<?php
// The conjugation engine against both Conjugation Charts, cell by cell.
declare(strict_types=1);

require __DIR__ . '/../lib.php';

// books/textbook-1.pdf, printed p.382: dictionary, class, ます, て, short past, short neg, short past neg
const CHART_1 = [
    ['する', 'irr', 'します', 'して', 'した', 'しない', 'しなかった'],
    ['くる', 'irr', 'きます', 'きて', 'きた', 'こない', 'こなかった'],
    ['たべる', 'ru', 'たべます', 'たべて', 'たべた', 'たべない', 'たべなかった'],
    ['かう', 'u', 'かいます', 'かって', 'かった', 'かわない', 'かわなかった'],
    ['まつ', 'u', 'まちます', 'まって', 'まった', 'またない', 'またなかった'],
    ['とる', 'u', 'とります', 'とって', 'とった', 'とらない', 'とらなかった'],
    ['ある', 'u', 'あります', 'あって', 'あった', 'ない', 'なかった'],
    ['よむ', 'u', 'よみます', 'よんで', 'よんだ', 'よまない', 'よまなかった'],
    ['あそぶ', 'u', 'あそびます', 'あそんで', 'あそんだ', 'あそばない', 'あそばなかった'],
    ['しぬ', 'u', 'しにます', 'しんで', 'しんだ', 'しなない', 'しななかった'],
    ['かく', 'u', 'かきます', 'かいて', 'かいた', 'かかない', 'かかなかった'],
    ['いく', 'u', 'いきます', 'いって', 'いった', 'いかない', 'いかなかった'],
    ['いそぐ', 'u', 'いそぎます', 'いそいで', 'いそいだ', 'いそがない', 'いそがなかった'],
    ['はなす', 'u', 'はなします', 'はなして', 'はなした', 'はなさない', 'はなさなかった'],
];

// books/textbook-2.pdf, printed p.389: potential, volitional, ば, passive, causative, causative-passive
const CHART_2 = [
    ['する', 'irr', 'できる', 'しよう', 'すれば', 'される', 'させる', 'させられる'],
    ['くる', 'irr', 'こられる', 'こよう', 'くれば', 'こられる', 'こさせる', 'こさせられる'],
    ['たべる', 'ru', 'たべられる', 'たべよう', 'たべれば', 'たべられる', 'たべさせる', 'たべさせられる'],
    ['かう', 'u', 'かえる', 'かおう', 'かえば', 'かわれる', 'かわせる', 'かわされる'],
    ['まつ', 'u', 'まてる', 'まとう', 'まてば', 'またれる', 'またせる', 'またされる'],
    ['とる', 'u', 'とれる', 'とろう', 'とれば', 'とられる', 'とらせる', 'とらされる'],
    ['ある', 'u', 'あれる', 'あろう', 'あれば', 'あられる', 'あらせる', 'あらされる'],
    ['よむ', 'u', 'よめる', 'よもう', 'よめば', 'よまれる', 'よませる', 'よまされる'],
    ['あそぶ', 'u', 'あそべる', 'あそぼう', 'あそべば', 'あそばれる', 'あそばせる', 'あそばされる'],
    ['しぬ', 'u', 'しねる', 'しのう', 'しねば', 'しなれる', 'しなせる', 'しなされる'],
    ['かく', 'u', 'かける', 'かこう', 'かけば', 'かかれる', 'かかせる', 'かかされる'],
    ['いく', 'u', 'いける', 'いこう', 'いけば', 'いかれる', 'いかせる', 'いかされる'],
    ['いそぐ', 'u', 'いそげる', 'いそごう', 'いそげば', 'いそがれる', 'いそがせる', 'いそがされる'],
    ['はなす', 'u', 'はなせる', 'はなそう', 'はなせば', 'はなされる', 'はなさせる', 'はなさせられる'],
];

test('Part 1 conjugation chart — all 70 cells', function (): void {
    foreach (CHART_1 as [$dict, $cls, $masu, $te, $past, $neg, $pastNeg]) {
        $f = conjugate_verb($dict, $cls);
        assert_same([$masu, $te, $past, $neg, $pastNeg], [$f['masu'], $f['te'], $f['shortPast'], $f['shortNeg'], $f['shortPastNeg']], $dict);
    }
});

test('Part 2 conjugation chart — all 84 cells', function (): void {
    foreach (CHART_2 as $row) {
        [$dict, $cls] = $row;
        $f = conjugate_verb($dict, $cls);
        assert_same(array_slice($row, 2), [$f['potential'], $f['volitional'], $f['ba'], $f['passive'], $f['causative'], $f['causativePassive']], $dict);
    }
});

test('つくる / おくる are u-verbs despite ending in くる', function (): void {
    assert_same('つくります', conjugate_verb('つくる', 'u')['masu']);
    assert_same('おくって', conjugate_verb('おくる', 'u')['te']);
});

test('kanji orthography is kept', function (): void {
    assert_same('食べます', conjugate_verb('食べる', 'ru')['masu']);
    assert_same('来ない', conjugate_verb('来る', 'irr')['shortNeg']);
    assert_same('勉強できる', conjugate_verb('勉強する', 'irr')['potential']);
    assert_same('行って', conjugate_verb('行く', 'u')['te']);
});

test('the five honorific 〜さる verbs take います', function (): void {
    foreach ([
        ['くださる', 'くださいます'],
        ['下さる', '下さいます'],
        ['いらっしゃる', 'いらっしゃいます'],
        ['おっしゃる', 'おっしゃいます'],
        ['なさる', 'なさいます'],
        ['ござる', 'ございます'],
    ] as [$d, $m]) {
        assert_same($m, conjugate_verb($d, 'u')['masu']);
        assert_true(in_array(mb_substr($d, 0, -1) . 'ります', wrong_verb_forms($d, 'u', 'masu'), true), "$d: regularised form offered as a distractor");
    }
});

test('adjectives: いい-family irregular, かわいい regular, な-adjectives', function (): void {
    assert_same('よくて', conjugate_adj('いい', 'i')['te']);
    assert_same('かっこよかったです', conjugate_adj('かっこいい', 'i')['pastPolite']);
    assert_same('かわいくて', conjugate_adj('かわいい', 'i')['te']);
    assert_same('新しくないです', conjugate_adj('新しい', 'i')['negPolite']);
    assert_same('元気でした', conjugate_adj('元気(な)', 'na')['pastPolite']);
    assert_same('いろいろじゃなかったです', conjugate_adj('いろいろ(な)', 'na')['pastNegPolite']);
});

test('a wrong form never equals the right one', function (): void {
    foreach (CHART_1 as [$dict, $cls]) {
        foreach (['masu', 'te', 'shortPast', 'shortNeg', 'potential', 'passive'] as $key) {
            $right = conjugate_verb($dict, $cls)[$key];
            assert_false(in_array($right, wrong_verb_forms($dict, $cls, $key), true), "$dict $key");
        }
    }
});
