<?php
/**
 * Small helpers shared by the whole app: time, JSON, and the few places where
 * PHP and JavaScript disagree about numbers and strings.
 *
 * The question bank, the exam papers and the SRS schedule were first written in
 * JavaScript, and a paper is rebuilt from its seed alone, so the RNG, rounding
 * and string handling here reproduce what JavaScript does, bit for bit.
 */

declare(strict_types=1);

/* ------------------------------------------------------------------ time */

const HOUR_MS = 3600 * 1000;

/** Milliseconds since 1970, like Date.now(): every SRS time is kept in this unit. */
function now_ms(): int
{
    return (int) floor(microtime(true) * 1000);
}

/** A moment in this computer's time zone. */
function local_time(int $ms): DateTimeImmutable
{
    $sec = intdiv($ms, 1000) - ($ms % 1000 < 0 ? 1 : 0);
    $micro = ($ms - $sec * 1000) * 1000;
    return (new DateTimeImmutable('@' . $sec))
        ->setTimezone(new DateTimeZone(date_default_timezone_get()))
        ->modify('+' . $micro . ' microseconds');
}

/** Milliseconds of a DateTime. */
function ms_of(DateTimeInterface $d): int
{
    return $d->getTimestamp() * 1000 + intdiv((int) $d->format('u'), 1000);
}

/**
 * The moment a local wall-clock time ('2026-10-25 02:00:00') names. A time the
 * autumn change repeats is read as its first occurrence, as JavaScript's Date
 * reads it (PHP would take the second).
 */
function local_wall_ms(string $wall): int
{
    $ms = ms_of(new DateTimeImmutable($wall, new DateTimeZone(date_default_timezone_get())));
    $earlier = $ms - HOUR_MS;
    return local_time($earlier)->format('Y-m-d H:i:s') === local_time($ms)->format('Y-m-d H:i:s') ? $earlier : $ms;
}

/** 2026-09-24: the day in this computer's time zone (the daily counters are kept per day). */
function local_date(?int $ms = null): string
{
    return local_time($ms ?? now_ms())->format('Y-m-d');
}

/** 2026-09-24T08:15:02.123Z, as JavaScript's toISOString() writes it. */
function iso_time(int $ms): string
{
    return local_time($ms)->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\TH:i:s.v\Z');
}

/** Milliseconds of an ISO time, or null for anything that isn't one. */
function ms_from_iso($value): ?int
{
    if (!is_string($value) || $value === '') {
        return null;
    }
    try {
        return ms_of(new DateTimeImmutable($value));
    } catch (Exception $e) {
        return null;
    }
}

/* ------------------------------------------------------------------ JSON */

const JSON_FLAGS = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_LINE_TERMINATORS | JSON_THROW_ON_ERROR;

/** JSON as JavaScript writes it: UTF-8 and slashes as they are. */
function json_text($value): string
{
    return json_encode($value, JSON_FLAGS);
}

/**
 * JSON.stringify(value, null, indent): what the data builders write, so a
 * rebuild of unchanged data gives byte-identical files.
 */
function json_pretty($value, int $indent = 1): string
{
    $json = json_encode($value, JSON_FLAGS | JSON_PRETTY_PRINT);
    // PHP indents by four spaces; strings can't hold a raw newline, so every
    // line starts with its indentation only.
    return preg_replace_callback('/^( {4})+/m', static fn (array $m): string => str_repeat(' ', intdiv(strlen($m[0]), 4) * $indent), $json);
}

/** A JSON file as arrays; throws, naming the file, on anything that isn't valid JSON. */
function read_json(string $file)
{
    $text = @file_get_contents($file);
    if ($text === false) {
        throw new RuntimeException("Cannot read $file");
    }
    try {
        return json_decode($text, true, 512, JSON_THROW_ON_ERROR);
    } catch (JsonException $e) {
        throw new RuntimeException("$file is not valid JSON ({$e->getMessage()})", 0, $e);
    }
}

/* --------------------------------------------------- JavaScript semantics */

/** Math.round: halves go up (towards +∞). */
function js_round(float $x): float
{
    return floor($x + 0.5);
}

/**
 * Number.prototype.toFixed: the nearest decimal to the double's exact value,
 * the larger one on a tie. (sprintf rounds ties to even, number_format rounds
 * the already-rounded value; both differ from JavaScript now and then.)
 */
function js_to_fixed(float $x, int $digits): string
{
    // the double's exact decimal expansion, well past any digit that decides the rounding
    [$int, $frac] = explode('.', sprintf('%.40F', abs($x)));
    $kept = $int . substr($frac, 0, $digits);
    $rest = substr($frac, $digits);
    if (strcmp($rest, '5' . str_repeat('0', strlen($rest) - 1)) >= 0) {
        $i = strlen($kept) - 1;
        while ($i >= 0 && $kept[$i] === '9') {
            $kept[$i] = '0';
            $i--;
        }
        $kept = $i < 0 ? '1' . $kept : substr($kept, 0, $i) . chr(ord($kept[$i]) + 1) . substr($kept, $i + 1);
    }
    $out = $digits ? substr($kept, 0, -$digits) . '.' . substr($kept, -$digits) : $kept;
    return ($x < 0 ? '-' : '') . $out;
}

