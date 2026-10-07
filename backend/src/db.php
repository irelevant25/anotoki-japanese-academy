<?php
/**
 * PostgreSQL through PDO. The connection opens with the first query, so the
 * pure parts of the app (the question generator, the catalog) run without one.
 * The migrations are applied and read by the anotoki library's engine,
 * configured here for this site (db_migrator()).
 */

declare(strict_types=1);

use Anotoki\Lib\Migrations\MigrationSet;
use Anotoki\Lib\Migrations\Migrator;

function db_dsn(?string $name = null): string
{
    return sprintf(
        'pgsql:host=%s;port=%d;dbname=%s;connect_timeout=5;application_name=japanese-academy',
        config('db.host'),
        (int) config('db.port'),
        $name ?? db_name()
    );
}

/** The app's database: config('db.name') (backend/config/database.local.php; the tests' own settings name theirs). */
function db_name(): string
{
    return (string) config('db.name');
}

/** Where the migrations are: the schema is what replaying them gives. */
const MIGRATIONS_DIR = BACKEND . '/migrations';

function db_connect(?string $name = null, bool $persistent = false): PDO
{
    $pdo = new PDO(db_dsn($name), (string) config('db.user'), (string) config('db.password'), [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
        PDO::ATTR_PERSISTENT => $persistent,
    ]);
    // UTC, whoever's request opened it: the web server keeps a connection for the
    // next request, which may be somebody else's. No query reads the session's
    // zone anyway: times go through academy_time() / academy_ms(), days are dates.
    $pdo->exec("SET TIME ZONE 'UTC'");
    return $pdo;
}

/**
 * The app's connection. The web server keeps it open from one request to the
 * next: connecting costs more than answering (50–70 ms on Windows, for the
 * password check). A request that ends inside a transaction has it rolled back.
 */
function db(): PDO
{
    static $pdo = null;
    return $pdo ??= db_connect(null, PHP_SAPI === 'cli-server');
}

/** The server's maintenance database, for creating and dropping databases. */
function db_server(): PDO
{
    return db_connect('postgres');
}

/** PDO sends every value as text: spell booleans and floats the way PostgreSQL reads them. */
function db_params(array $params): array
{
    return array_map(static function ($v) {
        if (is_bool($v)) {
            return $v ? 't' : 'f';
        }
        if (is_float($v)) {
            return json_encode($v); // every digit; a plain string cast keeps only 14
        }
        return $v;
    }, $params);
}

function db_query(string $sql, array $params = []): PDOStatement
{
    $stmt = db()->prepare($sql);
    $stmt->execute(db_params($params));
    return $stmt;
}

function db_all(string $sql, array $params = []): array
{
    return db_query($sql, $params)->fetchAll();
}

function db_one(string $sql, array $params = []): ?array
{
    $row = db_query($sql, $params)->fetch();
    return $row === false ? null : $row;
}

function db_value(string $sql, array $params = [])
{
    $value = db_query($sql, $params)->fetchColumn();
    return $value === false ? null : $value;
}

function db_exec(string $sql, array $params = []): int
{
    return db_query($sql, $params)->rowCount();
}

