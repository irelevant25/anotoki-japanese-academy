<?php
/**
 * A stand-in for the anotoki IAM, for the tests only: just enough OpenID
 * Connect for the setup page's "Test connection", the browser SDK and the app's
 * token check - discovery, the key set, authorize (signs the configured person
 * in at once, or refuses), token (an authorization code with PKCE, a refresh
 * with rotation), logout, revoke, an account page, and the public answer
 * about an application (whether its site requires sign-in). The router of PHP's
 * built-in server; its tokens are signed with the tests' own key (the survey's
 * backend/tests/tools/fake-iam.php is its pattern). Never point a real site at
 * it.
 *
 *   STAND_IN_ISSUER=http://127.0.0.1:PORT STAND_IN_DIR=DIR php -S 127.0.0.1:PORT backend/tests/tools/stand-in-iam.php
 *
 * STAND_IN_ISSUER  the issuer it names, in its discovery document and its tokens
 * STAND_IN_DIR     a folder with the test IAM's keys, as php backend/tests/tools/iam.php keys DIR
 *                  writes them (jwks.json, key.json), where it also keeps state.json
 * STAND_IN_JWKS    (instead of STAND_IN_DIR) only a key set to publish: discovery and keys answer,
 *                  nothing signs anybody in (the setup page's Test connection asks no more)
 *
 * DIR/state.json is who signs in and how the IAM behaves; POST /_test/state
 * merges JSON into it:
 *   user                 {id, username, roles, locale?}: whom authorize signs in (user 1, 'owner',
 *                        MEMBER: a learner); roles are this application's (MEMBER alone is a
 *                        learner); locale the token's locale claim (en)
 *   ttl                  seconds an access token lives (600)
 *   down                 true: every endpoint but the key set answers 503 (the IAM unreachable)
 *   refuse               true: a refresh answers invalid_grant (the IAM's session is over)
 *   deny                 true: authorize answers access_denied, deny_description its error_description
 *   login_required       what GET /api/public/applications/{client_id} says: whether the
 *                        site requires sign-in (true)
 *   application_missing  true: that address answers 404 - an unknown or switched-off application
 *   application_name     the name it gives there (Test site)
 * Every request is logged in log (the last 200, "METHOD /path"), so a test can count them.
 */

declare(strict_types=1);

require __DIR__ . '/../../src/anotoki_iam.php';

$issuer = rtrim((string) getenv('STAND_IN_ISSUER'), '/');
$dir = rtrim(str_replace('\\', '/', (string) getenv('STAND_IN_DIR')), '/');
$jwksFile = $dir !== '' ? "$dir/jwks.json" : (string) getenv('STAND_IN_JWKS');
if ($issuer === '' || !is_file($jwksFile)) {
    http_response_code(500);
    echo 'stand-in IAM: set STAND_IN_ISSUER, and STAND_IN_DIR (with jwks.json and key.json) or STAND_IN_JWKS';
    return true;
}

/** The state: what it was told, and the codes and refresh tokens it gave out. */
function stand_in_state(string $dir): array
{
    $state = $dir !== '' && is_file("$dir/state.json") ? json_decode((string) file_get_contents("$dir/state.json"), true) : null;
    return (is_array($state) ? $state : []) + [
        'user' => ['id' => 1, 'username' => 'owner', 'roles' => ['MEMBER']],
        'ttl' => 600, 'down' => false, 'refuse' => false, 'deny' => false, 'deny_description' => 'Signing in was refused',
        'login_required' => true, 'application_missing' => false,
        'codes' => [], 'refresh' => [], 'log' => [],
    ];
}

