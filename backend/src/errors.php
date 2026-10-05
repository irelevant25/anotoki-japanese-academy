<?php
/**
 * An error with the HTTP answer it deserves. The domain code throws it where a
 * request cannot go on (nobody signed in, a database not set up); the API's
 * error middleware (backend/api/middleware/errors.php) answers it as JSON:
 * {"error": sentence, "code": word?, "detail": reason?}. The sentence is for
 * the command line, the logs and the tests; a page words the failure itself,
 * from the code.
 */

declare(strict_types=1);

final class HttpError extends RuntimeException
{
    public int $status;
    /** Extra headers, 'Name: value'. */
    public array $headers;
    /** A word for the browser to act on ('not_set_up'), or null. */
    public ?string $errorCode;
    /** Why, for the owner on their own computer (error_reason()), or null: a website never says. */
    public ?string $detail;
    /** More of the answer, for every caller alike: a number the page needs to word it (the 413's limit). */
    public array $fields;

    public function __construct(int $status, string $message, array $headers = [], ?string $errorCode = null, ?string $detail = null, array $fields = [])
    {
        parent::__construct($message);
        $this->status = $status;
        $this->headers = $headers;
        $this->errorCode = $errorCode;
        $this->detail = $detail;
        $this->fields = $fields;
    }
}

/**
 * Why a request failed, for the answer's "detail": the exception's message
 * under PHP's built-in server (this computer), null anywhere else. A website
 * says no more than a sentence; its error log has the rest (a database error
 * names the user and the host). The one exception is the Migrations page's
 * Apply (upkeep_apply()): its administrator reads why a file failed, in
 * PostgreSQL's words, on a website too.
 */
function error_reason(Throwable $e, string $sapi = PHP_SAPI): ?string
{
    return $sapi === 'cli-server' ? $e->getMessage() : null;
}

/** What the app says while it is not set up yet: the API answers 503 with it, and the page offers /setup.php. */
const NOT_SET_UP = 'Japanese Academy is not set up yet. Open /setup.php to set it up.';

/** The 503 of a copy that is not set up yet (no settings, or a database without its tables). */
function not_set_up(): HttpError
{
    return new HttpError(503, NOT_SET_UP, [], 'not_set_up');
}
