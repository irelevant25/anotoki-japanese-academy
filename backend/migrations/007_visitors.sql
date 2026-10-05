-- 007 — visitors: studying without signing in, where the IAM allows it (2026-10-05)
--
-- It was written as a draft, without its last line ("-- end of 007"), which
-- the app waits for before it applies a migration (db_migration_sql() in
-- backend/src/db.php); the tests alone applied the draft, on their throwaway
-- databases. It is final now (2026-10-05), with that line written last:
-- applied once, it is never edited again - a change is the next migration.
-- An administrator applies it on the admin panel's Migrations page (or
-- backend/manage.php, or the setup page), never a request.
--
-- The IAM says per site whether it requires sign-in (its "Sign-in required"
-- switch; src/access.php). Where it does not, somebody who has not signed in
-- may study all the same: the first answer they save makes them a visitor -
-- a users row with a negative id (an IAM user id is always positive), and a
-- long random key the server makes and their browser keeps (X-Visitor-Key).
-- The row keeps only the key's SHA-256. Their study rows are like anybody's,
-- under that id. A visitor unseen for 30 days is deleted with all of it; one
-- who signs in has it moved into their account (POST /api/visitor/move).
-- The rules are in docs/kb/sign-in.md, *Visitors*, and src/visitors.php.
--   users.visitor_key_hash   the SHA-256 (hex) of a visitor's key; null for a person
--   users.visitor_from       a keyed hash (HMAC-SHA-256) of the address the visitor
--                            was made from, as the limits count it; never the address
--   visitor_ids              the visitors' ids: -1, -2, -3 …
--
-- It changes no row of anybody's: it drops users' old CHECK (id > 0), adds
-- the two columns, a check that a row is a person (id > 0, no key) or a
-- visitor (id < 0, a key), the sequence and two indexes. And it writes the
-- words a visitor reads (the notice, the notes after a move, the questions
-- before a sign-in, the refusals), in English and informal Slovak (ty), in
-- 004's form. The check at its end fails it loudly unless every table of
-- anybody's data still has the rows it had, and every new key reads in both
-- languages.

-- What is here now, to compare with at the end: each table's number of rows.
CREATE TEMP TABLE academy_007_before ON COMMIT DROP AS
SELECT 'users' AS t, count(*) AS n FROM users
UNION ALL SELECT 'srs_settings', count(*) FROM srs_settings
UNION ALL SELECT 'srs_progress', count(*) FROM srs_progress
UNION ALL SELECT 'srs_daily', count(*) FROM srs_daily
UNION ALL SELECT 'srs_log', count(*) FROM srs_log
UNION ALL SELECT 'exam_attempts', count(*) FROM exam_attempts
UNION ALL SELECT 'imports', count(*) FROM imports;

-- ------------------------------------------------------------------- users

-- 002's CHECK (id > 0), whatever its name (users_id_check, as PostgreSQL named it).
DO $$
DECLARE
    c text;
BEGIN
    FOR c IN SELECT conname FROM pg_constraint
              WHERE conrelid = 'users'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) = 'CHECK ((id > 0))' LOOP
        EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', c);
    END LOOP;
END $$;

ALTER TABLE users ADD COLUMN visitor_key_hash char(64) UNIQUE;
ALTER TABLE users ADD COLUMN visitor_from char(64);

-- A person (the IAM user id: positive, no key) or a visitor (negative, a key).
ALTER TABLE users ADD CONSTRAINT users_person_or_visitor CHECK (
    (id > 0 AND visitor_key_hash IS NULL AND visitor_from IS NULL)
    OR (id < 0 AND visitor_key_hash IS NOT NULL)
);

CREATE SEQUENCE visitor_ids AS bigint INCREMENT BY -1 START WITH -1 MAXVALUE -1 NO MINVALUE;

-- The sweep (visitors unseen for 30 days) and the limits (new visitors an hour, per address).
CREATE INDEX users_visitors_seen ON users (last_seen_at) WHERE id < 0;
CREATE INDEX users_visitors_from ON users (visitor_from, created_at) WHERE id < 0;

