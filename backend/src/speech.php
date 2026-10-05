<?php
/**
 * Spoken audio for the vocabulary: what a word is spoken as, and which clips
 * hold it. Shared by the audio builder (backend/tools/build-audio.php), the exam's
 * listening questions and the kanji trainer's catalog, so all three agree on
 * which clip belongs to which word.
 *
 *   backend/data/audio.json  { recipe, voices: [{id, name, label}],
 *                      clips: { "<text>|<reading>": { <voice id>: "<name>.mp3" } },
 *                      made: { "<name>.mp3": "<recipe>|<voice name>" } }  (the builder's)
 *   backend/data/audio/      the clips. Their names are random, so the clip of a
 *                    listening question gives nothing away.
 */

declare(strict_types=1);

const AUDIO_INDEX = BACKEND . '/data/audio.json';
const AUDIO_CLIPS = BACKEND . '/data/audio';
const CLIP_NAME = '/^[0-9a-f]{16}\.mp3$/D';

/** The first spelling: a phrase put in order, optional parts, notes and punctuation dropped. */
function speech_clean(?string $s): string
{
    $s = explode('/', (string) $s)[0];
    $s = preg_replace('/\s*\+.*$/uD', '', $s); // "あまり + negative"
    // a phrase, not an optional part: かける(かぎを) → かぎをかける, 言う(文句を) → 文句を言う
    $s = preg_replace('/^(.+?)[（(]([^)）〜～]+[をにが])[)）]$/uD', '$2$1', $s);
    $s = preg_replace('/[（(]([^)）]*)[)）](?=[ぁ-ゖァ-ヺー])/u', '$1', $s); // inside a word: ほ(う)っておく → ほうっておく
    $s = preg_replace('/[（(][^)）]*[)）]/u', '', $s); // at the end: いじわる(な), 妹(さん), かける(めがねを)
    return preg_replace('/[。、！？!?\s]/u', '', $s);
}

/**
 * How a word is spoken: [text, reading, key], or null when it isn't voiced.
 * Kanji words keep their spelling and carry the reading, so 今日 can't come out
 * as こんにち. Suffixes and patterns (〜円, 〜か〜) and words with letters in
 * them (Lサイズ) are not voiced.
 */
function speech_spoken(?string $kana, ?string $kanji): ?array
{
    $reading = speech_clean($kana); // ください(〜を) → ください
    if (!preg_match('/^[ぁ-ゖァ-ヺー]+$/uD', $reading)) {
        return null;
    }
    $written = speech_clean($kanji);
    if (preg_match('/[〜～]/u', $written)) {
        return null;
    }
    $text = preg_match('/[一-龯々]/u', $written) ? $written : $reading;
    return ['text' => $text, 'reading' => $reading, 'key' => "$text|$reading"];
}

/** The index as built, or an empty one. */
function speech_read_index(string $file = AUDIO_INDEX): array
{
    try {
        $idx = read_json($file);
        if (is_array($idx) && is_array($idx['voices'] ?? null) && array_is_list($idx['voices']) && is_array($idx['clips'] ?? null)) {
            return $idx;
        }
    } catch (Throwable $e) {
        // no audio made yet
    }
    return ['recipe' => null, 'voices' => [], 'clips' => []];
}

/** The clips of a spoken word, one per voice in voice order, or null. */
function speech_clips_for(?array $spoken, array $index): ?array
{
    if (!$spoken) {
        return null;
    }
    $c = $index['clips'][$spoken['key']] ?? null;
    if (!is_array($c)) {
        return null;
    }
    $list = [];
    foreach ($index['voices'] as $voice) {
        $name = $c[$voice['id']] ?? null;
        if (js_truthy($name)) {
            $list[] = $name;
        }
    }
    return $list ?: null;
}
