-- 002 — every person's study data is their own (2026-09-27)
--
-- Japanese Academy can now run as a hosted site where people sign in through
-- the anotoki IAM (backend/src/auth.php). Everything personal gets the IAM user id of
-- the person it belongs to, and every query asks for one person's rows:
--   users                                   one row per person: the IAM user id and the name from their token
--   srs_settings, srs_progress, srs_daily,
--   srs_log, exam_attempts, imports         + user_id, first part of each primary key
--
-- Until now the database held only the owner's data, so every row here gets
-- user id 1: the owner's IAM user id (the setup page, or php backend/manage.php
-- --owner-id=N, moves them if theirs is another). The owner approved this one-time rewrite of the study
-- tables on 2026-09-27; apart from it their rows are never rewritten. The check
-- at the end fails the migration, which then changes nothing, unless every row
-- is still there with the same content.

-- What is here now, to compare with at the end: each table's number of rows
-- and a fingerprint of their content.
CREATE TEMP TABLE academy_002_before ON COMMIT DROP AS
SELECT 'srs_settings' AS t, count(*) AS n, md5(coalesce(string_agg(md5((to_jsonb(r) - 'id')::text), ',' ORDER BY r.id), '')) AS fp FROM srs_settings r
UNION ALL SELECT 'srs_progress', count(*), md5(coalesce(string_agg(md5(to_jsonb(r)::text), ',' ORDER BY r.item_id), '')) FROM srs_progress r
UNION ALL SELECT 'srs_daily', count(*), md5(coalesce(string_agg(md5(to_jsonb(r)::text), ',' ORDER BY r.day), '')) FROM srs_daily r
UNION ALL SELECT 'srs_log', count(*), md5(coalesce(string_agg(md5(to_jsonb(r)::text), ',' ORDER BY r.id), '')) FROM srs_log r
UNION ALL SELECT 'exam_attempts', count(*), md5(coalesce(string_agg(md5(to_jsonb(r)::text), ',' ORDER BY r.id), '')) FROM exam_attempts r
UNION ALL SELECT 'imports', count(*), md5(coalesce(string_agg(md5(to_jsonb(r)::text), ',' ORDER BY r.source), '')) FROM imports r;

-- ------------------------------------------------------------------- users

-- Filled in from verified access tokens as requests arrive; the IAM owns
-- identity, this is only who the rows below belong to.
CREATE TABLE users (
    id                 bigint      PRIMARY KEY CHECK (id > 0), -- the IAM user id: the sub of their tokens
    preferred_username text,                                   -- their name at the IAM, from their latest token
    created_at         timestamptz NOT NULL DEFAULT now(),     -- first seen here
    last_seen_at       timestamptz NOT NULL DEFAULT now()
);
-- The owner, who has had this database to themselves until now.
INSERT INTO users (id) VALUES (1);

-- The study tables point at users with ON UPDATE CASCADE, so giving someone's
-- data to another id (backend/src/owner.php) is one update of their users row.

-- ---------------------------------------------------------- srs_settings
-- one row per person instead of the single row (id = 1)
ALTER TABLE srs_settings ADD COLUMN user_id bigint;
UPDATE srs_settings SET user_id = 1;
ALTER TABLE srs_settings DROP COLUMN id; -- and with it the old primary key and CHECK (id = 1)
ALTER TABLE srs_settings ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE srs_settings ADD PRIMARY KEY (user_id);
ALTER TABLE srs_settings ADD FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE CASCADE;

-- ---------------------------------------------------------- srs_progress
ALTER TABLE srs_progress ADD COLUMN user_id bigint;
UPDATE srs_progress SET user_id = 1;
ALTER TABLE srs_progress ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE srs_progress DROP CONSTRAINT srs_progress_pkey;
ALTER TABLE srs_progress ADD PRIMARY KEY (user_id, item_id);
ALTER TABLE srs_progress ADD FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE CASCADE;
DROP INDEX srs_progress_next_review;
CREATE INDEX srs_progress_next_review ON srs_progress (user_id, next_review) WHERE stage BETWEEN 1 AND 8;

-- ------------------------------------------------------------- srs_daily
ALTER TABLE srs_daily ADD COLUMN user_id bigint;
UPDATE srs_daily SET user_id = 1;
ALTER TABLE srs_daily ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE srs_daily DROP CONSTRAINT srs_daily_pkey;
ALTER TABLE srs_daily ADD PRIMARY KEY (user_id, day);
ALTER TABLE srs_daily ADD FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE CASCADE;

