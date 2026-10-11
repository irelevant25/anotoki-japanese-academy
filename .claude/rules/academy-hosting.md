---
paths:
  - "backend/src/auth.php"
  - "backend/src/users.php"
  - "backend/src/upkeep.php"
  - "backend/src/translations.php"
  - "backend/translations.php"
  - "backend/src/anotoki_iam.php"
  - "backend/api/**"
  - "backend/config/**"
  - "backend/migrations/**"
  - "backend/public/**"
  - "backend/setup.php"
  - "backend/manage.php"
  - "backend/router.php"
  - "backend/tools/build-dist.php"
  - "frontend/src/app/core/auth/**"
---

# Sign-in, settings and hosting (Japanese Academy)

References: `docs/kb/sign-in.md` (the IAM, the roles, each person's data),
`docs/kb/hosting.md` (Apache, the build, the setup page on a website, updates)
and `docs/kb/architecture.md` (the settings, the setup page, the Slim app).
For building and uploading, use the `academy-deploy` skill.

- The settings are required: `backend/config/{database,auth}.local.php`,
  written by the setup page only (an `app.local.php` and the `mode` /
  `local_user_id` keys an earlier version wrote are ignored; `mode` `none` is
  "not set up"). Never add a default or a fallback from a
  template: without them the app answers `503 not_set_up` (the anotoki
  library's `SiteGate`, `backend/api/app.php`; the setup page offered only
  until `backend/storage/installed.lock` is written). Never print them
  or copy their values anywhere. The tests' hooks (`ACADEMY_CONFIG_DIR`, a
  keys file, `backups_dir`, `frontend_dir`) count only for `academy_test_…`
  databases (`config_is_test_db()`): keep it that way.
- Sign-in is the IAM, the one way there is (2026-10-04): the issuer and the
  client id in `auth.local.php` are deployment configuration. Never let a
  request choose them, and never bring back a way without the IAM.
  `auth_from_this_computer()` (a `Host` of 127.0.0.1, localhost or [::1]; no
  `Forwarded`, `X-Forwarded-For` or `X-Real-IP`) decides only what this
  computer is told (the setup page's nonce, a reason, health's database),
  never who anybody is.
- The person asking comes from `auth_user()` only (the person middleware puts
  it on the request): a verified access token in mode `iam`
  (`backend/src/anotoki_iam.php` checks signature, `typ at+jwt`, issuer,
  audience, expiry; keep the key cache in `backend/storage/`, not the temp
  folder). No token or a bad one is a 401, never a fallback to anybody. A
  token with no role is a learner. Never take a user id or a role from a
  request's body, address or headers of the app's own.
