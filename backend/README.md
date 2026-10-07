# Japanese Academy - the backend

The API, the setup page and the study content: PHP 8.2+ with Slim 4 on
PostgreSQL, signing people in through the anotoki IAM (client
`japanese-academy`). It also serves the built app (`../frontend/`) on one
address. How it works and why is in [`../docs/kb/`](../docs/kb/README.md);
setting it up and running it in [`../DEV.md`](../DEV.md). The code parses as
PHP 7.4 (the owner's editor) and runs on 8.2+, the floor of the anotoki
library (`anotoki/lib`: the migrations' engine, the site's state and the gate
in front of every route; `../DEV.md`, *The anotoki library*).

## Layout

```
router.php           PHP's built-in web server on a computer (composer start): /api, /audio, /report,
                     /setup.php and the built app, through api/front.php; nothing happens at start
setup.php            the setup page, /setup.php: the database and the IAM (parses as PHP 7.4)
manage.php           command line: --check, --sync, --backup, --restore=FILE
translations.php     command line: the app's own words, --status, --export, --import (never uploaded)
api/                 app.php (the Slim app; in front of every route the anotoki library's SiteGate -
                     503 not_set_up, or update_pending but on the addresses that stay open - and its
                     GET /api/site-status), front.php (one request: the API, the setup page or the built
                     app), routes/ (site, kanji, exam, me - your data as a file, visitor - the move at
                     sign-in, translations, people, migrations - the Migrations page's, the library's
                     routes), middleware/ (security, upkeep - the content's rebuild, person - who asks
                     (a person, or on the study addresses a visitor or nobody) and their time zone,
                     staff - the admin panel's roles; the Migrations page's from the token alone, errors)
src/                 the app, plain functions by area: bootstrap.php, db.php (and db_migrator(): the
                     library's engine, set up for this site's migrations), auth.php (the IAM's token
                     -> the person and their roles), anotoki_iam.php (the IAM's SDK, never edited),
                     access.php (whether the IAM requires sign-in here, relayed by /api/auth/config),
                     visitors.php (studying without signing in: made, found, capped, swept, moved into
                     an account at sign-in), client_address.php (the address the visitors' limits
                     count), after.php (work after the answer: the visitors' sweep),
                     users.php (and their time zones), upkeep.php (the start-time work, on requests,
                     and the copy of every table before an apply - a request never applies a migration),
                     srs/ (the kanji SRS), exam.php, generate.php, conjugate.php, score.php, report.php,
                     content.php, speech.php, backup.php, me.php (a person's own data file),
                     people.php (the People page), translations.php, util.php, errors.php
config/              config.php; this copy's settings in *.local.php (gitignored, written by setup.php)
migrations/          the schema and the app's words, NNN_name.sql (a committed one is never edited; one
                     still being written is a draft without its "-- end of NNN" line, which only the
                     tests' databases get)
data/                the study content's sources: source/*.tsv (transcribed), vocab.json, kanji.json,
                     grammar-index.json (built from them), authored-items-part1|2.php (hand-written
                     exam items), audio.json + audio/ (the clips) - never edited by hand
storage/             gitignored: backups/ (the copies of the study data), cache/ (the IAM's keys and its answer whether sign-in is required,
                     the visitors' address secret and sweep stamp), installed.lock (a website's: its setup
                     finished, and nobody is offered the setup page again)
public/              index.php and .htaccess: Apache's half of the upload's public/
vendor/              Slim and its pieces, and the anotoki library (anotoki/lib) - committed: the hosting
                     cannot run Composer
tests/               run.php, lib.php; unit/, api/; tools/ (testdb.php, test-config.php, iam.php,
                     stand-in-iam.php, front-controller.php, catalog.php)
tools/               build-data.php, build-audio.php, build-dist.php (the upload), translation_keys.php
                     (the frontend's keys), php.js (finds a PHP 8.2+), pdf/ (the scanned books' page
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
settings of its own and the test IAM's keys: nothing reaches your database,
your backups or an IAM. `../docs/kb/testing.md` says what each file pins down.
