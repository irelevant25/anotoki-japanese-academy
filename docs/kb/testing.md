# Testing

Every test that needs the database gets a **throwaway database**:
`academy_test_<…>`, a copy of `academy_test_template` (tables and study
content, brought up to date at the start of each run by
`php backend/tests/tools/testdb.php template` — a few seconds when `backend/data/` or
the generators changed, instant otherwise; it applies only migrations it has
not applied, so after an edit of one not committed yet, `template --fresh`
drops the template and replays them all — a migration still being written, a
draft without its last line, is applied too (the tests' databases alone get
it: [architecture.md](architecture.md), *The database*), and a draft that
changed since the template was made makes it afresh by itself), made on the PostgreSQL server of
the developer's own settings (`backend/config/database.local.php`: this copy
must be set up first). Backups go to a temp folder. The database is dropped
when the test file or suite ends; set `ACADEMY_KEEP_TEMP=1` to keep it and the
folders for inspection. Databases a killed run left behind are swept 6 hours
later (and a site test's database user once it owns no database). No test can
reach the owner's database or `backend/storage/backups/`, no test sends
anything to Google, and no test asks
a real IAM: sign-in is tested with tokens the tests sign themselves, and the
browser suites sign in through the anotoki library's stand-in IAM
([sign-in.md](sign-in.md), *Testing with tokens*). No test writes into the
owner's `backend/storage/`: a test server's logs, cache and the library's
key go into its own settings folder (`storage_dir()`), and its backups into
its own backup folder.

How the isolation works:

- **Settings of their own.** A test's server gets a folder of settings files
  (`backend/tests/tools/test-config.php`), named by `ACADEMY_CONFIG_DIR`: the
  throwaway database (with the developer's server, user and password, required
  from their `database.local.php`, never copied), the test IAM (its issuer and
  keys file, and the files standing in for the IAM's answers: whether sign-in
  is required, the deleted accounts), the backup folder, and for the browser
  suites the real build of the app. The folder is the test server's storage
  too (the error log, the library's cache, stamps and key), and the scrub's
  hourly stamp and the library's daily backup's stamp are written as done, so
  a test server does neither by itself. The app honours such a folder only
  for an `academy_test_…` database, and stops if it names any other.
- PHP: `backend/tests/lib.php` is the first thing every PHP test file loads. It
  writes the file's settings folder before the app loads, and refuses to go
  on if the app was loaded first, or if the database name isn't a test name.
  `start_app()` then starts the real server (`backend/router.php` under PHP's
  built-in server, as `composer start` runs it) with settings of its own, and checks, through
  `/api/health`, that it uses that database and folder.
  `test_site()` builds the website's upload into a temp folder instead
  (`backend/tools/build-dist.php`), with a database user of its own that owns
  the database, as a hosting panel makes them, and serves it as Apache would
  (`backend/tests/tools/front-controller.php` does what `.htaccess` does).
- Node (the browser suites): `frontend/e2e/helpers.js` `isolate()` picks the
  names; `startApp()` starts the run's stand-in IAM (once), makes the
  database, writes the settings (`testdb.php config`, naming the stand-in as
  the issuer), starts the server with the drafts named
  (`ACADEMY_MIGRATION_DRAFTS` from `testdb.php drafts`) and makes the same
  check. `startApp()` may run twice in one script; the last to close drops the
  database and stops the stand-in IAM, and `closeAll()` does it for a suite
  that failed half-way.
- `backend/tests/tools/testdb.php` (template, create, site, drop, sweep, sql,
  config, drafts) only touches databases named `academy_test_…`.

Sign-in, in both: a test IAM — the anotoki library's `TestIam`, a key pair
of the run's own, its public half in
a JWKS file that every test server reads instead of asking an IAM (in PHP the
issuer `https://iam.test`, which exists nowhere; in the browser suites the
address of the run's stand-in IAM on this computer, which signs a browser in
by redirect as the real one does). Sign-in is the app's one way, so every
test signs in. Whether the IAM requires sign-in here ([sign-in.md](sign-in.md),
*Is sign-in required here?*) is never asked of a real IAM either: a PHP
server without a stand-in reads it from the file `test_access(bool|null)`
writes (`auth.application_file`; no file, the IAM out of reach: required),
a built site of the tests from `ACADEMY_APPLICATION_FILE`, and a server
named after a stand-in asks the stand-in (`GET
/api/public/applications/{client_id}`; its state's `login_required`,
`application_missing`, `down`), keeping the answer in its settings folder's
`cache/` (`auth.cache_dir`) for `application_ttl` (`start_app(['issuer' => …,
'auth' => ['application_ttl' => 1]])`, `testdb.php config … ISSUER 1`). The
accounts the IAM deleted the same way: a server without a stand-in reads
the file `test_anonymized([id => when] | null)` writes
(`auth.anonymized_file`; none: the IAM out of reach), one named after a
stand-in asks it (`GET /api/public/anonymized-accounts`, its state's
`anonymized`).

| PHP (`backend/tests/lib.php`) | Node (`frontend/e2e/helpers.js`, `browser.js`) |
|---|---|
| `start_app()`: every server signs people in through the test IAM | `startApp()`: every server signs people in through the run's stand-in IAM (`IAM.issuer` its address) |
| `test_token($id, $roles, $claims, $typ)`: any token, signed by the library's `TestIam`; no role (or `MEMBER` alone, which every account holds) is a learner | `iamToken(sub, {roles, name, typ, …claims})`, signed by `backend/tests/tools/iam.php` (the library's `TestIam`) with the stand-in's key; no role is a learner |
| `call($base, $method, $url, $body)` goes as `TEST_USER` (1, no role); `test_bearer($token)` for somebody else, `no_token()` for nobody | `app.api(url, person, {method, body, zone})` goes with `person`'s token; `iamSession(sub)` / `plant(context, person, lang)` put a signed-in session in a browser context before its pages load |
| `stand_in_iam($state)`: the anotoki library's stand-in IAM (`backend/vendor/anotoki/lib/php/testing/stand-in-iam.php`, the family's one; this app's own went on 2026-10-11) on a free port, signing in by redirect (authorize, token with PKCE, refresh, logout, `deny`; here its default person is user 1, `owner`, with `MEMBER`) and answering whether sign-in is required and which accounts it deleted; `start_app(['issuer' => …])` takes its tokens and asks it | the same stand-in, started by `startApp()` with no sign-in hint (`startStandIn(dir)` for a suite's own, as `setup.js` does); `iamState({ user, deny })` says whom it signs in next or that it refuses, and returns what it was asked (`log`) |

