<?php
/**
 * The study data outside the database, and back in.
 *
 * Backups, in backend/storage/backups/ (gitignored; on a hosted site the
 * same folder of the upload, outside the document root), each file the
 * site's own user's alone (0600, the folder 0700: file_put_atomic()'s
 * $private). Every date and time in a name is UTC, whoever's request wrote it:
 *   academy-2026-09-24.json                the day's copy, taken at the day's first page load
 *                                          (the last 14 are kept)
 *   academy-before-reset-user-<id>-<time>.json   before somebody's full reset of their kanji
 *                                          progress: that person's data alone (their last 14 are kept)
 *   academy-before-import-user-<id>-<time>.json  before somebody brings their data back from a
 *                                          file (src/me.php): what it replaces (their last 14 kept)
 *   academy-before-delete-user-<id>-<time>.json  before an administrator deletes somebody's
 *                                          data (src/people.php): all of it (their last 14 kept)
 *   academy-before-move-user-<id>-<time>.json    before what somebody studied without signing in
 *                                          moves into their account (src/visitors.php): theirs as it
 *                                          was (their last 14 kept)
 *   academy-before-restore-<time>.json     before manage.php --restore replaces everything
 *   academy-manual-<time>.json             php backend/manage.php --backup
 *   academy-before-migration-<time>.raw.json   every table as it was, before a migration
 *                                          is applied (see backup_write_raw())
 *   academy-before-language-delete-<code>-<time>.json   a language's own strings, before an
 *                                          administrator deletes it (translations_copy() in
 *                                          src/translations.php): a flat {key: text}, not a backup
 *                                          of anybody's data
 * Each .json holds everything the database knows, per person: their kanji
 * progress, their answer log, every exam attempt with its report, their time
 * zone — of everybody, or (a copy of somebody's data alone, "everybody":
 * false) of the people it names. Never a visitor's (src/visitors.php): a copy
 * of everybody holds people alone, and its restore deletes the visitors.
 * php backend/manage.php --restore=<file> puts
 * it back. This is format version 2, the format of a person's own data file
 * too (GET /api/me/data). Version 1, from before people had user ids, is no
 * longer read: every backup there is is version 2.
 *
 * A copy of everybody also holds the app's own words, as reworded in the
 * admin area: "translations", {languages, values: {code: {key: text}}}. They
 * are the site's, not anybody's study data: backup_read() and a restore pass
 * them over, and php backend/translations.php --import <code> <file> puts a
 * language's strings back from such a file.
 */

declare(strict_types=1);

const BACKUP_FORMAT = 'japanese-academy-backup';
const BACKUP_VERSION = 2;
const DAILY_BACKUP = '/^academy-\d{4}-\d{2}-\d{2}\.json$/D';

/**
 * Where the backups go: backend/storage/backups/. A throwaway
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
    return str_replace('\\', '/', BACKEND) . '/storage/backups';
}

/**
 * Is there anybody's study data in the database? People's only, unless
 * $visitorsToo: a visitor's (user_id < 0, src/visitors.php) is in no backup,
 * so it never makes a day's copy that would hold nobody and push a real one
 * out of the last 14 - but it is in the raw copy before a migration
 * (upkeep_copy_before(), which asks with $visitorsToo). Before migration 007
 * there are no visitors, and before 002 no user_id to ask by: every row is
 * somebody's.
 */
