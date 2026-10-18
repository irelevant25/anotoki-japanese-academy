<?php
/**
 * Who is asking. Every request that reads or writes somebody's study data
 * gets its person from the anotoki library's auth module (Anotoki\Lib\Auth,
 * the Composer package anotoki/lib - every anotoki site's, since anotoki-lib
 * 0.4.0), set up here for this site, and every query of that request is
 * scoped to their user id.
 *
 * There is one way to sign in, on the owner's computer as on a website: the
 * anotoki IAM. The browser signs in there (the library's AnotokiAuth, behind
 * the frontend's AuthService) and sends its access token with every request:
 * Authorization: Bearer …. The token is checked here without asking the IAM:
 * its signature against the IAM's published keys, its issuer, audience,
 * expiry and type (the library's AccessTokens, the IAM's PHP SDK's rules made
 * typed code). Its sub is the user id, and nothing else is: never a body, an
 * address or a header of the app's own. No token is a 401, and so is a token
 * that does not verify - never a fallback to anybody.
 *
 * Who a request is, is decided once, by the library's Identify (on the
 * routes with somebody's data, never in front of /api/site-status): a Bearer
 * header is a person's - a verified token, or 401 invalid_token, and the
 * visitor key is not even read -; while sign-in is required here, nobody;
 * else, on the routes that take a visitor (academy_identify(): the study
 * addresses, the feedback form), an X-Visitor-Key is this site's visitor
 * (src/visitors.php), or 401 visitor_unknown; else nobody. On the routes that
 * take a person alone (academy_identify_person()) a key is never read. The
 * routes then say whom they take (api/middleware/person.php, staff.php):
 * RequirePerson, RequireCaller, RequireRole - all from the token, no table
 * read.
 *
 * Every account may study here: a token with no role in this application is
 * an ordinary learner. The roles open the admin area, and the server decides
 * who may do what, by the route groups (api/routes/translations.php,
 * admin.php):
 *
 *   EDITOR   rewords the app's own words: reads and saves the strings, exports
 *            and imports a language's (staff_middleware())
 *   ADMIN    all that, and adds, changes and deletes languages, sees the
 *            people and deletes a person's data, reads the error and audit
 *            logs and the feedback, keeps the backups, applies the
 *            migrations (admin_middleware())
 *
 * MEMBER, which every account holds in every anotoki site (the IAM decides
 * with it who may sign in here at all), makes nobody more than a learner: no
 * check here needs it or refuses it. Any other role a token carries means
 * nothing here either. The pages only hide what the server refuses.
 *
 * Whether this site requires sign-in at all is the IAM's to say
 * (academy_sign_in_rule(), src/access.php). Where the IAM lets people study
 * without signing in, a request without a token may be a visitor of this
 * site's own (src/visitors.php): never a person, never a role, never the
 * admin panel.
 *
 * A refusal is this site's error body, {error: sentence, code}
 * (academy_refusal()), in this site's own sentences for its own codes.
 */

declare(strict_types=1);

use Anotoki\Lib\Auth\AccessTokens;
use Anotoki\Lib\Auth\Http\Identify;
use Anotoki\Lib\Auth\IamClient;
use Anotoki\Lib\Auth\Person;
use Anotoki\Lib\Auth\SignInRule;
use Anotoki\Lib\Support\Refusal;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\Psr7\Factory\ResponseFactory;

/** This application's roles at the IAM. */
const ROLE_ADMIN = 'ADMIN';
const ROLE_EDITOR = 'EDITOR';

/** Who may use the admin area at all: the editors and the administrators. */
const ROLES_STAFF = [ROLE_ADMIN, ROLE_EDITOR];

/** This site's sentences for the refusals of who is asking: a page words them from the code, the log and the tests read these. */
const AUTH_SENTENCES = [
    'sign_in_required' => 'Sign in first.',
    'invalid_token' => 'Sign in again.',
];

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
    $flat = preg_replace('/[\p{Cc}\x{2028}\x{2029}]+/u', ' ', $text) ?? preg_replace('/[\x00-\x1F\x7F-\xFF]+/', ' ', $text); // not UTF-8: every byte past ASCII goes too
    return str_clip(trim((string) $flat), 300);
}

/**
 * The library's IamClient settings for this site (the IAM's PHP SDK's keys,
 * which IamClient::fromArray() takes: auth.local.php stays as it is). Four
 * more keys count for a throwaway database of the tests only, as
 * auth.jwks_file does (auth_jwks_file()): auth.application_file (the IAM's
 * answer whether sign-in is required, read from a file instead of asking the
 * IAM; src/access.php), auth.application_ttl (how long that answer is kept,
 * instead of a minute), auth.anonymized_file (the IAM's deleted accounts, from
 * a file: src/people.php) and auth.cache_dir (a folder of the test's own
 * instead of backend/storage/cache/).
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
        foreach (['application_file', 'anonymized_file'] as $seam) {
            $file = config("auth.$seam");
            if (is_string($file) && $file !== '') {
                $config[$seam] = app_path($file);
            }
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
 * for a throwaway database of the tests). The library keeps the IAM's key set
 * and its answer whether sign-in is required there, and its own stamps (the
 * people's scrub, the backups' day); src/visitors.php its secret and the
 * sweep's stamp. The app's own folder, not the shared temp folder: on shared
 * hosting anybody's site could put a key set there, and the key set decides
 * who is signed in; the IAM's answer kept there would decide whether the site
 * asks anybody to sign in at all.
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

/** The time zone a request names ($server is $_SERVER): X-Time-Zone, when it is one PHP and ICU both know (time_zone_known()); else null. */
function auth_time_zone_header(array $server): ?string
{
    return time_zone_known(isset($server['HTTP_X_TIME_ZONE']) ? trim((string) $server['HTTP_X_TIME_ZONE']) : null);
}

