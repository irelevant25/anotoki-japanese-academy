<?php
/**
 * The admin tools - the anotoki library's (Anotoki\Lib\ErrorLog, Audit,
 * Feedback, Backups: the Composer package anotoki/lib, every anotoki site's,
 * since anotoki-lib 0.4.0), set up here for this site: the admin panel's
 * Errors, Audit, Feedback and Backups pages (api/routes/admin.php; the pages
 * are the library's), for the site's ADMIN alone, and the visitors' feedback
 * form. The file explorer is genshin's alone: none here.
 *
 *   the error log   what went wrong, one JSON line each in
 *                   backend/storage/logs/errors-<UTC day>.jsonl: a 5xx (but a 503
 *                   that only says a state - update_pending, feature_unavailable,
 *                   not_set_up: the library's `expected`), a 404, 405, 413, 415
 *                   or 429 answered, PHP's warnings and fatal
 *                   errors - redacted, never a header, a body, a query string or
 *                   a token; a keyed hash of the address bucket instead of the
 *                   address, and the person's id on the admin tools' own routes
 *                   and on a page's report (elsewhere none: the error
 *                   middleware writes its line outside the routes, before the
 *                   library's Identify has found who is asking); 30 days, 64 MB
 *                   in all. Files, so it works while the database does not.
 *                   And the pages' own errors (since
 *                   anotoki-lib 0.5.0, the owner's decision of 2026-10-11),
 *                   which the browser reports to POST /api/client-errors
 *                   (api/routes/admin.php): redacted again, `source: client`,
 *                   20 an hour from one sender - a person by their account, a
 *                   visitor by their address bucket - and 500 a day from the
 *                   visitors, as many from the people signed in
 *   the audit log   who did what in the admin panel (the table
 *                   anotoki_audit_log, the library's set anotoki_admin): the
 *                   languages and the words, a person's data deleted, the
 *                   migrations applied, the backups, the feedback handled, the
 *                   error log cleared. Kept
 *   feedback        the visitors' messages (the table anotoki_feedback): the form
 *                   in the foot of every page (POST /api/feedback: a person, or
 *                   while sign-in is not required here a visitor or nobody),
 *                   read and handled on the Feedback page; no mail - the panel's
 *                   bar counts the new ones. The address for an answer is what the
 *                   sender sends: the form writes a signed-in person's account
 *                   address in for them (core/feedback.config.ts), and a cleared
 *                   field, or "Send it without my name", keeps none - the server
 *                   never adds one (the owner's decision of 2026-10-11, "it's their
 *                   choice"; the form's own words: "Only if you would like an
 *                   answer"); nothing of where a message came from is kept with
 *                   it; the limits count a keyed hash of the address bucket for a
 *                   day, in backend/storage/cache/
 *   backups         the whole database, by COPY through PDO, in
 *                   backend/storage/backups/<id>.anotoki-backup: one a day after
 *                   an answer (the last 14 kept), one before every update (the
 *                   last 5), one before a restore (the last 5) - the library's
 *                   rotation by number -, and the ADMIN's own, which wait for the
 *                   owner to delete them on the Backups page: no age limit on any
 *                   (the owner's decision of 2026-10-11, as every anotoki site
 *                   reads it); downloaded by a single-use link, restored in place
 *                   where the schema is the backup's - only one made here (since
 *                   anotoki-lib 0.5.0 a backup carries this installation's seal,
 *                   an HMAC under the key in storage/; one without it, as every
 *                   backup made before 0.5.0, is restored offline alone) -, with
 *                   what was deleted since done again inside the restore and the
 *                   scrub of the IAM's deleted accounts at once after it (the
 *                   library's People restore hooks, academy_backups()). Each file
 *                   the site's own user's alone (0600). A person whose account
 *                   the IAM deleted stays in a backup made before until it
 *                   rotates out or the owner deletes it. BESIDE this site's own
 *                   JSON copies of the study data in the same folder
 *                   (src/backup.php), which stay what they were: the library
 *                   never touches a file of another name
 *
 * Who acts, and whether they are the site's ADMIN, is the anotoki library's
 * Identify's answer (src/auth.php): the token's sub and roles, never a table.
 * A backup made, downloaded, deleted or restored also wants a sign-in of the
 * last ten minutes (the token's auth_time): the page offers "Sign in again".
 *
 * Everything the tools write is under storage_dir() - backend/storage/, or a
 * throwaway database's own folder in the tests -, every folder of it guarded
 * by a deny-all .htaccess (the library's GuardedDirectory).
 */

declare(strict_types=1);

use Anotoki\Lib\Admin\AdminContext;
use Anotoki\Lib\Audit\AuditLog;
use Anotoki\Lib\Backups\Backups;
use Anotoki\Lib\Backups\Copy;
use Anotoki\Lib\ErrorLog\ErrorLog;
use Anotoki\Lib\Feedback\Feedback;
use Anotoki\Lib\Support\ClientAddress;
use Anotoki\Lib\Support\Refusal;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/** The places a feedback message may be about: the sections of the app (the form words them, frontend core/feedback.config.ts). */
const FEEDBACK_SECTIONS = ['Kanji', 'Exam'];

