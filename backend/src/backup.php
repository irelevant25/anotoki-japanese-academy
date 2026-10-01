<?php
/**
 * The study data outside the database, and back in.
 *
 * Backups, in backups/ at the repository's root (gitignored; on a hosted site
 * the site's backups/, beside public/):
 *   academy-2026-09-24.json                the day's copy, taken when the server starts or at the
 *                                          day's first page load (the last 14 are kept)
 *   academy-before-reset-user-<id>-<time>.json   before somebody's full reset of their kanji
 *                                          progress: that person's data alone (their last 14 are kept)
 *   academy-before-restore-<time>.json     before manage.php --restore replaces everything
 *   academy-before-owner-change-<time>.json   before the owner's data gets a new user id
 *                                          (manage.php --owner-id, or the setup page)
 *   academy-manual-<time>.json             php backend/manage.php --backup
 *   academy-before-migration-<time>.raw.json   every table as it was, before a migration
 *                                          is applied (see backup_write_raw())
 *   academy-before-language-delete-<code>-<time>.json   a language's own strings, before the owner
 *                                          deletes it (translations_copy() in src/translations.php):
 *                                          a flat {key: text}, not a backup of anybody's data
 * Each .json holds everything the database knows, per person: their kanji
 * progress, their answer log, every exam attempt with its report — of
 * everybody, or (a before-reset copy, "everybody": false) of the people it
 * names. php backend/manage.php --restore=<file> puts it back. This is format
 * version 2; version 1, from before people had user ids, held the owner's data
 * alone, and restores into the owner's account (auth.local_user_id).
 *
 * A copy of everybody also holds the app's own words, as the owner reworded
 * them: "translations", {languages, values: {code: {key: text}}}. They are the
 * site's, not anybody's study data: backup_read() and a restore pass them
 * over, and php backend/translations.php --import <code> <file> puts a
 * language's strings back from such a file.
 *
 * The import: the JSON files the app kept before it used a database
 * (progress/kanji.json, progress/kanji-log.jsonl, results/*.json,
 * reports/*.html). The setup page reads them once, into the owner's account in
 * an empty database. They are only read, never changed.
 */

declare(strict_types=1);

const BACKUP_FORMAT = 'japanese-academy-backup';
const BACKUP_VERSION = 2;
const DAILY_BACKUP = '/^academy-\d{4}-\d{2}-\d{2}\.json$/D';

/**
 * Where the backups go: backups/ at the repository's root. A throwaway
 * database of the tests (academy_test_…) keeps its copies elsewhere — the
 * folder its settings name (app.backups_dir), or one in the temp folder: they
 * must never pass for yours — a throwaway day's copy would stand in for your
 * day's backup and push your oldest copy out of the last 14.
 */
function backup_dir(): string
{
    if (config_is_test_db(db_name())) {
        $dir = config('app.backups_dir');
        return is_string($dir) && $dir !== ''
            ? str_replace('\\', '/', app_path($dir))
            : str_replace('\\', '/', sys_get_temp_dir()) . '/academy-backups-' . db_name();
    }
    return str_replace('\\', '/', ROOT) . '/backups';
}