| Command | What | Time |
|---|---|---|
| `node backend/tools/php.js backend/tests/run.php` | every `backend/tests/unit/*.test.php` and `backend/tests/api/*.test.php`, four files at a time, each in its own process and database: 252 tests, on the newest PHP and on 8.2, the library's floor (`php backend/tests/run.php` where the PHP first on PATH is 8.2+; Git Bash's is 7.4 on the owner's computer, see [environment.md](environment.md)) | ~25 s |
| `… run.php backend/tests/unit/srs.test.php` | some PHP files | |
| `npm test` in `frontend/` | `ng test` (Vitest, jsdom): 428 tests in 42 files (476 before 2026-10-11: the specs of the app's own sign-in guard and interceptor, and of its own People page, went with them - the library tests its own); `scripts/catalog-fixture.mjs` first writes the catalog PHP builds from `backend/data/` for them | ~15 s |
| `node frontend/e2e/run.js` | Edge, the production build, everybody signed in through the library's stand-in IAM: a deep link signed out, a refused sign-in (the library's screen, its Try again and the bar's Sign in back on the page asked for: /exam, /kanji/item/…), the whole study loop + an exam, the bar's keys over a review and a paper, the bar's menus by keys (a real Tab), Your data, sign-out waiting, the token and the zone going only to this site, the admin panel by role, People (the library's page: the list, a delete after its question, recorded), feedback sent from the foot by a learner and read on the Feedback page with its badge, the error log, the audit log, a backup made (Back up now), a migration waiting (an exam paper open as it lands: its hand-in refused without an error and the paper kept, back once the library's page has loaded the tab afresh by itself, then handed in; the anotoki library's page for a visitor, a learner and an EDITOR everywhere, with no page made behind it — none asks for data, no answer fails —, a signed-out ADMIN signing in from it and reaching the Migrations page, an Apply that fails (PostgreSQL's words on the page) and one that applies, back to the app by the menu in words), two time zones, a Slovak pass, then visitors (sign-in not required: the notice, one visitor per lesson batch, an exam, Sign in straight after the last answer moving it all, sign-out, sign-in switched on with a key held, a visitor's refused sign-in and its Back, the notice in Slovak on a phone): 203 checks | ~4 min |
| `node frontend/e2e/setup.js` | Edge, the setup page on a built upload: not set up, this computer's way, a website's, then the app signing in on each, then the website installed and its settings gone: 42 checks | ~1 min |
| `node frontend/e2e/screens.js [filter]` | 29 screens × light/dark/phone and Slovak phone light/dark (145 shots; a visitor's home, the library's update-waiting page, the failed sign-in's screen, the feedback form and the admin tools' pages among them), then the room: the top bar measured 86 times (signed in, signed out, visiting, the admin panel) at 360-1280 px (the admin panel's at 360, 390, 1170, 1171, 1351 and 1530) (`bar-*.png`) and its menus open and Tabbed out of 5 times (`menu-*.png`); into `frontend/e2e/shots/`; fails on overflow, an error, key-shaped text, English left on a Slovak page, or a bar that is not one row in order | ~10 min |

The browser suites run against the production build: build it first with
`node frontend/scripts/ensure-build.mjs` (it builds only when the sources
changed), e.g. `node frontend/scripts/ensure-build.mjs && node
frontend/e2e/run.js`. In `frontend/`, `npm run e2e`, `npm run e2e:setup` and
`npm run screens` run the same three files. There is no package at the
repository's top any more (2026-10-04), so no `npm test` there.

## What each suite pins down

PHP (`backend/tests/lib.php`: `test()`, `before()`, `after()`,
`assert_same()` — strict, `assert_true()`, `assert_match()`,
`assert_throws()`, `start_app()`, `test_site()`, `call()`, `test_form()`,
`test_page()`, `test_token()`):

- `unit/conjugation.test.php` — both conjugation charts cell by cell (70 + 84),
  the くる/つくる trap, kanji spelling, honorific ます-forms, adjective forms.
- `unit/srs.test.php` — WaniKani intervals, penalties, floor, burn, that
  practice leaves the schedule alone, and that the autumn's repeated hour
  floors to its first occurrence (as the browser-era JavaScript did).
- `unit/catalog.test.php` — 317 kanji numbered 1–317 with the book's
  per-lesson totals; SRS ids unique; vocabulary uses only the course's kanji
  and sits in its latest kanji's lesson; every vocabulary item has a clip in
  both voices, and every clip in `backend/data/audio.json` exists in `backend/data/audio/`.
- `unit/exam-bank.test.php` — bank size, distinct options, seed
  reproducibility, part/lesson scope, answer index correctness, and that the
  seeded RNG still gives the first (JavaScript) version's numbers, so a seed
  gives the paper it always gave.
- `unit/audio.test.php` — what a word is spoken as (`speech_spoken()`), the
  requests (kanji with yomigana), and the builder with a fake voice in temp
  folders: each word once per voice, a rebuild sends only what is missing,
  unused clips are removed, a changed recipe or voice remakes exactly its clips
  (also after a `--limit` run), a failed request or a stop keeps what was made
  and deletes nothing, an unreadable index stops the build, a refused word is
  skipped, a dry run sends nothing.
- `unit/build-data.test.php` — building `backend/data/source/*.tsv` again gives exactly
  the `backend/data/*.json` in the repository.
- `unit/source-names.test.php` — no file and no file name that git would
  publish (`git ls-files -co --exclude-standard`) names the course the data
  comes from (the owner's requirement), every one of them (the history
  folders it once left out are deleted). Commit messages are not checked:
  keep them clean by hand.
- `unit/php74-syntax.test.php` — every PHP file git would publish (Composer's
  `backend/vendor/` aside) still parses under PHP 7.4 (the owner's editor
  checks with one; there may be no 7.4 to try): PHP's tokenizer finds match,
  `?->`, named arguments, union, intersection and `static` types, constructor
  promotion, enums, readonly, throw as an expression, catch without a
  variable, `f(...)`, `new` in a default, trailing commas in parameter lists,
  `$object::class`, `0o` numbers, typed and dynamic class constants — and a
  second test proves it finds each.
- `unit/translations.test.php` — the catalogue as the migrations leave it
  (the app's own keys: the anotoki library's, `anotoki.`, left out):
  English and Slovak, English first; the library's set after this app's own,
  its keys in the database described as it describes them; every key with an
  English and a Slovak string; plural families whole (`.one`, `.few`,
  `.other` in both languages); no namespace named after a file the frontend
  names (`changelog.json` would read as a key); every language a migration
  writes strings for undeletable; every key the frontend uses in the
  database, and every database key used (the library's key scan, given this
  frontend by `backend/tools/translation_keys.php`: every `.ts` and `.html`
  of `src/app` but the specs and `core/testing/` - and no `core/auth/sdk/`
  any more, the IAM's SDK of before); every
  seeded string passing the checks a save makes (the library's, with this
  app's ways); the problem page's own English
  (`standin/problem/problem.component.ts`) and the bar's the seeded English
  word for word; the kit's words the same before the strings come and after
  (the library's English, or `KIT_ENGLISH` over it, the seeded English of
  every library key); a string migration's gate checking exactly the keys
  it writes, in every language; 004 touching only its own three tables; 005
  in 004's form (a header, 004's line endings, one `ADD COLUMN` on `users`,
  inserts into the translation tables that step aside, rewords only under
  the seeded-value guard, deletes only of the keys
  `MIGRATION_005_DELETED_KEYS` lists — `error.no_access`,
  `error.this_computer_only` —, a check at its end that names the column and
  every key it writes; without its last line, a draft that says so); 006 and
  008 likewise; 009 in a form of its own (a temporary copy of the strings it
  moves, keys and strings inserted from it, one description, the listed keys
  deleted, a check at its end that names every one); and reading a language
  out of an export or a backup. Its `migration_keys()` reads the seed's lists with
  regular expressions, and finds the gate's list from its end (the last
  `VALUES` before `AS k(name)`): one pattern spanning the whole catalogue runs
  out of PCRE's JIT stack, and a pattern that cannot run throws rather than
  finding nothing. (The checks of a string, the weak `If-None-Match`, the key
  scan's own cases and the file format are the library's, tested there.)
- `api/translations.test.php` — the bundle (merged with English, objects
  even when empty, 404 for what is no code without asking the database, 304
  for its tag), who may do what (`/api/admin`: a learner, with no role or a
  `MEMBER` of before, 403 `staff_only`; an `EDITOR` rewords, imports and
  exports, and gets 403 `admin_only` on the languages and the people; `ADMIN` allowed; a
  role in a body, an address or a header is nobody's; signed in first, then
  who asks, then the size; a non-JSON body and a body over 1 MiB changing
  nothing; no token from this computer either), the languages (added offered
  or hidden, renamed, reordered, switched off, English never; two added at
  once against the limit; deleted with a copy first, never English or
  Slovak, waiting for a save in progress), saving strings (only the changed
  ones, by whoever saved them, all checked before any is written, each
  refusal naming its key), export and import, the command line (`--export`,
  `--import`, `--status` and its exit code; on a database without the words
  or behind the files, the Migrations page or `manage.php --sync` named,
  never a request), `updated_by` following a moved
  user id (changed by hand) and emptied with a deleted one, one wire format -
  snake_case on every route, a camelCase field of before no field -, and no
  PHP warning in the log. The routes are the anotoki library's in this app's
  groups: the answers are its, the checks and the error body this app's.
- `api/strings-through-the-library.test.php` — migration 009 on a database
  shaped like an installed one (008 applied, the owner's rewordings in it, a
  language left without a string): its check failing it by name when a string
  did not come over as it was, or a language came that was not there, and then
  nothing of it staying; the upload as it goes up - 009, then the library's
  set: every string of the words that moved through as it was (text, who,
  when, every language, a blank one blank), and the library writing its own
  only where the app had none.
- `api/errors.test.php` — what a failure says: its sentence, its code, and
  its reason (`detail`) only under PHP's built-in server — a database that
  cannot be reached (`database_unavailable`), anything else (`server_error`),
  a migration waiting for an administrator (the anotoki library's 503
  `update_pending`, the same everywhere: no file named, nothing logged, with
  the app's own headers), 404 and 405 keeping their codes; and
  once for real, a server whose database is not there (and
  `/api/site-status` saying `unavailable`, never the setup page).
- `api/kanji-api.test.php` — learn / review / practice / notes / settings /
  reset through HTTP, moving the clock by editing the test database;
  every answer in `srs_log`, every row the signed-in person's; the day's
  backup (named by the UTC day) taken by a page load and never by an answer;
  the progress as the data file holds it (the kanji-only download gone); a full reset backed up
  first — that person's data alone, named after them, with the log — and the
  log kept; the summary naming its stage groups (the home page draws them
  without the catalog).
- `api/exam-api.test.php` — no answer leaks, perfect/zero/70 % scoring,
  foreign answers refused (409, nothing saved), report and history, clips
  streaming from `backend/data/audio` (byte ranges too, `HEAD` without a body; a bad or
  escaping name answers 404), the built app's pages (its files as they are, a
  page's address its `index.html`, no dotfile, `.php` or file outside the
  build, an unknown address with an extension a 404), without a build a page
  saying how to build it while the API answers, the browser told where to sign
  in (and health naming no sign-in mode), and the server logged no PHP warning.
- `api/access.test.php` — whether sign-in is required here
  (`src/access.php`): the stand-in IAM's public route (the switch, a 404, 503
  while down, `Cache-Control: public, max-age=60`, every ask in its log);
  sign-in required whatever the IAM says while the database cannot keep
  visitors (its `users.visitor_key_hash`, migration 007's, dropped by the
  test): a person studies, nobody and a visitor's key get 401
  `sign_in_required` (never a 503) and nobody is made, the move says 503
  `visitors_unavailable`; with it (added back), the IAM's answer relayed by `/api/auth/config` (`login_required`, the library's boot configuration): off,
  on, a 404 as on, kept for `application_ttl` and asked once in it, the last
  value while the IAM is away, required when nothing was ever read and not
  asked again while it backs off (a ttl of 3 s there: the library counts whole
  seconds, so a ttl of 1 may end at the next tick); the
  test's own file the same way (off, on, missing, not JSON, another site's
  answer, a string for a boolean); the seams (`application_file`,
  `application_ttl`, `cache_dir`, `ACADEMY_APPLICATION_FILE`) for a
  throwaway database only.
