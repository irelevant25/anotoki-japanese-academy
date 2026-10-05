<?php
/**
 * Each person's own data as one file, and back (GET and PUT /api/me/data,
 * api/routes/me.php): every signed-in person may take all of theirs away and
 * bring it back, here or on another copy of the app.
 *
 * The file is a backup of one person (src/backup.php's format, version 2,
 * "everybody": false): their kanji progress with its settings and day counts,
 * their answer log, every exam attempt with its report, and their time zone.
 * It names no database (a website keeps that to itself) and holds none of the
 * site's own words.
 *
 * Bringing a file back replaces what the person has, all of it: never a
 * merge, so nothing is ever counted twice. It is one transaction that holds
 * their users row FOR UPDATE (users_lock()): an answer of theirs that arrives
 * meanwhile waits for it (users_hold()) and then works on what the file
 * brought, and two imports take turns. Inside it, before anything is
 * replaced, a copy of what is there goes to the backups
 * (academy-before-import-user-<id>-…, their last 14 kept). Whatever id the
 * file gives its person, the data becomes the caller's: another person's rows
 * are never read or written.
 *
 * Taken: a file of one person (whatever their id: a file of another copy of
 * the app), or of several (a backup of everybody) when one of them is the
 * caller, whose part is taken. Refused before anything changes, each with a
 * code the page words and a sentence for the logs and the tests:
 *   413 too_large {limit}     bigger than this server can take (me_import_limit())
 *   422 not_a_data_file       not JSON, not this app's format or version, nobody in it, or damaged
 *   422 several_people        several people, none of them the caller
 */

declare(strict_types=1);

/** The most an import takes, however much memory PHP may use. */
const IMPORT_LIMIT_MAX = 16 * 1024 * 1024;

/**
 * The share of PHP's memory_limit a file may be. Read into PHP, a data file
 * takes about seven times its size (a test measures it: tests/api/me.test.php);
 * the copy of what it replaces may take as much again, and the request
 * itself needs room.
 */
const IMPORT_MEMORY_SHARE = 24;

/**
 * How big a data file this server takes, in bytes: a share of memory_limit
 * ($memoryLimit: as php.ini writes it; this PHP's own when null), never more
 * than IMPORT_LIMIT_MAX. That is what limits an import: post_max_size counts
 * for a POSTed form only, and the file comes as the body of a PUT, which PHP
 * leaves to the app to read.
 */
function me_import_limit(?string $memoryLimit = null): int
{
    $bytes = me_ini_bytes($memoryLimit ?? (string) ini_get('memory_limit'));
    return $bytes <= 0 ? IMPORT_LIMIT_MAX : min(IMPORT_LIMIT_MAX, intdiv($bytes, IMPORT_MEMORY_SHARE));
}

/** A php.ini size ('128M', '1G', '512K', '1048576') in bytes; -1 (no limit) for '-1'. */
function me_ini_bytes(string $value): int
{
    $value = trim($value);
    if ($value === '' || $value === '-1') {
        return -1;
    }
    $number = (int) $value;
    switch (strtolower(substr($value, -1))) {
        case 'g':
            return $number * 1024 * 1024 * 1024;
        case 'm':
            return $number * 1024 * 1024;
        case 'k':
            return $number * 1024;
        default:
            return $number;
    }
}

/** All of this person's data, as the file GET /api/me/data gives. */
function me_export(int $uid): array
{
    $data = backup_data([$uid]);
    unset($data['database']);
    return $data;
}

/** The file's name: japanese-academy-2026-10-04.json, the day in the person's own time zone. */
function me_file_name(): string
{
    return 'japanese-academy-' . local_date() . '.json';
}

/**
 * A data file's text into this person's account, replacing what they have
 * (see the top of this file). $requestZone is the time zone the request
 * named: the file's is kept only when the request named none. Returns
 * {items, days, log, attempts, reports, copy}: what came in, and whether a
 * copy of what was there was kept first.
 */