function stand_in_save(string $dir, array $state): void
{
    if ($dir === '') {
        return;
    }
    file_put_contents("$dir/state.json.tmp", json_encode($state, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
    rename("$dir/state.json.tmp", "$dir/state.json");
}

function stand_in_json(int $status, $body, string $origin = ''): bool
{
    http_response_code($status);
    header('Content-Type: application/json');
    header('Cache-Control: no-store');
    if ($origin !== '') {
        header("Access-Control-Allow-Origin: $origin");
        header('Vary: Origin');
    }
    echo json_encode($body, JSON_UNESCAPED_SLASHES);
    return true;
}

function stand_in_redirect(string $url): bool
{
    http_response_code(302);
    header("Location: $url");
    return true;
}

function stand_in_b64(string $bytes): string
{
    return rtrim(strtr(base64_encode($bytes), '+/', '-_'), '=');
}

/** An access token, an ID token and a new refresh token for $user. */
function stand_in_tokens(array &$state, array $user, array $key, string $issuer, string $clientId, ?string $nonce, string $sid): array
{
    $now = time();
    $common = [
        'iss' => $issuer, 'sub' => (string) $user['id'], 'aud' => $clientId, 'iat' => $now, 'sid' => $sid,
        'preferred_username' => $user['username'], 'email' => $user['username'] . '@example.test',
        'email_verified' => true, 'locale' => is_string($user['locale'] ?? null) ? $user['locale'] : 'en',
        'roles' => is_array($user['roles'] ?? null) ? $user['roles'] : [],
    ];
    $access = anotoki_iam_test_sign($common + ['client_id' => $clientId, 'exp' => $now + (int) $state['ttl'], 'jti' => bin2hex(random_bytes(8)),
        'scope' => 'openid profile email'], $key['private_pem'], $key['kid']);
    $id = anotoki_iam_test_sign($common + ['azp' => $clientId, 'exp' => $now + 3600, 'auth_time' => $now] + ($nonce !== null && $nonce !== '' ? ['nonce' => $nonce] : []),
        $key['private_pem'], $key['kid'], 'JWT');
    $refresh = 'iam_rt_' . bin2hex(random_bytes(16));
    $state['refresh'][$refresh] = ['user' => $user, 'client' => $clientId, 'sid' => $sid];
    return ['access_token' => $access, 'token_type' => 'Bearer', 'expires_in' => (int) $state['ttl'], 'refresh_token' => $refresh,
        'id_token' => $id, 'scope' => 'openid profile email'];
}

$state = stand_in_state($dir);
$method = (string) ($_SERVER['REQUEST_METHOD'] ?? 'GET');
$path = (string) parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);
$origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
$state['log'][] = "$method $path";
$state['log'] = array_slice($state['log'], -200);
$key = $dir !== '' && is_file("$dir/key.json") ? json_decode((string) file_get_contents("$dir/key.json"), true) : null;

if ($path === '/_test/state' && $dir !== '') {
    if ($method === 'POST') {
        $changes = json_decode((string) file_get_contents('php://input'), true);
        $state = array_replace($state, is_array($changes) ? $changes : []);
    }
    stand_in_save($dir, $state);
    return stand_in_json(200, $state);
}

if ($state['down'] && $path !== '/.well-known/jwks.json') {
    stand_in_save($dir, $state);
    return stand_in_json(503, ['error' => 'temporarily_unavailable'], $origin);
}

// The IAM's public answer about an application: whether its site requires sign-in
// (anotoki_iam_login_required() in the SDK reads it). Answered for any client id;
// `down` above makes it 503 like everything else.
if ($method === 'GET' && preg_match('#^/api/public/applications/([a-z0-9][a-z0-9-]{1,63})$#', $path, $m)) {
    stand_in_save($dir, $state);
    if ($state['application_missing']) {
        return stand_in_json(404, ['error' => 'not_found']);
    }
    http_response_code(200);
    header('Content-Type: application/json');
    header('Cache-Control: public, max-age=60');
    echo json_encode([
        'client_id' => $m[1],
        'name' => (string) ($state['application_name'] ?? 'Test site'),
        'login_required' => (bool) $state['login_required'],
    ], JSON_UNESCAPED_SLASHES);
    return true;
}

if ($path === '/.well-known/openid-configuration') {
    stand_in_save($dir, $state);
    return stand_in_json(200, [
        'issuer' => $issuer,
        'authorization_endpoint' => "$issuer/api/oidc/authorize",
        'token_endpoint' => "$issuer/api/oidc/token",
        'userinfo_endpoint' => "$issuer/api/oidc/userinfo",
        'jwks_uri' => "$issuer/.well-known/jwks.json",
        'end_session_endpoint' => "$issuer/api/oidc/logout",
        'revocation_endpoint' => "$issuer/api/oidc/revoke",
    ], $origin !== '' ? $origin : '*');
}
if ($path === '/.well-known/jwks.json') {
    stand_in_save($dir, $state);
    header('Access-Control-Allow-Origin: *');
    header('Content-Type: application/json');
    readfile($jwksFile);
    return true;
}
if (!is_array($key)) {
    // a key set to publish, and nothing to sign with: only the two addresses above
    return stand_in_json(404, ['error' => 'not_found']);
}

switch ($path) {
    case '/api/oidc/authorize':
        $redirect = (string) ($_GET['redirect_uri'] ?? '');
        $query = ['state' => (string) ($_GET['state'] ?? ''), 'iss' => $issuer];
        if ($state['deny']) {
            stand_in_save($dir, $state);
            return stand_in_redirect($redirect . '?' . http_build_query(['error' => 'access_denied', 'error_description' => (string) $state['deny_description']] + $query));
        }
        $code = bin2hex(random_bytes(16));
        $state['codes'][$code] = [
            'client' => (string) ($_GET['client_id'] ?? ''), 'redirect' => $redirect, 'nonce' => (string) ($_GET['nonce'] ?? ''),
            'challenge' => (string) ($_GET['code_challenge'] ?? ''), 'at' => time(),
        ];
        stand_in_save($dir, $state);
        return stand_in_redirect($redirect . '?' . http_build_query(['code' => $code] + $query));

    case '/api/oidc/token':
        if ($method === 'OPTIONS') {
            http_response_code(204);
            header("Access-Control-Allow-Origin: $origin");
            header('Access-Control-Allow-Headers: Content-Type');
            return true;
        }
        $grant = (string) ($_POST['grant_type'] ?? '');
        $clientId = (string) ($_POST['client_id'] ?? '');
        if ($grant === 'authorization_code') {
            $given = (string) ($_POST['code'] ?? '');
            $code = $state['codes'][$given] ?? null;
            unset($state['codes'][$given]);
            $verifier = (string) ($_POST['code_verifier'] ?? '');
            if ($code === null || $code['client'] !== $clientId || $code['redirect'] !== (string) ($_POST['redirect_uri'] ?? '')
                || $code['at'] < time() - 60 || !hash_equals($code['challenge'], stand_in_b64(hash('sha256', $verifier, true)))) {
                stand_in_save($dir, $state);
                return stand_in_json(400, ['error' => 'invalid_grant', 'error_description' => 'bad code'], $origin);
            }
            $tokens = stand_in_tokens($state, $state['user'], $key, $issuer, $clientId, $code['nonce'], bin2hex(random_bytes(8)));
            stand_in_save($dir, $state);
            return stand_in_json(200, $tokens, $origin);
        }
        if ($grant === 'refresh_token') {
            $given = (string) ($_POST['refresh_token'] ?? '');
            $entry = $state['refresh'][$given] ?? null;
            unset($state['refresh'][$given]);
            if ($state['refuse'] || $entry === null || $entry['client'] !== $clientId) {
                stand_in_save($dir, $state);
                return stand_in_json(400, ['error' => 'invalid_grant', 'error_description' => 'the session has ended'], $origin);
            }
            $tokens = stand_in_tokens($state, $entry['user'], $key, $issuer, $clientId, null, $entry['sid']);
            stand_in_save($dir, $state);
            return stand_in_json(200, $tokens, $origin);
        }
        stand_in_save($dir, $state);
        return stand_in_json(400, ['error' => 'unsupported_grant_type'], $origin);

    case '/api/oidc/revoke':
        unset($state['refresh'][(string) ($_POST['token'] ?? '')]);
        stand_in_save($dir, $state);
        return stand_in_json(200, new stdClass(), $origin);

    case '/api/oidc/logout':
        $state['refresh'] = [];
        stand_in_save($dir, $state);
        $to = (string) ($_GET['post_logout_redirect_uri'] ?? '');
        return $to !== '' ? stand_in_redirect($to) : stand_in_json(200, ['signed_out' => true]);

    case '/account':
        stand_in_save($dir, $state);
        header('Content-Type: text/html; charset=utf-8');
        echo '<!doctype html><title>Stand-in IAM account</title><h1>Stand-in IAM account page</h1>';
        return true;
}

stand_in_save($dir, $state);
return stand_in_json(404, ['error' => 'not_found']);
