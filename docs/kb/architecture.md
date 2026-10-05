# Architecture

A study app for one person on their own computer, and, since 2026-09-27, a
website for several (each with their own data, signed in through the anotoki
IAM). Two halves since 2026-09-29, in the layout of the other anotoki sites:

- `backend/` — PHP 8.1+ with **Slim 4** (routing and middleware; Composer's
  packages committed in `backend/vendor/`), everything kept in **PostgreSQL**.
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
        │      │   per address with data: set up? → upkeep (src/upkeep.php) → the person
        │      │   (src/auth.php) → on a page load, the day's backup
        │      ├─ routes/site.php    /api/auth/config  /api/health  /audio/:name
        │      ├─ routes/exam.php    /api/meta /api/exam /api/submit /api/attempts /report/:id ── src/exam.php
        │      │      └ src/score.php  marking · src/report.php  standalone HTML report · table exam_attempts
        │      ├─ routes/kanji.php   /api/kanji/* ── src/srs/kanji.php
        │      │      └ src/srs/srs.php  WaniKani schedule · src/srs/store.php  srs_progress, srs_settings, srs_daily, srs_log
        │      ├─ routes/translations.php   /api/translations/:code (everybody)  /api/admin/* (EDITOR, ADMIN)
        │      │      └ src/translations.php  languages, translation_keys, translations
        │      └─ routes/migrations.php   /api/admin/migrations (ADMIN; answers while a migration waits) ── src/upkeep.php
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
  takes the day's backup. Not set up yet, its database missing, or a migration
  failing, every address with data says so (503) and the setup page opens.
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

`app.php` builds it once per request (`academy_app()`): the routes of
`routes/site.php`, `routes/exam.php`, `routes/kanji.php`, `routes/me.php`,
`routes/visitor.php` and
`routes/translations.php` (which calls `routes/people.php` inside its
administrators' group), then the routing
middleware, a trailing slash dropped before routing (`/api/meta/` is
`/api/meta`, as before Slim), the error middleware
(`middleware/errors.php`: an `HttpError` becomes `{error, code?}` with its
status, and what more a page needs to word it, such as a `too_large`'s
`limit`; 404 and 405 are JSON too, a database error 503) and the security
headers (`middleware/security.php`: `nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: no-referrer`, a default-deny CSP for the JSON). `http.php`
has the response helpers (`json_response()`, `request_body()` — JSON objects
only —, `file_response()` with byte ranges).

Every address with somebody's data is registered through `data_route()`
(`routes/site.php`), which puts four middleware in front of it, in this order:
**set up** (`middleware/setup.php`: without the settings, 503
`{"code": "not_set_up", "setup": "/setup.php"}`, and to this computer the
reason), **upkeep** (the content's rebuild after an upload; while a whole
migration waits for an administrator's Apply, 503 `not_up_to_date`), **the
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
| `GET /api/auth/config` | where to sign in: `{issuer, clientId, loginRequired, visitorKeepDays}` (the IAM, the one way there is, whether it requires sign-in here: `src/access.php`, true until visitors can be kept, and how many days a visitor's data is kept) — no sign-in needed; 503 when not set up |
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
| `GET /api/translations/:code` | the app's own words: `{language, languages, values, english?}` — a language's strings with English merged underneath, and the languages on offer; no sign-in, no token looked at; `ETag` + `Cache-Control: no-cache` (304 for the tag the browser holds); 404 `not_found` for what is no code; 503 `not_up_to_date` while 004 of an upload is still arriving |
| `/api/admin/languages`, `/api/admin/translations` | the admin panel, in two route groups: the editors and the administrators (`EDITOR`, `ADMIN`) read the languages and the grid of every key in every language, save the changed cells, export and import a language as flat JSON; the administrators alone add, change and delete languages (a copy of its strings in the backups first) — see *The app's words* |
| `GET /api/admin/people`, `DELETE /api/admin/people/:id` | the administrators alone (the inner group): everybody the site has data of, and deleting a person's data — see *People* below |
| `GET /api/admin/visitors` | the administrators alone: `{ready, count, oldestSeenAt, keepDays, max}`, the visitors the site keeps now (none on the People page) |
| `GET /api/admin/migrations`, `POST /api/admin/migrations/apply` | the administrators alone, a group of its own without the upkeep (it answers while a migration waits): `{applied: [{name, appliedAt}], pending: [{name, whole}]}`; Apply → `{applied, failed, error, backup}`, 409 `busy` — see *The database*, *A whole migration waits for an administrator* |

Every `/api` and `/report` address needs a signed-in person, except
`/api/auth/config`, `/api/health` and `/api/translations/{code}` (the app's
own words, the same for everybody) - and the study addresses where the IAM
lets people study without signing in (visitors) - and answers with that
person's (or visitor's) data only ([sign-in.md](sign-in.md)). The `/api/admin/…` group adds, after the person,
`staff_middleware()` (`middleware/staff.php`: no `EDITOR` or `ADMIN` role 403
`staff_only`, a body over 1 MiB 413 `too_large`), and its inner group
`admin_middleware()` (no `ADMIN` 403 `admin_only`); the checks are on the
groups, so a route added to one cannot forget them. A refusal is `{error, code?, detail?}`: the sentence
is for the command line, the logs and the tests; a page words the failure
from its `code`; `detail`, the reason of a database error, a migration
waiting or a crash, goes out under PHP's built-in server only (the one
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
missing or wrong, and until nothing is, the API answers `not_set_up` (and the
app shows its page pointing at the setup page). Written files are readable by
their owner only, written aside and renamed.

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

- `app.config.ts` — before anything else, `boot()` (`core/boot.ts`):
  `AuthService.init()` asks `GET /api/auth/config` (and finishes a sign-in
  coming back from the IAM), then — signed in with a visitor key held — the
  move of what it holds into the account (`VisitorKey.settle()`, 5 s at most),
  then `TranslationService.init()` decides the
  language and gets its strings; the router's first navigation waits until
  the start has settled the sign-in (`AppComponent` starts it), and then every
  page's guard sends anybody not signed in to the IAM — unless the IAM does not
  require sign-in here: then they are a visitor (state `visiting`)
  ([sign-in.md](sign-in.md), *Visitors in the browser*); no screen asks for data while the copy is not set
  up or nobody is signed in (or visiting). The title strategy
  (`core/i18n/title.strategy.ts`) words a page's title in its language. A
  link to a part of a page (the dashboard's to Your data) scrolls to it.
- `app.component` — the anotoki family's top bar (`top-bar/`, *The top
  bar* below), then the screen of the address, or what stands in for the app
  (`standin/`: the Sign in card after a failed sign-in or a session that
  ended, the "not set up yet" page with a link to `/setup.php`, a problem
  page; on the way to the IAM, nothing; for a visitor the screen, with a
  sign-in that came back without one said above it, `standin/sign-in-failed/`), then the foot: the version and
  **What's new** (`core/changelog/app-version.component`, which opens the
  changelog dialog). The bar and the foot are drawn in every state.
- `top-bar/` — the bar (*The top bar* below); `ui/` — the anotoki family's
  UI pieces it is made of, in this app's tokens: `brand/` (the mark,
  "anotoki" and "Japanese"), `theme-toggle/` (light, dark, the system's),
  `icon/` (the bar's line icons, as paths).
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
  interceptor that puts up the "not set up yet" page on any `not_set_up`
  answer), `auth/` (`AuthService`, `signInGuard` and `adminSignInGuard`, the
  interceptor that adds the token — or a visitor's key — and `X-Time-Zone`,
  whose a request is decided as it is issued (`issued-as.ts`),
  `visitor-key.ts` (`VisitorKey`: the key of somebody studying without signing
  in, the first save that makes one, the move at sign-in), `PrivateLinksService`,
  `SignOutService`, `SignInService` (a visitor's Sign in waits for the saves
  first), the
  IAM's browser SDK in `sdk/`), `saves-in-flight.service.ts`
  (the saves on their way, which a sign-out — and a visitor's sign-in — waits for), `storage.ts`
  (localStorage that never throws), `time-zone.ts` (the
  browser's IANA zone), `i18n/` (the app's words, below; the language
  chooser), `theme/` (`ThemeService`: light, dark or the system's, kept per
  device), `changelog/` (the foot's version and "What's new", the dialog),
  `audio.service.ts` (the two voices take turns),
  `format.ts` (times, dates and percentages in the language on the page),
  `testing/` (the specs' translation service, stand-ins of the sign-in's states).
- `admin/` — the admin panel, in English: Translations (EDITOR, ADMIN),
  Languages, People and Migrations (ADMIN); the bar's links lead between
  them (below). Its titles are "<page> · Admin panel · Japanese Academy"
  (`core/i18n/title.strategy.ts`).
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
- `styles/` — `_tokens.scss` (every colour, light and dark: the dark ones
  under `prefers-color-scheme: dark` unless the page is told light, and under
  `[data-theme='dark']`), `_base.scss` (the page, buttons, chips, panels,
  tables, the sign-in page, the spinner), `_items.scss` (tiles and stage
  colours shared by the kanji screens).
- `standin/` — the three pages that stand in for the app (and `sign-in-failed/`,
  the Sign in card's words above a visitor's page), and `keptWord()` /
  `keptAround()`: what is drawn outside the router's screens (these pages,
  the top bar, the foot, the "What's new" frame) may be drawn with no strings
  at all, so it falls back to the seeded English written in the code (a
  `const ENGLISH` map in each; `backend/tests/unit/translations.test.php`
  holds it to the seeded English), never a key.
- `public/` — `favicon.svg` (the 日 stays the tab's icon), `anotoki.png` (the
  family's mark), `theme-boot.js` (the stored light/dark choice, before the
  first paint), `changelog.json`.

wanakana (romaji → kana as you type) comes from npm and is bundled; the IAM's
browser SDK is a copy (`core/auth/sdk/`), so the built app needs nothing from
the network.

## The top bar

The anotoki family's one bar (since 2026-10-04; the survey's
`layouts/top-bar` is the family's reference), in Japanese Academy's tokens:
`frontend/src/app/top-bar/`, drawn by `AppComponent` in every state, sticky
at the top (`--topbar-height`, 60 px; the exam's progress sticks under it).
One row, in this order:

- **the brand** (`ui/brand/`): the family's mark, "anotoki" and "Japanese" —
  a name, the same in every language; on a phone "Japanese" alone. It links
  home (`topbar.home`, "anotoki Japanese: home", which holds the words it
  shows; `aria-current` on the home page): the app has no Home link of its
  own. In the admin panel it reads "anotoki Japanese admin panel" ("admin
  panel" alone on a phone; the anotoki family's name for the area, since
  2026-10-04) and links to `/admin` ("anotoki Japanese admin panel: home").
- **the links**: **Kanji** (a term, never translated; the reviews due on it,
  `#navDue`) and **Exam** (`topbar.exam`), the section the page is in marked,
  the page's own link `aria-current`. In the admin panel the area's sections:
  Translations, and for ADMIN Languages, People and Migrations — English
  words, as the area is, not keys.
- **the language** (`core/i18n/language-chooser/`): a round button with the
  code ("SK"), named "Language: Slovenčina (SK)" (`language.button` holds
  `{code}`: a voice user says what they see), a menu of the languages; only
  where the learner's pages are, and only with two or more.
- **the theme** (`ui/theme-toggle/`): light, dark or the system's, a radio
  group of three icons (102 × 40); the choice is per device
  (`localStorage` `academy-theme`), `<html data-theme>` for light or dark,
  nothing for the system's (`core/theme/theme.service.ts`;
  `public/theme-boot.js` sets it before the first paint).
- **the person's menu** (a round button with their initial, their name beside
  it from 961 px): their name, address and role (Administrator / Editor);
  **Your anotoki account** (the IAM's account page, a new tab); **Admin panel**
  (`topbar.admin`, "Administrátorský panel" in Slovak; reworded by 006) for
  EDITOR and ADMIN, or **Back to Japanese Academy** in the admin panel; **Sign
  out** (`SignOutService`: it waits for the answers and notes on their way —
  a spinner and "Saving…" — and asks first when something would be lost). —
  Signed out with the Sign in card on the page: **Sign in** instead.

**The fold.** Up to `PHONE_BAR_MAX` = 760 px (a `matchMedia` signal, and the
same number in the scss) the bar is a phone's: the brand, the language, the
theme and one menu button holding the links, a separator and the person's
menu (or Sign in). **The reviews due stand on the menu button** (`#menuDue`),
and its name says them ("Menu: 125 reviews due", `topbar.phoneMenuDue`, a
plural family), so the count a phone hides with the links is still in sight.
Crossing 760 px closes an open menu. What gives way on a crowded desktop row
is the person's name: from 761 to 960 px the round button alone, from 961 px
the name beside it (ellipsis at 12rem); the brand, the links, the language
and the theme never shrink. **The admin panel folds later**, up to
`ADMIN_PHONE_BAR_MAX` = 960 px: its four links and "anotoki Japanese admin
panel" need 886 px at 761 (measured 2026-10-04: brand 20-300, links 316-698,
theme 714-816); from 761 to 960 the whole brand stands beside the menu
button (brand 20-300, theme 589-691, menu 701-741), and at 360 and 390 the
brand is "admin panel" (12-152).

760 is the family's number, and Japanese keeps it: measured in Edge on
2026-10-04 with the real labels, a three-digit due count and the longest name
the family measures (20 characters), the desktop row needs about 653 px in
Slovak and 642 px in English, so at 761 px there is room to spare. In pixels,
left-right:

| Width | Measured |
| --- | --- |
| 360 (phone) | brand 12-125 ("Japanese"), language 153-193, theme 200-302, menu button 308-348 (the due count on its corner) |
| 390 (phone) | brand 12-125, language 183-223, theme 230-332, menu button 338-378 |
| 761, signed in, 999 due | brand 20-201, Kanji 217-313, Exam 317-377 (Slovak "Skúška" 317-388), language 512-552, theme 561-663, the person 673-741: 119 px to spare in English, 108 in Slovak (beyond the 16 px gap) |
| 761, signed out (the card) | brand 20-201, language 492-532 (Slovak 469-509), theme 542-644 (518-620), Sign in 653-741 (Slovak "Prihlásiť sa" 630-741) |
| 761, the admin panel (ADMIN) | folded (above): brand 20-300 ("anotoki Japanese admin panel"), theme 589-691, menu button 701-741 |
| 961, the admin panel (ADMIN) | brand 20-300, links 316-698 (Translations, Languages, People, Migrations), theme 714-816, the person 825-941 |
| 961 | language 544-584, theme 594-696, the person 706-941 with the name |
| 1280 | brand 140-321, links 337-497 (Slovak 337-508), language 743-783, theme 793-895, the person 905-1140 |

**The keys.** No key pressed anywhere in the bar reaches `document`: the
lesson quiz, the reviews and the exam listen there (Enter submits a card or
hands a paper in, Space plays a word, 1-4 and A-D choose), and Enter or Space
on a button of the bar would do that instead of pressing it. So the header
stops every key (`keydown()`, `stopPropagation()`) and handles Escape itself,
which no document listener would hear; what the key does on the control is
the browser's and stays so. The chooser does the same on its own, and so
does the foot (`app-version`: What's new and the changelog dialog it opens —
Enter there opens or closes the news, never hands a paper in). Specs prove
it with the real exam (a spoken last question: nothing chosen, played or
handed in) and the real review session (nothing checked), for the bar's
controls and the foot's (`core/testing/foot-controls.ts`).

**The menus** are the IAM's pattern: a menu button (`aria-haspopup`,
`aria-expanded`, `aria-controls`); the focus to the first item when it opens
(in `afterNextRender`: with no zone a microtask runs before the menu is
drawn); ArrowDown/ArrowUp round and round, Home and End; Escape closes it with
the focus back on its button; **Tab and Shift+Tab from any item close it with
the focus on its button** (`preventDefault()`: left to the browser the focus
would land on the next item of a menu about to go, then on `<body>`); a
click outside closes it where the focus is; choosing an item closes it — but
Sign out and Sign in, which wait for the saves on their way first: the menu
stays open meanwhile, the item disabled with its spinner and "Saving…" (else
a phone would show the wait nowhere). Sign in in the phone's menu puts the
focus on the menu button as it starts (a disabled item would drop it on
`<body>`) and closes the menu with the focus there once the wait is over. The
language chooser follows the same rules (its items `menuitemradio`).

**Its words** are keys (`topbar.*`, `theme.*`, `account.*`,
`signIn.button`, `signOut.saving`; migration 005), each with its English in
the code for a bar drawn with no strings (`keptWord()`). **In the admin
area** the bar reads in English, whatever the reader chose, with no case in
the bar: the title strategy tells the translation service the address
(`noteAddress()`), and under `/admin` it answers from the bundle's English
(`pageLanguage`; `<html lang>` follows). The reader's own language stays
(`language()`): the IAM's pages still open in it.

**The foot** of every page: the version and **What's new**, which opens the
changelog dialog, with a dot beside the words until this version's news has
been opened (`whatsNew.title`, `whatsNew.unseen`; the dot sits on the words'
span, not the button, which is 44 px high on a touch screen).

**The mark in dark.** The family's mark is a dark navy picture: in light it
has the soft shadow the survey's brand gives it; in dark a light halo
(`--mark-shadow`, a token of both themes), or it sinks into the dark bar.

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
  the `ETag` it holds. While 004 of an upload has not arrived whole it answers
  503 `not_up_to_date`, and nothing is logged.
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
while there is no Czech), and English. The page changes language only once
the new bundle is in memory, and a key with no string shows as itself and
warns once in the console — the owner wants to see which.

- The `translate` and `translatePlural` pipes (impure: the language changes
  under a constant key), `t()` / `plural()` / `number()` in code, the
  `localDate` pipe and `core/format.ts` for dates, clocks and relative times
  in the language's locale (`'en-GB'`, `'sk-SK'`), whatever the system's is.
- State holds keys, kinds and `ApiError`s, never a worded sentence, so a page
  follows a change of language without being made again; a failed request is
  worded from its code (`error-text.ts`), never with the server's sentence.
- The chooser (`language-chooser/`) sits in the top bar in every state but
  the admin panel's, and hides while fewer than two languages are on offer.
  Like the whole bar it keeps its keys to itself: Enter on a language never
  submits a card or finishes a paper behind it, and switching changes words
  only.
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

Tables are created by `backend/migrations/*.sql` (applied in order by the
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
owner's decision; until then the first request after an upload applied it).
`upkeep_run()` (`backend/src/upkeep.php`), on the first request after the
files changed, finds it whole and not applied and answers 503
`{"code": "not_up_to_date"}` (`upkeep_waiting()`: "The database is not up
to date with this version of the app yet: an administrator applies the
update on the Migrations page.", and to this computer which files, as
`detail`), without saving the stamp: every address with data says so, the
bundle of words too, so a learner's page starts as the problem page
(`error.not_up_to_date`, reworded in 006: "… an administrator has to apply
the update first. Try again later."). An `ADMIN` on that page gets **Open
the Migrations page** (`boot.problem.migrations`, a page load), and the
admin panel starts for an `ADMIN` despite the refused bundle
(`TranslationService.refused()`: the panel is English, written in its
pages; the bar keeps its own English). The **Migrations page**
(`/admin/migrations`, `ADMIN`; `backend/api/routes/migrations.php`, its
group with set-up, `tables_middleware()` in place of the upkeep, the
person, the editors' and the administrators' checks) lists the files
applied with when and the ones pending in the order they will run (`whole`:
false for one still uploading, which waits with every one after it), and
**Apply pending** (`upkeep_apply()`, through `upkeep_apply_ready()`) takes
the upkeep's lock (`upkeep_lock()`: it waits up to `UPKEEP_LOCK_WAIT_MS`,
10 s, since every request with data takes the lock for a moment to look
while a migration waits; 409 `busy` when another Apply, the setup page or
`manage.php` holds it longer), the raw copy of every table
(`upkeep_copy_before()`: one copy for one upload however often it is tried,
a new one when the files or the pending list changed), then applies each
file under a savepoint: the first that fails is rolled back whole and named
(`failed`), the ones before it stay; why (`error`, PostgreSQL's own words)
goes to the ADMIN on this computer and on a website alike, and the page
shows it in a box under "Stopped at …", as the IAM's does (the owner's
decision of 2026-10-04); the site's error log has it too (`[upkeep] a migration
failed: …`). The setup page and `manage.php` apply the same way, under the
same lock (`upkeep_migrate()`, which throws naming the failed file), so no
two ever run at once. The page says "Up to date" only when nothing is left
pending; a file still uploading after the ones applied reads "Applied - one
still waits" and names it. After an Apply that left nothing whole waiting,
the page asks for the app's words again (`TranslationService.reload()`): a
panel opened while the update waited started without them, and the
learner's pages it links back to (no page load) would be drawn in keys. The
next request then rebuilds the content and saves the stamp, as after any
change of the files. The page is the IAM's model, in its words.

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
| `backend/storage/` | what the backend writes for itself: `backups/` (copies of the study data, above, with the app's words in a copy of everybody; a deleted language's strings), the IAM's keys, cached, a website's setup lock |
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
`backend/tools/php.js`, which finds a PHP 8.1+ with the needed extensions
(plain `php` may be an older one).

## Parts and lessons

Lesson numbers alone identify the part: Greetings = 0 and Lessons 1–12 are
Part 1; 13–23 are Part 2 (`BOOKS` in `backend/src/generate.php`). Kanji are
taught from Lesson 3, so SRS lessons run 3–23.
