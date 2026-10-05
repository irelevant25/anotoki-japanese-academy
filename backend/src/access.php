<?php
/**
 * Does this site require sign-in? The IAM says, per application: its
 * "Sign-in required" switch on the application's page (IAM migration 010),
 * answered to anybody at GET {issuer}/api/public/applications/{client_id}.
 * The IAM's PHP SDK reads it (anotoki_iam_login_required(),
 * src/anotoki_iam.php v1.1.0), and decides everything about it: the answer
 * kept for a minute in backend/storage/cache/ (a folder only this site
 * writes: the kept answer is what would open the site to visitors), one
 * request asking when the minute runs out while the others use the last
 * value, the last value when the IAM does not answer, and true - sign-in
 * required - whenever nothing better is known: never read, a 404 (an IAM
 * without the switch yet, or this application unknown or switched off
 * there), an answer that is not one.
 *
 * This file adds two things to the SDK's answer, and nothing else:
 *
 *   - visitors_ready() (src/visitors.php): while the database cannot keep
 *     visitors - migration 007 not applied - sign-in is required whatever
 *     the IAM says, so a visitor's key
 *     is answered 401 sign_in_required like no token at all, and the browser
 *     keeps it for a later day. The database is asked only when the
 *     IAM says sign-in is not needed, so in every other case (a 404 from an
 *     IAM without the switch, a site that requires sign-in) GET
 *     /api/auth/config needs no database, as before;
 *   - the tests' seams, through auth_iam_config(): auth.application_file (the
 *     IAM's answer from a file), auth.application_ttl and auth.cache_dir, for
 *     a throwaway database only.
 *
 * GET /api/auth/config relays it to the browser (loginRequired), so the
 * browser never asks the IAM, and the study addresses ask it of a request
 * without a token (learner_middleware() in api/middleware/person.php): true,
 * 401 sign_in_required; false, a visitor or nobody (docs/kb/sign-in.md,
 * *Is sign-in required here?* and *Visitors*). A request with a token never
 * needs it.
 */

declare(strict_types=1);

/**
 * True unless the IAM says this site lets people in without signing in, and
 * the database can keep them. $reason says where the answer came from, for a
 * log line or a test: the SDK's (fresh, read, unknown_application, stale,
 * never_read, backing_off, refreshing, not_configured), visitors_not_ready,
 * or failed: … . Never throws: anything that goes wrong is sign-in required.
 */
function access_login_required(?string &$reason = null): bool
{
    try {
        if (anotoki_iam_login_required(auth_iam_config(), $reason)) {
            return true;
        }
        if (!visitors_ready()) {
            $reason = 'visitors_not_ready';
            return true;
        }
        return false;
    } catch (Throwable $e) {
        // This app turns every PHP warning into an exception: whatever broke, the site stays closed.
        $reason = 'failed: ' . auth_log_text($e->getMessage());
        error_log('[access] whether sign-in is required could not be read, so it is: ' . $reason);
        return true;
    }
}
