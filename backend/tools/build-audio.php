<?php
/**
 * Makes the vocabulary audio with Google Cloud Text-to-Speech: every word the
 * kanji trainer or the exam can play, in two voices (female and male).
 *
 *   php backend/tools/build-audio.php                make the missing clips, drop unused ones
 *   php backend/tools/build-audio.php --dry-run      count what would be sent; needs no key
 *   php backend/tools/build-audio.php --limit 20     make at most 20 clips, for a quick try
 *
 * (By hand where an older php comes first on PATH: node backend/tools/php.js
 * backend/tools/build-audio.php …) The API key comes from GOOGLE_TTS_API_KEY,
 * or from a .env file in backend/ (gitignored; see README). A clip is made once: each records the recipe
 * and voice that made it, and a rebuild only sends the words that have no
 * current clip. The clips go to backend/data/audio/ under random names and are listed
 * in backend/data/audio.json, which backend/src/speech.php reads. Ctrl+C stops cleanly: every
 * clip made so far stays listed.
 */

declare(strict_types=1);

require_once __DIR__ . '/../src/bootstrap.php';

const TTS_ENDPOINT = 'https://texttospeech.googleapis.com/v1/text:synthesize';

const VOICES = [
    ['id' => 'f', 'name' => 'ja-JP-Neural2-B', 'label' => 'female'],
    ['id' => 'm', 'name' => 'ja-JP-Neural2-C', 'label' => 'male'],
];

// Everything else that decides how a clip sounds. Change it, and every clip is
// made again on the next build.
const AUDIO_RECIPE = 'google-tts/v1 mp3 rate=1 kanji+yomigana';

// Google counts requests per minute. At most 10 a second stays under the quota
// of a new project; a 429 still waits for the minute to turn.
const GAP_SECONDS = 0.1;

/** A request Google refused or failed, with its HTTP status. */
final class TtsError extends RuntimeException
{
    public int $status;

    public function __construct(int $status, string $message)
    {
        parent::__construct($message);
        $this->status = $status;
    }
}

/** Every word that gets audio: the vocabulary list and the trainer's vocabulary. */
function audio_words(): array
{
    $content = content_load();
    $byKey = [];
    $add = static function (?array $s) use (&$byKey): void {
        if ($s && !isset($byKey[$s['key']])) {
            $byKey[$s['key']] = $s;
        }
    };
    foreach ($content['vocab'] as $v) {
        $add(speech_spoken($v['kana'], $v['kanji'] ?? null));
    }
    foreach (catalog_build($content)['items'] as $it) {
        if ($it['type'] === 'vocab') {
            $add(speech_spoken($it['readings'][0], $it['chars']));
        }
    }
    $keys = array_map('strval', array_keys($byKey));
    sort($keys, SORT_STRING);
    return array_map(static fn (string $k): array => $byKey[$k], $keys);
}

function audio_escape_xml(string $s): string
{
    return preg_replace_callback('/[&<>"\']/', static fn (array $m): string => '&#' . ord($m[0]) . ';', $s);
}

/** The request for one clip. A kanji word is sent with its reading as yomigana. */
function audio_request(array $s, array $voice): array
{
    $input = $s['text'] === $s['reading']
        ? ['text' => $s['reading']]
        : ['ssml' => '<speak><phoneme alphabet="yomigana" ph="' . audio_escape_xml($s['reading']) . '">' . audio_escape_xml($s['text']) . '</phoneme></speak>'];
    return [
        'input' => $input,
        'voice' => ['languageCode' => 'ja-JP', 'name' => $voice['name']],
        'audioConfig' => ['audioEncoding' => 'MP3', 'speakingRate' => 1],
    ];
}

/** What Google bills for a request: the characters of the text, or of the SSML. */
function audio_billed(array $req): int
{
    return js_len($req['input']['text'] ?? $req['input']['ssml']);
}

