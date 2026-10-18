<?php
/**
 * Baseline headers on every answer of the API. None is load-bearing on its
 * own; together they turn a small mistake into a non-event: nosniff stops the
 * browser guessing a type, the frame rules stop an answer being framed, and a
 * JSON answer loads nothing, so it gets the strictest policy. A route that set
 * one of them knows its own needs better (a report has a policy of its own),
 * so each is filled in only where it is missing.
 */

declare(strict_types=1);

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Server\RequestHandlerInterface as RequestHandler;

function security_headers_middleware(): callable
{
    return static function (Request $request, RequestHandler $handler): Response {
        $response = $handler->handle($request);
        $ensure = static fn(Response $r, string $name, string $value): Response => $r->hasHeader($name) ? $r : $r->withHeader($name, $value);
        $response = $ensure($response, 'X-Content-Type-Options', 'nosniff');
        $response = $ensure($response, 'X-Frame-Options', 'DENY');
        $response = $ensure($response, 'Referrer-Policy', 'no-referrer');
        return $ensure($response, 'Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    };
}
