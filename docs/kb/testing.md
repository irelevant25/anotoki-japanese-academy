# Testing

Every test that needs the database gets a **throwaway database**:
`academy_test_<…>`, a copy of `academy_test_template` (tables and study
content, brought up to date at the start of each run by
`php backend/tests/tools/testdb.php template` — a few seconds when `data/` or
the generators changed, instant otherwise; it applies only migrations it has
not applied, so after an edit of one not committed yet, `template --fresh`
drops the template and replays them all), made on the PostgreSQL server of
the developer's own settings (`backend/config/database.local.php`: this copy
must be set up first). Backups go to a temp folder. The database is dropped
when the test file or suite ends; set `ACADEMY_KEEP_TEMP=1` to keep it and the
folders for inspection. Databases a killed run left behind are swept 6 hours
later (and a site test's database user once it owns no database). No test can
reach the owner's database or `backups/`, no test reads `progress/`,
`results/` or `reports/`, no test sends anything to Google, and no test asks
an IAM: sign-in is tested with tokens the tests sign themselves
([sign-in.md](sign-in.md)).

How the isolation works:

- **Settings of their own.** A test's server gets a folder of the three
  settings files (`backend/tests/tools/test-config.php`), named by
  `ACADEMY_CONFIG_DIR`: the throwaway database (with the developer's server,
  user and password, required from their `database.local.php`, never copied),
  the auth mode, the test IAM's keys file, the backup folder, and for the
  browser suites the real build of the app. The app honours such a folder only
  for an `academy_test_…` database, and stops if it names any other.
- PHP: `backend/tests/lib.php` is the first thing every PHP test file loads. It
  writes the file's settings folder before the app loads, and refuses to go
  on if the app was loaded first, or if the database name isn't a test name.
  `start_app()` then starts the real server (`php backend/server.php` as PHP's
  built-in server runs it) with settings of its own, and checks, through
  `/api/health`, that it uses that database, folder and auth mode.
  `test_site()` builds the website's upload into a temp folder instead
  (`backend/tools/build-dist.php`), with a database user of its own that owns
  the database, as a hosting panel makes them, and serves it as Apache would
  (`backend/tests/tools/front-controller.php` does what `.htaccess` does).
- Node (the browser suites): `frontend/e2e/helpers.js` `isolate()` picks the
  names; `startApp()` makes the database, writes the settings
  (`testdb.php config`), starts the server and makes the same check.
  `startApp()` may run twice in one script (one server without sign-in, one
  with); the last to close drops the database, and `closeAll()` does it for a
  suite that failed half-way.
- `backend/tests/tools/testdb.php` (template, create, site, drop, sweep, sql,
  config) only touches databases named `academy_test_…`.

Sign-in, in both: a test IAM — a key pair of the run's own, its public half in
a JWKS file that a server in auth mode `iam` reads instead of asking an IAM
(issuer `https://iam.test`, which exists nowhere).

| PHP (`backend/tests/lib.php`) | Node (`frontend/e2e/helpers.js`, `browser.js`) |
|---|---|
| `start_app(test_iam_env())`: a server in mode iam | `startApp({ auth: 'iam' })` |
| `test_token($id, $roles, $claims, $typ)`: any token, signed with the SDK's test helpers | `iamToken(sub, {roles, name, typ, …claims})`, signed by `backend/tests/tools/iam.php` |
| `call($base, $method, $url, $body, test_bearer($token))` | `iamSession(sub)` signs a browser context in; `emulateIam(context, person)` answers the IAM's addresses inside the browser |

| Command | What | Time |
|---|---|---|
| `npm test` | `npm run test:backend` + `npm run test:frontend` | ~40 s |
| `npm run test:backend` | `php backend/tests/run.php`: every `backend/tests/unit/*.test.php` and `backend/tests/api/*.test.php`, four files at a time, each in its own process and database: 169 tests | ~25 s |
| `npm run test:frontend` | `ng test` in `frontend/` (Vitest, jsdom): 472 tests in 39 files; `scripts/catalog-fixture.mjs` first writes the catalog PHP builds from `data/` for them | ~15 s |
| `npm run test:browser` | `frontend/e2e/run.js` — Edge, the production build: the whole study loop + an exam, the language chooser by keys, the app's own navigation and changelog, the owner's pages, then signing in and out of a hosted site's copy: 73 checks | ~2 min |
| `npm run test:setup` | `frontend/e2e/setup.js` — Edge, the setup page on a built upload: not set up, this computer's way, a website's: 40 checks | ~1 min |
| `npm run screens [filter]` | `frontend/e2e/screens.js` — 17 screens × light/dark/phone and Slovak phone light/dark (85 shots), then the room: the top bar measured 30 times (2 shots); into `frontend/e2e/shots/`; fails on overflow, an error, a key or English left on a Slovak page, or a squeezed bar | a few min |
| `php backend/tests/run.php backend/tests/unit/srs.test.php` | some PHP files (with PHP 8 — `npm test` finds it; see [environment.md](environment.md)) | |

The browser suites build the app first when its sources changed
(`frontend/scripts/ensure-build.mjs`).

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
  both voices, and every clip in `data/audio.json` exists in `data/audio/`.
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
- `unit/build-data.test.php` — building `data/source/*.tsv` again gives exactly
  the `data/*.json` in the repository.
- `unit/source-names.test.php` — no file and no file name that git would
  publish (`git ls-files -co --exclude-standard`) names the course the data
  comes from (the owner's requirement). The owner's study history
  (`progress/`, `results/`, `reports/`) is left out: tests never read it.
  Commit messages are not checked: keep them clean by hand.
- `unit/php74-syntax.test.php` — every PHP file git would publish (Composer's
  `backend/vendor/` aside) still parses under PHP 7.4 (the owner's editor
  checks with one; there may be no 7.4 to try): PHP's tokenizer finds match,
  `?->`, named arguments, union, intersection and `static` types, constructor
  promotion, enums, readonly, throw as an expression, catch without a
  variable, `f(...)`, `new` in a default, trailing commas in parameter lists,
  `$object::class`, `0o` numbers, typed and dynamic class constants — and a
  second test proves it finds each.
- `unit/translations.test.php` — the catalogue as the migrations leave it:
  English and Slovak, English first; every key with an English and a Slovak
  string; no placeholder a translation invents; plural families whole
  (`.one`, `.few`, `.other` in both languages); no namespace named after a
  file the frontend names (`changelog.json` would read as a key); every
  language a migration writes strings for undeletable; every key the frontend
  uses in the database, and every database key used (the key scan,
  `backend/tools/translation_keys.php`, with fixtures of its own: a family
  asked for as one string, a run-time key from an undeclared prefix, a
  translated string given to `innerHTML`); 004 touching only its own three
  tables; every seeded string passing the checks a save makes; the problem
  page's own English (`standin/problem/problem.component.ts`) the seeded
  English word for word; the text
  helpers, placeholders, a weak `If-None-Match`, and reading a language out of
  an export or a backup. Its `migration_keys()` reads the seed's lists with
  regular expressions, and finds the gate's list from its end (the last
  `VALUES` before `AS k(name)`): one pattern spanning the whole catalogue runs
  out of PCRE's JIT stack, and a pattern that cannot run throws rather than
  finding nothing.
- `api/translations.test.php` — the bundle (merged with English, objects
  even when empty, 404 for what is no code without asking the database, 304
  for its tag), who may do what (a `MEMBER` 403 `owner_only`, `ADMIN` allowed;
  without sign-in this computer only; another host's `Origin`, a non-JSON
  body and a body over 1 MiB changing nothing), the languages (added offered
  or hidden, renamed, reordered, switched off, English never; two added at
  once against the limit; deleted with a copy first, never English or
  Slovak, waiting for a save in progress), saving strings (only the changed
  ones, by whoever saved them, all checked before any is written, each
  refusal naming its key), export and import, the command line (`--export`,
  `--import`, `--status` and its exit code), `updated_by` following a moved
  user id and emptied with a deleted one, and no PHP warning in the log.
- `api/errors.test.php` — what a failure says: its sentence, its code, and
  its reason (`detail`) only under PHP's built-in server — a database that
  cannot be reached (`database_unavailable`), anything else (`server_error`),
  a failed migration (`not_up_to_date`), 404 and 405 keeping their codes; and
  once for real, a server whose database is not there.
- `api/kanji-api.test.php` — learn / review / practice / notes / settings /
  export / reset through HTTP, moving the clock by editing the test database;
  every answer in `srs_log`, every row the owner's (sign-in off); the day's
  backup taken by a page load and never by an answer; a full reset backed up
  first — that person's data alone, named after them, with the log — and the
  log kept; the summary naming its stage groups (the home page draws them
  without the catalog).
- `api/exam-api.test.php` — no answer leaks, perfect/zero/70 % scoring,
  foreign answers refused (409, nothing saved), report and history, clips
  streaming from `data/audio` (byte ranges too, `HEAD` without a body; a bad or
  escaping name answers 404), the built app's pages (its files as they are, a
  page's address its `index.html`, no dotfile, `.php` or file outside the
  build, an unknown address with an extension a 404), without a build a page
  saying how to build it while the API answers, mode `none` told to the
  browser, and the server logged no PHP warning.
