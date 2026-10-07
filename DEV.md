# Developing Japanese Academy

How to set up a computer to work on the app, run it while you change it, test
it, and build the website's upload. `README.md` is the owner's side (running
and using it); `backend/README.md` and `frontend/README.md` map each half;
`docs/kb/` is the reference for each area; `CLAUDE.md` holds the rules.

## The parts

| Part | Folder | What |
|---|---|---|
| Backend | `backend/` | PHP 8.2+, Slim 4, PostgreSQL, the anotoki library (`anotoki/lib`: the migrations). `router.php` runs it on this computer (PHP's built-in web server, `composer start`); on a website Apache runs `public/index.php`. Both go through `api/front.php` |
| Frontend | `frontend/` | Angular 21: standalone components, zoneless, signals. Built into `frontend/dist/japanese-academy/browser/`, which the backend serves |
| Data | `backend/data/` | what the study content is built from, and the audio clips |

The top folder holds only these, `docs/`, `.claude/` and the three guides:
no package of its own, no launcher. Every command below runs from the
repository's top folder unless it says `in backend/` or `in frontend/`.

One address serves both halves: the backend answers `/api/…`, `/audio/…`,
`/report/…` and `/setup.php`, and sends the built app for everything else (a
page's address without a file extension gets its `index.html`, and Angular's
router draws the page).

## What to install

- **PHP 8.2 or newer** with `pdo_pgsql`, `mbstring`, `intl`, `curl` and
  `openssl` (8.2 since the anotoki library came in). `composer start` runs
  the `php` first on PATH; put a PHP 8.2+ there for that window. For everything else, where an older `php` comes
  first (Git Bash's is 7.4 on the owner's computer),
  `node backend/tools/php.js <script> …` finds one that can run the app
  (`ACADEMY_PHP`, then every `php` on PATH, then the usual install folders).
  The tests start PHP's built-in server with OPcache off; if `composer start`
  ever misbehaves on Windows, run `php -d opcache.enable=0 -S localhost:8200
  router.php` in `backend/` instead (`docs/kb/environment.md` says why).
- **Composer** for `composer start`, and to change the backend's packages:
  `backend/vendor/` is committed, because a website has no shell to install
  them (the anotoki library among them: *The anotoki library* below).
- **PostgreSQL 13 or newer** (tested with 18). The user in your settings must
  be allowed to make databases (the tests make throwaway ones), and roles (the
  setup and website tests make a database user, as a hosting panel does).
- **Node.js** 20.19, 22.12, or 24 and newer (`frontend/.nvmrc` pins 22), with
  npm.
- **Edge or Chrome** for the browser suites (`BROWSER_PATH` points at another
  Chromium browser).

## The first time

```bash
node frontend/scripts/ensure-build.mjs   # installs the frontend's packages when needed (npm ci), builds the app
cd backend && composer start             # php -S localhost:8200 router.php → http://localhost:8200
```

Open http://localhost:8200/setup.php (or, with `ng serve` running,
http://localhost:4400/setup.php). It asks for two things: the database
(`anotoki_japanese` on port 5432 unless you name another; on a computer that
is not the owner's, never `anotoki_japanese_academy`, which is the owner's
study data on theirs) and the IAM (the development IAM,
`http://localhost:4300`, client `japanese-academy`: filled in). **Test
connection** says what **Save** would do. The settings land in
`backend/config/*.local.php` (gitignored): `database` and `auth`, and
**Save** builds the database's tables (every migration, the same engine as
the Migrations page). The app requires both; without them every address
but `/api/site-status` answers `503 {"code": "not_set_up"}` and the pages
show the anotoki library's "This site is not set up yet", with the way to
the setup page while the copy was never installed (a website's
`backend/storage/installed.lock` ends that). Settings that name a database
that is missing or does not answer: "The site is not available right now";
one with no tables yet: an update that waits for its **Apply** (below). A
copy set up by an earlier version keeps working (its sign-in mode, owner id
and time zone are not read); one set up without sign-in is "not set up"
until you save once more.

