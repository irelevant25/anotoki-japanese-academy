<?php
/**
 * Who is asking. Every request that reads or writes somebody's study data
 * gets its person from auth_user() (the API's person() middleware asks), and
 * every query of that request is scoped to their user id.
 *
 * There is one way to sign in, on the owner's computer as on a website: the
 * anotoki IAM. The browser signs in there (the frontend's AuthService, with
 * the IAM's browser SDK) and sends its access token with every request:
 * Authorization: Bearer …. The token is checked here without asking the IAM:
 * its signature against the IAM's published keys, its issuer, audience,
 * expiry and type (src/anotoki_iam.php). Its sub is the user id, and nothing
 * else is: never a body, an address or a header of the app's own. No token is
 * a 401, and so is a token that does not verify - never a fallback to anybody.
 *
 * Every account may study here: a token with no role in this application is
 * an ordinary learner. The roles open the admin area, and the server decides
 * who may do what, by the route groups of api/routes/translations.php:
 *
 *   EDITOR   rewords the app's own words: reads and saves the strings, exports
 *            and imports a language's (ROLES_STAFF, staff_middleware())
 *   ADMIN    all that, and adds, changes and deletes languages, sees the
 *            people and deletes a person's data (ROLE_ADMIN, admin_middleware())
 *
 * MEMBER, which every account holds in every anotoki site (the IAM decides
 * with it who may sign in here at all), makes nobody more than a learner: no
 * check here needs it or refuses it. Any other role a token carries means
 * nothing here either. The pages only hide what the server refuses.
 *
 * Whether this site requires sign-in at all is the IAM's to say
 * (src/access.php); this file answers who a signed-in request is. Where the
 * IAM lets people study without signing in, a request without a token may be
 * a visitor of this site's own (src/visitors.php, learner_middleware() in
 * api/middleware/person.php): never auth_user(), never a role, never the
 * admin panel.
 *
 * src/anotoki_iam.php is the IAM's PHP SDK (sdk/php/anotoki_iam.php in the IAM
 * repository) v1.1.0, copied unchanged. To update it, copy the new version over
 * it and change the version here and in docs/kb/sign-in.md.
 */

declare(strict_types=1);

/** This application's roles at the IAM. */
const ROLE_ADMIN = 'ADMIN';
const ROLE_EDITOR = 'EDITOR';

/** Who may use the admin area at all: the editors and the administrators. */
const ROLES_STAFF = [ROLE_ADMIN, ROLE_EDITOR];

/**
 * What the browser needs to sign in: GET /api/auth/config - the IAM, this
 * site's client id, whether sign-in is required here (access_login_required(),
 * relayed so that the browser never asks the IAM itself), and how many days a
 * visitor's data is kept after their last visit (src/visitors.php), for the
 * visitor's notice.
 */
function auth_public_config(): array
{
    return [
        'issuer' => rtrim((string) config('auth.issuer'), '/'),
        'clientId' => (string) config('auth.client_id'),
        'loginRequired' => access_login_required(),
        'visitorKeepDays' => visitors_keep_days(),
    ];
}

/**
 * Did this request come from this computer, straight to its own address
 * ($server is $_SERVER)? A request that names another host, or that a proxy
 * passed on, may be anybody's: a tunnel or a proxy on this computer makes
 * every visitor come from 127.0.0.1, and a web page elsewhere can reach
 * 127.0.0.1 through a name of its own that points there (DNS rebinding). It
 * decides nobody's sign-in. It decides what this computer is told and asked:
 * the setup page wants no token from here, and the not-set-up answer, a
 * failure and /api/health say more to it than to anybody else.
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

/**
 * The SDK's settings for this site. Three more keys count for a throwaway
 * database of the tests only, as auth.jwks_file does (auth_jwks_file()):
 * auth.application_file (the IAM's answer whether sign-in is required, read
 * from a file instead of asking the IAM; src/access.php), auth.application_ttl
 * (how long that answer is kept, instead of a minute) and auth.cache_dir (a
 * folder of the test's own instead of backend/storage/cache/).
 */
function auth_iam_config(): array
{
    $test = config_is_test_db(db_name());
    $config = [
        'issuer' => rtrim((string) config('auth.issuer'), '/'),
        'client_id' => (string) config('auth.client_id'),
        'cache_dir' => auth_cache_dir(),
    ];
    $jwks = auth_jwks_file();
    if ($jwks !== null) {
        $config['jwks_file'] = $jwks;
    }
    if ($test) {
        $application = config('auth.application_file');
        if (is_string($application) && $application !== '') {
            $config['application_file'] = app_path($application);
        }
        $ttl = config('auth.application_ttl');
        if (is_int($ttl) && $ttl > 0) {
            $config['application_ttl'] = $ttl;
        }
    }
    return $config;
}