- `api/auth.test.php` — a server in auth mode `iam`: how to sign in
  (`/api/auth/config`); the pages, the clips, health and the app's own words
  (`/api/translations/{code}`) without a token; every address with
  somebody's data, and every owner address, 401 without a token
  (with `WWW-Authenticate`), and for an expired token, one for another app or
  from another IAM, an ID token, a forged one, one without a user id, a Basic
  header; 403 without a role; two people with their own progress, settings,
  notes, reviews and resets; the users rows made and renamed from the tokens;
  attempts with the same id kept apart, reports only for their own person
  (with the no-script policy); a server without sign-in acting as the owner
  whatever token comes; mode `none` refused outside PHP's built-in server,
  this computer and a request straight to it (another `Host`, a proxy's
  `Forwarded` / `X-Forwarded-For` / `X-Real-IP`: 403, and health without its
  details); a refused token's reason logged on one line and clipped, however
  its header is made; the settings required (`not_set_up` without them); the
  tests' settings folder and keys file honoured for a throwaway database only
  (a keys file named in `auth.local.php` too); the vendored SDK versions the
  notes name.
- `api/migration.test.php` — migration 002 on the owner's data in the shape of
  001: the check at its end fails it (and nothing changes) when a row changes
  on the way; every row comes through as it was and becomes user 1's; the new
  keys let two people have the same item, day and attempt id; the app reads
  the migrated data.
