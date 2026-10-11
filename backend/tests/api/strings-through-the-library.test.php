<?php
// Migration 009, and then the anotoki library's own set of the words, on a
// database as its owner left it: built up to 008 the way db_migrate() would -
// an installed site of the release before - with the owner's work of the
// Translations and Languages pages in it: a word of the kit's reworded, a
// word the app keeps reworded, a Slovak string left out on purpose, a word in
// a language of their own (German), each by the owner and at a time of their
// own. The check at 009's end fails it, changing nothing, when a string did
// not come over as it was; then the upload - 009, the library's 001 and 002 -
// brings every one of those strings through as it was, under the library's
// key, and the library writes its own words only where the app had none.
declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and backup folder

const MIGRATION_009 = '009_strings_through_the_library.sql';

/** The owner: user 1, as 002 made every row of before theirs. */
const THE_OWNER = 1;

/**
 * The app's keys whose strings 009 carries under the library's keys, each to
 * its key from then on, and whether the app's own key goes (only the bar read it).
 */
const CARRIED = [
    'topbar.sections' => ['anotoki.topbar.sections', true],
    'topbar.phoneMenu' => ['anotoki.topbar.phoneMenu', true],
    'topbar.menuButton' => ['anotoki.topbar.menuButton', true],
    'topbar.menu' => ['anotoki.topbar.menu', true],
    'account.signOut' => ['anotoki.topbar.signOut', true],
    'signOut.saving' => ['anotoki.topbar.saving', true],
    'language.button' => ['anotoki.language.button', true],
    'language.notLoaded' => ['anotoki.language.notLoaded', true],
    'theme.label' => ['anotoki.theme.label', true],
    'theme.light' => ['anotoki.theme.light', true],
    'theme.dark' => ['anotoki.theme.dark', true],
    'theme.system' => ['anotoki.theme.auto', true],
    'theme.systemHint' => ['anotoki.theme.autoHint', true],
    'topbar.roleAdmin' => ['anotoki.topbar.roleAdmin', true],
    'topbar.roleEditor' => ['anotoki.topbar.roleEditor', true],
    'account.yourAccount' => ['anotoki.topbar.account', true],
    'topbar.admin' => ['anotoki.topbar.admin', false],
    'signIn.button' => ['anotoki.topbar.signIn', false],
    'common.close' => ['anotoki.ui.close', false],
];

/** Every string of the database: [key][language] => [text, who wrote it, when] - who and when as the database has them. */
function every_word(): array
{
    $words = [];
    foreach (db_all('SELECT key_name, language_code, value, updated_by, updated_at::text AS at FROM translations ORDER BY key_name COLLATE "C", language_code') as $row) {
        $words[$row['key_name']][$row['language_code']] = [$row['value'], $row['updated_by'] === null ? null : (int) $row['updated_by'], $row['at']];
    }
    return $words;
}

before(function (): void {
    test_db_empty();
    db_migrations_table();
    // Up to 008 only: 009 and the library's files of the words taken for applied, then off the list again. The
    // files of later rounds - this site's after 009, the library's admin tools and people - stay taken for applied:
    // they are other tests' (people-migration.test.php).
    $later = array_merge([MIGRATION_009], library_migrations());
    $own = array_map('basename', glob(MIGRATIONS_DIR . '/*.sql') ?: []);
    $others = array_merge(array_values(array_filter($own, static fn (string $name): bool => strcmp($name, MIGRATION_009) > 0)),
        library_migrations('anotoki_admin'), library_migrations('anotoki_people'));
    foreach (array_merge($later, $others) as $name) {
        db_exec('INSERT INTO migrations (name) VALUES (?)', [$name]);
    }
    db_migrate();
    foreach ($later as $name) {
        db_exec('DELETE FROM migrations WHERE name = ?', [$name]);
    }

    // The owner's work on the Translations and Languages pages, each string theirs and from a day of its own.
    users_ensure(THE_OWNER);
    $owned = static function (string $key, string $code, string $text, string $at): void {
        db_exec('UPDATE translations SET value = ?, updated_by = ?, updated_at = ? WHERE key_name = ? AND language_code = ?', [$text, THE_OWNER, $at, $key, $code]);
        assert_same($text, db_value('SELECT value FROM translations WHERE key_name = ? AND language_code = ?', [$key, $code]), "$key ($code) reworded");
    };
    $owned('topbar.sections', 'sk', 'Sekcie Akadémie', '2026-10-08 09:00:00+00');         // a word of the kit's
    $owned('signIn.button', 'en', 'Log in', '2026-10-08 09:01:00+00');                    // a word the app keeps too
    $owned('language.button', 'sk', 'Jazyk stránky: {name}', '2026-10-08 09:02:00+00');   // without {code}, as Slovak may
    // Left out on purpose: the theme's hint reads English in Slovak.
    db_exec("DELETE FROM translations WHERE key_name = 'theme.systemHint' AND language_code = 'sk'");
    // A language of the owner's own, with a string of a word that moves.
    db_exec("INSERT INTO languages (code, name, native_name, enabled, sort_order) VALUES ('de', 'German', 'Deutsch', true, 3)");
    db_exec("INSERT INTO translations (key_name, language_code, value, updated_by, updated_at) VALUES ('theme.label', 'de', 'Erscheinungsbild', ?, '2026-10-08 09:04:00+00')", [THE_OWNER]);
});

