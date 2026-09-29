<?php
// data/*.json is generated from data/source/*.tsv: a rebuild of unchanged
// sources must give exactly the files in the repository.
declare(strict_types=1);

require __DIR__ . '/../lib.php';
require BACKEND . '/tools/build-data.php';

test('building data/source/*.tsv again gives exactly data/*.json', function (): void {
    $dir = str_replace('\\', '/', sys_get_temp_dir()) . '/academy-data-' . bin2hex(random_bytes(4));
    mkdir($dir);
    try {
        data_build($dir, true);
        foreach (['vocab.json', 'kanji.json', 'grammar-index.json'] as $file) {
            // a Windows checkout may have turned LF into CRLF (core.autocrlf)
            $committed = str_replace("\r\n", "\n", (string) file_get_contents(ROOT . "/data/$file"));
            assert_true($committed === file_get_contents("$dir/$file"), "$file differs from a fresh build: run npm run build:data");
        }
    } finally {
        array_map('unlink', glob("$dir/*") ?: []);
        rmdir($dir);
    }
});

test('lesson tags: only ASCII digits make a lesson, as the first builder read them', function (): void {
    assert_same(['lesson' => 12, 'section' => 'conv', 'extra' => false], data_lesson_tag('会L12'));
    assert_same(['lesson' => 9, 'section' => 'read', 'extra' => false], data_lesson_tag('読L9-II'));
    assert_same(['lesson' => 12, 'section' => 'conv', 'extra' => true], data_lesson_tag('会L12(e)'));
    assert_same(0, data_lesson_tag('会G')['lesson']);
    assert_same(null, data_lesson_tag('会L１２')['lesson'], 'full-width digits (the IME left on) are not lesson 0');
});
