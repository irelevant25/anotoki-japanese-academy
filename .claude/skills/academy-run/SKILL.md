---
name: academy-run
description: Start, stop or health-check Japanese Academy — the owner's own backend on port 8200 (composer start; their database, sign-in through the development IAM), the Angular dev server on 4400, or a throwaway server on 8590 with its own database and settings, signing in through a test IAM. Use after changing backend/ (its code, data or migrations) or frontend/, when a port is busy, or to try something by hand.
---

# Running Japanese Academy

There are two kinds of server. Never mix them up.

| | The owner's | Throwaway |
|---|---|---|
| Port | 8200 (`composer start` in `backend/`) | 8590 (8590-8599; never 4200-4700 or 8000-8500, the anotoki sites' own) |
| Data | the database of `backend/config/database.local.php` and `backend/storage/backups/`: on the owner's PC their real data | its own database `academy_test_manual`, copied from the test template, a temp backup folder, and settings of its own |
| Sign-in | the IAM of the setup page: the development IAM (http://localhost:4300) on a computer, which must be running | through the test IAM: a key pair of your own (below) |
| For | the owner's daily study | trying things by hand: lessons, reviews, exam submits, signing in |

Never take lessons, answer reviews or submit exams on the owner's server.
Doing so changes their progress and history. (The website, a hosted copy, is
never run from here: see the `academy-deploy` skill.)

**PHP:** Git Bash's `php` is 7.4 on the owner's computer, which the app
refuses. `backend/tools/php.js` finds a PHP 8.2+ (or set `ACADEMY_PHP`);
below it is `$PHP`:

```bash
PHP="$(node -e "console.log(require('./backend/tools/php.js').findPhp())")"
```

**The app** is the Angular build in `frontend/dist/japanese-academy/browser/`,
which the backend serves. `node frontend/scripts/ensure-build.mjs` makes it
when its sources changed; the browser suites' documented commands run it
first. Without a build, pages say how to make it (the API answers all the
same).

## The owner's backend (port 8200)

The owner starts it themselves, the way every anotoki backend starts:
`composer start` in `backend/`, which runs `php -S localhost:8200
router.php` with the PHP first on their PATH, beside `npm start` in
`frontend/` (port 4400). Start or stop it only when the owner asks, and
leave it as you found it.

**Nothing happens at start** (`backend/router.php`): no checks, no summary.
The first request after a change to `backend/data/` rebuilds the catalog and
the question bank (~3 s); the day's first page load takes the day's backup.
A new migration is never applied by a request: once it is whole, the pages
show the anotoki library's "The site is being updated" (an `ADMIN`: "A
database update is waiting", and the way on; anybody signed out: a quiet
Sign in) until an `ADMIN` presses **Apply pending**
on the admin panel's Migrations page (`/admin/migrations`, a raw copy of every
table first) or `manage.php --sync` runs; `GET /api/site-status` says where
the site stands. So **no change ever needs a
restart**: PHP's built-in server reads the PHP code again on every request,
and the next request picks up data. For the frontend, build it again and
reload the page — or work at the dev server (below). If the question bank
changed, an exam paper started before can't be submitted after it (409).

Check it's answering, and that it is the database you expect:

```bash
curl -s localhost:8200/api/health; echo
node backend/tools/php.js backend/manage.php --check
```

On the owner's PC `/api/health` names their database (`anotoki_japanese_academy`;
their data is user 1's, their user id at the IAM), and `--check` says whether
anything waits (a migration, a content rebuild) and the counts. Every address
with data answers 401 without a token, from this computer too: the pages sign
in through the IAM, at http://localhost:4400 (the address the IAM knows).

**On a PC without the owner's database** (their real data is on their home
PC), there is no owner's server: their database does not exist there, and
nothing may create it. A developer's copy there has settings of its own (a
database like `anotoki_japanese` or `academy_dev`, never
`anotoki_japanese_academy`) — or none: then use the throwaway server
(below).

"Failed to listen on localhost:8200" means something already listens there.
To see what, use the PowerShell tool (`pkill` can't see Windows processes):

```powershell
Get-NetTCPConnection -LocalPort 8200 -State Listen | ForEach-Object { Get-CimInstance Win32_Process -Filter "ProcessId = $($_.OwningProcess)" } | Select-Object ProcessId, CommandLine
```

A `php -S localhost:8200 router.php` there is the owner's: leave it.

## The Angular dev server (port 4400)

While you change the frontend: `npm start` in `frontend/` (Bash tool,
`run_in_background: true`) runs `ng serve` on http://localhost:4400,
rebuilding as files are saved (the owner's script; check theirs first — 4400
may already be theirs). It sends `/api`, `/audio`, `/report` and
`/setup.php` to localhost:8200 (`frontend/proxy.conf.json`), so a backend must
run there — the owner's, or on a PC without their data a developer's copy.
Stop one you started by its port (4400), the whole tree: `ng serve` runs
under npm (`taskkill /PID <pid> /T /F`).

## The throwaway server (port 8590, its own database)

Make its database (a copy of the test template, which the first command brings
up to date), the test IAM's keys, and its settings folder (for that database
only, signing in through those keys), then run PHP's built-in server with
`backend/router.php` as its router, in the background (Bash tool,
`run_in_background: true`), from the repository's top folder:

```bash
"$PHP" backend/tests/tools/testdb.php template
"$PHP" backend/tests/tools/testdb.php create academy_test_manual
CONF="$(node -e "console.log(require('os').tmpdir().replace(/\\\\/g,'/'))")/academy-test-config-manual"
KEYS="$TEMP/academy-manual-iam"; mkdir -p "$KEYS"
"$PHP" backend/tests/tools/iam.php keys "$KEYS"
"$PHP" backend/tests/tools/testdb.php config "$CONF" academy_test_manual "$KEYS/jwks.json" "$TEMP/academy-manual" "$PWD/frontend/dist/japanese-academy/browser"
ACADEMY_CONFIG_DIR="$CONF" "$PHP" -d opcache.enable=0 -S 127.0.0.1:8590 -t backend backend/router.php
```

`curl -s 127.0.0.1:8590/api/health` must say `"database":"academy_test_manual"`
before you use it. (The app honours a settings folder in `ACADEMY_CONFIG_DIR`
only for an `academy_test_…` database, and refuses to start with one that
names any other.) The first request with data does its start-time work. Stop
it by its port with the PowerShell tool:

```powershell
Get-NetTCPConnection -LocalPort 8590 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force }
```

then drop its database and remove the folders:

```bash
"$PHP" backend/tests/tools/testdb.php drop academy_test_manual
rm -rf "$CONF" "$TEMP/academy-manual" "$KEYS"
```

To make its reviews due, change its database (`testdb.php` only ever touches
`academy_test_…` databases):

```bash
"$PHP" backend/tests/tools/testdb.php sql academy_test_manual "UPDATE srs_progress SET next_review = now() - interval '1 minute' WHERE stage BETWEEN 1 AND 8"
```

### Signing in, through the test IAM

Never start the IAM for this, and never use a real one. The tests' IAM is the
key pair made above (`$KEYS`), whose public half the server reads from a file
its settings name. A token for user 42
(from Node: `execFileSync` quotes the JSON right, a shell may not), then a
request with it:

```bash
export PHP KEYS
node -e "const {execFileSync}=require('child_process');const n=Math.floor(Date.now()/1000);console.log(execFileSync(process.env.PHP,['backend/tests/tools/iam.php','token',process.env.KEYS,JSON.stringify({iss:'https://iam.test',sub:'42',aud:'japanese-academy',iat:n,exp:n+3600,roles:[],preferred_username:'tester'})]).toString().trim())" > "$KEYS/token"
curl -s -H "Authorization: Bearer $(cat "$KEYS/token")" 127.0.0.1:8590/api/kanji/summary | head -c 200; echo
```

(`roles:['EDITOR']` or `['ADMIN']` for the admin panel, none for a learner.)
To give that person some progress, post to the API from Node with the token
(Git Bash `curl` can mangle Japanese in arguments):

```bash
node -e "const t=require('fs').readFileSync(process.env.KEYS+'/token','utf8').trim();(async()=>{for(const id of ['k:一','k:二','k:大'])console.log(id,(await fetch('http://127.0.0.1:8590/api/kanji/learn',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+t},body:JSON.stringify({id})})).status)})()"
```

For a sign-in by redirect, the stand-in IAM
(`backend/tests/tools/stand-in-iam.php`, `STAND_IN_DIR="$KEYS"`, its header
says how) signs the configured person in at once. In a browser, any page of
such a server goes straight to its issuer (`https://iam.test`, which exists
nowhere): to sign in by hand, start a stand-in IAM on 8590-8599 with
`STAND_IN_DIR="$KEYS"` and write the settings with its address as the
issuer (`testdb.php config DIR NAME JWKS BACKUPS FRONTEND ISSUER`), as
`startApp()` in `frontend/e2e/helpers.js` does. Delete `$KEYS` when you're
done. To study there as a visitor (sign-in not required), tell that stand-in
`curl -X POST <its address>/_test/state -d '{"login_required": false}'` and
give the settings an eighth argument, the seconds the server keeps the IAM's
answer (`… FRONTEND ISSUER 1`; 60 otherwise); a page loaded after that is a
visitor's (`docs/kb/sign-in.md`, *Visitors*).

Never point a settings folder at the owner's database, and never run a
command that changes a database outside the test tools or a throwaway
server's settings: without them, a PHP process uses this copy's own settings
— on the owner's PC, their real data.