// The site's own storage, storage_dir(), is config/config.php's: the settings' own notes are kept there too.

/**
 * What the admin tools need to know of this site (the library's
 * AdminContext): who acts (the token's sub), whether they are the site's ADMIN
 * (the token's role), the proof a backup's download, delete, making or restore
 * asks for (a sign-in of the last ten minutes, the token's auth_time), this
 * site's error body (academy_refusal()), people's names by id (the backups'
 * maker, the audit log's and the feedback's people: academy_people_names()),
 * and where a request comes from: the library's own rule (ClientAddress) over
 * this site's trusted proxies (client_address_trusted_proxies(): Cloudflare's
 * ranges unless app.local.php names others, a catch-all refused) and
 * Cloudflare's header, pinned - believed, with the origin secret
 * (config_origin_secret(), cloudflare.local.php), only on a request that
 * carries it - the one the visitors' limits count by
 * (src/client_address.php), so the feedback form's limits and the error log's
 * client hash see the visitor's address bucket, never Cloudflare's.
 * (Positional: this file stays parseable by PHP 7.4, which has no named
 * arguments; the fourth, clientKey, is null - the library's rule; the tenth
 * and last, originSecret, came with anotoki-lib 0.5.2.)
 */
function academy_admin_context(): AdminContext
{
    static $context = null;
    if ($context === null) {
        $context = new AdminContext(
            static function (Request $request) {
                $person = auth_person($request);
                return $person === null ? null : $person->sub;
            },
            AdminContext::recentSignIn(static function (Request $request): ?int {
                $person = auth_person($request);
                return $person === null ? null : $person->authTime;
            }),
            AdminContext::PROOF_RECENT_SIGN_IN,
            null,
            static function (Response $response, Refusal $refusal): Response {
                return academy_refusal($response, $refusal);
            },
            static function (Request $request): bool {
                $person = auth_person($request);
                return $person !== null && $person->isAdmin();
            },
            static function (array $ids): array {
                return academy_people_names($ids);
            },
            client_address_trusted_proxies(),
            ClientAddress::CLOUDFLARE_HEADER,
            config_origin_secret(),
        );
    }
    return $context;
}

/**
 * The error log, in storage_dir()/logs (one per process): what goes wrong,
 * written down where the site's ADMIN reads it (the Errors page). Its key for
 * the address buckets' hashes is the installation's (storage/anotoki-lib.key,
 * made once); a 401, a 403 or a 422 is an answer, not a failure: never
 * written. $app, the first time (academy_app()): the app whose routes name a
 * line's route by its pattern (/api/exam/report/{id}) where the request that
 * failed was never routed.
 */
function academy_error_log(?Slim\App $app = null): ErrorLog
{
    static $log = null;
    return $log ??= new ErrorLog(storage_dir() . '/logs', [
        'root' => BACKEND,
        'context' => academy_admin_context(),
        'ignoreExceptions' => [HttpError::class],
        'app' => $app,
    ]);
}

/**
 * The audit log (the table anotoki_audit_log, one per process): who did what
 * in the admin panel. While the table is not there yet (an upload whose
 * anotoki_admin/001 waits for its Apply), entries wait in
 * storage_dir()/logs/audit-pending.jsonl and go in after the Apply
 * (flushPending(), api/routes/migrations.php). No address is kept: the
 * person's id is enough here.
 */
