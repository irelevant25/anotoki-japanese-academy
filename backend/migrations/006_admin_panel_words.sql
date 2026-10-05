-- 006 — "Admin panel", and the words of a database update that waits for an administrator (2026-10-04)
--
-- It was written as a draft, without its last line ("-- end of 006"), which
-- the app waits for before it applies a migration (db_migration_sql() in
-- backend/src/db.php); the tests alone applied the draft, on their throwaway
-- databases. It is final now, with that line written last: applied once, it
-- is never edited again - a change is the next migration. Like every
-- migration from this one on, it is applied by an administrator on the admin
-- panel's Migrations page (or by backend/manage.php, or the setup page),
-- never by a request.
--
-- Two things changed for the people who see these words. The admin area is
-- called the admin panel everywhere in the anotoki family (the owner's
-- decision, 2026-10-04), so the way into it in the person's menu says so.
-- And a migration no longer applies itself at the first request after an
-- upload: it waits for an administrator, who applies it on the admin panel's
-- Migrations page. Meanwhile the app says it is not up to date - no longer
-- "try again in a moment", which was true of a migration about to apply
-- itself - and an administrator gets a link to that page.
--
-- In 004's form: a key, its English and its informal Slovak (ty) string, one
-- string on a line, an apostrophe written twice and nothing else escaped;
-- every insert steps aside for a row that is already there. Two keys'
-- strings are reworded (four strings, English and Slovak), each only while
-- it is still the text 004 or 005 wrote: a string the owner reworded in the
-- admin panel is theirs and stays. It changes no table and no row of
-- anybody's study data.

-- ------------------------------------------------------------ the strings

INSERT INTO translation_keys (name, description) VALUES
    -- boot: the page shown instead of the app when it cannot start
    ('boot.problem.migrations', 'The page shown instead of the app when it cannot start, for an administrator only, under the reason, when a database update waits for them: the link to the admin panel''s Migrations page, where they apply it. "Migrations" is the name of that page, which is in English: never translated.')
ON CONFLICT (name) DO NOTHING;

-- English: what every other language falls back to, string by string.
INSERT INTO translations (key_name, language_code, value)
SELECT v.key_name, 'en', v.value FROM (VALUES
    -- boot: the page shown instead of the app when it cannot start
    ('boot.problem.migrations', 'Open the Migrations page')
) AS v(key_name, value)
ON CONFLICT (key_name, language_code) DO NOTHING;

-- Slovak, informal (ty). A string may leave out a placeholder its English has,
-- never use one it has not.
INSERT INTO translations (key_name, language_code, value)
SELECT v.key_name, 'sk', v.value FROM (VALUES
    -- boot: the page shown instead of the app when it cannot start
    ('boot.problem.migrations', 'Otvoriť stránku Migrations')
) AS v(key_name, value)
ON CONFLICT (key_name, language_code) DO NOTHING;

-- Reworded, each only while it is the text 004 or 005 wrote: a string
-- reworded in the admin panel is the owner's, and stays as it is.
UPDATE translations SET value = 'Admin panel', updated_at = now() WHERE key_name = 'topbar.admin' AND language_code = 'en' AND value = 'Admin';
UPDATE translations SET value = 'Administrátorský panel', updated_at = now() WHERE key_name = 'topbar.admin' AND language_code = 'sk' AND value = 'Administrácia';
UPDATE translation_keys SET description = 'The person''s menu in the top bar, for editors and administrators: the link into the admin panel (whose pages are English). The anotoki family calls it the admin panel on every site.' WHERE name = 'topbar.admin';

UPDATE translations SET value = 'The database is not up to date with this version of the app yet: an administrator has to apply the update first. Try again later.', updated_at = now() WHERE key_name = 'error.not_up_to_date' AND language_code = 'en' AND value = 'The database is not up to date with the uploaded version of the app yet. Try again in a moment; if this stays, the server''s error log says why.';
UPDATE translations SET value = 'Databáza ešte nie je zosúladená s touto verziou aplikácie: najprv ju musí aktualizovať administrátor. Skús to neskôr.', updated_at = now() WHERE key_name = 'error.not_up_to_date' AND language_code = 'sk' AND value = 'Databáza ešte nie je zosúladená s nahratou verziou aplikácie. Skús to o chvíľu znova; ak to pretrvá, dôvod je v chybovom zázname servera.';
UPDATE translation_keys SET description = 'The server''s database is behind this version of the app: a database update waits for an administrator to apply it (on the admin panel''s Migrations page), or is still being uploaded. On the page that says the app cannot start, and wherever a request fails with it.' WHERE name = 'error.not_up_to_date';

-- -------------------------------------------------------------- the check

DO $$
DECLARE
    missing text;
BEGIN
    -- Every key of this file is here and reads in both languages: a page never
    -- shows a key, and Slovak never falls back to English by accident.
    SELECT string_agg(k.name, ', ' ORDER BY k.name) INTO missing
      FROM (VALUES
          ('boot.problem.migrations')
      ) AS k(name)
     WHERE NOT EXISTS (SELECT 1 FROM translation_keys tk WHERE tk.name = k.name)
        OR NOT EXISTS (SELECT 1 FROM translations t WHERE t.key_name = k.name AND t.language_code = 'en')
        OR NOT EXISTS (SELECT 1 FROM translations t WHERE t.key_name = k.name AND t.language_code = 'sk');
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION '006_admin_panel_words: keys without an English and a Slovak string: %', missing;
    END IF;

    -- The reworded keys are still there, each in both languages.
    SELECT string_agg(r.name, ', ' ORDER BY r.name) INTO missing
      FROM (VALUES ('topbar.admin'), ('error.not_up_to_date')) AS r(name)
     WHERE NOT EXISTS (SELECT 1 FROM translations t WHERE t.key_name = r.name AND t.language_code = 'en')
        OR NOT EXISTS (SELECT 1 FROM translations t WHERE t.key_name = r.name AND t.language_code = 'sk');
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION '006_admin_panel_words: reworded keys without an English and a Slovak string: %', missing;
    END IF;

    -- No reworded string is still the text 004 or 005 wrote (the owner's own
    -- rewording is not that text either, and stays).
    SELECT string_agg(t.key_name || ' (' || t.language_code || ')', ', ' ORDER BY t.key_name, t.language_code) INTO missing
      FROM translations t
      JOIN (VALUES
          ('topbar.admin', 'en', 'Admin'),
          ('topbar.admin', 'sk', 'Administrácia'),
          ('error.not_up_to_date', 'en', 'The database is not up to date with the uploaded version of the app yet. Try again in a moment; if this stays, the server''s error log says why.'),
          ('error.not_up_to_date', 'sk', 'Databáza ešte nie je zosúladená s nahratou verziou aplikácie. Skús to o chvíľu znova; ak to pretrvá, dôvod je v chybovom zázname servera.')
      ) AS seeded(key_name, language_code, value)
        ON t.key_name = seeded.key_name AND t.language_code = seeded.language_code AND t.value = seeded.value;
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION '006_admin_panel_words: strings still as 004 and 005 wrote them: %', missing;
    END IF;
END $$;

-- end of 006