/**
 * The app's own cache folder: backend/storage/cache/ (auth.cache_dir instead,
 * for a throwaway database of the tests). The IAM's SDK keeps the key set and
 * the IAM's answer whether sign-in is required there; src/visitors.php its
 * secret and the sweep's stamp. The app's own folder, not the shared temp
 * folder: on shared hosting anybody's site could put a key set there, and the
 * key set decides who is signed in; the IAM's answer kept there would decide
 * whether the site asks anybody to sign in at all.
 */
function auth_cache_dir(): string
{
    $cache = config('auth.cache_dir');
    return config_is_test_db(db_name()) && is_string($cache) && $cache !== '' ? app_path($cache) : BACKEND . '/storage/cache';
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
 * 'roles' => the roles that mean something here, often none, 'timeZone' =>
 * theirs for this request]. Throws an HttpError 401 without a token, or with
 * one that does not verify. Remembered for the rest of the request; keeps
 * their users row up to date.
 *
 * The time zone is not who they are, only how their days are counted: the
 * one their browser names in X-Time-Zone (an IANA name PHP and ICU both know:
 * time_zone_known(); anything else is ignored), kept on their row when it changed; without one, the one
 * kept there; without that, UTC.
 */
function auth_user(): array
{
    static $user = null;
    if ($user !== null) {
        return $user;
    }
    $found = auth_token_user();
    $zone = users_seen($found['id'], $found['username'], auth_time_zone_header($_SERVER));
    return $user = $found + ['timeZone' => $zone ?? 'UTC'];
}

/**
 * Who this request's verified token says it is: ['id' => IAM user id,
 * 'username' => ?string, 'roles' => the roles that mean something here] -
 * auth_user() without their row: nothing is read from the database or written
 * to it. For the Migrations page's addresses (migrations_admin_middleware()),
 * which answer while a migration waits, when the tables may not be what this
 * version expects. The same 401s as auth_user(); remembered for the rest of
 * the request.
 */
function auth_token_user(): array
{
    static $found = null;
    if ($found !== null) {
        return $found;
    }

    if (!auth_sent_token()) {
        throw new HttpError(401, 'Sign in first.', ['WWW-Authenticate: Bearer'], 'sign_in_required');
    }
    // The Bearer scheme with nothing after it is a token that does not verify, not "no token".
    $token = anotoki_iam_bearer_token(anotoki_iam_authorization_header());
    $reason = 'there is no token after Bearer';
    $claims = $token === null ? null : auth_verify($token, $reason);
    if ($claims === null) {
        error_log('[auth] a token was refused: ' . auth_log_text((string) $reason));
        throw new HttpError(401, 'Sign in again.', ['WWW-Authenticate: Bearer error="invalid_token"'], 'invalid_token');
    }
    $name = $claims['preferred_username'] ?? null;
    return $found = [
        'id' => (int) anotoki_iam_user_id($claims),
        'username' => is_string($name) && $name !== '' ? str_clip($name, 200) : null,
        'roles' => auth_roles($claims),
    ];
}

/**
 * Does this request claim to be somebody: an Authorization header of the
 * Bearer scheme, with or without a token after it (the SDK's
 * anotoki_iam_sent_bearer())? Then it is that person, or a 401
 * (auth_user()) - never anybody else, and never a visitor
 * (learner_middleware(), docs/kb/sign-in.md, *Visitors*): a visitor's key is
 * not even read. Only Bearer counts: `Basic …` is what a
 * host behind a password file sends with every request, and says nothing
 * about who is using the site.
 */
function auth_sent_token(): bool
{
    return anotoki_iam_sent_bearer(anotoki_iam_authorization_header());
}

/** The time zone a request names ($server is $_SERVER): X-Time-Zone, when it is one PHP and ICU both know (time_zone_known()); else null. */
function auth_time_zone_header(array $server): ?string
{
    return time_zone_known(isset($server['HTTP_X_TIME_ZONE']) ? trim((string) $server['HTTP_X_TIME_ZONE']) : null);
}

/**
 * The token's roles in this application that mean something here (ADMIN,
 * EDITOR), upper-cased as the SDK reads them; MEMBER, which every account
 * holds, is dropped: it opens nothing here.
 */
function auth_roles(array $claims): array
{
    return array_values(array_intersect(anotoki_iam_roles($claims), ROLES_STAFF));
}

/**
 * Refuses this request's person unless they have one of $roles: 403
 * admin_only when only ADMIN would do, else 403 staff_only. Never a 401: they
 * are signed in, and signing in again changes nothing.
 */
function auth_require_role(string ...$roles): void
{
    auth_require_role_of(auth_user()['roles'], ...$roles);
}

/** auth_require_role() for roles read already ($held: a token's, auth_token_user()). */
function auth_require_role_of(array $held, string ...$roles): void
{
    if (array_intersect($held, $roles)) {
        return;
    }
    if ($roles === [ROLE_ADMIN]) {
        throw new HttpError(403, 'This is for the site\'s administrators.', [], 'admin_only');
    }
    throw new HttpError(403, 'This is for the site\'s editors and administrators.', [], 'staff_only');
}