- `api/visitors.test.php` — visitors (`src/visitors.php`,
  `learner_middleware()`), with the IAM's answer "not required"
  (`test_access(false)`) and 007 from the template; visitor ids are never
  assumed (found by their key's hash). The relay (`login_required` false,
  `visitor_keep_days`); nobody reads as an empty learner (progress, summary,
  catalog, meta, attempts, a report 404, a paper) and nobody's resets write
  nothing; the first save makes a visitor - the key in `X-Visitor-Key` of a
  no-store answer and nowhere in the body, a negative id, the address as a
  keyed hash, the zone the browser named - whose data the key opens, and
  another key, no key or a person do not see; a refused first save (no such
  item, kanji first, no seed) makes nobody and counts nothing; a write that
  is not JSON - plain text, a form, no type at all, what another site's page
  may send unasked - 415 `unsupported_media_type` on every save address,
  nobody made, no key; the limits
  (per address with a trusted proxy's `CF-Connecting-IP`, IPv4-mapped IPv6,
  an IPv6 /64 as one address, `X-Forwarded-For` alone and an untrusted
  proxy's header counting for nothing, per hour, at once - new visitors only,
  never one already here nor a person); the caps (answers, exam attempts: no
  paper at the cap; a person has none); a token always wins over a key (an
  expired, a foreign, a garbage token, Bearer alone: 401 `invalid_token`, the
  visitor not even seen; Basic is no token); sign-in required (401
  `sign_in_required` for a key and for nobody, the visitor kept); a key opens
  no address that needs a signed-in person; a visitor's own resets take no
  copy; the move (every rule of the table in [sign-in.md](sign-in.md),
  *Visitors*; the person's copy first; asked again: `found: false`; 422
  without a key; whatever the switch; 503 `visitor_move_retry` when the
  visitor's row stays held, and a wait while the person's is); the sweep
  after an answer (an old visitor with all of its rows, never a recent one or
  a person; a statement timed out is logged and costs no answer; at most once
  an hour); no visitor on the People page or in the app's own copies, none in
  the day's copy, the People page's count of them, a restore of everybody
  from a copy removing them; in the
  test process `users_hold()` for a visitor gone, no copy of a visitor, and
  `client_address()` (trusted proxies, a list read from the right, the
  buckets).
