<?php
/**
 * The owner's addresses (/api/owner/…: the app's own words and its languages),
 * after the person middleware found who is asking. In this order:
 *
 *   1. a request whose Origin names another host than its Host  403 wrong_origin
 *   2. a person without the ADMIN role                           403 owner_only
 *   3. a body over 1 MiB                                          413 too_large
 *
 * The owner is decided here and nowhere else: the IAM role ADMIN of this
 * application on a hosted site; without sign-in (auth mode none) whoever
 * auth_user() takes for the owner, which is a request straight from this
 * computer and no other. The pages only hide what this refuses.
 *
 * The Origin is checked because without sign-in a page of another site, open
 * in the owner's browser, can reach 127.0.0.1: the browser names that page in
 * Origin, and it is never this app's address. (The setup page checks the same.)
 * Every owner write is a PUT or a DELETE, or a POST whose change is in its
 * JSON body, which request_body() takes as JSON only.
 */

declare(strict_types=1);

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Server\RequestHandlerInterface as RequestHandler;

function owner_middleware(): callable
{
    return static function (Request $request, RequestHandler $handler): Response {
        if (!owner_same_origin($request->getHeaderLine('Origin'), (string) ($request->getServerParams()['HTTP_HOST'] ?? ''))) {
            throw new HttpError(403, 'That request came from another site\'s page, not from this app.', [], 'wrong_origin');
        }
        if (!in_array('ADMIN', auth_user()['roles'], true)) {
            throw new HttpError(403, 'Only the owner of this site may read or change its words.', [], 'owner_only');
        }
        // request_body() has no limit of its own: every other body of the app is a few hundred bytes.
        $body = $request->getBody();
        if (($body->getSize() ?? strlen((string) $body)) > TRANSLATIONS_BODY_LIMIT) {
            throw new HttpError(413, 'That is more than this site takes in one go.', [], 'too_large');
        }
        return $handler->handle($request);
    };
}

/**
 * Did the request come from a page of this app? True without an Origin (a
 * request no page made, or a plain same-origin GET); with one, only when it
 * names this request's own Host: the host and the port, the scheme aside (a
 * proxy in front of a site may speak https where the app sees http).
 * "null", the Origin of a sandboxed frame, names no host and is refused.
 */
function owner_same_origin(string $origin, string $host): bool
{
    if ($origin === '') {
        return true;
    }
    return $host !== '' && preg_match('~^https?://([^/\s]+)$~Di', $origin, $m) === 1 && strtolower($m[1]) === strtolower($host);
}