/** Is there anybody's study data in the database? */
function learner_has_data(): bool
{
    return (bool) db_value('SELECT EXISTS (SELECT 1 FROM srs_progress) OR EXISTS (SELECT 1 FROM srs_daily)
        OR EXISTS (SELECT 1 FROM srs_log) OR EXISTS (SELECT 1 FROM exam_attempts)');
}

/** Has this person any study data here? (Settings alone are none.) */
function learner_has_data_of(int $uid): bool
{
    return (bool) db_value(
        'SELECT EXISTS (SELECT 1 FROM srs_progress WHERE user_id = ?) OR EXISTS (SELECT 1 FROM srs_daily WHERE user_id = ?)
            OR EXISTS (SELECT 1 FROM srs_log WHERE user_id = ?) OR EXISTS (SELECT 1 FROM exam_attempts WHERE user_id = ?)',
        [$uid, $uid, $uid, $uid]
    );
}

/** One person's data, in the shape a version-1 backup held the owner's. */
function backup_person(int $uid): array
{
    return ['kanji' => store_export($uid), 'log' => store_log_all($uid), 'attempts' => exam_attempts_all($uid)];
}

/**
 * Everything the database knows about everybody, in one document — or, given
 * $only (user ids), about those people alone: 'everybody' says which, and a
 * restore of the second kind replaces only their data. A copy of everybody
 * also holds 'translations', the app's own words as the owner reworded them
 * (translations_backup()): the format stays version 2, and older files stay
 * valid without it.
 */
function backup_data(?array $only = null): array
{
    return db_tx(static function () use ($only): array {
        $people = users_all();
        if ($only !== null) {
            $known = array_column($people, null, 'id');
            $people = array_map(static fn (int $id): array => $known[$id] ?? ['id' => $id, 'username' => null, 'createdAt' => null, 'lastSeenAt' => null], $only);
        }
        $data = [
            'format' => BACKUP_FORMAT,
            'version' => BACKUP_VERSION,
            'takenAt' => iso_time(now_ms()),
            'database' => db_name(),
            'everybody' => $only === null,
            'users' => array_map(static fn (array $u): array => $u + backup_person($u['id']), $people),
        ];
        // The site's own words go with a copy of everybody, never with one of some people alone.
        $translations = $only === null ? translations_backup() : null;
        return $translations !== null ? $data + ['translations' => $translations] : $data;
    });
}

/**
 * Writes a backup and returns its path. 'daily' names it after today;
 * anything else is a label with the time: academy-manual-20260924-143512-123.json.
 * One of some people alone ($only) names them: academy-before-reset-user-7-….json.
 * Written aside first, so a cut-off write never looks like a finished backup.
 */
function backup_write(string $label, ?array $only = null): string
{
    $dir = backup_dir();
    if (!is_dir($dir) && !mkdir($dir, 0777, true) && !is_dir($dir)) {
        throw new RuntimeException("Cannot create the backup folder $dir");
    }
    $now = now_ms();
    $name = $label === 'daily'
        ? 'academy-' . local_date($now) . '.json'
        : 'academy-' . $label . ($only !== null ? '-user-' . implode('-', $only) : '') . '-' . local_time($now)->format('Ymd-His-v') . '.json';
    $file = "$dir/$name";
    file_put_atomic($file, json_text(backup_data($only)) . "\n");
    return $file;
}

/**
 * Before somebody's full reset: their data alone. A reset changes nobody
 * else's, and a copy of everybody's at every reset would fill backups/ as
 * people come and go. Their last BACKUPS_KEEP copies are kept.
 */
function backup_before_reset(int $uid): string
{
    $file = backup_write('before-reset', [$uid]);
    $theirs = glob(backup_dir() . "/academy-before-reset-user-$uid-*.json") ?: [];
    sort($theirs); // the time in the name sorts as it reads
    foreach (array_slice($theirs, 0, max(0, count($theirs) - BACKUPS_KEEP)) as $old) {
        @unlink($old);
    }
    return $file;
}

/**
 * Before a migration: every table as it is, row by row, whatever its columns.
 * The regular backup reads the tables with this version's queries, which a
 * migration that has not run yet may not match. Put back by hand if ever
 * needed (it is plain JSON, one list of rows per table).
 */
function backup_write_raw(string $label): string
{
    $dir = backup_dir();
    if (!is_dir($dir) && !mkdir($dir, 0777, true) && !is_dir($dir)) {
        throw new RuntimeException("Cannot create the backup folder $dir");
    }
    $tables = [];
    foreach (db_all("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name") as $t) {
        $name = $t['table_name'];
        if (in_array($name, ['srs_items', 'exam_questions', 'content_state'], true)) {
            continue; // the study content: rebuilt from data/
        }
        $tables[$name] = json_decode((string) db_value('SELECT coalesce(json_agg(t), \'[]\') FROM "' . str_replace('"', '""', $name) . '" t'), true);
    }
    $now = now_ms();
    $file = "$dir/academy-$label-" . local_time($now)->format('Ymd-His-v') . '.raw.json';
    file_put_atomic($file, json_text(['format' => 'japanese-academy-tables', 'takenAt' => iso_time($now), 'database' => db_name(), 'tables' => $tables]) . "\n");
    return $file;
}

/**
 * The day's backup, if the database holds anything and today has none yet.
 * Keeps the last BACKUPS_KEEP daily copies. Runs when the server
 * starts, and at the first page load of a new day (for a server left running
 * overnight, and on a hosted site) — never inside an answer.
 */
function backup_daily(): ?string
{
    $file = backup_dir() . '/academy-' . local_date() . '.json';
    if (is_file($file) || !learner_has_data()) {
        return null;
    }
    backup_write('daily');
    $daily = array_values(array_filter(scandir(backup_dir()) ?: [], static fn (string $f): bool => (bool) preg_match(DAILY_BACKUP, $f)));
    sort($daily);
    foreach (array_slice($daily, 0, max(0, count($daily) - BACKUPS_KEEP)) as $old) {
        unlink(backup_dir() . "/$old");
    }
    return $file;
}

/** A backup file, checked to be one: version 1 (the owner's data) or 2 (everybody's). */
function backup_read(string $file): array
{
    $data = read_json($file);
    if (!is_array($data) || ($data['format'] ?? null) !== BACKUP_FORMAT) {
        throw new RuntimeException("$file is not a Japanese Academy backup.");
    }
    $version = $data['version'] ?? null;
    if ($version !== 1 && $version !== BACKUP_VERSION) {
        throw new RuntimeException("$file is a backup of another version of Japanese Academy (format " . js_string($version) . ').');
    }
    if ($version === BACKUP_VERSION && !is_array($data['users'] ?? null)) {
        throw new RuntimeException("$file is not a Japanese Academy backup (it lists no people).");
    }
    if ($version === BACKUP_VERSION && !array_filter($data['users'], 'is_array')) {
        throw new RuntimeException("$file holds nobody's data: there is nothing in it to restore or import.");
    }
    return $data;
}

/**
 * One person's data out of a backup (the setup page's import): all of a
 * version-1 file; from a version-2 file its only person, or the one with the
 * user id $pick when it holds several.
 */
function backup_person_in(array $data, ?int $pick = null): array
{
    if (($data['version'] ?? null) === 1) {
        return $data;
    }
    $people = array_values(array_filter($data['users'] ?? [], 'is_array'));
    if (count($people) === 1) {
        return $people[0];
    }
    foreach ($people as $person) {
        if ($pick !== null && (int) ($person['id'] ?? 0) === $pick) {
            return $person;
        }
    }
    if (!$people) {
        throw new RuntimeException('That backup holds nobody\'s data.');
    }
    $ids = implode(', ', array_map(static fn (array $p): string => js_string($p['id'] ?? '?'), $people));
    throw new RuntimeException('That backup holds the data of ' . count($people) . " people (user ids $ids), and none of them is user " . js_string($pick) . '.');
}

/**
 * Puts a backup back (manage.php --restore), in one transaction. A version-2
 * file of everybody is the whole database: everybody's study data is replaced
 * by the file's. One of some people alone (a before-reset copy) replaces
 * their data and nobody else's, as does a version-1 file, which is the
 * owner's (auth.local_user_id). A file that holds nobody is refused before
 * anything is deleted. Returns the counts, with 'people'.
 */
function backup_restore(array $data): array
{
    return db_tx(static function () use ($data): array {
        if (($data['version'] ?? null) === 1) {
            $owner = auth_local_user_id();
            users_ensure($owner);
            return ['people' => 1] + learner_import($owner, $data, true);
        }
        $people = array_values(array_filter(is_array($data['users'] ?? null) ? $data['users'] : [], 'is_array'));
        if (!$people) {
            throw new RuntimeException('That backup holds nobody\'s data, so nothing was restored.');
        }
        $tables = ['srs_progress', 'srs_daily', 'srs_log', 'exam_attempts', 'srs_settings'];
        $everybody = ($data['everybody'] ?? true) !== false; // files from before the flag are everybody's
        if ($everybody) {
            foreach ($tables as $table) {
                db_exec("DELETE FROM $table");
            }
        }
        $counts = ['people' => 0, 'items' => 0, 'days' => 0, 'log' => 0, 'attempts' => 0, 'reports' => 0];
        foreach ($people as $person) {
            $id = (int) ($person['id'] ?? 0);
            users_ensure($id);
            if (!$everybody) {
                foreach ($tables as $table) {
                    db_exec("DELETE FROM $table WHERE user_id = ?", [$id]);
                }
            }
            db_exec(
                'UPDATE users SET preferred_username = coalesce(?, preferred_username),
                    created_at = coalesce(academy_time(?), created_at), last_seen_at = coalesce(academy_time(?), last_seen_at) WHERE id = ?',
                [
                    is_string($person['username'] ?? null) ? $person['username'] : null,
                    is_int($person['createdAt'] ?? null) ? $person['createdAt'] : null,
                    is_int($person['lastSeenAt'] ?? null) ? $person['lastSeenAt'] : null,
                    $id,
                ]
            );
            foreach (learner_import($id, $person) as $key => $n) {
                $counts[$key] += $n;
            }
            $counts['people']++;
        }
        return $counts;
    });
}

/**
 * Writes a file aside, then renames it into place; retried, as Windows can
 * hold a fresh file for a moment. The file aside has a name of its own: two
 * requests writing the same file (the day's first page loads, say) never
 * write into one half-written copy.
 */
function file_put_atomic(string $file, string $content): void
{
    $tmp = $file . '.' . bin2hex(random_bytes(6)) . '.tmp';
    if (file_put_contents($tmp, $content) !== strlen($content)) {
        @unlink($tmp);
        throw new RuntimeException("Cannot write $tmp");
    }
    for ($i = 0; ; $i++) {
        try {
            rename($tmp, $file);
            return;
        } catch (ErrorException $e) {
            if ($i >= 8) {
                @unlink($tmp);
                throw $e;
            }
            usleep(25000 * ($i + 1));
        }
    }
}

/* ------------------------------------------------------------ the old files */

/**
 * The files the app kept before it used a database, under $root, as a
 * backup's data. 'problems' lists what could not be read and was left out.
 */
function legacy_read(string $root): array
{
    $data = ['kanji' => null, 'log' => [], 'attempts' => [], 'problems' => []];

    $kanji = "$root/progress/kanji.json";
    if (is_file($kanji)) {
        // an unreadable progress file stops the import: better nothing than half
        $data['kanji'] = read_json($kanji);
        if (!is_array($data['kanji'])) {
            throw new RuntimeException("$kanji is not a progress file.");
        }
    }

    $log = "$root/progress/kanji-log.jsonl";
    if (is_file($log)) {
        foreach (file($log, FILE_IGNORE_NEW_LINES) as $i => $line) {
            if (trim($line) === '') {
                continue;
            }
            $e = json_decode($line, true);
            if (!is_array($e) || !is_string($e['kind'] ?? null) || !is_numeric($e['t'] ?? null)) {
                $data['problems'][] = 'progress/kanji-log.jsonl line ' . ($i + 1) . ': not a log line';
                continue;
            }
            $data['log'][] = $e;
        }
    }

    $results = glob("$root/results/*.json") ?: [];
    sort($results);
    $matched = [];
    foreach ($results as $file) {
        $id = basename($file, '.json');
        try {
            $attempt = read_json($file);
        } catch (Throwable $e) {
            $data['problems'][] = "results/$id.json: unreadable";
            continue;
        }
        if (!is_array($attempt) || ms_from_iso($attempt['finishedAt'] ?? null) === null || !is_array($attempt['summary'] ?? null)) {
            $data['problems'][] = "results/$id.json: not an exam attempt";
            continue;
        }
        $attempt['id'] = $id;
        $report = "$root/reports/$id.html";
        $data['attempts'][] = ['attempt' => $attempt, 'report' => is_file($report) ? file_get_contents($report) : null];
        $matched[$id] = true;
    }
    foreach (glob("$root/reports/*.html") ?: [] as $file) {
        if (!isset($matched[basename($file, '.html')])) {
            $data['problems'][] = 'reports/' . basename($file) . ': no attempt in results/ to go with it';
        }
    }
    return $data;
}

/* ------------------------------------------------------------------ import */

/**
 * Puts one person's study data — from a backup, or the old files — into the
 * database as user $uid's, in one transaction. $replace empties their data
 * first (a restore); without it they must not have any yet, so nothing is
 * ever counted twice. Their users row must exist.
 */
function learner_import(int $uid, array $data, bool $replace = false): array
{
    return db_tx(static function () use ($uid, $data, $replace): array {
        if ($replace) {
            foreach (['srs_progress', 'srs_daily', 'srs_log', 'exam_attempts'] as $table) {
                db_exec("DELETE FROM $table WHERE user_id = ?", [$uid]);
            }
        } elseif (learner_has_data_of($uid)) {
            throw new RuntimeException("The database already holds study data of user $uid; nothing was imported.");
        }
        $counts = ['items' => 0, 'days' => 0, 'log' => 0, 'attempts' => 0, 'reports' => 0];

        $k = is_array($data['kanji'] ?? null) ? $data['kanji'] : null;
        if ($k) {
            $s = is_array($k['settings'] ?? null) ? $k['settings'] : [];
            $batch = js_number($s['batchSize'] ?? 5);
            store_save_settings($uid, [
                'batchSize' => is_nan((float) $batch) || $batch == 0 ? 5 : max(1, min(20, (int) floor($batch))),
                'lessonTypes' => in_array($s['lessonTypes'] ?? null, ['both', 'kanji', 'vocab'], true) ? $s['lessonTypes'] : 'both',
                'autoplay' => array_key_exists('autoplay', $s) ? js_truthy($s['autoplay']) : true,
            ]);
            foreach (is_array($k['items'] ?? null) ? $k['items'] : [] as $id => $state) {
                store_put($uid, (string) $id, is_array($state) ? $state : [], false);
                $counts['items']++;
            }
            foreach (is_array($k['daily'] ?? null) ? $k['daily'] : [] as $day => $d) {
                if (!preg_match('/^\d{4}-\d{2}-\d{2}$/D', (string) $day) || !is_array($d)) {
                    continue;
                }
                $n = static fn (string $key): int => is_numeric($d[$key] ?? null) ? (int) $d[$key] : 0;
                db_exec(
                    'INSERT INTO srs_daily (user_id, day, lessons, reviews, reviews_correct, practice, practice_correct) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [$uid, (string) $day, $n('lessons'), $n('reviews'), $n('reviewsCorrect'), $n('practice'), $n('practiceCorrect')]
                );
                $counts['days']++;
            }
            // last, so the saves above don't count as a change
            $now = now_ms();
            db_exec(
                'UPDATE srs_settings SET created_at = academy_time(?), updated_at = academy_time(?) WHERE user_id = ?',
                [is_numeric($k['createdAt'] ?? null) ? (int) $k['createdAt'] : $now, is_numeric($k['updatedAt'] ?? null) ? (int) $k['updatedAt'] : $now, $uid]
            );
        }

        $rows = [];
        foreach (is_array($data['log'] ?? null) ? $data['log'] : [] as $e) {
            if (!is_array($e) || !is_string($e['kind'] ?? null) || !is_numeric($e['t'] ?? null)) {
                continue;
            }
            $details = $e;
            unset($details['t'], $details['kind'], $details['id']);
            $rows[] = [(int) $e['t'], $e['kind'], isset($e['id']) ? js_string($e['id']) : null, $details ?: new stdClass()];
        }
        if ($rows) {
            db_exec(
                'INSERT INTO srs_log (user_id, at, kind, item_id, details)
                 SELECT ?::bigint, academy_time((r->>0)::bigint), r->>1, r->>2, r->3 FROM json_array_elements(?::json) WITH ORDINALITY AS t(r, n) ORDER BY n',
                [$uid, json_text($rows)]
            );
            $counts['log'] = count($rows);
        }

        foreach (is_array($data['attempts'] ?? null) ? $data['attempts'] : [] as $a) {
            if (!is_array($a['attempt'] ?? null)) {
                continue;
            }
            exam_save_attempt($uid, $a['attempt'], is_string($a['report'] ?? null) ? $a['report'] : null);
            $counts['attempts']++;
            $counts['reports'] += is_string($a['report'] ?? null) ? 1 : 0;
        }
        return $counts;
    });
}

/** Has the setup page imported the old files into this person's account already? */
function legacy_imported(int $uid): bool
{
    return (bool) db_value("SELECT EXISTS (SELECT 1 FROM imports WHERE source = 'json-files' AND user_id = ?)", [$uid]);
}

/**
 * The first-run import of progress/, results/ and reports/ under $root into
 * user $uid's account (the owner's): only when they have no study data yet,
 * and only once. Returns what was imported, or a reason it wasn't.
 */
function legacy_import(string $root, int $uid): array
{
    if (legacy_imported($uid)) {
        return ['skipped' => 'already imported'];
    }
    // before reading any file: somebody who has study data here needs none of them
    if (learner_has_data_of($uid)) {
        return ['skipped' => 'the database already holds study data'];
    }
    $data = legacy_read($root);
    if (!$data['kanji'] && !$data['log'] && !$data['attempts']) {
        return ['skipped' => 'no progress/, results/ or reports/ files to import'];
    }
    return db_tx(static function () use ($data, $root, $uid): array {
        users_ensure($uid);
        $counts = learner_import($uid, $data);
        $summary = $counts + ['from' => str_replace('\\', '/', $root), 'problems' => $data['problems']];
        db_exec("INSERT INTO imports (user_id, source, summary) VALUES (?, 'json-files', ?::jsonb)", [$uid, json_text($summary)]);
        return $summary;
    });
}

/**
 * One person's data from a backup file into user $uid's account, who has no
 * study data yet (the setup page: the owner's data, brought from their
 * computer to the hosted site). Recorded in imports.
 */
function backup_import_person(array $data, int $uid, string $from): array
{
    $person = backup_person_in($data, $uid);
    return db_tx(static function () use ($person, $uid, $from): array {
        users_ensure($uid);
        $counts = learner_import($uid, $person);
        db_exec(
            "INSERT INTO imports (user_id, source, summary) VALUES (?, 'backup', ?::jsonb)
             ON CONFLICT (user_id, source) DO UPDATE SET imported_at = now(), summary = EXCLUDED.summary",
            [$uid, json_text($counts + ['from' => $from])]
        );
        return $counts;
    });
}
