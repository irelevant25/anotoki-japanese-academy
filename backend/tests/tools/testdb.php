<?php
/**
 * The tests' throwaway databases (used by backend/tests/run.php and
 * frontend/e2e/helpers.js), on the PostgreSQL server of the developer's own
 * settings (backend/config/database.local.php):
 *
 *   php backend/tests/tools/testdb.php template       make or update academy_test_template:
 *                                                     its tables and the study content from backend/data/.
 *                                                     A migration still being written (no "-- end of NNN"
 *                                                     line yet) is applied too, which only the tests'
 *                                                     databases ever do; when such a draft changed since
 *                                                     the template was made, the template is made afresh
 *   php backend/tests/tools/testdb.php template --fresh
 *                                                     drop the template first, then replay every migration and
 *                                                     build the content: after an edit of a migration that is not
 *                                                     committed yet. (Without it only new files are applied: an
 *                                                     edited one changes nothing in the template, and nobody is
 *                                                     told.) Not while another run of the tests is going on: its
 *                                                     copies of the template fail
 *   php backend/tests/tools/testdb.php create NAME    a new test database, copied from the template
 *   php backend/tests/tools/testdb.php site NAME      an empty test database, owned by a database user of its
 *                                                     own (NAME_site, with a password made for this run), as a
 *                                                     hosting panel makes them; prints {"host", "port", "user",
 *                                                     "password"}: the server of your settings, and that user
 *   php backend/tests/tools/testdb.php drop NAME      drop a test database (and its user NAME_site, if any)
 *   php backend/tests/tools/testdb.php sweep          drop test databases more than 6 hours old
 *                                                     (left behind by a run that was killed), and the
 *                                                     database users of the site tests that own none
 *   php backend/tests/tools/testdb.php sql NAME SQL [JSON-PARAMS]
 *                                                     run SQL in a test database; prints the rows as JSON
 *   php backend/tests/tools/testdb.php config DIR NAME JWKS BACKUPS [FRONTEND [ISSUER [APPLICATION_TTL]]]
 *                                                     the settings folder of a server on test database
 *                                                     NAME, signing people in through the test IAM whose
 *                                                     keys are JWKS (tests/tools/test-config.php); ISSUER
 *                                                     names the stand-in IAM it runs against (its address,
 *                                                     http://127.0.0.1:PORT), else https://iam.test;
 *                                                     APPLICATION_TTL the seconds its answer whether
 *                                                     sign-in is required is kept (else a minute)
 *   php backend/tests/tools/testdb.php drafts         the migrations still being written, by name, comma-separated
 *                                                     (empty when there is none): what ACADEMY_MIGRATION_DRAFTS
 *                                                     names for a server of the browser suites
 *
 * It only ever touches databases whose name starts with academy_test_.
 */

declare(strict_types=1);

const TEMPLATE = 'academy_test_template';

$command = $argv[1] ?? '';
$name = $argv[2] ?? '';

require __DIR__ . '/test-config.php';

if ($command === 'config') {
    // before the app loads: it needs none of it
    [, , $dir, $db, $jwks, $backups] = $argv + [4 => '', 5 => ''];
    if ($jwks === '' || $backups === '') {
        fwrite(STDERR, "usage: php backend/tests/tools/testdb.php config DIR NAME JWKS BACKUPS [FRONTEND [ISSUER [APPLICATION_TTL]]]\n");
        exit(1);
    }
    $frontend = isset($argv[6]) && $argv[6] !== '' ? (string) $argv[6] : null;
    $auth = isset($argv[8]) && ctype_digit((string) $argv[8]) && (int) $argv[8] > 0 ? ['application_ttl' => (int) $argv[8]] : [];
    test_config_write((string) $dir, (string) $db, (string) $jwks, (string) $backups, $frontend, isset($argv[7]) ? (string) $argv[7] : 'https://iam.test', $auth);
    echo "$dir\n";
    exit(0);
}

if ($command === 'drafts') {
    echo implode(',', test_config_migration_drafts()), "\n";
    exit(0);
}

// the developer's own settings for the server and password, never a test's folder
putenv('ACADEMY_CONFIG_DIR');
require __DIR__ . '/../../src/bootstrap.php';
config_overrides(['db' => ['name' => TEMPLATE]]);

function test_name(string $name): string
{
    if (!preg_match('/^academy_test_[a-z0-9_]+$/D', $name) || $name === TEMPLATE) {
        fwrite(STDERR, "testdb: not a test database name: $name\n");
        exit(1);
    }
    return $name;
}

/** A fingerprint of the migrations still being written (without their last line), or 'none'. */
function testdb_drafts(): string
{
    $drafts = '';
    foreach (test_config_migration_drafts() as $name) {
        $drafts .= $name . "\n" . file_get_contents(MIGRATIONS_DIR . "/$name") . "\n";
    }
    return $drafts === '' ? 'none' : sha1($drafts);
}