- Where the site stands is the anotoki library's (`anotoki/lib`, committed
  in `backend/vendor/`: never edit it; `DEV.md`, *The anotoki library*):
  its `SiteGate` in front of every route answers 503 `not_set_up`, or
  `update_pending` while a whole migration waits, to everything but
  `/api/site-status` and `academy_site_open_paths()` in `backend/api/app.php`
  (how to sign in, the words - the library's `TranslationsRoutes::openPath()` -,
  the health check, the clips, the Migrations page's three routes) - an address
  added there is its exact route, never a prefix (the gate reads the path
  decoded once: a prefix lets `/…/../x`, `%2e%2e`, `%2F` past it), and must
  work on tables a waiting migration may not have made; and nothing of the
  site's sign-in may stand in front of `/api/site-status`.
  The Migrations page's routes are the library's (`MigrationsRoutes::admin()`)
  behind `migrations_admin_middleware()`: `ADMIN` from the token, no table read.
- Every address with somebody's data is registered with `data_route()`
  (`backend/api/routes/site.php`: upkeep → the person → on a page load
  the day's backup, behind the SiteGate) - a study address (kanji, exam, report) with
  `study_route()`, the same with the learner in the person's place (a person,
  or while the IAM says sign-in is not required a visitor or nobody:
  `docs/kb/sign-in.md`, *Visitors*) - and passes the user id down. Only
  `/api/site-status`, `/api/auth/config`,
  `/api/health`, `/api/translations/{code}` (the app's own words, the same for
  everybody: upkeep, no person, no token looked at) and the clips
  need no sign-in. The `/api/admin/…` addresses are two Slim route groups
  (`backend/api/routes/translations.php`) with the checks on the groups:
  `data_route()` and `staff_middleware()` on the outer one (`EDITOR` or
  `ADMIN`, else 403 `staff_only`; a body over 1 MiB 413), `admin_middleware()`
  on the inner one (`ADMIN`, else 403 `admin_only`: adding, changing,
  deleting languages, and what else only an administrator may do). A new
  admin route goes into the group whose check it needs, never with a check
  of its own.
- Every query of a study table has `WHERE user_id = ?`, and a new study table
  gets `user_id` first in its primary key, referencing `users (id)` with
  `ON UPDATE CASCADE`, and goes into `USER_TABLES` (`backend/src/users.php`).
- The three translation tables (`languages`, `translation_keys`,
  `translations`; migration 004, `backend/src/translations.php`, served and
  written by the anotoki library's `Translations` behind this app's checks,
  in snake_case) are the site's, not a person's: read by everybody, written in the admin panel, never in
  `USER_TABLES`, and their queries carry no `user_id`. The one user id there
  is `translations.updated_by` (who last reworded a string: `uid($request)`,
  null for a migration or the command line). Keys come only from migrations
  (the library's own, under `anotoki.`, from its set `anotoki_translations`,
  which runs after this app's);
  `backend/translations.php` is a command-line tool and never uploaded
  (`DIST_NEVER`).
- The study rows are never rewritten. Migration `002_users.sql` was the one
  exception, approved by the owner on 2026-09-27 (every existing row became
  user 1's, with a check that no row was lost or changed). A migration that
  changes data needs such a `DO $$ … $$` check; a committed migration is never
  edited. Every new migration ends with the line `-- end of NNN`, its own
  number: without it, it is taken to be half uploaded and never runs. A
  migration being written stays without it (a draft, saying so at its top),
  so the owner's `composer start` never applies it half done; only the tests
  apply a draft, by name (`ACADEMY_MIGRATION_DRAFTS`, `academy_test_…` only).
  Never upload a build whose newest migration is a draft: it waits there too.
- `backend/src/anotoki_iam.php` (v1.1.0) and
  `frontend/src/app/core/auth/sdk/anotoki-auth.mjs` + `.d.ts` (v1.2.0) are the
  IAM's SDKs, copied unchanged from `../anotoki-iam/sdk/`: never edit them;
  update by copying a new version and the version notes
  (`backend/src/auth.php`, `auth.service.ts`, `docs/kb/sign-in.md`; a test pins
  them).
- The setup page (`backend/setup.php`): from this computer no token, but the
  nonce cookie (`HttpOnly`, `SameSite=Strict`) echoed by the form and the
  `Origin` checked (so its `Referrer-Policy` stays `same-origin`: under
  `no-referrer` its own form would say `Origin: null`); it stays, never shows
  a password; it asks for the database and the IAM, nothing else (defaults
  `anotoki_japanese`, 5432; **Test connection** in the anotoki family's words;
  **Save**), and stays parseable by PHP 7.4. Anywhere else the token first (never shown;
  written aside and renamed by `config_put()`, and no form passes without a
  whole one — never let an empty or unreadable token count as proof), nothing
  of what is set nor the files in `backend/storage/backups/` before it is proven (the
  `test-token` button hands them over), mode `iam` only, the lock written
  before it deletes itself, and it refuses to run with the lock there. It
  writes settings with owner-only permissions (`config_write()`). The Test
  connection buttons change nothing. Its fields and cookies are text only: one
  sent as a list is dropped before anything reads it (else a `(string)` cast
  would turn it into a 500 for anybody).
- A hosted site has no shell, cron or long-running process, and PHP's
  built-in server on a computer (`backend/router.php`) does nothing at start
  either. Anything that
  must happen on the server happens in a request (`backend/src/upkeep.php`: one
  cheap stamp check per request, the work under an advisory lock) or in the
  setup page. Nothing slow may join the answer path beyond that once-per-upload
  work (documented in `docs/kb/decisions.md`). Take the stamp before the work
  reads anything, and store that one with the result.
- The interceptor sends the token to this site's `/api` and `/report` only, and
  a report opened from memory gets its no-script policy before anything of its
  own (`lockDown()`): keep both.
- `backend/public/.htaccess` (the upload's `public/.htaccess`): keep
  `CGIPassAuth` (inside the `mod_version` guard) and the `SetEnvIf` fallback,
  or the token never reaches PHP under CGI/FastCGI. Don't add `DirectoryIndex`
  or `Options`: hosts that refuse them in `.htaccess` answer 500 for the whole
  site. `backend/tests/tools/front-controller.php` mirrors its rewrites for
  the tests: change both together.
- `backend/tools/build-dist.php` puts in only what a site runs; `DIST_NEVER`
  lists what must never be uploaded. A new runtime folder or data file must be
  added there on purpose. `backend/vendor/` is committed and uploaded (no
  shell on the host).
- All of this PHP stays parseable by PHP 7.4
  (`backend/tests/unit/php74-syntax.test.php`; `backend/vendor/` aside).
- After a change: the PHP tests, `node backend/tools/php.js
  backend/tests/run.php` (auth, deploy, setup, migration tests),
  `node frontend/e2e/setup.js` for the setup page, and `node frontend/e2e/run.js` when the
  frontend's sign-in changed. For `.htaccess` or the front controller, consider
  a check under a real Apache (`docs/kb/environment.md`).
