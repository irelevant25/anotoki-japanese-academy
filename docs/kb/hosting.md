# Hosting: Japanese Academy as a website

The owner's shared hosting runs Apache, PHP 8.x and PostgreSQL, and allows
**no shell, no cron and no long-running process**: files go up by FTP or SFTP,
and PHP runs once per request. Everything here is built for that. The site is
meant for `https://japanese.anotoki.eu`, with sign-in through the anotoki IAM
([sign-in.md](sign-in.md)).

## How the same app runs under Apache

| On this computer | On a hosted site |
|---|---|
| `composer start` in `backend/`: PHP's built-in server, `router.php` as its router | Apache, the site's document root at `public/` (the built app, `index.php`, `.htaccess`): `.htaccess` sends `/api`, `/audio`, `/report` and `/setup.php` to `index.php`, and serves the app's files itself |
| both hand the request to the same front controller, `backend/api/front.php`, and the same Slim app | |
| the start-time work, lazily: nothing at start; the first request after the files changed rebuilds the study content, and a new migration waits for an ADMIN's Apply on the admin panel's Migrations page (a raw copy of every table and the library's backup of the whole database first); the day's first page load takes the day's backups; after an answer, at most hourly, the scrub of the accounts the IAM deleted | the same, after an upload (`backend/src/upkeep.php`, the library's `PeopleUpkeep` and `Backups`) |
| sign-in through the development IAM (`http://localhost:4300`) | sign-in through `https://iam.anotoki.eu`: the one way there is, on both |
| the setup page without a token (this computer) | the setup page with a token, which deletes itself when done |
| Composer's packages from `backend/vendor/` (committed) | the same folder, uploaded: there is no shell to install them |

The cheap part of the lazy work runs on every request: a stamp of the names,
sizes and times of the content files and the migrations, compared with the one
stored in `content_state.stamp` (migration 003). Only when they differ does a
request look further, under a PostgreSQL advisory lock, so two requests never
do the work twice. The stamp is taken before anything is read and stored with
what was done, so a file that lands while the work goes on leaves the stored
stamp behind the files, and the next request looks again. Once it has work
to do, the request asks for five minutes (`set_time_limit(300)`, where the
host allows it) and to finish even if the browser leaves
(`ignore_user_abort()`): cut off, the work would roll back and start again.