/** One clip from Google, paced, and retried while the service is busy. */
function audio_google_synth(string $key): Closure
{
    $nextAt = 0.0;
    return static function (array $req) use ($key, &$nextAt): string {
        for ($attempt = 1; ; $attempt++) {
            $now = microtime(true);
            $at = max($now, $nextAt);
            $nextAt = $at + GAP_SECONDS;
            if ($at > $now) {
                usleep((int) (($at - $now) * 1e6));
            }
            $ch = curl_init(TTS_ENDPOINT);
            curl_setopt_array($ch, [
                CURLOPT_POST => true,
                // in a header, so the key never appears in a logged URL
                CURLOPT_HTTPHEADER => ['Content-Type: application/json', "X-Goog-Api-Key: $key"],
                CURLOPT_POSTFIELDS => json_text($req),
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 60,
                // PHP on Windows usually has no CA bundle of its own: use Windows' certificates
            ] + (PHP_OS_FAMILY === 'Windows' && defined('CURLSSLOPT_NATIVE_CA') ? [CURLOPT_SSL_OPTIONS => CURLSSLOPT_NATIVE_CA] : []));
            $body = curl_exec($ch);
            $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
            $error = curl_error($ch);
            if ($body === false) {
                throw new RuntimeException("Cannot reach Text-to-Speech: $error");
            }
            if ($status >= 200 && $status < 300) {
                $mp3 = base64_decode((string) (json_decode((string) $body, true)['audioContent'] ?? ''), true);
                if (!$mp3) {
                    throw new RuntimeException('Text-to-Speech sent no audio.');
                }
                return $mp3;
            }
            $detail = mb_substr(preg_replace('/\s+/u', ' ', (string) $body), 0, 300);
            // quota: 5, 10, 20, 40, 60, 60 … s; server trouble: 1, 2, 4, 8, 16 s
            if ($status === 429 && $attempt < 9) {
                sleep(min(60, 5 * 2 ** ($attempt - 1)));
                continue;
            }
            if ($status >= 500 && $attempt < 6) {
                sleep(2 ** ($attempt - 1));
                continue;
            }
            throw new TtsError($status, "Text-to-Speech answered $status: $detail");
        }
    };
}

/**
 * The index as the builder needs it. A missing file means no clips yet; an
 * unreadable one stops the build, because treating it as empty would make
 * every clip again and then delete all the old ones.
 */
function audio_load_index(string $file): array
{
    if (!is_file($file)) {
        return ['recipe' => null, 'voices' => [], 'clips' => [], 'made' => []];
    }
    $idx = json_decode((string) file_get_contents($file), true);
    if (!is_array($idx) || !is_array($idx['voices'] ?? null) || !array_is_list($idx['voices']) || !is_array($idx['clips'] ?? null)) {
        throw new RuntimeException("$file is unreadable. Restore it (git checkout -- backend/data/audio.json) before building.");
    }
    return $idx + ['made' => []];
}

/** One word per line, sorted, so a rebuild reads as a small diff. Replaced atomically. */
function audio_write_index(array $index, string $file): void
{
    $block = static function (array $obj): string {
        $keys = array_map('strval', array_keys($obj));
        sort($keys, SORT_STRING);
        return implode(",\n", array_map(static fn (string $k): string => '  ' . json_text($k) . ': ' . ($obj[$k] === [] ? '{}' : json_text($obj[$k])), $keys));
    };
    $json = "{\n \"recipe\": " . json_text($index['recipe']) . ",\n \"voices\": " . json_text($index['voices']) . ",\n"
        . " \"clips\": {\n" . $block($index['clips']) . "\n },\n"
        . " \"made\": {\n" . $block($index['made']) . "\n }\n}\n";
    file_put_atomic($file, $json);
}

/** Keeps the stamps of the clips the index still lists. */
function audio_prune(array $index): array
{
    $used = [];
    foreach ($index['clips'] as $clips) {
        foreach ($clips as $f) {
            $used[$f] = true;
        }
    }
    $index['made'] = array_filter($index['made'], static fn ($f): bool => isset($used[(string) $f]), ARRAY_FILTER_USE_KEY);
    return $index;
}

