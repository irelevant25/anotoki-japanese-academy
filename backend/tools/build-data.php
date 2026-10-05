<?php
/**
 * Converts the TSV data transcribed from the course books (the vocabulary
 * index, the per-lesson kanji lists, the grammar index) into the JSON the
 * question generator and the kanji trainer use.
 *
 *   backend/data/source/vocab-part1|2.tsv   kana \t kanji \t english \t lesson-tag
 *   backend/data/source/kanji-part1|2.tsv   no \t kanji \t lesson \t on \t kun \t meaning \t compounds
 *   backend/data/source/grammar-index-part1|2.tsv   lesson \t point \t ref
 *
 *   php backend/tools/build-data.php   (node backend/tools/php.js backend/tools/build-data.php
 *                                      where an older php comes first on PATH)
 *
 * The app picks up the new JSON at its next request (backend/src/content.php).
 */

declare(strict_types=1);

require_once __DIR__ . '/../src/bootstrap.php';

const SOURCE = BACKEND . '/data/source';

function tsv_read(string $file): array
{
    $path = SOURCE . "/$file";
    if (!is_file($path)) {
        return [];
    }
    $rows = [];
    foreach (preg_split('/\r?\n/', (string) file_get_contents($path)) as $line) {
        if (js_trim($line) !== '') {
            $rows[] = explode("\t", $line);
        }
    }
    return $rows;
}

/** Both books' sources, concatenated. Lesson number alone identifies the book. */
function tsv_read_all(string ...$files): array
{
    return array_merge(...array_map('tsv_read', $files));
}

/* ---------------------------------------------------------------- vocabulary */

// 会L7 -> lesson 7, conv;  読L9-II -> lesson 9, read;  会G -> greetings;  会L12(e) -> Useful Expressions.
function data_lesson_tag(string $tag): array
{
    $t = js_trim($tag);
    if (preg_match('/^会G/u', $t)) {
        return ['lesson' => 0, 'section' => 'greetings', 'extra' => false];
    }
    // [0-9], not \d: under /u PHP's \d takes any digit (１２ typed with the IME
    // on), where the first (JavaScript) builder took ASCII only and dropped the row
    if (!preg_match('/^(会|読)L([0-9]+)/u', $t, $m)) {
        return ['lesson' => null, 'section' => 'other', 'extra' => false];
    }
    return ['lesson' => (int) $m[2], 'section' => $m[1] === '会' ? 'conv' : 'read', 'extra' => (bool) preg_match('/\(e\)/u', $t)];
}

// The list marks verb class in the gloss: [u] [ru] [irr.]
function data_verb_class(string $english): ?string
{
    if (preg_match('/\[irr\.\]/u', $english)) {
        return 'irr';
    }
    if (preg_match('/\[ru\]/u', $english)) {
        return 'ru';
    }
    if (preg_match('/\[u\]/u', $english)) {
        return 'u';
    }
    return null;
}

// い-adjectives whose index entry has no kanji okurigana to key off.
const KANA_I_ADJ = [
    'いい', 'かっこいい', 'つまらない', 'おいしい', 'かわいい', 'やさしい',
    'すごい', 'こわい', 'きれい', 'にぎやか',
];
const NOT_I_ADJ = [
    'きれい(な)', 'にぎやか(な)', 'いっぱい', 'だいたい', 'ぜったい',
    'はい', 'たくさん', 'ばんごはん', 'ひるごはん', 'あさごはん',
    'きらい(な)', 'だいきらい(な)',
];

function data_adj_class(string $kana, string $kanji): ?string
{
    if (preg_match('/\(な\)$/uD', $kana)) {
        return 'na';
    }
    if (in_array($kana, NOT_I_ADJ, true)) {
        return null;
    }
    // Index writes い-adjectives with okurigana: 高い, 新しい, 面白い …
    if ($kanji !== '' && preg_match('/い$/uD', $kanji) && preg_match('/い$/uD', $kana)) {
        return 'i';
    }
    if ($kanji === '' && in_array($kana, KANA_I_ADJ, true)) {
        return 'i';
    }
    return null;
}

