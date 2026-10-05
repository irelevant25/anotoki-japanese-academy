<?php
/**
 * Work that belongs to a request but not to its answer - the sweep of
 * visitors unseen for 30 days (src/visitors.php) - done after the answer.
 *
 * api/front.php runs it once Slim has written the answer: PHP-FPM and
 * LiteSpeed close the connection first (fastcgi_finish_request(),
 * litespeed_finish_request()); where PHP cannot (Apache's mod_php, PHP's
 * built-in server on this computer and in the tests), the answer is flushed
 * and the work runs while the connection is still open. Each piece runs on
 * its own: a failure is logged and never reaches the answer, nor stops the
 * next piece. The analyzer's src/Web/AfterResponse.php is the pattern.
 */

declare(strict_types=1);

/** Adds work for after this request's answer; a $name already added is not added twice. */
function after_response_add(callable $work, ?string $name = null): void
{
    after_response_list($work, $name);
}

/** Runs the work added, after the answer has gone out as far as PHP can send it. */
function after_response_run(): void
{
    $work = after_response_list();
    if (!$work) {
        return;
    }
    ignore_user_abort(true); // the browser may go once it has its answer: the work goes on
    if (function_exists('fastcgi_finish_request')) {
        fastcgi_finish_request();
    } elseif (function_exists('litespeed_finish_request')) {
        litespeed_finish_request();
    } else {
        while (ob_get_level() > 0) {
            @ob_end_flush();
        }
        flush();
    }
    foreach ($work as $piece) {
        try {
            $piece();
        } catch (Throwable $e) {
            error_log('[after] ' . auth_log_text($e->getMessage()));
        }
    }
}

/**
 * The work list: with $work, adds it (once per $name); without, hands the
 * list over and empties it.
 */
function after_response_list(?callable $work = null, ?string $name = null): array
{
    static $list = [];
    if ($work === null) {
        $taken = array_values($list);
        $list = [];
        return $taken;
    }
    if ($name === null) {
        $list[] = $work;
    } elseif (!isset($list[$name])) {
        $list[$name] = $work;
    }
    return [];
}