- `api/backup.test.php` — the day's backup (nothing for an empty database; a
  complete copy of everybody's data once a day, naming its database; the last
  14 kept), a throwaway database's backups kept out of `backups/`, the raw copy
  of every table before a migration, a restore bringing everybody back, a
  version-1 file restoring into the owner's account only, the copy of one
  person before their reset (their last 14 kept) restoring theirs and nobody
  else's, a backup that holds nobody refused before anything is deleted, a
  file written aside under a name of its own, picking one person out of a
  backup, `--owner-id` moving everything (refused for a user with data of their
  own; nothing to move when the data is that user's already), the one-time
  import of the old JSON files from a fixture (once, only into an owner without
  study data, the files unchanged, a short old record completed, unreadable
  lines listed, an unreadable progress file importing nothing and named in the
  error, no file read at all when the database holds data), and
  `manage.php --import` / `--check`; a backup of everybody holding the app's
  words (`translations`) and a copy of some people none, a restore passing
  them over (and a file without them restoring as before), and the copy of a
  language's strings before it is deleted.
- `api/deploy.test.php` — a hosted site end to end: `build-dist.php` builds
  the upload (what it holds and leaves out; `--list` has every clip), served as
  Apache serves it (`.ht*` files refused), closed before the setup page runs,
  the setup page as a website's (the token written whole — a half-written
  token file replaced, nothing left beside it — and no form passing without
  it, nor anything going on when it cannot be written; a field or cookie sent
  as a list (`token[]=x`) refused as ever, not a 500; then the database with
  a PostgreSQL user of its own, as a host makes one, a wrong password said
  without PDO's codes; the files in `backups/` only once the token is proven;
  settings, migrations, content, the owner's backup imported into their IAM
  user id, mode `iam` whatever the form says, the lock, itself deleted;
  refusing to run again), the installed site signed into with test tokens,
  and later uploads: a new migration left alone while it lacks its last line,
  then applied by the next request after a raw copy; one that fails (503 at
  every try, naming the file, one copy for all the tries of one upload; taken
  out and put back, a copy of its own; the fixed file applied after its own
  copy); the setup page run again on purpose, showing nothing of what is set
  until the token is proven (its button then hands it over, never the
  password), and taking the raw copy before it migrates; and the update that
  brings 004 while it has not arrived whole: the bundle 503
  `not_up_to_date`, nothing logged, the rest of the site going on. Its test
  migrations are numbered 901–903, out of the way of the real ones, and
  `backend/translations.php` must stay out of the upload.
