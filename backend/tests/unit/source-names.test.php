<?php
// The owner's requirement: nothing in the repository names the course the data
// was transcribed from. The name is spelt with character codes here, so this
// file doesn't contain it either. Checked: every file git would publish (so
// books/ and the rest of .gitignore are left out), except the owner's study
// history in progress/, results/ and reports/, which tests never read; the code
// that writes it is checked here. Commit messages are not files: keep them
// clean by hand.
declare(strict_types=1);

require __DIR__ . '/../lib.php';

test('no file, and no file name, names the source of the data', function (): void {
    $name = '/' . implode('', array_map('chr', [103, 101, 110, 107, 105])) . '/i';
    $out = shell_exec('git -C ' . escapeshellarg(ROOT) . ' ls-files -co --exclude-standard -z');
    if (!is_string($out) || $out === '') {
        echo "    (skipped: not a git checkout)\n";
        return;
    }
    $found = [];
    $checked = 0;
    foreach (array_unique(array_filter(explode("\0", $out))) as $rel) {
        if (preg_match('~^(progress|results|reports)/~', $rel)) {
            continue;
        }
        if (preg_match($name, $rel)) {
            $found[] = "$rel (file name)";
        }
        if (preg_match('/\.(png|jpe?g|gif|mp3|pdf|ico|woff2?)$/i', $rel)) {
            continue;
        }
        $text = @file_get_contents(ROOT . "/$rel");
        if ($text === false) {
            continue; // deleted but not yet committed
        }
        $checked++;
        foreach (explode("\n", $text) as $i => $line) {
            if (preg_match($name, $line)) {
                $found[] = "$rel:" . ($i + 1);
            }
        }
    }
    assert_true($checked > 50, "$checked files checked");
    assert_same([], $found);
});
