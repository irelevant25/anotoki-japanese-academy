---
name: academy-test
description: Run and read the Japanese Academy tests (PHP unit and API tests, sign-in with the tests' own tokens, the built site and its setup page, the Angular unit tests, the browser suites against the production build, the setup page in a browser, screenshots) and choose the suites a change needs. Use after any code or data change in the app, before saying work is done, when a test fails, or when adding tests.
---

# Testing Japanese Academy

Run everything from the repository root. Every suite uses throwaway databases
(`academy_test_…`, copied from `academy_test_template`), settings of its own
and temp folders. None touches the owner's database or `backups/`, none reads
`progress/`, `results/` or `reports/`, none needs the owner's server, and none
asks an IAM: sign-in is tested with a key pair and tokens of the run's own.
PostgreSQL must be running, and this copy set up (the throwaway databases are
made with the server, user and password of `backend/config/database.local.php`).

## Choosing the suites

| What changed | Run |
|---|---|
| anything | `npm test` (~40 s: `test:backend` + `test:frontend`) |
| `frontend/src/**`, or anything a page renders | also `npm run test:browser` (~2 min) and `npm run screens`, then check the shots (`academy-ui-check`) |
| sign-in (`backend/src/auth.php`, `users.php`, `frontend/src/app/core/auth/`), the routes or middleware | `npm test` (`backend/tests/api/auth.test.php`, `auth.interceptor.spec.ts` above all) and `npm run test:browser` (its sign-in part) |
| the setup page, `backend/config/`, `backend/src/owner.php` | `npm test` (`setup.test.php`, `deploy.test.php`) and `npm run test:setup` |
| Apache's files, `build-dist.php`, `backend/src/upkeep.php`, `backend/api/front.php` | `npm test` (`deploy.test.php`, `upkeep.test.php`, `exam-api.test.php` for the pages); for `.htaccess`, consider a real Apache (`docs/kb/environment.md`) |
| `data/source/**`, `backend/tools/build-*.php` | first `npm run build:data` (or `npm run build:audio`), then `npm test` |
| `backend/src/conjugate.php`, `backend/src/generate.php`, `data/authored-items*.php`, `frontend/src/app/kanji/answer.ts` | `npm test`, then the `academy-japanese-reviewer` agent |
| `backend/migrations/` | `npm test` (the template takes the new migration — none without its last line, `-- end of NNN`, which `upkeep.test.php` checks; `migration.test.php` shows how to test one on old data), then `php backend/manage.php --check` |
| tests only | the changed file, then `npm test` |

Narrower runs while you iterate (the npm scripts find a PHP 8 themselves; by
hand see `docs/kb/environment.md`):

```bash
npm run test:backend -- backend/tests/unit/srs.test.php backend/tests/api/kanji-api.test.php
npm run test:backend -- backend/tests/api/auth.test.php backend/tests/api/setup.test.php
npm run test:frontend                  # all the Angular specs (a few seconds once built)
npm run screens -- kanji-review        # only screens whose name contains this
```

Always finish with the full `npm test`.

## Reading the output

- `npm run test:backend` runs `php backend/tests/run.php`: one `▶ file` block
  per test file with `✔`/`✖` lines, then `ℹ tests N` / `ℹ pass N` /
  `ℹ fail N`. A failure prints the assertion's message, expected and actual,
  and the test file's line. `npm run test:frontend` first prints
  `catalog fixture: 1373 items`, then the build, then Vitest's `Test Files` /
  `Tests` lines. Report the real numbers of both.
- `academy_test_template: updated (3 s)` at the start means `data/`, a
  generator or a migration changed since the last run — expected.
- `npm run test:browser` prints each step, then `BROWSER SUITE PASSED` or
  `N FAILURE(S)`; `npm run test:setup` ends `SETUP SUITE PASSED`.
  `npm run screens` ends with `no overflow, no page errors` or a `PROBLEMS:`
  list. All exit with 1 on any problem. They start with
  `The app is built, and current.` or a build.
- These are expected and not failures:
  - audio requests answering 206 (range requests);
  - an exam verdict like "32.5% FAIL · F" in the browser log, because the
    script answers at random;
  - 409 from `/api/kanji/learn` or `/review`, which the suite ignores by design;
  - `[auth] a token was refused: …` in a server's log: the sign-in tests send
    bad tokens on purpose;
  - 503 from `/api/auth/config` on the setup suite's "not set up" pages.
- `No Edge/Chrome found` means the browser wasn't found. Set `BROWSER_PATH` to
  its executable.
- `No PHP 8.1+ … found` comes from `backend/tools/php.js`: set `ACADEMY_PHP` to
  a php.exe 8.1+ with pdo_pgsql, mbstring and intl (and openssl, for the
  sign-in tests).
- `The tests make their databases on the PostgreSQL server of
  backend/config/database.local.php, and there is none` means this copy is not
  set up: start it and open `/setup.php` (`DEVELOPING.md`).
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
  with a throwaway database and sign-in off. Then:
  ```php
  test('what it pins down', function (): void {
      assert_same($expected, $actual, 'message');   // strict ===
  });
  // API: the real server on this file's database, without sign-in: every request is the owner
  $GLOBALS['app'] = null;
  before(function (): void { $GLOBALS['app'] = start_app(); });
  // call($GLOBALS['app']['base'], 'POST', '/api/kanji/learn', ['id' => 'k:大']) → ['status', 'body', 'raw', 'headers']
  // make an item due: db_exec('UPDATE srs_progress SET next_review = academy_time(?) WHERE user_id = ? AND item_id = ?',
  //     [now_ms() - 1000, auth_local_user_id(), $id])
  ```
  With sign-in: `start_app(test_iam_env())`, and
  `call($base, 'GET', '/api/kanji/progress', null, test_bearer(test_token(501, ['MEMBER'])))`.
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
  `src/testing/catalog.fixture.json` (made before every run).
- **Browser:** extend `frontend/e2e/run.js` (or `setup.js` for the setup page).
  The helpers in `frontend/e2e/browser.js` are `launch`, `watch`,
  `emulateIam(context, person)` (the IAM's sign-in, token and sign-out,
  answered in the browser) and the reporter; `startApp({ auth })` from
  `frontend/e2e/helpers.js` (after `isolate()`) gives `base`, `owner`,
  `makeDue(ids, agoMs, userId)` and `sql(query, ...params)`, and may run twice
  (without and with sign-in, one database). `iamToken()` and `iamSession()`
  sign requests and browser contexts in. Seed state through the API or `sql`,
  wait for what Angular draws after a key or click, find buttons with
  `getByRole`, and call `page.goto('about:blank')` before reopening the same
  URL.
- New behaviour gets its test in the same change. If you add a file or change
  what a suite covers, update `docs/kb/testing.md`.
