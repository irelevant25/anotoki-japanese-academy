<?php
/**
 * Runs the PHP tests: backend/tests/unit/*.test.php and backend/tests/api/*.test.php.
 * Each file runs in its own PHP process with its own throwaway database, copied
 * from academy_test_template (made or updated here first), its own temp folder
 * for backups and settings of its own — see tests/lib.php. Four files run at a time.
 *
 *   php backend/tests/run.php                                      every file
 *   php backend/tests/run.php backend/tests/unit/srs.test.php …    some files
 *
 * Where an older php comes first on PATH: node backend/tools/php.js backend/tests/run.php.
 * The frontend's unit tests are npm test in frontend/.
 */

declare(strict_types=1);

$tests = __DIR__;
$root = dirname(__DIR__, 2);
$files = array_slice($argv, 1);
if (!$files) {
    $files = array_merge(glob("$tests/unit/*.test.php") ?: [], glob("$tests/api/*.test.php") ?: []);
}
$started = microtime(true);
$tmp = str_replace('\\', '/', sys_get_temp_dir());
$null = PHP_OS_FAMILY === 'Windows' ? 'NUL' : '/dev/null';

// the template database: every file's database is a copy of it
foreach (['sweep', 'template'] as $step) {
    passthru(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg("$tests/tools/testdb.php") . " $step", $code);
    if ($code) {
        fwrite(STDERR, "Could not prepare the test database (is PostgreSQL running? The setup page wrote its settings to backend/config/database.local.php).\n");
        exit(1);
    }
}

$env = getenv();
unset($env['ACADEMY_CONFIG_DIR'], $env['ACADEMY_JWKS_FILE']);
$queue = array_values($files);
$running = [];
$done = [];
$next = 0;
$run = static function (int $i) use (&$running, $queue, $env, $root, $tmp, $null): void {
    $out = tempnam($tmp, 'academy-test-out-');
    $proc = proc_open(
        [PHP_BINARY, $queue[$i]],
        [0 => ['file', $null, 'r'], 1 => ['file', $out, 'w'], 2 => ['redirect', 1]],
        $pipes,
        $root,
        ['ACADEMY_DB_NAME' => 'academy_test_' . getmypid() . "_$i", 'ACADEMY_BACKUPS_DIR' => "$tmp/academy-test-" . getmypid() . "-$i"] + $env
    );
    $running[$i] = [$proc, $out];
};

while ($next < count($queue) || $running) {
    while ($next < count($queue) && count($running) < 4) {
        $run($next++);
    }
    foreach ($running as $i => [$proc, $out]) {
        $status = proc_get_status($proc);
        if (!$status['running']) {
            proc_close($proc);
            $done[$i] = (string) file_get_contents($out);
            @unlink($out);
            unset($running[$i]);
        }
    }
    usleep(20000);
}

$pass = $fail = 0;
foreach ($queue as $i => $file) {
    $rel = str_replace('\\', '/', substr(realpath($file) ?: $file, strlen(realpath($root)) + 1));
    echo "▶ $rel\n";
    $output = $done[$i];
    if (preg_match('/^##academy (.+)$/m', $output, $m)) {
        $counts = json_decode($m[1], true);
        $pass += $counts['pass'];
        $fail += $counts['fail'];
        $output = str_replace($m[0] . "\n", '', $output);
    } else {
        $fail++;
        $output .= "  ✖ the file did not finish\n";
    }
    echo $output;
}
printf("ℹ tests %d\nℹ pass %d\nℹ fail %d\nℹ duration_ms %s\n", $pass + $fail, $pass, $fail, round((microtime(true) - $started) * 1000));
exit($fail ? 1 : 0);
