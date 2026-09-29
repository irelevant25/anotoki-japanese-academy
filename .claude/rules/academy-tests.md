---
paths:
  - "backend/tests/**"
  - "frontend/e2e/**"
  - "frontend/src/**/*.spec.ts"
---

# Tests (Japanese Academy)

Reference: `docs/kb/testing.md`. For running and reading results,
use the `academy-test` skill.

- Every PHP test file starts with `require __DIR__ . '/../lib.php';`, before
  anything else. It gives the file settings of its own (a folder named by
  `ACADEMY_CONFIG_DIR`: a throwaway database, `academy_test_…`, copied from
  `academy_test_template`, a temp backup folder, sign-in off), and refuses to
  go on if the app was loaded first. The browser suites call `isolate()` from
  `frontend/e2e/helpers.js` before `startApp()`. Never point a test at the real
  database, and never read or write `progress/`, `results/` or `reports/`
  (import tests build fixtures in temp folders).
- The throwaway databases are made on the PostgreSQL server of the developer's
  own `backend/config/database.local.php` (its password is required from that
  file by the test settings, never copied into them): the copy must be set up.
- Sign-in is tested with the test IAM only: a key pair of the run's own and
  tokens signed with the SDK's test helpers (`test_iam_env()`, `test_token()`
  in PHP; `startApp({ auth: 'iam' })`, `iamToken()`, `iamSession()`,
  `emulateIam()` in Node), and the stand-in IAM for the setup page's Test
  connection (`backend/tests/tools/stand-in-iam.php`). Its issuer
  `https://iam.test` exists nowhere. Never let a test reach a real IAM, and
  never start the IAM for a test.
- Without sign-in a test's requests are the owner's, `auth_local_user_id()`:
  use that, not a literal 1, for the owner. Direct calls of the app's
  functions take the user id first.
- A test that needs another PostgreSQL user (a site's own, as a host makes one:
  `test_site()`, `testdb.php site`) names it `academy_test_…_site`, and drops it
  with its database; `testdb.php sweep` removes one a killed run left.
- The layout:
  - `backend/tests/unit/*.test.php`: pure PHP functions (conjugation, SRS,
    catalog, bank, audio builder, data build, source names, the PHP 7.4 syntax
    check).
  - `backend/tests/api/*.test.php`: HTTP against the real server via
    `start_app()`, and the database functions (backups, import, migration) in
    the test process; sign-in (`auth`), a built site with its setup page
    (`deploy`), the setup page on the owner's computer (`setup`).
  - `frontend/src/**/*.spec.ts`: the Angular unit tests (Vitest, jsdom):
    answer checking against the whole catalog, the session engine, the
    interceptor, the services, a few components.
  - `frontend/e2e/`: `playwright-core` driving the installed Edge against the
    production build (`run.js`, `setup.js`, `screens.js`). These are scripts,
    not part of `npm test`.
  - `backend/tests/tools/`: `testdb.php` (the throwaway databases, their
    settings and site users; only `academy_test_…` names), `test-config.php`,
    `catalog.php`, `iam.php` (the test IAM's keys and tokens, for Node),
    `stand-in-iam.php` and `front-controller.php` (what `public/.htaccess`
    does, for PHP's built-in server).
- Never weaken or delete an assertion to get a pass. Find out whether the code
  or the expectation is wrong, and say which.
- Expected values that come from the books (chart cells, per-lesson kanji
  totals) are read from the page images. Cite the page in a comment.
- In browser scripts, set up state through the API or `app.sql()` /
  `app.makeDue()` (as `screens.js` does) rather than with long UI sequences.
  Wait for what Angular draws after a key or a click (`waitForSelector`,
  `waitForFunction`); find buttons by role and name. Navigate via
  `about:blank` to force a reload, and fail on page errors and errors the app
  logged.
- `frontend/e2e/shots/` is generated output and safe to overwrite.
- When suites or counts change, update `docs/kb/testing.md`.
