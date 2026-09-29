<?php
/**
 * The tests' IAM, for the browser suites (frontend/e2e/helpers.js): a key pair
 * of its own and tokens signed with it, made with the IAM SDK's test helpers
 * (backend/src/anotoki_iam.php). A server on a test database whose settings
 * name DIR/jwks.json (auth.jwks_file) takes these tokens as the IAM's. No IAM
 * is ever asked.
 *
 *   php backend/tests/tools/iam.php keys DIR                  DIR/jwks.json (the public half) and DIR/key.json
 *   php backend/tests/tools/iam.php token DIR CLAIMS [TYP]    a JWT with these claims (JSON), signed with DIR's key:
 *                                                             an access token, or with TYP JWT an ID token's type
 */

declare(strict_types=1);

require __DIR__ . '/../../src/anotoki_iam.php';

$command = $argv[1] ?? '';
$dir = rtrim(str_replace('\\', '/', $argv[2] ?? ''), '/');
if ($dir === '' || !is_dir($dir)) {
    fwrite(STDERR, "usage: php backend/tests/tools/iam.php keys DIR | token DIR CLAIMS-JSON [TYP]\n");
    exit(1);
}

if ($command === 'keys') {
    $pair = anotoki_iam_test_keypair('academy-test');
    file_put_contents("$dir/jwks.json", json_encode($pair['jwks']));
    file_put_contents("$dir/key.json", json_encode(['kid' => $pair['kid'], 'private_pem' => $pair['private_pem']]));
    echo "$dir/jwks.json\n";
} elseif ($command === 'token') {
    $key = json_decode((string) file_get_contents("$dir/key.json"), true);
    $claims = json_decode($argv[3] ?? '', true);
    if (!is_array($key) || !is_array($claims)) {
        fwrite(STDERR, "iam.php: no key in $dir, or the claims are not JSON\n");
        exit(1);
    }
    echo anotoki_iam_test_sign($claims, $key['private_pem'], $key['kid'], $argv[4] ?? 'at+jwt'), "\n";
} else {
    fwrite(STDERR, "usage: php backend/tests/tools/iam.php keys DIR | token DIR CLAIMS-JSON [TYP]\n");
    exit(1);
}