COMMENT ON COLUMN users.visitor_key_hash IS 'A visitor''s key, as SHA-256 hex: the key itself is only in their browser (X-Visitor-Key). Null for a person.';
COMMENT ON COLUMN users.visitor_from IS 'HMAC-SHA-256 of the address a visitor was made from, as the limits count it (an IPv6 address by its /64), keyed by a secret the site keeps outside the database. Never the address.';
COMMENT ON SEQUENCE visitor_ids IS 'The visitors'' user ids: -1, -2, -3 … (an IAM user id is always positive).';

-- ------------------------------------------------------------- the strings

-- What somebody studying without signing in reads, in 004's form: a key, its
-- English and its informal Slovak (ty) string, one string on a line, an
-- apostrophe written twice and nothing else escaped; every insert steps aside
-- for a row that is already there.

INSERT INTO translation_keys (name, description) VALUES
    -- visitor: studying without signing in (the notice on the home page and the kanji dashboard)
    ('visitor.notice.one', 'The notice on the home page and the kanji dashboard while somebody studies without signing in (the site allows it): what they study is kept on the server for this browser only, for {count} days after their last visit, and signing in keeps it in their account. A Sign in button follows it. {count}: a number of days. The form for 1.'),
    ('visitor.notice.few', 'The notice on the home page and the kanji dashboard while somebody studies without signing in (the site allows it): what they study is kept on the server for this browser only, for {count} days after their last visit, and signing in keeps it in their account. A Sign in button follows it. {count}: a number of days. The form for 2 to 4.'),
    ('visitor.notice.other', 'The notice on the home page and the kanji dashboard while somebody studies without signing in (the site allows it): what they study is kept on the server for this browser only, for {count} days after their last visit, and signing in keeps it in their account. A Sign in button follows it. {count}: a number of days. The form for 0 and for 5 and more.'),
    ('visitor.lost', 'A note on the home page and the kanji dashboard, once: what this browser studied without signing in is gone from the server - deleted after many days unused, or moved into an account by a sign-in (perhaps somebody else''s, on this browser).'),
    ('visitor.moved', 'A note on the home page and the kanji dashboard, once, after a sign-in: what this browser studied without signing in has moved into the account. {items}: how many kanji and words moved; {attempts}: how many exam attempts moved. Numbers, written after a colon so no word has to agree with them.'),
    ('visitor.movedKept', 'After visitor.moved, when some of the kanji and words studied without signing in were in the account already: for those, the account''s own progress stays and what was studied without signing in is dropped. {kept}: how many.'),
    -- signIn: what signing in from a page studied without signing in says before something would be lost
    ('signIn.notSaved', 'The browser''s own question box, when Sign in is pressed by somebody studying without signing in, and some answers or notes could not be saved: going to sign in now loses them. Its OK and Cancel are the browser''s.'),
    ('signIn.examOpen', 'The browser''s own question box, when Sign in is pressed by somebody studying without signing in, while an exam paper is open and not handed in: going to sign in now loses it. Its OK and Cancel are the browser''s.'),
    -- error: a request of somebody studying without signing in that the server refused
    ('error.too_many_visitors', 'A first answer of somebody studying without signing in was refused: the site keeps only so many people without an account at a time (or so many new ones an hour), and it is full.'),
    ('error.visitor_limit.attempts', 'An exam was refused before it started (or one handed in was not kept) because this browser, studying without signing in, has as many exam attempts as it may keep. {max}: that number.'),
    ('error.visitor_limit.answers', 'An answer was refused because this browser, studying without signing in, has as many answers as it may keep. {max}: that number.'),
    ('error.visitor_unknown', 'A request of somebody studying without signing in was refused because the server no longer knows this browser: deleted after many days unused, or moved into an account by a sign-in.'),
    ('error.visitors_unavailable', 'Studying without signing in was refused because the server''s database is not ready for it yet (an update waits for an administrator).'),
    ('error.visitor_move_retry', 'After a sign-in, moving what this browser studied without signing in into the account did not finish (the server was busy); the app tries again by itself.')
ON CONFLICT (name) DO NOTHING;

