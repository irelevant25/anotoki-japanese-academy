<?php
/**
 * One request, whichever server received it:
 *
 *   backend/router.php          PHP's built-in web server: this computer and the tests
 *   public/index.php            Apache's front controller on a hosted site (the upload's;
 *                               its source is backend/public/). public/.htaccess sends it
 *                               /api, /audio, /report and /setup.php, and Apache sends the
 *                               built app's files itself
 *
 *   /setup.php                  the setup page (backend/setup.php), while it is there
 *   /api/…  /audio/…  /report/… the API (app.php)
 *   anything else               the frontend, the built Angular app: one of its files as it
 *                               is, and a path without a file extension its index.html (the
 *                               app's own router draws the page). Anything else is a 404:
 *                               no PHP file, dotfile or file outside the build is ever sent.
 */

declare(strict_types=1);

/** Answers this request. $frontend is the folder of the built Angular app. */
function academy_front(string $frontend): void
{
    $method = (string) ($_SERVER['REQUEST_METHOD'] ?? 'GET');
    $path = (string) parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);
    $decoded = rawurldecode($path);

    if ($decoded === '/setup.php') {
        $setup = dirname(__DIR__) . '/setup.php';
        if (is_file($setup)) {
            require $setup;
            return;
        }
        front_not_found();
        return;
    }
    // decoded, as the router reads it: /%61pi/… is /api/…
    if (preg_match('~^/(api|audio|report)(/|$)~', $decoded)) {
        require_once __DIR__ . '/app.php';
        academy_app()->run();
        after_response_run(); // what a request left for after its answer: the visitors' sweep (src/after.php)
        return;
    }
    front_file($frontend, $method, $decoded);
}

/** The media types of what an Angular build holds. */
const FRONT_TYPES = [
    'html' => 'text/html; charset=utf-8',
    'js' => 'text/javascript; charset=utf-8',
    'mjs' => 'text/javascript; charset=utf-8',
    'css' => 'text/css; charset=utf-8',
    'json' => 'application/json; charset=utf-8',
    'map' => 'application/json; charset=utf-8',
    'txt' => 'text/plain; charset=utf-8',
    'svg' => 'image/svg+xml',
    'png' => 'image/png',
    'jpg' => 'image/jpeg',
    'jpeg' => 'image/jpeg',
    'gif' => 'image/gif',
    'webp' => 'image/webp',
    'avif' => 'image/avif',
    'ico' => 'image/x-icon',
    'woff' => 'font/woff',
    'woff2' => 'font/woff2',
    'ttf' => 'font/ttf',
    'webmanifest' => 'application/manifest+json',
];

/** A file of the built app, or its index.html for a page's address. */
function front_file(string $frontend, string $method, string $path): void
{
    if ($method !== 'GET' && $method !== 'HEAD') {
        front_not_found();
        return;
    }
    $root = realpath($frontend);
    if ($root === false || !is_file($root . DIRECTORY_SEPARATOR . 'index.html')) {
        front_not_built();
        return;
    }
    $file = str_contains($path, "\0") ? false : realpath($root . $path);
    $inside = $file !== false && str_starts_with($file, $root . DIRECTORY_SEPARATOR)
        ? str_replace('\\', '/', substr($file, strlen($root))) : null;
    if ($inside !== null && is_file((string) $file) && !preg_match('~(^|/)\.|\.php$~i', $inside)) {
        front_send((string) $file, $method);
        return;
    }
    // a page of the app (/kanji/reviews): no extension in its last part
    if (!preg_match('~\.[^/]*$~', $path)) {
        front_send($root . DIRECTORY_SEPARATOR . 'index.html', $method);
        return;
    }
    front_not_found();
}

/**
 * Sends one file of the build. The scripts and styles the build names with a
 * hash of their content (main-4GHK3Z7Q.js) never change under that name, so
 * the browser may keep them; everything else (index.html, the changelog) it
 * asks again for. The same rule as public/.htaccess's: a file of public/ that
 * merely looks hashed (logo-20260929.svg) must not be kept for a year.
 */
function front_send(string $file, string $method): void
{
    $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
    header('Content-Type: ' . (FRONT_TYPES[$ext] ?? 'application/octet-stream'));
    header('Content-Length: ' . filesize($file));
    header('X-Content-Type-Options: nosniff');
    header(preg_match('/-[A-Z0-9]{8}\.(js|css)$/', basename($file)) ? 'Cache-Control: public, max-age=31536000, immutable' : 'Cache-Control: no-cache');
    if ($ext === 'html') {
        header('X-Frame-Options: DENY');
        header('Referrer-Policy: no-referrer');
    }
    if ($method !== 'HEAD') {
        readfile($file);
    }
}

function front_not_found(): void
{
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    echo 'Not found';
}

/** The API works, but there is no app to show yet. */
function front_not_built(): void
{
    http_response_code(503);
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-store');
    echo '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        . '<title>Japanese Academy</title></head><body style="font:16px/1.6 system-ui,sans-serif;max-width:40rem;margin:3rem auto;padding:0 1rem">'
        . '<h1>Japanese Academy</h1><p>The app has not been built yet: run <code>npm run build</code> in <code>frontend/</code>'
        . ' (or <code>node frontend/scripts/ensure-build.mjs</code>, which builds only when its sources changed) and reload this page.</p>'
        . '<p>While you work on it, the development server at <a href="http://localhost:4400">http://localhost:4400</a> shows it instead.</p>'
        . '</body></html>';
}