- `api/visitors-migration.test.php` — migration 007 on a database at 006 with
  two people's data: a database it does not expect (an id below 1 written by
  hand) fails it, its own check at the end fails it by name when a row came
  or went on the way, and either way nothing changed; applied, every row as
  it was, the old `CHECK (id > 0)` gone, a row a person (id > 0, no key) or a
  visitor (id < 0, a key), visitor ids from -1 down; its form (whole, with
  its last line - while it was a draft, saying so at its top -, LF, no row of
  anybody's written, the check last).
- `api/auth.test.php` — sign-in, the one way (the anotoki library's auth
  module, `src/auth.php`): how to sign in
  (`/api/auth/config`: the IAM, `client_id`, `login_required`); the pages, the clips, health
  and the app's own words (`/api/translations/{code}`) without a token; every
  address with somebody's data (`/api/me/data` too), and every admin address
  (the people's too), 401 without a token
  (with `WWW-Authenticate`), from this computer too, and for an expired token,
  one for another app or from another IAM, an ID token, a forged one, one
  without a user id, the Bearer scheme with no token after it (401
  `invalid_token`), a Basic header (no token: only Bearer claims to be
  anybody, the library's `Identify`) - never a fallback to anybody; a token
  with `MEMBER` alone (every account holds it) or no role a learner, kept out of the
  whole admin panel (403 `staff_only`); the roles read from the token (`auth_roles()`, which drops `MEMBER`);
  two people with their own progress, settings, notes, reviews and resets;
  the users rows made and renamed from the tokens; attempts with the same id
  kept apart, reports only for their own person (with the no-script policy);
  what this computer is (`auth_from_this_computer()`: another `Host`, a
  proxy's `Forwarded` / `X-Forwarded-For` / `X-Real-IP` are not) and that it
  decides nobody's sign-in, health naming the database and folder to it alone;
  signing in through the stand-in IAM end to end (a code with PKCE, the app
  taking its token, an editor's rights, a refresh used once, a refused
  sign-in, a sign-out ending the session); a refused token's reason logged on
  one line and clipped, however its header is made; the settings required
  (`not_set_up` without them), an earlier version's (`mode` `iam`,
  `local_user_id`, `app.local.php` with a time zone) still set up, and one
  for the sign-in mode `none` not, with the reason; the tests' settings
  folder and keys file honoured for a throwaway database only (a keys file
  named in `auth.local.php` too); no copy of the IAM's SDKs left, on either
  half (signing in is the library's).
- `api/migration.test.php` — migration 002 on the owner's data in the shape of
  001: the check at its end fails it (and nothing changes) when a row changes
  on the way; every row comes through as it was and becomes user 1's; the new
  keys let two people have the same item, day and attempt id; the app reads
  the migrated data.
- `api/me.test.php` — your own data as one file: the download (theirs alone,
  no database name, `no-store`, named by their own day, their zone in it);
  a round trip (after a reset and a lesson, the file brought back gives back
  what it held, after a copy of what it replaced, of their data alone);
  the same file twice (replaced, never added to; a copy each time; one
  `imports` line); a file of another id into the caller's account only; a
  file of several people (the caller's part; none of them the caller: 422
  `several_people`); every kind of file that is not one, or damaged, 422
  `not_a_data_file` with its sentence and nothing changed — and a value the
  database refuses rolled back; the zone the request names winning over the
  file's; the limit from `memory_limit` (`me_import_limit()`), a data file's
  memory once read measured, and on a server with `memory_limit=48M` and
  `post_max_size=1K` a file over the limit 413 `too_large` with `{limit}`
  while one just under it, nearly all answer log, comes in and is copied by
  the next; an answer arriving during an import waiting for it (a second
  connection holding the row as an import does) and then working on the
  imported state, and an import waiting for an answer; the page's
  `IMPORT_CEILING` (`home/your-data/`) the same 16 MiB as `IMPORT_LIMIT_MAX`.
- `api/people.test.php` — the People addresses (the library's routes on this
  site's people): the list (the latest seen
  first, names, zones, items learned, attempts, in the library's snake_case)
  for `ADMIN` alone (an
  `EDITOR` 403 `admin_only`, a learner and the person themselves 403
  `staff_only`, signed out 401); a delete (a copy of all of it first, which
  restores them alone; every row of theirs and their users row gone; a
  string they reworded kept by nobody; their feedback's words kept, its
  address and browser gone; nobody else's touched); 404 for any id
  the site has nobody of; the person back again with nothing; a delete
  waiting for an answer being saved and deleting that too; an answer waiting
  for a delete and then starting their data afresh, never a 500.
- `api/people-migration.test.php` — migration 010 (final since 2026-10-11;
  while it was a draft, the tests applied it by name) on a database shaped
  like an installed one (up to 009 and
  the library's words of before, two people's data, the owner's rewording of
  the words that move): its check failing it by name - and nothing of it
  staying - when a row of somebody's data went, a reworded string did not come
  over as it was, a string that stays changed on the way, a string under the
  library's key came in a language the app's key had not, or `anonymized_at`
  came filled;
  the upload as it goes up (the library's `anotoki_admin`, 010, its
  `anotoki_translations` 003 and 004, `anotoki_people`, in that order): every
  row as it was, the reworded words under the library's keys with who and
  when, the library's own for the rest, no stored refusal; the scrub of the
  IAM's deleted accounts (a person who left: the name the IAM's placeholder,
  their exam papers' name gone and their stored report "Unnamed
  candidate", their feedback's address and browser and their audit names
  gone; a person who stays and an id the site never knew untouched; a second
  run changing nothing; the recorder never writing that row again; the IAM
  out of reach said so); the People page's Check now (unreachable, then done:
  handled and scrubbed counted, recorded as `people.synced`, the deleted
  account listed under its placeholder) for `ADMIN` alone.
- `api/admin-tools.test.php` — the library's admin tools on this site: every
  address of the error log, the audit log, the feedback and the backups for
  the site's `ADMIN` alone (nobody and a visitor's key alone 401
  `sign_in_required`; a token that is no good, an ADMIN's run out an hour
  ago, one for another app, an ID token, one naming a key the IAM has not,
  one signed with another key of the IAM's key's name: 401 `invalid_token`;
  a learner 403 `staff_only`, an `EDITOR` 403 `admin_only`, in this site's
  words; the writes too); the error log (a 404 written down without its query string or
  token, a refusal never written, cleared and recorded); the audit log (an
  `EDITOR`'s saved words under their name, found by it; read-only); the
  feedback (a learner's message keeping the address they sent, and none
  when they cleared it - never their account's put back by the server -,
  one sent without their name keeping neither their id nor an address,
  even one typed, nobody refused while sign-in is required and taken while it is
  not, the honeypot keeping nothing, an unknown section refused, the
  sections `Kanji` and `Exam`, the badge counting the new ones down as they
  are read); the backups (a stale sign-in asked to sign in again, one made,
  its ticket good once, a restore round trip, every step recorded, this
  site's own JSON copies untouched; with the IAM out of reach, the restore's
  scrub said in `after_restore_error` and the hour's stamp gone after the
  answer); a restore's own scrub blanking again an account the IAM deleted
  since the backup, before it answers; the library's counts kept (14 daily,
  5 before an update, 5 before a restore); the day's
  backup once, after the day's first page load, beside the app's own copy;
  while an update waits, the error log and the backups answering the `ADMIN`
  and a restore, the audit log, the feedback and the People page not.
- `api/time-zone.test.php` — each person's own time zone: in process with
  the clock given (the same moment counted on the 5th in Tokyo and the 4th in
  New York, *today* and the 7-day forecast following, a report's date the
  reader's; the forecast days named by the person's dates, next to both
  changes of summer time in Bratislava; Kolkata's and Kathmandu's hours in UTC; the site's `utc_date()` /
  `utc_stamp()` unmoved); what a zone is (`time_zone_known()`: one PHP and
  ICU both know — every zone taken formats, a zone only PHP knows is no zone
  and a report is dated at its offset, a person with such a zone kept or named
  hands in two exams; the two print a note and return where this PHP's ICU
  knows every zone); on the server
  with Pacific/Kiritimati and Pacific/Pago_Pago, whose dates always differ:
  two people's answers on two days, the kept zone, UTC for somebody who never
  names one, a review rounded to Kolkata's hour, the zone written only when it
  changes (the row's `xmin`), a bad header ignored, a traveller's days, the
  day's backup named by the UTC day, a stored report's date in the taker's
  zone; and a database without the column (a site whose 005 has not arrived
  whole: the request's zone counting, nothing kept, the data file and the
  People page working; that such a file waits is `api/deploy.test.php`'s).
- `api/backup.test.php` — the day's backup (nothing for an empty database; a
  complete copy of everybody's data once a day, named by the UTC day even for
  a request far east, naming its database; the last
  14 kept), a throwaway database's backups kept out of `backend/storage/backups/`, the raw copy
  of every table before a migration, a restore bringing everybody back, a
  version-1 file refused (it is no longer read) and a copy of one person's
  data restoring theirs alone, the copy of one
  person before their reset (their last 14 kept) restoring theirs and nobody
  else's, a backup that holds nobody refused before anything is deleted, a
  file written aside under a name of its own, picking one person out of a
  backup, `manage.php --restore` of a version-1 file refused, changing
  nothing, and of a copy of one person's data restoring theirs; `--owner-id`,
  `--import` and `--user` gone, and `--check`; `manage.php --backup` taking
  its copy while the newest migration waits as a draft (as on the owner's
  computer, no draft named), `--sync` and `--restore` waiting for it; `--check`
  with a whole migration pending naming who applies it (an `ADMIN` on the
  Migrations page, or `--sync`; never a request) and the content's rebuild a
  request's; a backup of everybody holding the app's
  words (`translations`) and a copy of some people none, a restore passing
  them over (and a file without them restoring as before), and the copy of a
  language's strings before it is deleted.
- `api/deploy.test.php` — a hosted site end to end: `build-dist.php` refuses
  to build while a migration is a draft unless `--allow-draft` names it (and,
  with no draft, builds), then builds
  the upload (what it holds and leaves out: nothing beside `public/` and
  `backend/`, the study content in `backend/data/`, no `router.php`; `--list`
  has every clip), served as
  Apache serves it (`.ht*` files refused), closed before the setup page runs
  (the anotoki library's 503 `not_set_up` with the way to the setup page, to
  every address; `/api/site-status` answered),
  the setup page as a website's (the token written whole — a half-written
  token file replaced, nothing left beside it — and no form passing without
  it, nor anything going on when it cannot be written; a field or cookie sent
  as a list (`token[]=x`) refused as ever, not a 500; then the database with
  a PostgreSQL user of its own, as a host makes one, a wrong password said
  without PDO's codes and the database's answers in the family's words; the
  form's fields the token, the database and the IAM alone, with the defaults
  `anotoki_japanese` and 5432; the token's button handing over nothing;
  settings (`auth.local.php` the IAM alone, no `app.local.php`), migrations,
  content, whatever an earlier form sent besides passed over, the lock, itself
  deleted; refusing to run again; the owner's data then brought in under
  their IAM user id through `PUT /api/me/data`, the zone of that request
  kept), the installed site signed into with test tokens,
  and later uploads: a new migration left alone while it lacks its last line
  (a draft, `"ready": false`, on the Migrations page; the site going on and
  ready), then, whole, waiting: `update_pending` to anybody at
  `/api/site-status`, every other address 503 `update_pending` with
  `Retry-After: 60` to an administrator and to nobody alike — but the open
  ones: how to sign in, the words, the health check, the clips —, nothing
  applied by a request; the Migrations page's
  addresses (the list, a file's SQL, Apply) an ADMIN's alone, from the token
  (a learner 403 `staff_only`, an EDITOR
  `admin_only`, nobody 401), listing it pending and the rest applied with
  when (ISO 8601, UTC), a file's SQL and no other file's, 409 `busy` at once
  while another holds the lock, then Apply: applied after a raw
  copy (its file named in the note), ready, the content rebuilt by the next request,
  Apply again "nothing"; one that fails on Apply (the one before it applied,
  the failed one rolled back whole and named with PostgreSQL's words, the
  site waiting at every try, a copy only when the tables changed, the fixed
  file applied after its own copy, the log naming it); the setup page run again on purpose, showing nothing of what is set
  before the token or after (an empty password keeping the saved one), and
  taking the raw copy before it migrates; and the update that
  brings 004 while it has not arrived whole: the bundle 503
  `translations_unavailable` (the library's), nothing logged, the rest of the site going on; and,
  installed, its settings gone: every address "not available", never the
  setup page (`installed` true, no `setup`), ready again with them back. Its test
  migrations are numbered 901–904, out of the way of the real ones, and
  `backend/translations.php` must stay out of the upload.
- `api/site-state.test.php` — where the site stands and what it answers,
  on a database that starts empty (every migration waits): `update_pending`
  at `/api/site-status`, to anybody — whatever the IAM says about signing in
  here (required, not, no answer) and whatever the browser sends (nothing, a
  visitor key nobody knows, a token that is no good or ran out); every
  address but the open ones 503 `update_pending` with `Retry-After: 60` to a
  visitor, a learner and an administrator alike, the open ones answering as
  they would; crafted paths that only look like open ones (sent as written:
  `/api/admin/migrations/../x`, `%2e%2e`, `%2F`, a trailing `%0A`, under the
  words', the clips', the health check's and how to sign in's addresses too)
  503 like any other, to an administrator too, while the Migrations page's
  three answer, a trailing slash and all; the Migrations page an administrator's from the token alone
  (nobody 401, a learner and an editor 403, no row written), its Apply
  building the database from nothing; then ready, the study addresses
  refusing nobody with 401 where sign-in is required, and the status still
  answered to anybody.
- `api/build.test.php` — the library's engine on a database built from
  nothing (each file in a transaction of its own, listed in this site's
  `migrations` table, its shape as ever), and `manage.php` on it: `--check`
  says what is left, `--sync` builds the content and applies a migration
  that waits first.
- `api/setup.test.php` — the setup page on the owner's computer: before it is
  set up every address says so, the anotoki library's way, with the way to
  the setup page (this computer's copy is never installed), and
  `/api/site-status` answers; the page from this
  computer (no token, the nonce cookie `HttpOnly` and `SameSite=Strict`, the
  database and the IAM and no other field, the defaults `anotoki_japanese`,
  5432, `postgres`, `http://localhost:4300`, `japanese-academy`, the button
  **Save**, a script policy with a nonce, `Referrer-Policy: same-origin` so
  its own form says where it comes from); forms that did not come from the
  page refused (wrong nonce, no cookie, another `Origin`, `Origin: null`, a
  nonce sent as a list) and another `Host` getting the token page; **Test
  connection** for the database in the family's words (empty; a database in
  the shape of 001 with the owner's data, N updates to apply; a missing one
  this user may not create, and one the developer's user may; one that is
  there but closed to this user; a wrong password; nothing listening) and for
  a stand-in IAM (`stand_in_iam()`; a wrong address; an `http://` address that
  is not this computer's); Save (a raw copy, 002 to 004, every row as it was,
  user 1's, `auth.local.php` the IAM alone, no `app.local.php`, the page
  staying; the owner signed in as user 1 finding their data); an earlier
  version's settings (`mode`, `local_user_id`, a time zone) still working,
  shown and written afresh, and one for the sign-in mode `none` not set up
  until saved again; and the same copy asked as a website showing nothing of
  what is saved.
- `api/upkeep.test.php` — every migration but 001 ends with its own
  `-- end of NNN`, or is the newest and a draft that says so; a draft waits on
  every database but the tests' (`db_migration_drafts_allowed()`: never
  `anotoki_japanese_academy` or any name that is not `academy_test_…`, never
  without its name in `ACADEMY_MIGRATION_DRAFTS`, and the tests name exactly
  the drafts there are); while one of this site's own files is a draft, every
  library file waits with it on a database of anybody's (`db_own_draft()`,
  read with a name that is no test's, never connected to) and none on the
  tests' databases; the engine as this site has it (`db_migrator()`:
  the `migrations` table as it is, one set, each file whole in one exec,
  under the upkeep's lock); the stamp stored with the content is the one from
  before the build, so a request after it looks again; one apply at a time:
  while another holds the upkeep's lock (an Apply, the setup page,
  `manage.php`, the content's rebuild) every way of applying — the
  Migrations page's Apply 409 `busy`, `upkeep_migrate()` for the setup page
  and `manage.php` — says so at once and applies nothing; while a migration
  waits for its Apply a request builds nothing, saves no stamp and does not
  wait for the lock an Apply holds; and an Apply that fails, outside PHP's built-in
  server (as a website answers): its `error` is PostgreSQL's own words, and
  the error log has them too.

Angular (`frontend/src/**/*.spec.ts`, Vitest):

- `kanji/answer.spec.ts` — meaning/reading acceptance cases, and that
  **every** catalog item (built by the PHP code, `backend/tests/tools/catalog.php`,
  through `scripts/catalog-fixture.mjs`) is answerable and accepts its own
  printed answers.
- `kanji/session/session-engine.spec.ts` — meaning then reading, a missed half
  back a few cards later, misses counted, one half only, invalid answers
  changing nothing, "My answer was right", wrap-up, half-answered items.
- `kanji/kanji-state.service.spec.ts` — the catalog loaded once and the
  progress every time, due and learned, vocabulary waiting for its kanji, the
  next lessons in course order, the learner's synonyms; the progress loaded
  again after a move into the account that finished later.
- The sign-in's own machinery - the client (the IAM's SDK of before, ported),
  the interceptor (the token and `X-Time-Zone` to this site's API alone, a
  person's request never sent without a token, one retry as the same person,
  a visitor's key, the first save alone, `visitor_unknown` and
  `sign_in_required`), the guards, the callback and the failure's screen - is
  the anotoki library's since 2026-10-11, tested in its repository; the app's
  own specs of them (`auth.interceptor.spec.ts`, `sign-in.guard.spec.ts`)
  went with it. What is this app's is tested here, the library's real
  `AnotokiAuth` behind it with a stand-in client (`core/testing/auth-states.ts`,
  the library's `@anotoki/lib/auth/testing`; `provideAuth()` in a spec):
  `core/auth/visitor-key.spec.ts` — `remember()` never
  overwrites, the `storage` event, `forget()` compare-and-delete with `lost`,
  the first-save gate, the move on sign-in (once; the key gone, `moves`,
  `moved`, the moved stamp), another tab's move silent and a swept key
  `lost`, retries on a 5xx, 422 forgets, 401 waits, `settle()` 5 s at most.
- `core/auth/auth.service.spec.ts` — the start, this app's read of how it
  signs people in: `GET /api/auth/config` with the reader's time zone, the
  IAM and the client handed to the library; `visitor_keep_days` (or the
  camelCase of a server from before the library, else 30); nobody signed in
  where sign-in is required (no token, no card: the guard goes to the IAM);
  only `login_required: false` lets visitors in; signed in, the name, the
  roles (EDITOR staff, ADMIN staff and admin) and the account's preferences;
  not set up (nothing of the app goes on, `SiteStatus` told, the setup page
  offered only while never installed), a server that does not answer or
  refuses (a kind and a code, never a sentence), one that names no IAM (the
  kind `signIn`), `cannotStart()` never over a copy not set up. The page and
  its person: a session that ends while the page is open draws the Sign in
  card; somebody else signing in in another tab loads the page again, the
  same person goes on; a visitor's site that starts requiring sign-in, the
  card from then on; a sign-in that came back without one keeps its code -
  never the IAM's sentence - for the library's screen, not the card, and
  trying again goes back where it started; the same while visiting, never
  swallowed; `login()` with the IAM's pages in the language read here and
  `signInAgain()` asking for the password again; one that cannot start keeps
  its code; a visitor's sign-in waits for the saves on their way and asks
  before one that failed is left behind (the library's `beforeSignIn`);
  `logout()` after the saves, a learner who chooses to stay staying;
  `savePreferences()` through the library, one at a time. `fetch()`: a
  person's with the page's token and the zone, never a visitor's key, another
  site getting neither; a visitor's with the key and the zone, never a token,
  a 401 `sign_in_required` saying the switch turned on; a 503 telling
  `SiteStatus` (being updated: the gate stands in, the sign-in goes on; or not
  set up after all).
- `core/auth/sign-out.service.spec.ts` — signing out waits for the saves on
  their way (the spinner meanwhile), sends a note still waiting at once, asks
  in the learner's language when one failed meanwhile (Cancel stays signed
  in) or an exam paper is open, not for a failure said long before; a second
  press does nothing. The session, the notes editor and the exam tell
  `SavesInFlight` (`notes-editor.component.spec.ts`, `exam.component.spec.ts`;
  `session.component.spec.ts`: an answer whose save failed before Sign out,
  shown nowhere yet, makes it ask — once — until the summary has it).
- `core/api/not-set-up.interceptor.spec.ts` — any answer 503 `not_set_up`
  from this site stops the app, and the anotoki library's page takes its
  place (never the setup page for a site installed once); other failures —
  a site being updated too: the library's gate stands in and the sign-in goes
  on —, and other hosts' answers, change nothing of the app's.
- `app.routes.spec.ts` — every learner page asks the library's
  `personOrVisitorGuard` again (the callback and the failure's screen not),
  `/kanji` and `/exam` behind `whenReady`; the admin area behind `staffGuard`
  and every page of it but Translations behind `adminGuard`: ADMIN opens every
  admin page, EDITOR Translations alone (the others by address go home), a
  learner nothing; the old `/translations` and `/languages` lead to
  `/admin/…`; navigated with a stand-in IAM client: signed out, a deep link to
  the IAM and back to that very address, nothing navigated meanwhile; a
  sign-in that came back without one to the failure's screen, never round to
  the IAM again; visiting, the learner's pages open as they are and the admin
  panel goes to the IAM (or to the failure's screen after a refused
  sign-in).
- `app.component.spec.ts` — the bar above and the foot below in every state
  (with no strings, the English the app keeps; the sections only while the
  app can be used; a site not set up, or installed once and its settings
  gone); while an update waits, the library's page for a visitor, a learner,
  an editor and the `ADMIN`, no page made behind it; nobody signed in: on the
  way to the IAM nothing of the app, a session that ended the Sign in card, a
  sign-in that came back without one the library's screen; visiting, the app
  itself, and after a refused sign-in the library's screen in the page's
  place until its Back; signed in after all in another tab while the
  failure is said: it is put away, and the app is theirs.
- `standin/sign-in/sign-in.component.spec.ts` — the Sign in card: its own
  English with no strings, word for word; a sign-in that came back without
  one is no business of the card's (the library finishes the callback, the
  SDK's storage of before read as it was, and its screen says it); its words
  from the strings, following the language; **Sign in** to the IAM, back to
  this page, its pages in the language read here, the button held while the
  browser goes; a sign-in that cannot even start (the browser refuses the
  storage): its code for the library's screen, and the button free again.
- `core/auth/private-links.service.spec.ts` — `lockDown()` puts the no-script
  policy before anything of a report's; a download's file name; a visitor's
  report fetched as the visitor's (the library's `fetch()` sends the key this
  browser holds), an unknown key forgotten; while the site is being updated
  (or not set up after all) the waiting tab closed and no dialog.
- `home/your-data/your-data.component.spec.ts` — `readDataFile()` (one
  person, the caller's part of several, `several_people`, `not_a_data_file`);
  the zone line; Download through the sign-in's fetch under the server's
  name, and a failure worded; Bring back: the question with what the file
  holds, No sends nothing, Yes sends the file as it is and tells the page; a
  file too big for any server not read, a 413's limit checked from then on;
  every refusal worded from its code.
- `admin/tools.spec.ts` — the admin panel's pages that are the anotoki
  library's (People, Feedback, Errors, Audit log, Backups): each the library's
  page in the panel's frame (its landmark, the panel's width, English),
  asking its own addresses for the site's `ADMIN`; for anybody else each says
  whose it is and asks the server nothing. `core/admin.config.spec.ts` — the
  tools configured for this app: the site's `ADMIN` alone, from the token;
  "Sign in again" the IAM's password once more; the Migrations page offered
  while a table waits; the dates in the administrator's own order and clock;
  People's Delete asking in this site's words (what goes, by the counts on
  the row; that the server keeps a copy; "This is you." on the reader's own
  row); the visitors' line (how many, the oldest seen, the limits). The
  People page itself - the list, the search, the delete, Check now - is the
  library's, tested there (the app's own People page, and its spec, went on
  2026-10-11).
- `core/feedback/feedback-button.component.spec.ts` — Send feedback, at the
  foot of every page: offered to a person and to a visitor in the library's
  words, in the language on the page; not while the app itself is not shown
  (on the way to the IAM, the Sign in card, a copy not set up, the library's
  page standing in); it opens the library's form in the kit's dialog (the
  app's two sections as places, "Send it without my name" for a person, the
  address written in; Cancel closes it), a visitor's without "without my
  name"; no key pressed in it reaches the page (Enter in the message never
  hands an exam paper in); it sends to `POST /api/feedback` what was written,
  the place, and the page without its query.
- `core/i18n/translations.config.spec.ts` — the anotoki library's
  translation service wired to this app (the library tests the service
  itself: which language, the cache, the account's language, the saves): a
  choice and the words kept under the names this app always had
  (`academy-language`, `academy-language-cache`, `academy-admin-drafts`),
  so a returning visitor's choice is the language the start asks for; the
  bundle through plain `fetch()` with no token, and a refusal handed on with
  what the server said; a refused bundle read as what the app can show
  (`not_set_up` stops it, `update_pending` tells `SiteStatus`, any other 503
  the problem page at the start or with no words in memory, never once the
  site is not ready); the words asked for only while the app or its Sign in
  card is shown; the admin pages' settings (Translations for the editors and
  the administrators, Languages for the administrators, the copy a deleted
  language left named). `core/i18n/time-wording.spec.ts` (the words of the
  page with the account's date order and clock, following a change of
  either); `core/i18n/pipes.spec.ts` (translate, plurals, dates — a signed-in person's
  own date order and clock, followed when they change, the language's again
  for a visitor), `error-text.spec.ts`
  (every code worded, an unknown one `error.unknown`; `visitor_limit` by its
  `limit`, with its `max`; the library's `translations_unavailable` in
  `not_up_to_date`'s sentence),
  `core/kit.config.spec.ts` (the anotoki library's kit in this app's words:
  every word of the kit from the database's `anotoki.*` keys, which 009
  filled with the app's words, the owner's rewordings included, the library's
  own Slovak only where the database has none; English in the admin panel,
  and with no strings the English the app says its own way (`KIT_ENGLISH`,
  "The app’s sections", "System" - only those two); the theme - the device's,
  kept for the boot script, signed in the account's, a choice saved to it, a
  refusal said by the library's note; the languages on offer under their own
  names, a choice the translation service's),
  `core/boot.spec.ts` (the start, in order, in every state — where the site
  stands first; not set up or out of reach, nothing more asked; an update
  waiting, the start going on as ever, never the problem page, whatever the
  words answer; the move before
  the words, 5 s at most, visiting; the title
  strategy — the app's name alone while the library's page stands in;
  `keptWord()`), `app.component.spec.ts` (the bar first and the
  foot last in every state, with and without strings; nothing drawn on the
  way to the IAM, the card after a session ended, the library's screen after
  a failed sign-in; a visitor's app, and after a refused sign-in the
  library's screen in its place until its Back; the
  library's page: not set up with the way to the setup page, installed once
  "not available right now" without it; while an update waits, a visitor's
  "The site is being updated" with no error, no code, no setup or migrations
  button and a quiet Sign in — this app's own, back to the page —, in
  Slovak too, a learner's and an editor's with no button at all, and the
  ADMIN's "A database update is waiting" and the way to the Migrations page,
  which opens, alone of the app's pages; the pages the gate's marked template
  (`anotokiSitePages`) — the page open when an update stops the site taken
  down with its outlet, none made for an address followed while it waits, the
  page of the address made again once the site is back: it fails with the
  0.1.0 form); the kit's question host after the foot;
  `admin/migrations/migrations.component.spec.ts` (the library's page in the
  panel's frame, English whatever the learner reads: a draft shown as one,
  the dates in the administrator's own order, Apply asked first, what was
  applied and the copy's note, the site running again and its words asked for
  anew; for anybody but the ADMIN only whose page it is, nothing asked —
  the page's own cases, a failure's words and `busy`, are the library's tests
  and the browser suite's);
  `home.component.spec.ts` and `kanji/dashboard` (the visitor notice and its
  days, no Your data for a visitor, Sign in waiting for the saves and asking
  about an open paper, the notes after a move, the page loaded again; the
  dashboard's hour axis, two digits or the account's 12-hour clock).
- The top bar: `top-bar/top-bar.component.spec.ts` — the library's bar
  (`<anotoki-top-bar>`) as this app words and wires it: one row in the
  family's order; Kanji (with the reviews due, three digits) and Exam, the
  section and the page marked, the brand on the home page; the admin panel's
  links by role (the eight, all but Translations for ADMIN only; Feedback
  with the count of new messages, the library's `FeedbackUnread`, asked for
  only once the site's ADMIN is in the panel), English there - the
  kit's words too -, no language, "anotoki Japanese · admin panel"; the
  language button holding its code, the theme's "System" the app's word; the
  person's menu (name, address, role pill, Your anotoki
  account, Admin / Back to Japanese Academy, Sign out) in Slovak and English;
  focus into a menu, the arrows, Home and End, Escape back to its button;
  **Tab and Shift+Tab from the first, a middle and the last item of both
  menus: `defaultPrevented`, the menu closed, `document.activeElement` the
  menu button**; a click outside; a change of language followed; no strings
  (the English it keeps - never the kit's English for a word the app has -,
  no warning); signed out (Sign in, in the reader's language - on the
  library's failure screen too), visiting (Kanji,
  Exam and Sign in — which waits for the saves on their way, asks about an open
  paper, and is in the phone's menu, **which stays open while it waits (the
  item's spinner and "Saving…", the focus on the menu button, never on
  `<body>`) and closes with the focus there**, after the IAM or a Cancel), not
  set up; **no
  key of any control — the brand, the links, the language, the three theme
  buttons, the person's button, the items — reaches `document`, and Enter and
  Space keep their own action**; on a phone the row, the reviews due on the
  menu button and in its name (one, few, other), the menu's contents, a link
  chosen, the Tab rule, signed out; the desktop bar from 761 px, the admin
  panel's from 1171 ("Japanese" and "admin panel" beside the menu button up
  to 1170), its short brand up to 1350 and the person's name from 1530 (the
  learner's from 961); **a crossing of 760 px closes the open menu**; Sign out waiting
  (spinner, "Saving…") and asking over an open paper; a theme the account
  refuses said under the switch in the app's words, and Escape on any of its
  controls puts it away; while the site is being updated no
  section and no Admin panel (all of it back once it is ready), and the
  ADMIN on the Migrations page that link alone (an editor nothing).
  `exam.component.spec.ts` and
  `session.component.spec.ts` press Enter, Space and the paper's / the
  card's keys on every control of the real bar over an open paper (a spoken
  last question: nothing chosen, played or handed in) and a review (nothing
  checked), then the same keys on the page doing their work.
  `exam.component.spec.ts` also, the exam inside the real gate as the app has
  it (`GatedExamComponent`): while the site is being updated, the paper is
  taken down at once and kept for the tab as it is, and no key reaches it; a
  hand-in refused (503 `update_pending`) raises no dialog, and the gate takes
  the paper down, kept; taken down while the site is not ready it stays
  kept, left while it is ready it goes, its copy with it; the site back, the
  library's page loads the page afresh without the gate making the pages
  first (anotoki-lib 0.2.0), and the fresh page puts the paper back; put back
  when the exam opens again — its question, answers, flags, name and clock,
  then handed in with its spec and start — for the person it was kept for
  alone, its copy used then: from there it is an open paper like any other
  (an answer, another question, a flag keep nothing while the site is
  ready); an answer's step on to the next question, still waiting when the
  gate takes the paper down, does nothing; a visitor's paper put back for
  whoever signed in is theirs (its copy used, so somebody signing in after
  them in that tab does not get it); a kept paper of somebody else's, or one
  that is not a paper, gone.
  The theme switch and the language switcher are the anotoki library's,
  tested there (the three choices, `data-theme`, the arrow keys, the
  account's theme followed and saved one at a time, the latest last; the
  switcher's menu, its keys and the Tab rule); here, how this app wires them
  (`core/kit.config.spec.ts`, above; the admin panel's English there too).
- The admin panel: Translations and Languages are the anotoki library's
  pages, tested there (the grid, plural families, the search, changed cells,
  the drafts surviving a session's end and a sign-in as the same person, the
  question before leaving); here, `admin/translations/translations.component.spec.ts`
  and `admin/languages/languages.component.spec.ts` (each in the panel's
  frame, English whatever the reader reads, and asking the page before it is
  left), `app.routes.spec.ts` (the library's guard on those two alone). People,
  Feedback, Errors, Audit log and Backups are the library's pages too (since
  2026-10-11), tested there; here `admin/tools.spec.ts` and
  `core/admin.config.spec.ts` (above). The kit's question in a spec is
  answered through `core/testing/kit-question.ts`.
- Every screen's component in English and Slovak: home, exam, the kanji
  shell, dashboard, lessons, practice, session, summary, browse, item, the
  tile, the notes editor, `worded-parts.spec.ts` (material inside a sentence,
  with its `lang`), the stand-in page (`problem.component.spec.ts`: what
  happened and Try again, never a way to the Migrations page — the
  library's page has it).
- `core/format.spec.ts` (times, dates, counts in words: "1 attempt", in the
  language's locale; a signed-in person's own date order — the four — and
  clock, 24 hours or 12 with the language's am and pm, side by side in a
  moment, the weekday's clock, a chart's hour, the admin panel's English
  moment),
  `core/changelog/app-version.component.spec.ts` (the
  foot: the version, "What's new" and its dot until the news is read, the
  dialog; news read when the version had two numbers, "0.2", stays read for
  "0.2.0", and "0.2.1" has its dot), `core/changelog/changelog.service.spec.ts`
  (versions compared number by number, a missing one 0, `0.4` the same as
  `0.4.0`, `0.10.0` after `0.9.0`, what is no version the same only as
  itself; every entry of `public/changelog.json` three numbers, newest first,
  the newest `package.json`'s version).

A spec gets its strings from the anotoki library's
`@anotoki/lib/translations/testing` (`provideTestTranslations()`): the real
`TranslationService` with the strings the spec gives it in memory, English
or another language with English beside it, and no HTTP; a key not given
shows as itself and warns, as in the app; a library key (`anotoki.*`) reads
the library's words. A spec that draws the kit with no strings adds
`core/testing/kit-english.ts` (`provideKitEnglish()`: the English this app
says its own way). The kit's markup is read by the kit's own class names
(`anotoki-<piece>__<part>`, since anotoki-lib 0.3.0).

Browser (`frontend/e2e/`, Edge through `playwright-core`):

- `run.js` — everybody signed in through the anotoki library's stand-in IAM, as on a website.
  First a deep link opened signed out (`/kanji/reviews`): straight to the
  IAM and back to that address, with nothing of the app drawn (a
  `MutationObserver` notes any `<main>` while no session is kept) and no API
  asked on the way but where the site stands, the config and the words; then a refused sign-in
  (`iamState({ deny: true })`): the anotoki library's screen saying so in its
  words, never the IAM's (`sign-in-failed.png`), and its Try again signing in
  once the IAM lets them, back on the page asked for (and refused on
  `/kanji/item/…`, the bar's Sign in coming back there). Then the study flow as that
  learner: types answers like a person (romaji readings, one miss on
  purpose), makes reviews due, uses F for the item info, practises, uses "My
  answer was right", clicks the links that point at the current address
  after a session (Dashboard after a lesson started there, "New practice"),
  holds a practice save back for 1.5 s and leaves while it saves (the summary
  must not come back over the dashboard), checks browse and a listening exam
  answered with the keys (1–4, ←, F, →, Enter — twice at the end, storing one
  attempt). On the first review card and on the paper's last question: the
  language chooser by keys (Enter, ArrowDown, Enter) turns the page Slovak and
  nothing else happens, and **Enter and Space on the bar's controls** (the
  dark and light choices, the person's button and Escape, the links) do what
  the control does and never reach the page — the card unchecked with its
  typed answer, the paper open, nothing chosen, no attempt; Sign out over the
  open paper asks first, and "no" keeps it. Then moving between the sections
  and the brand without a page load, the version and What's new at the foot,
  **the bar's menus by keys** at 1280 px (Enter opens on the first item, End,
  Home, ↑ round, Escape back to the button; **real Tab and Shift+Tab presses
  from the first and the last item close the menu with the focus on its
  button**; the language menu opens on the language in use and Tab closes it
  on its button) and at 390 px (the one menu: Kanji, Exam, the person's items;
  Tab and Shift+Tab). **Your data**: the zone line, Download (her own file,
  the server's name, one person), three items learned meanwhile, Bring back
  asking first with what the file holds, "keep mine" sending nothing,
  "replace" putting the file's data back (a `before-import` copy on the
  server, another person's data untouched), a file that is not one refused
  before anything is sent. **Sign-out** with an answer held back: the item
  says "Saving…" (`aria-busy`), the answer lands, then the IAM's logout and
  the card; the tokens gone. Reports fetched with the token (opened from
  memory, with its no-script policy, and reports made to get round it — a
  script before `<head>`, a no-break space before the doctype — running
  nothing); the token on every API call and on nothing else (the words, the
  config and where the site stands go without one — the last with no key
  either —, the IAM never gets it), and `X-Time-Zone` the
  browser's on every call to this site and never to the IAM; then a sign-in
  in another tab starting the app, and somebody else's there loading the page
  again, as them. **The admin panel**: an ADMIN signs in on `/?lang=sk` (that
  tab Slovak, another English), the Slovak home page with no key-shaped text,
  Admin panel in her menu → `/admin/translations` in English (the page, `<html
  lang>`, the bar: Translations, Languages, People, Feedback, Errors, Audit
  log, Backups, Migrations, "Back to Japanese
  Academy"; the window 1440 px wide); a bad Slovak string refused beside its key, leaving with it
  unsaved asking in a modal dialog (Escape stays, Leave leaves); a language
  added unticked comes in hidden; People (the library's page) lists
  everybody, "you" on her own row, Delete their data asks its question with
  the counts and deletes (a `before-delete` copy; nobody else's rows touched;
  the row gone; `person.data_deleted` in the audit log); **Send feedback** at
  the foot of a learner's page, in the library's words: the form sent, then
  closed, no browser error; the panel's bar counting the new message beside
  Feedback, the Feedback page (the library's) showing it under the sender's
  name, opened and read; the error log's page (the library's) in its frame;
  the audit log's (the data deleted and the language added, by her); the
  backups' (**Back up now**, after its question, by an ADMIN who signed in at
  the IAM minutes ago: one made and listed, beside the app's own JSON
  copies). An EDITOR: Translations only, `/admin/people`, `/admin/languages`
  and every page of the admin tools by address go home, the API answers 403
  `admin_only`; a
  learner has no Admin item, `/admin` goes home, the API answers 403
  `staff_only`. **A migration waiting** (a file put whole into the run's
  copy): every address with data 503 `update_pending` with `Retry-After`,
  nothing applied by a request; a visitor (nobody signed in) reads the
  anotoki library's "The site is being updated" — no error, no code, no setup
  or migrations button, a quiet Sign in and no trip to the IAM; a signed-in
  learner the same page with no button at all; an EDITOR the same at `/`,
  `/admin/migrations` and `/admin/translations`, with no way to the
  Migrations page; for the learner and the editor nothing of the pages behind
  it is made — no address with data asked for (the home page and
  Translations would), no answer failing; then **an administrator who is signed out** (no session
  planted: the trip itself is what is tried) gets the visitors' page, its
  Sign in goes to the IAM and back to the same page, signed in, "A database
  update is waiting" and the way to the Migrations page, which opens while
  it waits (the file pending, the rest applied); Apply asks first, a
  migration that fails stops at its file with PostgreSQL's words and nothing
  applied, the fixed file then applies (up to date, nothing pending), and
  the menu leads back to the app with its words and no page load; the app
  back for everybody, the Migrations page's addresses 403 `admin_only` to an
  EDITOR. Meanwhile **a paper open as the update lands** (Pia's: two answers
  and a flag): its hand-in refused with no error but the "unanswered?"
  question, the library's page in its place and the paper kept for the tab;
  once the ADMIN has applied, her tab asks again and loads afresh by itself,
  the paper back on its question with its answers and flag (the gate made
  the exam once more in the page about to go: its copy has to survive that),
  the copy following one more answer, then handed in and scored, the copy
  gone. **Time zones**: a browser on Pacific/Kiritimati (UTC+14) and
  one on Pacific/Pago_Pago (UTC-11) — never the same day — each sees its own
  today's count on the dashboard, and the server keeps the zone; the second
  in Slovak: no key-shaped text on the learner's pages, in the person's menu,
  the language menu, the phone menu or Your data's question. **Visitors**
  last (`app.signInRequired(false)`: the stand-in IAM says sign-in is not
  required, the server keeps its answer a second): `/` opens with no trip to
  the IAM, the notice (30 days), no Your data, person's menu or admin link,
  nobody made by a page view; `/admin/migrations` goes to the IAM all the
  same, and refused there (`deny`, as when `MEMBER` is taken away) the
  library's screen says why, in its words, in the visitor's page's place
  (`#signInFailure`), the bar's Sign in refused the same way, and its Back
  gives the visitor the page again - never round to the IAM; a lesson batch makes one
  visitor (a negative id) and one key in `localStorage`, the first answer
  alone and the rest with the key, none with a token; a reload keeps it; an
  exam and its report (fetched with the key); a second batch with its saves
  held back 1.5 s and Sign in pressed straight after the last answer: it
  waits ("Saving…"), signs in, and the note says what moved - all ten items
  and the attempt in her account, no visitor and no key left; signed out, a
  fresh visitor's page with nothing; sign-in switched on with a key held: the
  page goes to the IAM, the key goes only with the move (with the token), and
  the visitor's item is the account's. Never a token and a key together but on
  the move, never the key to the IAM. Then the notice in Slovak on a phone
  (390 px: the plural form of 30 days, no sideways scroll, Sign in in the
  menu, no key-shaped text). Fails on any page error, error or warning the
  app logged (a key with no string warns), or failed request.
- `setup.js` — the setup page on a built upload with the real app (the draft
  migration let in by `--allow-draft`, as the tests alone may) and the
  library's stand-in IAM that signs people in (its migrations listed in the
  four sets): the anotoki library's "This site is not set up
  yet" page (with the way to the setup page: never installed) and both forms in light,
  dark and phone layouts (no overflow); from this computer no token, the
  database and the IAM and nothing else (`nonce`, `db_*`, `issuer`,
  `client_id`), the family's defaults (`anotoki_japanese`, 5432, `postgres`,
  the development IAM), **Test connection** in the family's words for the
  database (a wrong password, a database this user may not make, the empty
  one) and the IAM (no IAM at an address, an address no IAM may have, the IAM
  and its keys) without sending the form; **Save**: the settings (database
  and auth only), every migration applied, the content built, the page
  staying; the app then going to the IAM and back, signed in, with lessons to
  learn; the page opened again showing what is saved (never the password) and
  Test connection saying it is up to date. Then a website (a name of another
  host, which the browser is told is this computer and treats as secure, as
  https is): the token first, **nothing of what is saved, before the token or
  after it**, Enter in the token checking it (and sending no form), the
  buttons wanting it too, a pasted token checked at once ("That is the
  token.", and no more), Save with the fields filled in again: the lock, the
  page and its token gone, the app signing in through the IAM; then,
  installed, its settings gone: the library's "The site is not available
  right now", asking again by itself — never the setup page.
- `screens.js` — everybody signed in (a planted session of an ADMIN): the
  home page, every kanji screen (with a review answered wrongly and its item
  info open), the exam's three screens, the changelog, Your data's question,
  the bar's menu open (the person's on a desktop, the one menu on a phone), the
  feedback form open from the foot, the library's screen of a refused
  sign-in, a visitor's home with its notice (sign-in
  not required, nobody signed in), the admin panel's pages (Translations,
  Languages, People, Feedback and a message open in it, Errors, Audit log,
  Backups, Migrations - a feedback message, a hidden language and a backup
  seeded for them), and the
  anotoki library's page while a database update waits, as a learner reads it
  and as the site's ADMIN does (a migration taken off the list for it, and put
  back): 29
  screens in light, dark and phone, each checked for key-shaped text,
  overflow and what the reviews found by eye (`looks()`: People's Delete in
  view, the What's new dot beside its words and clear of the '·' before
  Send feedback, Your
  data's question focused on Keep mine, the mark's halo in dark), and **the
  Slovak pass** — every screen again at 390 px in a
  Slovak browser (`sk-phone`, `sk-phone-dark`), each checked for `<html
  lang="sk">` (the admin panel: `en`), no text that is a key, no English string
  of the bundle whose Slovak differs outside `[lang=en]` / `[lang=ja]`; the
  kanji tab strip is checked on every screen. Then **the room**: the bar
  measured piece by piece at 360, 390, 760, 761, 960, 961 and 1280 px (the
  admin panel's at 360, 390, 1170, 1171, 1351 and 1530, a new feedback
  message seeded so its count shows), in
  English and Slovak, light and dark (dark at the five widths that are shot),
  signed in with a 20-character name and 999 reviews due, signed out (the
  card), visiting (sign-in not required: the links and Sign in, no person's
  button; measured last, at the five widths that are shot) and in the admin
  panel — one row (at most 72 px high), in order,
  nothing overlapping or off the screen, no sideways scroll, the brand whole;
  up to 760 px the menu button with the due count on it and no links (the
  admin panel's up to 1170, "Japanese" with "admin panel" under it), from 761
  the links (the admin panel's eight from 1171, its whole brand from 1351)
  and the person's button, the
  name beside it from 961 (the admin panel's from 1530; the widths read from
  `top-bar.component.ts`); `bar-<mode>-<lang>-<width>-<light|dark>.png`. Then the menus open
  at 390 (Slovak, light and dark), 1280 (English, light and dark) and 360
  (dark), shot (`menu-*.png`), and a real Tab and Shift+Tab from an item: the
  menu closed, the focus on its button. `node frontend/e2e/screens.js room`
  runs only the room. Its phone shots mostly show buttons at their mouse size:
  a full-page shot switches Edge's touch emulation off
  ([environment.md](environment.md)); a modal dialog in a full-page shot
  stands where the screen's top was, its backdrop over the first screenful
  only.

Every browser context comes from `newContext()` (`browser.js`), with locale
`'en-GB'` unless a test says otherwise, so the suites read English on a
computer whose system language is Slovak; signed-in sessions say `en` in
their token.

The audio checks (catalog, exam bank, exam API, the browser's listening exam)
need the clips of `backend/tools/build-audio.php`, which are in git.

The PHP port was checked against the JavaScript it replaced before that was
removed: the same bank (all 11,523 questions), catalog, papers, scores,
reports, schedule and every API answer (see [decisions.md](decisions.md)).
The Angular app was checked against the plain-JavaScript pages it replaced:
the same flows in the browser suite, and screenshots of every screen side by
side.

Not part of any suite: the check under a real Apache (2026-09-28, Apache 2.4
with PHP 8.2 both as mod_php and over FastCGI, with a config of its own in a
temp folder): the setup, routing, and the sign-in token reaching PHP — with
`CGIPassAuth`, with `SetEnvIf` alone, and not at all without both
([hosting.md](hosting.md)). It was made for the version before
`backend/` + `frontend/`; the `.htaccess` rules for the app's own addresses
came after it.

## What to run for a change

In this table "PHP tests" is `node backend/tools/php.js backend/tests/run.php`,
"frontend tests" `npm test` in `frontend/`, and the browser suites are run
after `node frontend/scripts/ensure-build.mjs`.

| Changed | Run |
|---|---|
| anything in `backend/` | the PHP tests |
| `frontend/src/**` or anything the pages render | the frontend tests, the PHP tests (the key test), `node frontend/e2e/run.js`, `node frontend/e2e/screens.js` + look at the shots |
| `backend/setup.php`, `backend/config/` | the PHP tests, `node frontend/e2e/setup.js` |
| `backend/data/source/**`, build scripts | `node backend/tools/php.js backend/tools/build-data.php` (and `build-audio.php` when words changed), the PHP tests |
| `backend/src/conjugate.php`, `backend/src/generate.php`, authored items | the PHP tests + the `academy-japanese-reviewer` agent |
| `backend/migrations/` | the PHP tests (the template picks new migrations up; after an edit of one not committed yet, `node backend/tools/php.js backend/tests/tools/testdb.php template --fresh` first) and `node backend/tools/php.js backend/manage.php --check` |
| the app's words: a key used or dropped in `frontend/src/`, a migration with strings, `backend/src/translations.php` | the PHP tests (`translations.test.php`, unit and API), `node frontend/e2e/run.js`, `node frontend/e2e/screens.js` (the Slovak pass); `node backend/tools/php.js backend/translations.php --status` on a set-up copy |
| sign-in, the routes or middleware, Apache's files, `build-dist.php`, `router.php` | the PHP tests (auth, deploy, exam-api) and `node frontend/e2e/run.js` |

## Reading results — expected noise

- Audio requests answer **206** (the browser asks for byte ranges) — correct.
- An exam verdict text like "32.5% FAIL · F" is the exam's own output for
  random answers, not a test failure.
- `/api/kanji/learn` and `/review` can legitimately answer 409 (double submit);
  the browser suite ignores those in its error check.
- `academy_test_template: updated (3 s)` at the start of the PHP tests means the
  content or a migration changed since the last run.
- `[auth] a token was refused: …` in a server's log is the sign-in tests at
  work: they send bad tokens on purpose.
- The setup suite's "not set up" pages answer `/api/auth/config` with 503: that
  is what they are for, and its error check ignores it. The browser suite's
  pages while a migration waits have no such allowance: the pages are the
  gate's marked template, none is made behind the library's page, and a 503
  `update_pending` there is a failure (until anotoki-lib 0.1.1 the pages
  behind it asked for their data, and the suite left those "waiting answers"
  out of its error check).
- `[i18n] no string for …` in a browser suite is a failure, not noise: a key
  the page asks for has no string in the database.
- The native file picker on the admin panel's Translations page speaks the
  browser's own language ("Vybrať súbor" in a Slovak Edge): the app cannot
  word it.

## Adding tests

PHP: a new `backend/tests/unit/<area>.test.php` or
`backend/tests/api/<area>.test.php`, starting with
`require __DIR__ . '/../lib.php';` — before anything else. Then
`test('name', function (): void { … })` with the assertions above. API tests:
`before(function (): void { $GLOBALS['app'] = start_app(); })`, then
`call($GLOBALS['app']['base'], 'POST', '/api/kanji/learn', ['id' => 'k:大'])`
→ `['status', 'body', 'raw', 'headers']`: as `TEST_USER` (1, no role), signed
in through the test IAM. Somebody else: `call(…, test_bearer(test_token(501,
['EDITOR'])))`; nobody: `call(…, no_token())`. The app's own functions work in the
test process too, on the same throwaway database (`test_db()` makes it;
`test_db_empty()` an empty one, for a migration's test); they take the user
id first. Move the SRS clock with
`db_exec('UPDATE srs_progress SET next_review = academy_time(?) WHERE user_id = ? AND item_id = ?', [now_ms() - 1000, TEST_USER, $id])`.
A person's zone is the request's `X-Time-Zone` header; in process,
`date_default_timezone_set()` (and back to `'UTC'` in a `finally`), with the
clock given to the function (`kanji_summarize($uid, $now)`, a `$t`), never
the real one: a test of days must not depend on when it runs (zones on both
sides of midnight: Pacific/Kiritimati and Pacific/Pago_Pago). Who waits for
whom: hold a row in a second connection (`db_connect()`, a transaction) and
send the request with `test_begin()` (`waits()`, then `answer()`). PHP's own
settings for a server: `start_app(['ini' => ['memory_limit' => '48M']])`.
PHP's built-in server answers one request at a time: a second request while
one waits waits too.

Angular: a `*.spec.ts` next to the file it tests. Provide
`provideZonelessChangeDetection()`, fake what talks to the server
(`ApiService`, `fetch`), and `await fixture.whenStable()` before looking at a
component's DOM.

Browser scripts: `frontend/e2e/browser.js` finds Edge/Chrome (`BROWSER_PATH`
overrides) and provides `launch()`, `newContext()` (locale `'en-GB'` unless
told otherwise: use it for every context), `watch()` (collects page errors,
errors and warnings the app logged, failed requests), `keyShaped()` (text
that looks like a key of the app's words, the admin panel and file names
aside) and a reporter. `frontend/e2e/helpers.js`: after `isolate()`,
`startApp()` gives `base`, `api(url, person, {method, body, zone})` (a fetch
with that person's token), `sql(query, ...params)`, `backups` (the server's
backup folder) and `makeDue(ids, agoMs, userId)`; a browser signs in either
the real way — open a page, and the stand-in IAM signs in whom
`iamState({ user: {id, username, roles} })` named (`deny: true` refuses) —
or at once with `plant(context, person, lang)`. People are
`{ sub, name, roles }`, with `MEMBER` as every account has it (`MEMBER` alone
a learner); give each test its own ids. A suite that switches whether sign-in
is required starts with `startApp({ applicationTtl: 1 })` and calls
`app.signInRequired(false | true)` (it waits until the server relays it);
it switches back before it ends.
A browser that is not on this computer's address (`setup.js`'s website)
needs `--unsafely-treat-insecure-origin-as-secure` for the sign-in's PKCE,
as a website has https.
Angular draws what a key or a click changed a moment later: wait for the
result (`waitForSelector`, `waitForFunction`) rather than reading the page
right after `keyboard.press`. Find buttons by their accessible name
(`getByRole('button', { name: /^Learn \d+ items?$/ })`): their text may carry
spaces around it. Navigate through `about:blank` when the target URL equals
the current one, or the page won't reload. Audio tests pass `audio_build()` a
fake `synth` and temp folders. A test that switches the page to Slovak
switches it back before the suite goes on: the choice is kept in that
browser, and the rest matches English words. A finished kanji session stays
on screen with a read-only answer box until its saves land: a loop that
answers cards stops there.
