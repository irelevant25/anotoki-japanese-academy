---
name: academy-deploy
description: Build and ship Japanese Academy as a website on the owner's FTP-only hosting (Apache, PHP 8, PostgreSQL, no shell or cron). Use for "build the upload", "deploy", "put it online", "update the website", "run the setup page on the site", "bring my data to the site", or anything about backend/public/ (index.php, .htaccess), backend/setup.php or backend/tools/build-dist.php.
---

# Shipping the website

The whole map is in `docs/kb/hosting.md`; sign-in in `docs/kb/sign-in.md`.
You can't upload anything yourself: the owner uploads by FTP/SFTP. Your part
is the build, the checks, and telling the owner exactly what to do.

## 1. Build and check

From the repository's top folder (Git Bash's `php` is 7.4: `backend/tools/php.js`
finds a PHP 8.2+ - the host needs 8.2 too, since the anotoki library came in
on 2026-10-07):

```bash
node backend/tools/php.js backend/tests/run.php     # the site test builds and sets up a copy of the upload
node frontend/scripts/ensure-build.mjs && node frontend/e2e/setup.js   # the setup page in a browser, as a website's too
node backend/tools/php.js backend/tools/build-dist.php              # → dist/japanese-academy/ (builds the frontend first when needed)
node backend/tools/php.js backend/tools/build-dist.php --no-audio   # an update when no clip changed
node backend/tools/php.js backend/tools/build-dist.php --list       # only what would go in, as JSON
# (all three refuse, naming the file, while a migration is a draft: no "-- end of NNN" line yet;
#  --allow-draft=NAMES is for the tests alone - test_build() in backend/tests/lib.php)
```

The build refuses to empty a folder that isn't an earlier build, leaves out
everything in `DIST_NEVER` (anything beside `public/` and `backend/`, tests,
tools, `backend/data/source/`, backups, `.env`, every `*.local.php`,
`router.php`, `manage.php` and `translations.php`), checks that what a site
needs is there, and parses every PHP file. Look at its last lines: the size
and the upload map.

## 2. What the owner does, the first time

Tell them, in these words or plainer:

1. In the hosting panel: make a PostgreSQL database and a user that owns it,
   and point the site (e.g. `japanese.anotoki.eu`) at a folder, with the
   document root at that folder's `public/`. Where the panel cannot (their
   hosting serves a subdomain from `sub/<name>/` itself), the top-level
   `.htaccess` in docs/kb/hosting.md, *The first install*, does the same.
2. Upload everything in `dist/japanese-academy/` into that folder
   (`public/` and `backend/`, which holds the study content in `data/` and an
   empty `storage/` for the backups).
3. Open `https://japanese.anotoki.eu/setup.php`. Download
   `backend/config/setup-token.local.php` by FTP and paste the token from it:
   the page checks it at once. It never shows what is saved, before the token
   or after.
4. Fill in the database (`anotoki_japanese` and 5432 are filled in) and press
   its **Test connection** (the anotoki family's words: what **Save** would
   do); then `https://iam.anotoki.eu` and `japanese-academy`, and that **Test
   connection**. Nothing else: no time zone, no owner id, no backup. Press
   **Save**. It deletes itself when done.
5. Sign in on the site. With IAM migration 007 every account gets in; before
   it, only accounts with a role in `japanese-academy` (the IAM's admin console
   gives roles). This release must be live before 007 is applied: the earlier
   one refuses a token with no role.

The IAM must know the site first: client `japanese-academy` with redirect URI
`https://japanese.anotoki.eu/auth/callback`, post-logout
`https://japanese.anotoki.eu/` and web origin `https://japanese.anotoki.eu`.
(Until 2026-09-29 the redirect URI was `/auth/callback.html`: check the IAM's
registration says `/auth/callback` before the first sign-in on a site built
from this version.)

## 3. The owner's data

The setup page imports nobody's data any more: each person brings their own,
in the app (`GET` and `PUT /api/me/data`: their own file replaces their data there, after a copy; the page for it comes with the frontend's change). A file is limited to a 24th of PHP's `memory_limit` (16 MiB at most; 413 `too_large` with the limit). The owner's id at
the IAM is 1, on their computer and at `iam.anotoki.eu` alike. The site has
no restore; a backup restores on a computer (`php backend/manage.php
--restore=FILE`; version-1 files are no longer read).

## 4. Updates

Build (or with `--no-audio`), and the owner uploads it over the old
files. Nothing on the host is lost: the build has no `backend/config/*.local.php`,
and `backend/storage/` holds only its `.htaccess`. A new migration then
waits for the owner (an `ADMIN`): until they press **Apply pending** on the
admin panel's Migrations page (`/admin/migrations`; a raw copy in
`backend/storage/backups/` first), the pages show the anotoki library's
"The site is being updated" (with a quiet **Sign in**, which is how a
signed-out `ADMIN` gets in), and an `ADMIN` reads "A database update is
waiting" with the way to the Migrations page. Tell them so. The first
request after it rebuilds the study content if it changed.
`backend/setup.php` can be left out;
uploaded, it only removes itself. Mention that a paper started just before
can't be submitted after a content change.

