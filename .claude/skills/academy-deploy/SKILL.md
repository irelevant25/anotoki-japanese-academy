---
name: academy-deploy
description: Build and ship Japanese Academy as a website on the owner's FTP-only hosting (Apache, PHP 8, PostgreSQL, no shell or cron). Use for "build the upload", "deploy", "put it online", "update the website", "run the setup page on the site", "bring my data to the site", or anything about backend/public/ (index.php, .htaccess), backend/setup.php or backend/tools/build-dist.php.
---

# Shipping the website

The whole map is in `docs/kb/hosting.md`; sign-in in `docs/kb/sign-in.md`.
You can't upload anything yourself: the owner uploads by FTP/SFTP. Your part
is the build, the checks, and telling the owner exactly what to do.

## 1. Build and check

```bash
npm test                           # the site test builds and sets up a copy of the upload
npm run test:setup                 # the setup page in a browser, as a website's too
npm run build:dist                 # → dist/japanese-academy/ (builds the frontend first when needed)
npm run build:dist -- --no-audio   # an update when no clip changed
npm run build:dist -- --list       # only what would go in, as JSON
```

The build refuses to empty a folder that isn't an earlier build, leaves out
everything in `DIST_NEVER` (tests, tools, docs, books, the frontend's sources,
the owner's history, backups, `.env`, every `*.local.php`, `server.php`,
`manage.php` and `translations.php`), checks that what a site needs is there, and parses every PHP
file. Look at its last lines: the size and the upload map.

## 2. What the owner does, the first time

Tell them, in these words or plainer:

1. In the hosting panel: make a PostgreSQL database and a user that owns it,
   and point the site (e.g. `japanese.anotoki.eu`) at a folder, with the
   document root at that folder's `public/`. Where the panel cannot (their
   hosting serves a subdomain from `sub/<name>/` itself), the top-level
   `.htaccess` in docs/kb/hosting.md, *The first install*, does the same.
2. Upload everything in `dist/japanese-academy/` into that folder
   (`public/`, `backend/`, `data/`, `backups/`).
3. Open `https://japanese.anotoki.eu/setup.php`. Download
   `backend/config/setup-token.local.php` by FTP and paste the token from it:
   the page checks it at once, and only then fills in what is set already (on
   a site set up before) and lists the files in `backups/`.
4. Fill in the database and press its **Test connection**; then
   `https://iam.anotoki.eu` and `japanese-academy`, and that **Test
   connection**; the time zone; and, to bring their data, a backup file and
   their IAM user id (below). Press **Set up**. It deletes itself when done.
5. Sign in on the site. Only accounts with a role in `japanese-academy` at the
   IAM get in (the IAM's admin console gives roles).

The IAM must know the site first: client `japanese-academy` with redirect URI
`https://japanese.anotoki.eu/auth/callback`, post-logout
`https://japanese.anotoki.eu/` and web origin `https://japanese.anotoki.eu`.
(Until 2026-09-29 the redirect URI was `/auth/callback.html`: check the IAM's
registration says `/auth/callback` before the first sign-in on a site built
from this version.)

## 3. The owner's data

Their real data is on their home PC. There: update the repository, run
`start.ps1` — it opens the setup page, whose **Set up** applies migrations 002
and 003 after a raw copy of every table and keeps sign-in off (README,
*Updating from the version before*) — then `php backend/manage.php --backup`.
That file (or any daily backup, even one from before the update) goes into the
website's setup form, or, when it is bigger than the host accepts in a form,
into the site's `backups/` folder by FTP, to be chosen there (the list shows
once the token is in). The setup page
imports it into the IAM user id they give (only a user without study data
yet). If that id is not 1, they give the same id in the setup page at home (or
run `php backend/manage.php --owner-id=N` there), so both copies agree.

The site has no restore. To import later: delete
`backend/storage/installed.lock` on the host, upload `backend/setup.php`
again, and run it once more.

## 4. Updates

`npm run build:dist` (or `-- --no-audio`), and the owner uploads it over the old
files. Nothing on the host is lost: the build has no `backend/config/*.local.php`,
and `backend/storage/` and `backups/` hold only their `.htaccess`. The first
request afterwards applies new migrations (after a raw copy in `backups/`) and
rebuilds the study content if it changed. `backend/setup.php` can be left out;
uploaded, it only removes itself. Mention that a paper started just before
can't be submitted after a content change.

A migration that changes data must carry its `DO $$ … $$` check: on the site
nobody watches it run. Every migration ends with `-- end of NNN`; until that
line is there (a file still uploading), the site leaves it, and the ones after
it, pending. One that fails makes every request answer 503 until a fixed file
is uploaded (the host's error log says why); the raw copy is taken once per
upload, not per try.

Run again on purpose (the lock deleted), the setup page takes the same raw
copy before it applies anything new.

**The app's words.** The update that brings migration 004 (English and
Slovak, the Translations and Languages pages) changes no study table: the
first request after the upload applies it under the upkeep lock, after the
raw copy. While it is still arriving the bundle of words answers 503
`not_up_to_date` and a page that starts shows "The database is not up to date
with the uploaded version of the app yet"; a reload once the upload is whole
shows the app. Tell the owner:

- the owner's pages are for the `ADMIN` role (the account menu's
  *Translations* link); `MEMBER`s study only;
- the site keeps its own strings, apart from their computer's: a string
  reworded in one copy reaches the other only by the Translations page's
  export and import (or `php backend/translations.php --import` on the
  computer). Later migrations leave reworded strings alone, but before an
  upload that changes strings, export the site's languages all the same;
- a new language added on the Languages page starts hidden until its box is
  ticked; English cannot be hidden or deleted, Slovak cannot be deleted.

On their own computer the same migration is applied by the next start, after
a raw copy of every table — or by the setup page run again with their
database's name, which takes the copy first too.

## 5. When something is wrong

The table at the end of `docs/kb/hosting.md` (500 after upload, 401 while
signed in, "Sign in again", "not set up yet" or 503 "could not be brought up
to date", a migration that never applies, 403 "Sign-in is off here", 404 for
`/api` or for a page's address on reload, keys on a page instead of words). The host's PHP error log has the
details a website's answers leave out.

## Never

- upload or copy `backend/config/*.local.php`, `src/config.local.php`, `.env`,
  `backups/` files or `books/` anywhere, or put a password or token into a
  message;
- set auth mode `none` on a website (its setup page doesn't offer it, and its
  addresses with data would answer 403 anyway);
- touch the owner's database, or run a setup page against it from here.
