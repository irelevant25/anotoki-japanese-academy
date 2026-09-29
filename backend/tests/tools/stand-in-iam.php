<?php
// A stand-in for the anotoki IAM, as far as the setup page's "Test connection"
// asks it: its discovery document and its key set, for the issuer
// STAND_IN_ISSUER (http://127.0.0.1:PORT) with the keys of the JWKS file
// STAND_IN_JWKS. The router of PHP's built-in server in
// backend/tests/api/setup.test.php. Nothing else answers.
declare(strict_types=1);

$issuer = (string) getenv('STAND_IN_ISSUER');
$path = (string) parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);
header('Content-Type: application/json');
if ($path === '/.well-known/openid-configuration') {
    echo json_encode([
        'issuer' => $issuer,
        'authorization_endpoint' => "$issuer/api/oidc/authorize",
        'token_endpoint' => "$issuer/api/oidc/token",
        'jwks_uri' => "$issuer/.well-known/jwks.json",
    ]);
    return true;
}
if ($path === '/.well-known/jwks.json') {
    readfile((string) getenv('STAND_IN_JWKS'));
    return true;
}
http_response_code(404);
echo '{}';
return true;
