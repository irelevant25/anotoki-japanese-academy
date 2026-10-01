# Japanese Academy — project instructions

This repository is Japanese Academy, the owner's study app for a two-part
beginner Japanese course: a WaniKani-style kanji SRS (`/kanji`) and an
11,523-question multiple-choice exam (`/exam`), with every word spoken in two
voices. The backend is PHP 8.1+ with Slim 4 and PostgreSQL for all data
(`backend/`); the frontend is an Angular 21 app — standalone, zoneless,
signals (`frontend/`), built once and served by the backend. It runs two ways:

- **on the owner's computer**, under PHP's built-in web server
  (`php backend/server.php`, started by `start.ps1` / `start.sh`), with no
  sign-in (auth mode `none`): the owner studies with it daily at
  http://127.0.0.1:8200;
- **as a website** (https://japanese.anotoki.eu), on the owner's FTP-only shared
  hosting under Apache, where people sign in through the anotoki IAM (auth mode
  `iam`) and each person has their own progress, settings and exam history.
  The owner decided both on 2026-09-27.

It replaced the earlier N4 Coach app on 2026-09-23, because the owner found
N4 Coach's sentences and learning path wrong. N4 Coach lives on only in the git
history; don't bring its code or content back. On 2026-09-24 its backend moved
from Node/Express and JSON files to PHP and PostgreSQL; on 2026-09-29 the
repository became `backend/` (Slim) + `frontend/` (Angular), in the layout of
the other anotoki sites (the owner's conventions). Both earlier versions are in
the git history.

**Never name the course the data comes from** — not in code, data, docs, file
names, commit messages or UI text. The repository is on GitHub, and the owner
doesn't want it to show the source. Say "the course", "Part 1 / Part 2",
"textbook 1". `backend/tests/unit/source-names.test.php` fails on any mention.
(The real word 元気 in the vocabulary is fine.)

**Knowledge base: `docs/kb/README.md`.** Before changing an area, read its kb
page. If a change makes a statement in the kb, the README, `DEV.md` or a
count wrong, fix it in the same piece of work.

## What is where

- `backend/` — `server.php` (the start command on a computer, and the
  built-in server's router), `setup.php` (the setup page, `/setup.php`),
  `manage.php` (command-line helpers: `--check`, `--sync`, `--backup`,
  `--restore`, `--import`, `--owner-id`), `translations.php` (the app's own
  strings from the command line: `--status`, `--export`, `--import`; never
  uploaded), `api/` (the HTTP side: `app.php` the Slim app, `routes/` site,
  exam, kanji and translations, `middleware/` — `owner.php` guards the
  owner's addresses —, `front.php` which sends each request to the API, the
  setup page or the built app), `src/` (the app: `bootstrap.php`, `db.php`,
  `auth.php`, `users.php`, `upkeep.php`, `owner.php`, the SRS in `src/srs/`,
  the exam, content, backups, `translations.php` — the languages and the
  app's words), `config/` (`config.php`; this copy's settings in `*.local.php`),
  `migrations/`, `vendor/` (Composer's packages, committed: a website has no
  shell), `public/` (Apache's `index.php` and `.htaccess`, for the upload),
  `tests/`, `tools/` (data and audio builders, `build-dist.php` for the
  upload, `php.js` which finds PHP for npm, `pdf/pages.js`), `storage/`
  (gitignored contents: the IAM's keys, cached; a website's setup lock).
- `frontend/` — the Angular app: `src/app/` (`home/`, `kanji/`, `exam/`,
  `core/` — API, sign-in, the changelog, `i18n/` (the app's words: the
  translation service, its pipes, the language chooser, failures worded from
  their codes) —, `owner/` — the owner's Translations and Languages pages,
  in English —, `standin/` — the Sign in, not set up and problem pages),
  `src/styles/` (tokens, base, items), `public/`
  (favicon, `changelog.json`), `e2e/` (the browser suites), `scripts/`
  (`ensure-build.mjs`, which builds only when the sources changed).
- `backend/config/*.local.php` are gitignored and required: `database` (with
  the password), `auth` (mode, IAM issuer and client id, `local_user_id`) and
  `app` (time zone). The setup page writes them; there are no defaults to fall
  back on. Never print them, copy their values anywhere or commit them. On a
  computer that ran the version before, `src/config.local.php` (the old
  settings) may still sit at the root: the setup page offers its values once;
  the same rules apply to it.
- `books/` is gitignored and stays on this computer. It holds the five scanned
  course books (`textbook-1.pdf`, `workbook-1.pdf`, `textbook-2.pdf`,
  `workbook-2.pdf`, `answer-key.pdf`), the owner's notes, and old audio the app
  no longer uses. The PDFs have no text layer, so read them only through the
  `academy-pdf` skill.
- `data/audio/` + `data/audio.json`: the spoken vocabulary, made with Google
  Cloud Text-to-Speech by `npm run build:audio`, and kept in git. Leave the
  clips as they are. Making new clips needs `GOOGLE_TTS_API_KEY` in `.env`
  (gitignored). Never print the key, put it in a file that git tracks, or paste
  it into a message.
- `backend/src/anotoki_iam.php` (v1.0.1) and
  `frontend/src/app/core/auth/sdk/anotoki-auth.mjs` + `.d.ts` (v1.1.1) are the
  anotoki IAM's SDKs, copied unchanged from its repository
  (`../anotoki-iam/sdk/php/`, `../anotoki-iam/sdk/js/`). Never edit them: copy
  a new version over, and change the version where `backend/src/auth.php`,
  `frontend/src/app/core/auth/auth.service.ts` and `docs/kb/sign-in.md` name
  it (a test pins both).
- `.claude/` holds the project's skills, agents and path-scoped rules.
- `start.ps1` / `start.sh` are the owner's one-click launcher: they find a PHP
  8.1+ with pdo_pgsql, mbstring and intl and a Node.js, build the app when its
  sources changed, start `php backend/server.php` and open the browser — the
  setup page while the copy is not set up.

## Commands (run from the repository root)

The npm scripts find a PHP that can run the app themselves
(`backend/tools/php.js`), even where an older `php` comes first on PATH; by
hand, call that PHP (`docs/kb/environment.md`).

```
npm start                    the app on 127.0.0.1:8200 with your settings (php backend/server.php; academy-run skill)
(cd backend && composer start)  the same server, the way every anotoki backend starts (with the php on PATH)
npm run frontend             ng serve on localhost:4400, proxying the backend's addresses to :8200
npm test                     backend (PHP unit + API, 169 tests) and frontend (Angular unit, 472 in 39 files): after every change
npm run test:browser         Edge end to end (73 checks): lessons → reviews → practice → exam, the language chooser by keys,
                             the owner's pages, then sign-in and sign-out
npm run test:setup           the setup page in Edge (40 checks): this computer's way and a website's
npm run screens -- [name]    screenshots → frontend/e2e/shots/: 17 screens light/dark/phone and Slovak phone light/dark,
                             and the top bar measured at 360-560 px (-- room for that alone)
npm run build:frontend       the Angular build, when its sources changed
npm run build:data           data/source/*.tsv → data/*.json (php backend/tools/build-data.php)
npm run build:audio          missing clips → data/audio/ (Google TTS; -- --dry-run needs no key)
npm run build:dist           the upload for the website → dist/japanese-academy/ (academy-deploy skill)
npm run manage -- --backup   backend/manage.php: --check, --sync, --backup, --restore=F, --import=D, --owner-id=N
php backend/translations.php --status   the keys the frontend uses against the database's (exit 1: a page would show a key);
                             --export CODE [FILE], --import CODE FILE (a language's strings; with the PHP above, by hand)
npm run pdf:pages -- <book> <pages>    page images of the scanned PDFs (academy-pdf skill)
```

## The owner's data: hard rules

- **The database named in the owner's settings (`japanese_academy` on their
  computer) is the owner's study data**: kanji progress, the answer log
  (`srs_log`), every exam attempt and its report — each row with its person's
  `user_id`; on the owner's computer that is the owner (user 1 unless
  `auth.local_user_id` says otherwise). Never drop, truncate, reset or "clean
  up" it, and never run an experiment, a test or a migration draft against it.
  Change it by hand only when the owner asks, after
  `php backend/manage.php --backup`. On a computer without the owner's data it
  does not exist, and nothing may create it. A website's database is its
  people's data: the same rules.
- **The study rows are never rewritten.** The one exception: migration
  `002_users.sql` gave every existing row the owner's user id, which the owner
  approved on 2026-09-27; its check proves no row was lost or changed.
  `--owner-id=N` (or a new user id in the setup page) only changes whose the
  rows are, when the owner asks for it.
- **Anything but the owner's own `npm start` or launcher uses a throwaway
  database** (`academy_test_…`). The tests make theirs through
  `backend/tests/lib.php` and `frontend/e2e/helpers.js`, with settings of their
  own (`ACADEMY_CONFIG_DIR`, honoured for `academy_test_…` databases only); a
  manual server uses the throwaway setup in the academy-run skill.
  `backend/tests/tools/testdb.php` only touches `academy_test_…` names.
- `backups/` (gitignored) holds the daily copies of all the study data. Never
  delete them. `progress/` (kanji progress and log, 2026-09-23/24), `results/`
  and `reports/` (exam attempts; the first from 2026-09-22) are the history from
  before the database: tracked in git, imported once by the setup, never
  written again. Never delete, move, rewrite, reformat or "clean up" them, and
  never point a test at them (the import tests use fixtures in temp folders).
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
  only). The user id comes from `auth_user()` (`backend/src/auth.php`, put on
  the request by the person middleware) and nowhere else: in auth mode `iam`
  from a verified access token, in mode `none` the owner. The three
  translation tables (`languages`, `translation_keys`, `translations`) are
  the site's, not a person's: read by everybody, written by the owner, never
  in `USER_TABLES`, and their queries carry no `user_id`.
- **Settings are required, and sign-in is deployment configuration**
  (`auth.mode` in `backend/config/auth.local.php`), never a request's. Without
  the settings every address with data answers `503 {"code": "not_set_up"}`.
  Mode `none` works only under PHP's built-in server, for a request straight
  from this computer (its `Host` 127.0.0.1, localhost or [::1]; no
  `Forwarded`, `X-Forwarded-For` or `X-Real-IP`), and then the server listens
  on 127.0.0.1 only. To any other request, every address with somebody's data,
  and `/api/auth/config`, answers 403.
- Every `/api` and `/report` address needs a signed-in person except
  `/api/auth/config`, `/api/health` and `/api/translations/{code}` (the app's
  own words, the same for everybody); the audio clips are public (shared
  content). The `/api/owner/…` addresses (the languages and the words) are the
  owner's alone: the IAM role `ADMIN`, or this computer in mode `none`
  (`backend/api/middleware/owner.php`). On a website, `/api/health` shows no
  database, folder or owner, and errors say no more than a sentence.
- The setup page: from this computer (PHP's built-in server, a request
  straight from here) no token but a nonce (cookie + form, SameSite=Strict, and
  the `Origin` checked); it stays, never shows a password, and offers mode
  `none`. Anywhere else a token from `backend/config/setup-token.local.php`
  first (written aside and renamed; without a whole one no form passes), and
  nothing of what is set, nor the files in `backups/`, before it is proven;
  mode `iam` only, and when done a lock and it deletes itself.
- Each answer is one database transaction (item, day count, log line). Never
  put a backup or anything slow inside a lesson, review or practice request.
  The day's backup runs when the server starts, or at the first page load of a
  new day (a server left running overnight, and a website); the copy of a
  person's data before their full reset is the one deliberate exception. On a
  website the other start-time work — new migrations, a content rebuild —
  runs on the first request after an upload, under a lock
  (`backend/src/upkeep.php`); every other request pays one stamp check.
- `data/*.json` is generated: edit `data/source/*.tsv`, then rebuild.
  `data/authored-items-part1|2.php` is hand-written. `data/audio.json` and
  `data/audio/` come only from `npm run build:audio`. The catalog and the
  question bank in the database are rebuilt from `data/` when the server starts
  (`backend/src/content.php`); never edit `srs_items` / `exam_questions` by
  hand.
- A migration in `backend/migrations/` that has been committed is never
  edited: add the next number. A migration that changes data carries a
  `DO $$ … $$` check that fails it loudly when the result is wrong (see 002).
  Every migration but 001 ends with the line `-- end of NNN`, its own number:
  without it the file is taken to be half uploaded, and it waits, with every
  one after it (`db_migration_sql()` in `backend/src/db.php`).
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
  shows no false errors; it runs on 8.1+. `backend/tests/unit/php74-syntax.test.php`
  checks it (Composer's `backend/vendor/` aside). Values in SQL are always `?`
  parameters. Match the file you are in, including its comment density.
- Angular: standalone components with `ChangeDetectionStrategy.OnPush`, state
  in signals, no zone.js. **Every component is three files** — `.ts`, `.html`,
  `.scss` — never an inline template or style. Styles shared by several
  components live in `frontend/src/styles/` (global); a component's own in its
  `.scss`. The app talks to the server only through `ApiService` (HttpClient)
  and the auth interceptor, which sends the sign-in's token to this site's
  `/api` and `/report` addresses and nowhere else; links the browser follows by
  itself that need a sign-in go through `PrivateLinksService`. No CDN: the app
  runs offline (wanakana and the IAM's SDK are bundled).
- JS/TS: 2-space indent, single quotes, semicolons. Node tools and the browser
  suites are CommonJS (`frontend/e2e/`) or ES modules (`.mjs`).
- Colours come only from tokens in `frontend/src/styles/_tokens.scss`, each
  defined for light and dark. Every screen must work at phone width (390 px).
- The UI is in English and Slovak (informal "ty"), English the fallback. The
  app's own words live in the database (migration 004 and later ones: a key,
  an English string, a Slovak one) and the owner rewords them in the browser
  (`/translations`, `/languages`); a key without a string shows as the key, on
  purpose. The learning material and the SRS stage names are never translated,
  and the two owner pages are English. Dates, times and numbers follow the
  language on the page (`'en-GB'`, `'sk-SK'` through `Intl`), never the
  system's locale. A new string is a new migration with its English and
  informal Slovak (`DEV.md`; `docs/kb/architecture.md`, *The app's words*).
- The owner writes in non-native English: keep UI text and explanations plain
  and short. `frontend/public/changelog.json` gets an entry, in plain words,
  for each release the owner will notice.
- Japanese data follows the book: readings in hiragana, English glosses as
  printed.

## Skills and agents: use them every time

The owner's standing instruction is to work on this project through its own
skills, agents and knowledge base. They live in `.claude/`. Path-scoped rules
there load when you read the matching files.

**Skills.** At the start of a task, load the one that matches:

| Skill | For |
|---|---|
| `academy-run` | start, stop or restart the owner's server on :8200, the Angular dev server on :4400, or a throwaway server with its own database (with or without sign-in) |
| `academy-test` | which suites to run for a change, reading results, adding tests (tests with tokens too) |
| `academy-ui-check` | screenshots of every screen (light/dark/phone, Slovak on a phone light/dark), the top bar measured, and a visual checklist |
| `academy-data` | editing the `data/source` TSVs, rebuilding, making audio, SRS id renames |
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
| `data/source/` or a data build script (`backend/tools/build-data.php`, `backend/tools/build-audio.php`) changed | `academy-data-auditor` |

Give each agent the list of changed files, what changed and why (`git status`
shows the uncommitted work). If an agent shows as "not found" (agents load
when a session starts), run a general-purpose agent instead. Tell it to follow
`.claude/agents/<name>.md` and to stay read-only. Run agents that don't depend
on each other in parallel. Fix what they find, or tell the owner why you
didn't. A small follow-up fix inside the same area doesn't need a second full
review round.

## Definition of done

1. `npm test` passes. If `frontend/` changed, `npm run test:browser` also
   passes and the screens have been checked (`npm run screens`); if the setup
   page changed, `npm run test:setup` too.
2. The checkpoint agents that apply have run. Their findings are fixed or
   reported.
3. The kb pages, the README, `DEV.md` and the counts are still true. Any
   decision someone might question has an entry in `docs/kb/decisions.md`.
4. If server-side code or data changed, the owner's server has been restarted
   (academy-run) and answers requests. If it wasn't running, start it once to
   check, then stop it again. On a computer without the owner's database,
   check `php backend/server.php` with a throwaway one instead (never create
   `japanese_academy` there).
5. The final message says what changed, what was verified and how, and anything
   left undone.
