# Architecture

A study app for one person on their own computer, and, since 2026-09-27, a
website for several (each with their own data, signed in through the anotoki
IAM). Two halves since 2026-09-29, in the layout of the other anotoki sites:

- `backend/` — PHP 8.2+ with **Slim 4** (routing and middleware) and, since
  2026-10-07, the **anotoki library** (`anotoki/lib`, every anotoki site's:
  the migrations' engine, where the site stands and the gate in front of
  every route, since 0.3.0 the app's words, since 0.4.0 the sign-in's
  checks, the people and the admin tools - the error log, the audit log, the
  feedback, the backups of the whole database -, since 0.5.0 a
  restore's hooks, the pages' own errors and where a request comes from
  (0.5.1 a fix of a restore with visitors, 0.5.2 the origin secret), and
  since 0.6 the family's legal pages, since 0.6.3 its footer (the app is on
  0.7.0, both halves);
  Composer's packages committed in `backend/vendor/`),
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
        │      ├─ middleware: the library's error log around everything, errors → JSON, security
        │      │   headers, a trailing slash dropped; in front of every route the anotoki library's
        │      │   SiteGate (not set up? an update waiting? 503, but on the addresses that stay open);
        │      │   after the answer, at most hourly, the scrub of the IAM's deleted accounts
        │      │   (the library's PeopleUpkeep, src/people.php); per address with data: upkeep
        │      │   (src/upkeep.php) → who is asking (the library's Identify, src/auth.php) → the
        │      │   person → on a page load, the day's backups
        │      ├─ /api/site-status   where the site stands (the library's; always answered, to anybody)
        │      ├─ routes/site.php    /api/auth/config  /api/health  /audio/:name
        │      ├─ routes/exam.php    /api/meta /api/exam /api/submit /api/attempts /report/:id ── src/exam.php
        │      │      └ src/score.php  marking · src/report.php  standalone HTML report · table exam_attempts
        │      ├─ routes/kanji.php   /api/kanji/* ── src/srs/kanji.php
        │      │      └ src/srs/srs.php  WaniKani schedule · src/srs/store.php  srs_progress, srs_settings, srs_daily, srs_log
        │      ├─ routes/translations.php   /api/translations/:code (everybody)  /api/admin/* (EDITOR, ADMIN):
        │      │      the anotoki library's TranslationsRoutes ── src/translations.php  academy_translations():
        │      │      the library's Translations on languages, translation_keys, translations
        │      ├─ routes/people.php   /api/admin/people (ADMIN): the library's PeopleRoutes ── src/people.php
        │      ├─ routes/admin.php    /api/admin/errors, /audit, /feedback, /backups (ADMIN), POST /api/feedback:
        │      │      the library's admin tools ── src/admin.php  (storage/logs, anotoki_audit_log,
        │      │      anotoki_feedback, storage/backups/*.anotoki-backup)
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
`routes/translations.php`, `routes/people.php` (the library's People routes),
`routes/admin.php` (the library's admin tools) and `routes/migrations.php`,
then the routing middleware, the library's `PeopleUpkeep` (after the answer,
at most hourly and only while the site is ready, the scrub of the accounts
the IAM deleted: [sign-in.md](sign-in.md), *Accounts the IAM deleted*), the
library's **SiteGate** (below), a trailing slash dropped before routing (`/api/meta/` is
`/api/meta`, as before Slim), the error middleware
(`middleware/errors.php`: an `HttpError` becomes `{error, code?}` with its
status, and what more a page needs to word it, such as a `too_large`'s
`limit`; 404 and 405 are JSON too, a database error 503; what it answers
500 or 503 is written down in the error log), the security
headers (`middleware/security.php`: `nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: no-referrer`, a default-deny CSP for the JSON) and,
outermost, the library's error log (`ErrorLogMiddleware::outer()`: an answer
worth seeing - a 5xx, a 404, 405, 413, 415 or 429 - that no exception wrote
down; PHP's own warnings and fatal errors go there too,
`installPhpHandlers()`; *The admin tools*, below). `http.php`
has the response helpers (`json_response()`, `request_body()` — JSON objects
only, and of a write any type but JSON 415 `unsupported_media_type` before
anything is read or written: a form or plain text is what another site's
page may send here without asking first, and read as an empty body it would
save as nobody and make a visitor —, `file_response()` with byte ranges).

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
  that stay open (`academy_site_open_paths()` in `app.php`): `/api/auth/config`
  (the library's `AuthRoutes::openPath()`),
  `/api/translations/{code}` (the library's `TranslationsRoutes::openPath()`), `/api/health`, `/audio/{name}`, the
  Migrations page's three (`/api/admin/migrations`, `…/file`, `…/apply`), and
  the error log's and the backups' (the library's `ErrorLogRoutes::openPaths()`
  and `BackupsRoutes::openPaths()`: a backup just before an Apply is the
  point - never a restore) —
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
(`routes/site.php`), which puts its middleware in front of it, in this
order, behind the SiteGate:
**upkeep** (the content's rebuild after an upload; nothing while a whole
migration waits for an administrator's Apply), **who is asking** (the
library's `Identify`, `academy_identify_person()` in `src/auth.php`: a token
alone, a visitor's key never read), **a signed-in
person** (the library's `RequirePerson`: 401 without one), **the person**
(`middleware/person.php`: their row kept up to date, `people_seen()`, their
id put on the request as `uid`; PHP's time zone becomes theirs for the rest
of the request — [kanji-srs.md](kanji-srs.md), *Each learner's own time
zone*), and on a page load **the day's backups** (the app's own copy, and the
library's backup of the whole database, made after the answer). The study addresses (the exam's and the kanji
SRS's, the reports) are registered through `study_route()` instead: the same
chain with the library's `RequireCaller` and **the learner** (`learner_middleware()`) in the person's place -
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
| `GET /api/auth/config` | where to sign in, the library's boot configuration (`AuthRoutes::config()`): `{issuer, client_id, login_required, sign_in_available, visitor_keep_days}` (the IAM, the one way there is, whether it requires sign-in here: `src/access.php`, true until visitors can be kept, and how many days a visitor's data is kept; snake_case since anotoki-lib 0.4.0) — no sign-in needed; 503 when not set up; answered while an update waits |
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
| `GET /api/translations/:code` | the app's own words (the anotoki library's route): `{language, languages: [{code, name, native_name}], values, english?}` — a language's strings with English merged underneath, and the languages on offer; no sign-in, no token looked at; `ETag` + `Cache-Control: no-cache` (304 for the tag the browser holds); 404 `not_found` for what is no code; 503 `translations_unavailable` (`Retry-After: 60`) while the database has no words yet (004 of an upload still arriving, or waiting for its Apply) or cannot be asked; answered while an update waits |
| `/api/admin/languages`, `/api/admin/translations` | the admin panel, the anotoki library's routes (`TranslationsRoutes::strings()`, `::languages()`) in two of this app's route groups, in snake_case: the editors and the administrators (`EDITOR`, `ADMIN`) read the grid of every key in every language, save the changed cells, export and import a language as flat JSON; the administrators alone read, add, change and delete languages (a copy of its strings in the backups first) — see *The app's words* |
| `GET /api/admin/people`, `DELETE /api/admin/people/:sub`, `POST /api/admin/people/sync` | the administrators alone: the library's People routes - everybody the site has data of (and the visitors' line), deleting a person's data, the scrub of the IAM's deleted accounts now — see *People* below |
| `/api/admin/errors…`, `/api/admin/audit…`, `/api/admin/feedback…`, `/api/admin/backups…` | the administrators alone: the library's admin tools — see *The admin tools* below |
| `POST /api/feedback` | the visitors' feedback form (the library's): a person's, or while the IAM does not require sign-in here a visitor's or nobody's — see *The admin tools* below |
| `GET /api/admin/migrations`, `GET /api/admin/migrations/file`, `POST /api/admin/migrations/apply` | the administrators alone: the anotoki library's routes (`MigrationsRoutes::admin()`), with `ADMIN` read from the token alone (`admin_token_checks()`: no table needed; it answers while a migration waits): `{sets, applied: [{set, name, applied_at}], pending: [{set, name, ready, blocked}], missing}`; a file's `{set, name, sql}`; Apply → `{applied, failed, error, note}`, 409 `busy` — see *The database*, *A whole migration waits for an administrator* |

Every `/api` and `/report` address needs a signed-in person, except
`/api/site-status`, `/api/auth/config`, `/api/health`, `/api/translations/{code}` (the app's
own words, the same for everybody) and a backup's download by its
single-use ticket - and the study addresses and the feedback form where the IAM
lets people study without signing in (visitors) - and answers with that
person's (or visitor's) data only ([sign-in.md](sign-in.md)). Every `/api/admin/…` group adds, after the person,
`staff_middleware()` (`middleware/staff.php`, the library's `RequireRole`: no `EDITOR` or `ADMIN` role 403
`staff_only`; the words' and the languages' groups a body over 1 MiB 413 `too_large`,
`body_limit_middleware()`), and the groups of what only an administrator may do
`admin_middleware()` (no `ADMIN` 403 `admin_only`) - and the library's own groups their own `ADMIN` check
inside; the checks are on the groups, so a route added to one cannot forget them. A refusal is `{error, code?, detail?}`: the sentence
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
  site's words by a person (the anotoki library's save, whose `beforeWrite`
  is `academy_translations_config()`'s in `src/translations.php`), holds it `FOR SHARE`
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

The anotoki library's people module (since anotoki-lib 0.4.0; the library's
README, "People"), on this app's `users` table - the administrators
(`ADMIN`) alone, the library's own `ADMIN` check inside its group as well.
One wire format for every anotoki site: snake_case, times in ISO 8601 UTC,
an IAM id as a string.

- **`GET /api/admin/people?q=&page=`**: `{people: [{sub, name,
  first_seen_at, last_seen_at, anonymized_at, iam_url, time_zone, learned,
  attempts}], columns, total, page, page_size: 50, visitors, sync, ready,
  problems}` — the latest seen first; `q` finds a name or an IAM id; this
  site's columns (`people_columns()`: the zone, the items learned - stage
  above 0 -, the exam attempts); `visitors` the line about the visitors
  (somebody studying without signing in, negative ids, never on the list:
  `{count, oldest_seen_at, keep_days, max}`, null while migration 007 waits;
  until 2026-10-11 `GET /api/admin/visitors`); `sync` where the scrub of the
  IAM's deleted accounts stands ([sign-in.md](sign-in.md), *Accounts the IAM
  deleted*).
- **`DELETE /api/admin/people/:sub`**: a copy of all of that person's data
  first (`academy-before-delete-user-<id>-<time>.json`, their last 14 kept;
  `manage.php --restore` of it brings them back, nobody else), then their rows
  in every table of `USER_TABLES` and their `users` row go, in the library's
  transaction (`People::delete()`), holding that row `FOR UPDATE`
  (`people_delete()`, the library's delete hook: `people_delete_hook()`). A
  request of theirs still on its way waits for it, finds no row, and makes it
  again (`users_hold()`): their data starts afresh rather than the request
  failing. Strings they reworded stay, by nobody (`translations.updated_by`
  empties by its foreign key); their feedback keeps its words but no longer
  the address to answer them at nor their browser (the library does that
  part, `Feedback::forgetPeopleOn()`, in the same transaction). Answers
  `{deleted: {"Kanji and words": n, "Answers": n, "Exam attempts": n},
  note}` (the note names the copy's file); 404 `not_found` for an id the site
  has nobody of; recorded in the audit log (`person.data_deleted`) inside the
  delete's own transaction - no delete without its entry, which a restore
  does it again by (*Backups*, below): 503 `feature_unavailable` while the
  audit log's table waits for its update. Their account is the IAM's: they
  may still sign in. The hook does ALL its work on the connection the library
  hands it, and begins no transaction of its own (anotoki-lib 0.5.0): on the
  page that is the site's own (`db()`, which the copy reads through); in a
  restore, the restore's, which holds every table it loaded - a statement on
  `db()` there would wait on those locks until PostgreSQL ended the restore.
  A restore's delete (its request null) keeps no copy.
- **`POST /api/admin/people/sync`**: the scrub, now → `{run, sync}`;
  recorded (`people.synced`).

### The admin tools — `routes/admin.php`, `src/admin.php`

The anotoki library's admin tools (since anotoki-lib 0.4.0; its README,
"Admin tools"), set up for this site in `src/admin.php` and mounted in
`routes/admin.php`: the ones Japanese takes - the error log, the audit log,
the feedback with the visitors' form, the backups of the whole database - and
not the file explorer (the genshin site's alone). Every page of theirs is the
`ADMIN`'s alone (the owner's decision; the library's own check inside each
group too). What they need to know of this site is one `AdminContext`
(`academy_admin_context()`): who acts (the token's `sub`), whether they are
`ADMIN` (the token's roles), the proof a backup asks for (a sign-in of the
last ten minutes: the token's `auth_time`), this site's error body, people's
names by id (`academy_people_names()`: a backup's maker, the audit log's and
the feedback's people), and where a request comes from - the library's own
rule (`Support\ClientAddress`, anotoki-lib 0.5) over this site's trusted
proxies (`client_address_trusted_proxies()`: Cloudflare's ranges unless
`app.local.php` names others, a catch-all range - an IPv4 prefix shorter
than /8, an IPv6 one shorter than /16 - refused) and Cloudflare's
`CF-Connecting-IP`, pinned in the code (`X-Real-IP`, `True-Client-IP` and
`X-Forwarded-For`, which Cloudflare passes on as the visitor wrote them, are
never read) - with the origin secret (`config_origin_secret()`,
`backend/config/cloudflare.local.php`; anotoki-lib 0.5.2, the owner's
decision of 2026-10-13) believed only on a request that carries it in
`X-Anotoki-Origin`, which a Transform Rule of the owner's zone adds to every
request: anybody's Cloudflare Worker can connect from Cloudflare's ranges,
and any other request from them counts as its edge (the context's tenth,
last argument) -, the one the visitors' limits count by: the feedback's limits and
the error log's client hash see the visitor's address bucket (an IPv6
address by its /64), never Cloudflare's.

- **The error log** (`academy_error_log()`, `GET /api/admin/errors?days=&level=&status=&search=`,
  `GET …/{fingerprint}`, `DELETE …[?before=]`): what went wrong, one JSON line
  each in `backend/storage/logs/errors-<UTC day>.jsonl` - a 5xx, a 404, 405,
  413, 415 or 429 answered, a failure the error middleware answered 500 or
  503, PHP's warnings and fatal errors - redacted: never a header, a body, a
  query string or a token; a keyed hash of the address bucket instead of the
  address (the key `backend/storage/anotoki-lib.key`, made once), and the
  person's id on the admin tools' own routes (their guard tells the log who
  asked) and on a page's report - elsewhere none: the error middleware and
  the library's outer middleware write outside the routes, before the
  library's `Identify` has found who is asking. A 401, a 403 or a 422 is an answer, not a failure:
  never written; nor is a 503 that says a state (`update_pending`,
  `feature_unavailable`, `not_set_up`: the library's `expected` codes, 0.5.0),
  while a 503 that is a failure (`database_unavailable`) is. The library keeps
  30 days and 64 MB in all. Files, so it works while the database does not; it
  answers while an update waits. Clearing it is recorded (`errors.cleared`).
  **The pages' own errors** come here too (anotoki-lib 0.5.0, the owner's
  decision of 2026-10-11): the browser's reporter (`core/error-report.config.ts`)
  sends each error a page meets, scrubbed, to **`POST /api/client-errors`**
  `{type?, message, page?, stack?, status?}` → 204 (the library's
  `ErrorLogRoutes::client()`): anybody's, behind the gate (503 `update_pending`
  while an update waits) and the person's `Identify` (a bad token 401
  `invalid_token`, a visitor's key never read); JSON only (415), 8 KB at most
  (413), a message (422); 20 an hour from one sender - a person by their
  account, anybody else by their address bucket - and 500 a day from the
  visitors, as many from the people signed in (429 `too_many`); written as
  `source: client`, redacted again.
- **The audit log** (`academy_audit()`, `GET /api/admin/audit?actor=&action=&target_type=&from=&to=&page=`,
  `GET …/facets`; read only): who did what in the admin panel, in the table
  `anotoki_audit_log` (the library's set `anotoki_admin`): the languages and
  the words (`translations.saved`, `language.created` …, from the library's
  translations routes through `academy_audit_record()`), a person's data
  deleted, the scrub run, the migrations applied (`migrations.applied`, after
  the entries that waited for the table: `audit-pending.jsonl`, flushed after
  an Apply), the backups, the feedback handled, the error log cleared. Kept;
  no address but a person's own id. An actor is found by name through this
  site's `users` (`actorIds`).
- **Feedback** (`academy_feedback()`): the visitors' messages, in the table
  `anotoki_feedback`. **`POST /api/feedback`** `{kind, section?, subject?,
  message, email?, page?, language?, anonymous?, website}` → 201: a person's
  (their id from the token), or while the IAM does not require sign-in here a
  visitor's or nobody's (the library's `RequireCaller`, `empty`); `website` is
  the honeypot; the places are the app's sections (`FEEDBACK_SECTIONS`:
  `Kanji`, `Exam`); limits 5 an hour and 20 a day from one sender - a person
  by their account, anybody else by their address bucket - and 300 a day from
  the visitors, as many from the people signed in (a keyed hash of each
  sender for a day, in `backend/storage/cache/`). **The address for an answer is the one the
  sender sends**: the form writes a signed-in person's account address in for
  them, which they may change or clear - a cleared field keeps none, the
  server never puts their account's back (the form's words: "Only if you
  would like an answer") -, and "Send it without my name" (`anonymous`)
  keeps neither their id nor an address - the owner's decision of 2026-10-11,
  for every site: "it's their choice" ([decisions.md](decisions.md)). Nothing of where a message came
  from is kept with it. **No mail is sent** (the owner's decision): the admin
  panel's Feedback link counts the new ones (`GET …/unread`, the library's
  `FeedbackUnread`). The page: `GET /api/admin/feedback?kind=&status=&section=&search=&page=`,
  `…/facets`, `…/unread`, `…/{id}` (opened: read), `PUT …/{id}/status`,
  `DELETE …/{id}` (recorded). Spam is kept 30 days and a resolved message a
  year, then pruned once a day after an answer. The scrub of a deleted
  account, and a delete on the People page, take the address and the browser
  off their messages (`Feedback::forgetPeopleOn()`, on the scrub's or the
  delete's own connection). A message deleted is recorded with the time it
  was sent, inside the delete's own transaction: a restore deletes it again.
- **Backups** (`academy_backups()`): the whole database, by COPY through PDO
  (a connection of its own, `Copy::connect()`), in
  `backend/storage/backups/<id>.anotoki-backup` with its `.json` beside -
  beside this app's own JSON copies in the same folder, which the library
  never touches (*The study data outside the database*, below;
  [hosting.md](hosting.md), *Backups*).
  One a day after an answer (asked for by the day's first page load, beside
  the app's own copy), one before every update (the Apply's, after the app's
  raw copy of every table: `upkeep_before_apply()`, both named in the
  Apply's note; one that cannot be made stops the Apply), one before a
  restore, and the `ADMIN`'s own. **How many are kept is the library's
  rotation by number**: the last 14 daily ones, 5 made before an update, 5
  before a restore - the oldest of a kind goes as a new one comes -, and the
  `ADMIN`'s own until the owner deletes them on the Backups page; none is
  deleted for its age (the owner's decision of 2026-10-11, "kept until I
  delete them", as the IAM and every anotoki site read it). So a person whose
  account the IAM deleted stays in a backup made before, until it rotates out
  or the owner deletes it. The page: `GET /api/admin/backups` (the list
  and the status), `GET …/proof`, `POST` (one now), `GET|DELETE …/{id}`,
  `POST …/{id}/ticket` (a single-use link, 60 s), `GET …/{id}/preview`, `POST
  …/{id}/restore {confirm}` - each making, download, delete or restore behind
  a sign-in of the last ten minutes (the page offers **Sign in again**) and
  recorded in the audit log; `GET …/{id}/file?ticket=` is the download,
  outside every check but its ticket (a browser's navigation sends no token).
  A restore puts the backup's tables back in place where the schema is the
  backup's (the audit log and the bookkeeping kept) - only a backup made
  here: since anotoki-lib 0.5.0 each carries this installation's seal (an
  HMAC of its id and SHA-256 under a key derived from
  `backend/storage/anotoki-lib.key`; the list says `sealed`), and one without
  it - every plain one made before 0.5.0, a file put into the folder - is
  refused (422 `archive_invalid`) and restored offline alone
  ([hosting.md](hosting.md), *Backups*). Both of a restore's hooks are the
  library's people module's (`People::restoreHooks()`): inside its
  transaction, before anybody sees the restored rows, every delete the audit
  log - never restored - holds from the backup's time on is done again
  (`People::replay()`: a person's data, with this site's own delete,
  `people_delete()`, its request null - no copy -; a feedback message, by its
  id and the time it was sent), and whatever fails rolls the restore back
  whole; once it committed, the scrub of the IAM's deleted accounts at once
  (`People::afterRestore()`: the restored database may name an account
  deleted since; a scrub that does not finish - the IAM out of reach - is the
  restore's `after_restore_error`, the Backups page's note, and the hour's
  stamp goes after the answer, on this site's runner, so the next request
  tries again). A restore is refused while a check of the IAM's deleted
  accounts runs ("restore again in a minute"). Every file of the backups is
  the site's own user's alone (`0600`), every folder `0700`. The lock is the upkeep's (`UPKEEP_LOCK`): one
  backup, one Apply or one content rebuild at a time. The list, making one,
  the download and a delete answer while an update waits - never a restore.

Every folder they write under `backend/storage/` (`storage_dir()`; a test's
own folder for a throwaway database) is guarded by a deny-all `.htaccess`
(the library's `GuardedDirectory`). Nothing of them deletes a file it did not
make: the backups and logs that were there before stay where they are, for
the owner to remove.

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
a visitor's address (`client_address`, in the place of the committed
default, Cloudflare's published ranges: `CLIENT_ADDRESS_DEFAULTS` in
`config.php`): [hosting.md](hosting.md), *Visitors on the site*.

**Every settings file is read cleanly or not at all** (since 2026-10-18, the
IAM's rule of 2026-10-13; `config_require_cleanly()`): the two above, the
optional `app.local.php` and `cloudflare.local.php`, and the setup page's
token. One that does not start with `<?php` - a byte-order mark, a blank
line or a space before it, or no such line at all, which would print the
whole file, `database.local.php`'s password among it - is passed over
before PHP ever compiles it: its first five bytes are read alone.
(Compiled, one with `declare(strict_types=1)` after such a start is a fatal
error no handler catches - every request, where the site stands included,
a 500 instead of "not set up", and `cloudflare.local.php` never failing
closed: the checkpoint review of 2026-10-18.) One that does start so is
required inside an output buffer, by a closure of its own - what it prints
all the same (text after a closing tag, an echo, a buffer of its own left
open) is caught and never sent, and the file is passed over; so is one PHP
cannot open, parse or run. PHP's error log says so at most once a day for
each fault (`config_said()`, a stamp in `storage/cache/`), by the fault and
the number of bytes printed, never the file's text nor what PHP said of it
(an error's words can quote it). A required file so passed over leaves the
copy not set up (`config_file_problems()`, named by `manage.php --check`
and the setup page, whose Save writes it again), `app.local.php` stands for
its defaults - but for its trusted proxies, which then believe nobody (it
may be the very file that said `[]` for a host not behind Cloudflare:
coarser, never looser; `client_address_trusted_proxies()`) -,
`cloudflare.local.php` for a secret no request carries - and so does one
read cleanly that names no usable secret (blank, no list, a misspelt or
another key, a value that is not a string; since 2026-10-18): only deleting
the file switches the secret off
([hosting.md](hosting.md), *Visitors on the site*, *The origin secret*); one read cleanly that
returns no list of settings is a problem of its own ("holds no settings").

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
  then the anotoki library's `TranslationService.init()` decides the
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
  available right now". The gate is the outermost of what the app draws,
  and everything of the app's - the bar, the page and the footer - is its
  marked template
  (`<anotoki-site-gate><ng-template anotokiSitePages>…</ng-template></anotoki-site-gate>`,
  `SitePagesDirective`; anotoki-lib 0.1.1, marked since 0.2.0; the bar and
  the footer inside it since 0.6.3): it is made only while the site is
  open, so the library's page stands alone - in a `<main>` of the gate's
  own, with no bar and no footer around it (the owner's rule of 2026-10-18:
  they could be under the update too) - and nothing of the pages runs behind
  it — no page asks for its data, hears a key or ticks a clock there — and a
  page open when the site stops is taken down (an open exam paper is kept for
  the tab as it goes: [exam.md](exam.md), *In the browser*). The site's
  `ADMIN` on the Migrations page while an update waits has the app's frame
  with it: the bar, its Migrations link alone, and the footer. Behind the
  gate, under the bar, the screen of the address, or what stands in for the app
  (`standin/`: the Sign in card after a session that ended, a problem page;
  the anotoki library's `<anotoki-sign-in-failure>` in `#signInFailure`
  after a sign-in that came back without one, for a person or a visitor -
  drawn by its `<anotoki-sign-in-failure-route>`, which loads the screen's
  code as it is shown, never in the first load (anotoki-lib 0.5.0); on
  the way to the IAM, nothing; a legal page - Terms, Privacy, Contact - is
  drawn in every one of those states, *The legal pages* below), then the
  family's footer (`<anotoki-site-footer>`, *The foot* below): the version,
  **What's new** (which opens the app's changelog dialog,
  `core/changelog/changelog-dialog.component`) and **Feedback** (the
  library's form), and under them Terms · Privacy · Contact. The bar and
  the footer are drawn in every state of the app's own - the Sign in card,
  a failed sign-in's screen and the problem page too -, never around the
  library's page; after the gate, the kit's question
  host (`<anotoki-confirm-host>`: the one question `ConfirmService` asks -
  the admin panel's "Delete …?", and every question of the app's own, where
  the browser's `confirm()` stood until 2026-10-18) and the app's notice
  host (`<app-notice-host>`, `core/notice/`: what `NoticeService` tells, one
  button, OK, where `alert()` stood) - both keep every key pressed in them
  from `document`, as the bar does.
- `top-bar/` — the bar (*The top bar* below): the anotoki library's
  `<anotoki-top-bar>` (`@anotoki/lib/shell`, with its brand, theme switch,
  language switcher and icons), worded and wired by this app.
- `core/kit.config.ts` — the anotoki library's UI kit (`@anotoki/lib/ui`,
  since anotoki-lib 0.2.0, each piece from its own entry point since 0.3.0:
  `ui/button`, `ui/dialog`, `ui/forms`, `ui/config` - never the barrel,
  which would put every piece in the first load) and its shell, wired to this
  app (`provideKit()`): the kit's words are the library's keys in this app's
  database (the translation service's `forKit()`: `anotoki.topbar.signOut`,
  `anotoki.theme.auto` …, which migration 009 filled with the app's own words,
  the owner's rewordings included; with no strings, `KIT_ENGLISH` where the
  app says a word its own way, else the library's own English or informal
  Slovak), the language on the page (English in the admin panel), the theme
  (`ThemeService`: `academy-theme` on the device, the anotoki account's
  while signed in, a choice saved to it, a refusal said by the library's
  note) and the languages on offer (`forShell()`). The pages' building
  blocks everywhere are the kit's - buttons, dialogs, questions, fields (text
  fields, the notes' textareas, the exam's tick box), the spinner, menus, page
  headers, cards, alerts, badges, empty states, segmented choices, choice
  chips and chips, labelled groups, disclosures, link tabs and the
  family's table (`anotokiButton`, `<anotoki-dialog>`, `ConfirmService`,
  `anotoki-text-field`, `<anotoki-card>`, `<anotoki-alert>`,
  `<anotoki-chip-group>`, `<anotoki-link-tabs>` …), its class
  names its own (`anotoki-<piece>__<part>`). A choice of the lessons, the
  practice, Browse and the exam is the kit's (since anotoki-lib 0.6.0, the
  owner's brief of 2026-10-18; a row of the kit's small buttons, the chosen
  ones primary, until then): its segmented choice where its few short
  options fit a phone in both languages (the batch size, how many, Browse's
  type, the result's review - the batch size and how many inside the kit's
  labelled group, `selfNamed`: the name shown over it, said once); one of
  several otherwise its choice chips (`<anotoki-chip-group>`, a radio group
  named by its label: the exam's length, the lessons' kinds and From - each
  lesson's chip heard with how many of its items can be learned now, its
  `name` -, practice's What - each scope's count its quieter `note`, a
  stage's own name alone marked English -, Type and Ask, Browse's lesson
  and stage with their label for a screen reader alone, `hideLabel`);
  several at once its chips (`button[anotokiChip]`, `pressed`) in its
  labelled group (`<anotoki-labelled-group>`), where a chip needs what a
  choice chip cannot hold - a tooltip, the greetings' kana marked Japanese:
  the exam's parts, lessons and sections, practice's lessons with All. The
  exam's "Narrow it down" is the kit's disclosure (`plain`), the paper's
  section tag its badge that wraps, all and none and the review's listen
  its small link buttons. What is truly the study's stays the app's, drawn with
  the tokens: the tiles, an item's head and details, the session and its
  answer box, the lesson batch (its band and tabs), the exam's paper (the
  question, the options, the player, the grid), the dashboard's section
  cards, stages and forecast. (The foot's row went for the family's footer
  with anotoki-lib 0.6.3.)
- `app.routes.ts` — the learner's pages under one parent whose
  `canActivateChild` is the library's `personOrVisitorGuard`: `/` home, `/kanji/…` (lazy:
  `kanji/kanji.routes.ts`), `/exam` (lazy); the admin panel `/admin/…`
  (the library's `staffGuard`: EDITOR or ADMIN — a visitor goes to the IAM too —, and `whenReady`) with
  `translations`, `languages`, `people`, `feedback`, `errors`, `audit`, `backups` and `migrations`
  (lazy; all but Translations behind the library's `adminGuard`; every one the library's page in
  the panel's frame, Translations and Languages with the library's question before leaving unsaved
  changes); `/auth/callback` (the library's `AuthCallbackComponent`) and `/sign-in-failed` (its
  `SignInFailureComponent`, which `AppComponent` draws in the page's place while a failure stands), unguarded;
  `/terms`, `/privacy` and `/contact` (*The legal pages* below), each a route of its own whose
  parent is their frame (lazy), unguarded, before the learner's parent and its `**`.
  The old `/translations` and `/languages` lead to their new addresses.
  `/kanji`, `/exam` and the admin panel open only while the app can be used
  (`whenReady`: signed in or visiting), so Back or Forward on a stand-in page loads no data.
- `core/` — `api/` (`ApiService` over HttpClient, the response types, and the
  interceptor that stops the app on any `not_set_up` answer: the settings
  went while a page was open - never on the answer to a page's error report,
  `ANOTOKI_ERROR_REPORT`), `error-report.config.ts` (the anotoki library's
  reporter, `@anotoki/lib/error-report`, since anotoki-lib 0.5.0: the app's
  `ErrorHandler`, every error to the console as before and - scrubbed in the
  page, at most five a page load, each once, never a failed request - to
  `POST /api/client-errors` through the app's HttpClient, so its interceptors
  add what they add to any request - a person's token, or a visitor's key
  (which the route never reads), and `X-Time-Zone`; with
  `provideBrowserGlobalErrorListeners()` a window's errors and a promise
  nobody caught too), `auth/` (the anotoki library's sign-in,
  `@anotoki/lib/auth`, wired in `auth.config.ts` - the boot configuration,
  the token or a visitor's key and `X-Time-Zone` for this site's API, which
  saves may make a visitor, the words, the checks before a sign-in or a
  sign-out, the callback and failure routes, no hint; `AuthService`, this
  app's view of it; `visitor-key.ts` (`VisitorKey`: the key of somebody studying without signing
  in, the move at sign-in), `PrivateLinksService`,
  `SignOutService`, `SignInService` (a visitor's Sign in waits for the saves
  first); [sign-in.md](sign-in.md), *The browser*), `admin.config.ts` (the
  library's admin tools and People page wired to this app: `provideAdminTools()`),
  `feedback.config.ts` (the library's feedback form, which the family's
  footer opens behind its Feedback: `provideFeedback()`), `legal.config.ts` (the
  library's legal pages and the footer's links wired to this app:
  `provideAnotokiLegal(academyLegalConfig)` - the page's language, the
  database's words; the facts come with the pages' frame, below), `notice/`
  (the app's notice: `NoticeService.tell({title, message, detail?})`, drawn
  by `<app-notice-host>` with the kit's dialog, one button, OK, worded by
  whoever raises it at that moment; a report that would not open, a paper
  that could not be scored), `saves-in-flight.service.ts`
  (the saves on their way, which a sign-out — and a visitor's sign-in — waits for), `storage.ts`
  (localStorage and sessionStorage that never throw), `time-zone.ts` (the
  browser's IANA zone), `i18n/` (the app's words, below),
  `kit.config.ts` (above),
  `changelog/` (the version the footer shows - the changelog's newest
  entry - and the What's new dialog it opens),
  `audio.service.ts` (the two voices take turns),
  `format.ts` (times, dates and percentages in the language on the page, or
  in the date order and clock of a signed-in person's account),
  `testing/` (stand-ins of the sign-in's states, the library's module as a
  spec needs it, the English the kit says with no strings (`kit-english.ts`),
  the kit's question answered: `kit-question.ts`; a spec's translation
  service is the library's `provideTestTranslations()`).
- `admin/` — the admin panel, in English: Translations (EDITOR, ADMIN),
  Languages, People, Feedback, Errors, Audit log, Backups and Migrations
  (ADMIN): every one the anotoki library's page (`<anotoki-translations-page>`,
  `<anotoki-people-page>`, `<anotoki-feedback-page>`, `<anotoki-error-log-page>`,
  `<anotoki-audit-log-page>`, `<anotoki-backups-page>`,
  `<anotoki-migrations-page>` …) in the panel's frame (`<main class="wrap
  wide admin" lang="en">`); the bar's links lead between them (below). Its
  titles are "<page> · Admin panel · Japanese Academy"
  (`core/i18n/title.strategy.ts`). Its questions ("Delete …?", "Import …?",
  "Leave without saving?") are the kit's (`ConfirmService`), the library's
  pages' own; People's delete asks only its question, as the owner decided
  (no typed confirmation). The page-question of before
  (`admin/page-question.ts`) went with the app's own People page.
- `home/` — the home page (kanji summary, exam history) and, at its foot,
  Your data (`your-data/`, above; a signed-in person's only); at its top (and
  the kanji dashboard's) the visitor notice (`visitor-notice/`: kept for this
  browser for the days, Sign in; once, what moved at a sign-in, or that the
  key was no longer known).
- `kanji/` — the trainer: `kanji-shell` (its tabs - the kit's link tabs, a
  nav named Kanji of ordinary links, the one the screen says marked, an
  item's page none; on a phone they scroll sideways in the kit's strip, never
  the page, the page's tab brought into view -, and what is drawn over the
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
  (`@use "@anotoki/lib/styles" as anotoki`: Manrope, the family's font,
  bundled; the family's base - the page, the headings, links, code, the one
  focus ring, motion off for those who ask -, its utilities - `.page`,
  `.stack`, `.cluster`, `.muted`, `.small`, `.facts` … - and its tables -
  `.table`, `.table-scroll`), then `_tokens.scss` (Japanese's palette given
  to the library's tokens, `anotoki.root()`, light and dark - the kit and
  the library's pages draw with them, its alerts' and badges' grounds in this
  app's own hues -, the app's own names for them
  (`--bg`, `--ink`, `--accent` …), and the study colours, kanji, vocabulary
  and the stages, the app's alone: the dark ones under
  `prefers-color-scheme: dark` unless the page is told light, and under
  `[data-theme='dark']`), and after the family's (`meta.load-css`)
  `_base.scss` (the reading size, 16 px where the family's base says 15, the
  frame `.wrap`, `kbd`, the stand-in pages)
  and `_items.scss` (tiles and an item's details, shared by the kanji
  screens). No rule of the app reaches inside a kit component.
- `standin/` — the two pages of the app's own that stand in for it, the Sign
  in card and the problem page (a failed sign-in is the anotoki library's
  screen since 2026-10-11, and a site not set up, being updated or out of
  reach the library's page since 2026-10-07, each in its own words),
  and `keptWord()`: what is drawn outside the router's screens (these pages,
  the top bar, the "What's new" frame; the family's footer says the
  library's own words then) may be drawn with no strings
  at all, so it falls back to the seeded English written in the code (a
  `const ENGLISH` map in each; `backend/tests/unit/translations.test.php`
  holds it to the seeded English), never a key.
- `public/` — `favicon.svg` (the 日 stays the tab's icon), `anotoki.png` (the
  family's mark), `changelog.json`; `angular.json` copies the library's
  `theme-boot.js` (the stored light/dark choice, before the first paint;
  `data-storage-key="academy-theme"` in `index.html`) beside them.

wanakana (romaji → kana as you type) comes from npm and is bundled, and so
are the anotoki library's kit, its sign-in (the IAM's browser SDK was a copy
in `core/auth/sdk/` until 2026-10-11) and Manrope, so the built app needs
nothing from the network.

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
  Translations, and for ADMIN Languages, People, Feedback (with the number of
  new messages beside it: the library's `FeedbackUnread`, asked again as the
  panel's pages change - no mail is sent for one), Errors, Audit log, Backups
  and Migrations — English words, as the area is, not keys.
- **the language** (the library's language switcher, given the translation
  service's `forShell()` in `core/kit.config.ts`): a round button with the code
  ("SK"), named "Language: Slovenčina (SK)" (`anotoki.language.button` holds
  `{code}`: a voice user says what they see), a menu of the languages under
  their own names; only where the learner's pages are, and only with two or
  more. A signed-in person's choice goes to their anotoki account too (*The
  app's words*); a language whose words cannot be had leaves the page as it
  is, with a note under the button (`anotoki.language.notLoaded`); so does
  a choice the account refuses for any reason but a language it does not
  offer (`anotoki.language.notSaved`).
- **the theme** (the library's switch and `ThemeService`, wired in
  `core/kit.config.ts`): light, dark or the system's, a segmented radio group
  of three icons (102 × 40), "System" the app's word under the library's
  `anotoki.theme.auto` (the library's own says "Automatic");
  `<html data-theme>` for light or dark, nothing for the system's. Signed in,
  it is the anotoki account's — one theme for every anotoki site, this one's
  admin panel too (the owner's decision of 2026-10-06): taken from the
  account, and a choice here saved to it; a refusal puts the account's theme
  back, with a note under the switch that says so (the library's
  `anotoki.theme.notSaved`, since anotoki-lib 0.3.0 - before, the app worded
  the refusal's reason), until the next choice, a
  click elsewhere, Escape on any of the bar's controls, or the account gone
  (signed out). Nobody signed in, or an IAM that sends no preferences: per
  device, as before. The theme shown is kept in `localStorage`
  (`academy-theme`), and the library's `theme-boot.js` sets it before the
  first paint ([sign-in.md](sign-in.md), *The account's preferences*).
- **the person's menu** (a round button with their initial, their name beside
  it from 961 px, 1530 in the admin panel): their name, address and role (Administrator / Editor);
  **Your anotoki account** (the IAM's account page, a new tab); **Admin panel**
  (`topbar.admin`, "Administrátorský panel" in Slovak; reworded by 006) for
  EDITOR and ADMIN, or **Back to Japanese Academy** in the admin panel; **Sign
  out** (`SignOutService`: it waits for the answers and notes on their way —
  a spinner and "Saving…" — and asks first when something would be lost). —
  Signed out with the Sign in card or the failure's screen on the page, or
  visiting: **Sign in** instead (a visitor's through `SignInService`, which
  waits for the saves too).

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
`ADMIN_PHONE_BAR_MAX` = 1170 px (2026-10-11: eight links since anotoki-lib
0.4.0's tools, four before, when it folded up to 960): its row is wider
(`--anotoki-topbar-max-width` 1540 px, the learner's 1040), its brand the
short one ("Japanese" with "admin panel" small under it) up to
`ADMIN_SHORT_BRAND_MAX` = 1350 px, and the person's name beside the initial
from `ADMIN_NAME_BAR_MIN` = 1530 px; folded, "Japanese" and "admin panel"
stand beside the menu button. Measured in Edge with the real labels, a
two-digit feedback count, a 20-character name and a scrollbar: the short
brand, the eight links, the theme and the initial take 1155 px, the whole
brand 1333, with the name 1516 (`screens.js`'s room checks 1170, 1171, 1351
and 1530).

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
| 1170, the admin panel (ADMIN) | folded (above): brand 12-132 ("Japanese" / "admin panel"), theme 1010-1112, menu button 1118-1158 |
| 1171, the admin panel (ADMIN) | brand 20-140 (the short one), links 156-917 (Translations, Languages, People, Feedback with its count, Errors, Audit log, Backups, Migrations), theme 971-1073, the person 1083-1151 (the initial) |
| 1351, the admin panel (ADMIN) | brand 20-318 ("anotoki Japanese · admin panel"), links 334-1095, theme 1151-1253, the person 1263-1331 |
| 1530, the admin panel (ADMIN) | brand 20-318, links 334-1095, theme 1148-1250, the person 1259-1510 with the name |
| 961 | language 529-569, theme 579-681, the person 691-941 with the name |
| 1280 | brand 140-327, links 343-508 (Slovak 343-520), language 728-768, theme 778-880, the person 890-1140 |

**The keys.** No key pressed anywhere in the bar reaches `document`: the
lesson quiz, the reviews and the exam listen there (Enter submits a card or
hands a paper in, Space plays a word, 1-4 and A-D choose), and Enter or Space
on a button of the bar would do that instead of pressing it. So the library's
bar stops every key (`isolateKeys`, on by default) and handles Escape itself,
which no document listener would hear; what the key does on the control is
the browser's and stays so. The footer is kept the same way: the app stops
every key pressed in it - What's new, Feedback and the form it opens - on
the way up (`(keydown)` on `<anotoki-site-footer>`, `app.component.html`),
and the What's new dialog keeps its own (Enter there opens or closes the
news, never hands a paper in). Specs prove it with the real exam (a spoken
last question: nothing chosen, played or handed in) and the real review
session (nothing checked), for the bar's controls and the news
(`core/testing/news-controls.ts`), and `app.component.spec.ts` for the
footer's own.

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

**Its words** are keys. The bar's own (`topbar.home`, `topbar.exam`, the
reviews due on the phone's button, Admin panel, `account.noName`; migration
005) are the app's, each with its English in `top-bar.component.ts` for a
bar drawn with no strings (`keptWord()`). The person's role and Your anotoki
account, which the bar gives the library's top bar worded, are said from the
library's keys (`anotoki.topbar.roleAdmin`, `roleEditor`, `account`: a
library key never shows as a key). Those the library's pieces say themselves (the sections'
name, the menus' names, Sign in, Sign out, Saving…, the theme's, the
language's, Close) are the library's keys (`anotoki.topbar.*`,
`anotoki.theme.*`, `anotoki.language.*`, `anotoki.ui.close`), read from
this app's database through the translation service's `forKit()`
(`core/kit.config.ts`): migration 009 copied the app's own words there
(until 0.3.0 the kit looked them up under the app's keys), the owner's
rewordings included; with no strings, the English this app says its own way
(`KIT_ENGLISH`: "The app’s sections", "System"), else the library's own.
**In the admin area** the bar reads in English, whatever the reader
chose, with no case in the bar: the title strategy tells the translation
service the address (`noteAddress()`), and under `/admin` it answers from the
bundle's English (`effectiveLanguage`; `<html lang>` follows), and so does the
kit's `language`. The reader's own language stays (`language()`): the IAM's
pages still open in it.

**The foot** of every page, and of the admin panel, is the anotoki family's
footer (`<anotoki-site-footer>`, `@anotoki/lib/footer`, since anotoki-lib
0.6.3 - the build analyzer's, the owner's choice of 2026-10-18: its order,
its words and its top border): a thin line across the top, then, centred in
the muted ink, the row "Version 0.5.1 · What's new · Feedback" (a dot drawn
between two parts and never read; a part left out takes its dot with it),
and under it **Terms · Privacy · Contact** (`<anotoki-legal-links>`, a nav
named "Legal", the page that is open marked `aria-current`), in a
`<footer>` landmark of its own; it wraps at 390 px and is not printed. Its
words are the library's (`anotoki.footer.*`, written into this app's
database by the library's `anotoki_translations/012`; `anotoki.legalLinks.*`),
the database's string first, read through the kit's lookup (`forKit()`), in
the language on the page - English in the admin panel -, the library's own
English and Slovak while there are none. What the app gives it
(`app.component.html`):

- the version: the newest entry's of `frontend/public/changelog.json` (three
  numbers, MAJOR.MINOR.PATCH since 2026-10-07; `frontend/package.json`'s
  `version` the same - the one source, the spec holds the two together),
  asked for once a page load; with no changelog (not come yet, or none on
  the server) neither the version nor What's new is drawn;
- **What's new**: the app's own changelog dialog (the kit's
  `<anotoki-dialog>`, made while it is open: its Close and Escape and the
  backdrop close it; the newest release marked by the kit's badge; its
  heading `whatsNew.title`), opened on the footer's `(whatsNew)`. Until 0.5.1
  a dot beside it marked news a browser had not opened (`whatsNew.unseen`,
  `academy-changelog-seen` in localStorage); the family's footer has none,
  and the dot, its word and its stored item went (migration 012);
- **Feedback**, while the app itself is shown (to a person or a visitor;
  not on the way to the IAM, on the Sign in card, on a legal page signed
  out, on the problem page, nor to the `ADMIN` on the Migrations page while
  an update waits - the server would refuse the message): the footer opens
  the library's form (`@anotoki/lib/feedback/form`, configured by
  `core/feedback.config.ts`) in the kit's dialog itself, its code loaded
  with the first press (`@anotoki/lib/footer/feedback`), named by the
  button's words, the focus back on the button after - what kind
  ("Something does not work", "An idea", "Something else"), the place (the
  app's two sections, Kanji and Exam), a subject, the message, an address
  for an answer (a signed-in person's account address written in, which
  they may change or clear: the server keeps what is sent, never their
  account's in its place) and, for a person, "Send it without my name" -
  sent to `POST /api/feedback` with the page's address without its query.
  The form's words are the library's `anotoki.feedback.*` (the library's
  `anotoki_translations/004`). No mail is sent: the admin panel's Feedback
  link counts the new ones (*The admin tools*, above).

Like the bar, no key pressed in the footer, the news or the form reaches
`document` (Enter in the message never hands a paper in).

## The legal pages

Terms, Privacy and Contact (since 2026-10-18, anotoki-lib 0.6; the owner's
brief for every anotoki site) are the anotoki family's pages
(`@anotoki/lib/legal/pages`) with Japanese Academy's facts, at `/terms`,
`/privacy` and `/contact` - the library's own paths (`DEFAULT_LEGAL_PATHS`,
`core/legal.config.ts`'s `LEGAL_PAGE_PATHS`), where the footer's links go.

- **Anybody's.** What an app keeps is said before anybody signs in to it:
  no guard stands in front of them, nothing on them asks for a sign-in or
  for anybody's study, and `AppComponent` draws them whatever the sign-in
  says - signed in, a visitor, nobody signed in with sign-in required (Sign
  in in the bar, no card, no trip to the IAM), a failed sign-in standing -
  but a start that could not reach its server at all (the problem page) and
  the library's page while the site is not ready (as for every page).
- **The routes.** Each is a lazy route of its own whose parent is their
  frame (`legal/legal-frame.component`: the page's column, `<main
  class="wrap" id="legal">`), placed before the learner's parent and its
  `**`. Never one parent with an empty path holding the three: the router
  takes an address it has read whole (`/`) for such a parent when none of
  its children match, and would draw the empty frame at `/` with no guard
  (the survey's lesson of 2026-10-17). `app.routes.spec.ts` holds `/` and
  an unknown address (and `/terms-of-use`, `/privacy2`, `/contact/me`) to
  the home page under the learner's guard, and each legal page to its frame
  with no guard. Their titles are the library's headings
  (`anotoki.legal.termsTitle` …).
- **The facts** (`legal/legal-facts.ts`, given by the frame, so they - and
  their strings' keys - load with the pages, never in the first load; the
  root configuration, `academyLegalConfig()`, says only the page's language
  and the database's words): the site's name, what it is, the day its facts
  last changed (`ACADEMY_LEGAL_UPDATED`), five parts of its own - the
  person's record, the study, the app's own JSON copies, the limits' counts,
  who saved a word -, the visitors for the days the server keeps them
  (`visitorKeepDays`, `GET /api/auth/config`'s `visitor_keep_days`),
  feedback (the kind and the section too), the library's error log, audit
  log and plain backups in the library's words, the browser's storage by
  name (the sign-in's, the IAM's hint cookie - sent here, never read -, the
  theme, the language, the visitor's key and the last one moved, an exam
  paper kept through an update, the admin pages' unsaved words - What's new
  read no more since 0.5.1: the family's footer marks no news unread),
  Umami (the family's, already in `index.html`), and who else
  handles data: the hosting company (WebSupport s.r.o., named by the owner
  on 2026-10-18) and Cloudflare. The operator is the family's (Code Hero s.r.o.,
  support@anotoki.eu, Slovakia: the library's default). Each must stay true
  of the code: the comment above `academyLegalFacts()` maps every fact to
  the code it describes; a change to what the app keeps, or for how long,
  changes its `legal.*` strings (a migration) and `ACADEMY_LEGAL_UPDATED`.
- **The anotoki account** is the IAM's: Privacy links its Privacy page and
  its account page (where an account is deleted), Contact the account page, at the IAM's
  address the app signs in with - the code's, never a string. Every address
  the pages link to is so: an administrator's rewording on the Translations
  page changes words, never where a link goes (`legal-facts.spec.ts` holds
  it with a rewording that names another address). Contact opens the
  feedback form first (the library's), then the family's address.
- **The words**: the library's (`anotoki.legal.*`, its migration
  `anotoki_translations/005_…`, 010 and 011 making five sentences true) - the
  database's string first, an owner's rewording - around the app's own
  `legal.*` (migration 011, English and informal Slovak; the library's
  Slovak addresses nobody, so it reads well beside "ty").

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

Since anotoki-lib 0.3.0 the anotoki library serves and edits these words, on
this app's three tables and behind this app's checks (`Anotoki\Lib\Translations`
on the server, `@anotoki/lib/translations` in the browser; the owner's
decision for the family: one implementation of the words for every anotoki
site, one wire format - the IAM's snake_case). What stays this app's: its
keys and their English and Slovak (its migrations), its checks of who may do
what, its error body, its storage names, its copy of a language's strings
before the language goes, its backups, its command's name.

**The server.** Migration `004_languages_and_translations.sql` made the three
tables and filled them — `en` (English) and `sk` (Slovenčina), each key with
a description for the translator, an English and a Slovak string — and
touches no other table (a test says so). Every insert steps aside for a row
that is there, so a later migration never undoes what the owner reworded.
After this app's own migrations come the library's (the set
`anotoki_translations`, `db_migration_sets()` in `backend/src/db.php`,
recorded as `anotoki_translations/001_…`): its 001 finds this app's tables
and only proves their shape; its 002 adds the library's own keys under
`anotoki.` — the words of its kit (the top bar, the language and theme
switches, the dialogs) and of its status page, in English and Slovak —,
its 003 (anotoki-lib 0.4.0) the words of its sign-in screens
(`anotoki.signIn.*`: "Signing in did not work", Try again, Back, the
reason of each code) and its 004 those of the feedback form
(`anotoki.feedback.*`), each writing a string only where a key has none.
`anotoki.` is the library's
namespace: no key of the app's own lives there, and the catalogue test leaves
it out. The admin tools' pages (People, Feedback, Errors, Audit log,
Backups) have no keys: they are English, as the admin panel is.

Migration `009_strings_through_the_library.sql` moved the app's words for
the kit there first. Until 0.3.0 `core/kit.config.ts` looked each word of the
kit up under one of the app's keys (`topbar.sections`, `language.button`,
`theme.system` …); 009 copies every string of those nineteen keys - every
language, with who wrote it and when - under the library's keys
(`anotoki.topbar.sections`, `anotoki.language.button`, `anotoki.theme.auto`
…) before the library's 002 comes and finds them filled, and deletes the
sixteen keys only the bar read: the kit's, and the person's role and the
link to their anotoki account, which the bar now says from the library's
keys too (`anotoki.topbar.roleAdmin`, `roleEditor`, `account`). Three stay
the app's own: the Sign in card's button and Close (their copies are the
kit's Sign in and Close), and "Admin panel" (`topbar.admin`, which 006
rewords and checks, and from which the bar still says it - its copy,
`anotoki.topbar.admin`, is the library's word for it, which nothing here
reads). Its check fails it unless every string came over as it was, the
library's keys got no language the app's had not, and the sixteen are gone -
so an owner's rewording, and a language left without a string, survive the
move.

Migration `010_people_and_signing_in.sql` (final since 2026-10-11, *The
database*) does the same for the three keys of a sign-in that came back
without one, which the library's screen says now: `signIn.notCompleted` and
`signIn.failed` (the Sign in card's line, and a visitor's note) and
`signIn.signingIn` (the callback page) are deleted - where the owner
reworded one of them in any language, every language of it copied first
under the library's key (`anotoki.signIn.notCompleted`, `failed`,
`signingIn`), with who wrote it and when, so the screen says the owner's
words; the words 004 and 005 seeded are no rewording, and give way to the
library's, which say the same on a screen made for them. The Sign in card
keeps its own two (`signIn.intro`, `signIn.button`).

`backend/src/translations.php` configures the library's `Translations` for
this app (`academy_translations()`): the languages released with it
(`TRANSLATION_SEEDED_LANGUAGES`: English, Slovak - never deleted), a copy of
a language's strings before it goes (`LanguageUsage::beforeDelete`,
`translations_copy()`: `backend/storage/backups/academy-before-language-delete-<code>-<time>.json`,
its name answered as `copy`), and a save that holds its person's row
`FOR SHARE` first, as an answer does (`users_hold()`: an import or a delete
of that person's data and the save take turns). The routes are `api/routes/translations.php`:
the library's `TranslationsRoutes` in this app's route groups, each group
with this app's checks, and every refusal in this app's error body
(`{error, code, …}`):

- **The bundle**, `GET /api/translations/{code}`, for everybody: `{language,
  languages: [{code, name, native_name}], values, english?}` — the
  language's strings with English merged underneath, English itself beside
  them (left out for `en`), and the languages on offer. A regional code is
  answered by its base language (`sk-sk` by `sk`), an unknown or hidden one in
  English. The browser asks every time (`no-cache`) and is answered 304 for
  the `ETag` it holds. It answers while an update waits (its route is the
  library's `TranslationsRoutes::openPath()`, among the gate's open paths:
  the pages need their words then too). While the database has no words yet
  (004 of an upload not arrived whole, or waiting for its Apply), or cannot
  be asked, it answers 503 `translations_unavailable` (`Retry-After: 60`),
  and nothing is logged; the start then shows the problem page, in the
  sentence "not up to date" had (`error.not_up_to_date`) — unless the site
  is being updated by `SiteStatus`'s account, when the library's page stands
  in already, in its own words.
- **A string is text**, never HTML; what stands in for a value is a
  `{placeholder}`, and which ones a key has is fixed by its English string: a
  save that adds, drops or changes one is refused, as is a brace that is not
  a placeholder, a string over 2,000 characters, an empty English string, an
  unknown key or language. A save is checked whole before anything is
  written, in one transaction, and a refusal names its key. An emptied string
  in another language removes it: that key reads in English there. (The
  library's checks, the same on every anotoki site.)
- **Keys are the code's**: migrations write them, the admin panel only
  change strings. A plural is a family, `name.one`, `name.few`, `name.other`,
  asked for by `name` with a number. `backend/tools/translation_keys.php`
  gives the library's key scan (`KeyScanner`) this frontend - every `.ts` and
  `.html` of `src/app` but the specs and `core/testing/` (the IAM's SDK of
  before is gone), and
  the run-time families of `core/i18n/dynamic-keys.ts`; the catalogue test
  and `php backend/translations.php --status` hold them to the database.
- **Languages**: English cannot be hidden, deleted or left without a string;
  a language the migrations write strings for (English, Slovak) cannot be
  deleted; any other can, after a copy of its strings (above). A new
  language is offered only when the owner says so (the Languages page adds
  it hidden unless switched on). At most 20.
- **One wire format**, the IAM's snake_case: `native_name`, `sort_order` on
  every admin address, as in the bundle; a camelCase field of before is no
  field (a test sends one).
- **Backups**: a copy of everybody (the day's, a manual one, the ones before a
  restore) also holds `translations`, `{languages, values: {code: {key:
  text}}}`; a restore passes it over, and `php backend/translations.php
  --import <code> <file>` puts a language's strings back from it. Each
  database holds its own strings: the owner's computer and the website are
  bridged by export and import, not by a migration.
- **The command line**, `backend/translations.php` (never uploaded): the
  library's `TranslationsCommand` under this app's name and usage,
  `--status` (the frontend's keys against the database's; exit 1 when a page
  would show a key), `--export CODE [FILE]`, `--import CODE FILE` (checked as
  a save is, written by nobody: `updated_by` null; a backup of everybody is
  read as a file of strings, `translation_file_strings()`). It applies no
  migration.

**The browser** (`frontend/src/app/core/i18n/translations.config.ts`). The
library's `TranslationService` holds the language on the page and its
strings; it asks for the bundle with this app's plain `fetch()`
(`fetchBundle()`: no token, neither interceptor, the reader's time zone),
keeps the last one under the name this app always had
(`academy-language-cache`, beside the chooser's `academy-language`: a
visitor's choice survives the move) so a returning reader sees no keys while
the request is out, and sets `<html lang>`. The language is the first of:
`?lang=` (taken out of the address and kept for the tab in
`sessionStorage`), the chooser's choice (`localStorage`), the `locale` of the
IAM's token, each of the browser's languages and its base (`sk-SK` asks for
`sk`; a Czech browser reads Slovak while there is no Czech), and English. For
somebody signed in whose account sends its preferences
([sign-in.md](sign-in.md), *The account's preferences*), the token's
`locale` comes before what this device remembered: `?lang=`, a choice made
on this page, the account's language, the device's choice, the browser's,
English — the family's ranking. A changed `locale` (a change on the
account's page, on another anotoki site or in another tab) is followed when
it comes. The page changes language only once the new bundle is in memory,
and a key with no string shows as itself and warns once in the console —
the owner wants to see which. The words are asked for only while the app
itself, or its Sign in card, is shown (`wordsCanBeAsked()`), and a 503 is
read as what the app can show (`bundleRefused()`: not set up, being
updated, else the problem page while the app starts or has no words).

- The `translate` and `translatePlural` pipes (impure: the language changes
  under a constant key), `t()` / `plural()` / `number()` in code, the
  `localDate` pipe and `core/format.ts` for dates, clocks and relative times
  in the language's locale (`'en-GB'`, `'sk-SK'`), whatever the system's is.
  A signed-in person who chose a date order or a clock for their anotoki
  account gets those instead (`TimeWording`, `core/i18n/time-wording.ts`:
  the service's words with `dateFormat()` and `timeFormat()` from
  `AuthService.preferences`; [sign-in.md](sign-in.md), *The account's
  preferences*): 6.10.2026, 06/10/2026, 10/06/2026 or 2026-10-06, and 14:30
  or 2:30 pm in the language's words; a date with its time is the two side
  by side, each as chosen or as the language writes it (`2026-10-06 14:30`).
  The admin panel's moments too, in its English (`fmtAdminMoment()`), and the
  kanji dashboard's hour axis (`fmtHour()`: "15", or "3 pm" on a 12-hour
  clock, one line over its three bars). Nothing chosen, a visitor, or an IAM
  that sends none: the language's own way, as before.
- State holds keys, kinds and `ApiError`s, never a worded sentence, so a page
  follows a change of language without being made again; a failed request is
  worded from its code (`error-text.ts`), never with the server's sentence.
- The chooser (the library's language switcher, given the service's
  `forShell()` in `core/kit.config.ts`) sits in the top bar in every state but
  the admin panel's, and draws nothing while fewer than two languages are on
  offer. A language whose words cannot be had leaves the page as it is, with
  a note under the button. Like the whole bar it keeps its keys to itself:
  Enter on a language never submits a card or finishes a paper behind it,
  and switching changes words only. A signed-in person's choice, once the
  page has switched, also goes to their anotoki account (one save at a time,
  the latest last, nothing while the IAM sends no preferences), so the IAM
  and the other sites speak it, this one at the next visit too. It holds for
  the visit whatever the account answers; a language the IAM does not offer
  (`invalid_request`) stays this site's own for the visit and says nothing,
  any other refusal says so in a note under the button.
- The kit's words (`forKit()`): the database's string of the library's key,
  the owner's rewordings included; while no words are in memory the English
  this app says its own way (`KIT_ENGLISH`: "The app’s sections", "System"),
  else the library's own. The note under the theme switch when the account
  refuses a theme is the library's word (`anotoki.theme.notSaved`).
- The admin panel reads in English (`effectiveLanguage`): the bar, the footer
  and the dialog answer from the bundle's English under `/admin`; the
  reader's own choice (`language()`) stays.
- A start that cannot get its strings still draws: the stand-in pages and
  the top bar fall back to the seeded English written in the code
  (`keptWord()`), the footer to the library's own words, and the next
  navigation asks again (the start itself asks once more after half a
  second).

**The admin panel** (`frontend/src/app/admin/`, English, `/admin/translations`,
`/admin/languages`, `/admin/people` and `/admin/migrations`; **Admin panel** in the person's menu of the
top bar, for EDITOR and ADMIN; the bar's links lead to the pages the person
may open, and its menu back to the app). Database updates wait for an ADMIN's **Apply pending** on the
Migrations page (*The database*, *A whole migration waits for an administrator*). Translations and
Languages are the library's pages (`@anotoki/lib/translations/admin`, each in
the panel's frame: `admin/translations/`, `admin/languages/`). Translations
shows each language's coverage with its export and import (a flat JSON
file), a search over the keys, their descriptions and their text, "Missing
in …", the keys in blocks - a plural family as one, with samples for 1, 3
and 12 - and a box for each string; Save sends the changed boxes only and
shows a refusal beside its key. Languages adds, renames, orders, offers or
hides and deletes languages (ADMIN), a deletion naming the copy the server
kept. People (ADMIN) lists everybody who has signed in, the
latest first — name, first and last seen, time zone, items learned, exam
attempts; the zone, the moments and the counts each on one line, the table
scrolling in its box on a phone, and **Delete data** under the name, so it
is never off the screen — and deletes a person's data after a question that names what goes
(the server keeps a copy first; their IAM account stays). What is typed and
not saved is held by the library's `LocalizationDrafts` in `sessionStorage`
(`academy-admin-drafts`), with whose it is: kept through a reload and a
sign-out - signing in again is a page load -, dropped when somebody else
signs in. Leaving a page with unsaved changes asks first (the library's
`anotokiUnsavedChangesGuard`, the page's own modal question), and closing
the tab asks the browser's question.

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
2026-10-04; 006 likewise; 008 (the words the library's status page took
over) and 009 (`009_strings_through_the_library.sql`, *The app's words*)
since 2026-10-11, reviewed, going up together - a draft would hold back
every file after it, the library's sets `anotoki_translations` and
`anotoki_people` included. **010** (`010_people_and_signing_in.sql`) was
written as a draft too, and is final since 2026-10-11 (the owner's go,
"finalize and apply": its last line written last; it goes up with the
library's files of anotoki-lib 0.4): the library's people column `users.anonymized_at`
(`timestamptz`, empty: the scrub fills it), and the three keys of a sign-in
that came back without one (`signIn.notCompleted`, `signIn.failed`,
`signIn.signingIn`) deleted, the library's screen saying it now - where the
owner reworded one of them in any language, every language of it copied
first under the library's `anotoki.signIn.*` with who wrote it and when (the
words 004 and 005 seeded are no rewording). Its check fails it by name unless
every table of people and their data has the rows it had, the column is
there and empty, every other string is as it was (its text, who wrote it,
when), every reworded string came under the library's key as it was, the
library's key has no language the app's had not, every such key has English,
and the three keys are gone (`tests/api/people-migration.test.php` breaks it
five ways). **011** (`011_legal_pages_and_questions.sql`) was written as a
draft and is final since 2026-10-18 (the owner's go): the legal pages' 40 words of
the app's own, the titles and buttons of the kit's questions and the app's
notices that took the browser's boxes' place, the listen button's name and
what the number on Kanji counts (54 keys in English and Slovak); the
questions' sentences reworded without the question their title now asks,
each only where it is still the seeded text and nobody saved it; the
descriptions that still said "chips" told again. Its check fails it unless
its keys read in both languages, the reworded keys are there in both, and no
reworded string nobody saved is still the old text (a database that runs
every file but 007 never runs it: `visitors-migration.test.php`). **012**
(`012_family_footer.sql`, 2026-10-18) was written as a draft and is final
since the same day (the owner's go: its last line written last); the
library's `anotoki_translations/012`, the footer's four words, runs right
after it (until it is applied the footer says the library's built-in words,
the same English and Slovak): the app's own foot went for
the family's footer (anotoki-lib 0.6.3), and with it the dot beside What's
new, so the three keys nothing reads now go - `whatsNew.unseen` (the dot's
tooltip) and the Privacy page's `legal.storage.whatsNew.purpose` and
`.kept` (the stored item the dot needed, `academy-changelog-seen`) -, and
`whatsNew.title`'s description says it is the dialog's heading alone (the
footer's button has the library's words). Its check fails it unless the
three keys are gone, strings and all, and the dialog's heading still has its
English and Slovak (`unit/translations.test.php` holds its form, 008's). 007 (`007_visitors.sql`, visitors) since
2026-10-05, its last line written once the browser suites had passed: its
schema (users' `CHECK (id > 0)` replaced by `users_person_or_visitor`,
`visitor_key_hash`, `visitor_from`, the sequence `visitor_ids`, two
partial indexes, and a check at its end that every table of somebody's data
kept its rows) and its strings (what a visitor reads, the questions before a
visitor's sign-in, the refusals: 14 keys in English and Slovak, a check that
each has both). While a migration waits (a draft,
or a file still uploading), the app works without what it makes — before
005, without its column (`users_time_zone_ready()`); before 007, without
visitors (`visitors_ready()`: sign-in stays required); before 009, with
the kit saying its own words where the app's had not moved yet; before 010
(and the library's files after it), without the scrub of the IAM's deleted accounts (the library's people module
waits for its column and its tables, records people as before, and the
People page says what is missing), and with the library's sign-in screens
and feedback form in their own built-in English and Slovak (its
`anotoki_translations/003` and `004`, which put their words in the
database, come after 010). And while one of this app's own files is a draft,
the library's files wait with it on every database but the tests' - all of
them, the `anotoki_admin` set that runs before this app's included
(`db_migration_ready()`, `db_own_draft()`): the owner's own server, serving
a working tree with a migration being written, neither stops its pages for
them (503 `update_pending`) nor gets them on an Apply before the owner
accepts the change; meanwhile nothing else applies either (the queue stops
at the first file that waits), and `manage.php --check` names the draft —
and the study
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
(`backend/src/db.php`), four sets in the library's order: its
`anotoki_admin` first (the audit log's and the feedback's tables:
`001_audit_log.sql`, `002_feedback.sql` - a site's own files may move rows
into them, and nothing else makes an `anotoki_` table), this app's folder
`backend/migrations/` (the set `academy`), then the library's
`anotoki_translations` (its words' tables proved, its words added - 003
the sign-in screens', 004 the feedback form's: *The app's words*) and
`anotoki_people` (`001_people.sql`: the scrub's cursor
`anotoki_people_sync` and the ids the IAM deleted, `anotoki_people_anonymized`
- after this app's 010, which gave `users` its `anonymized_at`); the
library's files are recorded with their set,
`anotoki_translations/001_languages_and_strings.sql`; the table `migrations (name, applied_at)` as it has always been
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
instead (the words answered 503 `not_up_to_date`, `translations_unavailable`
since anotoki-lib 0.3.0), and an administrator who
was signed out could not sign in at all. The **Migrations page**
(`/admin/migrations`, `ADMIN`: the library's `<anotoki-migrations-page>`;
the addresses `backend/api/routes/migrations.php`, the library's
`MigrationsRoutes::admin()`, behind `admin_token_checks()`, which
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
cannot be written stops the apply before anything runs) and then the
library's backup of the whole database (its `beforeApplyHook()`: once for
one pending list, none for a database with nothing applied yet; named in the
note too; one that cannot be made stops the apply as well), then applies each
file in its own transaction: the first that fails is rolled back whole and
named ("Stopped at …"), the ones before it stay; why (`error`,
PostgreSQL's own words) goes to the ADMIN on this computer and on a website
alike, in a box under it, as the IAM's page shows it (the owner's decision
of 2026-10-04); the site's error log has it too (`[upkeep] a migration
failed: …`), and the audit log an Apply's entry (`migrations.applied`, after
the entries that waited for its table). The setup page and `manage.php` apply the same way, with the
same copies, under the same lock (`upkeep_migrate()`, which throws naming the
failed file, or saying another apply is running), so no two ever run at
once. "Up to date" once something was applied and nothing failed. When an
Apply leaves nothing to apply, the site runs again without a page load
(`SiteStatus.markReady()`), and the app's words are asked for again
(the library's `TranslationService.reload()`, its `onUpToDate`): the update may
have brought some. The next request then rebuilds the content and saves the
stamp, as after any change of the files.

| Table | Contents |
|---|---|
| `users` | one row per person: the IAM user id (`id`), their name from their latest token, when first and last seen, and their time zone (`time_zone`, migration 005: the IANA name their browser last named, null until it names one); when the IAM deleted the account (`anonymized_at`, migration 010: the library's scrub writes it, with the IAM's placeholder `deleted-<id>` as the name). Since migration 007 also one row per visitor: a negative `id` (`visitor_ids`), the SHA-256 of their key (`visitor_key_hash`) and a keyed hash of the address they came from (`visitor_from`); `users_person_or_visitor` keeps the two apart ([sign-in.md](sign-in.md), *Visitors*) |
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
| `anotoki_audit_log`, `anotoki_feedback` | the library's admin tools (its set `anotoki_admin`): who did what in the admin panel; the visitors' messages (*The admin tools*) |
| `anotoki_people_sync`, `anotoki_people_anonymized` | the library's people module (its set `anotoki_people`): where the scrub of the IAM's deleted accounts stands, and every id the IAM listed ([sign-in.md](sign-in.md), *Accounts the IAM deleted*) |

Every study table has `user_id` first in its primary key, pointing at `users`
(migration 002: the owner's rows became user 1's; see
[sign-in.md](sign-in.md)). The three translation tables are the site's, not a
person's: everybody reads them, the owner writes them, they are not in
`USER_TABLES`, and their queries have no `user_id` ([The app's
words](#the-apps-words)); nor are the library's `anotoki_` tables. Only the owner's own server uses the owner's
database. The tests make their own throwaway databases (`academy_test_…`, see
[testing.md](testing.md)).

## The study data outside the database (never delete)

| Path | Contents |
|---|---|
| `backend/storage/backups/` (gitignored; `backups/` at the top until 2026-10-04) | `academy-<date>.json`: a copy of all the study data — per person their progress, answer log, exam attempts with their reports — taken at the first page load of each day (the UTC day; every date and time in a backup's name is UTC); the last 14 are kept. Also one before a restore; one of a person's data alone before their full reset, before they bring their data back from a file, and before an administrator deletes it (`academy-before-reset-user-<id>-<time>.json`, `…-before-import-…`, `…-before-delete-…`; their last 14 of each kind kept; a name already taken gets `-2`); and a raw copy of every table (`….raw.json`) before a migration (taken once per upload, however often a failing one is tried: `.before-migration-raw.json` notes what it was taken with - `.before-migration.json` until 2026-10-11, a name the library's note has now). And, since anotoki-lib 0.4.0, the library's **backups of the whole database** (`<id>.anotoki-backup` and its `.json`: daily, before an update, before a restore, and an `ADMIN`'s own - *The admin tools*, above): the last 14 daily, 5 before an update, 5 before a restore, the `ADMIN`'s own until the owner deletes them on the Backups page, none deleted for its age (the owner's decision of 2026-10-11). The library never touches the app's files, nor the app the library's. `php backend/manage.php --restore=<file>` puts a `.json` back: format version 2 is everybody's data (or, with `"everybody": false`, the people it names, and only theirs); version 1 (from before user ids, the owner's alone) is no longer read: every backup there is is version 2 |

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
| `backend/storage/` | what the backend writes for itself: `backups/` (copies of the study data, above, with the app's words in a copy of everybody; a deleted language's strings; the library's backups of the whole database), `logs/` (the library's error log, 30 days), `cache/` (the IAM's keys and its answer, cached; the visitors' secret; the library's stamps and limits), `anotoki-lib.key` (the library's key for the hashes it keeps), a website's setup lock (`installed.lock`: the setup page is never offered again). Never deleted by hand but by the owner |
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
