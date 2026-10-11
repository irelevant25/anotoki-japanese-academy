-- 010 — people, and signing in through the anotoki library (2026-10-11)
--
-- THIS FILE IS A DRAFT until its last line is "-- end of 010": the app waits
-- for that line before it applies a migration - and, after it, the anotoki
-- library's own files (db_migration_ready() in backend/src/db.php) -, so the
-- owner's own server never applies it half written. The tests alone apply the
-- draft, by name, on their throwaway databases. Its last line is the owner's
-- to write once they accept the change; applied once, it is never edited
-- again - a change is the next migration. An administrator applies it on the
-- admin panel's Migrations page (or backend/manage.php, or the setup page),
-- never a request.
--
-- Since anotoki-lib 0.4.0 the anotoki library (the Composer package
-- anotoki/lib and @anotoki/lib, every anotoki site's) keeps every site's half
-- of signing in (its auth module) and every site's record of the people who
-- use it (its people module): the record of each person from their token,
-- the scrub of the accounts the IAM deleted, and the administrators' People
-- page. Its sets run around this site's own (db_migration_sets()):
-- anotoki_admin first (the audit log and the feedback's tables), then this
-- site's files, then anotoki_translations (whose 003 brings the words of
-- signing in, anotoki.signIn.*) and anotoki_people (the scrub's cursor and
-- the list of the ids the IAM deleted).
--
--   - users.anonymized_at: when the IAM deleted the account - the one column
--     the library's people module adds to every site's table of people. Empty
--     for everybody: the scrub fills it, at run time, for an account the IAM
--     lists; the row stays, under the IAM's placeholder name, and so does
--     everything of theirs.
--   - The words of a sign-in that came back without one: the library's screen
--     says them now, in the library's words (anotoki.signIn.*), so this app's
--     three keys for them go - signIn.notCompleted and signIn.failed (the Sign
--     in card's line and a visitor's note) and signIn.signingIn (the callback
--     page). Where the owner reworded one of them in any language, every
--     language of it is copied under the library's key first, with who wrote
--     it and when, so the screen says the owner's words; the library's 003
--     then leaves them be (it writes its words only for a key that has none).
--     The words seeded by 004 and 005 are no rewording: they give way to the
--     library's, which say the same on a screen made for them.
--
-- It changes no row of anybody's study data, and no other string. The check
-- at its end fails it loudly unless every table of people and their data
-- still has the rows it had, the new column is there and empty, every other
-- string is as it was, every reworded string came under the library's key as
-- it was, and the three keys are gone.

-- What is here now, to compare with at the end: each table's number of rows ...
CREATE TEMP TABLE academy_010_rows ON COMMIT DROP AS
SELECT 'users' AS t, count(*) AS n FROM users
UNION ALL SELECT 'srs_settings', count(*) FROM srs_settings
UNION ALL SELECT 'srs_progress', count(*) FROM srs_progress
UNION ALL SELECT 'srs_daily', count(*) FROM srs_daily
UNION ALL SELECT 'srs_log', count(*) FROM srs_log
UNION ALL SELECT 'exam_attempts', count(*) FROM exam_attempts
UNION ALL SELECT 'imports', count(*) FROM imports;

-- ... every string of the keys that stay, as it is ...
CREATE TEMP TABLE academy_010_kept ON COMMIT DROP AS
SELECT key_name, language_code, value, updated_at, updated_by FROM translations
 WHERE key_name NOT IN ('signIn.notCompleted', 'signIn.failed', 'signIn.signingIn');

-- ... and the strings of the three keys that go where the owner reworded one
-- of them in any language: every language of such a key, beside the library's
-- key that carries it from now on. A string 004 or 005 seeded is no rewording.
CREATE TEMP TABLE academy_010_words ON COMMIT DROP AS
SELECT m.own_key, m.library_key, t.language_code, t.value, t.updated_at, t.updated_by
  FROM (VALUES
      ('signIn.notCompleted', 'anotoki.signIn.notCompleted'),
      ('signIn.failed', 'anotoki.signIn.failed'),
      ('signIn.signingIn', 'anotoki.signIn.signingIn')
  ) AS m(own_key, library_key)
  JOIN translations t ON t.key_name = m.own_key
 WHERE EXISTS (
       SELECT 1 FROM translations r
        WHERE r.key_name = m.own_key
          AND NOT EXISTS (
              SELECT 1 FROM (VALUES
                  ('signIn.notCompleted', 'en', 'Signing in was not completed. If you did not mean to stop it, this account may have no access to Japanese Academy.'),
                  ('signIn.notCompleted', 'en', 'Signing in was not completed. Try again.'),
                  ('signIn.notCompleted', 'sk', 'Prihlásenie sa nedokončilo. Ak to nebol tvoj zámer, tento účet možno nemá do aplikácie Japanese Academy prístup.'),
                  ('signIn.notCompleted', 'sk', 'Prihlásenie sa nedokončilo. Skús to znova.'),
                  ('signIn.failed', 'en', 'Signing in did not work. Try again. ({code})'),
                  ('signIn.failed', 'sk', 'Prihlásenie sa nepodarilo. Skús to znova. ({code})'),
                  ('signIn.signingIn', 'en', 'Signing in…'),
                  ('signIn.signingIn', 'sk', 'Prihlasujeme ťa…')
              ) AS seeded(key_name, language_code, value)
              WHERE seeded.key_name = r.key_name AND seeded.language_code = r.language_code AND seeded.value = r.value));

-- ------------------------------------------------------------------- users

ALTER TABLE users ADD COLUMN anonymized_at timestamptz;

COMMENT ON COLUMN users.anonymized_at IS 'When the IAM deleted (anonymized) the account, as its list of deleted accounts says: the anotoki library''s scrub writes it, with the IAM''s placeholder name. Empty for everybody else, and always for a visitor.';

-- ------------------------------------------------------------- the strings

-- The library's keys, ahead of the library's own file (its set runs after
-- this one, and then writes their descriptions) - only where a reworded
-- string goes under them.
INSERT INTO translation_keys (name, description)
SELECT DISTINCT library_key, 'A word of the anotoki library: its migration anotoki_translations/003 describes it.' FROM academy_010_words
ON CONFLICT (name) DO NOTHING;

-- Every string of a reworded key under the library's: every language, with who wrote it and when.
INSERT INTO translations (key_name, language_code, value, updated_at, updated_by)
SELECT library_key, language_code, value, updated_at, updated_by FROM academy_010_words
ON CONFLICT (key_name, language_code) DO NOTHING;

-- The three keys the library's screen says now: nothing asks for them any more.
DELETE FROM translation_keys WHERE name IN ('signIn.notCompleted', 'signIn.failed', 'signIn.signingIn');

-- -------------------------------------------------------------- the check

DO $$
DECLARE
    missing text;
BEGIN
    -- The column: there, as the library reads it, and empty.
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'anonymized_at'
                      AND data_type = 'timestamp with time zone' AND is_nullable = 'YES') THEN
        RAISE EXCEPTION '010_people_and_signing_in: users.anonymized_at is not a column that may be empty, of timestamptz';
    END IF;
    IF EXISTS (SELECT 1 FROM users WHERE anonymized_at IS NOT NULL) THEN
        RAISE EXCEPTION '010_people_and_signing_in: users.anonymized_at is filled in for somebody';
    END IF;

    -- Every table of people and their data has the rows it had.
    SELECT string_agg(b.t || ' (' || b.n || ' -> ' || a.n || ')', ', ' ORDER BY b.t) INTO missing
      FROM academy_010_rows b
      JOIN (SELECT 'users' AS t, count(*) AS n FROM users
            UNION ALL SELECT 'srs_settings', count(*) FROM srs_settings
            UNION ALL SELECT 'srs_progress', count(*) FROM srs_progress
            UNION ALL SELECT 'srs_daily', count(*) FROM srs_daily
            UNION ALL SELECT 'srs_log', count(*) FROM srs_log
            UNION ALL SELECT 'exam_attempts', count(*) FROM exam_attempts
            UNION ALL SELECT 'imports', count(*) FROM imports) a ON a.t = b.t
     WHERE a.n <> b.n;
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION '010_people_and_signing_in: tables whose rows changed: %', missing;
    END IF;

    -- Every string of the keys that stay is as it was - its text, who wrote it and when -, and none came.
    SELECT string_agg(d.key_name || ' (' || d.language_code || ')', ', ' ORDER BY d.key_name, d.language_code) INTO missing
      FROM ((SELECT key_name, language_code, value, updated_at, updated_by FROM academy_010_kept
             EXCEPT SELECT key_name, language_code, value, updated_at, updated_by FROM translations)
            UNION ALL
            (SELECT key_name, language_code, value, updated_at, updated_by FROM translations
              WHERE key_name NOT IN (SELECT library_key FROM academy_010_words)
             EXCEPT SELECT key_name, language_code, value, updated_at, updated_by FROM academy_010_kept)) d;
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION '010_people_and_signing_in: strings that are not as they were: %', missing;
    END IF;

    -- Every reworded string came under the library's key as it was: its text, who wrote it and when.
    SELECT string_agg(w.library_key || ' (' || w.language_code || ')', ', ' ORDER BY w.library_key, w.language_code) INTO missing
      FROM academy_010_words w
     WHERE NOT EXISTS (SELECT 1 FROM translations t
                        WHERE t.key_name = w.library_key AND t.language_code = w.language_code AND t.value = w.value
                          AND t.updated_at = w.updated_at AND t.updated_by IS NOT DISTINCT FROM w.updated_by);
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION '010_people_and_signing_in: strings that did not come under the library''s keys as they were: %', missing;
    END IF;

    -- And the library's key has no language the app's key did not have: one left without a string stays so.
    SELECT string_agg(t.key_name || ' (' || t.language_code || ')', ', ' ORDER BY t.key_name, t.language_code) INTO missing
      FROM translations t
     WHERE t.key_name IN (SELECT library_key FROM academy_010_words)
       AND NOT EXISTS (SELECT 1 FROM academy_010_words w WHERE w.library_key = t.key_name AND w.language_code = t.language_code);
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION '010_people_and_signing_in: strings under the library''s keys the app''s keys did not have: %', missing;
    END IF;

    -- Every library key that came with words has English: every other language falls back to it.
    SELECT string_agg(DISTINCT w.library_key, ', ') INTO missing
      FROM academy_010_words w
     WHERE NOT EXISTS (SELECT 1 FROM translations t WHERE t.key_name = w.library_key AND t.language_code = 'en');
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION '010_people_and_signing_in: library keys without an English string: %', missing;
    END IF;

    -- The three keys are gone, and their strings with them.
    SELECT string_agg(gone.name, ', ' ORDER BY gone.name) INTO missing
      FROM (VALUES ('signIn.notCompleted'), ('signIn.failed'), ('signIn.signingIn')) AS gone(name)
     WHERE EXISTS (SELECT 1 FROM translation_keys tk WHERE tk.name = gone.name)
        OR EXISTS (SELECT 1 FROM translations t WHERE t.key_name = gone.name);
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION '010_people_and_signing_in: keys that should be gone and are not: %', missing;
    END IF;
END $$;
