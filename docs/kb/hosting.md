# Hosting: Japanese Academy as a website

The owner's shared hosting runs Apache, PHP 8.x and PostgreSQL, and allows
**no shell, no cron and no long-running process**: files go up by FTP or SFTP,
and PHP runs once per request. Everything here is built for that. The site is
meant for `https://ja.anotoki.eu`, with sign-in through the anotoki IAM
([sign-in.md](sign-in.md)).

## How the same app runs under Apache

| On this computer | On a hosted site |
|---|---|
| `php backend/server.php`: PHP's built-in server, `server.php` as its router | Apache, the site's document root at `public/` (the built app, `index.php`, `.htaccess`): `.htaccess` sends `/api`, `/audio`, `/report` and `/setup.php` to `index.php`, and serves the app's files itself |
| both hand the request to the same front controller, `backend/api/front.php`, and the same Slim app | |
| the start-time work when the server starts: migrations, content rebuild, the day's backup | the same work, lazily: the first request after an upload applies new migrations (a raw copy of every table first) and rebuilds the study content (`backend/src/upkeep.php`); the day's first page load takes the day's backup |
| auth mode `none` (the owner's computer), or `iam` for a developer | auth mode `iam`: the setup page writes it, and offers nothing else |
| the setup page without a token (this computer) | the setup page with a token, which deletes itself when done |
| Composer's packages from `backend/vendor/` (committed) | the same folder, uploaded: there is no shell to install them |

The cheap part of the lazy work runs on every request: a stamp of the names,
sizes and times of the content files and the migrations, compared with the one
stored in `content_state.stamp` (migration 003). Only when they differ does a
request look further, under a PostgreSQL advisory lock, so two requests never
do the work twice. The stamp is taken before anything is read and stored with
what was done, so a file that lands while the work goes on leaves the stored
stamp behind the files, and the next request looks again. Once it has work
to do, the request asks for five minutes (`set_time_limit(300)`, where the
host allows it) and to finish even if the browser leaves
(`ignore_user_abort()`): cut off, the work would roll back and start again. A
site that was never set up answers 503 `{"code": "not_set_up"}` (the app shows
its "not set up yet" page, pointing at `/setup.php`) instead of being set up by
a passing request. Without its settings the site says so at once; with them
but with its database missing or without tables, `/api/auth/config` still
answers (it needs the settings only), so the app starts — on a website with
its Sign in page — and the first address with data answers `not_set_up`, which
puts up the same page.

**Every migration ends with the line `-- end of NNN`**, its own number
(`001_init.sql`, from before the rule, is exempt). An FTP upload writes a
file bit by bit, and a request could read half of one; without its last line
a migration is taken to be still arriving, and it waits, with every one after
it (`db_migration_sql()` in `backend/src/db.php`). The rest of the upload
changes the stamp, and a request then applies it.

The raw copy of every table is taken once per upload: a migration that fails
rolls back, every request answers 503 "The database could not be brought up
to date with the upload" (the details go to the error log), and each tries it
again, without another full copy each time. `backups/.before-migration.json`
notes the stamp and the pending migrations the last copy was taken with;
while both are the same, the tries are of the same files on the same tables
(nobody can study while a migration fails), and the copy is still what the
tables hold. Another upload — the fixed file, or the failing one taken out and
put back after the site was used — changes the stamp and gets a copy of its
own.

`public/.htaccess` (its source is `backend/public/.htaccess`):

- `CGIPassAuth On` (Apache 2.4.13+, inside `<IfModule mod_version.c>`) and
  `SetEnvIf Authorization …`: PHP under CGI or FastCGI does not see the
  `Authorization` header otherwise, and the sign-in token travels in it.
  Checked with a real Apache 2.4 and PHP over FastCGI: either line alone gets
  the token through; without both, every request is signed out.
- the rewrites: the backend's addresses (`/api`, `/audio`, `/report`,
  `/setup.php`) to `index.php`; a file of the app as it is; an address without
  a file extension (a page of the app, `/kanji/reviews`) to `index.html`,
  whose router draws it; anything else a 404.