**The first update after 2026-10-04 (the folders move).** A site set up
before has `data/` and `backups/` beside `public/` and `backend/`; this
version reads `backend/data/` and writes `backend/storage/backups/`. Give the
owner these steps, in this order (`docs/kb/hosting.md`, *The one-time move*):

1. Upload the build made with `--no-audio`: it carries the content files
   (`backend/data/*.json`, the hand-written items), so the new code finds
   them at once; only the clips are missing for the next minutes.
2. On the server (FTP client, a server-side move): `data/audio/` →
   `backend/data/audio/`.
3. Every file of `backups/` → `backend/storage/backups/`, the dotfile
   `.before-migration.json` included (show hidden files; download a copy
   first; count them after; a same-named file already in the new folder is
   newer: keep it).
4. Delete the root `data/` and `backups/`.
5. Open the site, sign in, check the home page and an answer.

Then, and only then, IAM migration 007.

**The update that brings visitors (migration 007, 2026-10-05).** After the
upload, the owner applies **006 and 007** on the Migrations page (006 too, if
the site has not got it yet: the page lists what waits, in order). 007 adds
the visitors' columns and their words and changes no row of anybody's. The
site still requires sign-in afterwards: only when IAM migration 010 is live
there **and** the owner unticks "Sign-in required" for Japanese Academy in the
IAM may people study without signing in (`docs/kb/hosting.md`, *Visitors on
the site*: the optional `app.local.php` with the limits, Cloudflare's ranges
in `trusted_proxies` when the site is behind its proxy, the one check of
`X-Visitor-Key` on the host, and the one check that a signed-in save with
the switch off reaches the account - a host that drops `Authorization` makes
it a visitor's). The order against IAM 010 does not matter.

A migration that changes data must carry its `DO $$ … $$` check: on the site
nobody watches it run. Every migration ends with `-- end of NNN`; until that
line is there (a file still uploading), the site leaves it, and the ones after
it, pending (a "draft" on the Migrations page). Never upload while the
newest migration is a draft (009 is one now, until the owner writes its
last line; 008 is final since 2026-10-11 and goes up with it): the site would wait on it, and its study content with it —
`build-dist.php` refuses to build then, and names it. One that fails on Apply is rolled back
whole and named ("Stopped at …", and why in PostgreSQL's own words under it;
the host's error log has it too), the ones
before it stay applied, and the site keeps waiting until a fixed file is
uploaded and applied; the raw copy is taken once per upload, not per try.

Run again on purpose (the lock deleted), the setup page takes the same raw
copy before it applies anything new.

**The app's words.** The update that brings migration 004 (English and
Slovak, the Translations and Languages pages) changes no study table: it is
applied like any other, by the Migrations page's Apply, after the raw copy.
While it is still arriving the bundle of words answers 503
`translations_unavailable` (the anotoki library's answer; `not_up_to_date`
before 0.3.0) and a page that starts shows "The database is not up to date
with this version of the app yet". The update that brings anotoki-lib 0.3.0's
words brings 008, 009 and the library's two files
(`anotoki_translations/001_…`, `002_…`) for one Apply: 009 copies the site's
words for the top bar and the switches - its own rewordings, every language -
under the library's keys first, so the bar says what it said; export every
language on the Translations page before uploading all the same (after 009 such
a file imports only with the nineteen moved keys renamed and the sixteen
deleted ones left out: `unknown_key` refuses all of it otherwise). Check first
that the website's database is UTF-8 (`SHOW server_encoding` = `UTF8`: the
library's 001 stops on any other), and upload `backend/vendor/` before the
rest (the new code needs the library's classes). Tell the owner:

- the admin panel is for the IAM roles `EDITOR` (rewords the strings) and
  `ADMIN` (also keeps the languages, the people, and applies the database's
  migrations on the Migrations page); everybody else studies;
- the site keeps its own strings, apart from their computer's: a string
  reworded in one copy reaches the other only by the Translations page's
  export and import (or `php backend/translations.php --import` on the
  computer). Later migrations leave reworded strings alone, but before an
  upload that changes strings, export the site's languages all the same;
- a new language added on the Languages page starts hidden until its box is
  ticked; English cannot be hidden or deleted, Slovak cannot be deleted.

On their own computer the same migration waits for their Apply on the
Migrations page after they pull it (no restart: `composer start` does nothing
at start), after a raw copy of every table — or `manage.php --sync`, or the
setup page run again with their database's name, which take the copy first
too.

## 5. When something is wrong

The table at the end of `docs/kb/hosting.md` (500 after upload, 401 while
signed in, "Sign in again", "This site is not set up yet", "The site is not
available right now", "The site is being updated" (a migration
waiting for Apply), Apply "Stopped at …", a migration listed as a "draft", "not set up" for a copy of the
sign-in mode `none`, 404 for
`/api` or for a page's address on reload, keys on a page instead of words). The host's PHP error log has the
details a website's answers leave out.

## Never

- upload or copy `backend/config/*.local.php`, `src/config.local.php`,
  `backend/.env`, `backend/storage/backups/` files or `books/` anywhere, or put
  a password or token into a message;
- bring back a way to use the app without the IAM (the owner's decision of
  2026-10-04);
- touch the owner's database, or run a setup page against it from here.
