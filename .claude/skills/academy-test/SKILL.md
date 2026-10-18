---
name: academy-test
description: Run and read the Japanese Academy tests (PHP unit and API tests, sign-in with the tests' own tokens, the built site and its setup page, the Angular unit tests, the browser suites against the production build, the setup page in a browser, screenshots) and choose the suites a change needs. Use after any code or data change in the app, before saying work is done, when a test fails, or when adding tests.
---

# Testing Japanese Academy

Run everything from the repository's top folder. It has no package of its
own (since 2026-10-04): the PHP tests run through `backend/tools/php.js`,
which finds a PHP 8.2+ (Git Bash's `php` is 7.4 on the owner's computer), the
Angular ones in `frontend/`, and the browser suites against the production
build, made first by `node frontend/scripts/ensure-build.mjs` (it builds only
when the sources changed). Every suite uses throwaway databases
(`academy_test_…`, copied from `academy_test_template`), settings of its own
and temp folders. None touches the owner's database or
`backend/storage/backups/`, none needs the owner's server, and none
asks an IAM: sign-in is tested with a key pair and tokens of the run's own.
PostgreSQL must be running, and this copy set up (the throwaway databases are
made with the server, user and password of `backend/config/database.local.php`).

## Choosing the suites

Below, **the PHP tests** are `node backend/tools/php.js backend/tests/run.php`
(~25 s), **the frontend tests** `(cd frontend && npm test)` (~15 s), and each
browser suite runs after `node frontend/scripts/ensure-build.mjs`.

| What changed | Run |
|---|---|
| anything in `backend/` | the PHP tests |
| `frontend/src/**`, or anything a page renders | the frontend tests and the PHP tests (the key test), `node frontend/e2e/run.js` (~3 min) and `node frontend/e2e/screens.js`, then check the shots (`academy-ui-check`) |
| sign-in (`backend/src/auth.php`, `access.php`, `users.php`, `people.php`, `visitors.php`, `frontend/src/app/core/auth/`), the routes or middleware | the PHP tests (`backend/tests/api/auth.test.php`, `access.test.php`, `visitors.test.php` and `people.test.php` above all; the visitors' tests switch sign-in off with `test_access(false)`, and `start_app(['app' => ['visitors' => [...]]])` sets their limits), the frontend tests (`auth.service.spec.ts`, `app.routes.spec.ts`, `app.component.spec.ts`) and `node frontend/e2e/run.js` (its sign-in, refused sign-in, sign-out, token, admin-area and visitors parts) and `node frontend/e2e/setup.js` (signing in on a set-up copy) |
| the admin tools or the People page (`backend/src/admin.php`, `backend/api/routes/admin.php`, `routes/people.php`, `frontend/src/app/core/admin.config.ts`, `core/feedback*`, `admin/*`), the scrub of the IAM's deleted accounts | the PHP tests (`admin-tools.test.php`: every route by role, the error log, the audit log, the feedback, the backups; `people-migration.test.php`: 010, the scrub, Check now; `people.test.php`), the frontend tests (`admin/tools.spec.ts`, `core/admin.config.spec.ts`, `feedback-button.component.spec.ts`, `top-bar.component.spec.ts`), `node frontend/e2e/run.js` (People, feedback, the logs, a backup) and `node frontend/e2e/screens.js admin` (the pages, the bar's room) |
| the setup page, `backend/config/` | the PHP tests (`setup.test.php`, `deploy.test.php`) and `node frontend/e2e/setup.js` |
| Apache's files, `build-dist.php`, `backend/router.php`, `backend/src/upkeep.php`, `backend/api/front.php` | the PHP tests (`deploy.test.php`, `upkeep.test.php`, `exam-api.test.php` for the pages); for `.htaccess`, consider a real Apache (`docs/kb/environment.md`) |
| where the site stands, the gate, the migrations' engine (`backend/api/app.php`'s `academy_site_open_paths()`, `db_migrator()` and `db_migration_sets()`, `backend/api/routes/migrations.php`, `frontend/src/app/core/site-status*.ts`, the anotoki library's version) | the PHP tests (`site-state.test.php`, `deploy.test.php`, `upkeep.test.php`, `build.test.php`, `errors.test.php`, `migration.test.php`, `admin-tools.test.php` - what answers while an update waits), the frontend tests (`boot.spec.ts`, `app.component.spec.ts`, `app.routes.spec.ts`, `core/i18n/translations.config.spec.ts`), `node frontend/e2e/run.js` (a migration waiting: the signed-out administrator's way in) and `node frontend/e2e/setup.js` |
| `backend/data/source/**`, `backend/tools/build-*.php` | first `node backend/tools/php.js backend/tools/build-data.php` (or `node backend/tools/php.js backend/tools/build-audio.php`), then the PHP tests and the frontend tests (`answer.spec.ts` checks the whole catalog) |
| `backend/src/conjugate.php`, `backend/src/generate.php`, `backend/data/authored-items*.php`, `frontend/src/app/kanji/answer.ts` | the PHP tests (and the frontend tests for `answer.ts`), then the `academy-japanese-reviewer` agent |
| `backend/migrations/` | the PHP tests (the template takes the new migration — a draft without its last line `-- end of NNN` too (the tests name the drafts, `ACADEMY_MIGRATION_DRAFTS`; only the newest may be one, which `upkeep.test.php` checks, and the template is made afresh when a draft changed); `migration.test.php` shows how to test one on old data), then `node backend/tools/php.js backend/manage.php --check`. After an edit of a migration not committed yet: `node backend/tools/php.js backend/tests/tools/testdb.php template --fresh` first, or the template keeps the old file |
| the app's words: a key used or dropped in `frontend/src/`, a migration with strings, `backend/src/translations.php`, `backend/api/routes/translations.php`, `frontend/src/app/core/i18n/translations.config.ts`, the admin panel | the PHP tests (`backend/tests/unit/translations.test.php` holds every key the frontend asks for to the database; `api/translations.test.php` the library's routes behind this app's checks, in snake_case; `api/strings-through-the-library.test.php` 009 on an installed-shaped database), `node frontend/e2e/run.js` (the chooser by keys, the admin panel, its Slovak pass), `node frontend/e2e/screens.js` (the Slovak pass, key-shaped text, the room); `node backend/tools/php.js backend/translations.php --status` on a set-up copy |
| tests only | the changed file, then its whole suite |

