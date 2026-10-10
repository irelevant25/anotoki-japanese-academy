# Architecture

A study app for one person on their own computer, and, since 2026-09-27, a
website for several (each with their own data, signed in through the anotoki
IAM). Two halves since 2026-09-29, in the layout of the other anotoki sites:

- `backend/` — PHP 8.2+ with **Slim 4** (routing and middleware) and, since
  2026-10-07, the **anotoki library** (`anotoki/lib`, every anotoki site's:
  the migrations' engine, where the site stands and the gate in front of
  every route; Composer's packages committed in `backend/vendor/`),
  everything kept in **PostgreSQL**.
  On this computer PHP's built-in web server runs it, on a hosted site Apache.
- `frontend/` — an **Angular 21** app (standalone components, zoneless change
  detection, signals), built into `frontend/dist/japanese-academy/browser/`
  and served by the backend from the same address.

Since 2026-10-04 the top folder holds only those two, `docs/`, `.claude/`,
`.gitignore` and the three guides: the study content is `backend/data/`, the
backups `backend/storage/backups/`, and there is no package or launcher at
the top (`backend/README.md`, `frontend/README.md`).

```
   (all under backend/data/)
                 source/*.tsv  ──backend/tools/build-data.php──▶  vocab.json
   (transcribed from the scanned books)                           kanji.json
                                                                  grammar-index.json
   vocab.json + the SRS vocabulary ──backend/tools/build-audio.php──▶  audio.json + audio/*.mp3
   (Google Cloud Text-to-Speech, two voices)

   *.json + authored-items-part1|2.php
        │   backend/src/content.php: content_sync() at the first request after they
        │   changed (on this computer as on a hosted site), in the setup page and in
        │   manage.php, only if backend/data/ or the code that builds from it changed (~3 s)
        │
        ├─▶ src/generate.php ── question bank (11,523) ──▶ table exam_questions
        │      └ src/conjugate.php   verb/adjective forms (both conjugation charts)
        │
        └─▶ src/srs/catalog.php ── kanji SRS items (1,373) ──▶ table srs_items

   a request ── backend/router.php (here) or public/index.php (Apache) ── backend/api/front.php
        ├─ /setup.php ───────────── backend/setup.php (while it is there)
        ├─ /api/… /audio/… /report/… ── backend/api/app.php: the Slim app
        │      ├─ middleware: errors → JSON, security headers, a trailing slash dropped;
        │      │   in front of every route the anotoki library's SiteGate (not set up?
        │      │   an update waiting? 503, but on the addresses that stay open);
        │      │   per address with data: upkeep (src/upkeep.php) → the person
        │      │   (src/auth.php) → on a page load, the day's backup
        │      ├─ /api/site-status   where the site stands (the library's; always answered, to anybody)
        │      ├─ routes/site.php    /api/auth/config  /api/health  /audio/:name
        │      ├─ routes/exam.php    /api/meta /api/exam /api/submit /api/attempts /report/:id ── src/exam.php
        │      │      └ src/score.php  marking · src/report.php  standalone HTML report · table exam_attempts
        │      ├─ routes/kanji.php   /api/kanji/* ── src/srs/kanji.php
        │      │      └ src/srs/srs.php  WaniKani schedule · src/srs/store.php  srs_progress, srs_settings, srs_daily, srs_log
        │      ├─ routes/translations.php   /api/translations/:code (everybody)  /api/admin/* (EDITOR, ADMIN)
        │      │      └ src/translations.php  languages, translation_keys, translations
        │      └─ routes/migrations.php   /api/admin/migrations (the library's; ADMIN from the token; answers
        │                                 while a migration waits) ── db_migrator() (src/db.php), src/upkeep.php
        └─ anything else ─────────── a file of the built app, or its index.html (Angular's router draws the page)

   src/speech.php — what a word is spoken as and which clips hold it; used by
                    the audio builder, the catalog and the listening questions
```

## The backend — `backend/`

### One front controller, two servers

`backend/api/front.php` answers every request, whichever server got it:

- **`backend/router.php`** (this computer): PHP's built-in web server's
  router, `composer start` in `backend/` (`php -S localhost:8200
  router.php`), as on every anotoki site. It does nothing at start (until
  2026-10-04 `php backend/server.php` checked, migrated, rebuilt and backed up
  before it served): the first request does the start-time work, as on a
  website (`backend/src/upkeep.php`, below), and the day's first page load
  takes the day's backup. Not set up yet, every address says so (503
  `not_set_up`) and the pages show the way to the setup page; a migration
  waiting, every address but the few the pages need to start answers 503
  `update_pending` until an `ADMIN` applies it on the Migrations page; its
  database not answering, every address with data says so (503
  `database_unavailable`) and the pages say the site is not available
  (*The Slim app*, below).
  `php backend/manage.php --check` says what is waiting and the counts — and
  when a migration is a draft ("Waiting: backend/migrations/NNN_… does not
  end with its last line"), offering to apply only what comes before it (exit
  1). The tests start it with OPcache off (see [environment.md](environment.md)).
- **`public/index.php`** (a hosted site; its source is `backend/public/`):
  Apache's front controller. `public/.htaccess` sends it `/api`, `/audio`,
  `/report` and `/setup.php`, and serves the app's files itself. See
  [hosting.md](hosting.md).

`front.php`: `/setup.php` runs `backend/setup.php` while that file is there
(404 once a website's setup deleted it); `/api`, `/audio` and `/report` (the
path decoded, as the router reads it) go to the Slim app; anything else is the
built app — one of its files as it is (never a dotfile or a `.php`, never
anything outside the build), and an address without a file extension its
`index.html`, so `/kanji/reviews` loads the app, whose router draws the page.
Any other address with an extension is a 404. The scripts and styles the
build names with a hash of their content (`main-4GHK3Z7Q.js`) are cached for a
year, as `public/.htaccess` has them; `index.html` and the changelog are asked
for again each time. Without a build, pages answer 503 with a page saying how
to build it; the API works all the same.

### The Slim app — `backend/api/`

`app.php` builds it once per request (`academy_app()`): the anotoki
library's `GET /api/site-status`, the routes of
`routes/site.php`, `routes/exam.php`, `routes/kanji.php`, `routes/me.php`,
`routes/visitor.php`,
`routes/translations.php` (which calls `routes/people.php` inside its
administrators' group) and `routes/migrations.php`, then the routing
middleware, the library's **SiteGate** (below), a trailing slash dropped before routing (`/api/meta/` is
`/api/meta`, as before Slim), the error middleware
(`middleware/errors.php`: an `HttpError` becomes `{error, code?}` with its
status, and what more a page needs to word it, such as a `too_large`'s
`limit`; 404 and 405 are JSON too, a database error 503) and the security
headers (`middleware/security.php`: `nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: no-referrer`, a default-deny CSP for the JSON). `http.php`
has the response helpers (`json_response()`, `request_body()` — JSON objects
only —, `file_response()` with byte ranges).

**Whether the site can answer at all** comes before any route, since
2026-10-07 the anotoki library's way, the same on every anotoki site
([decisions.md](decisions.md), 2026-10-07): where the site
stands (`academy_site_state()`, the library's `SiteState`, from
`config_problem()`, `backend/storage/installed.lock` and the migrations'
engine, `db_migrator()`), decided afresh for every request, and the
**SiteGate** in front of every route:

- **not set up** (no settings): every address answers 503 `{"code":
  "not_set_up", "installed", "message"}`, with `"setup": "/setup.php"` only
  while the copy was never installed (a website's setup leaves the lock; this
  computer's never does);
- **an update waiting** (a whole migration not applied): 503 `{"code":
  "update_pending", "message"}` with `Retry-After: 60`, except the addresses
  that stay open (`SITE_OPEN_PATHS` in `app.php`): `/api/auth/config`,
  `/api/translations/{code}`, `/api/health`, `/audio/{name}` and the
  Migrations page's three (`/api/admin/migrations`, `…/file`, `…/apply`) —
  so the pages start with their words, an administrator signs in and applies
  the update, and the clips play on. Each is its route and nothing under it,
  never a prefix: the gate reads the path decoded once, and a prefix would
  let a crafted path past it (`/api/admin/migrations/../x`, `%2e%2e`, `%2F`);
- **unavailable** (the settings there, the database not answering) and
  **ready**: everything passes, and answers as the database lets it (503
  `database_unavailable` where it is needed).

`GET /api/site-status` (the library's `MigrationsRoutes::status()`) is how
the pages learn which: always answered, to anybody, no token or key looked
at, `{"state": "ready" | "not_set_up" | "update_pending" | "unavailable",
"installed": bool}`. No sign-in gate of the site's stands in front of it.

Every address with somebody's data is registered through `data_route()`
(`routes/site.php`), which puts three middleware in front of it, in this
order, behind the SiteGate:
**upkeep** (the content's rebuild after an upload; nothing while a whole
migration waits for an administrator's Apply), **the
person** (`middleware/person.php`: `auth_user()`, put on the request as `uid`;
401 without one; PHP's time zone becomes theirs for the rest of the request —
[kanji-srs.md](kanji-srs.md), *Each learner's own time zone*), and on a page
load **the day's backup**. The study addresses (the exam's and the kanji
SRS's, the reports) are registered through `study_route()` instead: the same
chain with **the learner** (`learner_middleware()`) in the person's place -
a signed-in person as ever, or, where the IAM says this site does not
require sign-in, a visitor (their key in `X-Visitor-Key`, a negative `uid`)
or nobody yet (`uid` 0, an empty learner), whose save makes a visitor; a
visitor's cap (`attempts`, `answers`) is checked before the handler
([sign-in.md](sign-in.md), *Visitors*). After the answer, `api/front.php`
runs what a request left for later (`src/after.php`): the sweep of visitors
unseen for 30 days, at most once an hour.

| Route | What |
|---|---|
| `GET /api/site-status` | where the site stands: `{state, installed}` (the anotoki library's, above) — always answered, to anybody |
| `GET /api/auth/config` | where to sign in: `{issuer, clientId, loginRequired, visitorKeepDays}` (the IAM, the one way there is, whether it requires sign-in here: `src/access.php`, true until visitors can be kept, and how many days a visitor's data is kept) — no sign-in needed; 503 when not set up; answered while an update waits |
| `POST /api/visitor/move` | at sign-in, with the person's token and the visitor's `X-Visitor-Key`: what the visitor studied into the person's account → `{found, items, kept, attempts, answers}`, whatever the switch says — see [sign-in.md](sign-in.md), *Visitors* |
| `GET /api/meta` | exam: parts, sections, lessons, bank size, your attempt count |
| `POST /api/exam` | exam: build a paper from `{size, books, lessons, sections, seed}` — questions without answers |
| `POST /api/submit` | exam: `{spec, responses, meta}` → score, store your attempt and its report |
| `GET /api/attempts` | your exam history, newest first |
| `GET /report/:id` | one of your reports (HTML, from the database; a Content-Security-Policy allows no script) |
| `/api/kanji/*` | kanji SRS — see [kanji-srs.md](kanji-srs.md) |
| `GET /api/me/data`, `PUT /api/me/data` | all of your data as one file, and back — see *Your own data* below |
| `GET /audio/:name` | a clip from `backend/data/audio/`; only names of 16 hex digits + `.mp3`; byte ranges (206); no sign-in (shared content) |
| `GET /api/health` | `{ok, contentCurrent}`, and under PHP's built-in server, to a request straight from this computer, also `database` and `backups` — the tests ask it |
| `GET /api/translations/:code` | the app's own words: `{language, languages, values, english?}` — a language's strings with English merged underneath, and the languages on offer; no sign-in, no token looked at; `ETag` + `Cache-Control: no-cache` (304 for the tag the browser holds); 404 `not_found` for what is no code; 503 `not_up_to_date` while the database has no words yet (004 of an upload still arriving, or waiting for its Apply); answered while an update waits |
| `/api/admin/languages`, `/api/admin/translations` | the admin panel, in two route groups: the editors and the administrators (`EDITOR`, `ADMIN`) read the languages and the grid of every key in every language, save the changed cells, export and import a language as flat JSON; the administrators alone add, change and delete languages (a copy of its strings in the backups first) — see *The app's words* |
| `GET /api/admin/people`, `DELETE /api/admin/people/:id` | the administrators alone (the inner group): everybody the site has data of, and deleting a person's data — see *People* below |
| `GET /api/admin/visitors` | the administrators alone: `{ready, count, oldestSeenAt, keepDays, max}`, the visitors the site keeps now (none on the People page) |
| `GET /api/admin/migrations`, `GET /api/admin/migrations/file`, `POST /api/admin/migrations/apply` | the administrators alone: the anotoki library's routes (`MigrationsRoutes::admin()`), with `ADMIN` read from the token alone (`migrations_admin_middleware()`: no table needed; it answers while a migration waits): `{sets, applied: [{set, name, applied_at}], pending: [{set, name, ready, blocked}], missing}`; a file's `{set, name, sql}`; Apply → `{applied, failed, error, note}`, 409 `busy` — see *The database*, *A whole migration waits for an administrator* |

Every `/api` and `/report` address needs a signed-in person, except
`/api/site-status`, `/api/auth/config`, `/api/health` and `/api/translations/{code}` (the app's
own words, the same for everybody) - and the study addresses where the IAM
lets people study without signing in (visitors) - and answers with that
person's (or visitor's) data only ([sign-in.md](sign-in.md)). The `/api/admin/…` group adds, after the person,
`staff_middleware()` (`middleware/staff.php`: no `EDITOR` or `ADMIN` role 403
`staff_only`, a body over 1 MiB 413 `too_large`), and its inner group
`admin_middleware()` (no `ADMIN` 403 `admin_only`); the checks are on the
groups, so a route added to one cannot forget them. A refusal is `{error, code?, detail?}`: the sentence
is for the command line, the logs and the tests; a page words the failure
from its `code`; `detail`, the reason of a database error or a crash, goes
out under PHP's built-in server only (the one
exception: why the Migrations page's Apply stopped, PostgreSQL's words to
its ADMIN on a website too, below) (`error_reason()` in
`src/errors.php`). The built-in server handles one request at a time;
each takes 5–10 ms, because the database connection stays open between
requests (see [decisions.md](decisions.md)). A 250-question paper takes about
65 ms.

### Your own data — `routes/me.php`, `src/me.php`

Every signed-in person, with a role or without, takes all of their data away
as one file and brings it back (the owner's decision of 2026-10-04: "the
import/export the users data should be available for every user").

- **`GET /api/me/data`**: a download (`Content-Disposition: attachment;
  filename="japanese-academy-<date>.json"`, the date in the person's own
  zone; `no-store`) in the backups' format, version 2, of one person:
  `{format: "japanese-academy-backup", version: 2, takenAt, everybody: false,
  users: [{id, username, createdAt, lastSeenAt, timeZone, kanji, log,
  attempts}]}` — their kanji progress with its settings and day counts, the
  answer log, every exam attempt with its report. No database name (a website
  keeps it to itself), none of the site's words, nobody else.
- **`PUT /api/me/data`** with such a file as the body: it **replaces** the
  person's data — never a merge, so nothing is counted twice — and answers
  `{items, days, log, attempts, reports, copy}`. Taken: a file of one person,
  whatever their id there (a file of another copy of the app), or of several
  (a backup of everybody) when one of them is the caller, whose part is
  taken. One transaction, which holds the person's `users` row `FOR UPDATE`
  (`users_lock()`); every answer handler, and every save or import of the
  site's words by a person (`translations_write()`), holds it `FOR SHARE`
  first (`users_hold()`), so an answer arriving during an import waits and
  then works on what the file brought, and two imports take turns. Inside it,
  before anything is replaced, a copy of what is there
  (`academy-before-import-user-<id>-<time>.json`, their last 14 kept), then
  every study row of theirs and their settings go and the file's come in
  (`learner_import()`, the log in chunks of 2,000 lines), and an `imports` row
  (source `file`) is written or brought up to date. The file's `timeZone` is
  kept only when the request named none. Whatever id the file gives its
  person, the data becomes the caller's; nobody else's rows are read or
  written.
- **A file is taken only in the shape the app writes**: `kanji` an object
  with `version` 1 and `items`, `daily` and `settings` (objects), and `log`
  and `attempts` present as lists. Anything else — `users:[{}]`,
  `kanji:[0]`, a missing log — is 422 `not_a_data_file` before anything
  changes; an empty person's own file (nothing learned yet) comes back.
- **Refused before anything changes**, each with a code a page words and a
  sentence for the logs and the tests: `413 too_large` with `{limit}` (bytes)
  for a body over the limit — a `Content-Length` over it is refused before a
  byte is read; `422 not_a_data_file` (empty, not JSON, not this app's format
  or version — version 1 included —, nobody in it, or damaged: a part not as
  the app writes it, or a value the database does not take, which rolls back);
  `422 several_people` (several people, none of them the caller).
- **The limit** (`me_import_limit()`) is a 24th of PHP's `memory_limit`, never
  more than 16 MiB (`memory_limit` -1: 16 MiB): 5.3 MiB on a host with 128 MB.
  A data file read into PHP takes about seven times its size (a test measures
  it), the copy of what it replaces may take as much again, and the request
  needs room. `post_max_size` does not count: PHP holds a POSTed form to it,
  and this is the body of a PUT, which PHP leaves to the app (a test sends a
  body far over a 1 KB `post_max_size`). What else may stand in the way on a
  host is the web server's own limit (Apache's `LimitRequestBody`). The
  owner's whole backup was 117 KB on 2026-10-01.
- The kanji-only download of before (`GET /api/kanji/export`) is gone.
- **The page** is **Your data**, a card at the foot of the home page
  (`frontend/src/app/home/your-data/`; the dashboard's foot links to it): the
  time zone the learner's days follow, **Download** (`AuthService.fetch()`, a
  Blob saved under the server's file name) and **Bring back a file**. A file
  is read in the browser first (`readDataFile()`: this format and version,
  somebody in it, the caller's part of a backup of several, and the shape the
  app writes — the kanji progress an object of version 1 with its items, day
  counts and settings, the log and the attempts lists, each attempt with an
  id, a time it finished and a report that is a page or nothing: the
  server's own rules of `me_person_in()`, rule for rule, so its refusals
  `not_a_data_file` / `several_people` come before the learner is asked
  anything, and before anything is sent), and the card asks, in the learner's language, whether to
  replace their data with what the file holds (its name, when it was made, the
  account, items learned, exam attempts); only Yes sends it, as it is. A file
  over 16 MiB (`IMPORT_CEILING`, held to `IMPORT_LIMIT_MAX` by a test) is not
  sent; a 413 names this server's own limit, which the page then checks for
  the rest of the page load. Every refusal is worded from its code. After a
  file came back the home page asks for its numbers again (the kanji screens
  load fresh progress anyway).

### People — `routes/people.php`, `src/people.php`

The administrators (`ADMIN`) alone, inside the admin panel's inner group:

- **`GET /api/admin/people`**: `{people: [{id, username, createdAt,
  lastSeenAt, timeZone, items, attempts}]}`, the latest seen first — the id
  and name of their tokens, when they came first and last, their zone, items
  learned (stage above 0), exam attempts.
- **`DELETE /api/admin/people/:id`**: a copy of all of that person's data
  first (`academy-before-delete-user-<id>-<time>.json`, their last 14 kept;
  `manage.php --restore` of it brings them back, nobody else), then their rows
  in every table of `USER_TABLES` and their `users` row go, in one
  transaction holding that row `FOR UPDATE`. A request of theirs still on its
  way waits for it, finds no row, and makes it again (`users_hold()`): their
  data starts afresh rather than the request failing. Strings they reworded
  stay, by nobody (`translations.updated_by` empties by its foreign key).
  Answers `{deleted, copy}` (the copy's file name); 404 `not_found` for an id
  the site has nobody of. Their account is the IAM's: they may still sign in.
- **`GET /api/admin/visitors`**: `{ready, count, oldestSeenAt, keepDays,
  max}` - the visitors (somebody studying without signing in, negative ids),
  who are never on the list above: how many, the longest unseen, and the
  limits; `ready` false while migration 007 waits.

### Settings — `backend/config/`

`config.php` reads this copy's settings from two files beside it, which the
setup page writes and git never sees; the app requires both, and there are no
defaults to fall back on:

| File | Holds |
|---|---|
| `database.local.php` | `host`, `port`, `name`, `user`, `password` |
| `auth.local.php` | `issuer` and `client_id`: the IAM people sign in through |

What an earlier version wrote beside them is ignored, so a copy set up then
keeps working: `auth.local.php`'s `mode` (`iam`) and `local_user_id` (the
owner id of the sign-in mode `none`, which is gone), and `app.local.php` with
its `timezone` (each person's own zone counts now, and the site's own is UTC:
[kanji-srs.md](kanji-srs.md), *Each learner's own time zone*). A copy set up
without sign-in (`mode` `none`) is not set up any more, and says so.
`app.local.php` may hold, optionally and written by hand (never by the setup
page), the visitors' numbers (`visitors`) and the proxies whose header names
a visitor's address (`client_address`): [hosting.md](hosting.md), *Visitors
on the site*.

`config('db.host')` and the like read them; `config_problem()` says what is
missing or wrong, and until nothing is, the API answers `not_set_up` (the
SiteGate, above; the pages show the anotoki library's "This site is not set
up yet", pointing at the setup page while the copy was never installed). The
answer names no reason (until 2026-10-07 this computer was told it there):
`php backend/manage.php --check` says what is missing, and the setup page
mends it. Written files are readable by their owner only, written aside and
renamed.

The tests have settings of their own: a folder of the same files and an
`app.local.php`, named by `ACADEMY_CONFIG_DIR`, honoured only when the database it names is an
`academy_test_…` one (so a stray variable can never point a real server
elsewhere). Only for those, `auth.local.php` may name the test IAM's keys file
(`jwks_file`, read through `auth_jwks_file()`), and `app.local.php` a backup
folder (`backups_dir`) and another built app (`frontend_dir`); in any other
copy's settings those lines count for nothing.

### The setup page — `backend/setup.php`

How every copy is set up, in the browser: the owner's computer, a developer's,
a website. It asks for the database and the IAM, and nothing else (no sign-in
mode, no owner id, no time zone, no backup): it writes the two settings files,
and builds the database: makes it if it is missing and the user may, applies
the migrations (after a raw copy of every table when it holds study data),
builds the study content. Defaults: database `anotoki_japanese` on port 5432,
the development IAM `http://localhost:4300` on a computer, client
`japanese-academy`. **Test connection** buttons try the database and the IAM
(its `{issuer}/.well-known/openid-configuration` and keys) without saving
anything; the database's answer is the anotoki family's, word for word
("Connected to the database "…": it is empty - Save makes the tables." / "… N
update(s) to apply - Save applies them." / "… it is up to date.", "Connected to
the server. The database "…" does not exist yet - Save creates it.",
"Connected to the server, but there is no database "…" and this user may not
create one. Make it in the hosting panel first.", "The server is there, but
"…" cannot open the database "…": …", "Cannot connect: …"). Its button is
**Save**. Two ways, told apart by where the request comes from:

- **this computer** (PHP's built-in server, a request straight from 127.0.0.1
  or localhost, `auth_from_this_computer()`): no token, but a nonce in an
  `HttpOnly`, `SameSite=Strict` cookie that the page's own form echoes, and the
  `Origin` checked. It stays, and can be run again: it shows what is saved,
  never the password (left empty, the saved one stays).
- **a website**: proof of owning the server first — a token it writes into
  `backend/config/setup-token.local.php` (aside and renamed, like the
  settings), which only FTP reaches; no token, no form passes. It shows
  nothing of what is saved, before the token or after (its **Check** button
  only says whether the token is right; an empty password still keeps the
  saved one). When done it writes
  `backend/storage/installed.lock`, then deletes the token file and itself;
  with the lock there it refuses to run (and deletes itself if uploaded
  again). See [hosting.md](hosting.md).

`backend/manage.php` keeps the command-line helpers for a set-up copy:
`--check`, `--sync`, `--backup`, `--restore=FILE` (a backup of everybody, or
a copy of some people's data alone, which replaces only theirs; version 1,
from before user ids, is no longer read) — its header lists them. It applies pending migrations first,
as the setup page and the Migrations page's Apply do (a request never does). PostgreSQL 13 or newer (tested with 18).

## The frontend — `frontend/`

An Angular 21 app: standalone components, `OnPush`, state in signals, no
zone.js (`provideZonelessChangeDetection`). Every component is three files
(`.ts`, `.html`, `.scss`). Built with `@angular/build` (`ng build`); the unit
tests run in Vitest with jsdom (`ng test`).

- `app.config.ts` — before anything else, `boot()` (`core/boot.ts`): where
  the site stands (the anotoki library's `SiteStatus.check()`, `GET
  /api/site-status`, bare; not set up or unavailable, nothing more of the
  app starts, and the library's page says so; being updated, the start goes
  on as ever, so whoever is signed out can sign in), then
  `AuthService.init()` asks `GET /api/auth/config` (and finishes a sign-in
  coming back from the IAM), then — signed in with a visitor key held — the
  move of what it holds into the account (`VisitorKey.settle()`, 5 s at most),
  then `TranslationService.init()` decides the
  language and gets its strings; the router's first navigation waits until
  the start has settled the sign-in (`AppComponent` starts it), and then every
  page's guard sends anybody not signed in to the IAM — unless the IAM does not
  require sign-in here: then they are a visitor (state `visiting`)
  ([sign-in.md](sign-in.md), *Visitors in the browser*) — and nobody
  anywhere while the site is being updated: the gate's page has its own
  Sign in; no screen asks for data while the copy is not set
  up or nobody is signed in (or visiting). The title strategy
  (`core/i18n/title.strategy.ts`) words a page's title in its language. A
  link to a part of a page (the dashboard's to Your data) scrolls to it.
  The HTTP interceptors: the library's `siteStatusInterceptor` (an answer
  503 `update_pending` or `not_set_up` tells `SiteStatus`), the not-set-up
  one (`core/api/`) and the token's (`core/auth/`).
- `core/site-status.config.ts` — the anotoki library's migrations module
  (`@anotoki/lib/migrations`, every anotoki site's), wired to this app:
  `SiteStatus` (where the site stands), the gate and its page, the Migrations
  page; who is `ADMIN` from the token's roles, Sign in through
  `SignInService`, the page's language, the administrator's own date order
  and clock on the Migrations page, the words asked for again after an Apply.
  `core/site-status.ts` has `reportSiteState()`, which tells `SiteStatus` what
  a plain `fetch()` heard (the sign-in's settings, the words).
- `app.component` — the anotoki family's top bar (`top-bar/`, *The top
  bar* below), then the anotoki library's gate (`<anotoki-site-gate>`): while
  the site is not ready its page stands in for everything under the bar, in
  its own words (English and Slovak) — being updated: "The site is being
  updated", which asks again by itself and loads afresh once the site is
  back, with a quiet **Sign in** while nobody is signed in, and for the site's
  `ADMIN` "A database update is waiting" and the way to the Migrations page,
  the one page that works then (it asks again by itself too, since
  anotoki-lib 0.1.1: another administrator may apply the update meanwhile;
  the site back, the library's page loads the tab afresh - since 0.2.0
  without making the pages first);
  not set up: "This site is not set up yet" and
  the setup page, only while the copy was never installed; unavailable: "not
  available right now". Everything under the bar is the gate's marked
  template
  (`<anotoki-site-gate><ng-template anotokiSitePages>…</ng-template></anotoki-site-gate>`,
  `SitePagesDirective`; anotoki-lib 0.1.1, marked since 0.2.0): it is made
  only while the site is open, so nothing of
  the pages runs behind the library's page — no page asks for its data,
  hears a key or ticks a clock there — and a page open when the site stops is
  taken down (an open exam paper is kept for the tab as it goes:
  [exam.md](exam.md), *In the browser*). Behind the gate, the screen of the
  address, or what stands in for the app
  (`standin/`: the Sign in card after a failed sign-in or a session that
  ended, a problem page; on the way to the IAM, nothing; for a visitor the
  screen, with a
  sign-in that came back without one said above it, `standin/sign-in-failed/`), then the foot: the version and
  **What's new** (`core/changelog/app-version.component`, which opens the
  changelog dialog). The bar and the foot are drawn in every state; after
  the foot, the kit's question host (`<anotoki-confirm-host>`: the one
  question `ConfirmService` asks - the admin panel's "Delete …?").
- `top-bar/` — the bar (*The top bar* below): the anotoki library's
  `<anotoki-top-bar>` (`@anotoki/lib/shell`, with its brand, theme switch,
  language switcher and icons), worded and wired by this app.
- `core/kit.config.ts` — the anotoki library's UI kit (`@anotoki/lib/ui`,
  since anotoki-lib 0.2.0) and its shell, wired to this app
  (`provideKit()`): the kit's words are the app's (its `lookup` maps each
  word of the kit to the app's key - "Sign out" is `account.signOut`, the
  theme's "System" `theme.system` - read from the translation service, the
  owner's rewordings included; with no strings, the seeded English kept in
  the code; a word the app has no key for is the kit's own English or
  informal Slovak), the language on the page (English in the admin panel),
  the theme (`ThemeService`: `academy-theme` on the device, the anotoki
  account's while signed in, a choice saved to it, a refusal worded in the
  app's sentences) and the languages on offer (the translation service's).
  Buttons, dialogs, questions, fields, the spinner and menus everywhere are
  the kit's (`anotokiButton`, `<anotoki-dialog>`, `ConfirmService`,
  `anotoki-text-field` …).
- `app.routes.ts` — the learner's pages under one parent whose
  `canActivateChild` is `signInGuard`: `/` home, `/kanji/…` (lazy:
  `kanji/kanji.routes.ts`), `/exam` (lazy); the admin panel `/admin/…`
  (`adminSignInGuard` — a visitor goes to the IAM too —, `whenReady`, `staffOnly`: EDITOR or ADMIN) with
  `translations`, `languages` and `people` (lazy; the last two `adminOnly`;
  a question before leaving unsaved changes); `/auth/callback`, unguarded.
  The old `/translations` and `/languages` lead to their new addresses.
  `/kanji`, `/exam` and the admin panel open only while the app can be used
  (`whenReady`: signed in or visiting), so Back or Forward on a stand-in page loads no data.
- `core/` — `api/` (`ApiService` over HttpClient, the response types, and the
  interceptor that stops the app on any `not_set_up` answer: the settings
  went while a page was open), `auth/` (`AuthService`, `signInGuard` and `adminSignInGuard`, the
  interceptor that adds the token — or a visitor's key — and `X-Time-Zone`,
  whose a request is decided as it is issued (`issued-as.ts`),
  `visitor-key.ts` (`VisitorKey`: the key of somebody studying without signing
  in, the first save that makes one, the move at sign-in), `PrivateLinksService`,
  `SignOutService`, `SignInService` (a visitor's Sign in waits for the saves
  first), the
  IAM's browser SDK in `sdk/`), `saves-in-flight.service.ts`
  (the saves on their way, which a sign-out — and a visitor's sign-in — waits for), `storage.ts`
  (localStorage and sessionStorage that never throw), `time-zone.ts` (the
  browser's IANA zone), `i18n/` (the app's words, below),
  `kit.config.ts` (above),
  `changelog/` (the foot's version and "What's new", the dialog),
  `audio.service.ts` (the two voices take turns),
  `format.ts` (times, dates and percentages in the language on the page, or
  in the date order and clock of a signed-in person's account),
  `testing/` (the specs' translation service, stand-ins of the sign-in's
  states, the library's module as a spec needs it, the kit's question
  answered: `kit-question.ts`).
- `admin/` — the admin panel, in English: Translations (EDITOR, ADMIN),
  Languages, People and Migrations (ADMIN: the anotoki library's
  `<anotoki-migrations-page>` in the panel's frame); the bar's links lead between
  them (below). Its titles are "<page> · Admin panel · Japanese Academy"
  (`core/i18n/title.strategy.ts`). Its questions ("Delete …?", "Import …?",
  "Leave without saving?") are the kit's (`ConfirmService`), asked through
  `admin/page-question.ts`: the kit draws its one question in the app's root,
  so a question still open when its page goes (Back pressed) is answered no
  with it, never left over the next page to act for a page that is gone.
- `home/` — the home page (kanji summary, exam history) and, at its foot,
  Your data (`your-data/`, above; a signed-in person's only); at its top (and
  the kanji dashboard's) the visitor notice (`visitor-notice/`: kept for this
  browser for the days, Sign in; once, what moved at a sign-in, or that the
  key was no longer known).
- `kanji/` — the trainer: `kanji-shell` (its tabs, and what is drawn over the
  screen: a lesson batch, a session, a summary — `kanji-screen.service.ts`),
  `kanji-state.service.ts` (the catalog, loaded once, and the person's
  progress, fresh on every screen), `answer.ts` (answer checking),
  `session/` (the answering engine and its screen), the screens `dashboard`,
  `lessons`, `lesson-batch`, `reviews`, `practice`, `browse`, `item`,
  `summary`, and `shared/` (tile, readings, notes, item details, `worded` — a
  sentence of the app with material inside it, each piece with its `lang`). Lesson
  batches, sessions and summaries draw over the screen they were started from
  and leave the address as it was, so the shell also routes a click on a link
  to the address already shown (the router fires nothing for it).
- `exam/` — the exam: setup, the paper (keys: 1–4 or A–D, ←/→, Enter, F, R),
  the result, all one component with three screens.
- `styles.scss` and `styles/` — the anotoki library's styles first
  (`@use "@anotoki/lib/styles" as anotoki`: its tokens, base and Manrope,
  the family's font, bundled), then `_tokens.scss` (Japanese's palette given
  to the library's tokens, `anotoki.root()`, light and dark - the kit and
  the library's pages draw with them -, the app's own names for them
  (`--bg`, `--ink`, `--accent` …), and the study colours, kanji, vocabulary
  and the stages, the app's alone: the dark ones under
  `prefers-color-scheme: dark` unless the page is told light, and under
  `[data-theme='dark']`), `_base.scss` (the page, chips, panels, tables,
  the sign-in page - its element and shared-class rules kept out of the
  kit's components, `$app-only`: an app's `button` or `.panel` rule never
  reaches inside a kit button or the library's page), `_items.scss` (tiles
  and stage colours shared by the kanji screens).
- `standin/` — the two pages of the app's own that stand in for it, the Sign
  in card and the problem page (and `sign-in-failed/`, the Sign in card's
  words above a visitor's page; a site not set up, being updated or out of
  reach is the anotoki library's page since 2026-10-07, in its own words),
  and `keptWord()`: what is drawn outside the router's screens (these pages,
  the top bar, the foot, the "What's new" frame) may be drawn with no strings
  at all, so it falls back to the seeded English written in the code (a
  `const ENGLISH` map in each; `backend/tests/unit/translations.test.php`
  holds it to the seeded English), never a key.
- `public/` — `favicon.svg` (the 日 stays the tab's icon), `anotoki.png` (the
  family's mark), `changelog.json`; `angular.json` copies the library's
  `theme-boot.js` (the stored light/dark choice, before the first paint;
  `data-storage-key="academy-theme"` in `index.html`) beside them.

wanakana (romaji → kana as you type) comes from npm and is bundled, and so
are the anotoki library's kit and Manrope; the IAM's browser SDK is a copy
(`core/auth/sdk/`), so the built app needs nothing from the network.

## The top bar

The anotoki family's one bar (since 2026-10-04), and since anotoki-lib 0.2.0
the library's own: `<anotoki-top-bar>` (`@anotoki/lib/shell`), worded and
wired by this app in `frontend/src/app/top-bar/` - the wrapper gives it the
brand, the links, the person, the menu's items, Sign in and Sign out, and
the library draws them, in Japanese Academy's palette (`_tokens.scss`).
`AppComponent` draws it in every state, sticky at the top (`--topbar-height`,
60 px; the exam's progress sticks under it). One row, in this order:

- **the brand** (the library's `<anotoki-brand>`): the family's mark,
  "anotoki" and "Japanese" — a name, the same in every language; on a phone
  "Japanese" alone. It links home (`topbar.home`, "anotoki Japanese: home",
  which holds the words it shows; `aria-current` on the home page): the app
  has no Home link of its own. In the admin panel it is the family's one
  form, "anotoki Japanese · admin panel" ("Japanese" with "admin panel" small
  under it while the bar is folded), and links to `/admin` ("anotoki Japanese
  admin panel: home").
- **the links**: **Kanji** (a term, never translated; the reviews due beside
  it, in the vermilion of kanji - the wrapper gives the library's badge
  `--kanji`) and **Exam** (`topbar.exam`), the section the page is in marked,
  the page's own link `aria-current`. In the admin panel the area's sections:
  Translations, and for ADMIN Languages, People and Migrations — English
  words, as the area is, not keys.
- **the language** (the library's language switcher, offered the translation
  service's languages in `core/kit.config.ts`): a round button with the code
  ("SK"), named "Language: Slovenčina (SK)" (`language.button` holds
  `{code}`: a voice user says what they see), a menu of the languages under
  their own names; only where the learner's pages are, and only with two or
  more. A signed-in person's choice goes to their anotoki account too (*The
  app's words*); a language whose words cannot be had leaves the page as it
  is, with a note under the button (`language.notLoaded`).
- **the theme** (the library's switch and `ThemeService`, wired in
  `core/kit.config.ts`): light, dark or the system's, a segmented radio group
  of three icons (102 × 40), "System" the app's `theme.system`;
  `<html data-theme>` for light or dark, nothing for the system's. Signed in,
  it is the anotoki account's — one theme for every anotoki site, this one's
  admin panel too (the owner's decision of 2026-10-06): taken from the
  account, and a choice here saved to it; a refusal puts the account's theme
  back, with a note under the switch that says why in the app's sentences
  (`preferencesFailure()`, through `THEME_REFUSAL`), until the next choice, a
  click elsewhere, Escape on any of the bar's controls, or the account gone
  (signed out). Nobody signed in, or an IAM that sends no preferences: per
  device, as before. The theme shown is kept in `localStorage`
  (`academy-theme`), and the library's `theme-boot.js` sets it before the
  first paint ([sign-in.md](sign-in.md), *The account's preferences*).
- **the person's menu** (a round button with their initial, their name beside
  it from 961 px): their name, address and role (Administrator / Editor);
  **Your anotoki account** (the IAM's account page, a new tab); **Admin panel**
  (`topbar.admin`, "Administrátorský panel" in Slovak; reworded by 006) for
  EDITOR and ADMIN, or **Back to Japanese Academy** in the admin panel; **Sign
  out** (`SignOutService`: it waits for the answers and notes on their way —
  a spinner and "Saving…" — and asks first when something would be lost). —
  Signed out with the Sign in card on the page, or visiting: **Sign in**
  instead (a visitor's through `SignInService`, which waits for the saves too).

**While the site is not ready** (the anotoki library's page stands in front
of the pages: `pagesShut()` in `core/site-status.ts`, the library gate's own
rule) the bar offers no section and no **Admin panel**: each would lead to
that same page. The brand, the language, the theme and the person's menu stay.
The site's `ADMIN` on the Migrations page while an update waits — the one page
that works then — has its link alone, and **Back to Japanese Academy**. The
tab's title is the app's name alone meanwhile (`AcademyTitleStrategy`), not
the title of the page the address names (which is not made then).

**The fold.** Up to `PHONE_BAR_MAX` = 760 px (the library's `phoneMax`) the
bar is a phone's: the brand, the language, the theme and one menu button
holding the links, a separator and the person's menu (or Sign in). **The
reviews due stand on the menu button** (the library's `phoneMark`), and its
name says them ("Menu: 125 reviews due", `topbar.phoneMenuDue`, a plural
family), so the count a phone hides with the links is still in sight.
Crossing 760 px closes an open menu. What gives way on a crowded desktop row
is the person's name: from 761 to 960 px the round button alone, from 961 px
(`NAME_BAR_MIN`; the library's own default would be 201 px past the fold)
the name beside it (ellipsis at 12rem); the brand, the links, the language
and the theme never shrink. **The admin panel folds later**, up to
`ADMIN_PHONE_BAR_MAX` = 960 px: its four links and "anotoki Japanese · admin
panel" fill the row at 961 (brand 20-318, links 334-727, theme 743-845, the
person 854-941, the name cut short); folded, "Japanese" and "admin panel"
stand beside the menu button (the
library shows a phone's bar with the short brand, so the whole brand of
761-960 px before anotoki-lib 0.2.0 is gone).

760 is the family's number, and Japanese keeps it: measured again in Edge on
2026-10-10 in Manrope, the family's font, with the real labels, a three-digit
due count and the longest name the family measures (20 characters), at 761 px
the English row has 108 px to spare and the Slovak 96 (beyond the 16 px gap).
In pixels, left-right:

| Width | Measured |
| --- | --- |
| 360 (phone) | brand 12-132 ("Japanese"), language 153-193, theme 200-302, menu button 308-348 (the due count on its corner) |
| 390 (phone) | brand 12-132, language 183-223, theme 230-332, menu button 338-378 |
| 761, signed in, 999 due | brand 20-207, Kanji and Exam 223-388 (Slovak "Skúška" 223-400), language 512-552, theme 561-663, the person 673-741 |
| 761, signed out (the card) | brand 20-207, language 486-526 (Slovak 457-497), theme 536-638 (507-609), Sign in 648-741 (Slovak "Prihlásiť sa" 619-741) |
| 761, the admin panel (ADMIN) | folded (above): brand 12-132 ("Japanese" / "admin panel"), theme 601-703, menu button 709-749 |
| 961, the admin panel (ADMIN) | brand 20-318, links 334-727 (Translations, Languages, People, Migrations), theme 743-845, the person 854-941 |
| 961 | language 529-569, theme 579-681, the person 691-941 with the name |
| 1280 | brand 140-327, links 343-508 (Slovak 343-520), language 728-768, theme 778-880, the person 890-1140 |

**The keys.** No key pressed anywhere in the bar reaches `document`: the
lesson quiz, the reviews and the exam listen there (Enter submits a card or
hands a paper in, Space plays a word, 1-4 and A-D choose), and Enter or Space
on a button of the bar would do that instead of pressing it. So the library's
bar stops every key (`isolateKeys`, on by default) and handles Escape itself,
which no document listener would hear; what the key does on the control is
the browser's and stays so. The foot does the same on its own
(`app-version`: What's new and the changelog dialog it opens — Enter there
opens or closes the news, never hands a paper in). Specs prove it with the
real exam (a spoken last question: nothing chosen, played or handed in) and
the real review session (nothing checked), for the bar's controls and the
foot's (`core/testing/foot-controls.ts`).

**The menus** are the library's (`@anotoki/lib/ui/menu`), with the family's
rules: a menu button (`aria-haspopup`, `aria-expanded`, `aria-controls`); the
focus to the first item when it opens; ArrowDown/ArrowUp round and round,
Home and End; Escape closes it with the focus back on its button; **Tab and
Shift+Tab from any item close it with the focus on its button** (left to the
browser the focus would land on the next item of a menu about to go, then on
`<body>`); a click outside closes it where the focus is; choosing an item
closes it — but Sign out and Sign in, which wait for the saves on their way
first (the wrapper hands the library the promise of `SignOutService` /
`SignInService`): the menu stays open meanwhile, the item disabled with its
spinner and "Saving…", the focus on the menu's button (a disabled item would
drop it on `<body>`), and the menu closes with the focus there once the wait
is over. The language menu follows the same rules (its items
`menuitemradio`).

**Its words** are keys (`topbar.*`, `theme.*`, `language.*`, `account.*`,
`signIn.button`, `signOut.saving`; migration 005), each with its English in
the code for a bar drawn with no strings (`keptWord()`): the bar's own in
`top-bar.component.ts`, those the library's pieces say (Sign out, Saving…,
the theme's, the language's, Close) in `core/kit.config.ts`, whose `lookup`
gives the kit the app's strings, the owner's rewordings included. A word of
the kit the app has no key for is the kit's own (English, or informal
Slovak). **In the admin area** the bar reads in English, whatever the reader
chose, with no case in the bar: the title strategy tells the translation
service the address (`noteAddress()`), and under `/admin` it answers from the
bundle's English (`pageLanguage`; `<html lang>` follows), and so does the
kit's `language`. The reader's own language stays (`language()`): the IAM's
pages still open in it.

**The foot** of every page: the version and **What's new**, which opens the
changelog dialog, with a dot beside the words until this version's news has
been opened (`whatsNew.title`, `whatsNew.unseen`; the dot sits on the words'
span, not the button, which is 44 px high on a touch screen). The version is
the newest entry's of `frontend/public/changelog.json`: three numbers,
MAJOR.MINOR.PATCH (since 2026-10-07; `frontend/package.json`'s `version` the
same). The version a browser last read is compared with it number by number,
a missing number counting as 0 (`compareVersions()` in
`core/changelog/changelog.service.ts`): a browser that read "0.4", as the
changelog wrote it before, has read "0.4.0".

**The mark in dark.** The family's mark is a dark navy picture: in light it
has the soft shadow the survey's brand gives it; in dark a light halo
(`--anotoki-mark-shadow`, given for both themes in `_tokens.scss`), or it
sinks into the dark bar. Given here, not left to the library: anotoki-lib
0.2.0's own dark value (a one-item list) reaches the CSS as "(…,)", which a
browser drops, and the mark had no halo at all (screens.js checks it).

## The app's words

What the app itself says — its buttons, headings, "3 reviews due", the
failures — is in English and Slovak (informal "ty"), English the fallback,
and lives in the database, so the owner can reword it in the browser: a file
in the build would be overwritten by the next upload, and a website has no
shell. The study material is never translated: the kanji, the words, their
readings and English glosses, the exam's questions, the learner's notes; nor
are the SRS stage names (WaniKani's, sent by the server: the catalog's
`stages` and `groups`, and a `name` on each of the summary's groups), the
grammar terms, the grades, the brand, the changelog's entries, the exam
report and the admin panel. Material on a page carries `lang="en"` or
`lang="ja"` whatever the page's language.

**The server.** Migration `004_languages_and_translations.sql` makes three
tables and fills them — `en` (English) and `sk` (Slovenčina), 392 keys, each
with a description for the translator, an English and a Slovak string — and
touches no other table (a test says so). Every insert steps aside for a row
that is there, so a later migration never undoes what the owner reworded.
`backend/src/translations.php` does the work (the routes are in
`api/routes/translations.php`):

- **The bundle**, `GET /api/translations/{code}`, for everybody: the
  language's strings with English merged underneath, English itself beside
  them (left out for `en`), and the languages on offer. A regional code is
  answered by its base language (`sk-sk` by `sk`), an unknown or hidden one in
  English. The browser asks every time (`no-cache`) and is answered 304 for
  the `ETag` it holds. It answers while an update waits (the pages need their
  words then too). While the database has no words yet (004 of an upload not
  arrived whole, or waiting for its Apply) it answers 503 `not_up_to_date`,
  and nothing is logged; the start then shows the problem page — unless the
  site is being updated by `SiteStatus`'s account, when the library's page
  stands in already, in its own words.
- **A string is text**, never HTML; what stands in for a value is a
  `{placeholder}`, and which ones a key has is fixed by its English string: a
  save that adds, drops or changes one is refused, as is a brace that is not
  a placeholder, a string over 2,000 characters, an empty English string, an
  unknown key or language. A save is checked whole before anything is
  written, in one transaction, and a refusal names its key. An emptied string
  in another language removes it: that key reads in English there.
- **Keys are the code's**: migrations write them, the admin panel only
  change strings. A plural is a family, `name.one`, `name.few`, `name.other`,
  asked for by `name` with a number. `backend/tools/translation_keys.php`
  scans the frontend for the keys it asks for (and the run-time families of
  `core/i18n/dynamic-keys.ts`); the catalogue test and
  `php backend/translations.php --status` hold them to the database.
- **Languages**: English cannot be hidden, deleted or left without a string;
  a language the migrations write strings for (`TRANSLATION_SEEDED_LANGUAGES`:
  English, Slovak) cannot be deleted; any other can, after a copy of its
  strings in `backend/storage/backups/academy-before-language-delete-<code>-<time>.json`. A
  new language is offered only when the owner says so (the Languages page
  adds it hidden unless the box is ticked). At most 20.
- **Backups**: a copy of everybody (the day's, a manual one, the ones before a
  restore) also holds `translations`, `{languages, values: {code: {key:
  text}}}`; a restore passes it over, and `php backend/translations.php
  --import <code> <file>` puts a language's strings back from it. Each
  database holds its own strings: the owner's computer and the website are
  bridged by export and import, not by a migration.
- **The command line**, `backend/translations.php` (never uploaded):
  `--status` (the frontend's keys against the database's; exit 1 when a page
  would show a key), `--export CODE [FILE]`, `--import CODE FILE` (checked as
  a save is, written by nobody: `updated_by` null). It applies no migration.

**The browser** (`frontend/src/app/core/i18n/`). `TranslationService` holds
the language on the page and its strings; it asks for the bundle with a plain
`fetch()` (no token, neither interceptor), keeps the last one in
`localStorage` so a returning reader sees no keys while the request is out,
and sets `<html lang>`. The language is the first of: `?lang=` (taken out of
the address and kept for the tab in `sessionStorage`), the chooser's choice
(`localStorage`), the `locale` of the IAM's token, each of the browser's
languages and its base (`sk-SK` asks for `sk`; a Czech browser reads Slovak
while there is no Czech), and English. For somebody signed in whose account
sends its preferences ([sign-in.md](sign-in.md), *The account's
preferences*), the token's `locale` comes before what this device
remembered: `?lang=`, a choice made on this page, the account's language,
the device's choice, the browser's, English (`languageCandidates()`'s
`stored`) — as on the survey site, the family's reference. The page changes
language only once the new bundle is in memory, and a key with no string
shows as itself and warns once in the console — the owner wants to see
which.

A changed `locale` (a change on the account's page, on another anotoki site
or in another tab) is followed when it comes (`followToken()`): for an
account that sends its preferences, over the device's choice and an earlier
choice on the page — not over this tab's `?lang=`, and not while a choice
made here is on its way to the account, whose answer to an earlier save
would turn the page back; otherwise only while nothing is stored here (no
choice, no `?lang=`).

- The `translate` and `translatePlural` pipes (impure: the language changes
  under a constant key), `t()` / `plural()` / `number()` in code, the
  `localDate` pipe and `core/format.ts` for dates, clocks and relative times
  in the language's locale (`'en-GB'`, `'sk-SK'`), whatever the system's is.
  A signed-in person who chose a date order or a clock for their anotoki
  account gets those instead (`TranslationService.dateFormat()` and
  `timeFormat()`, from `AuthService.preferences`; [sign-in.md](sign-in.md),
  *The account's preferences*): 6.10.2026, 06/10/2026, 10/06/2026 or
  2026-10-06, and 14:30 or 2:30 pm in the language's words; a date with its
  time is the two side by side, each as chosen or as the language writes it
  (`2026-10-06 14:30`). The admin panel's moments too, in its English
  (`fmtAdminMoment()`), and the kanji dashboard's hour axis (`fmtHour()`: "15",
  or "3 pm" on a 12-hour clock, one line over its three bars). Nothing
  chosen, a visitor, or an IAM that sends none: the language's own way, as
  before.
- State holds keys, kinds and `ApiError`s, never a worded sentence, so a page
  follows a change of language without being made again; a failed request is
  worded from its code (`error-text.ts`), never with the server's sentence.
- The chooser (the library's language switcher, offered the translation
  service's languages under their own names in `core/kit.config.ts`) sits
  in the top bar in every state but the admin panel's, and draws nothing
  while fewer than two languages are on offer. A language whose words
  cannot be had leaves the page as it is, with a note under the button.
  Like the whole bar it keeps its keys to itself: Enter on a language never
  submits a card or finishes a paper behind it, and switching changes words
  only. A signed-in person's choice, once the page has switched, also goes
  to their anotoki account (`setLanguage()` → `saveToAccount()`: one save at
  a time, the latest last, nothing the account has already, nothing while
  the IAM sends no preferences), so the IAM and the other sites speak it,
  this one at the next visit too. It holds for the visit whatever the
  account answers (a choice made on this page comes before the account's
  language); a refusal puts nothing back and says nothing — a language the
  IAM does not offer stays this site's own for the visit.
- The admin panel reads in English (`pageLanguage`): the bar, the foot and the
  dialog answer from the bundle's English under `/admin`; the reader's own
  choice (`language()`) stays.
- A start that cannot get its strings still draws: the stand-in pages, the
  top bar and the foot fall back to the seeded English written in the code
  (`keptWord()`), and the next navigation asks again.

**The admin panel** (`frontend/src/app/admin/`, English, `/admin/translations`,
`/admin/languages`, `/admin/people` and `/admin/migrations`; **Admin panel** in the person's menu of the
top bar, for EDITOR and ADMIN; the bar's links lead to the pages the person
may open, and its menu back to the app). Database updates wait for an ADMIN's **Apply pending** on the
Migrations page (*The database*, *A whole migration waits for an administrator*). Translations shows a key a row and a language a column
(stacked over three languages), each string a box, with a search, every
plural filled in for sample numbers, and each language's export and import
as a flat JSON file; Save sends the changed boxes only and shows a refusal
beside its key. Languages adds, renames, orders, offers or hides and deletes
languages (ADMIN). People (ADMIN) lists everybody who has signed in, the
latest first — name, first and last seen, time zone, items learned, exam
attempts; the zone, the moments and the counts each on one line, the table
scrolling in its box on a phone, and **Delete data** under the name, so it
is never off the screen — and deletes a person's data after a question that names what goes
(the server keeps a copy first; their IAM account stays). What is typed and
not saved is held in `AdminDrafts`, mirrored to
`sessionStorage` for the tab: the app takes a page away without a question
when a session ends, and signing in again is a page load, so the drafts must
outlive both (only another person signing in drops them). Leaving a page
with unsaved changes asks first (`unsavedChangesGuard`, a modal dialog), and
closing the tab asks the browser's question.

## The database (PostgreSQL)

Tables are created by `backend/migrations/*.sql` (applied in order, by the
anotoki library's engine, by the
setup page, `manage.php`, or an administrator's Apply on the admin panel's
Migrations page, on this computer as on a hosted site — never by a request
by itself: below; a migration that is
committed is never edited — add the next number instead — and every one but
001 ends with the line `-- end of NNN`, without which it is taken to be half
uploaded and waits, with every one after it).
Times the browser sees are milliseconds; the columns are `timestamptz`,
converted by the SQL functions `academy_ms()` / `academy_time()`.

**A migration being written is a draft** (the rule since 005, 2026-10-04): it
sits in `backend/migrations/` *without* its `-- end of NNN` line until it is
finished, and says so at its top, so that the app's own rule makes it wait on
every real database — the owner's `composer start` serves this working tree,
where a whole migration stops the study pages until it is applied, which
must never happen for a draft. The tests alone apply a draft: `tests/lib.php` and
`tests/tools/testdb.php` name the drafts there are in `ACADEMY_MIGRATION_DRAFTS`
(`test_config_migration_drafts()`), and `db_migration_drafts_allowed()`
honours a name only for an `academy_test_…` database. `testdb.php template`
makes the template afresh by itself when a draft changed since it was made (a
fingerprint in the template's comment). The last line is written last, when
the draft is final; from then on the migration is applied everywhere. A file
a test leaves half on purpose is no draft anybody named, and waits on the
tests' databases too. 005 was the first written so, and is final since
2026-10-04; 006 likewise; 007 (`007_visitors.sql`, visitors) since
2026-10-05, its last line written once the browser suites had passed: its
schema (users' `CHECK (id > 0)` replaced by `users_person_or_visitor`,
`visitor_key_hash`, `visitor_from`, the sequence `visitor_ids`, two
partial indexes, and a check at its end that every table of somebody's data
kept its rows) and its strings (what a visitor reads, the questions before a
visitor's sign-in, the refusals: 14 keys in English and Slovak, a check that
each has both). While a migration waits (a draft,
or a file still uploading), the app works without what it makes — before
005, without its column (`users_time_zone_ready()`); before 007, without
visitors (`visitors_ready()`: sign-in stays required) — and the study
content's rebuild after the files changed waits with it (upkeep does nothing
past a waiting migration).
`manage.php --backup` still takes its copy, with a note; `--check` says
"Waiting: backend/migrations/NNN_… does not end with its last line" and
offers to apply only what comes before it (exit 1); `--sync` and
`--restore` stop with the sentence that the migration does not end with its
last line, before they change anything; `backend/tools/build-dist.php`
refuses to build (or list) the upload while any migration but 001 lacks its
last line, and names it (`--allow-draft=NAMES` is for the tests alone:
`test_build()` in `backend/tests/lib.php` passes the drafts they apply); the setup page's **Save** saves the
settings and applies the migrations before it, then stops with that sentence
(the owner's copy is set up and needs no Save meanwhile).

**A whole migration waits for an administrator** (since 2026-10-04, the
owner's decision; until then the first request after an upload applied it),
and since 2026-10-07 the anotoki library says what the site does meanwhile,
as every anotoki site does ([decisions.md](decisions.md)). The engine is the
library's `Migrator`, set up for this site by `db_migrator()`
(`backend/src/db.php`): the one folder `backend/migrations/` (the set
`academy`), the table `migrations (name, applied_at)` as it has always been
(made in that shape on a new database, its `prepare` hook), each file sent
to PostgreSQL whole in one statement (`split` off) in a transaction of its
own with its row, a file without its last line a draft (its `ready` hook,
`db_migration_ready()`), and one apply at a time under the upkeep's lock
(`UPKEEP_LOCK`, which the content's rebuild takes too). While a file is
whole and not applied, where the site stands is `update_pending` (the
library's `SiteState`, `Migrator::applicable()`), and the SiteGate answers
503 `{"code": "update_pending"}` with `Retry-After: 60` to every address but
the ones that stay open (*The Slim app*, above); nothing rebuilds the
content meanwhile (`upkeep_run()` stops at a waiting migration). The pages
start as ever — how to sign in and the words answer — and the library's page
stands in front of them: "The site is being updated" for a visitor, a
learner, an editor (it asks again every 30 s and loads afresh once the site
is back), with a quiet **Sign in** while nobody is signed in, and for the
site's `ADMIN` "A database update is waiting" with **Open Migrations**, the
one page that works then, asking again the same way (`SiteGateComponent`;
who is `ADMIN` is the token's roles). Nothing of the pages is made behind
the library's page (they are the gate's marked template). Until 2026-10-07 the start stopped on the problem page
instead (the words answered 503 `not_up_to_date`), and an administrator who
was signed out could not sign in at all. The **Migrations page**
(`/admin/migrations`, `ADMIN`: the library's `<anotoki-migrations-page>`;
the addresses `backend/api/routes/migrations.php`, the library's
`MigrationsRoutes::admin()`, behind `migrations_admin_middleware()`, which
reads `ADMIN` from the token alone — no table is needed, so it works on a
database the migrations have yet to build) lists what is pending, in the
order it will run (a draft: "a draft - it does not run until it is
finished", and every file after it "waits"), what is applied with when (in
the administrator's own date order and clock), each file's SQL (**View**,
with **Copy**), and **Apply pending**, after a question. Apply (a connection
of its own, `db_connect()`: the lock is the connection's) takes the lock or
answers at once 409 `busy` (another Apply, the setup page, `manage.php` or
the content's rebuild holds it), takes the raw copy of every table
(`upkeep_before_apply()` → `upkeep_copy_before()`: one copy for one upload
however often it is tried, a new one when the files or the pending list
changed; the outcome's note names its file in `backups/`, and a copy that
cannot be written stops the apply before anything runs), then applies each
file in its own transaction: the first that fails is rolled back whole and
named ("Stopped at …"), the ones before it stay; why (`error`,
PostgreSQL's own words) goes to the ADMIN on this computer and on a website
alike, in a box under it, as the IAM's page shows it (the owner's decision
of 2026-10-04); the site's error log has it too (`[upkeep] a migration
failed: …`). The setup page and `manage.php` apply the same way, with the
same copy, under the same lock (`upkeep_migrate()`, which throws naming the
failed file, or saying another apply is running), so no two ever run at
once. "Up to date" once something was applied and nothing failed. When an
Apply leaves nothing to apply, the site runs again without a page load
(`SiteStatus.markReady()`), and the app's words are asked for again
(`TranslationService.reload()`, the library's `onUpToDate`): the update may
have brought some. The next request then rebuilds the content and saves the
stamp, as after any change of the files.

| Table | Contents |
|---|---|
| `users` | one row per person: the IAM user id (`id`), their name from their latest token, when first and last seen, and their time zone (`time_zone`, migration 005: the IANA name their browser last named, null until it names one). Since migration 007 also one row per visitor: a negative `id` (`visitor_ids`), the SHA-256 of their key (`visitor_key_hash`) and a keyed hash of the address they came from (`visitor_from`); `users_person_or_visitor` keeps the two apart ([sign-in.md](sign-in.md), *Visitors*) |
| `srs_progress` | one row per person and kanji-trainer item they touched: stage, review times, counters, notes, synonyms |
| `srs_settings` | each person's trainer settings, and when their progress started / last changed |
| `srs_daily` | lessons, reviews, practice per person and day — the day of the person's own zone when they answered (the dashboard) |
| `srs_log` | every lesson, review and practice answer and every reset, with whose it was — only ever added to |
| `exam_attempts` | every exam attempt: the whole record (as `results/<id>.json` held it) and its HTML report; ids are unique per person |
| `imports` | what was imported into whose account, and from where (`file`: the person's own data file, the latest one) |
| `srs_items`, `exam_questions`, `content_state` | the study content, rebuilt from `backend/data/` — the same for everybody; `content_state.stamp` is what the per-request upload check compares |
| `languages` | the languages the app can be read in (migration 004): `code`, `name` (English), `native_name` (what the chooser shows), `enabled` (offered), `sort_order` |
| `translation_keys` | every key of the app's words, with a description for the translator; written only by migrations |
| `translations` | one string: a key in a language; `updated_by` is who last reworded it in the browser (null: as a migration or the command line wrote it), following a moved user id and emptied when their row goes |

Every study table has `user_id` first in its primary key, pointing at `users`
(migration 002: the owner's rows became user 1's; see
[sign-in.md](sign-in.md)). The three translation tables are the site's, not a
person's: everybody reads them, the owner writes them, they are not in
`USER_TABLES`, and their queries have no `user_id` ([The app's
words](#the-apps-words)). Only the owner's own server uses the owner's
database. The tests make their own throwaway databases (`academy_test_…`, see
[testing.md](testing.md)).

## The study data outside the database (never delete)

| Path | Contents |
|---|---|
| `backend/storage/backups/` (gitignored; `backups/` at the top until 2026-10-04) | `academy-<date>.json`: a copy of all the study data — per person their progress, answer log, exam attempts with their reports — taken at the first page load of each day (the UTC day; every date and time in a backup's name is UTC); the last 14 are kept. Also one before a restore; one of a person's data alone before their full reset, before they bring their data back from a file, and before an administrator deletes it (`academy-before-reset-user-<id>-<time>.json`, `…-before-import-…`, `…-before-delete-…`; their last 14 of each kind kept; a name already taken gets `-2`); and a raw copy of every table (`….raw.json`) before a migration (taken once per upload, however often a failing one is tried: `.before-migration.json` notes what it was taken with). `php backend/manage.php --restore=<file>` puts a `.json` back: format version 2 is everybody's data (or, with `"everybody": false`, the people it names, and only theirs); version 1 (from before user ids, the owner's alone) is no longer read: every backup there is is version 2 |

The files of the app before the database (`progress/`, `results/`,
`reports/`) were deleted on 2026-10-04 by the owner's decision: they were
never imported, and git keeps them.

A throwaway database of the tests keeps its backups in the folder its test
settings name, or else in the temp folder (`academy-backups-<name>`), never in
`backend/storage/backups/`.

## Audio — `backend/data/audio/`, `backend/data/audio.json`

Made by `php backend/tools/build-audio.php` with
Google Cloud Text-to-Speech: every vocabulary word, in a female and a male
voice. The clips are in git, so a fresh clone plays sound without a key. Only
a rebuild needs the API key, from `GOOGLE_TTS_API_KEY` or the gitignored
`backend/.env`. Details in [kanji-srs.md](kanji-srs.md) and [exam.md](exam.md).

## Local only (gitignored)

| Path | Contents |
|---|---|
| `backend/config/*.local.php` | this copy's settings (above), written by the setup page; on a website also its token file until the setup is done |
| `backend/storage/` | what the backend writes for itself: `backups/` (copies of the study data, above, with the app's words in a copy of everybody; a deleted language's strings), the IAM's keys, cached, a website's setup lock (`installed.lock`: the setup page is never offered again) |
| `frontend/dist/`, `frontend/node_modules/` | the built app and its packages |
| `backend/tools/pdf/node_modules/` | the PDF page tool's package (`sharp`) |
| `dist/` | the upload for a hosted site (`backend/tools/build-dist.php`) |
| `books/` | the five scanned course books (`textbook-1.pdf` …), read by `backend/tools/pdf/pages.js`, plus the owner's notes |
| `backend/.env` | `GOOGLE_TTS_API_KEY=…`, for the audio builder |
| `temp/` | the owner's scratch folder (e.g. `voices.html`: a sample of every Japanese voice) |

A fresh clone has none of these: the setup page writes the settings; copy the
books in by hand, and create `backend/.env` only to make new audio.

## What Node is for

Building the frontend (`frontend/scripts/ensure-build.mjs` does it when its
sources changed), its unit tests, the browser suites (`playwright-core` with
the installed Edge) and the PDF page tool (`sharp`, in
`backend/tools/pdf/package.json`). Nothing at run time: the backend serves the
build. The browser suites and the command line start PHP through
`backend/tools/php.js`, which finds a PHP 8.2+ with the needed extensions
(plain `php` may be an older one).

## Parts and lessons

Lesson numbers alone identify the part: Greetings = 0 and Lessons 1–12 are
Part 1; 13–23 are Part 2 (`BOOKS` in `backend/src/generate.php`). Kanji are
taught from Lesson 3, so SRS lessons run 3–23.