switch ($command) {
    case 'template':
        if (db_name() !== TEMPLATE) {
            exit(1);
        }
        $options = array_slice($argv, 2);
        if (array_diff($options, ['--fresh'])) {
            fwrite(STDERR, "testdb: template takes no option but --fresh\n");
            exit(1);
        }
        // The drafts too (db_migration_drafts_allowed(): a name of the tests only), so the tests
        // run on what the migration being written makes.
        putenv('ACADEMY_MIGRATION_DRAFTS=' . implode(',', test_config_migration_drafts()));
        $drafts = testdb_drafts();
        if (!$options && db_exists()) {
            // A draft is edited while it is written, and an applied one is never applied again:
            // when the drafts the template was made with are not these, it is made afresh.
            $made = db_server()->query("SELECT shobj_description(oid, 'pg_database') FROM pg_database WHERE datname = '" . TEMPLATE . "'")->fetchColumn();
            if (preg_match('/^academy drafts (\w+)$/D', (string) $made, $m) && $m[1] !== $drafts) {
                $options = ['--fresh'];
                echo TEMPLATE . ": a migration being written changed since it was made: made afresh\n";
            }
        }
        if ($options) {
            // The one place the template is ever dropped, and the constant names it: test_name() refuses that name.
            db_server()->exec('DROP DATABASE IF EXISTS "' . TEMPLATE . '" WITH (FORCE)');
        }
        db_create();
        $applied = db_migrate();
        if ($waiting = db_first_pending_migration()) {
            fwrite(STDERR, 'testdb: ' . db_migration_path($waiting) . " could not be applied.\n");
            exit(1);
        }
        db_server()->exec('COMMENT ON DATABASE "' . TEMPLATE . "\" IS 'academy drafts $drafts'");
        $synced = content_sync();
        echo TEMPLATE . ': ' . ($applied || $synced ? 'updated' . ($synced ? " ({$synced['seconds']} s)" : '') : 'up to date') . "\n";
        break;

    case 'create':
        db_create(test_name($name), TEMPLATE);
        db_server()->exec('COMMENT ON DATABASE "' . $name . "\" IS 'academy test " . time() . "'");
        echo "$name\n";
        break;

    case 'site':
        $role = test_name($name . '_site');
        $password = bin2hex(random_bytes(16));
        db_server()->exec('CREATE ROLE "' . $role . "\" LOGIN PASSWORD '$password'");
        db_server()->exec('CREATE DATABASE "' . test_name($name) . '" OWNER "' . $role . "\" ENCODING 'UTF8' TEMPLATE template0");
        db_server()->exec('COMMENT ON DATABASE "' . $name . "\" IS 'academy test " . time() . "'");
        echo json_text(['host' => config('db.host'), 'port' => config('db.port'), 'user' => $role, 'password' => $password]), "\n";
        break;

    case 'drop':
        db_server()->exec('DROP DATABASE IF EXISTS "' . test_name($name) . '" WITH (FORCE)');
        db_server()->exec('DROP ROLE IF EXISTS "' . test_name($name . '_site') . '"');
        break;

    case 'sweep':
        $server = db_server();
        $rows = $server->query("SELECT datname, shobj_description(oid, 'pg_database') AS note FROM pg_database WHERE datname LIKE 'academy\\_test\\_%'")->fetchAll();
        foreach ($rows as $r) {
            if ($r['datname'] !== TEMPLATE && preg_match('/^academy test (\d+)$/', (string) $r['note'], $m) && (int) $m[1] < time() - 6 * 3600) {
                $server->exec('DROP DATABASE IF EXISTS "' . test_name($r['datname']) . '" WITH (FORCE)');
                echo "dropped {$r['datname']}\n";
            }
        }
        // backend/tests/api/deploy.test.php makes a database user per run, as a host would
        $roles = $server->query("SELECT rolname FROM pg_roles r WHERE rolname LIKE 'academy\\_test\\_%\\_site'
                                 AND NOT EXISTS (SELECT 1 FROM pg_database d WHERE d.datdba = r.oid)")->fetchAll();
        foreach ($roles as $r) {
            $server->exec('DROP ROLE IF EXISTS "' . test_name($r['rolname']) . '"');
            echo "dropped the user {$r['rolname']}\n";
        }
        break;

    case 'sql':
        $stmt = db_connect(test_name($name))->prepare($argv[3] ?? '');
        $stmt->execute(db_params(json_decode($argv[4] ?? '[]', true) ?: []));
        echo json_text($stmt->columnCount() ? $stmt->fetchAll() : []), "\n";
        break;

    default:
        fwrite(STDERR, "usage: php backend/tests/tools/testdb.php template [--fresh] | create NAME | site NAME | drop NAME | sweep | sql NAME SQL [JSON-PARAMS]"
            . " | config DIR NAME JWKS BACKUPS [FRONTEND]\n");
        exit(1);
}
