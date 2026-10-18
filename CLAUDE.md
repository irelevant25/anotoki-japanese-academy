# Japanese Academy — project instructions

This repository is Japanese Academy, the owner's study app for a two-part
beginner Japanese course: a WaniKani-style kanji SRS (`/kanji`) and an
11,523-question multiple-choice exam (`/exam`), with every word spoken in two
voices. The backend is PHP 8.2+ with Slim 4 and PostgreSQL for all data
(`backend/`); the frontend is an Angular 21 app — standalone, zoneless,
signals (`frontend/`), built once and served by the backend. The database
migrations - applying them, and what the site does while one waits - are the
**anotoki library**'s (`anotoki-lib`, every anotoki site's: the Composer
package `anotoki/lib`, the npm package `@anotoki/lib`; `../anotoki-lib`,
`DEV.md`, *The anotoki library*), and so are the family's UI kit the pages
are drawn with (buttons, dialogs, fields, menus; since 2026-10-11 the cards,
alerts, badges, page headers and choices of every page too), its styles - its
base, utilities and tables with them - and the top bar (since anotoki-lib
0.2.0), in this app's own palette, the app's words -
serving them, the admin panel's Translations and Languages pages, the
command line's work - on this app's tables and behind its checks (since
anotoki-lib 0.3.0), and, since anotoki-lib 0.4.0 (the app is on 0.6.2, both halves), the
site's half of signing in, the people (each person's row, the scrub of the
accounts the IAM deleted, the People page) and the admin tools Japanese takes
(the error log - the pages' own errors too, since 0.5.0 -, the audit log, the
feedback with the visitors' form, the backups of the whole database; no file
explorer), since 0.5.0 where a request comes from (`Support\ClientAddress`:
Cloudflare's header believed from Cloudflare alone - since PHP 0.5.2, given
the owner's zone's origin secret, only on a request that carries it), and
since 0.6 the family's legal pages - Terms, Privacy and Contact, with this
app's facts - and the kit's newer pieces (choice chips, labelled groups,
disclosures, link tabs). It runs two ways:

- **on the owner's computer**, as every anotoki site does: `composer start` in
  `backend/` (`php -S localhost:8200 router.php`, PHP's built-in web server)
  beside `npm start` in `frontend/` (`ng serve` on 4400);
- **as a website** (https://japanese.anotoki.eu), on the owner's FTP-only shared
  hosting under Apache.

Both sign people in through the anotoki IAM, the one way there is since
2026-10-04 (the owner's decision for the whole anotoki family; the sign-in mode
`none` of before is gone): a computer against the development IAM
(http://localhost:4300), the website against https://iam.anotoki.eu. Every
account may study, each person with their own progress, settings and exam
history; the IAM roles `EDITOR` and `ADMIN` open the admin panel (`/admin`).
Every page sends a signed-out visitor straight to the IAM and back
(the library's `personOrVisitorGuard`, `docs/kb/sign-in.md`) - unless the IAM says sign-in is not
required here: then nobody signed in studies as a visitor (the state
`visiting`; never the admin panel), *Visitors in the browser* there. A
sign-in that came back without one is the library's screen (Try again,
Back). The top bar is the anotoki family's
one bar, the library's (`<anotoki-top-bar>`, worded and wired in
`frontend/src/app/top-bar/`; `docs/kb/architecture.md`, *The top bar*): the
brand, Kanji and Exam, the language, the light/dark/system switch and the
person's menu; the version, "What's new" and "Send feedback" are at the foot
of the page, and under them the family's Terms · Privacy · Contact. Those
three pages (`/terms`, `/privacy`, `/contact`: the library's, with this app's
facts, `frontend/src/app/legal/`) are anybody's - signed in or not, a visitor
or not: no guard, no trip to the IAM (`docs/kb/architecture.md`, *The legal
pages*).

It replaced the earlier N4 Coach app on 2026-09-23, because the owner found
N4 Coach's sentences and learning path wrong. N4 Coach lives on only in the git
history; don't bring its code or content back. On 2026-09-24 its backend moved
from Node/Express and JSON files to PHP and PostgreSQL; on 2026-09-29 the
repository became `backend/` (Slim) + `frontend/` (Angular), in the layout of
the other anotoki sites (the owner's conventions); on 2026-10-04 its top
folder became theirs too: `.claude/`, `.gitignore`, the three guides,
`backend/`, `frontend/`, `docs/` and nothing else (the study material moved
to `backend/data/`, the backups to `backend/storage/backups/`; no root
package, no launcher). Both earlier versions are in the git history.

**Never name the course the data comes from** — not in code, data, docs, file
names, commit messages or UI text. The repository is on GitHub, and the owner
doesn't want it to show the source. Say "the course", "Part 1 / Part 2",
"textbook 1". `backend/tests/unit/source-names.test.php` fails on any mention.
(The real word 元気 in the vocabulary is fine.)

**Knowledge base: `docs/kb/README.md`.** Before changing an area, read its kb
page. If a change makes a statement in the kb, the README, `DEV.md` or a
count wrong, fix it in the same piece of work.

## What is where

- `backend/` — `router.php` (PHP's built-in server's router on a computer:
  `composer start`; nothing happens at start, the first request does the
  start-time work), `setup.php` (the setup page, `/setup.php`),
  `manage.php` (command-line helpers: `--check`, `--sync`, `--backup`,
  `--restore`), `translations.php` (the app's own
  strings from the command line: `--status`, `--export`, `--import` - the
  library's `TranslationsCommand`, a backup file read as a file of strings;
  never uploaded), `api/` (the HTTP side: `app.php` the Slim app, with the anotoki
  library's SiteGate in front of every route and its `/api/site-status`,
  `routes/` site,
  exam, kanji, me (your own data as a file), visitor (the move at sign-in),
  translations (the library's `TranslationsRoutes`: the words' address, and
  the admin panel's strings and languages behind this app's checks), people,
  admin (the error log, the audit log, the feedback and its form, the
  backups) and migrations (the admin panel: the library's routes),
  `middleware/` — `person.php` takes who the library's `Identify` found
  (a person, or on the study addresses a visitor or nobody) and their time
  zone, `staff.php` guards the
  admin panel's addresses (`EDITOR`, `ADMIN`: the library's `RequireRole`), `upkeep.php` the content's
  rebuild —, `front.php` which sends each request to the API, the
  setup page or the built app), `src/` (the app: `bootstrap.php`, `db.php`
  (with `db_migrator()`, the library's migrations engine set up for this site:
  four sets - the library's `anotoki_admin`, its own files, the library's
  `anotoki_translations` and `anotoki_people`),
  `auth.php` (the library's auth module set up for this site), `access.php`
  (whether the IAM requires sign-in here), `admin.php` (the library's admin
  tools set up for this site), `users.php`,
  `visitors.php` (studying without signing in: made, found, capped, swept,
  moved into an account), `client_address.php` (the address the visitors'
  limits count: the library's `ClientAddress` rule over this site's trusted
  proxies, Cloudflare's ranges by default), `after.php` (work after the answer: the sweep),
  `upkeep.php`, the SRS in `src/srs/`,
  the exam, content, backups, `me.php` — a person's own data file —,
  `people.php` (the library's people module set up for this site: the row
  from the token, what its scrub blanks here, the People page's columns and
  delete - the one a restore does again), `translations.php` — the library's `Translations` for this
  app: its released languages, the copy of a language's strings before it
  goes, a save holding its person's row as an answer does, `users_hold()`), `config/` (`config.php`, with the
  committed default of the trusted proxies, `CLIENT_ADDRESS_DEFAULTS`; this copy's settings in `*.local.php`),
  `migrations/`, `vendor/` (Composer's packages - Slim, the anotoki library -
  committed: a website has no shell), `public/` (Apache's `index.php` and `.htaccess`, for the upload),
  `tests/`, `tools/` (data and audio builders, `build-dist.php` for the
  upload, `php.js` which finds a PHP 8.2+ for the command line and the browser
  suites, `pdf/` — `pages.js` with its own `package.json` for `sharp`),
  `data/` (the study content's sources and the clips, below), `storage/`
  (gitignored contents: `backups/`, `logs/` - the library's error log -, the
  IAM's keys, cached, the library's key; a website's setup lock).
  `backend/README.md` maps it.
- `frontend/` — the Angular app: `src/app/` (`home/`, `kanji/`, `exam/`,
  `top-bar/` (the anotoki family's bar - the library's - worded and wired:
  the sections, the reviews due, the person, Sign in and Sign out; the
  admin panel's eight pages, Feedback with its count of new messages), `core/` —
  API, sign-in (`auth/`: the library's `@anotoki/lib/auth` wired in
  `auth.config.ts`, seen through this app's `AuthService`), the admin tools
  and the People page (`admin.config.ts`, the library's), the feedback form
  (`feedback.config.ts`, `feedback/`: the library's form behind Send
  feedback at the foot), the pages' own errors (`error-report.config.ts`: the
  library's reporter, every error to the error log, scrubbed), the changelog (the foot), `i18n/` (the app's words:
  `translations.config.ts` - the anotoki library's translation service,
  pipes and admin pages wired to this app -, `time-wording.ts`, failures
  worded from their codes, the title strategy),
  `kit.config.ts` (the anotoki library's kit wired to this app: its words
  are the library's keys in this app's database (`forKit()`), the theme -
  light, dark or the system's, the anotoki account's while signed in - and
  the languages (`forShell()`)), `saves-in-flight.service.ts` (the
  saves a sign-out waits for), `time-zone.ts`, `site-status.config.ts` (the
  anotoki library's migrations module wired to this app: the gate around the
  pages, its page while the site is not ready, the Migrations page),
  `legal.config.ts` (the anotoki library's legal pages wired to this app: the
  page's language and the database's words), `notice/` (the app's notice:
  something to tell with one button, OK, drawn with the kit's dialog where the
  browser's `alert()` stood) —, `legal/` (the legal pages' frame and the
  facts it gives them, `legal-facts.ts`, out of the first load), `admin/` — the admin panel, in English:
  Translations (EDITOR, ADMIN), Languages, People, Feedback, Errors, Audit
  log, Backups and Migrations (ADMIN; every one the library's page, each in
  the panel's frame) —, `standin/`
  — the Sign in card and the problem page; `home/your-data/` is a
  person's own data file, down and back),
  `src/styles/` (tokens - the palette given to the library's -, base - the
  app's own after the family's base, utilities and tables -, items),
  `public/` (favicon, the family's mark, `changelog.json`; the
  library's `theme-boot.js` is copied in by `angular.json`), `e2e/`
  (the browser suites), `scripts/`
  (`ensure-build.mjs`, which builds only when the sources changed), `.nvmrc`.
  `frontend/README.md` maps it.
- `backend/config/*.local.php` are gitignored and required: `database` (with
  the password) and `auth` (the IAM's issuer and client id). The setup page
  writes them; there are no defaults to fall back on. Every hand-written one
  - those two, the optional `app.local.php` and `cloudflare.local.php`, the
  setup page's token - is read cleanly or not at all
  (`config_require_cleanly()`, `backend/config/config.php`, the IAM's rule):
  what it prints as PHP requires it - a byte-order mark or a line before its
  `<?php`, no `<?php` line at all, text after a closing tag - is caught and
  never sent, and the file is passed over, as is one PHP cannot open or run;
  said in PHP's error log at most once a day, by its fault and byte count,
  never its text. A required one so passed over leaves the copy not set up
  (the library's page says so, the setup page names it), `app.local.php` its
  defaults, `cloudflare.local.php` a secret no request carries (below). What an earlier version
  wrote beside them (`auth`'s `mode` and `local_user_id`, an `app.local.php`
  with a time zone) is ignored. Never print them, copy their values anywhere
  or commit them. On a computer that ran an older version,
  `src/config.local.php` (old settings) may still sit at the top: nothing
  reads it any more; the same rules apply to it.
- `books/` is gitignored and stays on this computer. It holds the five scanned
  course books (`textbook-1.pdf`, `workbook-1.pdf`, `textbook-2.pdf`,
  `workbook-2.pdf`, `answer-key.pdf`), the owner's notes, and old audio the app
  no longer uses. The PDFs have no text layer, so read them only through the
  `academy-pdf` skill.
- `backend/data/audio/` + `backend/data/audio.json`: the spoken vocabulary,
  made with Google Cloud Text-to-Speech by `backend/tools/build-audio.php`, and
  kept in git. Leave the clips as they are. Making new clips needs
  `GOOGLE_TTS_API_KEY` in `backend/.env` (gitignored). Never print the key, put
  it in a file that git tracks, or paste it into a message.
- Signing in is the anotoki library's since anotoki-lib 0.4.0: its
  `Anotoki\Lib\Auth` checks the IAM's tokens here (`backend/src/auth.php`),
  its `@anotoki/lib/auth` signs the browser in (`frontend/src/app/core/auth/`).
  The IAM's SDKs are no longer copied into this repository
  (`backend/src/anotoki_iam.php` and `core/auth/sdk/` went with the move;
  the library keeps the SDK's storage keys, so nobody was signed out by it).
  Never edit the library's vendored copy either: a change goes to the
  library and comes back as a release (`DEV.md`, *The anotoki library*).
- `.claude/` holds the project's skills, agents and path-scoped rules.

## Commands (from the repository's top folder, unless they say otherwise)

There is no package at the top and no launcher. `php` in Git Bash is 7.4 on
the owner's computer, which the app refuses: `node backend/tools/php.js
<script> …` finds a PHP 8.2+ (`docs/kb/environment.md`); `composer start`
runs the `php` first on PATH.

```
cd backend && composer start                 php -S localhost:8200 router.php: the API, the setup page and the last
                                             build (academy-run skill; the owner's server: start or stop it only when
                                             they ask - no change needs a restart)
cd frontend && npm start                     ng serve on localhost:4400, proxying the backend's addresses to :8200
node backend/tools/php.js backend/tests/run.php   the PHP unit + API tests (269): after every change - on PHP 8.2
                                             too (ACADEMY_PHP, and PHPRC for its php.ini: the library's floor)
cd frontend && npm test                      the Angular unit tests (451 in 44 files): after every frontend change
node frontend/scripts/ensure-build.mjs       the Angular build, when its sources changed (npm ci first when needed)
node frontend/scripts/ensure-build.mjs && node frontend/e2e/run.js
                                             Edge end to end (215 checks), signed in through the library's stand-in
                                             IAM: a deep link signed out, a refused sign-in's screen, the legal pages
                                             signed out (no trip to the IAM), lessons →
                                             reviews → practice → exam, the bar's keys and menus, Your data,
                                             sign-out, the admin panel by role, People, feedback from the foot to the
                                             Feedback page and its badge, a page's own error reported to the error
                                             log and listed there, the audit log, a backup made,
                                             a migration waiting (the library's page for a visitor, a learner and an
                                             editor, no page made behind it; an open exam paper kept and back after
                                             the library's reload; a signed-out ADMIN signs in from it), failing and applied, two time
                                             zones, a Slovak pass; then visitors (sign-in not required): study,
                                             an exam, Sign in moving it all, sign-in switched on with a key held;
                                             the kit's question answered where the app asks, and no browser box ever
node frontend/scripts/ensure-build.mjs && node frontend/e2e/setup.js
                                             the setup page in Edge (42 checks): this computer's way and a website's
node frontend/scripts/ensure-build.mjs && node frontend/e2e/screens.js [name]
                                             screenshots → frontend/e2e/shots/: 35 screens light/dark at 1280 px,
                                             light/dark at 390 px and Slovak at 390 px light/dark (the legal pages
                                             in Slovak at 1280 px too: 218 shots), then the top bar
                                             measured at 360-1280 px (the admin panel's to 1530) and its menus
                                             (room alone: room) - look at the shots
node backend/tools/php.js backend/tools/build-data.php    backend/data/source/*.tsv → backend/data/*.json
node backend/tools/php.js backend/tools/build-audio.php   missing clips → backend/data/audio/ (Google TTS; --dry-run needs no key)
node backend/tools/php.js backend/tools/build-dist.php    the upload for the website → dist/japanese-academy/ (academy-deploy)
node backend/tools/php.js backend/manage.php --check      also --sync, --backup, --restore=F; --check says when a
                                             migration is a draft ("Waiting: …") and offers only what comes before it
node backend/tools/php.js backend/translations.php --status   the keys the frontend uses against the database's (exit 1: a
                                             page would show a key); --export CODE [FILE], --import CODE FILE
npm --prefix backend/tools/pdf ci            once: the PDF page tool's package (sharp)
node backend/tools/pdf/pages.js <book> <pages>   page images of the scanned PDFs (academy-pdf skill)
```

## The owner's data: hard rules

- **The database named in the owner's settings (`anotoki_japanese_academy` on
  their computer) is the owner's study data**: kanji progress, the answer log
  (`srs_log`), every exam attempt and its report — each row with its person's
  `user_id`; on the owner's computer that is the owner (user 1, their user id
  at the IAM). Never drop, truncate, reset or "clean
  up" it, and never run an experiment, a test or a migration draft against it.
  Change it by hand only when the owner asks, after
  `node backend/tools/php.js backend/manage.php --backup`. On a computer
  without the owner's data it does not exist, and nothing may create it. A
  website's database is its people's data: the same rules.
- **The study rows are never rewritten.** The one exception: migration
  `002_users.sql` gave every existing row the owner's user id, which the owner
  approved on 2026-09-27; its check proves no row was lost or changed. (A
  visitor's rows - somebody who studied without signing in, a negative user
  id - become the person's when they sign in, `visitors_move()`; a person's
  own rows stay as they are.)
- **Anything but the owner's own `composer start` uses a throwaway
  database** (`academy_test_…`). The tests make theirs through
  `backend/tests/lib.php` and `frontend/e2e/helpers.js`, with settings of their
  own (`ACADEMY_CONFIG_DIR`, honoured for `academy_test_…` databases only); a
  manual server uses the throwaway setup in the academy-run skill.
  `backend/tests/tools/testdb.php` only touches `academy_test_…` names.
- `backend/storage/backups/` (gitignored) holds the daily copies of all the
  study data (until 2026-10-04 they were in `backups/` at the top) and,
  since anotoki-lib 0.4.0, the library's backups of the whole database
  (`*.anotoki-backup`, each with its `.json` beside it): the library rotates
  them by number - the last 14 daily ones, 5 before an update, 5 before a
  restore -, keeps the ADMIN's own until the owner deletes them on the admin
  panel's Backups page, and deletes none for its age (the owner's decision of
  2026-10-11, "kept until I delete them", as the IAM and every anotoki site
  read it; `docs/kb/decisions.md`). Since anotoki-lib 0.5.0 each carries this
  installation's seal and only a sealed one is restored on the site: a plain
  one made before 0.5.0 has none and is restored offline alone
  (`docs/kb/hosting.md`); its files are the site's own user's alone (0600),
  and so are the app's own JSON copies (`academy-*.json`, written 0600 in a
  folder made 0700: `backup_folder()`, `file_put_atomic()`).
  Never delete them, nor the error log's files in
  `backend/storage/logs/`: the owner does; when they have to move, copy
  them, compare each file's hash,
  and only then remove the originals. `progress/`, `results/` and `reports/`,
  the files of the app before the database, were deleted on 2026-10-04 by the
  owner's decision: they were never imported into the database, and git keeps
  them. Never bring them back, and never point a test at the git history.
- Commit only when the owner asks, and never commit test data or anything in
  `*.local.php`.
- The books in `books/` are source material. Read them; never modify them.

## Invariants

Tests enforce most of these. Never weaken a test to make it pass.

- Exam honesty: `POST /api/exam` never sends answers (`answerIndex`, `correct`,
  `distractors`, `explain`). `POST /api/submit` rebuilds the paper from the
  echoed `spec`, never from the number of questions. Clip names are random, so
  a listening question's audio gives nothing away.
- Every exam question has exactly one right option. Every distractor must be
  wrong for the question as asked, not merely less natural.
- Papers are seeded and reproducible: the RNG (mulberry32 over the seed's
  UTF-16 units), rounding and string handling in `backend/src/util.php`
  reproduce the first (JavaScript) version exactly, so a seed gives the paper
  it always gave.
- SRS: the schedule is WaniKani's (`backend/src/srs/srs.php`). Only a review of
  a due item moves `stage`/`nextReview`; practice never does. Lessons and
  practice are unlimited, with no daily caps or time locks. This is the
  owner's explicit requirement.
- SRS ids are `k:<kanji>` / `v:<word>`. Renaming one orphans everybody's
  progress for that item (see `docs/kb/data-provenance.md`).
- **Each person's data is their own.** Every study table has `user_id` first
  in its key; every function that reads or writes it takes the user id, and
  every query has `WHERE user_id = ?`. A person can never read or change
  another's rows, attempt and report ids included (they are unique per person
  only). The user id comes from the anotoki library's `Identify`
  (`academy_identify_person()` and, where a visitor may come too,
  `academy_identify()`, in `backend/src/auth.php`: the `sub` of a verified
  access token of the IAM, put on the request by the person middleware) and
  nowhere else, never a body, an address or a header of the app's own. No
  token, or a bad one, is a 401, never a fallback to anybody. The one other
  identity is a **visitor** (`backend/src/visitors.php`,
  `learner_middleware()`, `docs/kb/sign-in.md`, *Visitors*): on the study
  addresses only, only while the IAM says sign-in is not required, a request
  with no `Authorization: Bearer` header and a key the server made
  (`X-Visitor-Key`, only its hash kept) is that visitor - a negative user id,
  their own rows and nothing else (no role, no admin panel, no data file, in
  no backup); a request with neither is nobody (user id 0: an empty learner),
  whose first save makes a visitor. A token always wins: with one, the key is
  not even read. At sign-in `POST /api/visitor/move` (token and key) merges a
  visitor's rows into the person's (the person's stay where both have the
  same thing). The three
  translation tables (`languages`, `translation_keys`, `translations`) are
  the site's, not a person's: read by everybody, written in the admin panel,
  never in `USER_TABLES`, and their queries carry no `user_id`; so are the
  admin tools' (`anotoki_audit_log`, `anotoki_feedback`) and the people's
  bookkeeping (`anotoki_people_*`, the library's).
- **An account the IAM deleted is blanked here, never its study** (the
  library's people module, `backend/src/people.php`): at most hourly, after
  an answer (or the People page's **Check now**), the site asks the IAM for
  the accounts it deleted and blanks who each was - `users.preferred_username`
  becomes the IAM's placeholder (`deleted-<id>`) and `users.anonymized_at`
  says when, the name typed on their exam papers goes (the stored report
  says "Unnamed candidate"), their feedback's address and browser, their
  names and addresses in the audit log. Only UPDATEs: their study rows stay,
  nobody's now, and a row is never written again for that account. A backup
  made before keeps them until it rotates out or the owner deletes it; a
  restore runs the scrub at once once it committed (the library's
  `People::afterRestore()`, its failure the restore's `after_restore_error`,
  the next request scrubbing again). Nor does a restore bring back what an
  `ADMIN` deleted on the People page, or a feedback message deleted, after
  the backup was made (anotoki-lib 0.5.0, `People::replay()`): inside its
  transaction, before anybody sees the rows, every such delete the audit log
  holds is done again - the People page's delete (`people_delete()`, the
  hook both use), its request null, so no copy is kept for it. That hook does
  ALL its work on the connection the library hands it, inside the library's
  transaction, and begins none of its own: on the restore's connection,
  which holds every table it loaded, a statement on `db()` would wait on
  those locks until PostgreSQL ended the restore.
- **Each person takes their data away and brings it back** (`GET` / `PUT
  /api/me/data`, `backend/src/me.php`): the backups' format, version 2, one
  person. Bringing a file back replaces all of theirs, never merges, after a
  copy of what it replaces; whatever id the file names, it goes into the
  caller's account only. It holds their `users` row `FOR UPDATE`, and every
  answer handler, and every save or import of the site's words by a person
  (the anotoki library's save, whose `beforeWrite` is `academy_translations_config()`'s
  in `backend/src/translations.php`), holds it `FOR SHARE` first (`users_hold()`): an
  import (or an administrator deleting a person's data) and an answer take
  turns. A file is taken only in the shape the app writes; anything else is
  422 `not_a_data_file` before anything changes. The
  size limit is a share of `memory_limit` (`me_import_limit()`), never
  `post_max_size`. A file refused is refused before anything changes.
- **Days and hours are each person's own.** Their browser's `X-Time-Zone`
  (an IANA name both PHP and ICU know: `time_zone_known()`; a host's ICU may
  be older than its PHP, and a zone only PHP knows is no zone), else the zone kept on their row
  (`users.time_zone`), else UTC, is PHP's zone for their request
  (`person_middleware()`, `learner_middleware()`; a visitor's the same way): review hours, the day an answer counts on, today,
  the forecast, a report's date. The site's own housekeeping — backup names,
  the daily backup's day — is UTC (`utc_date()`, `utc_stamp()`); never
  `local_date()` for it. A test of days gives the clock, never the real one
  (`docs/kb/kanji-srs.md`).
- **Settings are required, and the IAM is deployment configuration**
  (`issuer` and `client_id` in `backend/config/auth.local.php`), never a
  request's. Without the settings every address but `/api/site-status` answers
  `503 {"code": "not_set_up", "installed", "message"}` (the anotoki library's
  SiteGate, `backend/api/app.php`), with `"setup": "/setup.php"` only while
  the site was never installed (`backend/storage/installed.lock`, which a
  website's setup writes and this computer never does: once set up on a
  website, the setup page is never offered again); old keys (`mode` `iam`, `local_user_id`, a
  time zone) are ignored, and a file for the sign-in mode `none` is not set
  up. `auth_from_this_computer()` (its `Host` 127.0.0.1, localhost or
  [::1]; no `Forwarded`, `X-Forwarded-For` or `X-Real-IP`) decides only what
  this computer is told, never who anybody is.
- Every `/api` and `/report` address needs a signed-in person except
  `/api/site-status` (where the site stands, the anotoki library's),
  `/api/auth/config` (the library's boot configuration), `/api/health`,
  `/api/translations/{code}` (the app's own words, the same for everybody),
  `POST /api/client-errors` (an error a page met, into the error log: the
  library's `ErrorLogRoutes::client()` - anybody's, behind the gate and the
  person's `Identify`, so a person is counted by their account and anybody
  else by their address; 20 an hour from one sender, 500 a day from the
  visitors and as many from the people signed in)
  and the backups' download (`GET /api/admin/backups/{id}/file?ticket=`: a
  browser's navigation sends no token, so its single-use ticket is its check)
  - and, unless the IAM says sign-in is
  required here (`backend/src/access.php`, and always while migration 007 is
  not applied), the study addresses (`study_route()`: the kanji SRS, the
  exam, the reports) and the feedback form (`POST /api/feedback`), which then
  take a **visitor** or nobody too (below); the audio clips are public (shared
  content). A token with no role here, or `MEMBER` alone (every account holds it), is a learner. The `/api/admin/…`
  addresses (the languages, the words, the people, the error and audit logs,
  the feedback, the backups, the migrations) are the
  admin panel's: `EDITOR` rewords the strings, `ADMIN` also adds, changes
  and deletes languages, sees the people and deletes a person's data (after
  a copy of it), reads the error and audit logs and the feedback, keeps the
  backups (each making, download, delete or restore behind a sign-in of the
  last ten minutes) and applies the database's migrations - the admin tools
  are `ADMIN`'s alone (the owner's decision); the
  checks sit on the route groups (`backend/api/routes/translations.php`,
  `people.php`, `admin.php`, `migrations.php`,
  `backend/api/middleware/staff.php`: the library's `RequireRole`, 403
  `staff_only` / `admin_only`, and the library's own ADMIN check inside each
  of its groups; the groups that answer while an update waits - the
  Migrations page's, the error log's, the backups' - read ADMIN from the
  token alone, no table asked, `admin_token_checks()`). The words' addresses are the anotoki
  library's routes in this app's groups, in one wire format for every anotoki
  site, the IAM's snake_case (`native_name`, `sort_order`; a refusal in this
  app's error body, `{error, code, …}`; the words' address answers 503
  `translations_unavailable` while the database has none). On a
  website, `/api/health` shows no database or folder, and errors say no more
  than a sentence - the one exception is why the Migrations page's Apply
  stopped: PostgreSQL's own words, to its ADMIN, as the IAM's page shows
  them (the library's Apply route, `backend/api/routes/migrations.php`; the
  owner's decision of 2026-10-04).
- **Where a request comes from is one rule** (the owner's of 2026-10-11;
  anotoki-lib 0.5's `Support\ClientAddress`): `REMOTE_ADDR`, unless the
  connection is from one of the trusted proxies - Cloudflare's published
  ranges, committed in `backend/config/config.php` (`CLIENT_ADDRESS_DEFAULTS`,
  held equal to the library's list by a test), which `app.local.php`'s
  `client_address.trusted_proxies` may replace (`[]`: nobody; a range wider
  than any proxy's - an IPv4 prefix shorter than /8, an IPv6 one shorter
  than /16, `0.0.0.0/0`, `::/0` - refused, never believed, and said in PHP's
  error log once a day, not on every request) - and then
  Cloudflare's `CF-Connecting-IP`, one address. The header is pinned in the
  code, never a setting: `X-Real-IP`, `True-Client-IP`, `X-Forwarded-For`,
  which Cloudflare passes on as the visitor wrote them, are never read. **With
  the origin secret, only through the owner's zone** (anotoki-lib PHP 0.5.2,
  the owner's decision of 2026-10-13): Cloudflare's ranges are every
  Cloudflare customer's - anybody's Worker can connect from them and write
  the `CF-Connecting-IP` it likes - so a Transform Rule of the owner's zone
  adds `X-Anotoki-Origin` with a secret to every request; the site keeps the
  same value in the optional `backend/config/cloudflare.local.php`
  (`['origin_secret' => …]`, put there by FTP, never asked for, written or shown by the
  setup page, never shown or logged: `config_origin_secret()`) and believes
  `CF-Connecting-IP` only on a request that carries it - any other from
  Cloudflare counts as its edge, coarser, never looser; without the file, as
  before. **A file there that cannot be read cleanly fails closed**, as the
  IAM's does, case for case (`config_read_cloudflare()`): it prints anything,
  or PHP cannot parse, run or open it - it stands for a secret no request
  carries (a random one, `config_origin_secret_nobody_carries()`), so every
  request from Cloudflare's ranges counts as its edge until it is mended;
  the site keeps running. One read cleanly that names no secret (none, or
  blank) is no secret: as without the file. Every
  per-address limit counts the address's bucket (`ClientAddress::bucket()`:
  an IPv6 address by its /64). The visitors' limits (`src/client_address.php`)
  and the library's admin tools (the feedback's limits, the error log's
  client hash: `AdminContext`'s `trustedProxies` and `originSecret` - its
  tenth, last positional argument -, `src/admin.php`) read it
  alike; what is kept is a keyed HMAC of the bucket, never the address - a
  stable pseudonym for as long as its key lasts (whoever holds the key can
  test an address against it).
- The setup page asks for the database and the IAM, nothing else (defaults
  `anotoki_japanese`, port 5432; **Test connection** in the anotoki family's
  words; the button **Save**). From this computer (PHP's built-in server, a
  request straight from here) no token but a nonce (cookie + form,
  SameSite=Strict, and the `Origin` checked); it stays, shows what is saved,
  never a password. Anywhere else a token from
  `backend/config/setup-token.local.php` first (written aside and renamed;
  without a whole one no form passes), nothing of what is saved, before the
  token or after, and when done a lock and it deletes itself. It stays
  parseable by PHP 7.4.
- Each answer is one database transaction (item, day count, log line). Never
  put a backup or anything slow inside a lesson, review or practice request.
  The day's backup runs at the first page load of a (UTC) day (and the
  library's backup of the whole database for the day after that page's
  answer, as the scrub of the IAM's deleted accounts runs after an answer, at
  most hourly: `after_response_add()`); the copy of a
  person's data before their full reset is the one deliberate exception (the
  copies before an import or a delete are no answers' business). The
  other start-time work — a content rebuild — runs on the first request
  after the files changed (an upload, a pull, a data build), on this
  computer as on a website, under a lock (`backend/src/upkeep.php`); every
  other request pays one stamp check. `backend/router.php` does nothing at
  start.
- **A migration never applies itself** (since 2026-10-04, the owner's
  decision), and **what the site does while one waits is the anotoki
  library's** (since 2026-10-07, the owner's request: one behaviour on every
  anotoki site; `docs/kb/decisions.md`): once a new one is whole it waits for
  an `ADMIN`'s **Apply** on the admin panel's Migrations page
  (`/admin/migrations`, the library's page; `GET /api/admin/migrations`,
  `GET …/file`, `POST …/apply`, `backend/api/routes/migrations.php`), which
  takes the raw copy of every table first and then the library's backup of
  the whole database (both named in the answer's note; either failing stops
  it), applies each file in a transaction of its own and stops at the
  first that fails (rolled back whole). Meanwhile every address answers 503
  `update_pending` (`Retry-After: 60`) but the open ones
  (`academy_site_open_paths()` in `backend/api/app.php`: how to sign in, the
  words - the library's `TranslationsRoutes::openPath()` -, the health check,
  the clips, the Migrations page's three, the error log's and the backups'
  - the library's `openPaths()`, never a restore - each its exact route, never a
  prefix a crafted path could slip through): the pages start, and everybody but the site's `ADMIN` reads the
  library's "The site is being updated", in their language, with nothing but
  a quiet **Sign in** while nobody is signed in - the guards send nobody to
  the IAM then -; the `ADMIN` reads "A database update is waiting" and
  reaches the Migrations page, alone of the app's pages. That is how a
  signed-out `ADMIN` gets in: never the problem page while an update waits
  (that deadlock is what the library fixed). The content's rebuild waits too,
  and follows by itself once the schema is current. The setup page and
  `manage.php` apply migrations as before, the same way and under the same
  lock as the Apply (`db_migrator()`, `UPKEEP_LOCK`: one at a time; another
  at it, busy at once - the Apply 409 `busy`).
- `backend/data/*.json` is generated: edit `backend/data/source/*.tsv`, then
  rebuild. `backend/data/authored-items-part1|2.php` is hand-written.
  `backend/data/audio.json` and `backend/data/audio/` come only from
  `backend/tools/build-audio.php`. The catalog and the question bank in the
  database are rebuilt from `backend/data/` at the first request after it
  changed (`backend/src/content.php`); never edit `srs_items` /
  `exam_questions` by hand.
- A migration in `backend/migrations/` that has been committed is never
  edited: add the next number. A migration that changes data carries a
  `DO $$ … $$` check that fails it loudly when the result is wrong (see 002).
  Every migration but 001 ends with the line `-- end of NNN`, its own number:
  without it the file is taken to be half uploaded, and it waits, with every
  one after it, and stops nothing (`db_migration_ready()` in
  `backend/src/db.php`, the library's engine's `ready` rule). **A migration
  being written stays a draft without that line**, and says so at its top,
  until it is final: the owner's `composer start` serves this working tree, and
  a whole migration there waits for their Apply (their study pages stop
  meanwhile), or `manage.php` or the setup page applies it. The tests alone apply a
  draft, by name, on `academy_test_…` databases (`ACADEMY_MIGRATION_DRAFTS`,
  set by `backend/tests/lib.php` and `testdb.php`); the last line is written
  last. `backend/tools/build-dist.php` refuses to build the upload while one
  is a draft. 005 and 006 were written so and are final since 2026-10-04;
  007 (`007_visitors.sql`, visitors) likewise, final since 2026-10-05 (its
  last line written after the browser suites passed;
  `docs/kb/architecture.md`, *The database*): it waits for an `ADMIN`'s
  Apply on every database that has not got it. 008
  (`008_library_status_page.sql`: it deletes the words of the "not set up"
  page and of the problem page's way to the Migrations page, which the
  anotoki library's page took over) is final since 2026-10-11 (reviewed and
  committed; it goes up in the same upload as 009). 009
  (`009_strings_through_the_library.sql`: the app's words the kit read -
  its top bar, menus, language and theme switches - copied under the anotoki
  library's keys, every language with who wrote it and when, and the
  sixteen keys only the bar read deleted - the person's role and the link to
  their anotoki account among them, which the bar now says from the library's
  keys) is final since 2026-10-11 too (the owner accepted it; the two go up
  in the same upload). **010** (`010_people_and_signing_in.sql`: the library's
  people column `users.anonymized_at`, empty, and the three keys of a sign-in
  that came back without one - `signIn.notCompleted`, `signIn.failed`,
  `signIn.signingIn` - deleted, an owner's rewording of any of them copied
  first under the library's `anotoki.signIn.*`, every language with who
  wrote it and when; its check proves every table of people and their data
  has its rows, every other string is as it was and the moved ones came as
  they were) was written as a draft too, and is final since 2026-10-11 (the
  owner's go, "finalize and apply": its last line written last; it goes up
  with the library's files below). **011** (`011_legal_pages_and_questions.sql`:
  the legal pages' 40 words of the app's own - what it keeps, why and for how
  long, its stored items -, the titles and buttons of the kit's questions and
  the app's notices that took the browser's boxes' place, the listen
  button's name, what the number on Kanji counts; the questions' sentences
  reworded without the question their title now asks, and the descriptions
  that still said "chips" told again - each rewording only of a string
  nobody changed) is a draft: its last line is the owner's to write once they
  accept the change. The library's own sets run around this
  app's (`db_migration_sets()`): `anotoki_admin/001_…`, `002_…` (the audit
  log's and the feedback's tables) BEFORE it, then after it
  `anotoki_translations/001_…` to `011_…` (its words, written only where a
  key has none: 003 the sign-in screens', 004 the feedback form's, 005 the
  legal pages', 006 to 009 the top bar's and the kit's newer pieces', 010 and
  011 rewording five of the Privacy page's sentences - two, then three -
  where nobody changed them) and
  `anotoki_people/001_…` (the scrub's bookkeeping); they too end with
  `-- end of NNN`. **While one of the app's own files is a draft, every
  library file waits with it** - the `anotoki_admin` ones before it too -
  on every database but the tests' (`db_migration_ready()`, `db_own_draft()`):
  the owner's own server neither stops its pages for them nor applies them
  before the owner accepts the change, and `manage.php --check` names the
  draft.
- What a word is spoken as is decided in one place, `speech_spoken()` in
  `backend/src/speech.php`, shared by the audio builder, the catalog and the
  exam.
- Conjugation matches both conjugation charts; the tests check every cell.

## Conventions

- PHP: `declare(strict_types=1)`, 4-space indent, single quotes, plain
  functions named by area (`srs_…`, `exam_…`, `store_…`, `kanji_…`, `auth_…`,
  `users_…`, `config_…`); no classes except exceptions. Routes are Slim route
  files (`backend/api/routes/`), each address with data behind `data_route()`.
  Keep it parseable by PHP 7.4 (no match, `?->`, named arguments, union or
  `static` types, constructor promotion, enums, readonly, catch without a
  variable or `throw` expressions) so the owner's editor, which uses a 7.4,
  shows no false errors; it runs on 8.2+ (the anotoki library's floor). `backend/tests/unit/php74-syntax.test.php`
  checks it (Composer's `backend/vendor/` aside: the library is PHP 8). Values in SQL are always `?`
  parameters. Match the file you are in, including its comment density.
- Angular: standalone components with `ChangeDetectionStrategy.OnPush`, state
  in signals, no zone.js. **Every component is three files** — `.ts`, `.html`,
  `.scss` — never an inline template or style. Styles shared by several
  components live in `frontend/src/styles/` (global); a component's own in its
  `.scss`. The app talks to the server only through `ApiService` (HttpClient)
  and the anotoki library's auth interceptor (`anotokiAuthInterceptor`, wired
  in `core/auth/auth.config.ts`), which sends the sign-in's token (or, on a page
  shown to a visitor, the visitor key - never both, decided as the request is
  issued; a person's request with no token is never sent) and the browser's
  time zone (`X-Time-Zone`) to this site's `/api` and `/report` addresses and
  nowhere else (never with `/api/site-status`: nobody's); links the browser follows by itself that need a sign-in go
  through `PrivateLinksService`. The library's error reporter (the app's
  `ErrorHandler`, `core/error-report.config.ts`) posts a page's errors through
  the same HttpClient, so the same interceptors add the same headers; this
  app's own interceptor leaves its answers alone (`ANOTOKI_ERROR_REPORT`). The pages never count days themselves: a
  learner's days come in the server's answers. Every page but Terms,
  Privacy and Contact (anybody's: each a route of its own whose parent is
  their frame, before the learner's catch-all - `app.routes.spec.ts` holds
  `/` and an unknown address to the home page) is behind the
  library's `personOrVisitorGuard` (the admin panel `staffGuard`, its
  ADMIN pages `adminGuard`, which a visitor does not
  pass) - which sends nobody to the IAM while the site is not ready
  (SiteStatus): the anotoki library's gate (`<anotoki-site-gate>` around the
  pages, `core/site-status.config.ts`) shows its page then, with its own
  Sign in. The pages are the gate's marked template
  (`<ng-template anotokiSitePages>` inside it, anotoki-lib 0.2.0): made only
  while the site is open, so no page runs, asks for data or hears a key
  behind the library's page, and one open when the site stops is taken down
  (the exam keeps an open paper for the tab as it goes, and puts it back,
  once, when the page is loaded afresh). A save in the background tells `SavesInFlight`, which a
  sign-out - and a visitor's sign-in - waits for. The top bar and the foot (What's new, its dialog, Send feedback and its form)
  - and the kit's question and the app's notice - keep every key pressed in
  them from `document` (where the quiz, the reviews and the exam listen), the bar's menus
  close on Tab with the focus on their button, and it reads in English in the
  admin panel (the library's `TranslationService.effectiveLanguage`). The
  pages' building blocks are the anotoki library's kit: buttons, dialogs and
  questions, form fields (text fields, textareas, the exam's tick box), the
  spinner, menus, page headers, cards, alerts, badges (the paper's section
  tag wraps, `wrap`), empty states, segmented choices, choice chips and
  chips, labelled groups, disclosures, link tabs and the family's table
  (`anotokiButton`, `<anotoki-dialog>`, `ConfirmService`,
  `anotoki-text-field`, `<anotoki-card>`, `<anotoki-alert>`,
  `<anotoki-segmented>`, `<anotoki-chip-group>`, `<anotoki-link-tabs>` …), each piece
  imported from its own entry point (`@anotoki/lib/ui/button`, `ui/dialog`,
  `ui/forms`, `ui/card`, `ui/chips`, `ui/config` - never the `@anotoki/lib/ui` barrel,
  which would put every piece in the first load): never a style of the app's
  own for one of them. A choice is the kit's: a segmented choice where its
  few short options fit a phone; one of several otherwise the kit's choice
  chips (`<anotoki-chip-group>`, a radio group with its name over it - over
  Browse's for a screen reader alone, `hideLabel`); several at once the kit's
  chips (`button[anotokiChip]`, `pressed`) in the kit's labelled group
  (`<anotoki-labelled-group>`, which names the row - `selfNamed` over a
  segmented choice whose name is shown, which names itself), where a chip needs what a choice
  chip cannot hold (a tooltip, the greetings' kana marked Japanese). The
  exam's "Narrow it down" is the kit's disclosure, the kanji tabs the kit's
  link tabs (a nav named Kanji of ordinary links; on a phone they scroll
  sideways in the kit's strip, never the page, the page's tab brought into
  view), a quiet word-button (all and none, What's new, Send feedback, the
  review's listen) the kit's small link button, 44 px to a finger. **No
  browser box at all**: the kit's question (`ConfirmService`,
  `<anotoki-confirm-host>` in the root - a title that asks, the sentence
  under it, the two buttons in the app's words) asks where `confirm()`
  stood, and the app's notice (`NoticeService`, `<app-notice-host>`, one
  button, OK) tells where `alert()` stood, each worded at the moment it is
  raised. Words that may be long (an answer the learner added)
  stand beside a kit button, never in it: its words stay on one line. The
  study components (tiles, readings, the session
  and its answer box, the lesson batch, the exam's paper, the dashboard's
  section cards, stages and forecast), the foot and the
  changelog's entries are the app's, drawn with the tokens. The kit's class
  names are its own (`anotoki-<piece>__<part>`, since 0.3.0), and the specs
  and browser suites read them so. The kit's words are the anotoki library's keys
  (`anotoki.topbar.*`, `anotoki.theme.*` …) in this app's database, which
  009 filled with the app's own words (`core/kit.config.ts`: the translation
  service's `forKit()`; the English the app says its own way while no words
  are in memory, `KIT_ENGLISH`). The library's sign-in screens
  (`anotoki.signIn.*`) and feedback form (`anotoki.feedback.*`) read their
  words from this app's database the same way; the admin tools' pages are
  English, as the admin panel is. No CDN:
  the app runs offline (wanakana, the library - its sign-in too -, the kit
  and Manrope are bundled).
- JS/TS: 2-space indent, single quotes, semicolons. Node tools and the browser
  suites are CommonJS (`frontend/e2e/`) or ES modules (`.mjs`).
- Colours come only from tokens in `frontend/src/styles/_tokens.scss`, each
  defined for light and dark: Japanese's palette given to the anotoki
  library's tokens (`anotoki.root()`, the `--anotoki-*` properties the kit
  and the library's pages draw with), the app's own names (`--bg`, `--ink`,
  `--accent` …) those tokens, and the study colours its own. The font is the
  family's, Manrope, with the Japanese faces after it. The page's global
  styles are the family's - `anotoki.base` (the page, the headings, links, the
  focus ring), `anotoki.utilities` (`.page`, `.stack`, `.cluster`, `.muted`,
  `.small`, `.facts` …) and `anotoki.tables` - and the app's own come after
  them (`_base.scss`: the reading size, 16 px, the frame `.wrap`,
  `kbd`, the stand-in pages; `_items.scss`: the study's); no rule of the app
  reaches inside a kit component. Every screen must work at phone width
  (390 px).
- The UI is in English and Slovak (informal "ty"), English the fallback. The
  app's own words live in the database (migration 004 and later ones: a key,
  an English string, a Slovak one) and EDITOR and ADMIN reword them in the
  browser (`/admin/translations`, `/admin/languages`: the anotoki library's
  pages); a key without a string
  shows as the key, on purpose; `anotoki.` is the library's namespace, never
  a key of the app's own. The learning material and the SRS stage names
  are never translated, and the admin panel is English. Dates, times and numbers follow the
  language on the page (`'en-GB'`, `'sk-SK'` through `Intl`), never the
  system's locale - but a signed-in person's own date order and clock, the
  anotoki account's, win where they chose them (`core/format.ts`). A new string is a new migration with its English and
  informal Slovak (`DEV.md`; `docs/kb/architecture.md`, *The app's words*).
- The owner writes in non-native English: keep UI text and explanations plain
  and short. `frontend/public/changelog.json` gets an entry, in plain words,
  for each release the owner will notice. Its version has three numbers,
  MAJOR.MINOR.PATCH (big changes, new features, bug fixes: `0.4.0`, `0.4.1`,
  `0.5.0`), the same as `version` in `frontend/package.json` (a unit test
  holds both, `DEV.md`, *The changelog*).
- Japanese data follows the book: readings in hiragana, English glosses as
  printed.

## Skills and agents: use them every time

The owner's standing instruction is to work on this project through its own
skills, agents and knowledge base. They live in `.claude/`. Path-scoped rules
there load when you read the matching files.

**Skills.** At the start of a task, load the one that matches:

| Skill | For |
|---|---|
| `academy-run` | the owner's `composer start` on :8200 and `ng serve` on :4400 (theirs to start and stop), or a throwaway server with its own database (signing in through the test IAM) |
| `academy-test` | which suites to run for a change, reading results, adding tests (tests with tokens too) |
| `academy-ui-check` | screenshots of every screen (light/dark/phone, Slovak on a phone light/dark), the top bar measured, and a visual checklist |
| `academy-data` | editing the `backend/data/source` TSVs, rebuilding, making audio, SRS id renames |
| `academy-pdf` | reading the scanned books as page images; page maps |
| `academy-exam-items` | writing or fixing hand-written exam questions |
| `academy-deploy` | building the upload, the setup page on a website, updating the website, moving the owner's data there |

**Agents.** These are read-only reviewers, and running them is mandatory at
these checkpoints:

| Checkpoint | Agent |
|---|---|
| Code changed anywhere in the app (not docs-only), before calling it done | `academy-code-reviewer` |
| Anything under `frontend/src/` changed | `academy-ui-tester` |
| Japanese content changed: conjugation, exam generation, authored items, answer checking, catalog readings or meanings, spoken forms (`backend/src/speech.php`) | `academy-japanese-reviewer` |
| `backend/data/source/` or a data build script (`backend/tools/build-data.php`, `backend/tools/build-audio.php`) changed | `academy-data-auditor` |

Give each agent the list of changed files, what changed and why (`git status`
shows the uncommitted work). If an agent shows as "not found" (agents load
when a session starts), run a general-purpose agent instead. Tell it to follow
`.claude/agents/<name>.md` and to stay read-only. Run agents that don't depend
on each other in parallel. Fix what they find, or tell the owner why you
didn't. A small follow-up fix inside the same area doesn't need a second full
review round.

## Definition of done

1. The PHP tests (`node backend/tools/php.js backend/tests/run.php`) and, if
   `frontend/` changed, `npm test` in `frontend/` pass. If `frontend/`
   changed, the browser suite (`node frontend/e2e/run.js` after a build) also
   passes and the screens have been checked (`node frontend/e2e/screens.js`);
   if the setup page changed, `node frontend/e2e/setup.js` too.
2. The checkpoint agents that apply have run. Their findings are fixed or
   reported.
3. The kb pages, the README, `DEV.md` and the counts are still true. Any
   decision someone might question has an entry in `docs/kb/decisions.md`.
4. If server-side code or data changed, a server answers requests with it:
   a throwaway one through `backend/router.php` (academy-run). The owner's
   `composer start` needs no restart (nothing happens at start; the next
   request picks the change up): start or stop it only when the owner asks,
   and never create `anotoki_japanese_academy` on a computer without it.
5. The final message says what changed, what was verified and how, and anything
   left undone.