## Day to day

Two servers side by side, as on every anotoki site:

```bash
cd backend && composer start     # the backend on http://localhost:8200 (it serves the last build too)
cd frontend && npm start         # ng serve on http://localhost:4400, rebuilding as you save
```

Work at http://localhost:4400. Its dev server sends `/api`, `/audio`,
`/report` and `/setup.php` on to the backend (`frontend/proxy.conf.json`), so
the page, the API and the setup page share one address, as they do when the
backend serves the build.

Nothing happens when the backend starts (`backend/router.php`): the first
request after a change to `backend/data/` rebuilds the study content, and the
day's first page load takes the day's backup (`backend/src/upkeep.php`, as on
a website). A new migration is never applied by a request: once it is whole,
the site answers 503 `update_pending` to all but the few addresses the pages
need to start and sign in, and the pages show the anotoki library's "The site
is being updated" until an `ADMIN` applies it on the admin panel's
**Migrations** page (`/admin/migrations`: what is applied, what waits, each
file's SQL, and **Apply pending**, after a raw copy of every table) — the
library's page shows an `ADMIN` "A database update is waiting" and the way
there, and anybody signed out a quiet **Sign in**. Neither a change to the PHP
code nor one to the data needs a restart.
`node backend/tools/php.js backend/manage.php --check` says what is waiting,
and `--sync` does it from the command line (migrations included).

### Signing in against the development IAM

Signing in is the one way there is, here too: the app needs the IAM running.
The anotoki IAM runs next to this repository (`../anotoki-iam`; its
`DEV.md`): its API on 8100, its pages on http://localhost:4300. It
registers Japanese Academy for http://localhost:4400 by default, with the
redirect URI http://localhost:4400/auth/callback and `/` after sign-out, so
work at 4400 (the built app on 8200 has no sign-in address there).

1. Start the IAM, then this app's two servers (above).
2. The setup page (http://localhost:4400/setup.php) has the IAM filled in:
   `http://localhost:4300` and the client id `japanese-academy`; its **Test
   connection** fetches the IAM's discovery document and keys.
3. Open http://localhost:4400. Any page sends you to the IAM's sign-in and
   comes back to `/auth/callback`, then to the page you asked for. Every
   account may study; the roles `EDITOR` and `ADMIN` (given in the IAM's
   admin console) open the admin panel (`/admin`: **Admin panel** in the account
   menu). The browser names its time zone with every request (`X-Time-Zone`):
   to see another zone's days, start the browser in it (Chrome's DevTools,
   *Sensors*, *Location*; or `timezoneId` in Playwright).

The data of each person is their own (`docs/kb/sign-in.md`).

### The changelog

`frontend/public/changelog.json` lists the releases, newest first, each with
`added`, `updated` and `fixed` lines in plain words, for the person using the
app (they stay English in every language). The version at the foot of every
page is the newest entry's, and **What's new** beside it opens the list. Add an
entry with every release the owner will notice, and keep `version` in
`frontend/package.json` in step.

### The app's words

What a learner reads is not written in the templates: each word is a key,
with an English and an informal Slovak ("ty") string in the database
(`docs/kb/architecture.md`, *The app's words*). Rewording a string a
database already has is the admin panel's (`EDITOR`, `ADMIN`), on the Translations page: a migration's
insert leaves it alone. To add one:

1. Use the key in the code (`{{ 'signIn.button' | translate }}`, a plural
   family with `translatePlural: n`; a key put together at run time goes
   into `core/i18n/dynamic-keys.ts`).
2. Add a migration (the next number, ending `-- end of NNN`) that inserts the
   key with a description for the translator, its English and its Slovak
   string, as 004 does, with the same `ON CONFLICT DO NOTHING` (a string the
   owner reworded stays) and a `DO $$` gate that checks exactly the keys it
   writes, in every language (a test holds it to that). A committed
   migration is never edited; while yours is not committed,
   `node backend/tools/php.js backend/tests/tools/testdb.php template --fresh`
   makes the tests take your edits. **While you write it, leave its
   `-- end of NNN` line out** and say so at its top: your `composer start`
   serves this folder, where a whole migration stops the study pages until
   it is applied (the Migrations page, `manage.php`), so a draft must wait
   there. The tests apply a draft anyway, on their own
   databases (and make their template afresh when it changed); write the last
   line when the migration is final. (005 was written so - the time zone
   column, the strings of Your data, of signing out and of the family's top
   bar - and is final since 2026-10-04; 006, "Admin panel" and the words of
   an update that waits, likewise.)
   `backend/tools/build-dist.php` refuses to build the upload while
   any migration but 001 lacks its last line, and names it;
   `--allow-draft=NAMES` is for the tests alone (`test_build()` in
   `backend/tests/lib.php` passes the drafts the tests apply).
3. Run the PHP tests (below): the catalogue test fails on a key the frontend
   uses that has no string, a string nobody uses, a placeholder the Slovak
   invents, or a plural family missing a form. On a set-up copy,
   `node backend/tools/php.js backend/translations.php --status` says the same
   about its database.

The learning material, the SRS stage names, grammar terms and the brand are
never keys. The command line also exports and imports a language
(`--export sk [FILE]`, `--import sk FILE`; a backup file works as well).

### The anotoki library

The database migrations are the anotoki library's (`anotoki-lib`, shared by
every anotoki site: https://github.com/irelevant25/anotoki-lib, a clone of it
beside this repository in `../anotoki-lib`), in two halves with one version:

- `anotoki/lib` (Composer, in `backend/vendor/anotoki/lib`): the engine that
  applies the migrations - `db_migrator()` in `backend/src/db.php` sets it up
  for this site: its `migrations` table as it has always been, each file sent
  whole, a file without its last line a draft -, the gate in front of every
  route (`SiteGate`, `backend/api/app.php`: 503 `not_set_up` and
  `update_pending`, and the few addresses that stay open), `/api/site-status`
  and the Migrations page's addresses;
- `@anotoki/lib` (npm, a release's tarball in `frontend/package.json`): where
  the site stands (`SiteStatus`), the gate around the pages and the page it
  shows, and the Migrations page - wired to this app in
  `frontend/src/app/core/site-status.config.ts`.

To update it, both halves together (while its version is 0.x a new minor
version may need changes here: read its `CHANGELOG.md` first):

1. in `backend/`: the version in `composer.json` (`"anotoki/lib": "^0.1"`)
   if the new one needs it, then `composer update anotoki/lib
   --prefer-dist` with a PHP 8.2+ first on PATH, and commit `composer.json`,
   `composer.lock` and `vendor/` with it (a website has no shell);
2. in `frontend/`: the new release's address in `package.json`
   (`https://github.com/irelevant25/anotoki-lib/releases/download/vX.Y.Z/anotoki-lib-X.Y.Z.tgz`),
   then `bun install`, and `npm install --package-lock-only` so that
   `package-lock.json` says the same as `bun.lock`;
3. the PHP tests, `npm test` and the browser suites (below).

## Tests

| Command | What | Time |
|---|---|---|
| `node backend/tools/php.js backend/tests/run.php` | the PHP unit and API tests, each file in its own throwaway database (`… run.php backend/tests/api/exam-api.test.php` runs some files) | ~25 s |
| `npm test` in `frontend/` | the Angular unit tests (Vitest, in jsdom): answer checking against the whole catalog, the session engine, the interceptor, the changelog … | ~15 s |
| `node frontend/scripts/ensure-build.mjs && node frontend/e2e/run.js` | everybody signed in through the tests' stand-in IAM, in Edge, against the production build: a page opened signed out going to the IAM and back, the whole study loop, an exam, the top bar's keys and menus, Your data, sign-out, the admin panel by role, People, two time zones, a Slovak pass; then visitors (sign-in not required): study, an exam, Sign in moving it into the account, sign-in switched on with a key held | ~4 min |
| `node frontend/scripts/ensure-build.mjs && node frontend/e2e/setup.js` | the setup page in Edge, on a built upload: this computer's way and a website's, each then signing in | ~1 min |
| `node frontend/scripts/ensure-build.mjs && node frontend/e2e/screens.js [name]` | every screen in light, dark and phone layouts, and in Slovak on a phone (light, dark), then the top bar measured at 360–1280 px and its menus → `frontend/e2e/shots/`; fails on overflow, an error, a key or English left on a Slovak page, a bar out of its row; look at the shots | ~10 min |

`frontend/package.json` runs the same suites as `npm run e2e`, `npm run
e2e:setup` and `npm run screens` (in `frontend/`), without the build step:
build first. Every test that needs a database gets a throwaway one
(`academy_test_…`), made on the PostgreSQL server of your settings and
dropped again; your own database and `backend/storage/backups/` are never
touched, and no test asks Google or an IAM. `docs/kb/testing.md` says what
each suite pins down and what to run for a change.

## The data and the audio

```bash
node backend/tools/php.js backend/tools/build-data.php            # backend/data/source/*.tsv → backend/data/*.json
node backend/tools/php.js backend/tools/build-audio.php --dry-run  # what the audio builder would send (no key needed)
```

The `academy-data` skill has the rest (`backend/.env` holds the
text-to-speech key; never commit it).

## Building the website's upload

```bash
node backend/tools/php.js backend/tools/build-dist.php              # → dist/japanese-academy/ (the frontend is built first when needed)
node backend/tools/php.js backend/tools/build-dist.php --no-audio   # an update without the 4,000 clips
```

It refuses (exit 1, naming the file) while a migration is a draft — one
without its `-- end of NNN` line: an upload with one would wait on it.

`docs/kb/hosting.md` has the upload map, the first install through the setup
page, updates (and the one-time move of the folders on the live site), and
how the owner's data moves to the site.

## The scanned books

`books/` (gitignored) holds the course's page scans. The page tool has its
own package beside it:

```bash
npm --prefix backend/tools/pdf ci                         # once: sharp
node backend/tools/pdf/pages.js textbook-1 12-14          # page images; the academy-pdf skill
```

## Conventions

- **Backend**: `declare(strict_types=1)`, plain functions named by area
  (`srs_…`, `exam_…`, `kanji_…`, `auth_…`), no classes but exceptions. Routes
  are Slim route files in `backend/api/routes/`, each address with somebody's
  data behind the same middleware (`data_route()`; a study address
  `study_route()`, which also takes a visitor). Values in SQL are always
  `?` parameters. The code stays parseable by PHP 7.4 (the owner's editor
  checks with one); `backend/tests/unit/php74-syntax.test.php` checks it.
- **Frontend**: standalone components, `OnPush`, signals for state, no
  zone.js. Every component is three files — `.ts`, `.html`, `.scss` — never
  an inline template or style. Colours come only from the tokens in
  `frontend/src/styles/_tokens.scss`, each defined for light and dark; every
  screen works at phone width (390 px). The app talks to the backend through
  `ApiService` and the HTTP interceptor, which adds the sign-in's token to this
  site's `/api` and `/report` addresses only.
- **Migrations** are numbered SQL files in `backend/migrations/`; a committed
  one is never edited, and every one after 001 ends with `-- end of NNN` —
  written last: without it a migration is a draft, which no real database
  gets (above).
- **Days and hours are each person's own**: the browser's `X-Time-Zone`, kept
  on their row; the site's own housekeeping (backup names) is UTC. A test of
  days gives the clock (`docs/kb/kanji-srs.md`, `docs/kb/testing.md`).
- The UI is in English and Slovak (informal "ty"), plain and short, from the
  database: a new word is a key and a migration (above). Dates and numbers
  follow the language on the page, never the system's locale — except a
  signed-in person's own date order and clock, chosen for their anotoki
  account, which win (`core/format.ts`). The theme, signed in, is the
  account's too (`docs/kb/sign-in.md`, *The account's preferences*). The two
  owner pages are English.