function learner_has_data(bool $visitorsToo = false): bool
{
    $whose = !$visitorsToo && visitors_ready() ? ' WHERE user_id > 0' : '';
    return (bool) db_value("SELECT EXISTS (SELECT 1 FROM srs_progress$whose) OR EXISTS (SELECT 1 FROM srs_daily$whose)
        OR EXISTS (SELECT 1 FROM srs_log$whose) OR EXISTS (SELECT 1 FROM exam_attempts$whose)");
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

/** One person's study data: their kanji progress (with their settings and day counts), answer log and exam attempts. */
function backup_person(int $uid): array
{
    return ['kanji' => store_export($uid), 'log' => store_log_all($uid), 'attempts' => exam_attempts_all($uid)];
}

/**
 * Everything the database knows about everybody, in one document — or, given
 * $only (user ids), about those people alone: 'everybody' says which, and a
 * restore of the second kind replaces only their data. A copy of everybody
 * also holds 'translations', the app's own words as reworded in the admin area
 * (translations_backup()): the format stays version 2, and older files stay
 * valid without it (or without a person's timeZone).
 */
function backup_data(?array $only = null): array
{
    return db_tx(static function () use ($only): array {
        $people = users_all();
        if ($only !== null) {
            $known = array_column($people, null, 'id');
            $people = array_map(static fn (int $id): array => $known[$id] ?? ['id' => $id, 'username' => null, 'createdAt' => null, 'lastSeenAt' => null, 'timeZone' => null], $only);
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
 * The date and the time are UTC's. A name already taken (two copies in the
 * same millisecond) gets -2, -3 …: a copy never replaces another.
 * Written aside first, so a cut-off write never looks like a finished backup,
 * and the site's own user's alone (0600, its folder 0700): it holds people's
 * names and study, and a hosted site shares its server with other people's
 * sites - as the library's backups beside it are.
 */
function backup_write(string $label, ?array $only = null): string
{
    $dir = backup_folder();
    $now = now_ms();
    if ($label === 'daily') {
        $file = "$dir/academy-" . utc_date($now) . '.json';
    } else {
        $stem = "$dir/academy-$label" . ($only !== null ? '-user-' . implode('-', $only) : '') . '-' . utc_stamp($now);
        $file = "$stem.json";
        for ($n = 2; is_file($file); $n++) {
            $file = "$stem-$n.json";
        }
    }
    file_put_atomic($file, json_text(backup_data($only)) . "\n", true);
    return $file;
}

/**
 * The backup folder (backup_dir()), made the first time - the site's own
 * user's alone (0700): it holds every copy of people's data, this site's and
 * the anotoki library's.
 */
function backup_folder(): string
{
    $dir = backup_dir();
    if (!is_dir($dir) && !mkdir($dir, 0700, true) && !is_dir($dir)) {
        throw new RuntimeException("Cannot create the backup folder $dir");
    }
    return $dir;
}

/**
 * Before somebody's full reset: their data alone. A reset changes nobody
 * else's, and a copy of everybody's at every reset would fill the backups as
 * people come and go. Their last BACKUPS_KEEP copies are kept.
 */
function backup_before_reset(int $uid): string
{
    return backup_person_copy('before-reset', $uid);
}

/**
 * A copy of one person's data alone, before something replaces or deletes it
 * ($label: before-reset, before-import, before-delete, before-move), keeping
 * their last BACKUPS_KEEP copies of that kind. Returns its path. Never of a
 * visitor's: a visitor has no data file (src/visitors.php).
 */
function backup_person_copy(string $label, int $uid): string
{
    if ($uid < 1) {
        throw new RuntimeException("A copy of a person's data, and $uid is no person.");
    }
    $file = backup_write($label, [$uid]);
    $theirs = glob(backup_dir() . "/academy-$label-user-$uid-*.json") ?: [];
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
 * needed (it is plain JSON, one list of rows per table). The site's own
 * user's alone (0600), as every copy.
 */
function backup_write_raw(string $label): string
{
    $dir = backup_folder();
    $tables = [];
    foreach (db_all("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name") as $t) {
        $name = $t['table_name'];
        if (in_array($name, ['srs_items', 'exam_questions', 'content_state'], true)) {
            continue; // the study content: rebuilt from backend/data/
        }
        $tables[$name] = json_decode((string) db_value('SELECT coalesce(json_agg(t), \'[]\') FROM "' . str_replace('"', '""', $name) . '" t'), true);
    }
    $now = now_ms();
    $file = "$dir/academy-$label-" . utc_stamp($now) . '.raw.json';
    file_put_atomic($file, json_text(['format' => 'japanese-academy-tables', 'takenAt' => iso_time($now), 'database' => db_name(), 'tables' => $tables]) . "\n", true);
    return $file;
}

/**
 * The day's backup, if the database holds anything and today has none yet.
 * The day is UTC's, whoever's page load it is: a person's own zone would let
 * somebody far east take tomorrow's copy today. Keeps the last BACKUPS_KEEP
 * daily copies. Runs at the first page load of a new day — never inside an
 * answer.
 */
function backup_daily(): ?string
{
    $file = backup_dir() . '/academy-' . utc_date() . '.json';
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

/** A backup file, checked to be one: version 2 (everybody's data, or some people's). */
function backup_read(string $file): array
{
    $data = read_json($file);
    if (!is_array($data) || ($data['format'] ?? null) !== BACKUP_FORMAT) {
        throw new RuntimeException("$file is not a Japanese Academy backup.");
    }
    $version = $data['version'] ?? null;
    if ($version !== BACKUP_VERSION) {
        throw new RuntimeException("$file is a backup of another version of Japanese Academy (format " . js_string($version) . ').');
    }
    if (!is_array($data['users'] ?? null)) {
        throw new RuntimeException("$file is not a Japanese Academy backup (it lists no people).");
    }
    if (!array_filter($data['users'], 'is_array')) {
        throw new RuntimeException("$file holds nobody's data: there is nothing in it to restore or import.");
    }
    return $data;
}

/**
 * One person's data out of a backup (an import into one account): its only
 * person, or the one with the user id $pick when it holds several.
 */
function backup_person_in(array $data, ?int $pick = null): array
{
    $people = array_values(array_filter(is_array($data['users'] ?? null) ? $data['users'] : [], 'is_array'));
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
 * Puts a backup back (manage.php --restore), in one transaction. A file of
 * everybody is the whole database: everybody's study data is replaced by the
 * file's. One of some people alone (a copy before a reset, an import or a
 * delete) replaces their data and nobody else's. A file that holds nobody is
 * refused before anything is deleted. Returns the counts, with 'people'.
 */
function backup_restore(array $data): array
{
    return db_tx(static function () use ($data): array {
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
            // The visitors go too (src/visitors.php): a backup holds none, and what they studied went above.
            db_exec('DELETE FROM imports WHERE user_id < 0');
            db_exec('DELETE FROM users WHERE id < 0');
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
            $zone = time_zone_known($person['timeZone'] ?? null);
            if ($zone !== null) {
                users_set_time_zone($id, $zone);
            }
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
 *
 * $private: the site's own user's alone (0600) - every copy of people's data
 * in the backup folder and the keys and notes in storage, which a hosted
 * site's neighbours on the same server must not read. The file aside is made
 * under a umask that keeps everybody else out, so not even it is readable by
 * them for a moment, and chmod covers a umask a host set otherwise. (Both do
 * nothing on Windows, where the folder's permissions apply.) The data the
 * builders write into the repository (backend/data/) stays as git keeps it.
 */
function file_put_atomic(string $file, string $content, bool $private = false): void
{
    $tmp = $file . '.' . bin2hex(random_bytes(6)) . '.tmp';
    $umask = $private ? umask(0077) : null;
    try {
        $written = file_put_contents($tmp, $content);
    } finally {
        if ($umask !== null) {
            umask($umask);
        }
    }
    if ($written !== strlen($content)) {
        @unlink($tmp);
        throw new RuntimeException("Cannot write $tmp");
    }
    if ($private) {
        @chmod($tmp, 0600);
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

/* ------------------------------------------------------------------ import */

/** How many lines of an answer log go into the database in one statement. */
const LEARNER_IMPORT_CHUNK = 2000;

/**
 * Puts one person's study data — from a backup — into the
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

        // The log in its order, LEARNER_IMPORT_CHUNK lines to a statement: a long one
        // is never held twice over in memory (an import's file may be as big as
        // memory allows, me_import_limit()).
        $rows = [];
        $insert = static function (array $rows) use ($uid): void {
            db_exec(
                'INSERT INTO srs_log (user_id, at, kind, item_id, details)
                 SELECT ?::bigint, academy_time((r->>0)::bigint), r->>1, r->>2, r->3 FROM json_array_elements(?::json) WITH ORDINALITY AS t(r, n) ORDER BY n',
                [$uid, json_text($rows)]
            );
        };
        foreach (is_array($data['log'] ?? null) ? $data['log'] : [] as $e) {
            if (!is_array($e) || !is_string($e['kind'] ?? null) || !is_numeric($e['t'] ?? null)) {
                continue;
            }
            $details = $e;
            unset($details['t'], $details['kind'], $details['id']);
            $rows[] = [(int) $e['t'], $e['kind'], isset($e['id']) ? js_string($e['id']) : null, $details ?: new stdClass()];
            $counts['log']++;
            if (count($rows) === LEARNER_IMPORT_CHUNK) {
                $insert($rows);
                $rows = [];
            }
        }
        if ($rows) {
            $insert($rows);
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