/**
 * Makes the missing clips and writes the index. A clip is current when it was
 * made with this recipe and this voice. If a request fails, or the run is
 * stopped, the index still lists every clip made so far and nothing is
 * deleted. A word Google refuses (400) is skipped and reported; the rest go on.
 *
 * @param array $o synth (fn(array $request): string mp3), words, dir, indexFile,
 *                 recipe, voices, dryRun, limit, shouldStop (fn(): bool), log (fn(string))
 */
function audio_build(array $o): array
{
    $o += [
        'synth' => null,
        'dir' => AUDIO_CLIPS,
        'indexFile' => AUDIO_INDEX,
        'recipe' => AUDIO_RECIPE,
        'voices' => VOICES,
        'dryRun' => false,
        'limit' => PHP_INT_MAX,
        'shouldStop' => static fn (): bool => false,
        'log' => static function (string $line): void {
            echo $line, "\n";
        },
    ];
    $words = $o['words'] ?? audio_words();
    ['dir' => $dir, 'recipe' => $recipe, 'voices' => $voices, 'log' => $log] = $o;

    $old = audio_load_index($o['indexFile']);
    $oldVoice = array_column($old['voices'], 'name', 'id');
    // an index from before clips were stamped: its clips share its recipe and voices
    $stampOf = static fn (string $file, string $voiceId): ?string => $old['made'][$file]
        ?? ($old['recipe'] && isset($oldVoice[$voiceId]) ? "{$old['recipe']}|{$oldVoice[$voiceId]}" : null);

    $index = ['recipe' => $recipe, 'voices' => $voices, 'clips' => [], 'made' => []];
    $todo = [];
    foreach ($words as $s) {
        $had = $old['clips'][$s['key']] ?? [];
        $index['clips'][$s['key']] = [];
        foreach ($voices as $voice) {
            $file = $had[$voice['id']] ?? null;
            $exists = is_string($file) && preg_match(CLIP_NAME, $file) && is_file("$dir/$file");
            if ($exists) {
                $index['clips'][$s['key']][$voice['id']] = $file; // an outdated clip plays until its new one is made
                $index['made'][$file] = $stampOf($file, $voice['id']) ?? 'unknown';
            }
            if (!$exists || $index['made'][$file] !== "$recipe|{$voice['name']}") {
                $todo[] = ['s' => $s, 'voice' => $voice];
            }
        }
    }
    $batch = array_slice($todo, 0, $o['limit']);
    $chars = array_sum(array_map(static fn (array $t): int => audio_billed(audio_request($t['s'], $t['voice'])), $batch));
    $log(count($words) . ' words in ' . count($voices) . ' voices: ' . count($todo) . ' clip(s) to make'
        . (count($batch) < count($todo) ? ', ' . count($batch) . ' this time' : '') . " ($chars characters)");
    if ($o['dryRun']) {
        return ['made' => 0, 'removed' => 0, 'skipped' => [], 'todo' => count($todo), 'chars' => $chars];
    }

    if (!is_dir($dir)) {
        mkdir($dir, 0777, true);
    }
    $made = 0;
    $taken = 0;
    $skipped = [];
    try {
        foreach ($batch as ['s' => $s, 'voice' => $voice]) {
            if (($o['shouldStop'])()) {
                break;
            }
            $taken++;
            try {
                $mp3 = ($o['synth'])(audio_request($s, $voice));
            } catch (TtsError $e) {
                if ($e->status !== 400) {
                    throw $e;
                }
                $skipped[] = "{$s['key']} ({$voice['label']}): {$e->getMessage()}";
                continue;
            }
            // straight to its final name: a clip cut off by a crash is in no index,
            // and the next complete run removes it
            $name = bin2hex(random_bytes(8)) . '.mp3';
            file_put_contents("$dir/$name", $mp3);
            $index['clips'][$s['key']][$voice['id']] = $name;
            $index['made'][$name] = "$recipe|{$voice['name']}";
            $made++;
            if ($made % 100 === 0) {
                $log("  $made / " . count($batch));
                audio_write_index(audio_prune($index), $o['indexFile']);
            }
        }
    } finally {
        audio_write_index(audio_prune($index), $o['indexFile']);
    }
    if ($skipped) {
        $log('skipped ' . count($skipped) . " clip(s) Google refused:\n  " . implode("\n  ", $skipped));
    }

    // Only after a complete run: clips no word uses any more (the word left the
    // lists, or was voiced again).
    $removed = 0;
    if ($taken === count($todo)) {
        $used = audio_prune($index)['made'];
        foreach (scandir($dir) ?: [] as $f) {
            if (preg_match(CLIP_NAME, $f) && !isset($used[$f])) {
                unlink("$dir/$f");
                $removed++;
            }
        }
    }
    return ['made' => $made, 'removed' => $removed, 'skipped' => $skipped, 'todo' => count($todo), 'chars' => $chars, 'stopped' => $taken < count($batch)];
}

