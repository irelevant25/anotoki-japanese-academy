<?php
/**
 * An error with the HTTP answer it deserves. The domain code throws it where a
 * request cannot go on (nobody signed in, a database not set up); the API's
 * error middleware (backend/api/middleware/errors.php) answers it as JSON:
 * {"error": sentence, "code": word?}.
 */

declare(strict_types=1);

final class HttpError extends RuntimeException
{
    public int $status;
    /** Extra headers, 'Name: value'. */
    public array $headers;
    /** A word for the browser to act on ('not_set_up'), or null. */
    public ?string $errorCode;

    public function __construct(int $status, string $message, array $headers = [], ?string $errorCode = null)
    {
        parent::__construct($message);
        $this->status = $status;
        $this->headers = $headers;
        $this->errorCode = $errorCode;
    }
}

/** What the app says while it is not set up yet: the API answers 503 with it, and the page offers /setup.php. */
const NOT_SET_UP = 'Japanese Academy is not set up yet. Open /setup.php to set it up.';

/** The 503 of a copy that is not set up yet (no settings, or a database without its tables). */
function not_set_up(): HttpError
{
    return new HttpError(503, NOT_SET_UP, [], 'not_set_up');
}