- `X-Content-Type-Options: nosniff`; `index.html` asked for again each time
  (`no-cache`), and the build's hashed scripts and styles (`main-4GHK3Z7Q.js`)
  cached for a year, since they never change under that name. PHP's own
  server (`backend/api/front.php`) keeps the same rule, and the tests' router
  (`backend/tests/tools/front-controller.php`) sends these headers as Apache
  would, and refuses `.ht*` files as Apache's own configuration does.

It sets no `DirectoryIndex` and no `Options`: a host that does not allow those
in `.htaccess` would answer 500 for the whole site.

On a hosted site, errors reach the browser as a sentence only (the error log
has the details: a database error names the user and the host), and
`/api/health` leaves out the database's name, the backup folder and the owner.

## The build — `npm run build:dist`

`php backend/tools/build-dist.php` assembles exactly what to upload, in
`dist/japanese-academy/` (gitignored). It builds the frontend first when its
sources changed (`frontend/scripts/ensure-build.mjs`; `--frontend=DIR` takes
an app built elsewhere instead).

| Folder | What | On the host |
|---|---|---|
| `public/` | the built Angular app, `index.php` (the front controller) and `.htaccess` | **the document root**: point the (sub)domain here |
| `backend/` | `api/`, `src/`, `migrations/`, `vendor/`, `config/config.php` (no `*.local.php`), `setup.php`, `composer.json`/`.lock`, and an empty `storage/` for the IAM's keys and the setup page's lock (writable by PHP) | beside `public/` |
| `data/` | what the study content is built from (the `data/` files of `CONTENT_FILES`), and the clips `data/audio/*.mp3` | beside `public/` |
| `backups/` | empty: the daily copies go here | beside `public/`, writable by PHP |

`backend/`, `backend/storage/`, `data/` and `backups/` each get a `.htaccess`
that refuses every request, in case the document root ends up above `public/`
after all. Left out: the tests and tools, `backend/server.php` and
`backend/manage.php` (they need a shell), `backend/public/` (it became
`public/`), the frontend's sources, `docs/`, `books/`, `progress/`,
`results/`, `reports/`, backups, `.env`, every `*.local.php`,
`node_modules/`, `.claude/`, the launchers, `data/source/`,
`grammar-index.json`. The build checks the result against that list again,
checks that what a site needs is there, and parses every PHP file.

- `--no-audio` leaves out `data/audio/`: for an update when no clip changed
  (an upload never deletes the clips already on the host).
- `--list` prints what would go in, copying nothing.
- `--out=DIR` builds elsewhere; DIR is emptied only if it is empty or an
  earlier build.

## The first install

1. In the hosting panel, make a PostgreSQL database and a user that owns it.
2. `npm run build:dist`, then upload `dist/japanese-academy/` into the site's
   folder, and set the site's document root to its `public/`.
