<?php
/**
 * Who is asking, for every address with somebody's data.
 *
 * person_middleware(): auth_user() (src/auth.php) — the person of a verified
 * access token of the IAM, and nobody else. Their IAM user id goes on the
 * request as 'uid', and every handler passes it down: the only place a user
 * id comes from. No token: 401; a token that does not verify: 401. A token
 * with no role here is a learner like any other. Every address that is a
 * signed-in person's alone uses it: the admin panel, the Migrations page, a
 * person's own data file (/api/me/data), the move at sign-in.
 *
 * learner_middleware(): the study addresses (the kanji SRS, the exam, the
 * reports: study_route() in routes/site.php), which a visitor may use too
 * when the IAM says this site does not require sign-in (src/access.php,
 * src/visitors.php). Who a request is, in this order:
 *
 *   1. an Authorization header of the Bearer scheme (auth_sent_token()), with
 *      or without a token after it: that person (auth_user()), or 401 - a bad
 *      or expired token never falls back to the key, which is not even read;
 *   2. else, when sign-in is required here (access_login_required(), which
 *      also says so while migration 007 is not applied): 401
 *      sign_in_required, with a visitor key or without - the key is never
 *      looked up, counted or swept early, and the browser keeps it;
 *   3. else an X-Visitor-Key: that visitor (visitors_find(); malformed or
 *      nobody's: 401 visitor_unknown); 'uid' is their negative id;
 *   4. else nobody: 'uid' 0, which matches no row, so every read answers as
 *      for a learner with no data yet - and a save that may make a visitor
 *      ($mayMake: an answer, an item's notes, the settings, a submitted exam)
 *      makes one within the limits, in that save's own transaction: refused
 *      or failed, it makes nobody and counts nothing; done, its answer
 *      carries the new key in X-Visitor-Key (with Cache-Control: no-store,
 *      as every JSON answer here), and nowhere else.
 *
 * A visitor is never a person: no role, never the admin panel, the
 * Migrations page, a data file or anybody else's row (those addresses use
 * person_middleware(), which reads only a token). $cap names what a visitor's
 * save would grow ('attempts', 'answers'): at its cap, 422 visitor_limit
 * before the handler runs (visitors_check_caps()). Every such request leaves
 * the sweep of long-unseen visitors for after its answer (at most once an
 * hour across the site; src/after.php).
 *
 * Their time zone (the browser's X-Time-Zone, else the one kept on their row,
 * else UTC) is PHP's for the rest of the request, so every day and hour of
 * theirs - a review time rounded to the hour, the day an answer counts on,
 * the dashboard's today and its forecast, the date in a stored exam report -
 * is in their zone. The site's own housekeeping says UTC itself (utc_date(),
 * utc_stamp()).
 *
 * daily_backup_middleware(): the first page load of a new day (a UTC day,
 * whoever's page it is) takes the day's backup, of everybody's data — on a
 * server left running overnight, and on a
 * hosted site, which has no start. A page load, never an answer; once a day it
 * costs a moment, and a failure must not cost the page.
 */

declare(strict_types=1);

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Server\RequestHandlerInterface as RequestHandler;

function person_middleware(): callable
{
    return static function (Request $request, RequestHandler $handler): Response {
        $user = auth_user();
        date_default_timezone_set($user['timeZone']);
        return $handler->handle($request->withAttribute('uid', $user['id'])->withAttribute('visitor', false));
    };
}

function learner_middleware(bool $mayMake = false, ?string $cap = null): callable
{
    return static function (Request $request, RequestHandler $handler) use ($mayMake, $cap): Response {
        after_response_add('visitors_sweep_now_and_then', 'visitors_sweep');
        if (auth_sent_token()) {
            $user = auth_user();
            date_default_timezone_set($user['timeZone']);
            return $handler->handle($request->withAttribute('uid', $user['id'])->withAttribute('visitor', false));
        }
        if (access_login_required()) {
            throw new HttpError(401, 'Sign in first.', ['WWW-Authenticate: Bearer'], 'sign_in_required');
        }
        $zone = auth_time_zone_header($request->getServerParams());
        $key = visitors_key_of($request->getHeaderLine(VISITOR_HEADER));
        if ($key !== null) {
            $visitor = visitors_find($key, $zone);
            date_default_timezone_set($visitor['timeZone']);
            if ($cap !== null) {
                visitors_check_caps($visitor['id'], $cap);
            }
            return $handler->handle($request->withAttribute('uid', $visitor['id'])->withAttribute('visitor', true));
        }
        date_default_timezone_set($zone ?? 'UTC');
        if (!$mayMake) {
            return $handler->handle($request->withAttribute('uid', 0)->withAttribute('visitor', false));
        }
        return learner_first_save($request, $handler, $zone);
    };
}

/**
 * Nobody's save that makes a visitor: the visitor and the save in one
 * transaction (the handler's own db_tx() joins it), committed only when the
 * save went through (a status below 300); its answer then carries the key.
 */
function learner_first_save(Request $request, RequestHandler $handler, ?string $zone): Response
{
    $pdo = db();
    $pdo->beginTransaction();
    try {
        [$id, $key] = visitors_make($request->getServerParams(), $zone);
        $response = $handler->handle($request->withAttribute('uid', $id)->withAttribute('visitor', true));
        if ($response->getStatusCode() >= 300) {
            $pdo->rollBack();
            return $response;
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
    return $response->withHeader(VISITOR_HEADER, $key)->withHeader('Cache-Control', 'no-store');
}

function daily_backup_middleware(): callable
{
    return static function (Request $request, RequestHandler $handler): Response {
        try {
            backup_daily();
        } catch (Throwable $e) {
            error_log('[backup] skipped: ' . $e->getMessage());
        }
        return $handler->handle($request);
    };
}

/** Who this request is, as person_middleware() or learner_middleware() found them: a person's id, a visitor's (negative), or 0 for nobody. */
function uid(Request $request): int
{
    return (int) $request->getAttribute('uid');
}