function data_vocab(): array
{
    $out = [];
    $seen = [];
    foreach (tsv_read_all('vocab-part1.tsv', 'vocab-part2.tsv') as $r) {
        $kana = js_trim($r[0] ?? '');
        $kanji = js_trim($r[1] ?? '');
        $english = js_trim($r[2] ?? '');
        $tag = js_trim($r[3] ?? '');
        if ($kana === '' || $english === '') {
            continue;
        }
        $lt = data_lesson_tag($tag);
        if ($lt['lesson'] === null) {
            continue;
        }
        // A word can legitimately appear twice (きく to ask / to listen); key on the gloss too.
        $key = "$kana|$english";
        if (isset($seen[$key])) {
            continue;
        }
        $seen[$key] = true;

        $entry = [
            'kana' => $kana,
            'kanji' => $kanji !== '' ? $kanji : null,
            'english' => $english,
            // gloss with the grammatical annotations stripped, for answer options
            'gloss' => js_trim(preg_replace('/\s*\[(u|ru|irr\.)\]/u', '', $english)),
            'lesson' => $lt['lesson'],
            'section' => $lt['section'],
            'extra' => $lt['extra'],
            'verbClass' => data_verb_class($english),
            'adjClass' => data_adj_class($kana, $kanji),
            'tag' => $tag,
        ];
        $entry['pos'] = $entry['verbClass'] ? 'verb' : ($entry['adjClass'] ? 'adj' : (preg_match('/^to /u', $english) ? 'verb' : 'noun'));
        $out[] = $entry;
    }
    return $out;
}

/* --------------------------------------------------------------------- kanji */

/** Number() of a TSV field; a missing or unreadable one is written as null, as JSON writes NaN. */
function data_number(?string $v)
{
    $n = $v === null ? NAN : js_number($v);
    return is_float($n) && is_nan($n) ? null : $n;
}

function data_kanji(): array
{
    $split = static fn (?string $s): array => array_values(array_filter(array_map('js_trim', explode('/', (string) $s)), static fn (string $x): bool => $x !== ''));
    $out = [];
    foreach (tsv_read_all('kanji-part1.tsv', 'kanji-part2.tsv') as $r) {
        [$no, $kanji, $lesson, $on, $kun, $meaning, $compounds] = array_pad($r, 7, null);
        $entry = [
            'no' => data_number($no),
            'kanji' => js_trim((string) $kanji),
            'lesson' => data_number($lesson),
            'on' => $split($on),
            'kun' => $split($kun),
            'meaning' => js_trim((string) $meaning),
            'compounds' => [],
        ];
        foreach (explode(';', (string) $compounds) as $c) {
            $c = js_trim($c);
            // 一時(いちじ)=one o'clock
            if ($c !== '' && preg_match('/^(.+?)\((.+?)\)=(.*)$/uD', $c, $m)) {
                $entry['compounds'][] = ['word' => $m[1], 'reading' => $m[2], 'english' => js_trim($m[3])];
            }
        }
        if ($entry['kanji'] !== '') {
            $out[] = $entry;
        }
    }
    return $out;
}

/* -------------------------------------------------------------------- write */

/** Writes vocab.json, kanji.json and grammar-index.json to $dir (backend/data/, or a test's temp folder). */
function data_build(string $dir = BACKEND . '/data', bool $quiet = false): void
{
    $vocab = data_vocab();
    $kanji = data_kanji();
    $grammar = array_map(static fn (array $r): array => ['lesson' => data_number($r[0])] + (isset($r[1]) ? ['point' => $r[1]] : []) + (isset($r[2]) ? ['ref' => $r[2]] : []),
        tsv_read_all('grammar-index-part1.tsv', 'grammar-index-part2.tsv'));

    foreach (['vocab.json' => $vocab, 'kanji.json' => $kanji, 'grammar-index.json' => $grammar] as $file => $data) {
        file_put_contents("$dir/$file", json_pretty($data));
    }
    if ($quiet) {
        return;
    }

    $byLesson = [];
    foreach ($vocab as $v) {
        $byLesson[$v['lesson']] = ($byLesson[$v['lesson']] ?? 0) + 1;
    }
    ksort($byLesson);
    echo 'vocab entries : ' . count($vocab) . "\n";
    echo '  verbs       : ' . count(array_filter($vocab, static fn (array $v): bool => $v['verbClass'] !== null)) . "\n";
    echo '  adjectives  : ' . count(array_filter($vocab, static fn (array $v): bool => $v['adjClass'] !== null)) . "\n";
    echo '  by lesson   : ' . json_encode((object) $byLesson) . "\n";
    echo 'kanji         : ' . count($kanji) . "\n";
    echo 'grammar points: ' . count($grammar) . "\n";
}

if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    data_build();
}