/**
 * The IAM this site signs in through, and as which application (the library's
 * IamClient), from the settings - one per process. Its issuer is an https
 * address, or http on this computer (the development IAM); anything else is no
 * IAM at all - said in the error log, every token refused and sign-in required
 * - never a key set read over plain http across a network.
 */
function academy_iam(): IamClient
{
    static $iam = null;
    if ($iam === null) {
        try {
            $iam = IamClient::fromArray(auth_iam_config());
        } catch (InvalidArgumentException $e) {
            error_log('[auth] ' . auth_log_text($e->getMessage()));
            $iam = IamClient::fromArray(['cache_dir' => auth_cache_dir()]);
        }
    }
    return $iam;
}

/** The checker of the IAM's access tokens (the library's AccessTokens, its key set kept in auth_cache_dir()). */
function academy_access_tokens(): AccessTokens
{
    static $tokens = null;
    return $tokens ??= new AccessTokens(academy_iam());
}

/**
 * Whether this site requires sign-in (the library's SignInRule, failing
 * closed: src/access.php says how) - one per process, one answer per request
 * (Identify resets it as each request starts). It adds this site's own reason
 * to the IAM's: while the database cannot keep visitors (migration 007 not
 * applied), sign-in is required whatever the IAM says - and the database is
 * asked only when the IAM says sign-in is not needed (the IAM's answer alone
 * first, $iamOnly), so a site that requires sign-in answers its boot
 * configuration without its database.
 */
function academy_sign_in_rule(): SignInRule
{
    static $rule = null;
    if ($rule === null) {
        $iamOnly = new SignInRule(academy_iam());
        $rule = new SignInRule(academy_iam(), static function () use ($iamOnly): bool {
            $iamOnly->reset();
            return !$iamOnly->required() && !visitors_ready();
        });
    }
    return $rule;
}

/**
 * Who a request is (the library's Identify), put on the routes that take a
 * visitor too (study_route(), the feedback form) - never in front of
 * /api/site-status, the words, the health check or the clips, which answer
 * anybody whatever they send. A visitor's key is this site's visitor
 * (visitors_of_key(): src/visitors.php); every refused token goes to the log,
 * on one line; a refusal is this site's error body (academy_refusal()).
 */
function academy_identify(): Identify
{
    static $identify = null;
    return $identify ??= academy_identify_with(static function (string $key): ?array {
        return visitors_of_key($key);
    });
}

/**
 * Who a request is, on the routes that take a signed-in person alone
 * (data_route(), and admin_token_checks() for the groups that answer while a
 * migration waits): the same Identify without the visitors, so a visitor's
 * key is never even read there - no table looked at, no visitor's row
 * written, and with no token the request is nobody: 401 sign_in_required
 * (RequirePerson), as these addresses always answered, whatever key comes.
 */
function academy_identify_person(): Identify
{
    static $identify = null;
    return $identify ??= academy_identify_with(null);
}

/** An Identify of this site's, with the visitor of a key ($visitor) or none. */
function academy_identify_with(?Closure $visitor): Identify
{
    return new Identify(
        academy_access_tokens(),
        academy_sign_in_rule(),
        new ResponseFactory(),
        $visitor,
        static function (Response $response, Refusal $refusal): Response {
            return academy_refusal($response, $refusal);
        },
        null,
        static function (string $reason): void {
            error_log('[auth] a token was refused: ' . auth_log_text($reason));
        },
    );
}

/**
 * A refusal of the library's (who is asking, a role, a page of the admin
 * tools) in this site's error body - {error: sentence, code, …what it is
 * about} - with this site's own sentence for the codes it has always answered
 * (AUTH_SENTENCES, visitor_unknown's), and the library's for the rest.
 */
function academy_refusal(Response $response, Refusal $refusal): Response
{
    $sentence = AUTH_SENTENCES[$refusal->code] ?? ($refusal->code === 'visitor_unknown' ? visitors_unknown()->getMessage() : $refusal->message);
    $answer = json_response($response, ['error' => $sentence, 'code' => $refusal->code] + $refusal->extra, $refusal->status);
    return $refusal->status === 503 && !$answer->hasHeader('Retry-After') ? $answer->withHeader('Retry-After', '60') : $answer;
}

/** The person of a request Identify has been through: their verified token, or null (a visitor, nobody). */
function auth_person(Request $request): ?Person
{
    return Identify::person($request);
}

/**
 * The person's roles that mean something here (ADMIN, EDITOR), upper-cased
 * as the token reads them; MEMBER, which every account holds, is dropped: it
 * opens nothing here.
 */
function auth_roles(Person $person): array
{
    return array_values(array_intersect($person->roles, ROLES_STAFF));
}