/** GOOGLE_TTS_API_KEY from the environment, or from backend/.env. */
function audio_api_key(): string
{
    $key = (string) getenv('GOOGLE_TTS_API_KEY');
    $env = BACKEND . '/.env';
    if ($key === '' && is_file($env)) {
        foreach (file($env, FILE_IGNORE_NEW_LINES) as $line) {
            if (preg_match('/^\s*(?:export\s+)?GOOGLE_TTS_API_KEY\s*=\s*(.*?)\s*$/', $line, $m)) {
                $key = trim($m[1], "\"' ");
            }
        }
    }
    $key = trim($key);
    if ($key === '') {
        throw new RuntimeException('No API key: put GOOGLE_TTS_API_KEY=<your key> in .env (see README).');
    }
    return $key;
}

/** --limit 20 or --limit=20; anything else there is a mistake. */
function audio_limit_arg(array $args): int
{
    foreach ($args as $i => $a) {
        if ($a === '--limit' || str_starts_with($a, '--limit=')) {
            $raw = str_contains($a, '=') ? explode('=', $a, 2)[1] : ($args[$i + 1] ?? '');
            if (!preg_match('/^[1-9]\d*$/D', $raw)) {
                throw new RuntimeException('--limit needs a whole number of clips, e.g. --limit 20');
            }
            return (int) $raw;
        }
    }
    return PHP_INT_MAX;
}

if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    $stopping = false;
    $stop = static function () use (&$stopping): void {
        if (!$stopping) {
            echo "\nstopping after the clip in flight…\n";
        }
        $stopping = true;
    };
    if (function_exists('sapi_windows_set_ctrl_handler')) {
        sapi_windows_set_ctrl_handler(static fn (int $event) => $stop());
    } elseif (function_exists('pcntl_signal')) {
        pcntl_async_signals(true);
        pcntl_signal(SIGINT, static fn () => $stop());
    }
    try {
        $args = array_slice($argv, 1);
        $dryRun = in_array('--dry-run', $args, true);
        $r = audio_build([
            'synth' => $dryRun ? null : audio_google_synth(audio_api_key()),
            'dryRun' => $dryRun,
            'limit' => audio_limit_arg($args),
            // a closure over $stopping itself: an arrow function would copy it, false for good
            'shouldStop' => static function () use (&$stopping): bool {
                return $stopping;
            },
        ]);
        if ($dryRun) {
            exit(0);
        }
        $files = array_values(array_filter(scandir(AUDIO_CLIPS) ?: [], static fn (string $f): bool => (bool) preg_match(CLIP_NAME, $f)));
        $mb = array_sum(array_map(static fn (string $f): int => (int) filesize(AUDIO_CLIPS . "/$f"), $files)) / 1048576;
        echo "made {$r['made']}, removed {$r['removed']}" . ($r['stopped'] ? ', stopped early' : '') . '; '
            . 'backend/data/audio has ' . count($files) . ' clips (' . js_to_fixed($mb, 1) . " MB)\n";
        exit($r['stopped'] || $r['skipped'] ? 1 : 0);
    } catch (Throwable $e) {
        fwrite(STDERR, $e->getMessage() . "\n");
        exit(1);
    }
}