-- English: what every other language falls back to, string by string.
INSERT INTO translations (key_name, language_code, value)
SELECT v.key_name, 'en', v.value FROM (VALUES
    -- visitor: studying without signing in (the notice on the home page and the kanji dashboard)
    ('visitor.notice.one', 'You are studying without signing in. What you study is kept for this browser for {count} day after your last visit. Sign in to keep it in your account.'),
    ('visitor.notice.few', 'You are studying without signing in. What you study is kept for this browser for {count} days after your last visit. Sign in to keep it in your account.'),
    ('visitor.notice.other', 'You are studying without signing in. What you study is kept for this browser for {count} days after your last visit. Sign in to keep it in your account.'),
    ('visitor.lost', 'What this browser studied without signing in is no longer here: it was deleted after a long time unused, or moved into an account.'),
    ('visitor.moved', 'What you studied without signing in is now in your account. Kanji and words: {items}, exam attempts: {attempts}.'),
    ('visitor.movedKept', 'Kanji and words that were in your account already: {kept}. Your own progress stays for them.'),
    -- signIn: what signing in from a page studied without signing in says before something would be lost
    ('signIn.notSaved', 'Some of your answers or notes could not be saved, and signing in now loses them. Sign in anyway?'),
    ('signIn.examOpen', 'Your exam is not finished, and signing in now loses the test. Sign in anyway?'),
    -- error: a request of somebody studying without signing in that the server refused
    ('error.too_many_visitors', 'Too many people are using the site without signing in just now. Sign in to continue, or try again later.'),
    ('error.visitor_limit.attempts', 'This browser has as many exam attempts as it keeps without signing in ({max}). Sign in to keep more.'),
    ('error.visitor_limit.answers', 'This browser has as many answers as it keeps without signing in ({max}). Sign in to go on.'),
    ('error.visitor_unknown', 'This browser''s study without signing in has ended: it was deleted after a long time unused, or moved into an account.'),
    ('error.visitors_unavailable', 'Studying without signing in is not ready yet. Sign in to continue.'),
    ('error.visitor_move_retry', 'Moving what this browser studied into your account did not finish. It will be tried again.')
) AS v(key_name, value)
ON CONFLICT (key_name, language_code) DO NOTHING;

-- Slovak, informal (ty). A string may leave out a placeholder its English has,
-- never use one it has not.
INSERT INTO translations (key_name, language_code, value)
SELECT v.key_name, 'sk', v.value FROM (VALUES
    -- visitor: studying without signing in (the notice on the home page and the kanji dashboard)
    ('visitor.notice.one', 'Študuješ bez prihlásenia. To, čo sa naučíš, uchováme pre tento prehliadač {count} deň po tvojej poslednej návšteve. Prihlás sa a zostane ti vo tvojom účte.'),
    ('visitor.notice.few', 'Študuješ bez prihlásenia. To, čo sa naučíš, uchováme pre tento prehliadač {count} dni po tvojej poslednej návšteve. Prihlás sa a zostane ti vo tvojom účte.'),
    ('visitor.notice.other', 'Študuješ bez prihlásenia. To, čo sa naučíš, uchováme pre tento prehliadač {count} dní po tvojej poslednej návšteve. Prihlás sa a zostane ti vo tvojom účte.'),
    ('visitor.lost', 'To, čo sa v tomto prehliadači študovalo bez prihlásenia, tu už nie je: po dlhom čase bez použitia sa vymazalo, alebo sa presunulo do účtu.'),
    ('visitor.moved', 'Štúdium bez prihlásenia je teraz vo tvojom účte. Kanji a slová: {items}, pokusy o test: {attempts}.'),
    ('visitor.movedKept', 'Kanji a slová, ktoré už boli vo tvojom účte: {kept}. Ostáva pri nich tvoj vlastný pokrok.'),
    -- signIn: what signing in from a page studied without signing in says before something would be lost
    ('signIn.notSaved', 'Niektoré tvoje odpovede alebo poznámky sa nepodarilo uložiť a prihlásením sa teraz stratia. Chceš sa aj tak prihlásiť?'),
    ('signIn.examOpen', 'Tvoja skúška nie je dokončená a prihlásením sa teraz test stratí. Chceš sa aj tak prihlásiť?'),
    -- error: a request of somebody studying without signing in that the server refused
    ('error.too_many_visitors', 'Práve teraz používa stránku bez prihlásenia priveľa ľudí. Prihlás sa a pokračuj, alebo to skús neskôr.'),
    ('error.visitor_limit.attempts', 'Tento prehliadač má toľko pokusov o test, koľko si bez prihlásenia uchová ({max}). Po prihlásení si ich uchováš viac.'),
    ('error.visitor_limit.answers', 'Tento prehliadač má toľko odpovedí, koľko si bez prihlásenia uchová ({max}). Prihlás sa a pokračuj.'),
    ('error.visitor_unknown', 'Štúdium bez prihlásenia v tomto prehliadači skončilo: po dlhom čase bez použitia sa vymazalo, alebo sa presunulo do účtu.'),
    ('error.visitors_unavailable', 'Štúdium bez prihlásenia ešte nie je pripravené. Prihlás sa a pokračuj.'),
    ('error.visitor_move_retry', 'Presun toho, čo sa v tomto prehliadači študovalo, do tvojho účtu sa nedokončil. Skúsi sa to znova.')
) AS v(key_name, value)
ON CONFLICT (key_name, language_code) DO NOTHING;

