<?php
/**
 * Requests and responses of the API, over Slim's PSR-7 objects: JSON in and
 * out, text, and files with byte ranges.
 */

declare(strict_types=1);

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/** Headers given as 'Name: value' lines, added to a response. */
function with_headers(Response $response, array $headers): Response
{
    foreach ($headers as $header) {
        [$name, $value] = explode(':', $header, 2);
        $response = $response->withHeader(trim($name), trim($value));
    }
    return $response;
}

/** A JSON answer. $data may already be JSON text. Nothing of it is ever cached, unless $headers say otherwise. */
function json_response(Response $response, $data, int $status = 200, array $headers = []): Response
{
    $response->getBody()->write(is_string($data) ? $data : json_text($data));
    $response = $response->withStatus($status)
        ->withHeader('Content-Type', 'application/json; charset=utf-8')
        ->withHeader('Cache-Control', 'no-store');
    return with_headers($response, $headers);
}

/** An HTML (or other text) answer. */
function text_response(Response $response, int $status, string $body, string $type = 'text/html; charset=utf-8', array $headers = []): Response
{
    $response->getBody()->write($body);
    return with_headers($response->withStatus($status)->withHeader('Content-Type', $type), $headers);
}

/**
 * The request's JSON body as an array; [] when there is none. As before the
 * move to Slim, only a JSON object or array is a body: anything else is a 400.
 */
function request_body(Request $request): array
{
    $type = strtolower($request->getHeaderLine('Content-Type'));
    $raw = (string) $request->getBody();
    if (!preg_match('~^application/([a-z0-9.+-]*\+)?json~', $type) || trim($raw) === '') {
        return [];
    }
    try {
        $data = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
    } catch (JsonException $e) {
        throw new HttpError(400, 'The request body is not valid JSON.');
    }
    if (!is_array($data)) {
        throw new HttpError(400, 'The request body must be a JSON object.');
    }
    return $data;
}

/**
 * A file, with byte ranges: browsers ask for audio in ranges, so 206 is the
 * normal answer. A HEAD request gets the headers alone.
 */
function file_response(Request $request, Response $response, string $file, string $type, array $headers = []): Response
{
    $size = (int) filesize($file);
    $start = 0;
    $end = $size - 1;
    $status = 200;
    if (preg_match('/^bytes=(\d*)-(\d*)$/D', trim($request->getHeaderLine('Range')), $m) && ($m[1] !== '' || $m[2] !== '')) {
        if ($m[1] === '') {
            $start = max(0, $size - (int) $m[2]);
        } else {
            $start = (int) $m[1];
            if ($m[2] !== '') {
                $end = min($end, (int) $m[2]);
            }
        }
        if ($start > $end) {
            return $response->withStatus(416)->withHeader('Content-Range', "bytes */$size");
        }
        $status = 206;
        $response = $response->withHeader('Content-Range', "bytes $start-$end/$size");
    }
    $response = with_headers($response->withStatus($status)
        ->withHeader('Content-Type', $type)
        ->withHeader('Accept-Ranges', 'bytes')
        ->withHeader('Content-Length', (string) ($end - $start + 1))
        ->withHeader('Last-Modified', gmdate('D, d M Y H:i:s', (int) filemtime($file)) . ' GMT'), $headers);
    if ($request->getMethod() === 'HEAD') {
        return $response;
    }
    $fh = fopen($file, 'rb');
    fseek($fh, $start);
    $response->getBody()->write((string) fread($fh, $end - $start + 1));
    fclose($fh);
    return $response;
}

/**
 * The rest of an error's sentence for the browser: the details on this
 * computer, none on a hosted site, whose error log has them (a database error
 * names the user and the host).
 */
function error_detail(Throwable $e): string
{
    return PHP_SAPI === 'cli-server' ? ': ' . $e->getMessage() : '. The server\'s error log says more.';
}