/** JavaScript's whitespace, for trim(). */
const JS_SPACE = '\t\n\x{0B}\f\r \x{A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}';

/** String.prototype.trim. */
function js_trim(string $s): string
{
    return preg_replace('/^[' . JS_SPACE . ']+|[' . JS_SPACE . ']+$/u', '', $s);
}

/** String(value): what JavaScript prints for a value. */
function js_string($v): string
{
    if ($v === null) {
        return 'null';
    }
    if (is_bool($v)) {
        return $v ? 'true' : 'false';
    }
    if (is_float($v)) {
        return is_finite($v) ? json_encode($v) : (is_nan($v) ? 'NaN' : ($v > 0 ? 'Infinity' : '-Infinity'));
    }
    if (is_array($v)) {
        return array_is_list($v) ? implode(',', array_map(static fn ($x): string => $x === null ? '' : js_string($x), $v)) : '[object Object]';
    }
    return (string) $v;
}

/**
 * Number(value). A whole number comes back as an int, so it compares equal to
 * the lesson numbers; NaN comes back as NAN.
 */
function js_number($v)
{
    if (is_int($v)) {
        return $v;
    }
    if (is_float($v)) {
        return is_finite($v) && floor($v) === $v && abs($v) < 2 ** 53 ? (int) $v : $v;
    }
    if ($v === null || $v === false) {
        return 0;
    }
    if ($v === true) {
        return 1;
    }
    if (is_string($v)) {
        $t = js_trim($v);
        if ($t === '') {
            return 0;
        }
        if (preg_match('/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i', $t)) {
            return js_number((float) $t);
        }
        if (preg_match('/^0x[0-9a-f]+$/i', $t)) {
            return hexdec(substr($t, 2));
        }
        return NAN;
    }
    if (is_array($v)) {
        if ($v === []) {
            return 0;
        }
        return array_is_list($v) && count($v) === 1 ? js_number(is_array($v[0]) ? js_string($v[0]) : $v[0]) : NAN;
    }
    return NAN;
}

/** JavaScript truthiness: '', 0, NaN, null and false are falsy — the string '0' is not. */
function js_truthy($v): bool
{
    if (is_string($v)) {
        return $v !== '';
    }
    if (is_float($v)) {
        return $v != 0 && !is_nan($v);
    }
    if (is_array($v)) {
        return true; // an array or an object
    }
    return (bool) $v;
}

/** The characters of a string (code points; the data has nothing outside the BMP). */
function chars(string $s): array
{
    return $s === '' ? [] : mb_str_split($s);
}

/** A string's length as JavaScript counts it: UTF-16 code units. */
function js_len(string $s): int
{
    return intdiv(strlen(mb_convert_encoding($s, 'UTF-16LE', 'UTF-8')), 2);
}

/** A string's UTF-16 code units, as charCodeAt() reads them. */
function utf16_units(string $s): array
{
    return $s === '' ? [] : array_values(unpack('n*', mb_convert_encoding($s, 'UTF-16BE', 'UTF-8')));
}

/** First $n characters (String.prototype.slice(0, n) for BMP text). */
function str_clip(string $s, int $n): string
{
    return mb_substr($s, 0, $n);
}

/** Array.prototype.includes — strict, and NaN finds NaN. */
function js_includes(array $list, $v): bool
{
    if (is_float($v) && is_nan($v)) {
        foreach ($list as $x) {
            if (is_float($x) && is_nan($x)) {
                return true;
            }
        }
        return false;
    }
    return in_array($v, $list, true);
}

/** [...new Set(list)]: the distinct values, first occurrence first. */
function unique_list(array $list): array
{
    $seen = [];
    $out = [];
    foreach ($list as $v) {
        $k = is_string($v) ? 's' . $v : gettype($v) . ':' . var_export($v, true);
        if (!isset($seen[$k])) {
            $seen[$k] = true;
            $out[] = $v;
        }
    }
    return $out;
}

/* --------------------------------------------------------- 32-bit integers */

/** ToInt32: wrap to a signed 32-bit integer. */
function int32(int $x): int
{
    $x &= 0xFFFFFFFF;
    return $x >= 0x80000000 ? $x - 0x100000000 : $x;
}

/** x >>> n: unsigned 32-bit shift right. */
function urshift(int $x, int $n): int
{
    return ($x & 0xFFFFFFFF) >> $n;
}

/** Math.imul: the low 32 bits of a 32-bit product, signed. */
function imul(int $a, int $b): int
{
    $a &= 0xFFFFFFFF;
    $b &= 0xFFFFFFFF;
    $lo = ($a & 0xFFFF) * ($b & 0xFFFF);
    $mid = ((($a >> 16) * ($b & 0xFFFF) + ($a & 0xFFFF) * ($b >> 16)) & 0xFFFF) << 16;
    return int32($lo + $mid);
}
