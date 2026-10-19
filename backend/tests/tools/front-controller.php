<?php
// What frontend/.htaccess does on Apache, for PHP's built-in web server: the
// router of backend/tests/api/deploy.test.php and setup.test.php, which serve a
// built site (a release anotoki-deploy builds) the way a host would.
// The backend's addresses go to index.php, the front controller; a file of the
// document root is sent as it is, with the headers .htaccess gives it (a PHP
// file runs; Apache's own .ht* files are refused, as its configuration
// refuses them); a page of the app gets its index.html; any other address
// with a file extension is a 404.
declare(strict_types=1);

$root = (string) $_SERVER['DOCUMENT_ROOT'];
$path = rawurldecode((string) parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH));
if (preg_match('~^/(api|audio|report)(/|$)~', $path) || $path === '/setup.php') {
    require $root . '/index.php';
    return true;
}

/** A file of the document root, sent with .htaccess's headers (mod_headers). */
$send = static function (string $file): void {
    $types = [
        'html' => 'text/html; charset=utf-8',
        'js' => 'text/javascript; charset=utf-8',
        'css' => 'text/css; charset=utf-8',
        'json' => 'application/json',
        'svg' => 'image/svg+xml',
        'png' => 'image/png',
        'ico' => 'image/x-icon',
        'txt' => 'text/plain; charset=utf-8',
    ];
    $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
    header('Content-Type: ' . ($types[$ext] ?? 'application/octet-stream'));
    header('X-Content-Type-Options: nosniff');
    if ($ext === 'html') {
        header('Cache-Control: no-cache');
        header('X-Frame-Options: DENY');
        header('Referrer-Policy: no-referrer');
    } elseif (preg_match('/-[A-Z0-9]{8}\.(js|css)$/', basename($file))) {
        header('Cache-Control: public, max-age=31536000, immutable');
    }
    readfile($file);
};

if ($path !== '/' && !str_contains($path, "\0") && is_file($root . $path)) {
    if (preg_match('~(^|/)\.ht[^/]*$~i', $path)) {
        http_response_code(403);
        echo 'Forbidden';
        return true;
    }
    if (preg_match('~\.php$~i', $path)) {
        return false;
    }
    $send($root . $path);
    return true;
}
if (!preg_match('~\.[^/]*$~', $path) && is_file("$root/index.html")) {
    $send("$root/index.html");
    return true;
}
http_response_code(404);
echo 'Not found';
return true;
