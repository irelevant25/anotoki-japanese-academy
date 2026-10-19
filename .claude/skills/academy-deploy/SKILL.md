---
name: academy-deploy
description: Build and ship Japanese Academy as a website on the owner's FTP-only hosting (Apache, PHP 8, PostgreSQL, no shell or cron). Use for "build the upload", "deploy", "put it online", "update the website", "run the setup page on the site", "bring my data to the site", roll a release back, upload the audio clips, or anything about the release (anotoki-deploy, composer.json's extra["anotoki-deploy"]), backend/api/release.php, backend/setup.php or backend/tools/check-drafts.php.
---

# Shipping the website

The whole map is in `docs/kb/hosting.md`; sign-in in `docs/kb/sign-in.md`.
A release is built and put up by **anotoki-deploy** (the anotoki library's
deploy tool, the same for every site; this site's facts are in
`backend/composer.json`, `extra["anotoki-deploy"]`). Upload only with the
owner's go-ahead and their SFTP login for the session (`ANOTOKI_DEPLOY_SECRETS`
names the `secrets.json` that holds it, outside every repository, with the
pinned `hostkey.txt` beside it) - or tell the owner exactly what to run.

The site's folder on the host (`sub/japanese/`): `frontend/` (the built app,
`index.php`, `.htaccess`) and `backend/` (the code, the study content's
`data/`, `release.json`) - a release, each replaced whole - beside `config/`
(the `*.local.php` settings), `storage/` (backups, logs, the library's key, the
lock) and `content/audio/` (the clips), which no release writes, under the
switch: the folder's `.htaccess`, which sends every request into `frontend/`.

## 1. Build and check

From the repository's top folder (Git Bash's `php` is 7.4: `backend/tools/php.js`
finds a PHP 8.2+ - the host needs 8.2 too, since the anotoki library came in
on 2026-10-07):

```bash
node backend/tools/php.js backend/tests/run.php     # the site test builds a release and sets a copy of it up
node frontend/scripts/ensure-build.mjs && node frontend/e2e/setup.js   # the setup page in a browser, as a website's too
cd frontend && bun run anotoki-deploy build          # backend/tools/check-drafts.php, the frontend (ensure-build),
                                                     # then the release -> ../dist/frontend/ and ../dist/backend/
```

(`@anotoki/deploy`: a dev dependency of `frontend/`, from anotoki-lib's release.
`bun run` finds it whichever tool installed `node_modules/`; on Windows, `npx`
misses bun's links.) The build refuses, naming the file, while a migration is a
draft (no "-- end of NNN" line yet; `ACADEMY_ALLOW_DRAFT=NAMES` is for the tests
alone - test_build() in backend/tests/lib.php). A release holds `backend/`'s
`include` list (composer.json) and never a `*.local.php`, tests, tools,
`backend/data/source/`, the clips, `router.php`, `manage.php` or
`translations.php`. The clips are content beside the release:
`bun run anotoki-deploy content audio [--go]` adds what is missing, and never
deletes.

## 2. What the owner does, the first time

Tell them, in these words or plainer:

1. In the hosting panel: make a PostgreSQL database and a user that owns it,
   and the site (e.g. `japanese.anotoki.eu`), served from its own folder.
2. `bun run anotoki-deploy deploy --backups <folder> --go`,
   `bun run anotoki-deploy content audio --go` (the clips), then
   `bun run anotoki-deploy switch --go` once: the folder's `.htaccess` becomes
   the switch into `frontend/`.
3. Open `https://japanese.anotoki.eu/setup.php`. Download
   `config/setup-token.local.php` by SFTP and paste the token from it:
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
the IAM is 1, on their computer and at `iam.anotoki.eu` alike. The app's own
JSON copies do not restore on the site; one restores on a computer (`php backend/manage.php
--restore=FILE`; version-1 files are no longer read). The library's backups
of the whole database (since anotoki-lib 0.4.0) restore on the site, on the
admin panel's Backups page: the last 14 daily, 5 before an update, 5 before
a restore, and the ones made with Back up now until the owner deletes them
there - none for its age (their decision of 2026-10-11). Since anotoki-lib
0.5.0 only a backup this installation sealed restores there; a plain one
made before 0.5.0 restores offline alone (`docs/kb/hosting.md`, *Logs and
backups on the site*).

## 4. Updates

`bun run anotoki-deploy deploy --backups <folder> --go`: the live `frontend/`
and `backend/` copied home, the release up beside them, checked, swapped in, the
site checked; `bun run anotoki-deploy rollback --go` brings the release before
back (clean only until an Apply). New clips first: `bun run anotoki-deploy
content audio --go` before the release whose `audio.json` names them. Nothing on
the host is lost: `config/`, `storage/` and `content/` are never in a release. A
new migration then waits for the owner (an `ADMIN`): until they press **Apply
pending** on the admin panel's Migrations page (`/admin/migrations`; a raw copy
in `storage/backups/` first), the pages show the anotoki library's "The site is
being updated" (with a quiet **Sign in**, which is how a signed-out `ADMIN` gets
in), and an `ADMIN` reads "A database update is waiting" with the way to the
Migrations page. Tell them so. The first request after it rebuilds the study
content if it changed. Each release brings `backend/setup.php`; opened on an
installed site it only removes itself. Mention that a paper started just
before can't be submitted after a content change.