function me_import(int $uid, string $text, ?string $requestZone): array
{
    $data = me_decode($text);
    unset($text);
    $person = me_person_in($data, $uid);
    unset($data);

    try {
        return db_tx(static function () use ($uid, $person, $requestZone): array {
            if (!users_lock($uid)) {
                users_ensure($uid);
                users_lock($uid);
            }
            $copy = users_has_rows($uid);
            if ($copy) {
                backup_person_copy('before-import', $uid);
            }
            // Replaced, all of it: the settings too, which a file may not have.
            db_exec('DELETE FROM srs_settings WHERE user_id = ?', [$uid]);
            $counts = learner_import($uid, $person, true);
            $zone = time_zone_known($person['timeZone'] ?? null);
            if ($requestZone === null && $zone !== null) {
                users_set_time_zone($uid, $zone);
            }
            db_exec(
                "INSERT INTO imports (user_id, source, summary) VALUES (?, 'file', ?::jsonb)
                 ON CONFLICT (user_id, source) DO UPDATE SET imported_at = now(), summary = EXCLUDED.summary",
                [$uid, json_text($counts)]
            );
            return $counts + ['copy' => $copy];
        });
    } catch (PDOException $e) {
        // A value the database will not take (a number out of range, a text that is no time): the file's fault.
        $state = (string) $e->getCode();
        if (str_starts_with($state, '22') || str_starts_with($state, '23')) {
            throw me_refused('That data file is damaged: the database does not take what it holds.');
        }
        throw $e;
    }
}

/** A data file's JSON, or a 422 not_a_data_file. */
function me_decode(string $text)
{
    if (trim($text) === '') {
        throw me_refused('That is not a Japanese Academy data file: it is empty.');
    }
    try {
        return json_decode($text, true, 64, JSON_THROW_ON_ERROR);
    } catch (JsonException $e) {
        throw me_refused('That is not a Japanese Academy data file: it is not JSON.');
    }
}

/**
 * This person's part of a data file: its only person, or the caller among
 * several; checked to be in the shape this app writes, so a damaged file is
 * refused before anything changes. Throws an HttpError 422.
 */
function me_person_in($data, int $uid): array
{
    if (!is_array($data) || ($data['format'] ?? null) !== BACKUP_FORMAT) {
        throw me_refused('That is not a Japanese Academy data file.');
    }
    if (($data['version'] ?? null) !== BACKUP_VERSION) {
        throw me_refused('That data file is from another version of Japanese Academy (format ' . js_string($data['version'] ?? null) . ').');
    }
    $people = is_array($data['users'] ?? null) ? array_values(array_filter($data['users'], 'is_array')) : [];
    if (!$people) {
        throw me_refused('That data file holds nobody\'s data.');
    }
    $person = null;
    if (count($people) === 1) {
        $person = $people[0];
    } else {
        foreach ($people as $p) {
            if (($p['id'] ?? null) === $uid) {
                $person = $p;
            }
        }
    }
    if ($person === null) {
        throw new HttpError(422, 'That file holds the data of ' . count($people) . ' people, and none of them is you: bring back a file of your own data.', [], 'several_people');
    }

    // In the shape the app writes (store_export(), backup_person()): the kanji progress an object of
    // version 1 with its items, day counts and settings (each an object, {} decoded as []), the log
    // and the attempts lists, all of them there. A person with none of it is no file of this app:
    // taken, it would replace everything they have with nothing.
    $object = static fn ($v): bool => is_array($v) && ($v === [] || !array_is_list($v));
    $list = static fn ($v): bool => is_array($v) && array_is_list($v);
    $kanji = $person['kanji'] ?? null;
    if (!is_array($kanji) || $kanji === [] || array_is_list($kanji) || ($kanji['version'] ?? null) !== 1
        || !$object($kanji['items'] ?? null) || !$object($kanji['daily'] ?? null) || !$object($kanji['settings'] ?? null)) {
        throw me_refused('That data file is damaged: its kanji progress is not as this app writes it.');
    }
    if (!$list($person['log'] ?? null)) {
        throw me_refused('That data file is damaged: its answer log is missing or not a list.');
    }
    if (!$list($person['attempts'] ?? null)) {
        throw me_refused('That data file is damaged: its exam attempts are missing or not a list.');
    }
    foreach ($person['attempts'] ?? [] as $a) {
        if (!is_array($a) || !is_array($a['attempt'] ?? null) || ms_from_iso($a['attempt']['finishedAt'] ?? null) === null
            || !is_scalar($a['attempt']['id'] ?? null) || (isset($a['report']) && !is_string($a['report']))) {
            throw me_refused('That data file is damaged: an exam attempt is not as this app writes it.');
        }
    }
    return $person;
}

/** The 422 of a file that is not a data file of this app, or a damaged one. */
function me_refused(string $sentence): HttpError
{
    return new HttpError(422, $sentence, [], 'not_a_data_file');
}

/** The 413 of a file bigger than this server takes ($limit, in bytes: the page says it). */
function me_too_large(int $limit): HttpError
{
    return new HttpError(413, 'That file is bigger than this server takes (' . $limit . ' bytes at most).', [], 'too_large', null, ['limit' => $limit]);
}