Narrower runs while you iterate:

```bash
node backend/tools/php.js backend/tests/run.php backend/tests/unit/srs.test.php backend/tests/api/kanji-api.test.php
node backend/tools/php.js backend/tests/run.php backend/tests/api/auth.test.php backend/tests/api/setup.test.php
(cd frontend && npm test)                  # all the Angular specs (a few seconds once built)
node frontend/e2e/screens.js kanji-review        # only screens whose name contains this (all six variants)
node frontend/e2e/screens.js room                # only the top bar's measurements
```

Always finish with the full PHP tests, and the full frontend tests when
`frontend/` changed.

## Reading the output

- The PHP tests print one `▶ file` block
  per test file with `✔`/`✖` lines, then `ℹ tests N` / `ℹ pass N` /
  `ℹ fail N`. A failure prints the assertion's message, expected and actual,
  and the test file's line. `npm test` in `frontend/` first prints
  `catalog fixture: 1373 items`, then the build, then Vitest's `Test Files` /
  `Tests` lines. Report the real numbers of both (at the last count, on
  2026-10-18, anotoki-lib 0.6.3, both halves: 273 backend tests, on PHP 8.5; 454
  frontend tests in 43 files; 217 browser checks in `run.js`, 42 in
  `setup.js`, 218 shots of 35 screens in `screens.js` — `docs/kb/testing.md`). The PHP tests must pass on
  PHP 8.5 (the owner's rule of 2026-10-12); the host runs 8.2, so the code uses nothing 8.2 lacks.
- `academy_test_template: updated (3 s)` at the start means `backend/data/`, a
  generator or a migration changed since the last run — expected.
- `node frontend/e2e/run.js` prints each step, then `BROWSER SUITE PASSED` or
  `N FAILURE(S)`; `node frontend/e2e/setup.js` ends `SETUP SUITE PASSED`.
  `node frontend/e2e/screens.js` ends with `no overflow, no key-shaped text, the bar in one row, no page errors` or a `PROBLEMS:`
  list — the Slovak pass's too (a key on the page, English left on a Slovak
  page) and the room's (a piece of the top bar off the screen, overlapping or
  cut short). All exit with 1 on any problem. `ensure-build.mjs` before them
  prints `The app is built, and current.` or builds.
- A console warning fails a browser suite: `[i18n] no string for '…'` is a key
  the page asks for that has no string in the database.
- These are expected and not failures:
  - audio requests answering 206 (range requests);
  - an exam verdict like "32.5% FAIL · F" in the browser log, because the
    script answers at random;
  - 409 from `/api/kanji/learn` or `/review`, which the suite ignores by design;
  - `[auth] a token was refused: …` in a server's log: the sign-in tests send
    bad tokens on purpose;
  - 503 from `/api/auth/config` on the setup suite's "not set up" pages. (A
    503 `update_pending` in the browser suite while it makes a migration wait
    is a failure: the pages are the gate's marked template, so nothing behind the
    library's page asks for data.)
- `No Edge/Chrome found` means the browser wasn't found. Set `BROWSER_PATH` to
  its executable.
- `No PHP 8.2+ … found` comes from `backend/tools/php.js`: set `ACADEMY_PHP` to
  a php.exe 8.2+ with pdo_pgsql, mbstring and intl (and openssl, for the
  sign-in tests).
