<?php
/**
 * Assembles what a hosted site needs, and nothing else, for uploading by FTP
 * or SFTP: the built Angular app and the PHP backend beside it.
 * docs/kb/hosting.md has the upload map and the steps.
 *
 *   php backend/tools/build-dist.php [--out=DIR]   default dist/japanese-academy (npm run build:dist)
 *   php backend/tools/build-dist.php --no-audio    the same without data/audio/: an update when no clip
 *                                                  changed (the 4,000 clips on the host stay as they are)
 *   php backend/tools/build-dist.php --list        only print what would go in (JSON), copying nothing
 *   php backend/tools/build-dist.php --frontend=DIR  take the built app from DIR instead of building it
 *                                                  (the tests; DIR holds index.html)
 *
 *   public/     the document root: the built Angular app (frontend/, built here with
 *               npm run build:frontend when its sources changed), index.php (Apache's
 *               front controller) and .htaccess, both from backend/public/
 *   backend/    the API (api/), the app (src/), config/config.php (without any *.local.php:
 *               the setup page writes those on the server), migrations/, vendor/ (Composer's
 *               packages: the host has no shell to install them), setup.php (the setup page),
 *               and an empty storage/ for the IAM's keys and the setup page's lock
 *   data/       what the study content is built from, and the audio clips
 *   backups/    for the daily copies (empty)
 *
 * backend/, data/ and backups/ each get a .htaccess that refuses every request,
 * in case the site's document root ends up above public/ after all. Left out:
 * the tests and tools, the command-line helpers (server.php, manage.php,
 * translations.php: they need a shell), frontend/ as source, docs/, books/, progress/, results/,
 * reports/, the backups themselves, .env, node_modules/, .claude/, the
 * launchers, data/source/.
 *
 * DIR is emptied first, but only if it is empty already or an earlier build.
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require dirname(__DIR__) . '/src/bootstrap.php';

const DIST_MARK = '.academy-dist';

const DIST_DENY = "# Read by PHP from disk, never sent over HTTP.\n"
    . "<IfModule mod_authz_core.c>\n    Require all denied\n</IfModule>\n"
    . "<IfModule !mod_authz_core.c>\n    Order allow,deny\n    Deny from all\n</IfModule>\n";

/** The folders that get a deny-all .htaccess (every one outside the document root). */
const DIST_DENIED = ['backend', 'backend/storage', 'data', 'backups'];

/** Never in an upload, whatever the lists below say: settings, secrets, the owner's study history, the tools. */
const DIST_NEVER = '~(^|/)(\.env|[^/]*\.local\.php)$'
    . '|^(tests|tools|docs|books|progress|results|reports|node_modules|\.claude|\.git|temp|dist|frontend|src)/'
    . '|^backend/(tests|tools|public|node_modules)/|^backend/storage/(?!\.htaccess$)|^backend/(server|manage|translations)\.php$'
    . '|^(start\.ps1|start\.sh|package(-lock)?\.json|CLAUDE\.md|README\.md|DEV\.md)$|^backups/(?!\.htaccess$)|^data/source/~';

/** The files under a folder, as paths relative to $base. */
function dist_tree(string $base, string $dir): array
{
    $out = [];
    if (!is_dir("$base/$dir")) {
        return $out;
    }
    $items = new RecursiveIteratorIterator(new RecursiveDirectoryIterator("$base/$dir", FilesystemIterator::SKIP_DOTS));
    foreach ($items as $file) {
        if ($file->isFile()) {
            $out[] = $dir . '/' . str_replace('\\', '/', substr($file->getPathname(), strlen("$base/$dir") + 1));
        }
    }
    sort($out);
    return $out;
}

