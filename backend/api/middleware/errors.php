<?php
/**
 * Every failure becomes a JSON answer {"error": sentence, "code"?: word,
 * "detail"?: reason} (an HttpError may add what a page needs to word it: a
 * too_large's "limit"): an HttpError with its own status (a sign-in refused, a
 * role lacking), an unknown address 404, a database that cannot be reached
 * 503, anything else 500. The code is what a page words the failure from; the
 * sentence is for the command line, the logs and the tests. On a hosted site
 * the sentence says no more than that, and there is no "detail": the details
 * go to the error log. Under PHP's built-in server (this computer) "detail"
 * is the reason, for the page to show after its own words.
 */

declare(strict_types=1);

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Server\RequestHandlerInterface as RequestHandler;

/** $sapi is PHP_SAPI; a test names another to see what a website answers. */
function errors_middleware(string $sapi = PHP_SAPI): callable
{
    return static function (Request $request, RequestHandler $handler) use ($sapi): Response {
        try {
            return $handler->handle($request);
        } catch (HttpError $e) {
            $body = ['error' => $e->getMessage()] + ($e->errorCode !== null ? ['code' => $e->errorCode] : []) + $e->fields;
            // whoever threw it gave a reason only to this computer (error_reason()); checked once more here
            if ($e->detail !== null && $sapi === 'cli-server') {
                $body['detail'] = $e->detail;
            }
            return json_response(new Slim\Psr7\Response(), $body, $e->status, $e->headers);
        } catch (Slim\Exception\HttpNotFoundException $e) {
            return json_response(new Slim\Psr7\Response(), ['error' => 'Not found', 'code' => 'not_found'], 404);
        } catch (Slim\Exception\HttpMethodNotAllowedException $e) {
            return json_response(new Slim\Psr7\Response(), ['error' => 'Method not allowed', 'code' => 'method_not_allowed'], 405,
                ['Allow: ' . implode(', ', $e->getAllowedMethods())]);
        } catch (PDOException $e) {
            error_log('[db] ' . $e->getMessage());
            $body = ['error' => 'The database is not reachable' . error_detail($e, $sapi), 'code' => 'database_unavailable'];
            return json_response(new Slim\Psr7\Response(), $body + error_detail_field($e, $sapi), 503);
        } catch (Throwable $e) {
            error_log('[server] ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
            $body = ['error' => error_reason($e, $sapi) ?? 'Something went wrong on the server.', 'code' => 'server_error'];
            return json_response(new Slim\Psr7\Response(), $body + error_detail_field($e, $sapi), 500);
        }
    };
}

/** An answer's "detail", when there is one to give: ['detail' => reason] on this computer, [] on a website. */
function error_detail_field(Throwable $e, string $sapi = PHP_SAPI): array
{
    $reason = error_reason($e, $sapi);
    return $reason !== null ? ['detail' => $reason] : [];
}

/**
 * /api/meta/ is /api/meta, as it was before Slim: the trailing slash goes
 * before the routing sees the address.
 */
function trailing_slash_middleware(): callable
{
    return static function (Request $request, RequestHandler $handler): Response {
        $uri = $request->getUri();
        $path = $uri->getPath();
        if ($path !== '/' && str_ends_with($path, '/')) {
            $request = $request->withUri($uri->withPath(rtrim($path, '/')));
        }
        return $handler->handle($request);
    };
}
