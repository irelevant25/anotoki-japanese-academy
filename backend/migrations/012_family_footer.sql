-- 012 — the words of the app's own foot, which the anotoki family's footer took over (2026-10-18)
--
-- THIS FILE IS A DRAFT until its last line is "-- end of 012": the app waits
-- for that line before it applies a migration (db_migration_ready() in
-- backend/src/db.php), and until then the tests alone apply it, on their
-- throwaway databases - and every file of the anotoki library waits with it on
-- every other database (db_own_draft()), its anotoki_translations/012 among
-- them. The owner says when it is final; its last line is written last.
-- Applied once, it is never edited again - a change is the next migration. An
-- administrator applies it on the admin panel's Migrations page (or
-- backend/manage.php, or the setup page), never a request.
--
-- Since anotoki-lib 0.6.3 (the owner's choice of 2026-10-18: one footer on
-- every anotoki site, the build analyzer's) the foot of every page and of the
-- admin panel is the library's <anotoki-site-footer>: its top border, "Version
-- 0.5.1 · What's new · Feedback" in the library's words (anotoki.footer.*,
-- written by the library's own anotoki_translations/012), and Terms · Privacy
-- · Contact under them. The app's own foot is gone, and with it the dot beside
-- What's new that said a version's news had not been opened yet - the family's
-- footer has none. So these keys are read by nothing now:
--
--   whatsNew.unseen                  the dot's tooltip
--   legal.storage.whatsNew.purpose   the Privacy page's item for what the dot
--   legal.storage.whatsNew.kept      needed kept in the browser (academy-
--                                    changelog-seen): nothing keeps it now, and
--                                    the page names it no more
--
-- They go, and their strings with them (translations' ON DELETE CASCADE, 004) -
-- an owner's rewording of one too, which no page would show. whatsNew.title
-- stays: the heading of the What's new dialog, which the footer's What's new
-- opens; its description says so now - the footer's button has the library's
-- words, not this key's. It touches no other row, and no table of anybody's
-- study data.

DELETE FROM translation_keys WHERE name IN ('whatsNew.unseen', 'legal.storage.whatsNew.purpose', 'legal.storage.whatsNew.kept');

UPDATE translation_keys SET description = 'The heading of the dialog that lists what changed in each version. "What’s new" at the foot of every page opens it: that button''s own words are the anotoki library''s footer''s (anotoki.footer.whatsNew), not this string.' WHERE name = 'whatsNew.title';

-- -------------------------------------------------------------- the check

-- The keys are gone, and their strings with them; the dialog's heading stays, in English and Slovak.
DO $$
DECLARE
    wrong text;
BEGIN
    SELECT string_agg(gone.name, ', ' ORDER BY gone.name) INTO wrong
      FROM (VALUES ('whatsNew.unseen'), ('legal.storage.whatsNew.purpose'), ('legal.storage.whatsNew.kept')) AS gone(name)
     WHERE EXISTS (SELECT 1 FROM translation_keys tk WHERE tk.name = gone.name)
        OR EXISTS (SELECT 1 FROM translations t WHERE t.key_name = gone.name);
    IF wrong IS NOT NULL THEN
        RAISE EXCEPTION '012_family_footer: keys that should be gone and are not: %', wrong;
    END IF;
    IF (SELECT count(*) FROM translations t WHERE t.key_name = 'whatsNew.title' AND t.language_code IN ('en', 'sk')) <> 2 THEN
        RAISE EXCEPTION '012_family_footer: whatsNew.title, the heading of the What''s new dialog, has lost its English or its Slovak string';
    END IF;
END $$;
