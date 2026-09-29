# Developing Japanese Academy

How to set up a computer to work on the app, run it while you change it, test
it, and build the website's upload. `README.md` is the owner's side (running
and using it); `docs/kb/` is the reference for each area; `CLAUDE.md` holds the
rules.

## The parts

| Part | Folder | What |
|---|---|---|
| Backend | `backend/` | PHP 8.1+, Slim 4, PostgreSQL. `server.php` runs it on this computer (PHP's built-in web server); on a website Apache runs `public/index.php`. Both go through `api/front.php` |
| Frontend | `frontend/` | Angular 21: standalone components, zoneless, signals. Built into `frontend/dist/japanese-academy/browser/`, which the backend serves |
| Data | `data/` | what the study content is built from, and the audio clips |

One address serves both halves: the backend answers `/api/…`, `/audio/…`,
`/report/…` and `/setup.php`, and sends the built app for everything else (a
page's address without a file extension gets its `index.html`, and Angular's
router draws the page).

## What to install

- **PHP 8.1 or newer** with `pdo_pgsql`, `mbstring`, `intl`, `curl` and
  `openssl`. The npm scripts find a PHP that can run the app themselves
  (`backend/tools/php.js`: `ACADEMY_PHP`, then every `php` on PATH, then the
  usual install folders), so an older `php` first on PATH does no harm. By hand,
  call that PHP. `php backend/server.php` starts PHP's built-in server with
  OPcache off; do the same for one you start yourself on Windows
  (`-d opcache.enable=0`; `docs/kb/environment.md` says why).
- **PostgreSQL 13 or newer** (tested with 18). The user in your settings must
  be allowed to make databases (the tests make throwaway ones), and roles (the
  setup and website tests make a database user, as a hosting panel does).
- **Node.js** 20.19, 22.12, or 24 and newer (`.nvmrc` pins 22), with npm.
- **Edge or Chrome** for the browser suites (`BROWSER_PATH` points at another
  Chromium browser).
- Composer only to change the backend's packages: `backend/vendor/` is
  committed, because a website has no shell to install them.

## The first time

```bash
npm install                  # the root's tools (sharp, for the PDF page tool)
npm run build:frontend       # installs the frontend's packages when needed, builds the app
npm start                    # php backend/server.php → http://127.0.0.1:8200
```

`npm start` says the copy is not set up yet: open
http://127.0.0.1:8200/setup.php. On a computer that is not the owner's, give
the database a name of its own (`academy_dev`, say) — never
`japanese_academy`, which is the owner's study data on their computer. Choose
no sign-in for now; the page can be run again any time to change that. The
settings land in `backend/config/*.local.php` (gitignored): `database`, `auth`
and `app` (the time zone). The app requires all three; without them every
address with data answers `503 {"code": "not_set_up"}` and the app shows its
"not set up yet" page — as it does when they name a database that is missing
or has no tables yet, at the first screen with data.

## Day to day

Two servers side by side while you change the frontend:

```bash
npm start                    # the backend on http://127.0.0.1:8200 (it serves the last build too)
npm run frontend             # ng serve on http://localhost:4400, rebuilding as you save
```

Work at http://localhost:4400. Its dev server sends `/api`, `/audio`,
`/report` and `/setup.php` on to the backend (`frontend/proxy.conf.json`), so
the page, the API and the setup page share one address, as they do when the
backend serves the build.

Restart `npm start` after a change to `data/` or the migrations: at start it
applies new migrations (after a raw copy of every table), rebuilds the study
content when `data/` or its builders changed, and takes the day's backup.
Changes to the PHP code need no restart.

### Signing in against the development IAM

The anotoki IAM runs next to this repository (`../anotoki-iam`; its
`DEVELOPING.md`): its API on 8100, its pages on http://localhost:4300. It
registers Japanese Academy for http://localhost:4400 by default, with the
redirect URI http://localhost:4400/auth/callback and `/` after sign-out.

1. Start the IAM, then this app's two servers (above).
2. Open http://localhost:4400/setup.php, choose **Sign in through the anotoki
   IAM**, the address `http://localhost:4300` and the client id
   `japanese-academy`, and press its **Test connection**: it fetches the IAM's
   discovery document and keys. Then **Set up**.
3. Open http://localhost:4400: the Sign in page. Signing in goes to the IAM
   and comes back to `/auth/callback`, then to the page you were on. Only an
   account with a role in this app (`ADMIN` or `MEMBER`) gets in.

Back to no sign-in: the setup page again, **No sign-in**. The data of each
person is their own either way (`docs/kb/sign-in.md`).

### The changelog

`frontend/public/changelog.json` lists the releases, newest first, each with
`added`, `updated` and `fixed` lines in plain words, for the person using the
app. The version at the foot of every page is the newest entry's, and opens
the list. Add an entry with every release the owner will notice, and keep
`version` in `package.json` and `frontend/package.json` in step.

## Tests

| Command | What | Time |
|---|---|---|
| `npm test` | both of these | ~40 s |
| `npm run test:backend` | `php backend/tests/run.php`: the PHP unit and API tests, each file in its own throwaway database | ~25 s |
| `npm run test:frontend` | the Angular unit tests (Vitest, in jsdom): answer checking against the whole catalog, the session engine, the interceptor, the changelog … | ~15 s |
| `npm run test:browser` | the whole study loop, an exam, then signing in and out of a hosted site's copy, in Edge, against the production build | ~2 min |
| `npm run test:setup` | the setup page in Edge, on a built upload: this computer's way and a website's | ~1 min |
| `npm run screens [name]` | every screen in light, dark and phone layouts → `frontend/e2e/shots/`; fails on overflow or an error | ~1 min |

The browser suites build the app first when its sources changed. Every test
that needs a database gets a throwaway one (`academy_test_…`), made on the
PostgreSQL server of your settings and dropped again; your own database, your
`backups/` and the owner's history (`progress/`, `results/`, `reports/`) are
never touched, and no test asks Google or an IAM. `docs/kb/testing.md` says
what each suite pins down and what to run for a change.

## Building the website's upload

```bash
npm run build:dist           # → dist/japanese-academy/ (the frontend is built first when needed)
npm run build:dist -- --no-audio   # an update without the 4,000 clips
```

`docs/kb/hosting.md` has the upload map, the first install through the setup
page, updates, and how the owner's data moves to the site.

## Conventions

- **Backend**: `declare(strict_types=1)`, plain functions named by area
  (`srs_…`, `exam_…`, `kanji_…`, `auth_…`), no classes but exceptions. Routes
  are Slim route files in `backend/api/routes/`, each address with somebody's
  data behind the same middleware (`data_route()`). Values in SQL are always
  `?` parameters. The code stays parseable by PHP 7.4 (the owner's editor
  checks with one); `backend/tests/unit/php74-syntax.test.php` checks it.
- **Frontend**: standalone components, `OnPush`, signals for state, no
  zone.js. Every component is three files — `.ts`, `.html`, `.scss` — never
  an inline template or style. Colours come only from the tokens in
  `frontend/src/styles/_tokens.scss`, each defined for light and dark; every
  screen works at phone width (390 px). The app talks to the backend through
  `ApiService` and the HTTP interceptor, which adds the sign-in's token to this
  site's `/api` and `/report` addresses only.
- **Migrations** are numbered SQL files in `backend/migrations/`; a committed
  one is never edited, and every one after 001 ends with `-- end of NNN`.
- The UI is in English, plain and short.
