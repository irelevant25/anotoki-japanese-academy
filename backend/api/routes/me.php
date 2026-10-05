<?php
/**
 * Your own data, as one file (src/me.php does the work). Every signed-in
 * person, with or without a role; their own data, and nobody else's:
 *
 *   GET  /api/me/data     all of your data: a download (japanese-academy-<your date>.json,
 *                         no-store), {format, version: 2, takenAt, everybody: false,
 *                         users: [{id, username, createdAt, lastSeenAt, timeZone, kanji, log, attempts}]}
 *   PUT  /api/me/data     a file of that kind as the body: it replaces your data, after a copy
 *                         of what is there -> {items, days, log, attempts, reports, copy};
 *                         413 too_large {limit}, 422 not_a_data_file, 422 several_people
 */

declare(strict_types=1);

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

function academy_me_routes(Slim\App $app): void
{
    data_route($app->get('/api/me/data', static function (Request $request, Response $response): Response {
        return json_response($response, me_export(uid($request)), 200,
            ['Content-Disposition: attachment; filename="' . me_file_name() . '"']);
    }));

    data_route($app->put('/api/me/data', static function (Request $request, Response $response): Response {
        // Straight into me_import(): the file's text is held once, and let go of once it is read.
        // The zone this request named wins over the file's (the file's counts only without one).
        $zone = auth_time_zone_header($request->getServerParams());
        return json_response($response, me_import(uid($request), me_body($request, me_import_limit()), $zone));
    }));
}

/**
 * The body of an import, at most $limit bytes: a Content-Length over it is
 * refused before a byte is read, and a body without one is read no further
 * than one byte past it. HttpError 413 too_large with the limit.
 */
function me_body(Request $request, int $limit): string
{
    $length = $request->getHeaderLine('Content-Length');
    if ($length !== '' && (!ctype_digit($length) || strlen($length) > 18 || (int) $length > $limit)) {
        throw me_too_large($limit);
    }
    $body = $request->getBody();
    $text = '';
    while (!$body->eof() && strlen($text) <= $limit) {
        $chunk = $body->read(65536);
        if ($chunk === '') {
            break;
        }
        $text .= $chunk;
    }
    if (strlen($text) > $limit) {
        throw me_too_large($limit);
    }
    return $text;
}
