-- 008 — the words of two pages the anotoki library took over (2026-10-07)
--
-- THIS FILE IS A DRAFT until its last line is "-- end of 008": the app takes a
-- migration without that line for one still being written (or uploaded), and
-- applies neither it nor anything after it (db_migration_ready() in
-- backend/src/db.php); the tests alone apply the draft, on their throwaway
-- databases, and backend/tools/build-dist.php builds no upload while it is
-- one. Write that line last, once the change is final: applied once, the file
-- is never edited again - a change is the next migration. An administrator
-- then applies it on the admin panel's Migrations page (or backend/manage.php,
-- or the setup page), never a request.
--
-- Since 2026-10-07 the anotoki library (the Composer package anotoki/lib and
-- @anotoki/lib, every anotoki site's) says what a site does while it is not
-- ready: its own page, in its own words (English and Slovak), stands in for
-- the app while a database update waits, while the site is not set up, and
-- while its database does not answer - with the way to the Migrations page
-- for the site's ADMIN, and to the setup page only while the site was never
-- installed. So this app's own "not set up yet" page is gone, and the problem
-- page's way to the Migrations page with it: their words are used nowhere
-- now. Their keys go, and their strings with them (translations' ON DELETE
-- CASCADE, 004). It touches no other row, and no table of anybody's study data.

DELETE FROM translation_keys WHERE name IN ('boot.notSetUp.title', 'boot.notSetUp.text', 'boot.notSetUp.setup', 'boot.notSetUp.open', 'boot.notSetUp.why', 'boot.problem.migrations');

-- -------------------------------------------------------------- the check

-- The keys are gone, and their strings with them.
DO $$
DECLARE
    missing text;
BEGIN
    SELECT string_agg(gone.name, ', ' ORDER BY gone.name) INTO missing
      FROM (VALUES ('boot.notSetUp.title'), ('boot.notSetUp.text'), ('boot.notSetUp.setup'), ('boot.notSetUp.open'),
                   ('boot.notSetUp.why'), ('boot.problem.migrations')) AS gone(name)
     WHERE EXISTS (SELECT 1 FROM translation_keys tk WHERE tk.name = gone.name)
        OR EXISTS (SELECT 1 FROM translations t WHERE t.key_name = gone.name);
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION '008_library_status_page: keys that should be gone and are not: %', missing;
    END IF;
END $$;