-- --------------------------------------------------------------- srs_log
-- still only ever added to; its id stays the order the answers came in
ALTER TABLE srs_log ADD COLUMN user_id bigint;
UPDATE srs_log SET user_id = 1;
ALTER TABLE srs_log ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE srs_log ADD FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE CASCADE;
CREATE INDEX srs_log_user ON srs_log (user_id, id);

-- --------------------------------------------------------- exam_attempts
-- An attempt's id is its finishing time and seed, so two people can have the
-- same one: it is unique per person.
ALTER TABLE exam_attempts ADD COLUMN user_id bigint;
UPDATE exam_attempts SET user_id = 1;
ALTER TABLE exam_attempts ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE exam_attempts DROP CONSTRAINT exam_attempts_pkey;
ALTER TABLE exam_attempts ADD PRIMARY KEY (user_id, id);
ALTER TABLE exam_attempts ADD FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE CASCADE;
DROP INDEX exam_attempts_finished;
CREATE INDEX exam_attempts_finished ON exam_attempts (user_id, finished_at);

-- --------------------------------------------------------------- imports
-- what the setup page (or backend/manage.php --import) imported, and for whom
ALTER TABLE imports ADD COLUMN user_id bigint;
UPDATE imports SET user_id = 1;
ALTER TABLE imports ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE imports DROP CONSTRAINT imports_pkey;
ALTER TABLE imports ADD PRIMARY KEY (user_id, source);
ALTER TABLE imports ADD FOREIGN KEY (user_id) REFERENCES users (id) ON UPDATE CASCADE;

-- ------------------------------------------------------------- the check

CREATE TEMP TABLE academy_002_after ON COMMIT DROP AS
SELECT 'srs_settings' AS t, count(*) AS n, md5(coalesce(string_agg(md5((to_jsonb(r) - 'user_id')::text), ',' ORDER BY r.user_id), '')) AS fp FROM srs_settings r
UNION ALL SELECT 'srs_progress', count(*), md5(coalesce(string_agg(md5((to_jsonb(r) - 'user_id')::text), ',' ORDER BY r.item_id), '')) FROM srs_progress r
UNION ALL SELECT 'srs_daily', count(*), md5(coalesce(string_agg(md5((to_jsonb(r) - 'user_id')::text), ',' ORDER BY r.day), '')) FROM srs_daily r
UNION ALL SELECT 'srs_log', count(*), md5(coalesce(string_agg(md5((to_jsonb(r) - 'user_id')::text), ',' ORDER BY r.id), '')) FROM srs_log r
UNION ALL SELECT 'exam_attempts', count(*), md5(coalesce(string_agg(md5((to_jsonb(r) - 'user_id')::text), ',' ORDER BY r.id), '')) FROM exam_attempts r
UNION ALL SELECT 'imports', count(*), md5(coalesce(string_agg(md5((to_jsonb(r) - 'user_id')::text), ',' ORDER BY r.source), '')) FROM imports r;

DO $$
DECLARE
    changed text;
BEGIN
    SELECT string_agg(format('%s (%s rows before, %s after)', b.t, b.n, coalesce(a.n::text, 'none')), ', ')
      INTO changed
      FROM academy_002_before b
      LEFT JOIN academy_002_after a ON a.t = b.t
     WHERE a.n IS DISTINCT FROM b.n OR a.fp IS DISTINCT FROM b.fp;
    IF changed IS NOT NULL THEN
        RAISE EXCEPTION '002_users: the study data did not come through unchanged: %', changed;
    END IF;

    IF EXISTS (SELECT 1 FROM srs_settings WHERE user_id <> 1)
        OR EXISTS (SELECT 1 FROM srs_progress WHERE user_id <> 1)
        OR EXISTS (SELECT 1 FROM srs_daily WHERE user_id <> 1)
        OR EXISTS (SELECT 1 FROM srs_log WHERE user_id <> 1)
        OR EXISTS (SELECT 1 FROM exam_attempts WHERE user_id <> 1)
        OR EXISTS (SELECT 1 FROM imports WHERE user_id <> 1) THEN
        RAISE EXCEPTION '002_users: a row did not go to the owner (user 1)';
    END IF;

    IF (SELECT count(*) FROM users) <> 1 OR NOT EXISTS (SELECT 1 FROM users WHERE id = 1) THEN
        RAISE EXCEPTION '002_users: users should hold exactly the owner (user 1)';
    END IF;
END $$;

-- end of 002