- `api/setup.test.php` — the setup page on the owner's computer: before it is
  set up the API says so (and to this computer why); the version before's
  settings (`src/config.local.php`) and a database in the shape of 001 with the
  owner's data; the page from this computer (no token, the nonce cookie
  `HttpOnly` and `SameSite=Strict`, sign-in off offered, the password never
  shown, a script policy with a nonce, `Referrer-Policy: same-origin` so its
  own form says where it comes from); forms that did not come from the page
  refused (wrong nonce, no cookie, another `Origin`, `Origin: null`, a nonce
  sent as a list) and another `Host` getting the token page; **Test
  connection** for the database
  (with the earlier password; a user who may not make the database) and for a
  stand-in IAM (`backend/tests/tools/stand-in-iam.php`; a wrong address; an
  `http://` address that is not this computer's); the upgrade (a raw copy,
  002 and 003, every row as it was, user 1's, the page staying); run again
  (never the password, a new user id moving the owner's data, sign-in on; and
  the same copy asked as a website shows nothing of what is set).
- `api/upkeep.test.php` — every migration but 001 ends with its own
  `-- end of NNN`; the stamp stored with the content is the one from before the
  build, so a request after it looks again.

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
  next lessons in course order, the learner's synonyms.
- `core/auth/auth.interceptor.spec.ts` — the token to this site's API and
  reports only, nothing in mode `none`, one retry with a fresh token after a
  401 — never as somebody else —, the session over when there is none.
- `core/auth/auth.service.spec.ts` — the app's states: mode `none`, signed
  out on a website, not set up (with the reason, at start or from a later
  answer), a server that does not answer or refuses; and with the real SDK,
  other tabs played by `storage` events: somebody else signing in loads the
  page again, the same person back or a refreshed token does not, a page that
  loaded signed out just starts, not set up stays so, and its own `fetch()`
  sends no token of somebody else; a sign-in that came back without one
  keeps its code and nothing of the IAM's English sentence.
- `core/api/not-set-up.interceptor.spec.ts` — any answer 503 `not_set_up`
  from this site puts up the "not set up yet" page (with the reason when
  given); other failures, and other hosts' answers, change nothing.
- `app.routes.spec.ts` — `/kanji` and `/exam` open only in state `ready`.
- `standin/sign-in/sign-in.component.spec.ts` — a sign-in cancelled or
  refused at the IAM worded from its code (`access_denied`: "Signing in was
  not completed…"), another failure "Signing in did not work. Try again.
  ({code})", in the page's language (through the SDK's own callback).
- `core/auth/private-links.service.spec.ts` — `lockDown()` puts the no-script
  policy before anything of a report's; the download's file name.
- `core/i18n/translation.service.spec.ts` — which language a page takes
  (`?lang=` for the tab, the choice, the token's `locale`, the browser's — a
  Czech browser Slovak —, English), when the server is asked, a bundle
  answered 503 changing what the app shows instead of leaving a page of keys,
  the cached bundle and its refresh;
  `core/i18n/pipes.spec.ts` (translate, plurals, dates), `error-text.spec.ts`
  (every code worded, an unknown one `error.unknown`),
  `language-chooser.component.spec.ts` (the chooser and its keys),
  `core/boot.spec.ts` (the start, in order, in every state; the title
  strategy; `keptWord()`), `app.component.spec.ts` (the top bar with and
  without strings), `account-menu.component.spec.ts`.
- The owner's pages: `owner/translation-grid.spec.ts` (plural families,
  search, changed cells), `translations.component.spec.ts`,
  `languages.component.spec.ts`, `owner-drafts.service.spec.ts` (drafts
  surviving a session's end and a sign-in as the same person),
  `unsaved-changes.guard.spec.ts`.
- Every screen's component in English and Slovak: home, exam, the kanji
  shell, dashboard, lessons, practice, session, summary, browse, item, the
  tile, the notes editor, `worded-parts.spec.ts` (material inside a sentence,
  with its `lang`), the stand-in pages (`kept-around.spec.ts`,
  `problem.component.spec.ts`).
- `core/format.spec.ts` (times, dates, counts in words: "1 attempt", in the
  language's locale), `core/changelog/app-version.component.spec.ts` (the
  version, its dot until the news is read, the dialog),
  `standin/not-set-up/not-set-up.component.spec.ts`.

A spec gets its strings from `core/testing/test-translations.ts`
(`provideTestTranslations()`): the real `TranslationService` with the
strings the spec gives it in memory, English or another language with
English beside it, and no HTTP; a key not given shows as itself and warns, as
in the app.

Browser (`frontend/e2e/`, Edge through `playwright-core`):

- `run.js` — types answers like a person (romaji readings, one miss on
  purpose), makes reviews due, uses F for the item info, practises, uses "My
  answer was right", clicks the links that point at the current address after
  a session (Dashboard after a lesson started there, "New practice"), holds a
  practice save back for 1.5 s and leaves while it saves (the summary must not
  come back over the dashboard), checks browse and a listening exam answered
  with the keys (1–4, ←, F, →, Enter — twice at the end, storing one
  attempt), moving between the sections without a page load, the version and
  its "What's new", and that without sign-in nothing about sign-in shows.
  The language chooser worked by keys (focus, Enter, ArrowDown, Enter) on the
  first review card and on a paper's last question: the page turns Slovak and
  nothing else happens — the card unanswered, the paper open on its last
  question, no new attempt — then back to English with the mouse. The
  owner's pages, in a context of their own: `/?lang=sk` makes that tab Slovak
  and leaves the address (another tab stays English); on Translations a bad
  Slovak string refused beside its key, and leaving with it unsaved asks in a
  modal dialog (Escape stays, Leave leaves); on Languages a language added
  without the box ticked comes in hidden, and is not in the public list. Then a
  second server in auth mode `iam`: the Sign in page, signing in through the
  emulated IAM, a lesson saved with the token as that person's, the progress
  download and a report fetched with the token (the report opened from memory,
  with its no-script policy, and reports made to get round it — a script
  before `<head>`, a no-break space before the doctype — running nothing), the
  token on every API call and on nothing else (the bundle of words, public,
  goes without one), the account menu, signing out;
  then a sign-in in another tab starting the app, and somebody else's there
  loading the page again, as them. Fails on any page error, error or
  warning the app logged (a key with no string warns), or failed request.
- `setup.js` — the setup page on a built upload with the real app: the "not
  set up yet" page and both forms in light, dark and phone layouts (no
  overflow); from this computer no token, sign-in off, the IAM's fields hiding
  with it, the browser's time zone, **Test connection** for the database (a
  wrong password, said plainly; the empty database) and a stand-in IAM (no
  IAM at an address; the IAM and its keys) without sending the form, **Set
  up**, the app then working without sign-in, and the page opened again never
  showing the password; then a website (a name of another host, which the
  browser is told is this computer): nothing of what is set before the token,
  Enter in the token checking it (and sending no form), the buttons wanting
  it too, a pasted token checked at once, what is set filled in once it is
  right (the password kept back, what was typed left alone), **Set up** with
  sign-in, the lock, the page and its token gone, the app's Sign in page.
  The migrations it applies include 004.
