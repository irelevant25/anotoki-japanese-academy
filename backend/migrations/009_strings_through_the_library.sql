-- 009 — the app's words through the anotoki library (2026-10-11)
--
-- It was written as a draft, without its last line ("-- end of 009"), which
-- the app waits for before it applies a migration - and, after it, the anotoki
-- library's own files (db_migration_ready() in backend/src/db.php); the tests
-- alone applied the draft, on their throwaway databases. It is final now
-- (2026-10-11, the owner's go), reviewed, with that line written last, and
-- goes up with 008 in the same upload: applied once, it is never edited
-- again - a change is the next migration. An administrator applies it on the
-- admin panel's Migrations page (or backend/manage.php, or the setup page),
-- never a request.
--
-- Since anotoki-lib 0.3.0 the anotoki library (the Composer package
-- anotoki/lib and @anotoki/lib, every anotoki site's) keeps every site's words:
-- the languages, the strings, the admin panel's Translations and Languages
-- pages. Its own migrations, the set anotoki_translations, run after this
-- site's (db_migration_sets() in backend/src/db.php): its 001 finds this app's
-- three tables (004) and only proves their shape; its 002 adds the library's
-- own keys under anotoki. - the words of its kit (the top bar, the language
-- and theme switches, the dialogs) and of its status page -, writing strings
-- only for a key that has none.
--
-- Until now the kit said this app's words: core/kit.config.ts looked each of
-- its words up under one of this app's keys (topbar.sections, language.button,
-- theme.system...). From now on the kit reads them under the library's keys,
-- from this same database. So this file copies them there first - every
-- language, with who wrote it and when: an owner's rewording stays theirs, and
-- a language left without a string stays without one -, before the library's
-- 002 comes and finds them there, and leaves them be. The bar says what it
-- said before.
--
--   - Sixteen keys only the bar read go, their strings with them (ON DELETE
--     CASCADE, 004): the bar's sections, menus, Sign out and "Saving…", the
--     language button and its note, the theme switch - and the person's role
--     and the link to their anotoki account, which this app now gives the bar
--     in the kit's own words, with the kit's keys.
--   - Three stay this app's own words: the Sign in card's button and the What's
--     new dialog's Close, whose copies under the library's keys are the kit's
--     from now on (the description of the first says where it shows now), and
--     "Admin panel" (topbar.admin), the menu's way into the admin panel, which
--     the bar still says from this app's key: 006 rewords it and its check
--     needs it there. Its copy (anotoki.topbar.admin) is the library's word
--     for it, which nothing on this site reads.
--
-- It changes no other string, and no table of anybody's study data. The check
-- at its end fails it loudly unless every string came under the library's key
-- as it was - its text, who wrote it and when -, the library's key has no
-- language the app's key did not have, and the keys that go are gone.

-- What is here now, to copy and to compare with at the end: the strings of
-- the app's keys the kit read, every language, each beside the library's key
-- that carries it from now on.
CREATE TEMP TABLE academy_009_words ON COMMIT DROP AS
SELECT m.own_key, m.library_key, t.language_code, t.value, t.updated_at, t.updated_by
  FROM (VALUES
      ('topbar.sections', 'anotoki.topbar.sections'),
      ('topbar.phoneMenu', 'anotoki.topbar.phoneMenu'),
      ('topbar.menuButton', 'anotoki.topbar.menuButton'),
      ('topbar.menu', 'anotoki.topbar.menu'),
      ('account.signOut', 'anotoki.topbar.signOut'),
      ('signOut.saving', 'anotoki.topbar.saving'),
      ('language.button', 'anotoki.language.button'),
      ('language.notLoaded', 'anotoki.language.notLoaded'),
      ('theme.label', 'anotoki.theme.label'),
      ('theme.light', 'anotoki.theme.light'),
      ('theme.dark', 'anotoki.theme.dark'),
      ('theme.system', 'anotoki.theme.auto'),
      ('theme.systemHint', 'anotoki.theme.autoHint'),
      ('topbar.roleAdmin', 'anotoki.topbar.roleAdmin'),
      ('topbar.roleEditor', 'anotoki.topbar.roleEditor'),
      ('account.yourAccount', 'anotoki.topbar.account'),
      ('topbar.admin', 'anotoki.topbar.admin'),
      ('signIn.button', 'anotoki.topbar.signIn'),
      ('common.close', 'anotoki.ui.close')
  ) AS m(own_key, library_key)
  JOIN translations t ON t.key_name = m.own_key;

-- The library's keys, ahead of the library's own file (its set runs after
-- this one, and then writes their descriptions).
INSERT INTO translation_keys (name, description)
SELECT DISTINCT library_key, 'A word of the anotoki library: its migration anotoki_translations/002 describes it.' FROM academy_009_words
ON CONFLICT (name) DO NOTHING;

-- Every string of the app's key under the library's: every language,
-- reworded or not, with who wrote it and when.
INSERT INTO translations (key_name, language_code, value, updated_at, updated_by)
SELECT library_key, language_code, value, updated_at, updated_by FROM academy_009_words
ON CONFLICT (key_name, language_code) DO NOTHING;

-- The Sign in card's button stays the app's; the bar's Sign in is the library's word now.
UPDATE translation_keys SET description = 'The Sign in page: its one button, which goes to the account service to sign in; and the button that does the same in the notice on the home page of somebody studying without signing in. The top bar''s own Sign in is a word of the anotoki library (anotoki.topbar.signIn).' WHERE name = 'signIn.button';

-- The keys only the bar read: nothing asks for them any more.
DELETE FROM translation_keys WHERE name IN ('topbar.sections', 'topbar.phoneMenu', 'topbar.menuButton', 'topbar.menu', 'account.signOut', 'signOut.saving', 'language.button', 'language.notLoaded', 'theme.label', 'theme.light', 'theme.dark', 'theme.system', 'theme.systemHint', 'topbar.roleAdmin', 'topbar.roleEditor', 'account.yourAccount');

-- -------------------------------------------------------------- the check

DO $$
DECLARE
    missing text;
BEGIN
    -- Every string came under the library's key as it was: its text, who wrote it and when.
    SELECT string_agg(w.library_key || ' (' || w.language_code || ')', ', ' ORDER BY w.library_key, w.language_code) INTO missing
      FROM academy_009_words w
     WHERE NOT EXISTS (SELECT 1 FROM translations t
                        WHERE t.key_name = w.library_key AND t.language_code = w.language_code AND t.value = w.value
                          AND t.updated_at = w.updated_at AND t.updated_by IS NOT DISTINCT FROM w.updated_by);
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION '009_strings_through_the_library: strings that did not come under the library''s keys as they were: %', missing;
    END IF;

    -- And the library's key has no language the app's key did not have: one left without a string stays so.
    SELECT string_agg(t.key_name || ' (' || t.language_code || ')', ', ' ORDER BY t.key_name, t.language_code) INTO missing
      FROM translations t
     WHERE t.key_name IN (SELECT library_key FROM academy_009_words)
       AND NOT EXISTS (SELECT 1 FROM academy_009_words w WHERE w.library_key = t.key_name AND w.language_code = t.language_code);
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION '009_strings_through_the_library: strings under the library''s keys the app''s keys did not have: %', missing;
    END IF;

    -- Every library key that came with words has English: every other language falls back to it.
    SELECT string_agg(DISTINCT w.library_key, ', ') INTO missing
      FROM academy_009_words w
     WHERE NOT EXISTS (SELECT 1 FROM translations t WHERE t.key_name = w.library_key AND t.language_code = 'en');
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION '009_strings_through_the_library: library keys without an English string: %', missing;
    END IF;

    -- The keys only the bar read are gone, and their strings with them.
    SELECT string_agg(gone.name, ', ' ORDER BY gone.name) INTO missing
      FROM (VALUES ('topbar.sections'), ('topbar.phoneMenu'), ('topbar.menuButton'), ('topbar.menu'), ('account.signOut'),
                   ('signOut.saving'), ('language.button'), ('language.notLoaded'), ('theme.label'), ('theme.light'),
                   ('theme.dark'), ('theme.system'), ('theme.systemHint'), ('topbar.roleAdmin'), ('topbar.roleEditor'),
                   ('account.yourAccount')) AS gone(name)
     WHERE EXISTS (SELECT 1 FROM translation_keys tk WHERE tk.name = gone.name)
        OR EXISTS (SELECT 1 FROM translations t WHERE t.key_name = gone.name);
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION '009_strings_through_the_library: keys that should be gone and are not: %', missing;
    END IF;

    -- The app's own keys that stay are there, each with its English.
    SELECT string_agg(kept.name, ', ' ORDER BY kept.name) INTO missing
      FROM (VALUES ('topbar.admin'), ('signIn.button'), ('common.close')) AS kept(name)
     WHERE NOT EXISTS (SELECT 1 FROM translations t WHERE t.key_name = kept.name AND t.language_code = 'en');
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION '009_strings_through_the_library: keys of the app''s own that should stay, without an English string: %', missing;
    END IF;
END $$;

-- end of 009