/** Empties a folder, which must be an earlier build (or empty). */
function dist_clear(string $out): void
{
    if (!is_dir($out)) {
        return;
    }
    if (!is_file("$out/" . DIST_MARK) && (scandir($out) ?: []) !== ['.', '..']) {
        throw new RuntimeException("$out is not an earlier build (no " . DIST_MARK . '): not emptying it.');
    }
    $items = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($out, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
    foreach ($items as $item) {
        $item->isDir() ? rmdir($item->getPathname()) : unlink($item->getPathname());
    }
}

function dist_put(string $out, string $rel, ?string $from = null, ?string $content = null): void
{
    $to = "$out/$rel";
    if (!is_dir(dirname($to))) {
        mkdir(dirname($to), 0777, true);
    }
    if ($from !== null) {
        copy($from, $to);
    } else {
        file_put_contents($to, (string) $content);
    }
}

/**
 * The built Angular app: $given (the tests), or frontend/'s own build, made
 * first when its sources changed (frontend/scripts/ensure-build.mjs, which
 * needs Node).
 */
function dist_frontend(?string $given, bool $build): string
{
    if ($given !== null) {
        $dir = rtrim(str_replace('\\', '/', $given), '/');
    } else {
        $dir = ROOT . '/frontend/dist/japanese-academy/browser';
        if ($build) {
            $cmd = ['node', ROOT . '/frontend/scripts/ensure-build.mjs'];
            $proc = proc_open($cmd, [STDIN, STDOUT, STDERR], $pipes, ROOT);
            if (!is_resource($proc) || proc_close($proc) !== 0) {
                throw new RuntimeException('The frontend did not build (node frontend/scripts/ensure-build.mjs): the lines above say why.');
            }
        }
    }
    if (!is_file("$dir/index.html")) {
        throw new RuntimeException("There is no built app in $dir (no index.html): npm run build:frontend makes it.");
    }
    return $dir;
}

/**
 * What goes in: upload path => source path. The built app becomes public/,
 * with Apache's two files; the rest keeps its place in the repository.
 */
function dist_files(string $frontend, bool $audio): array
{
    $files = [];
    foreach (dist_tree(dirname($frontend), basename($frontend)) as $file) {
        $files['public/' . substr($file, strlen(basename($frontend)) + 1)] = dirname($frontend) . "/$file";
    }
    $files['public/index.php'] = BACKEND . '/public/index.php';
    $files['public/.htaccess'] = BACKEND . '/public/.htaccess';
    foreach (['api', 'src', 'migrations', 'vendor'] as $dir) {
        foreach (dist_tree(BACKEND, $dir) as $file) {
            $files["backend/$file"] = BACKEND . "/$file";
        }
    }
    foreach (['config/config.php', 'setup.php', 'composer.json', 'composer.lock'] as $file) {
        $files["backend/$file"] = BACKEND . "/$file";
    }
    // the data the study content is built from (the list content_sync() hashes), and the clips
    foreach (CONTENT_FILES as $file) {
        if (str_starts_with($file, 'data/')) {
            $files[$file] = ROOT . "/$file";
        }
    }
    if ($audio) {
        foreach (glob(AUDIO_CLIPS . '/*.mp3') ?: [] as $clip) {
            $files['data/audio/' . basename($clip)] = $clip;
        }
    }
    // a settings file, a token: never; the setup page makes them on the server
    $files = array_filter($files, static fn (string $to): bool => !preg_match(DIST_NEVER, $to), ARRAY_FILTER_USE_KEY);
    ksort($files);
    return $files;
}

$opts = getopt('', ['out:', 'no-audio', 'list', 'frontend:']);
$out = rtrim(str_replace('\\', '/', (string) ($opts['out'] ?? ROOT . '/dist/japanese-academy')), '/');
$started = microtime(true);

try {
    $frontend = dist_frontend(isset($opts['frontend']) ? (string) $opts['frontend'] : null, !isset($opts['list']));
    $files = dist_files($frontend, !isset($opts['no-audio']));
    if (isset($opts['list'])) {
        echo json_text(array_merge(array_keys($files), array_map(static fn (string $d): string => "$d/.htaccess", DIST_DENIED))), "\n";
        exit(0);
    }
    dist_clear($out);

    $bytes = 0;
    foreach ($files as $to => $from) {
        dist_put($out, $to, $from);
        $bytes += (int) filesize($from);
    }
    foreach (DIST_DENIED as $dir) {
        dist_put($out, "$dir/.htaccess", null, DIST_DENY);
    }

    // What went in, checked again from the other side.
    $built = [];
    $items = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($out, FilesystemIterator::SKIP_DOTS));
    foreach ($items as $item) {
        if ($item->isFile()) {
            $built[] = str_replace('\\', '/', substr($item->getPathname(), strlen($out) + 1));
        }
    }
    sort($built);
    $wrong = array_values(array_filter($built, static fn (string $f): bool => (bool) preg_match(DIST_NEVER, $f)));
    if ($wrong) {
        throw new RuntimeException('These must not be uploaded: ' . implode(', ', $wrong));
    }
    $needed = ['public/index.html', 'public/index.php', 'public/.htaccess', 'backend/setup.php', 'backend/api/app.php', 'backend/api/front.php',
        'backend/src/bootstrap.php', 'backend/src/anotoki_iam.php', 'backend/config/config.php', 'backend/vendor/autoload.php', 'data/vocab.json'];
    foreach ($needed as $file) {
        if (!in_array($file, $built, true)) {
            throw new RuntimeException("$file is missing from the build.");
        }
    }
    // every PHP file parses, with this PHP (TOKEN_PARSE is a full parse, as php -l does)
    foreach ($built as $file) {
        if (str_ends_with($file, '.php')) {
            try {
                token_get_all((string) file_get_contents("$out/$file"), TOKEN_PARSE);
            } catch (ParseError $e) {
                throw new RuntimeException("$file does not parse: {$e->getMessage()} (line {$e->getLine()})");
            }
        }
    }

    $commit = trim((string) @shell_exec('git -C ' . escapeshellarg(ROOT) . ' rev-parse --short HEAD 2>' . (PHP_OS_FAMILY === 'Windows' ? 'NUL' : '/dev/null')));
    file_put_contents("$out/" . DIST_MARK, json_text(['builtAt' => iso_time(now_ms()), 'commit' => $commit, 'files' => count($built)]) . "\n");

    $mb = number_format($bytes / 1048576, 1);
    $count = count($built);
    $seconds = number_format(microtime(true) - $started, 1);
    echo <<<TXT

  Built $out
  $mb MB in $count files ($seconds s)

  Upload the whole folder to the site's folder on the host, by FTP or SFTP:
    public/     the site's document root: point the (sub)domain here
    backend/ data/ backups/   beside public/, outside the document root
  The first time, open https://<the site>/setup.php (docs/kb/hosting.md).
  Later uploads leave backend/config/*.local.php, backend/storage/ and backups/
  as they are on the server; the first request after an upload applies new
  migrations and rebuilds the study content.


TXT;
} catch (Throwable $e) {
    fwrite(STDERR, "\n  build-dist: {$e->getMessage()}\n\n");
    exit(1);
}
