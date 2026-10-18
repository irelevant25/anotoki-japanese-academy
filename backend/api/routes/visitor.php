<?php
/**
 * At sign-in, what this browser studied as a visitor becomes the signed-in
 * person's (src/visitors.php does the work) - the one place the two meet, so
 * it takes both: the person's token (data_route(): person_middleware(), a
 * verified token and nothing else) and the visitor's key.
 *
 *   POST /api/visitor/move   X-Visitor-Key: <key>   -> {found, items, kept, attempts, answers}
 *
 * In one transaction (visitors_move()): an item both studied keeps the
 * person's progress (kept); every other item, day count, answer and exam
 * attempt of the visitor's becomes theirs; then the visitor is gone, and its
 * key opens nothing. A key nobody has - moved already by another tab, swept,
 * never there - is {found: false} with zeros, so the move can be asked again
 * safely. No key, or one that is not a key: 422 bad_visitor_key. A save of
 * either at the same moment: 503 visitor_move_retry (ask again). Migration
 * 007 not applied: 503 visitors_unavailable.
 *
 * It works whether or not the IAM says this site requires sign-in: switching
 * that on stops a key from being somebody, not from being handed in with a
 * token - so what a visitor studied before still comes into their account
 * when they sign in.
 */

declare(strict_types=1);

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

function academy_visitor_routes(Slim\App $app): void
{
    data_route(
        $app->post('/api/visitor/move', static function (Request $request, Response $response): Response {
            $key = visitors_key_of($request->getHeaderLine(VISITOR_HEADER));
            if ($key === null || !visitors_well_formed($key)) {
                throw new HttpError(422, 'Send the visitor\'s key in the X-Visitor-Key header.', [], 'bad_visitor_key');
            }
            return json_response($response, visitors_move(uid($request), $key));
        }),
    );
}
