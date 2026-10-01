---
paths:
  - "backend/src/auth.php"
  - "backend/src/users.php"
  - "backend/src/upkeep.php"
  - "backend/src/owner.php"
  - "backend/src/translations.php"
  - "backend/translations.php"
  - "backend/src/anotoki_iam.php"
  - "backend/api/**"
  - "backend/config/**"
  - "backend/migrations/**"
  - "backend/public/**"
  - "backend/setup.php"
  - "backend/manage.php"
  - "backend/server.php"
  - "backend/tools/build-dist.php"
  - "frontend/src/app/core/auth/**"
---

# Sign-in, settings and hosting (Japanese Academy)

References: `docs/kb/sign-in.md` (auth modes, the IAM, each person's data),
`docs/kb/hosting.md` (Apache, the build, the setup page on a website, updates)
and `docs/kb/architecture.md` (the settings, the setup page, the Slim app).
For building and uploading, use the `academy-deploy` skill.

- The settings are required: `backend/config/{database,auth,app}.local.php`,
  written by the setup page only. Never add a default or a fallback from a
  template: without them the app answers `503 not_set_up`. Never print them
  or copy their values anywhere. The tests' hooks (`ACADEMY_CONFIG_DIR`, a
  keys file, `backups_dir`, `frontend_dir`) count only for `academy_test_…`
  databases (`config_is_test_db()`): keep it that way.
- Sign-in is deployment configuration: `auth.mode` in `auth.local.php`. Never
  let a request choose it, and never loosen `auth_none_allowed()`: mode `none`
  works only under PHP's built-in server, from this computer, for a request
  that came straight to it (a `Host` of 127.0.0.1, localhost or [::1]; no
  `Forwarded`, `X-Forwarded-For` or `X-Real-IP`).
- The person asking comes from `auth_user()` only (the person middleware puts
  it on the request): a verified access token in mode `iam`
  (`backend/src/anotoki_iam.php` checks signature, `typ at+jwt`, issuer,
  audience, expiry; keep the key cache in `backend/storage/`, not the temp
  folder), the owner in mode `none`. Never take a user id from a request's
  body or address.
- Every address with somebody's data is registered with `data_route()`
  (`backend/api/routes/site.php`: set up → upkeep → the person → on a page load
  the day's backup) and passes the user id down. Only `/api/auth/config`,
  `/api/health`, `/api/translations/{code}` (the app's own words, the same for
  everybody: set up and upkeep, no person, no token looked at) and the clips
  need no sign-in. The `/api/owner/…` addresses go through `owner_route()`
  (`backend/api/routes/translations.php`): `data_route()`, then
  `owner_middleware()` (an `Origin` of another host 403 `wrong_origin`, no
  `ADMIN` role 403 `owner_only`, a body over 1 MiB 413) — in mode `none` the
  owner has every role, so that is this computer.
- Every query of a study table has `WHERE user_id = ?`, and a new study table
  gets `user_id` first in its primary key, referencing `users (id)` with
  `ON UPDATE CASCADE`, and goes into `USER_TABLES` (`backend/src/users.php`).
- The three translation tables (`languages`, `translation_keys`,
  `translations`; migration 004, `backend/src/translations.php`) are the
  site's, not a person's: read by everybody, written by the owner, never in
  `USER_TABLES`, and their queries carry no `user_id`. The one user id there
  is `translations.updated_by` (who last reworded a string: `uid($request)`,
  null for a migration or the command line). Keys come only from migrations;
  `backend/translations.php` is a command-line tool and never uploaded
  (`DIST_NEVER`).
- The study rows are never rewritten. Migration `002_users.sql` was the one
  exception, approved by the owner on 2026-09-27 (every existing row became
  user 1's, with a check that no row was lost or changed). A migration that
  changes data needs such a `DO $$ … $$` check; a committed migration is never
  edited. Every new migration ends with the line `-- end of NNN`, its own
  number: without it, it is taken to be half uploaded and never runs.
- `backend/src/anotoki_iam.php` (v1.0.1) and
  `frontend/src/app/core/auth/sdk/anotoki-auth.mjs` + `.d.ts` (v1.1.1) are the
  IAM's SDKs, copied unchanged from `../anotoki-iam/sdk/`: never edit them;
  update by copying a new version and the version notes
  (`backend/src/auth.php`, `auth.service.ts`, `docs/kb/sign-in.md`; a test pins
  them).
- The setup page (`backend/setup.php`): from this computer no token, but the
  nonce cookie (`HttpOnly`, `SameSite=Strict`) echoed by the form and the
  `Origin` checked (so its `Referrer-Policy` stays `same-origin`: under
  `no-referrer` its own form would say `Origin: null`); it stays, never shows
  a password, offers mode `none`. Anywhere else the token first (never shown;
  written aside and renamed by `config_put()`, and no form passes without a
  whole one — never let an empty or unreadable token count as proof), nothing
  of what is set nor the files in `backups/` before it is proven (the
  `test-token` button hands them over), mode `iam` only, the lock written
  before it deletes itself, and it refuses to run with the lock there. It
  writes settings with owner-only permissions (`config_write()`). The Test
  connection buttons change nothing. Its fields and cookies are text only: one
  sent as a list is dropped before anything reads it (else a `(string)` cast
  would turn it into a 500 for anybody).
- A hosted site has no shell, cron or long-running process. Anything that
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
- After a change: `npm test` (auth, deploy, setup, migration tests),
  `npm run test:setup` for the setup page, and `npm run test:browser` when the
  frontend's sign-in changed. For `.htaccess` or the front controller, consider
  a check under a real Apache (`docs/kb/environment.md`).
