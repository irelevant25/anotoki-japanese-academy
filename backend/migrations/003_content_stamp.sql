-- 003 — a cheap "has anything new been uploaded?" (2026-09-27)
--
-- A hosted site has no start to do the start-time work in: each request
-- compares the sizes and times of the content files and the migrations with
-- this stamp, and only when they differ looks further — new migrations, a
-- content rebuild (src/upkeep.php). Written with the content by content_sync().

ALTER TABLE content_state ADD COLUMN stamp text;

-- end of 003