function academy_audit(): AuditLog
{
    static $audit = null;
    return $audit ??= new AuditLog(
        static function (): PDO {
            return db();
        },
        [
            'pendingFile' => storage_dir() . '/logs/audit-pending.jsonl',
            'actorIds' => static function (string $name): array {
                return array_map(
                    'intval',
                    array_column(db_all('SELECT id FROM users WHERE id > 0 AND preferred_username ILIKE ? LIMIT 50', ['%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $name) . '%']), 'id'),
                );
            },
        ],
    );
}

/**
 * The audit log on a connection of the caller's ($pdo, inside its
 * transaction), for what must happen there and nowhere else: the scrub's hook
 * blanks a deleted account's people on the scrub's own connection
 * (people_scrub_copies(), src/people.php) - a restore's, right after it
 * committed -, never on db() beside it.
 */
function academy_audit_on(PDO $pdo): AuditLog
{
    return new AuditLog(static function () use ($pdo): PDO {
        return $pdo;
    });
}

/**
 * An entry of this site's own in the audit log, by the request's person
 * (their token's sub): the languages and the words changed (the library's
 * translations routes hand their entries here), the migrations applied.
 */
function academy_audit_record(?Request $request, string $action, ?string $targetType = null, ?string $targetId = null, array $details = []): void
{
    $person = $request === null ? null : auth_person($request);
    academy_audit()->record($request, $person === null ? null : $person->sub, $action, $targetType, $targetId, $details);
}

/** People's names by id, for the audit log's and the feedback's pages: the name of their last token, or the IAM's placeholder. */
function academy_people_names(array $ids): array
{
    $ids = array_values(
        array_filter(array_map('intval', $ids), static function (int $id): bool {
            return $id > 0;
        }),
    );
    if ($ids === []) {
        return [];
    }
    $names = [];
    foreach (db_all('SELECT id, preferred_username FROM users WHERE id IN (SELECT json_array_elements_text(?::json)::bigint)', [json_text($ids)]) as $row) {
        if (is_string($row['preferred_username']) && $row['preferred_username'] !== '') {
            $names[(int) $row['id']] = $row['preferred_username'];
        }
    }
    return $names;
}

/**
 * Feedback (the table anotoki_feedback, one per process): the visitors' form
 * and the Feedback page. Its places are the app's sections (FEEDBACK_SECTIONS);
 * its limits (5 an hour and 20 a day from one sender - a signed-in person by
 * their account, anybody else by their address bucket -, 300 a day for the
 * visitors together and 300 for the people signed in)
 * and its keeping (spam 30 days, resolved a year) are the library's. Its
 * daily prune runs after an answer.
 */
function academy_feedback(): Feedback
{
    static $feedback = null;
    return $feedback ??= new Feedback(
        static function (): PDO {
            return db();
        },
        [
            'storage' => storage_dir(),
            'sections' => FEEDBACK_SECTIONS,
            'defer' => static function (callable $work): void {
                after_response_add($work);
            },
        ],
    );
}

/**
 * The library's backups of the whole database (one per process), in this
 * site's backup folder (backup_dir(): backend/storage/backups/) beside its own
 * JSON copies, which it never touches. Its connection is one of its own, made
 * for COPY (the library's Copy::connect()); its migrations engine is this
 * site's (db_migrator()), its lock the upkeep's (UPKEEP_LOCK: one backup, one
 * Apply or one content rebuild at a time). The day's backup is made after an
 * answer (after_response_add()); a failure goes to the error log, never to a
 * page.
 *
 * A restore takes both of its hooks from the library's people module
 * (anotoki-lib 0.5.0, People::restoreHooks()):
 *   - inside its transaction, before anybody sees the restored rows, what was
 *     deleted since the backup was made is done again (People::replay()):
 *     every person.data_deleted the audit log - never restored - holds from
 *     the backup's time on, with the People page's own delete
 *     (people_delete_hook(), src/people.php: on the restore's connection, its
 *     request null, so no copy is kept first), and every feedback message
 *     deleted since. Whatever fails rolls the restore back whole; one is
 *     refused ("restore again in a minute") while a check of the IAM's
 *     deleted accounts runs;
 *   - once it committed, the scrub of the IAM's deleted accounts at once
 *     (People::afterRestore()): the restored database brings back the scrub's
 *     place of its day, and with it the names of whoever the IAM deleted
 *     since. A scrub that does not finish - the IAM out of reach, its time up
 *     with more to read, a run already going - is the restore's
 *     after_restore_error (the Backups page's note, the error log with its
 *     cause), never a restore that looks complete with a deleted person named
 *     again; the hourly upkeep's stamp then goes after this answer (this
 *     site's runner, after_response_add()), so the next request scrubs again.
 *
 * Only a backup made here is restored here: a plain one carries this
 * installation's seal (an HMAC of its id and SHA-256 under a key derived from
 * storage/anotoki-lib.key), and one without it - every backup made before
 * anotoki-lib 0.5.0 among them - is listed `sealed: false` and restored
 * offline alone (docs/kb/hosting.md). Every file the site's own user's alone
 * (0600), every folder 0700.
 *
 * How many are kept is the library's rotation by number, as on every anotoki
 * site: the last 14 daily ones, 5 made before an update, 5 before a restore -
 * the older ones of those kinds go as a new one comes -, and the ADMIN's own
 * until the owner deletes them on the Backups page. No backup is deleted for
 * its age (the owner's decision of 2026-10-11, "kept until I delete them", as
 * the IAM and every other site read it: no age limit, the counts kept). A
 * person whose account the IAM deleted stays in a backup made before, until
 * it rotates out or the owner deletes it.
 */
function academy_backups(): Backups
{
    static $backups = null;
    return $backups ??= new Backups(
        static function (): PDO {
            $pdo = Copy::connect(db_dsn(), (string) config('db.user'), (string) config('db.password'), [PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
            $pdo->exec("SET TIME ZONE 'UTC'");
            return $pdo;
        },
        backup_dir(),
        [
            'site' => 'japanese-academy',
            'migrator' => static function (PDO $pdo) {
                return db_migrator($pdo);
            },
            'lock' => UPKEEP_LOCK,
            'audit' => academy_audit(),
            'storage' => storage_dir(),
            'defer' => static function (callable $work): void {
                after_response_add($work);
            },
            'onError' => static function (Throwable $e): void {
                academy_error_log()->record($e);
            },
        ] +
            academy_people()->restoreHooks(people_delete_hook(), static function (callable $work): void {
                after_response_add($work, 'people_scrub_again');
            }),
    );
}