test('the check at 009\'s end fails it by name when a string did not come over as it was, or a language came that was not there - and then nothing of it stays', function (): void {
    assert_same(null, db_value("SELECT name FROM translation_keys WHERE name LIKE 'anotoki.%' LIMIT 1"), 'no word of the library\'s yet');
    $before = every_word();
    $sql = (string) file_get_contents(MIGRATIONS_DIR . '/' . MIGRATION_009);
    $at = strrpos($sql, 'DO $$');
    db()->beginTransaction();
    try {
        db()->exec(substr($sql, 0, $at));
        // On the way, the owner's Slovak word changed (somebody else's hand, a trigger): the check must not let it pass.
        db_exec("UPDATE translations SET value = 'Sekcie' WHERE key_name = 'anotoki.topbar.sections' AND language_code = 'sk'");
        assert_throws(static fn () => db()->exec(substr($sql, $at)),
            "/009_strings_through_the_library: strings that did not come under the library's keys as they were: anotoki\\.topbar\\.sections \\(sk\\)/");
    } finally {
        db()->rollBack();
    }
    db()->beginTransaction();
    try {
        db()->exec(substr($sql, 0, $at));
        // A string the app's key did not have, under a library key: the Slovak the owner left out would be filled in.
        db_exec("INSERT INTO translations (key_name, language_code, value) VALUES ('anotoki.theme.autoHint', 'sk', 'Podľa zariadenia')");
        assert_throws(static fn () => db()->exec(substr($sql, $at)), "/strings under the library's keys the app's keys did not have: anotoki\\.theme\\.autoHint \\(sk\\)/");
    } finally {
        db()->rollBack();
    }
    assert_same($before, every_word(), 'every string as it was');
    assert_same(null, db_value('SELECT name FROM migrations WHERE name = ?', [MIGRATION_009]), 'not applied');
    assert_same(null, db_value("SELECT name FROM translation_keys WHERE name LIKE 'anotoki.%' LIMIT 1"), 'and no key of the library\'s made');
});

test('the upload: 009, then the library\'s set; every string of the words that moved comes through as it was - text, who and when, every language, a blank one blank -, and the library writes its own only where the app had none', function (): void {
    $before = every_word();
    assert_same(array_merge([MIGRATION_009], library_migrations()), db_migrate(), 'this site\'s 009 first, then the library\'s files');
    $after = every_word();

    foreach (CARRIED as $own => [$library, $goes]) {
        assert_same($before[$own], $after[$library] ?? null, "$own -> $library: every language, its text, who wrote it and when");
        assert_same($goes ? null : $before[$own], $after[$own] ?? null, $goes ? "$own is gone, its strings with it" : "$own stays the app's, as it was");
    }
    // The owner's, word for word.
    assert_same(['Sekcie Akadémie', THE_OWNER], array_slice($after['anotoki.topbar.sections']['sk'], 0, 2), 'the owner\'s rewording, still theirs');
    assert_same('Log in', $after['anotoki.topbar.signIn']['en'][0], 'the bar\'s Sign in says the owner\'s word');
    assert_same('Log in', $after['signIn.button']['en'][0], 'and so does the Sign in card, from its own key');
    assert_same('Jazyk stránky: {name}', $after['anotoki.language.button']['sk'][0], 'a rewording without {code} is kept: Slovak may leave a placeholder out');
    assert_same(['en'], array_keys($after['anotoki.theme.autoHint']), 'the Slovak left out stays out: the library wrote no Slovak of its own');
    assert_same(['de', 'en', 'sk'], array_keys($after['anotoki.theme.label']), 'every language, the owner\'s own too');
    assert_same('Erscheinungsbild', $after['anotoki.theme.label']['de'][0]);
    // Nothing else of the app's changed: every key that was there and is not one of those that went is as it was.
    $gone = array_keys(array_filter(CARRIED, static fn (array $c): bool => $c[1]));
    assert_same(array_diff_key($before, array_flip($gone)), array_diff_key($after, array_flip(array_filter(array_keys($after), static fn (string $k): bool => str_starts_with($k, 'anotoki.')))),
        'every other string of the app\'s as it was');

    // The library's other words: its own, written by nobody - the app had none.
    assert_same([['Cancel', null], ['Zrušiť', null]], [array_slice($after['anotoki.ui.cancel']['en'], 0, 2), array_slice($after['anotoki.ui.cancel']['sk'], 0, 2)]);
    assert_same(count(Anotoki\Lib\Translations\LibraryWords::keys()), count(array_filter(array_keys($after), static fn (string $key): bool => str_starts_with($key, 'anotoki.'))),
        'every word of the library, with a string');
    // Descriptions are the library's, those of the keys 009 made ahead of it too.
    foreach (Anotoki\Lib\Translations\LibraryWords::all() as $key => $words) {
        assert_same($words['description'], db_value('SELECT description FROM translation_keys WHERE name = ?', [$key]), "$key: the library's description");
    }
    assert_match('/anotoki\.topbar\.signIn/', (string) db_value("SELECT description FROM translation_keys WHERE name = 'signIn.button'"), 'the card\'s button says where the bar\'s word is now');

    // What a page reads: the owner's words under the library's keys, English where Slovak was left out.
    $slovak = academy_translations()->bundle('sk');
    assert_same(['Sekcie Akadémie', 'As your device is set', 'System'],
        [$slovak['values']->{'anotoki.topbar.sections'} ?? null, $slovak['values']->{'anotoki.theme.autoHint'} ?? null, $slovak['english']->{'anotoki.theme.auto'} ?? null]);
    assert_same([], academy_translations()->storedRefusals(), 'and nothing stored that a save would refuse');
    assert_same([], db_pending_migrations(), 'nothing waits any more');
});
