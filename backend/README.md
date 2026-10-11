# Japanese Academy - the backend

The API, the setup page and the study content: PHP 8.2+ with Slim 4 on
PostgreSQL, signing people in through the anotoki IAM (client
`japanese-academy`). It also serves the built app (`../frontend/`) on one
address. How it works and why is in [`../docs/kb/`](../docs/kb/README.md);
setting it up and running it in [`../DEV.md`](../DEV.md). The code parses as
PHP 7.4 (the owner's editor) and runs on 8.2+, the floor of the anotoki
library (`anotoki/lib` 0.4.1: the migrations' engine, the site's state and
the gate in front of every route, the app's words - their address, the admin
panel's, the command line's work -, the sign-in's checks, the people and
the admin tools; `../DEV.md`, *The anotoki library*).

## Layout

```
router.php           PHP's built-in web server on a computer (composer start): /api, /audio, /report,
                     /setup.php and the built app, through api/front.php; nothing happens at start
setup.php            the setup page, /setup.php: the database and the IAM (parses as PHP 7.4)
manage.php           command line: --check, --sync, --backup, --restore=FILE
translations.php     command line: the app's own words, --status, --export, --import (never uploaded): the
                     library's TranslationsCommand, with this app's names and its backups as files to import
api/                 app.php (the Slim app; around everything the library's error log, in front of every
                     route the anotoki library's SiteGate - 503 not_set_up, or update_pending but on the
                     addresses that stay open - and its GET /api/site-status; after an answer, now and
                     then, the scrub of the accounts the IAM deleted), front.php (one request: the API,
                     the setup page or the built app), routes/ (site - with the library's boot
                     configuration, /api/auth/config -, kanji, exam, me - your data as a file, visitor -
                     the move at sign-in, translations - the library's routes behind this app's checks,
                     people - the library's People routes, admin - the library's error log, audit log,
                     feedback and backups, and the visitors' feedback form, migrations - the Migrations
                     page's, the library's routes), middleware/ (security, upkeep - the content's
                     rebuild, person - who asks (the library's Identify: a person, or on the study
                     addresses a visitor or nobody) and their time zone, staff - the admin panel's roles,
                     the library's RequireRole; the groups that answer while an update waits from the
                     token alone, errors)
src/                 the app, plain functions by area: bootstrap.php, db.php (and db_migrator(): the
                     library's engine, set up for four sets - the library's anotoki_admin, this site's
                     migrations, the library's anotoki_translations and anotoki_people), auth.php (the
                     library's auth module for this site: the IAM's token -> the person and their
                     roles, who a request is, the boot configuration),
                     access.php (whether the IAM requires sign-in here, relayed by /api/auth/config),
                     visitors.php (studying without signing in: made, found, capped, swept, moved into
                     an account at sign-in), client_address.php (the address the visitors' limits
                     count), after.php (work after the answer: the visitors' sweep),
                     users.php (and their time zones), upkeep.php (the start-time work, on requests,
                     and the copy of every table before an apply - a request never applies a migration),
                     srs/ (the kanji SRS), exam.php, generate.php, conjugate.php, score.php, report.php,
                     content.php, speech.php, backup.php, me.php (a person's own data file),
                     people.php (the library's people module for this site: each person's row, the
                     scrub of the accounts the IAM deleted and what it blanks here, the People page's
                     columns and delete), admin.php (the library's admin tools for this site: the error
                     log, the audit log, the feedback, the backups of the whole database),
                     translations.php (the library's Translations for this
                     app: its released languages, the copy before a language goes), util.php, errors.php
config/              config.php; this copy's settings in *.local.php (gitignored, written by setup.php)
migrations/          the schema and the app's words, NNN_name.sql (a committed one is never edited; one
                     still being written is a draft without its "-- end of NNN" line, which only the
                     tests' databases get)
data/                the study content's sources: source/*.tsv (transcribed), vocab.json, kanji.json,
                     grammar-index.json (built from them), authored-items-part1|2.php (hand-written
                     exam items), audio.json + audio/ (the clips) - never edited by hand
storage/             gitignored: backups/ (the copies of the study data, and the library's backups of the
                     whole database, *.anotoki-backup - 14 daily, 5 before an update, 5 before a restore,
                     the ADMIN's own until the owner deletes them, none for its age), logs/ (the
                     library's error log, errors-<day>.jsonl, 30 days), cache/ (the IAM's keys and its
                     answer whether sign-in is required, the visitors' address secret and sweep stamp, the
                     library's stamps and limits), anotoki-lib.key (the library's key for the hashes it
                     keeps; made once), installed.lock (a website's: its setup finished, and nobody is
                     offered the setup page again). Never delete a backup or a log here: the owner does
public/              index.php and .htaccess: Apache's half of the upload's public/
vendor/              Slim and its pieces, and the anotoki library (anotoki/lib) - committed: the hosting
                     cannot run Composer
tests/               run.php, lib.php; unit/, api/; tools/ (testdb.php, test-config.php, iam.php - the
                     library's test IAM for the browser suites -, front-controller.php, catalog.php); the
                     stand-in IAM is the library's (vendor/anotoki/lib/php/testing/)
tools/               build-data.php, build-audio.php, build-dist.php (the upload), translation_keys.php
                     (the library's key scan of the frontend, and a backup as a file of strings), php.js
                     (finds a PHP 8.2+), pdf/ (the scanned books' page
                     images; its own package.json for sharp)
```

## Commands

From `backend/`, with a PHP 8.2+ first on PATH:

```bash
composer start                          # php -S localhost:8200 router.php: the API, setup.php, the last build
php manage.php --check                  # what is waiting (migrations, a content rebuild); --sync does it.
                                        # A draft migration (no "-- end of NNN" yet): "Waiting: …", and it
                                        # offers only what comes before it (exit 1)
php translations.php --status           # every key the frontend uses has its strings
php tools/build-data.php                # data/source/*.tsv -> data/*.json
php tools/build-dist.php [--no-audio]   # the upload -> ../dist/japanese-academy/ (builds the frontend too);
                                        # refuses while a migration is a draft (--allow-draft=NAMES: tests only)
```

From the repository's top folder, where an older `php` comes first on PATH
(Git Bash's is 7.4 on the owner's computer): `node backend/tools/php.js
backend/manage.php --check`, and the same for every script here.

## Tests

```bash
node backend/tools/php.js backend/tests/run.php                              # every test (from the top folder)
node backend/tools/php.js backend/tests/run.php backend/tests/unit/srs.test.php   # some files
```

Each file runs in its own throwaway database (`academy_test_…`), with
settings and a storage folder of its own and the test IAM's keys: nothing
reaches your database, your backups, your logs or an IAM.
`../docs/kb/testing.md` says what each file pins down.
