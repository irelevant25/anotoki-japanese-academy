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

```
                 data/source/*.tsv  ──backend/tools/build-data.php──▶  data/vocab.json
   (transcribed from the scanned books)                                data/kanji.json
                                                                       data/grammar-index.json
   data/vocab.json + the SRS vocabulary ──backend/tools/build-audio.php──▶  data/audio.json + data/audio/*.mp3
   (Google Cloud Text-to-Speech, two voices)

   data/*.json + data/authored-items-part1|2.php
        │   backend/src/content.php: content_sync() when the server starts (and in the setup
        │   page; on a hosted site at the first request after an upload),
        │   only if data/ or the code that builds from it changed (~3 s)
        │
        ├─▶ src/generate.php ── question bank (11,523) ──▶ table exam_questions
        │      └ src/conjugate.php   verb/adjective forms (both conjugation charts)
        │
        └─▶ src/srs/catalog.php ── kanji SRS items (1,373) ──▶ table srs_items

   a request ── backend/server.php (here) or public/index.php (Apache) ── backend/api/front.php
        ├─ /setup.php ───────────── backend/setup.php (while it is there)
        ├─ /api/… /audio/… /report/… ── backend/api/app.php: the Slim app
        │      ├─ middleware: errors → JSON, security headers, a trailing slash dropped;
        │      │   per address with data: set up? → upkeep (src/upkeep.php) → the person
        │      │   (src/auth.php) → on a page load, the day's backup
        │      ├─ routes/site.php    /api/auth/config  /api/health  /audio/:name
        │      ├─ routes/exam.php    /api/meta /api/exam /api/submit /api/attempts /report/:id ── src/exam.php
        │      │      └ src/score.php  marking · src/report.php  standalone HTML report · table exam_attempts
        │      └─ routes/kanji.php   /api/kanji/* ── src/srs/kanji.php
        │             └ src/srs/srs.php  WaniKani schedule · src/srs/store.php  srs_progress, srs_settings, srs_daily, srs_log
        └─ anything else ─────────── a file of the built app, or its index.html (Angular's router draws the page)

   src/speech.php — what a word is spoken as and which clips hold it; used by
                    the audio builder, the catalog and the listening questions
```

## The backend — `backend/`

### One front controller, two servers

`backend/api/front.php` answers every request, whichever server got it:

- **`php backend/server.php`** (this computer): checks the settings and the
  database, applies new migrations (after a raw copy of every table),
  rebuilds the study content if `data/` changed, takes today's backup, prints
  the counts and the sign-in mode, then runs PHP's built-in web server on
  127.0.0.1:8200 with `server.php` itself as its router (and OPcache off: see
  [environment.md](environment.md)). `HOST` / `PORT` in the environment choose
  another address (without sign-in it refuses any host but this computer's);
  `--url` prints the address (the launchers use it). Not set up yet, its
  database missing, or a migration failing (it names the file), it says so and
  serves anyway, so the setup page can be opened; only a database it cannot
  reach at all stops it.
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
`routes/site.php`, `routes/exam.php` and `routes/kanji.php`, then the routing
middleware, a trailing slash dropped before routing (`/api/meta/` is
`/api/meta`, as before Slim), the error middleware
(`middleware/errors.php`: an `HttpError` becomes `{error, code?}` with its
status, 404 and 405 are JSON too, a database error 503) and the security
headers (`middleware/security.php`: `nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: no-referrer`, a default-deny CSP for the JSON). `http.php`
has the response helpers (`json_response()`, `request_body()` — JSON objects
only —, `file_response()` with byte ranges).

Every address with somebody's data is registered through `data_route()`
(`routes/site.php`), which puts four middleware in front of it, in this order:
**set up** (`middleware/setup.php`: without the settings, 503
`{"code": "not_set_up", "setup": "/setup.php"}`, and to this computer the
reason), **upkeep** (new migrations and content after an upload), **the
person** (`middleware/person.php`: `auth_user()`, put on the request as `uid`;
401/403 without one), and on a page load **the day's backup**.

| Route | What |
|---|---|
| `GET /api/auth/config` | how this copy signs people in: `{mode}` or `{mode, issuer, clientId}` — no sign-in needed; 503 when not set up |
| `GET /api/meta` | exam: parts, sections, lessons, bank size, your attempt count |
| `POST /api/exam` | exam: build a paper from `{size, books, lessons, sections, seed}` — questions without answers |
| `POST /api/submit` | exam: `{spec, responses, meta}` → score, store your attempt and its report |
| `GET /api/attempts` | your exam history, newest first |
| `GET /report/:id` | one of your reports (HTML, from the database; a Content-Security-Policy allows no script) |
| `/api/kanji/*` | kanji SRS — see [kanji-srs.md](kanji-srs.md) |
| `GET /audio/:name` | a clip from `data/audio/`; only names of 16 hex digits + `.mp3`; byte ranges (206); no sign-in (shared content) |
| `GET /api/health` | `{ok, auth, contentCurrent}`, and under `php backend/server.php`, to a request straight from this computer, also `database`, `backups`, `owner` — the tests and the launchers ask it |

Every `/api` and `/report` address needs a signed-in person, except
`/api/auth/config` and `/api/health`, and answers with that person's data only
([sign-in.md](sign-in.md)). The built-in server handles one request at a time;
each takes 5–10 ms, because the database connection stays open between
requests (see [decisions.md](decisions.md)). A 250-question paper takes about
65 ms.

### Settings — `backend/config/`

`config.php` reads this copy's settings from three files beside it, which the
setup page writes and git never sees; the app requires all three, and there
are no defaults to fall back on:

| File | Holds |
|---|---|
| `database.local.php` | `host`, `port`, `name`, `user`, `password` |
| `auth.local.php` | `mode` (`none` or `iam`), `issuer` and `client_id` (mode iam), `local_user_id` (the owner's IAM user id, whom mode none acts as) |
| `app.local.php` | `timezone` (review times and days follow it, for everybody) |

`config('db.host')` and the like read them; `config_problem()` says what is
missing or wrong, and until nothing is, `php backend/server.php` points at the
setup page and the API answers `not_set_up`. Written files are readable by
their owner only, written aside and renamed.

The tests have settings of their own: a folder of the same three files, named
by `ACADEMY_CONFIG_DIR`, honoured only when the database it names is an
`academy_test_…` one (so a stray variable can never point a real server
elsewhere). Only for those, `auth.local.php` may name the test IAM's keys file
(`jwks_file`, read through `auth_jwks_file()`), and `app.local.php` a backup
folder (`backups_dir`) and another built app (`frontend_dir`); in any other
copy's settings those lines count for nothing.

### The setup page — `backend/setup.php`

How every copy is set up, in the browser: the owner's computer, a developer's,
a website. It writes the three settings files, and builds the database: makes
it if it is missing and the user may, applies the migrations (after a raw copy
of every table when it holds study data), builds the study content, and brings
data in — the first version's JSON files, once (the owner's computer), or a
backup, into an IAM user id. **Test connection** buttons try the database and
the IAM (its `{issuer}/.well-known/openid-configuration` and keys) without
sending the form. Two ways, told apart by where the request comes from:

- **this computer** (PHP's built-in server, a request straight from 127.0.0.1
  or localhost, as for auth mode `none`): no token, but a nonce in an
  `HttpOnly`, `SameSite=Strict` cookie that the page's own form echoes, and the
  `Origin` checked. It offers sign-in off. It stays, and can be run again: it
  shows what is set, never the password (left empty, the saved one stays). A
  new IAM user id moves the owner's data to it (`backend/src/owner.php`,
  backed up first). The settings of the version before (`src/config.local.php`
  at the root) are offered, password included, never shown.
- **a website**: proof of owning the server first — a token it writes into
  `backend/config/setup-token.local.php` (aside and renamed, like the
  settings), which only FTP reaches; no token, no form passes. Until the token
  is proven the page shows nothing of what is set, nor the files in
  `backups/`: its **Check** button, pressed by itself once a token is pasted,
  fills them in. Sign-in through the IAM only. When done it writes
  `backend/storage/installed.lock`, then deletes the token file and itself;
  with the lock there it refuses to run (and deletes itself if uploaded
  again). See [hosting.md](hosting.md).