- `screens.js` — the home page, every kanji screen (with a review answered
  wrongly and its item info open), the exam's three screens, the changelog,
  a hosted site's Sign in page and account menu (open over the kanji
  dashboard, whose nav is the widest), and the owner's Translations and
  Languages pages: 17 screens in light, dark and phone, and **the Slovak
  pass** — every screen again at 390 px in a Slovak browser (`sk-phone`,
  `sk-phone-dark`), each checked for `<html lang="sk">`, no text that is a
  key (but on the owner pages, which list keys), no English string of the
  bundle whose Slovak differs outside `[lang=en]` / `[lang=ja]`, and no
  overflow; the kanji tab strip is checked on every screen. Then **the
  room**: the top bar's pieces measured (`locator.boundingBox()`) at 360,
  370, 390, 440 and 560 px, signed in with a three-digit due badge, without
  sign-in and signed out, in English and Slovak — everything needed inside
  the screen, nothing overlapping, no text cut short, "Academy" only above
  440 px — with shots of the signed-in Slovak bar at 360 and 390 px
  (`room-*.png`). `npm run screens -- room` runs only the room. Its phone
  shots mostly show buttons at their mouse size: a full-page shot switches
  Edge's touch emulation off ([environment.md](environment.md)).

Every browser context comes from `newContext()` (`browser.js`), with locale
`'en-GB'` unless a test says otherwise, so the suites read English on a
computer whose system language is Slovak; signed-in sessions say `en` in
their token.

