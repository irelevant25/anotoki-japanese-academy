<?php
/**
 * Every failure becomes a JSON answer {"error": sentence, "code"?: word}: an
 * HttpError with its own status (a sign-in refused, a copy not set up), an
 * unknown address 404, a database that cannot be reached 503, anything else
 * 500. On a hosted site the sentence says no more than that; the details go
 * to the error log.
 */

declare(strict_types=1);

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Server\RequestHandlerInterface as RequestHandler;

function errors_middleware(): callable
{
    return static function (Request $request, RequestHandler $handler): Response {
        try {
            return $handler->handle($request);
        } catch (HttpError $e) {
            $body = ['error' => $e->getMessage()] + ($e->errorCode !== null ? ['code' => $e->errorCode] : []);
            if ($e->errorCode === 'not_set_up') {
                $body['setup'] = '/setup.php';
            }
            return json_response(new Slim\Psr7\Response(), $body, $e->status, $e->headers);
        } catch (Slim\Exception\HttpNotFoundException $e) {
            return json_response(new Slim\Psr7\Response(), ['error' => 'Not found', 'code' => 'not_found'], 404);
        } catch (Slim\Exception\HttpMethodNotAllowedException $e) {
            return json_response(new Slim\Psr7\Response(), ['error' => 'Method not allowed', 'code' => 'method_not_allowed'], 405,
                ['Allow: ' . implode(', ', $e->getAllowedMethods())]);
        } catch (PDOException $e) {
            error_log('[db] ' . $e->getMessage());
            return json_response(new Slim\Psr7\Response(), ['error' => 'The database is not reachable' . error_detail($e)], 503);
        } catch (Throwable $e) {
            error_log('[server] ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
            return json_response(new Slim\Psr7\Response(), ['error' => PHP_SAPI === 'cli-server' ? $e->getMessage() : 'Something went wrong on the server.'], 500);
        }
    };
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