`backend/manage.php` keeps the command-line helpers for a set-up copy:
`--check`, `--sync`, `--backup`, `--restore=FILE`, `--import=FOLDER`,
`--owner-id=N` (its header lists them). It applies pending migrations first,
like the server. PostgreSQL 13 or newer (tested with 18).

## The frontend — `frontend/`

An Angular 21 app: standalone components, `OnPush`, state in signals, no
zone.js (`provideZonelessChangeDetection`). Every component is three files
(`.ts`, `.html`, `.scss`). Built with `@angular/build` (`ng build`); the unit
tests run in Vitest with jsdom (`ng test`).

- `app.config.ts` — before anything else, `AuthService.init()` asks
  `GET /api/auth/config` (and finishes a sign-in coming back from the IAM);
  the router's first navigation waits until the app can be used
  (`AppComponent` starts it), so no screen asks for data while the copy is not
  set up or nobody is signed in.
- `app.component` — the top bar (Kanji and Exam, the due reviews' badge and
  the account menu, only while the app can be used), then the screen of the
  address, or what stands in for the app (`standin/`: the Sign in page, the
  "not set up yet" page with a link to `/setup.php`, a problem page), and the
  foot with the version, at the bottom of the window on a short page.
- `app.routes.ts` — `/` home, `/kanji/…` (lazy: `kanji/kanji.routes.ts`),
  `/exam` (lazy), `/auth/callback`; `/kanji` and `/exam` open only while the
  app can be used (`whenReady`), so Back or Forward on a stand-in page loads
  no data.
