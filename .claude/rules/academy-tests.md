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
- `academy_test_template` only takes migrations it has not applied. After an
  edit of a migration that is not committed yet (a string of 004 reworded,
  say), run `php backend/tests/tools/testdb.php template --fresh`: it drops the
  template and builds it again from every migration and the content (not while
  another test run is going on). Nothing else may drop the template.
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
    check, the translation catalogue and key scan).
  - `backend/tests/api/*.test.php`: HTTP against the real server via
    `start_app()`, and the database functions (backups, import, migration) in
    the test process; sign-in (`auth`), a built site with its setup page
    (`deploy`), the setup page on the owner's computer (`setup`), the
    languages and the words (`translations`), failures and their codes
    (`errors`).
  - `frontend/src/**/*.spec.ts`: the Angular unit tests (Vitest, jsdom):
    answer checking against the whole catalog, the session engine, the
    interceptor, the services, the translation service and pipes, the owner
    pages, the components. A spec gets its strings from
    `provideTestTranslations()` (`core/testing/test-translations.ts`: the real
    service with the spec's strings in memory, no HTTP).
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
  `about:blank` to force a reload, and fail on page errors, errors the app
  logged and console warnings (`watch()`: a key with no string warns).
- Every browser context comes from `newContext()` (`frontend/e2e/browser.js`):
  locale `'en-GB'` unless a test asks for another, so the suites match English
  words on a computer whose system language is Slovak. Signed-in sessions say
  `en` in their token. A test that switches to Slovak switches back before the
  suite goes on (the choice is kept in that browser).
- The Slovak pass (`screens.js`, variants `sk-phone` and `sk-phone-dark`, 390 px,
  locale `sk-SK`) checks every screen for `<html lang="sk">`, no text that is a
  key (the owner pages list keys, and are let off), no English string of the
  bundle whose Slovak differs outside `[lang=en]` / `[lang=ja]`, and no
  overflow. The room (`npm run screens -- room`) measures the top bar's pieces
  at 360–560 px in both languages; the kanji tab strip is checked on every
  screen. Keep these checks when a screen is added.
- The keyboard check (`run.js`): the chooser worked by keys on a review card and
  on a paper's last question must change the language and nothing else — the
  card unanswered, the paper still open, no attempt stored.
- A finished kanji session stays on screen with a read-only answer box until
  its saves land: a loop that answers cards stops at a read-only box.
- `frontend/e2e/shots/` is generated output and safe to overwrite.
- When suites or counts change, update `docs/kb/testing.md`.
