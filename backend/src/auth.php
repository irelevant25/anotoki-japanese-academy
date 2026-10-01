<?php
/**
 * Who is asking. Every request that reads or writes somebody's study data
 * gets its person from auth_user() (the API's person() middleware asks), and
 * every query of that request is scoped to their user id.
 *
 * Two modes, chosen per deployment in backend/config/auth.local.php
 * (auth.mode), never by a request:
 *
 *   iam   a hosted site. The browser signs in at the anotoki IAM (the
 *         frontend's AuthService, with the IAM's browser SDK) and sends its
 *         access token with every request: Authorization: Bearer …. The token
 *         is checked here without asking the IAM: its signature against the
 *         IAM's published keys, its issuer, audience, expiry and type
 *         (src/anotoki_iam.php). Its sub is the user id. A token without a
 *         role in this application is refused: only the people the owner gave
 *         a role may study here (the IAM's "members" access, checked once more).
 *   none  the owner's own computer: no sign-in, every request is the owner
 *         (auth.local_user_id). Only under PHP's built-in server (php
 *         backend/server.php) and only from this computer: anywhere else every
 *         request is refused, so a server set up with 'none' by mistake is not
 *         open to the world.
 *
 * src/anotoki_iam.php is the IAM's PHP SDK (sdk/php/anotoki_iam.php in the IAM
 * repository) v1.0.1, copied unchanged. To update it, copy the new version over
 * it and change the version here and in docs/kb/sign-in.md.
 */

declare(strict_types=1);

/** This application's roles at the IAM. Mode none has them all. */
const AUTH_ROLES = ['ADMIN', 'MEMBER'];

const AUTH_NONE_ONLY = 'Sign-in is off here (auth mode none), and that only works on your own computer: through php backend/server.php, '
    . 'opened at 127.0.0.1 or localhost, with no proxy in between. A website needs auth mode iam in backend/config/auth.local.php.';

/** The 403 of a copy without sign-in, to a request that is not this computer's own (auth_none_allowed()). */
function auth_none_only(): HttpError
{
    return new HttpError(403, AUTH_NONE_ONLY, [], 'this_computer_only');
}

/** 'iam' or 'none'; anything else is a mistake in the settings. */
function auth_mode(): string
{
    $mode = (string) config('auth.mode');
    if ($mode !== 'iam' && $mode !== 'none') {
        throw new RuntimeException("auth.mode must be 'iam' or 'none', not '$mode' (backend/config/auth.local.php).");
    }
    return $mode;
}

/** The owner's IAM user id: whom mode none acts as, and whose the old files and version-1 backups are. */
function auth_local_user_id(): int
{
    $id = config('auth.local_user_id');
    if (is_string($id) && ctype_digit($id)) {
        $id = (int) $id;
    }
    if (!is_int($id) || $id < 1) {
        throw new RuntimeException('auth.local_user_id must be a user id (a whole number from 1).');
    }
    return $id;
}

/** What the browser needs to sign in: GET /api/auth/config. */
function auth_public_config(): array
{
    if (auth_mode() === 'none') {
        return ['mode' => 'none'];
    }
    return ['mode' => 'iam', 'issuer' => rtrim((string) config('auth.issuer'), '/'), 'clientId' => (string) config('auth.client_id')];
}

/**
 * May this request be served without sign-in? Only by PHP's built-in web
 * server (php backend/server.php, which then listens on 127.0.0.1 only), and
 * only for a request straight from this computer (auth_from_this_computer()).
 */
function auth_none_allowed(string $sapi, array $server): bool
{
    return $sapi === 'cli-server' && auth_from_this_computer($server);
}

/**
 * Did this request come from this computer, straight to its own address
 * ($server is $_SERVER)? A request that names another host, or that a proxy
 * passed on, may be anybody's: a tunnel or a proxy on this computer makes
 * every visitor come from 127.0.0.1, and a web page elsewhere can reach
 * 127.0.0.1 through a name of its own that points there (DNS rebinding). The
 * setup page asks too: from this computer it needs no token.
 */