The audio checks (catalog, exam bank, exam API, the browser's listening exam)
need the clips of `npm run build:audio`, which are in git.

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

| Changed | Run |
|---|---|
| anything | `npm test` |
| `frontend/src/**` or anything the pages render | `npm test`, `npm run test:browser`, `npm run screens` + look at the shots |
| `backend/setup.php`, `backend/config/` | `npm test`, `npm run test:setup` |
| `data/source/**`, build scripts | `npm run build:data` (and `build:audio` when words changed), `npm test` |
| `backend/src/conjugate.php`, `backend/src/generate.php`, authored items | `npm test` + the `academy-japanese-reviewer` agent |
| `backend/migrations/` | `npm test` (the template picks new migrations up; after an edit of one not committed yet, `php backend/tests/tools/testdb.php template --fresh` first) and `php backend/manage.php --check` |
| the app's words: a key used or dropped in `frontend/src/`, a migration with strings, `backend/src/translations.php` | `npm test` (`translations.test.php`, unit and API), `npm run test:browser`, `npm run screens` (the Slovak pass); `php backend/translations.php --status` on a set-up copy |
| sign-in, the routes or middleware, Apache's files, `build-dist.php` | `npm test` (auth, deploy) and `npm run test:browser` |

## Reading results — expected noise

- Audio requests answer **206** (the browser asks for byte ranges) — correct.
- An exam verdict text like "32.5% FAIL · F" is the exam's own output for
  random answers, not a test failure.
- `/api/kanji/learn` and `/review` can legitimately answer 409 (double submit);
  the browser suite ignores those in its error check.
- `academy_test_template: updated (3 s)` at the start of `npm test` means the
  content or a migration changed since the last run.
- `[auth] a token was refused: …` in a server's log is the sign-in tests at
  work: they send bad tokens on purpose.
- The setup suite's "not set up" pages answer `/api/auth/config` with 503: that
  is what they are for, and its error check ignores it.
- `[i18n] no string for …` in a browser suite is a failure, not noise: a key
  the page asks for has no string in the database.
- The native file picker on the owner's Translations page speaks the
  browser's own language ("Vybrať súbor" in a Slovak Edge): the app cannot
  word it.

## Adding tests

PHP: a new `backend/tests/unit/<area>.test.php` or
`backend/tests/api/<area>.test.php`, starting with
`require __DIR__ . '/../lib.php';` — before anything else. Then
`test('name', function (): void { … })` with the assertions above. API tests:
`before(function (): void { $GLOBALS['app'] = start_app(); })`, then
`call($GLOBALS['app']['base'], 'POST', '/api/kanji/learn', ['id' => 'k:大'])`
→ `['status', 'body', 'raw', 'headers']`. Without sign-in every request is
the owner, `auth_local_user_id()`. With it, `start_app(test_iam_env())` and
`call(…, test_bearer(test_token(501)))`. The app's own functions work in the
test process too, on the same throwaway database (`test_db()` makes it;
`test_db_empty()` an empty one, for a migration's test); they take the user
id first. Move the SRS clock with
`db_exec('UPDATE srs_progress SET next_review = academy_time(?) WHERE user_id = ? AND item_id = ?', [now_ms() - 1000, auth_local_user_id(), $id])`.

Angular: a `*.spec.ts` next to the file it tests. Provide
`provideZonelessChangeDetection()`, fake what talks to the server
(`ApiService`, `fetch`), and `await fixture.whenStable()` before looking at a
component's DOM.

Browser scripts: `frontend/e2e/browser.js` finds Edge/Chrome (`BROWSER_PATH`
overrides) and provides `launch()`, `newContext()` (locale `'en-GB'` unless
told otherwise: use it for every context), `watch()` (collects page errors,
errors and warnings the app logged, failed requests), `emulateIam()` and a
reporter;
`app.makeDue(ids, agoMs, userId)` makes reviews due (the owner's by default).
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