Where the site stands is the anotoki library's, as on every anotoki site
(since 2026-10-07; [architecture.md](architecture.md), *The Slim app*), and
`GET /api/site-status` says it to anybody, always. A site that was never set
up answers 503 `{"code": "not_set_up"}` to every other address (the pages
show the library's "This site is not set up yet", pointing at `/setup.php`)
instead of being set up by a passing request; once its setup page has
finished (`backend/storage/installed.lock`) nobody is pointed there again —
settings lost after that read "The site is not available right now". With
its settings but its database missing or out of reach, the site is
`unavailable`: the pages say it is not available right now and ask again
by themselves, and the addresses with data answer 503
`database_unavailable`. With its settings and a database without tables
(made again in the panel, say), every migration waits: the site is being
updated until an `ADMIN` applies them (below), or the setup page runs again.
Where the site stands is worked out for every request to the API, the
clips' included: a connection to the database, a look at its `migrations`
table and at `backend/migrations/` (with the database out of reach, a clip
waits for the connection's timeout, 5 s, before it is served).

**Every migration ends with the line `-- end of NNN`**, its own number
(`001_init.sql`, from before the rule, is exempt). An FTP upload writes a
file bit by bit, and a request could read half of one; without its last line
a migration is taken to be still arriving, and it waits, with every one after
it (`db_migration_ready()` in `backend/src/db.php`, the library engine's
`ready` hook) — and stops nothing meanwhile. Once the rest of the upload makes
it whole, it waits for an `ADMIN`'s **Apply pending** on the admin panel's
Migrations page (a request never applies one: the owner's decision of
2026-10-04), and the site tells everybody it is being updated: every address
but the few the pages need — to start, to sign somebody in, to reach that
page — answers 503 `update_pending` with `Retry-After: 60`, and the pages
show the library's "The site is being updated", with a quiet **Sign in**
while nobody is signed in, and for an `ADMIN` "A database update is waiting"
and the way to the Migrations page.

The raw copy of every table is taken once per upload, before the first
Apply (or the setup page's Save, or `manage.php --sync`): a migration that
fails rolls back whole, the Apply stops there and tells its `ADMIN` why, and
the next Apply tries it again without another full copy.
`backend/storage/backups/.before-migration-raw.json` notes the stamp and the
pending migrations the last copy was taken with (`.before-migration.json`
until 2026-10-11: that name is the library's note now, for its own backup
before an update, taken right after the raw copy; on a site that has the
old note, the library writes over it at its first Apply, and the raw copy
is taken once more - nothing else is lost); while both are the same,
the tries are of the same files on the same tables (nobody can study while a
migration waits), and the copy is still what the tables hold. Another upload
— the fixed file, or the failing one taken out and put back after the site
was used — changes the stamp and gets a copy of its own.

`public/.htaccess` (its source is `backend/public/.htaccess`):

- `CGIPassAuth On` (Apache 2.4.13+, inside `<IfModule mod_version.c>`) and
  `SetEnvIf Authorization …`: PHP under CGI or FastCGI does not see the
  `Authorization` header otherwise, and the sign-in token travels in it.
  Checked with a real Apache 2.4 and PHP over FastCGI: either line alone gets
  the token through; without both, every request is signed out.
- the rewrites: the backend's addresses (`/api`, `/audio`, `/report`,
  `/setup.php`) to `index.php`; a file of the app as it is; an address without
  a file extension (a page of the app, `/kanji/reviews`) to `index.html`,
  whose router draws it; anything else a 404.
- `X-Content-Type-Options: nosniff`; `index.html` asked for again each time
  (`no-cache`), and the build's hashed scripts and styles (`main-4GHK3Z7Q.js`)
  cached for a year, since they never change under that name. PHP's own
  server (`backend/api/front.php`) keeps the same rule, and the tests' router
  (`backend/tests/tools/front-controller.php`) sends these headers as Apache
  would, and refuses `.ht*` files as Apache's own configuration does.

It sets no `DirectoryIndex` and no `Options`: a host that does not allow those
in `.htaccess` would answer 500 for the whole site.

On a hosted site, errors reach the browser as a sentence only (the error log
has the details: a database error names the user and the host; the
admin panel's **Errors** page shows the library's own, redacted log of what
went wrong, in `backend/storage/logs/` - *Logs and backups on the site*,
below) - except why
the Migrations page's Apply stopped, which its ADMIN reads in PostgreSQL's
own words, as on the IAM's page (and the log has it too) - and
`/api/health` leaves out the database's name, the backup folder and the owner.

## The build — `backend/tools/build-dist.php`

`php backend/tools/build-dist.php` (on this computer, from the top folder:
`node backend/tools/php.js backend/tools/build-dist.php`) assembles exactly what to upload, in
`dist/japanese-academy/` (gitignored). It builds the frontend first when its
sources changed (`frontend/scripts/ensure-build.mjs`; `--frontend=DIR` takes
an app built elsewhere instead). It refuses to build (or list) while any
migration but 001 lacks its last line `-- end of NNN`, and names it: such a
draft would wait on the site, and the study content with it.
`--allow-draft=NAMES` is for the tests alone (`test_build()` in
`backend/tests/lib.php` passes the drafts the tests apply).

| Folder | What | On the host |
|---|---|---|
| `public/` | the built Angular app, `index.php` (the front controller) and `.htaccess` | **the document root**: point the (sub)domain here |
| `backend/` | `api/`, `src/`, `migrations/`, `vendor/`, `config/config.php` (no `*.local.php`), `setup.php`, `composer.json`/`.lock`; `data/`: what the study content is built from (the `backend/data/` files of `CONTENT_FILES`) and the clips `data/audio/*.mp3`; and an empty `storage/` (writable by PHP) for the daily copies and the library's backups (`storage/backups/`), the error log (`storage/logs/`), the IAM's keys and the library's stamps (`storage/cache/`), the library's key (`storage/anotoki-lib.key`) and the setup page's lock | beside `public/` |

Nothing else goes up beside `public/` (until 2026-10-04 the upload had
`data/` and `backups/` there too; see *Updates* for the one-time move on a
site that has them). `backend/` and `backend/storage/` each get a `.htaccess`
that refuses every request, in case the document root ends up above `public/`
after all. Left out: the tests and tools, `backend/router.php`,
`backend/manage.php` and `backend/translations.php` (they need a shell or a
computer; a site's words are reworded on its Translations page),
`backend/public/` (it became `public/`), the frontend's sources, `docs/`,
`books/`, backups, `.env`, every `*.local.php`, `node_modules/`, `.claude/`,
`backend/data/source/`, `grammar-index.json`. The build checks the result
against that list again (anything outside `public/` and `backend/` is
refused), checks that what a site needs is there, and parses every PHP file.

- `--no-audio` leaves out `backend/data/audio/`: for an update when no clip changed
  (an upload never deletes the clips already on the host).
- `--list` prints what would go in, copying nothing.
- `--out=DIR` builds elsewhere; DIR is emptied only if it is empty or an
  earlier build.

## The first install

1. In the hosting panel, make a PostgreSQL database and a user that owns it.
2. Build (above), then upload `dist/japanese-academy/` into the site's
   folder, and set the site's document root to its `public/`. Where the panel
   cannot do that - the owner's hosting serves each subdomain from its own
   folder, `sub/<name>/`, as it is - put this `.htaccess` at the top of the
   upload instead, beside `public/`:

   ```apache
   RewriteEngine On
   RewriteCond %{REQUEST_URI} !^/public/
   RewriteRule ^(.*)$ public/$1 [L]
   ```

   Every request is then served from `public/`, whose own `.htaccess` routes
   it, and the backend's addresses stay `/api/...`: `front.php` reads the
   address the browser asked for, which a rewrite leaves alone. `backend/`
   refuses requests by itself as well. The build
   leaves this file out and an update never deletes it, so it is written once,
   by hand; japanese.anotoki.eu runs this way.
3. Open `https://japanese.anotoki.eu/setup.php`. It writes a random token into
   `backend/config/setup-token.local.php`; download that file by FTP and paste
   the token into the form. (Nobody without FTP access to the server can read
   it: that is how the setup page knows it is the owner. The page never shows
   it.) Pasted, the token is checked at once (its **Check** button, pressed by
   itself; so it is when the field is left, and Enter in the field presses it
   rather than send the form; spaces around the token don't count). The
   page never shows what is saved, before the token or after: anybody can
   open it. The token file is written aside and renamed, and a form without
   the token never passes, whatever the file holds.
4. Fill in the database (the name `anotoki_japanese` and the port 5432 are
   filled in), and press its **Test connection**: it says, in the words every
   anotoki site's setup page uses, whether it connects and what **Save** would
   do there (make the tables, apply N updates, create the database, or nothing:
   up to date). Then the IAM's address
   (`https://iam.anotoki.eu`) and the client id (`japanese-academy`), and its
   **Test connection**: the IAM's discovery document must name that address,
   and its keys must be readable from the server. The buttons send the form's
   fields with the token, and change nothing.
   That is all it asks: no sign-in mode, no owner id (who may administer is a
   role at the IAM), no time zone, no backup (each person brings their own
   data in the app).
5. **Save**. It connects (and makes the database only if it is missing and
   the user may), writes `backend/config/database.local.php` and
   `auth.local.php` (the issuer, the client id; readable by their owner
   only), applies the migrations, builds the study content (a few seconds),
   checks that the server can fetch the IAM's keys, writes
   `backend/storage/installed.lock`, and deletes the token file and itself.

With the lock there, the setup page refuses to run again (and removes itself
if it was uploaded again). To run it on purpose, delete
`backend/storage/installed.lock` and upload `backend/setup.php` again; fill in
the settings again (it shows none of the saved ones; the password stays as
saved when left empty). Run again on a site in use, it
takes the same raw copy of every table as the Migrations page's Apply does
before it applies any new migration, under the same lock (never at the same
moment as an Apply), and it stops (to be sent again) while a migration is not
whole yet. A request that names a host other than 127.0.0.1 or localhost
always gets this way, even under PHP's built-in server.

## Updates

Build (or with `--no-audio`) and upload over the old files. The
upload never touches `backend/config/*.local.php` or `backend/storage/` on
the host, which the build doesn't contain (but its `.htaccess`). An update
with a new migration: once it is all there, the site says it is being
updated (503 `update_pending`; the anotoki library's page, with a quiet
**Sign in**, and for an `ADMIN` "A database update is waiting" and the way
on) until an `ADMIN` signs in, opens the admin panel's **Migrations** page and presses
**Apply pending** — after a raw copy of every table in
`backend/storage/backups/`, each file rolled back whole if it fails, which
stops the run there and names it. The first request after that (or after an
update without one) rebuilds the study content if `backend/data/` or its
builders changed. `backend/setup.php` may be left out of an update;
uploaded, it only removes itself.

**The update that brings the anotoki library** (2026-10-07) needs **PHP 8.2**
on the host (until then 8.1 did): check the PHP version in the hosting panel
before uploading it. It brings migration 008 (the words of the app's own "not
set up" page and of the problem page's link to the Migrations page go:
the library's page stands in for both), applied like any other.

**The update that brings the library's words** (anotoki-lib 0.3.0) brings 008
and 009 together, and after them the library's own two files
(`anotoki_translations/001_…`, `002_…`): all four wait for one **Apply
pending**, in that order. 009 copies the app's words for the top bar and the
switches - the site's own rewordings, every language - under the library's
keys before the library's 002 adds its words where a key has none, so the
bar says what it said. Before the upload:

- export every language on the Translations page all the same (a copy of the
  site's words in your hands). That copy has the keys of before 009: to
  import it after 009, give the nineteen keys 009 moved their new names (its
  list, `topbar.sections` → `anotoki.topbar.sections` …) and leave out the
  sixteen it deleted, or the import refuses the whole file (`unknown_key`);
- check that the website's database is UTF-8 (`SHOW server_encoding;` in the
  hosting panel's database tool says `UTF8`): the library's 001 stops on any
  other, and the site would stay "being updated" (the setup page and
  `db_create()` make UTF-8 databases; one made in a hosting panel may not
  be);
- upload `backend/vendor/` first: the new code needs the library's classes,
  and a request served between the two would fail.

**The update that brings the library's sign-in, people and admin tools**
(anotoki-lib 0.4.1) brings the library's `anotoki_admin` 001 and 002, this
app's 010 (final since 2026-10-11, on the owner's go), the library's
`anotoki_translations` 003 and 004 and its
`anotoki_people` 001 - one **Apply pending**, in that order, after the raw
copy and the library's first backup of the whole database. Before the
upload:

- upload `backend/vendor/` first, as before (the new code needs the
  library's `Auth`, `People` and admin tools classes); `backend/src/anotoki_iam.php`
  left on the host is read by nothing any more - delete it by FTP whenever
  you like;
- the browser keeps everybody signed in across it (the library reads the
  sessions where the IAM's SDK kept them);
- the old raw copy's note, `backend/storage/backups/.before-migration.json`,
  becomes the library's note at the first Apply (*How the same app runs
  under Apache*, above); every backup and log already there stays where it
  is.

**The update that brings anotoki-lib 0.5** (PHP 0.5.1, Angular 0.5.0)
brings no migration of this app's and none of the library's: on a site that
has the update of 0.4.1 above applied, nothing waits for an Apply (one that
has not gets that update's Apply with it). Its PHP half is 0.5.1, never 0.5.0
alone: 0.5.0's restore of a database that ever had a visitor failed whole
(`visitor_ids` counts down, and 0.5.0 set it past its last value). Before and
after the upload:

- the host's PHP needs `mbstring` (the library requires it now) and `zlib`
  (the backups), as every anotoki site's;
- upload `backend/vendor/` first, as before;
- **make a backup on the Backups page right after it** (**Back up now**):
  a backup is restored on the site only when it carries this installation's
  seal, and the plain ones made before 0.5.0 have none - they stay listed
  ("not made here") and download as before, and are restored offline alone
  (*Backups*, below). Nothing is public yet, so nothing is lost by it;
- where a request comes from changes: the site trusts Cloudflare's
  published ranges by default now (*Visitors on the site*, below) - a host
  that is not behind Cloudflare says so in `app.local.php`
  (`'client_address' => ['trusted_proxies' => []]`). An `app.local.php` that
  already lists Cloudflare's ranges by hand (as this page advised before)
  takes the committed list's place whole: take its `client_address` out, or
  a range left out there is an edge whose visitors all count as one. A
  `client_ip_header` there is read no more (the code pins Cloudflare's
  header), and a range wider than any proxy's is refused;
- the pages report their own errors to the error log from then on
  (`POST /api/client-errors`).

**The update that brings anotoki-lib PHP 0.5.2** (Angular still 0.5.0; the
owner's decision of 2026-10-13) brings no migration: the origin secret
(*Visitors on the site*, *The origin secret*, below). First the Cloudflare
zone's Transform Rule, then `backend/config/cloudflare.local.php` on the
site by FTP; without the file the site works as before.

**The update that brings anotoki-lib 0.6.2** (both halves; 2026-10-18)
brings, once its draft is final, migration **011** of this app's (the legal
pages' words, the questions' and notices' titles and buttons; rewordings
only of strings nobody changed) and the library's
`anotoki_translations/005_…` to `011_…` (its legal pages', top bar's and
newer pieces' words, two sentences of the Privacy page made true), all in
one Apply on the Migrations page after the upload - `backend/vendor/` first,
as ever. Until it is applied, Terms, Privacy and Contact read the library's
built-in English and Slovak around keys of the app's own (the Privacy
page's parts would show as keys), so apply it right after the upload. Also
with it: every hand-written settings file is read cleanly or not at all -
check after the upload that the site is not "not set up" because of a file
saved with a byte-order mark (`manage.php --check`, or the setup page on
this computer, names it; on the site, PHP's error log does, once a day) -,
a `cloudflare.local.php` that cannot be read cleanly counts as a secret no
request carries (*The origin secret*, below), and the app's own JSON copies
are written for the site's user alone (0600; the ones already there keep
their mode until they rotate out).

### The one-time move of `data/` and `backups/` (the update of 2026-10)

A site set up before 2026-10-04 has `data/` and `backups/` beside `public/`
and `backend/`; this version reads the study content from `backend/data/`
and keeps the backups in `backend/storage/backups/`. Update it in this
order, so the old code never runs against moved files, and so no backup is
lost:

1. **Upload the build** made with `--no-audio` (it brings the content files,
   `backend/data/*.json` and the hand-written items, so the new code finds
   them; the 4,000 clips are already on the server). The first request
   rebuilds the study content from the new paths; only the clips 404 for the
   few minutes until step 2.
2. **Move the clips on the server**: rename (move) `data/audio/` to
   `backend/data/audio/` in the FTP client, a server-side move, nothing sent
   again.
3. **Move the backups**: every file of `backups/` into
   `backend/storage/backups/` (make that folder if the upload did not),
   `.before-migration.json` included (a dotfile: make the FTP client show
   hidden files). Download a copy of them first, and check the count after.
   The site may have written into the new folder since step 1 (the day's
   copy, a raw copy and its note): a file of the same name already there is
   the newer one, keep it and drop the old.
4. **Delete the old folders**: the root `data/` (by then only its
   `.htaccess`, `vocab.json` and the rest of the old content files) and the
   empty `backups/`.
5. **Open the site**, sign in as an `ADMIN`, apply the migrations of this
   version on the Migrations page (after a raw copy of every table), then
   check the home page and an answer: the content is current
   (`/api/health` says `contentCurrent: true`).

Only then IAM migration 007 (it removes the role `MEMBER`; this version
already welcomes a token with no role).

**The IAM's "Sign-in required" switch (IAM migration 010).** IAM 010 gives
every account `MEMBER` again; this site takes a token with it as an ordinary
learner, so the two may go live in either order. The site reads the switch
from the IAM (`GET {issuer}/api/public/applications/japanese-academy`, an
outbound HTTPS request like the one for the keys, at most once a minute,
waiting at most 2 s; [sign-in.md](sign-in.md), *Is sign-in required here?*)
and keeps the answer in `backend/storage/cache/`, which must stay writable by
PHP (otherwise it asks on every request and says so in the error log). Before
IAM 010 that address is a 404, which means "required": nothing changes. And
while the database cannot keep visitors (migration 007 not applied yet: it
waits for an ADMIN's Apply after the upload) the site requires sign-in
whatever the switch says (*Visitors on the site*, below).

Mid-upload, a request can see new code with old files or the other way round;
it fails, and a later one does the work once everything is there. A migration
that is only half there waits for its last line (above). A paper started
before the content changed can't be submitted afterwards (409), as on this
computer after a data change. A browser that still has the old app open loads the
new one at its next page load (`index.html` is never cached).

**The app's words (migration 004, and every later one with strings).** 004
makes the three translation tables and fills them; it changes no study table.
On a site it is applied like any migration: by an `ADMIN`'s Apply on the
Migrations page, under the upkeep lock, after the raw copy of every table. While its
file is still arriving (no `-- end of 004` yet) the bundle of words,
`/api/translations/{code}`, answers 503 `translations_unavailable` (the
anotoki library's answer since 0.3.0; `not_up_to_date` before) and logs nothing,
and a page that starts then shows the problem page ("The database is not up
to date with this version of the app yet: …"); once the upload is whole it
waits for the Apply like any migration (the bundle still says
`translations_unavailable`, but the library's page stands in, in its own words). Strings the owner reworded
on the site survive later migrations — a migration's insert steps aside for
a row that is there —, but the site and this computer each hold their own
strings: export the site's languages (the Translations page) before an upload
that changes strings, all the same, and carry a change from one copy to the
other by export and import.

## Visitors on the site

**The update that brings them** (2026-10-05): upload, then an `ADMIN` applies
**006 and 007** on the Migrations page (006 too when the site has not got it
yet; the page lists what waits, in order, and takes the raw copy first). 007
adds the visitors' columns and their words and changes no row of anybody's.
Nothing else changes that day: the site requires sign-in until IAM 010 is
live **and** the owner unticks "Sign-in required" for Japanese Academy in the
IAM (the two in either order; before IAM 010 the IAM's answer is a 404,
which means required).

Once migration 007 is applied and the owner turns "Sign-in required" off for
Japanese Academy in the IAM, people may study without signing in
([sign-in.md](sign-in.md), *Visitors*). Nothing to set up for it: every
number has a default. To change one, put a `backend/config/app.local.php` on
the site by FTP (optional, gitignored, never written by the setup page; a
copy from before 2026-10-04 may still hold an old `'timezone'`, which is
ignored):

```php
<?php
return [
    'visitors' => [
        'keep_days' => 30,                 // unseen this long: deleted with all of their data
        'max' => 300,                      // visitors at once; full, NEW visitors get 429 too_many_visitors
        'new_per_hour_per_address' => 10,  // an IPv6 address counts by its /64
        'new_per_hour' => 60,              // from all addresses
        'max_attempts' => 10,              // exam attempts one visitor keeps
        'max_answers' => 20000,            // lines of one visitor's answer log
    ],
    // Only on a host that is NOT behind Cloudflare (or behind another proxy):
    // the proxies whose CF-Connecting-IP names the visitor's address, in the
    // place of Cloudflare's ranges - [] believes nobody (REMOTE_ADDR alone);
    // a range wider than /8 (IPv4) or /16 (IPv6) is refused. The header is no
    // setting: the code pins Cloudflare's.
    'client_address' => [
        'trusted_proxies' => [],
    ],
];
```

**Where a request comes from** (the owner's rule of 2026-10-11, every anotoki
site's; anotoki-lib 0.5's `Support\ClientAddress`): the site is behind
Cloudflare, so every request reaches PHP from one of Cloudflare's addresses.
The committed default (`CLIENT_ADDRESS_DEFAULTS` in
`backend/config/config.php`) trusts Cloudflare's published ranges
(https://www.cloudflare.com/ips-v4 and /ips-v6, as of 2026-10-11 - the
library's `ClientAddress::CLOUDFLARE`, which a test holds the list equal to),
and believes Cloudflare's `CF-Connecting-IP` - one address - on a connection
from one of them alone; from anywhere else the connection's own address
counts. The header is pinned in the code: `X-Real-IP`, `True-Client-IP` and
`X-Forwarded-For` - which Cloudflare passes on as the visitor wrote them -
are never read, and no setting can point at one. A range in `app.local.php`
wider than any proxy's (an IPv4 prefix shorter than /8, an IPv6 one shorter
than /16: `0.0.0.0/0`, `::/0`) is refused, never believed - said in PHP's
error log once a day until the setting is fixed (every request, until
2026-10-18: a log that filled with it). The visitors' limits, the feedback's limits and the error
log's client hash all count the visitor's address bucket so (an IPv6 address
by its /64), and keep a keyed HMAC of it, never the address: a stable
pseudonym for as long as its key lasts - whoever holds the key can test an
address against it, so the key stays as private as the storage folder.
Cloudflare's ranges change rarely: when Cloudflare announces a change,
refresh the list in `config.php` (and the library's, in a release).
`app.local.php` names others only for a host that is not behind Cloudflare
(above).

**The origin secret** (anotoki-lib PHP 0.5.2, the owner's decision of
2026-10-13): Cloudflare's ranges are every Cloudflare customer's, not the
owner's zone alone - anybody's Worker can open a connection to the site from
them and write the `CF-Connecting-IP` it likes, a new address every time,
past every limit here. So the owner's zone adds a secret header to every
request through it, and the site believes `CF-Connecting-IP` only on a
request that carries it; any other request from Cloudflare counts as the
edge it came from (coarser - a Worker's made-up visitors share one bucket -
never looser). The same value in two places, a long random value of 32
characters or more:

- **Cloudflare**: Rules → Transform Rules → Modify Request Header → "Set
  static" `X-Anotoki-Origin` to the secret, for every request of the zone
  (one rule serves every anotoki site).
- **The site**: `backend/config/cloudflare.local.php`, put there by FTP
  (optional, gitignored, never asked for, written or shown by the setup page, never in
  the build) - the same file in every anotoki site:

  ```php
  <?php
  return ['origin_secret' => '<the same long random value>'];
  ```

Set the rule first - a site without the file pays the header no heed - then
the file: the other way round, every visitor counts as their edge until the
rule is there; changing the secret, likewise. Without the file, or with one
read cleanly whose value is not a string with something in it, the site
believes `CF-Connecting-IP` from the trusted proxies alone, as before. **A
file there that cannot be read cleanly fails closed** (since 2026-10-18, the
IAM's rule case for case): one that prints anything as PHP reads it - a
byte-order mark or a line before its `<?php`, no `<?php` line, text after a
closing tag - or that PHP cannot open, parse or run stands for a secret no
request carries, so every request from Cloudflare's ranges counts as the
edge it came from until it is mended; the site keeps running, and it is
never a reason for "not set up". PHP's error log says so at most once a day
(`[config] backend/config/cloudflare.local.php prints N bytes of its own
(…): no request carries its secret …`, or `cannot be read (…)`: its fault
and byte count or its error's kind and line, never its contents). The
secret is never shown or logged; keep a copy off the server, with the other
settings.

`backend/storage/cache/` holds the visitors' address secret
(`visitor-address.key`, made the first time; losing it only restarts the
hour's counts) and the sweep's stamp: it must stay writable by PHP, as for
the IAM's keys. Under Apache an `X-Visitor-Key` header reaches PHP as it is
(no rewrite needed, unlike `Authorization`); check it once on the host when
the switch is first turned off (a visitor's second page shows their progress).
A signed-in person's request always leaves the browser with its token - it
never sends one of theirs without it (docs/kb/sign-in.md, *Visitors in the
browser*) - but the server only sees what the host passes on. A host that
dropped `Authorization` answers them 401 only while sign-in is required;
**with the switch off it makes each signed-in save a new visitor's** (200 and
an `X-Visitor-Key`), kept under a key nobody holds and swept after 30 days.
The browser refuses such an answer (a person's request answered with a key
fails as `server_error`: the page says it was not saved, the key is not
kept), so nothing is lost silently - but nothing is saved either. Check it
once on the host with the switch off: sign in, answer one lesson card; the
answer (the browser's network tab) carries no `X-Visitor-Key`, no error is
shown, and the item shows in the account after a reload.

**How much room.** Measured on 2026-10-05: an exam attempt of 100 questions
is about 25 KB of attempt and 67 KB of report (about 18 KB stored, as
PostgreSQL compresses them), the largest paper (1,200 questions) 258 KB and
611 KB (about 130 KB stored); a line of the answer log about 120 bytes. So
one visitor at both caps keeps at most about 4 MB on disk (10 of the largest
attempts, 20,000 answers, their items), and 300 of them about 1.2 GB - a
worst case nobody reaches by studying, but somebody could on purpose. Lower
`max_attempts`, `max_answers` or `max` when the host's database is small.

**Watching it.** The People page's line about the visitors (ADMIN; the
`visitors` of `GET /api/admin/people`, until 2026-10-11 `GET
/api/admin/visitors`) says how many visitors there are and the longest unseen;
`manage.php --check` counts them. Somebody who makes visitors from many
addresses (10 an hour from each) can fill the 300 in hours, and they then
stay for their 30 days: new visitors are refused (people who sign in never
are) until the sweep deletes them. There is no earlier sweep of visitors who
never came back (the notice promises 30 days); if it happens, lower
`keep_days` or raise `max` for a while, or require sign-in again (the
visitors' keys then open nothing, and their data waits for its 30 days).

## Moving somebody's data to the site

The setup page brings nobody's data in any more. Each person's data is under
their IAM user id; the owner's is user 1, on their computer and at
`iam.anotoki.eu` alike. Each person moves their own: on the computer they
download their data file (`GET /api/me/data`), on the site they bring it
back (`PUT /api/me/data`), which replaces what they have there after a copy
of it in the site's backups ([architecture.md](architecture.md), *Your own
data*; the pages for it come with the frontend's change). A file of another
copy of the app may carry another user id: it goes into the account of
whoever brings it.

How big a file the site takes is a 24th of PHP's `memory_limit` (at most
16 MiB): about 5.3 MiB with the usual 128 MB. A bigger one is refused with
413 `too_large` and the limit, and changes nothing; raising `memory_limit` in
the hosting panel raises it. `post_max_size` does not count (the file is the
body of a PUT, not a form). The owner's whole backup was 117 KB on 2026-10-01.

A backup goes back on a computer with `php backend/manage.php
--restore=FILE` (a backup of everybody, or a copy of some people's data
alone, which replaces only theirs). Version 1 files, from before user ids,
are no longer read: every backup there is is version 2.

## Backups on the site

The same files as on this computer, in the site's `backend/storage/backups/`: the day's copy
(of everybody's data, taken at the first page load of a UTC day; the last 14
kept; every date and time in a backup's name is UTC), one of a person's data
alone before their reset, before they bring a file back and before an
administrator deletes their data, and before what they studied without
signing in moves into their account (`academy-before-reset-user-<id>-<time>.json`,
`…-before-import-…`, `…-before-delete-…`, `…-before-move-…`; their last 14 of
each kept; never a visitor's data, which is in none of these copies), a raw
copy before a migration, and the strings of a language the owner deleted
(`academy-before-language-delete-<code>-<time>.json`). A copy of everybody
also holds the app's words as the owner reworded them (`translations`); a
restore passes them over, and on a computer `php backend/translations.php
--import <code> <file>` takes a language's strings from it. Each is written
for the site's user alone (0600, in a folder made 0700, since 2026-10-18).
Download them by
FTP now and then: they are the only copy outside the host's database. They do
not restore on the site; one restores on a computer with
`php backend/manage.php --restore=FILE`.

## Logs and backups on the site (the anotoki library's)

Since anotoki-lib 0.4.0 (2026-10-11) the site also keeps the library's admin
tools, the same on every anotoki site and the site's `ADMIN`'s alone
([architecture.md](architecture.md), *The admin tools*):

- **The error log**: `backend/storage/logs/errors-<UTC day>.jsonl`, one line
  for each thing that went wrong (a 5xx - but a 503 that only says a state:
  being updated, not set up -, a 404, 405, 413, 415 or 429 answered, PHP's
  warnings and fatal errors), redacted - never a header, a body, a query
  string or a token; a keyed hash of the address bucket, never the address,
  and the person's id on the admin tools' own routes and on a page's report
  (elsewhere none: those lines are written before who is asking is known).
  Since anotoki-lib
  0.5.0 also **the pages' own errors** (`source: client`): the browser
  reports each error a page meets, scrubbed, to `POST /api/client-errors` -
  20 an hour from one sender, 500 a day from the visitors and as many from
  the people signed in. Files, so it is written while the database is down
  too. Read and cleared on the admin panel's **Errors** page. The library
  keeps 30 days of it, 64 MB at most. PHP's own error log, the host's, goes
  on beside it.
- **The audit log** (the table `anotoki_audit_log`): who did what in the
  admin panel; read on **Audit log**; kept.
- **Feedback** (the table `anotoki_feedback`): the messages sent with **Send
  feedback** at the foot of every page; read on **Feedback**. No mail is
  sent: the admin panel's bar counts the new ones beside the link.
- **The library's backups of the whole database**:
  `backend/storage/backups/<id>.anotoki-backup` with its `.json` beside, beside
  the app's own copies above: one a day (asked for by the day's first page
  load, made after its answer), one before every update (the Apply's, right
  after the app's raw copy), one before a restore, and the `ADMIN`'s own
  (**Back up now**). The **Backups** page lists them, downloads one (a
  single-use link), deletes one, and restores one in place (where the
  database's schema is the backup's; the audit log and the bookkeeping stay,
  and so do the app's own copies) - each of those after a sign-in of the last
  ten minutes (**Sign in again** asks the IAM for the password). **How many
  are kept is the library's rotation by number**: the last 14 daily ones, 5
  made before an update, 5 before a restore, and the `ADMIN`'s own until the
  owner deletes them on the Backups page; none is deleted for its age (the
  owner's decision of 2026-10-11, for every anotoki site: [decisions.md](decisions.md)).
  Each is about the size of the database: watch the host's disk quota, and
  delete the `ADMIN`'s own old ones there. A person whose anotoki account the
  IAM deleted stays in a backup made before, until it rotates out or the
  owner deletes it. A restore does again, before anybody sees its data, what
  an `ADMIN` deleted after the backup was made - a person's data on the
  People page, a feedback message - (anotoki-lib 0.5.0), and then runs the
  scrub of the IAM's deleted accounts at once (when the IAM cannot be
  reached, the page says so, and the next request tries again).
  **Only a backup made by this site is restored on its page** (anotoki-lib
  0.5.0): each carries the installation's seal - an HMAC of its id and its
  SHA-256 under a key derived from `backend/storage/anotoki-lib.key` - and a
  restore reads the very bytes it checks. One without the seal - **every
  plain backup made before 0.5.0**, a file copied in from elsewhere or
  changed since - is listed "not made here" and refused (`archive_invalid`);
  it is still downloaded as before, and restored **offline**: on a computer,
  `tail -n +3 <id>.anotoki-backup | tar -xz` unpacks its `manifest.json`,
  the schema's files and each table's rows (`data/NNN-<table>.copy`, COPY's
  text format), which `psql`'s `\copy` loads into a database of the same
  schema (the library's README, "Backups"). **A restore by hand does nothing
  again**: what was deleted on the People page or in the feedback since the
  backup comes back with it, no scrub of the IAM's deleted accounts runs, and
  the archive's own `anotoki_audit_log` - which a restore on the page leaves
  alone - would put back the older log, the very record those deletes are
  done again by. So load it into another database and move over only what is
  needed; or, putting it in place, keep the live `anotoki_audit_log` (skip its
  file), do again by hand every `person.data_deleted` and `feedback.deleted`
  the log holds from the backup's time on, and press **Check now** on the
  People page. Make a backup right after the update to 0.5.0, so a sealed one
  is there. The seal keeps out a file put
  into the folder by somebody who cannot reach that key - not somebody who
  can write the whole storage folder. Every file of the backups is the site's
  own user's alone (`0600`) from the moment it is made, every folder `0700`:
  where PHP runs as the web server's user and not the FTP account's, the FTP
  account cannot read them - download them from the Backups page.

Nothing of this deletes a file that was there before it: the app's own JSON
copies keep their own rule (the last 14 days', each person's last 14 of each
kind), and backups or logs already on a host stay where they are, for the
owner to remove. Every folder the library writes is guarded by a deny-all
`.htaccess`, in case the document root ends up above `public/`.

**The scrub of the IAM's deleted accounts** needs the same outbound HTTPS as
the sign-in's keys: at most once an hour, after an answer, the site asks
`{issuer}/api/public/anonymized-accounts` and blanks who each deleted
account was here ([sign-in.md](sign-in.md), *Accounts the IAM deleted*). The
People page says when it last asked, and why it stopped if it did; **Check
now** asks at once.

**The update that brings anotoki-lib 0.4** asks for one Apply that runs, in
order, the library's `anotoki_admin/001_audit_log.sql` and
`002_feedback.sql`, this app's `010_people_and_signing_in.sql`, the
library's `anotoki_translations/003_sign_in_words.sql` and
`004_feedback_words.sql`, and `anotoki_people/001_people.sql` - with the raw
copy and the library's backup before it - on the owner's own computer as on
the site, once 010 is final (since 2026-10-11, the owner's go). While a
migration of this site's own is a draft, `build-dist.php` refuses to build
the upload, and a server of anybody's waits with it for every one of the
library's files too, the `anotoki_admin` ones that run before it included
(`db_migration_ready()`: while one of this site's own files is a draft, the
library's files wait on every database but the tests'): so nothing of a
change - not even the library's tables - is applied before the owner
accepts it, and the study pages keep working meanwhile.

## If something is wrong

| Symptom | Likely cause |
|---|---|
| 500 for every address right after the upload | the host does not allow `CGIPassAuth` in `.htaccess`: delete that `<IfModule mod_version.c>` block (the `SetEnvIf` line is the fallback) |
| every API request is 401 while signed in | the `Authorization` header does not reach PHP: the host dropped both `.htaccess` lines |
| "Sign in again" right after signing in | the server cannot fetch the IAM's keys (outbound HTTPS blocked?), or the issuer or client id in `backend/config/auth.local.php` is not the IAM's |
| the page says "This site is not set up yet" | the setup page has not run: `backend/config/*.local.php` are missing |
| the page says "The site is not available right now", and asks again by itself | the settings are there, but the database they name is missing or does not answer (made again in the panel, say: run the setup page again — delete `backend/storage/installed.lock` and upload `backend/setup.php` first); or the site was installed and a settings file is gone since |
| the page says "The site is being updated" | a migration waits for an `ADMIN` (a database without tables counts too): sign in as one (the page's quiet **Sign in**), follow **Open Migrations**, and **Apply pending** |
| Apply says "Stopped at NNN_….sql" | that migration failed and was rolled back whole (the ones before it stay applied); the box under it says why, in PostgreSQL's own words, and the error log has it too (`[upkeep] a migration failed: backend/migrations/NNN_….sql: …`). Upload the fixed file and Apply again; the raw copy is taken again only when the files changed |
| Apply says another database update is running (409) | another Apply, the setup page, `manage.php` or the content's rebuild after an upload holds the lock (Apply does not wait for it): let that one finish, then Apply again |
| after an Apply the list still shows a "draft" | the files before it are applied; that one has no last line yet (still uploading): upload it whole, then Apply again |
| a new migration is listed as a "draft" ("it does not run until it is finished"), and Apply stays off | its last line, `-- end of NNN`, is missing: it is taken to be still uploading |
| the Backups page offers **Sign in again** instead of making, downloading, deleting or restoring | each of those wants a sign-in of the last ten minutes (the token's `auth_time`): sign in again there, and the IAM asks for the password |
| the People page says not everything it needs is in the database yet | migration 010 or the library's `anotoki_people/001` has not been applied: **Apply pending** on the Migrations page (while a migration of this site's own is a draft, they wait with it) |
| the People page says the last check of the IAM's deleted accounts stopped | the server could not ask the IAM (outbound HTTPS blocked, the IAM away): it asks again within the hour; **Check now** tries at once |
| the page shows a key (`home.intro`) instead of words | a key the frontend asks for has no string in this database: `php backend/translations.php --status` on a computer lists them; a migration adds the string |
| the page says "This site is not set up yet" on a copy that was set up long ago | `backend/config/auth.local.php` was written for the sign-in mode `none`, which is gone (`php backend/manage.php --check` says "sign-in without the IAM is gone"): run the setup page and save |
| the app shows, `/api/...` answers 404 | `mod_rewrite` is off, or the document root is not `public/` |
| right after the update of 2026-10 the listening questions are silent and `/audio/...` answers 404 | the clips are still in the old `data/audio/`: move them to `backend/data/audio/` (*Updates*, the one-time move) |
| a page's address (`/kanji/reviews`) answers 404 on reload | `mod_rewrite` is off: the app's own addresses need the `index.html` rewrite |