3. Open `https://ja.anotoki.eu/setup.php`. It writes a random token into
   `backend/config/setup-token.local.php`; download that file by FTP and paste
   the token into the form. (Nobody without FTP access to the server can read
   it: that is how the setup page knows it is the owner. The page never shows
   it.) Pasted, the token is checked at once (its **Check** button, pressed by
   itself; so it is when the field is left, and Enter in the field presses it
   rather than send the form; spaces around the token don't count); once it is
   right, the page fills in what is set already — on a site set up before —
   and lists the files in `backups/`. Until then it shows none of it: anybody
   can open the page. The token file is written aside and renamed, and a form
   without the token never passes, whatever the file holds.
4. Fill in the database, and press its **Test connection**: it says whether it
   connects and what the database holds. Then the IAM's address
   (`https://iam.anotoki.eu`) and the client id (`japanese-academy`), and its
   **Test connection**: the IAM's discovery document must name that address,
   and its keys must be readable from the server. The buttons send the form's
   fields with the token, and change nothing.
5. The time zone (the browser fills in its own; review times and days follow
   it, for everybody), and your IAM user id (the IAM's admin console lists it
   under Users; the owner's is usually 1).
6. Optionally, your data: a backup file from your computer (below), sent with
   the form, or — when it is bigger than the host accepts in a form — put in
   the site's `backups/` folder by FTP first and chosen from the list (it
   shows once the token is in). It goes into that user id, which must have no
   study data yet.
7. **Set up**. It connects (and makes the database only if it is missing and
   the user may), writes `backend/config/database.local.php`,
   `auth.local.php` (`mode iam`, the issuer, the client id) and
   `app.local.php` (readable by their owner only), applies the migrations,
   builds the study content (a few seconds), imports the backup, checks that
   the server can fetch the IAM's keys, writes
   `backend/storage/installed.lock`, and deletes the token file and itself.

With the lock there, the setup page refuses to run again (and removes itself
if it was uploaded again). To run it on purpose — say, to import a backup
after all — delete `backend/storage/installed.lock` and upload
`backend/setup.php` again; its settings fill in once the token is in (the
password stays as saved when left empty). Run again on a site in use, it
takes the same raw copy of every table as a request would before it applies
any new migration, and it stops (to be sent again) while a migration is not
whole yet. A request that names a host other than 127.0.0.1 or localhost
always gets this way, even under PHP's built-in server.

## Updates

`npm run build:dist` (or `-- --no-audio`) and upload over the old files. The
upload never touches `backend/config/*.local.php`, `backend/storage/` or
`backups/` on the host, which the build doesn't contain. The first request
afterwards applies new migrations (after a raw copy of every table in
`backups/`) and rebuilds the study content if `data/` or its builders changed.
`backend/setup.php` may be left out of an update; uploaded, it only removes
itself.

Mid-upload, a request can see new code with old files or the other way round;
it fails, and a later one does the work once everything is there. A migration
that is only half there waits for its last line (above). A paper started
before the content changed can't be submitted afterwards (409), as on this
computer after a restart. A browser that still has the old app open loads the
new one at its next page load (`index.html` is never cached).

## Moving the owner's data to the site

The owner's real data is in their computer's database. There:

1. Update the repository and run `start.ps1`: it opens the setup page, which
   takes a raw copy of every table, applies migrations 002 and 003 (the data
   becomes user 1's) and keeps auth mode `none` (README, *Updating from the
   version before*).
2. `php backend/manage.php --backup` writes `backups/academy-manual-<time>.json`.
   (A daily backup from before the update, format version 1, works as well.)
3. Give that file to the website's setup page (step 6 above), with the owner's
   IAM user id at `iam.anotoki.eu`.

If the owner's id at the hosted IAM is not 1, give the same id in the setup
page on the computer (or run `php backend/manage.php --owner-id=N` there), so
both copies agree.

## Backups on the site

The same files as on this computer, in the site's `backups/`: the day's copy
(of everybody's data, taken at the first page load of a day; the last 14
kept), one before somebody's reset (of that person's data alone,
`academy-before-reset-user-<id>-<time>.json`; their last 14 kept), and a raw
copy before a migration. Download them by FTP now and then: they are the only
copy outside the host's database. There is no restore on the site; a backup
restores on a computer with `php backend/manage.php --restore=FILE`, or goes
back to the site through the setup page's import (one person at a time).

## If something is wrong

| Symptom | Likely cause |
|---|---|
| 500 for every address right after the upload | the host does not allow `CGIPassAuth` in `.htaccess`: delete that `<IfModule mod_version.c>` block (the `SetEnvIf` line is the fallback) |
| every API request is 401 while signed in | the `Authorization` header does not reach PHP: the host dropped both `.htaccess` lines |
| "Sign in again" right after signing in | the server cannot fetch the IAM's keys (outbound HTTPS blocked?), or the issuer or client id in `backend/config/auth.local.php` is not the IAM's |
| the app says "not set up yet" at once | the setup page has not run: `backend/config/*.local.php` are missing |
| the app says "not set up yet" after the Sign in page, at the first screen with data | the settings are there, but the database they name is missing or has no tables (made again in the panel, say): run the setup page again |
| 503 "could not be brought up to date with the upload" | a new migration fails: the error log names it and says why (`[upkeep] a migration failed: backend/migrations/NNN_….sql: …`). Every request tries it again; upload the fixed file |
| a new migration is not applied, and nothing says why | its last line, `-- end of NNN`, is missing: it is taken to be still uploading |
| the API answers 403 "Sign-in is off here" | `backend/config/auth.local.php` says auth mode `none`: a website needs `iam` |
| the app shows, `/api/...` answers 404 | `mod_rewrite` is off, or the document root is not `public/` |
| a page's address (`/kanji/reviews`) answers 404 on reload | `mod_rewrite` is off: the app's own addresses need the `index.html` rewrite |