-- ------------------------------------------------------------- the check

DO $$
DECLARE
    changed text;
    missing text;
BEGIN
    IF (SELECT count(*) FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = 'users'
           AND column_name IN ('visitor_key_hash', 'visitor_from') AND is_nullable = 'YES' AND character_maximum_length = 64) <> 2 THEN
        RAISE EXCEPTION '007_visitors: users should have visitor_key_hash and visitor_from, char(64) and nullable';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'users'::regclass AND conname = 'users_person_or_visitor') THEN
        RAISE EXCEPTION '007_visitors: users_person_or_visitor is missing';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'users'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) = 'CHECK ((id > 0))') THEN
        RAISE EXCEPTION '007_visitors: users still refuses every id below 1 (CHECK (id > 0))';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = current_schema() AND sequencename = 'visitor_ids'
                    AND increment_by = -1 AND start_value = -1 AND max_value = -1) THEN
        RAISE EXCEPTION '007_visitors: visitor_ids should count down from -1';
    END IF;
    IF EXISTS (SELECT 1 FROM users WHERE id <= 0) THEN
        RAISE EXCEPTION '007_visitors: users holds an id below 1 already';
    END IF;

    SELECT string_agg(format('%s (%s rows before, %s after)', b.t, b.n, a.n), ', ')
      INTO changed
      FROM academy_007_before b
      JOIN (SELECT 'users' AS t, count(*) AS n FROM users
            UNION ALL SELECT 'srs_settings', count(*) FROM srs_settings
            UNION ALL SELECT 'srs_progress', count(*) FROM srs_progress
            UNION ALL SELECT 'srs_daily', count(*) FROM srs_daily
            UNION ALL SELECT 'srs_log', count(*) FROM srs_log
            UNION ALL SELECT 'exam_attempts', count(*) FROM exam_attempts
            UNION ALL SELECT 'imports', count(*) FROM imports) a ON a.t = b.t
     WHERE a.n <> b.n;
    IF changed IS NOT NULL THEN
        RAISE EXCEPTION '007_visitors: a table of somebody''s data changed: %', changed;
    END IF;

    -- Every key of this file is here and reads in both languages: a page never
    -- shows a key, and Slovak never falls back to English by accident.
    SELECT string_agg(k.name, ', ' ORDER BY k.name) INTO missing
      FROM (VALUES
          ('visitor.notice.one'), ('visitor.notice.few'), ('visitor.notice.other'), ('visitor.lost'),
          ('visitor.moved'), ('visitor.movedKept'), ('signIn.notSaved'), ('signIn.examOpen'),
          ('error.too_many_visitors'), ('error.visitor_limit.attempts'), ('error.visitor_limit.answers'),
          ('error.visitor_unknown'), ('error.visitors_unavailable'), ('error.visitor_move_retry')
      ) AS k(name)
     WHERE NOT EXISTS (SELECT 1 FROM translation_keys tk WHERE tk.name = k.name)
        OR NOT EXISTS (SELECT 1 FROM translations t WHERE t.key_name = k.name AND t.language_code = 'en')
        OR NOT EXISTS (SELECT 1 FROM translations t WHERE t.key_name = k.name AND t.language_code = 'sk');
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION '007_visitors: keys without an English and a Slovak string: %', missing;
    END IF;
END $$;

-- end of 007
