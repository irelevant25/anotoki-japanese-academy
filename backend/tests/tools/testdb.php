<?php
/**
 * The tests' throwaway databases (used by backend/tests/run.php and
 * frontend/e2e/helpers.js), on the PostgreSQL server of the developer's own
 * settings (backend/config/database.local.php):
 *
 *   php backend/tests/tools/testdb.php template       make or update academy_test_template:
 *                                                     its tables and the study content from data/
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
 *   php backend/tests/tools/testdb.php config DIR NAME none|iam [JWKS] BACKUPS [FRONTEND]
 *                                                     the settings folder of a server on test database
 *                                                     NAME (tests/tools/test-config.php)
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
    [, , $dir, $db, $auth] = $argv + [4 => ''];
    $rest = array_slice($argv, 5);
    $jwks = $auth === 'iam' ? (string) array_shift($rest) : null;
    test_config_write((string) $dir, (string) $db, (string) $auth, $jwks, (string) ($rest[0] ?? ''), isset($rest[1]) ? (string) $rest[1] : null);
    echo "$dir\n";
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

switch ($command) {
    case 'template':
        if (db_name() !== TEMPLATE) {
            exit(1);
        }
        db_create();
        $applied = db_migrate();
        if ($waiting = db_pending_migrations()) {
            // A migration without its last line waits; every test would then run on old tables.
            fwrite(STDERR, "testdb: backend/migrations/{$waiting[0]} does not end with \"-- end of " . substr($waiting[0], 0, 3) . "\", so it was not applied.\n");
            exit(1);
        }
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
        fwrite(STDERR, "usage: php backend/tests/tools/testdb.php template | create NAME | site NAME | drop NAME | sweep | sql NAME SQL [JSON-PARAMS]"
            . " | config DIR NAME none|iam [JWKS] BACKUPS [FRONTEND]\n");
        exit(1);
}