**The move to the release layout (2026-10-19), once.** Until then the site
ran `public/` and `backend/` with the state inside `backend/`. Under a short
maintenance switch, rename on the host: `backend/storage` → `storage` (it
carries `anotoki-lib.key`, the backups' seal: move it, never recreate it),
`backend/config/*.local.php` → `config/`, `backend/data/audio` →
`content/audio`; then `deploy --go` (the old `backend/` becomes
`backend.old/`) and `switch --go` (the switch into `frontend/` instead of
`public/`, the one before kept as `.htaccess.flat`). The old `public/` is
deleted once the site runs well.

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
the site*: the optional `app.local.php` with the limits - Cloudflare's ranges
are the trusted proxies by default since anotoki-lib 0.5.0, `[]` there for a
host that is not behind Cloudflare -, the one check of
`X-Visitor-Key` on the host, and the one check that a signed-in save with
the switch off reaches the account - a host that drops `Authorization` makes
it a visitor's). The order against IAM 010 does not matter.

A migration that changes data must carry its `DO $$ … $$` check: on the site
nobody watches it run. Every migration ends with `-- end of NNN`; until that
line is there (a file still uploading), the site leaves it, and the ones after
it, pending (a "draft" on the Migrations page). Never upload while the
newest migration is a draft (008, 009 and 010 are final since 2026-10-11:
008 and 009 go up together, 010 with the library's files of anotoki-lib
0.4; 011 is final since 2026-10-18 and goes up with the library's files of
0.6): the site would wait on it, and its study content with it —
the build refuses then, and names it (`backend/tools/check-drafts.php`). One that fails on Apply is rolled back
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
  `ADMIN` (also keeps the languages, the people, reads the feedback and the
  error and audit logs, keeps the backups, and applies the database's
  migrations on the Migrations page); everybody else studies;
- the site keeps its own strings, apart from their computer's: a string
  reworded in one copy reaches the other only by the Translations page's
  export and import (or `php backend/translations.php --import` on the
  computer). Later migrations leave reworded strings alone, but before an
  upload that changes strings, export the site's languages all the same;
- a new language added on the Languages page starts hidden until its box is
  ticked; English cannot be hidden or deleted, Slovak cannot be deleted.

**The update that brings anotoki-lib 0.4.1** (the library's sign-in, People,
the admin tools): one Apply runs the library's `anotoki_admin` 001-002,
this app's 010, the library's `anotoki_translations` 003-004 and
`anotoki_people` 001 (after the raw copy and the library's first backup);
upload `backend/vendor/` first. Tell the owner: nobody is signed out by it;
a failed sign-in shows a page that says why (Try again, Back); **Send
feedback** at the foot of every page sends no mail - the Feedback link in
the admin panel counts the new ones; the error log, the audit log and the
backups are on the admin panel (ADMIN only); the backups rotate (14 daily,
5 before an update, 5 before a restore) and the ones made by hand stay
until they delete them, so watch the host's disk quota; a restore brings
back data deleted on the People page since - delete it there again (until
0.5.0, below, which does it by itself); a deleted anotoki account
is blanked here within the hour of a page being opened, its study kept;
`backend/src/anotoki_iam.php` left on the host is unused (delete it by FTP
whenever they like); nothing already in `backend/storage/` was deleted
(`docs/kb/hosting.md`).

**The update that brings anotoki-lib 0.5** (PHP 0.5.1, Angular 0.5.0 - never
0.5.0's PHP alone: its restore of a database that ever had a visitor fails):
no migration of its own (on a site with the 0.4.1 update applied, nothing to
Apply); upload `backend/vendor/` first; the host's PHP needs `mbstring` and
`zlib`. Tell
the owner: **make a backup on the Backups page right after it** - only a
backup the site sealed restores there now, and the plain ones made before
have no seal (listed "not made here", downloaded as before, restored
offline, which does none of the deletes again: `docs/kb/hosting.md`); a
restore on the page now does again what was deleted on the People page (and
feedback deleted) since its backup, by itself; the pages' own errors land on
the Errors page; behind Cloudflare the visitors' real addresses are counted
(Cloudflare's ranges are trusted by default - a host not behind it puts
`'client_address' => ['trusted_proxies' => []]` in `app.local.php`, and an
`app.local.php` that lists Cloudflare's ranges by hand, as the old advice
had it, should lose its `client_address`: its list replaces the committed
one whole; a `client_ip_header` there is read no more - the code pins
Cloudflare's header - and a range wider than /8 or /16 is refused).

**The update that brings anotoki-lib PHP 0.5.2** (Angular still 0.5.0; no
migration): the origin secret. First the Cloudflare zone's Transform Rule
(Rules → Transform Rules → Modify Request Header → "Set static"
`X-Anotoki-Origin` to the secret, every request of the zone - a site without
the secret pays it no heed), then `backend/config/cloudflare.local.php` on the
site by FTP (`<?php return ['origin_secret' => '<the same value>'];` - a long
random value, 32+ characters, the same file in every anotoki site; the setup
page never asks for, writes or shows it, the build never carries it): from then on
`CF-Connecting-IP` is believed only on a request carrying the secret. Never
print it; without the file the site works as before (`docs/kb/hosting.md`,
*The origin secret*).

**The update that brings anotoki-lib 0.6.2** (both halves): not before the
owner has accepted migration 011 (its last line written: the build refuses
a draft). Upload `backend/vendor/` first, then the rest; one Apply on the
Migrations page right after it - 011 (the legal pages' words, the questions'
and notices' titles and buttons, rewordings only where nobody changed a
string) and the library's `anotoki_translations/005_…` to `011_…` -, or
Terms, Privacy and Contact show the app's parts as keys until it is
applied. Tell the owner: Terms · Privacy · Contact are at the foot of every
page, anybody's - the hosting company stands there as "to be named" until
they name it (`legal/legal-facts.ts`, `processors`); every settings file is
read cleanly or not at all now - a file saved with a byte-order mark or a
line before its `<?php` makes the site "not set up" (a required one) instead
of printing what it holds, and a `cloudflare.local.php` that cannot be read
cleanly counts as a secret nobody carries (every request from Cloudflare its
edge) until mended; PHP's error log names the file once a day, never its
text (`docs/kb/hosting.md`).

**The update that brings anotoki-lib 0.6.3** (both halves; the app's
0.5.1; migration 012 final since 2026-10-18, the owner's go). Upload `backend/vendor/` first, then
the rest; one Apply on the Migrations page right after it - 012 (the three
words only the app's old foot read go) and the library's
`anotoki_translations/012_…` (the footer's four words; until it is applied
the footer says the library's built-in words, the same English and Slovak).
Tell the owner: the foot of every page and of the admin panel is the
family's footer now ("Version 0.5.1 · What's new · Feedback", Terms ·
Privacy · Contact, a line above) - the dot beside What's new is gone; the
page shown while an update waits (so right after the upload, until the
Apply) stands alone, without the bar or the footer; and a
`cloudflare.local.php` that names no usable secret (blank, a misspelt key)
now fails closed like a broken one - only deleting the file switches the
secret off; PHP's error log says "holds no origin_secret" once a day if the
site's file does not name its secret.

**The update that brings anotoki-lib 0.8.0** (both halves; no migration of
the app's). Upload `backend/vendor/` first, then the rest; one Apply on the
Migrations page right after it - the library's
`anotoki_translations/013_…` (the About and Support pages' words, the
footer's two links and the feedback form's Clear; until it is applied they
say the library's built-in words, the same English and Slovak). Tell the
owner: About · Support stand first among the footer's links, the family's
pages at `/about` and `/support`, anybody's; the feedback form keeps what
was typed until it is sent, with Clear.

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