/** Runs $fn in a transaction (or in the one already open) and returns its result. */
function db_tx(callable $fn)
{
    $pdo = db();
    if ($pdo->inTransaction()) {
        return $fn();
    }
    $pdo->beginTransaction();
    try {
        $result = $fn();
        $pdo->commit();
        return $result;
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
}

/** Did connecting fail because the database is not there at all (not the server, nor the password)? */
function db_missing_error(PDOException $e): bool
{
    return str_contains($e->getMessage(), '3D000') || (bool) preg_match('/database "[^"]*" does not exist/i', $e->getMessage());
}

/** Does the database exist? Asked of the server, so it works before the first connection. */
function db_exists(?string $name = null): bool
{
    $stmt = db_server()->prepare('SELECT 1 FROM pg_database WHERE datname = ?');
    $stmt->execute([$name ?? db_name()]);
    return (bool) $stmt->fetchColumn();
}

/** Creates the database (UTF-8) unless it exists. Returns true when it was created. */
function db_create(?string $name = null, ?string $template = null): bool
{
    $name ??= db_name();
    if (!preg_match('/^[A-Za-z0-9_]{1,63}$/', $name)) {
        throw new RuntimeException("Database names here use letters, digits and _ only: $name");
    }
    if (db_exists($name)) {
        return false;
    }
    $sql = 'CREATE DATABASE "' . $name . '" ENCODING \'UTF8\' TEMPLATE ' . ($template ? '"' . $template . '"' : 'template0');
    for ($i = 0; ; $i++) {
        try {
            db_server()->exec($sql);
            return true;
        } catch (PDOException $e) {
            // A template is copied only while nobody is connected to it; another
            // test run may be checking it for a moment (SQLSTATE 55006).
            if (!$template || $e->getCode() !== '55006' || $i >= 50) {
                throw $e;
            }
            usleep(100000);
        }
    }
}

/* ------------------------------------------------------------ migrations */

/** The label of this site's one set of migrations, in the Migrations page's answers ({"set": "academy", "name": …}). */
const MIGRATION_SET = 'academy';

/**
 * The migrations' engine: the anotoki library's (Anotoki\Lib\Migrations\
 * Migrator, the Composer package anotoki/lib - every anotoki site's), set up
 * for this site's own ways:
 *
 *   - one set of files, backend/migrations/, in the order of their names;
 *   - the table `migrations (name, applied_at)` as this site has always had
 *     it: made in that shape on a new database (db_migrations_table(), its
 *     prepare hook), read and written as it is;
 *   - each file sent to PostgreSQL in one exec (split false), as this site
 *     always ran them, in a transaction of its own with its row: a file that
 *     fails is rolled back whole, and the run stops there;
 *   - a file that is not whole yet is a draft (db_migration_ready()): it
 *     waits, with every one after it, and stops nothing;
 *   - one apply at a time, under the upkeep's lock (UPKEEP_LOCK), which the
 *     content's rebuild takes too (upkeep_run()): the two never run at once,
 *     and a second apply is told it is busy;
 *   - $beforeApply, once before anything runs: the raw copy of every table
 *     (upkeep_before_apply()) for the Migrations page's Apply, the setup page
 *     and manage.php; none for the tests' builder (db_migrate()).
 *
 * $pdo: the connection it works on, db() when none. Whoever applies gives it
 * a connection of its own (db_connect()): the lock belongs to the connection,
 * and db() stays open from one request to the next on this computer, where a
 * request cut off half way (a time limit) would leave it held.
 */
function db_migrator(?PDO $pdo = null, ?Closure $beforeApply = null): Migrator
{
    $options = [
        'split' => false,
        'lock' => UPKEEP_LOCK,
        'ready' => static function (MigrationSet $set, string $name, string $sql): bool {
            return db_migration_ready($name, $sql);
        },
        'prepare' => 'db_migrations_table',
    ];
    if ($beforeApply !== null) {
        $options['beforeApply'] = $beforeApply;
    }
    return new Migrator($pdo ?? db(), [new MigrationSet(MIGRATION_SET, MIGRATIONS_DIR)], $options);
}

/**
 * May migration $name, whose text is $sql, run - or is it a draft? Every
 * migration ends with the line "-- end of NNN", its own number: without it
 * the file is still being written, or on a hosted site still being uploaded by
 * FTP, and running half of it would leave the tables half changed. 001_init.sql
 * is from before this rule, and is whole as it is. The engine reads a file
 * once and hands its text here, so what is judged is what runs.
 *
 * The same rule keeps a migration that is still being written - a draft, in
 * backend/migrations/ without its last line - away from every real database:
 * anybody's server applies it only once that line is there. The tests alone
 * may apply a draft they name (db_migration_drafts_allowed()), so they run on
 * the tables it makes.
 */
function db_migration_ready(string $name, string $sql): bool
{
    return $name === '001_init.sql' || db_migration_whole($name, $sql) || db_migration_drafts_allowed(db_name(), $name);
}

/** Does this migration's text end with its own last line, "-- end of NNN"? */
function db_migration_whole(string $name, string $sql): bool
{
    $lines = preg_split('/\R/', rtrim($sql));
    return end($lines) === '-- end of ' . substr($name, 0, 3);
}

/**
 * May migration $name, without its last line (a draft), be applied to
 * $database? Only to a throwaway database of the tests (academy_test_…,
 * their template included), and only when ACADEMY_MIGRATION_DRAFTS names
 * that file (names, comma-separated): tests/lib.php and tests/tools/testdb.php
 * name the drafts backend/migrations/ holds. Never to anybody's own database,
 * whatever the environment says; and a file a test makes half on purpose
 * (to see it wait) is no draft anybody named.
 */
function db_migration_drafts_allowed(string $database, string $name): bool
{
    $named = array_filter(array_map('trim', explode(',', (string) getenv('ACADEMY_MIGRATION_DRAFTS'))));
    return in_array($name, $named, true) && preg_match('/^academy_test_[a-z0-9_]+$/D', $database) === 1;
}

/** The pending migrations that can run now: in order, up to the first that is not whole yet. */
function db_migrations_ready(): array
{
    return array_column(db_migrator()->applicable(), 'name');
}

/** Migrations not yet applied, drafts too, in the order they will run (all of them for a database without the table). */
function db_pending_migrations(): array
{
    return array_column(db_migrator()->status()['pending'], 'name');
}

/**
 * The tests' builder (tests/tools/testdb.php, and the tests of a migration on
 * data in an older shape): what can run now applied, as an Apply does but
 * without the copy first - their databases are throwaway. Returns the names
 * applied. One that fails is rolled back whole and throws, naming its file
 * ("backend/migrations/004_….sql: …"): PostgreSQL's message alone would not
 * say which file to fix.
 */
function db_migrate(): array
{
    $done = db_migrator()->apply();
    if ($done['busy']) {
        throw new RuntimeException('Another database update is running, so nothing was applied: try again in a moment.');
    }
    if ($done['failed'] !== null) {
        throw new RuntimeException("backend/migrations/{$done['failed']['name']}: {$done['error']}");
    }
    return array_column($done['applied'], 'name');
}

/**
 * The table that lists the migrations applied, in this site's shape, made on a
 * new database before the first of them runs: the engine's prepare hook
 * (db_migrator()), which asks before every apply, on the connection it applies
 * with ($pdo).
 */
function db_migrations_table(?PDO $pdo = null): void
{
    ($pdo ?? db())->exec('CREATE TABLE IF NOT EXISTS migrations (
        name       text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
    )');
}