- `The tests make their databases on the PostgreSQL server of
  backend/config/database.local.php, and there is none` means this copy is not
  set up: start it (`composer start` in `backend/`) and open `/setup.php`
  (`DEV.md`).
- `Could not prepare the test database` means PostgreSQL isn't reachable with
  those settings.
- A failing test is information. Work out whether the code or the expectation
  is wrong, and say which. Never loosen an assertion to get a pass, and never
  quietly skip a failing suite.

What each file covers is in `docs/kb/testing.md`.

## Adding a test

- **PHP unit or API:** `backend/tests/unit/<area>.test.php` or
  `backend/tests/api/<area>.test.php`, starting with
  `require __DIR__ . '/../lib.php';` — before anything else, so the app loads
  with a throwaway database, signing in through the test IAM. Then:
  ```php
  test('what it pins down', function (): void {
      assert_same($expected, $actual, 'message');   // strict ===
  });
  // API: the real server on this file's database; call() goes as TEST_USER (1, no role)
  $GLOBALS['app'] = null;
  before(function (): void { $GLOBALS['app'] = start_app(); });
  // call($GLOBALS['app']['base'], 'POST', '/api/kanji/learn', ['id' => 'k:大']) → ['status', 'body', 'raw', 'headers']
  // make an item due: db_exec('UPDATE srs_progress SET next_review = academy_time(?) WHERE user_id = ? AND item_id = ?',
  //     [now_ms() - 1000, TEST_USER, $id])
  ```
  As somebody else: `call($base, 'GET', '/api/admin/translations', null, test_bearer(test_token(501, ['EDITOR'])))`;
  as nobody: `call($base, 'GET', '/api/kanji/progress', null, no_token())`.
  `test_token($id, $roles, $claims, $typ)` makes any token: an expired one
  (`['exp' => time() - 3600]`), one for another app (`['aud' => 'genshin']`), an
  ID token (`$typ = 'JWT'`). A built site as a host serves it: `test_site()`
  (the upload in a temp folder, a database user of its own, served as Apache
  would); forms and pages with `test_form()` / `test_page()` (headers, a cookie
  jar). The app's functions work in the test process too, on the same database
  (`test_db()` makes it for tests that don't start the server; `test_db_empty()`
  an empty one), and take the user id first. Other helpers: `assert_true`,
  `assert_false`, `assert_match`, `assert_no_match`, `assert_throws`,
  `server_problems($app)` (PHP warnings the server logged).
- **Angular:** a `*.spec.ts` next to the file it tests (Vitest globals:
  `describe`, `it`, `expect`, `vi`). Provide `provideZonelessChangeDetection()`
  in `TestBed`, fake `ApiService` or `fetch`, and `await fixture.whenStable()`
  before reading a component's DOM. The whole catalog is
  `src/testing/catalog.fixture.json` (made before every run). Strings come
  from `provideTestTranslations({ key: 'text' })`
  (the anotoki library's `@anotoki/lib/translations/testing`; add
  `provideKitEnglish()` from `src/app/core/testing/kit-english.ts` for the
  kit's words with no strings), or
  `provideTestTranslations({ … }, { language: 'sk', english: { … } })` for a
  Slovak page; a component that shows words gets a Slovak case too.
- **Browser:** extend `frontend/e2e/run.js` (or `setup.js` for the setup page).
  The helpers in `frontend/e2e/browser.js` are `launch`, `newContext(browser,
  opts)` (every context through it: locale `'en-GB'` unless `opts` says
  otherwise), `watch` (page errors, errors and warnings the app logged,
  failed requests), `keyShaped(page)` (text that looks like a key) and the
  reporter; `startApp()` from `frontend/e2e/helpers.js` (after `isolate()`)
  starts the run's stand-in IAM and gives `base`, `api(url, person, {method,
  body, zone})` (a fetch with that person's token), `backups`,
  `makeDue(ids, agoMs, userId)` and `sql(query, ...params)`. A browser signs
  in the real way (open a page: the stand-in signs in whom `iamState({ user:
  {id, username, roles} })` named, or refuses with `deny: true`) or at once
  (`plant(context, { sub, name, roles }, lang)`); `iamToken()` signs a
  request. People hold `MEMBER` (`{ sub, name, roles: ['MEMBER'] }`; with
  `ADMIN` or `EDITOR` beside it for the admin panel). For visitors (sign-in
  not required): `startApp({ applicationTtl: 1 })`, then
  `app.signInRequired(false)`, and `app.signInRequired(true)` again before
  the suite goes on. Give each test person its own id. Seed state through the API or `sql`,
  wait for what Angular draws after a key or click, find buttons with
  `getByRole`, and call `page.goto('about:blank')` before reopening the same
  URL. A test that switches to Slovak switches back before the suite goes on
  (the choice stays in that browser). A new screen goes into `screens.js`'s
  `SCREENS`, which gives it the Slovak pass too.
- New behaviour gets its test in the same change. If you add a file or change
  what a suite covers, update `docs/kb/testing.md`.