- `core/` — `api/` (`ApiService` over HttpClient, the response types, and the
  interceptor that puts up the "not set up yet" page on any `not_set_up`
  answer), `auth/` (`AuthService`, the token's interceptor,
  `PrivateLinksService`, the account menu, the IAM's browser SDK in `sdk/`),
  `changelog/` (the version in the foot, the "What's new" dialog),
  `audio.service.ts` (the two voices take turns), `format.ts`.
- `home/` — the home page (kanji summary, exam history).
- `kanji/` — the trainer: `kanji-shell` (its tabs, and what is drawn over the
  screen: a lesson batch, a session, a summary — `kanji-screen.service.ts`),
  `kanji-state.service.ts` (the catalog, loaded once, and the person's
  progress, fresh on every screen), `answer.ts` (answer checking),
  `session/` (the answering engine and its screen), the screens `dashboard`,
  `lessons`, `lesson-batch`, `reviews`, `practice`, `browse`, `item`,
  `summary`, and `shared/` (tile, readings, notes, item details). Lesson
  batches, sessions and summaries draw over the screen they were started from
  and leave the address as it was, so the shell also routes a click on a link
  to the address already shown (the router fires nothing for it).
- `exam/` — the exam: setup, the paper (keys: 1–4 or A–D, ←/→, Enter, F, R),
  the result, all one component with three screens.
- `styles/` — `_tokens.scss` (every colour, light and dark), `_base.scss`
  (the page, nav, buttons, chips, panels, the sign-in page and account menu),
  `_items.scss` (tiles and stage colours shared by the kanji screens).
- `public/` — `favicon.svg`, `changelog.json`.

wanakana (romaji → kana as you type) comes from npm and is bundled; the IAM's
browser SDK is a copy (`core/auth/sdk/`), so the built app needs nothing from
the network.

## The database (PostgreSQL)

Tables are created by `backend/migrations/*.sql` (applied in order by the
server's start, the setup page, `manage.php`, or on a hosted site the first
request after an upload; a migration that is committed is never edited — add
the next number instead — and every one but 001 ends with the line
`-- end of NNN`, without which it is taken to be half uploaded and waits).
Times the browser sees are milliseconds; the columns are `timestamptz`,
converted by the SQL functions `academy_ms()` / `academy_time()`.

| Table | Contents |
|---|---|
| `users` | one row per person: the IAM user id (`id`), their name from their latest token, when first and last seen |
| `srs_progress` | one row per person and kanji-trainer item they touched: stage, review times, counters, notes, synonyms |
| `srs_settings` | each person's trainer settings, and when their progress started / last changed |
| `srs_daily` | lessons, reviews, practice per person and local day (the dashboard) |
| `srs_log` | every lesson, review and practice answer and every reset, with whose it was — only ever added to |
| `exam_attempts` | every exam attempt: the whole record (as `results/<id>.json` held it) and its HTML report; ids are unique per person |
| `imports` | what the setup page (or `manage.php --import`) imported, and for whom |
| `srs_items`, `exam_questions`, `content_state` | the study content, rebuilt from `data/` — the same for everybody; `content_state.stamp` is what the per-request upload check compares |

Every study table has `user_id` first in its primary key, pointing at `users`
(migration 002: the owner's rows became user 1's; see
[sign-in.md](sign-in.md)). Only the owner's own server uses the owner's
database. The tests make their own throwaway databases (`academy_test_…`, see
[testing.md](testing.md)).

## The study data outside the database (never delete)

| Path | Contents |
|---|---|
| `backups/` (gitignored) | `academy-<date>.json`: a copy of all the study data — per person their progress, answer log, exam attempts with their reports — taken each day the server starts (or, for a server left running and on a hosted site, at the first page load of a new day); the last 14 are kept. Also one before a restore or an owner change, one of a person's data alone before their full reset (`academy-before-reset-user-<id>-<time>.json`, their last 14 kept), and a raw copy of every table (`….raw.json`) before a migration (taken once per upload, however often a failing one is tried: `.before-migration.json` notes what it was taken with). `php backend/manage.php --restore=<file>` puts a `.json` back: format version 2 is everybody's data (or, with `"everybody": false`, the people it names), version 1 (from before user ids) the owner's alone |
| `progress/kanji.json`, `progress/kanji-log.jsonl`, `results/`, `reports/` | the history from before the database (to 2026-09-24), imported once by the setup. Tracked in git; the app no longer writes them |
| `progress/backups/` | the old app's daily copies (gitignored) |

A throwaway database of the tests keeps its backups in the folder its test
settings name, or else in the temp folder (`academy-backups-<name>`), never in
`backups/`; `php backend/server.php` warns when it runs on one.

## Audio — `data/audio/`, `data/audio.json`

Made by `php backend/tools/build-audio.php` (`npm run build:audio`) with
Google Cloud Text-to-Speech: every vocabulary word, in a female and a male
voice. The clips are in git, so a fresh clone plays sound without a key. Only
a rebuild needs the API key, from `GOOGLE_TTS_API_KEY` or the gitignored
`.env`. Details in [kanji-srs.md](kanji-srs.md) and [exam.md](exam.md).

## Local only (gitignored)

| Path | Contents |
|---|---|
| `backend/config/*.local.php` | this copy's settings (above), written by the setup page; on a website also its token file until the setup is done |
| `src/config.local.php` | on a computer that ran the version before: its settings, offered once by the setup page, then unused |
| `backend/storage/` | what the backend writes for itself: the IAM's keys, cached (auth mode iam), a website's setup lock |
| `frontend/dist/`, `frontend/node_modules/` | the built app and its packages |
| `dist/` | the upload for a hosted site (`npm run build:dist`) |
| `backups/` | copies of the study data (above) |
| `books/` | the five scanned course books (`textbook-1.pdf` …), read by `backend/tools/pdf/pages.js`, plus the owner's notes |
| `.env` | `GOOGLE_TTS_API_KEY=…`, for the audio builder |
| `temp/` | the owner's scratch folder (e.g. `voices.html`: a sample of every Japanese voice) |

A fresh clone has none of these: the setup page writes the settings; copy the
books in by hand, and create `.env` only to make new audio.

## What Node is for

Building the frontend (the launchers do it when its sources changed, through
`frontend/scripts/ensure-build.mjs`), its unit tests, the browser suites
(`playwright-core` with the installed Edge) and the PDF page tool (`sharp`,
in the root's `package.json`). Nothing at run time: the backend serves the
build. The npm scripts start PHP through `backend/tools/php.js`, which finds a
PHP 8.1+ with the needed extensions (plain `php` may be an older one).

## Parts and lessons

Lesson numbers alone identify the part: Greetings = 0 and Lessons 1–12 are
Part 1; 13–23 are Part 2 (`BOOKS` in `backend/src/generate.php`). Kanji are
taught from Lesson 3, so SRS lessons run 3–23.
