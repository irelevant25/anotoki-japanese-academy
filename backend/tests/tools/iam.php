<?php
/**
 * The tests' IAM, for the browser suites (frontend/e2e/helpers.js): a key pair
 * of its own and tokens signed with it - the anotoki library's TestIam. A
 * server on a test database whose settings name DIR/jwks.json
 * (auth.jwks_file) takes these tokens as the IAM's, and the library's stand-in
 * IAM signs with DIR/key.json. No IAM is ever asked.
 *
 *   php backend/tests/tools/iam.php keys DIR                  DIR/key.json (the key pair) and DIR/jwks.json (its public half)
 *   php backend/tests/tools/iam.php token DIR CLAIMS [TYP]    a JWT with these claims (JSON), signed with DIR's key:
 *                                                             an access token, or with TYP JWT an ID token's type
 */

declare(strict_types=1);

use Anotoki\Lib\Auth\Testing\TestIam;

require __DIR__ . '/../../vendor/autoload.php';

$command = $argv[1] ?? '';
$dir = rtrim(str_replace('\\', '/', $argv[2] ?? ''), '/');
if ($dir === '' || !is_dir($dir)) {
    fwrite(STDERR, "usage: php backend/tests/tools/iam.php keys DIR | token DIR CLAIMS-JSON [TYP]\n");
    exit(1);
}

if ($command === 'keys') {
    TestIam::create($dir, 'https://iam.test', 'japanese-academy', 'academy-test');
    echo "$dir/" . TestIam::JWKS_FILE . "\n";
} elseif ($command === 'token') {
    $claims = json_decode($argv[3] ?? '', true);
    if (!is_file("$dir/" . TestIam::KEY_FILE) || !is_array($claims)) {
        fwrite(STDERR, "iam.php: no key in $dir, or the claims are not JSON\n");
        exit(1);
    }
    // The key pair already there (TestIam::create() keeps it); the issuer and client of the claims are the caller's.
    echo TestIam::create($dir)->sign($claims, $argv[4] ?? 'at+jwt'), "\n";
} else {
    fwrite(STDERR, "usage: php backend/tests/tools/iam.php keys DIR | token DIR CLAIMS-JSON [TYP]\n");
    exit(1);
}