function auth_from_this_computer(array $server): bool
{
    $remote = (string) ($server['REMOTE_ADDR'] ?? '');
    if (!($remote === '::1' || str_starts_with($remote, '127.'))) {
        return false;
    }
    foreach (['HTTP_FORWARDED', 'HTTP_X_FORWARDED_FOR', 'HTTP_X_REAL_IP'] as $passedOn) {
        if (isset($server[$passedOn])) {
            return false;
        }
    }
    return preg_match('/^(127\.0\.0\.1|localhost|\[::1\])(:\d{1,5})?$/Di', (string) ($server['HTTP_HOST'] ?? '')) === 1;
}

/**
 * Words for the log that a request chose some of (a refused token's reason
 * quotes its header): on one line, without the line breaks and other control
 * characters that could forge a line of their own, and clipped.
 */
function auth_log_text(string $text): string
{
    $flat = preg_replace('/[\p{Cc}\x{2028}\x{2029}]+/u', ' ', $text)
        ?? preg_replace('/[\x00-\x1F\x7F-\xFF]+/', ' ', $text); // not UTF-8: every byte past ASCII goes too
    return str_clip(trim((string) $flat), 300);
}

/** The SDK's settings for this site. */
function auth_iam_config(): array
{
    $config = [
        'issuer' => rtrim((string) config('auth.issuer'), '/'),
        'client_id' => (string) config('auth.client_id'),
        // The app's own folder, not the shared temp folder: on shared hosting
        // anybody's site could put a key set there, and the key set decides
        // who is signed in.
        'cache_dir' => BACKEND . '/storage/cache',
    ];
    $jwks = auth_jwks_file();
    if ($jwks !== null) {
        $config['jwks_file'] = $jwks;
    }
    return $config;
}

/**
 * The test IAM's keys file (auth.jwks_file, or ACADEMY_JWKS_FILE), read
 * instead of the IAM's published keys — for a throwaway database of the tests
 * only. Anywhere else a keys file would decide who is signed in without the
 * IAM, so a stray line in auth.local.php counts for nothing.
 */
function auth_jwks_file(): ?string
{
    $file = config('auth.jwks_file');
    return is_string($file) && $file !== '' && config_is_test_db(db_name()) ? app_path($file) : null;
}

/**
 * An access token's verified claims, or null. $reason says why not, for the
 * log only: whoever holds a token that does not work gets the same answer.
 */
function auth_verify(string $token, ?string &$reason = null): ?array
{
    if (!extension_loaded('openssl')) {
        throw new RuntimeException('PHP lacks the openssl extension, which checks sign-ins.');
    }
    try {
        return anotoki_iam_verify_access_token($token, auth_iam_config(), $reason);
    } catch (Throwable $e) {
        // This app turns every PHP warning into an exception: a key the IAM
        // publishes wrong must refuse the token, not break the request.
        $reason = 'it could not be checked: ' . $e->getMessage();
        return null;
    }
}

/**
 * The person making this request: ['id' => IAM user id, 'username' => ?string,
 * 'roles' => [...]]. Throws an HttpError: 401 without a token or with one that
 * does not verify, 403 without a role here (or mode none off this computer).
 * Remembered for the rest of the request; keeps their users row up to date.
 */
function auth_user(): array
{
    static $user = null;
    if ($user !== null) {
        return $user;
    }

    if (auth_mode() === 'none') {
        if (!auth_none_allowed(PHP_SAPI, $_SERVER)) {
            throw auth_none_only();
        }
        $found = ['id' => auth_local_user_id(), 'username' => null, 'roles' => AUTH_ROLES];
    } else {
        $token = anotoki_iam_bearer_token(anotoki_iam_authorization_header());
        if ($token === null) {
            throw new HttpError(401, 'Sign in first.', ['WWW-Authenticate: Bearer'], 'sign_in_required');
        }
        $claims = auth_verify($token, $reason);
        if ($claims === null) {
            error_log('[auth] a token was refused: ' . auth_log_text((string) $reason));
            throw new HttpError(401, 'Sign in again.', ['WWW-Authenticate: Bearer error="invalid_token"'], 'invalid_token');
        }
        $roles = anotoki_iam_roles($claims);
        if (!$roles) {
            throw new HttpError(403, 'Your account has no access to Japanese Academy.', [], 'no_access');
        }
        $name = $claims['preferred_username'] ?? null;
        $found = [
            'id' => (int) anotoki_iam_user_id($claims),
            'username' => is_string($name) && $name !== '' ? str_clip($name, 200) : null,
            'roles' => $roles,
        ];
    }

    users_seen($found['id'], $found['username']);
    return $user = $found;
}
