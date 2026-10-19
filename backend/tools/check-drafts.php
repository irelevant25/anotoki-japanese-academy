<?php

/**
 * No release while a migration in backend/migrations/ is a draft - every one but 001 without its last line,
 * "-- end of NNN" (db_migration_whole()): on the host it would be taken for a file still arriving, never applied,
 * nor anything after it, by an ADMIN's Apply or anybody's, and the study content never rebuilt - so the site would
 * run half updated. anotoki-deploy runs this before it builds (composer.json, extra["anotoki-deploy"].before) and
 * stops when it fails. The tests allow the drafts they apply: ACADEMY_ALLOW_DRAFT, file names comma-separated.
 *
 *   node backend/tools/php.js backend/tools/check-drafts.php
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit();
}

require dirname(__DIR__) . '/src/bootstrap.php';

$allowed = array_filter(array_map('trim', explode(',', (string) getenv('ACADEMY_ALLOW_DRAFT'))));
$drafts = [];
foreach (glob(MIGRATIONS_DIR . '/*.sql') ?: [] as $file) {
    $name = basename($file);
    if ($name !== '001_init.sql' && !db_migration_whole($name, (string) file_get_contents($file)) && !in_array($name, $allowed, true)) {
        $drafts[] = $name;
    }
}
sort($drafts);
if ($drafts) {
    fwrite(
        STDERR,
        'backend/migrations/' .
            implode(', ', $drafts) .
            (count($drafts) === 1 ? ' is a draft' : ' are drafts') .
            " (no last line \"-- end of NNN\"): a release with a draft would never apply it, nor rebuild the study content. Finish it first.\n",
    );
    exit(1);
}
