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
        │      ├─ routes/kanji.php   /api/kanji/* ── src/srs/kanji.php
        │      │      └ src/srs/srs.php  WaniKani schedule · src/srs/store.php  srs_progress, srs_settings, srs_daily, srs_log
        │      └─ routes/translations.php   /api/translations/:code (everybody)  /api/owner/* (the owner)
        │             └ src/translations.php  languages, translation_keys, translations
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
`routes/site.php`, `routes/exam.php`, `routes/kanji.php` and
`routes/translations.php`, then the routing
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
| `GET /api/translations/:code` | the app's own words: `{language, languages, values, english?}` — a language's strings with English merged underneath, and the languages on offer; no sign-in, no token looked at; `ETag` + `Cache-Control: no-cache` (304 for the tag the browser holds); 404 `not_found` for what is no code; 503 `not_up_to_date` while 004 of an upload is still arriving |
| `/api/owner/languages`, `/api/owner/translations` | the owner's (`owner_route()`): the languages (list, add, change, delete — a copy of its strings in `backups/` first) and the grid of every key in every language (read, save the changed cells, export and import a language as flat JSON) — see *The app's words* |

Every `/api` and `/report` address needs a signed-in person, except
`/api/auth/config`, `/api/health` and `/api/translations/{code}` (the app's
own words, the same for everybody), and answers with that person's data only
([sign-in.md](sign-in.md)). The `/api/owner/…` addresses add
`owner_middleware()` after the person (`middleware/owner.php`: another host's
`Origin` 403 `wrong_origin`, no `ADMIN` role 403 `owner_only`, a body over
1 MiB 413 `too_large`). A refusal is `{error, code?, detail?}`: the sentence
is for the command line, the logs and the tests; a page words the failure
from its `code`; `detail`, the reason of a database error, a failed migration
or a crash, goes out under PHP's built-in server only (`error_reason()` in
`src/errors.php`). The built-in server handles one request at a time;
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

- `app.config.ts` — before anything else, `boot()` (`core/boot.ts`):
  `AuthService.init()` asks `GET /api/auth/config` (and finishes a sign-in
  coming back from the IAM), then `TranslationService.init()` decides the
  language and gets its strings; the router's first navigation waits until
  the app can be used (`AppComponent` starts it), so no screen asks for data
  while the copy is not set up or nobody is signed in. The title strategy
  (`core/i18n/title.strategy.ts`) words a page's title in its language.
- `app.component` — the top bar (the name, the version that opens "What's
  new", the language chooser; Kanji and Exam, the due reviews' badge and the
  account menu only while the app can be used), then the screen of the
  address, or what stands in for the app (`standin/`: the Sign in page, the
  "not set up yet" page with a link to `/setup.php`, a problem page). At
  440 px and below "Academy" gives way, so the bar fits 360 px.
- `app.routes.ts` — `/` home, `/kanji/…` (lazy: `kanji/kanji.routes.ts`),
  `/exam` (lazy), `/translations` and `/languages` (lazy, the owner's:
  `ownerOnly`, and a question before leaving unsaved changes),
  `/auth/callback`; `/kanji`, `/exam` and the owner's two open only while the
  app can be used (`whenReady`), so Back or Forward on a stand-in page loads
  no data.
- `core/` — `api/` (`ApiService` over HttpClient, the response types, and the
  interceptor that puts up the "not set up yet" page on any `not_set_up`
  answer), `auth/` (`AuthService`, the token's interceptor,
  `PrivateLinksService`, the account menu, the IAM's browser SDK in `sdk/`),
  `i18n/` (the app's words, below), `changelog/` (the version, the "What's
  new" dialog), `menu-keys.ts` (the keys of the top bar's two menus),
  `audio.service.ts` (the two voices take turns), `format.ts` (times, dates
  and percentages in the language on the page), `testing/` (the specs'
  translation service).
- `owner/` — the owner's two pages, in English: Translations and Languages
  (below).
- `home/` — the home page (kanji summary, exam history).
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
- `styles/` — `_tokens.scss` (every colour, light and dark), `_base.scss`
  (the page, nav, buttons, chips, panels, the sign-in page and account menu),
  `_items.scss` (tiles and stage colours shared by the kanji screens).
- `standin/` — the three pages that stand in for the app, and `keptWord()` /
  `keptAround()`: what is drawn outside the router's screens (these pages,
  the top bar, the "What's new" frame) may be drawn with no strings at all,
  so it falls back to the seeded English written in the code, never a key.
- `public/` — `favicon.svg`, `changelog.json`.

wanakana (romaji → kana as you type) comes from npm and is bundled; the IAM's
browser SDK is a copy (`core/auth/sdk/`), so the built app needs nothing from
the network.

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
report and the two owner pages. Material on a page carries `lang="en"` or
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
- **Keys are the code's**: migrations write them, the owner's pages only
  change strings. A plural is a family, `name.one`, `name.few`, `name.other`,
  asked for by `name` with a number. `backend/tools/translation_keys.php`
  scans the frontend for the keys it asks for (and the run-time families of
  `core/i18n/dynamic-keys.ts`); the catalogue test and
  `php backend/translations.php --status` hold them to the database.
- **Languages**: English cannot be hidden, deleted or left without a string;
  a language the migrations write strings for (`TRANSLATION_SEEDED_LANGUAGES`:
  English, Slovak) cannot be deleted; any other can, after a copy of its
  strings in `backups/academy-before-language-delete-<code>-<time>.json`. A
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
- The chooser (`language-chooser/`) sits beside the version in every state,
  with or without sign-in, and hides while fewer than two languages are on
  offer. Like the account menu it keeps its keys to itself
  (`core/menu-keys.ts`): Enter on a language never submits a card or finishes
  a paper behind it, and switching changes words only.
- A start that cannot get its strings still draws: the stand-in pages and the
  top bar fall back to the seeded English written in the code (`keptWord()`),
  and the next navigation asks again.

**The owner's pages** (`frontend/src/app/owner/`, English, `/translations`
and `/languages`; linked from the account menu, or the foot of the home page
without sign-in). Translations shows a key a row and a language a column
(stacked over three languages), each string a box, with a search, every
plural filled in for sample numbers, and each language's export and import
as a flat JSON file; Save sends the changed boxes only and shows a refusal
beside its key. Languages adds, renames, orders, offers or hides and deletes
languages. What is typed and not saved is held in `OwnerDrafts`, mirrored to
`sessionStorage` for the tab: the app takes a page away without a question
when a session ends, and signing in again is a page load, so the drafts must
outlive both (only another person signing in drops them). Leaving a page
with unsaved changes asks first (`unsavedChangesGuard`, a modal dialog), and
closing the tab asks the browser's question.

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
| `backups/` | copies of the study data (above), with the app's words in a copy of everybody; a deleted language's strings |
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
