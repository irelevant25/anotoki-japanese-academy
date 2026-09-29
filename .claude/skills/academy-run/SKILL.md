---
name: academy-run
description: Start, stop, restart or health-check Japanese Academy — the owner's own server on port 8200 (their database, no sign-in), the Angular dev server on 4400, or a throwaway server with its own database and settings, with or without sign-in through a test IAM. Use after changing backend/, frontend/, data/ or the migrations, when a port is busy, or to try something by hand.
---

# Running Japanese Academy

There are two kinds of server. Never mix them up.

| | The owner's | Throwaway |
|---|---|---|
| Port | 8200 | 8300 (or any free port) |
| Data | the database of `backend/config/database.local.php` and `backups/`: on the owner's PC their real data | its own database `academy_test_manual`, copied from the test template, a temp backup folder, and settings of its own |
| Sign-in | as the setup page set it: off (auth mode `none`) on the owner's PC, every request the owner | off, or on through the test IAM (below) |
| For | the owner's daily study | trying things by hand: lessons, reviews, exam submits, signing in |

Never take lessons, answer reviews or submit exams on the owner's server.
Doing so changes their progress and history. (The website, a hosted copy, is
never run from here: see the `academy-deploy` skill.)

**PHP:** the npm scripts find a PHP that can run the app (`backend/tools/php.js`),
even where `php` on PATH is an old one. By hand, use that PHP (or set
`ACADEMY_PHP`); below it is `$PHP`:

```bash
PHP="$(node -e "console.log(require('./backend/tools/php.js').findPhp())")"
```

**The app** is the Angular build in `frontend/dist/japanese-academy/browser/`,
which the backend serves. `npm run build:frontend` makes it when its sources
changed; the launchers and the browser suites do too. Without a build, pages
say how to make it (the API answers all the same).

## The owner's server (port 8200)

The owner starts it with `start.ps1` (Windows) or `start.sh`, which also find
PHP and Node, build the app when needed and open the browser — the setup page
while the copy is not set up. The server listens on 127.0.0.1 only, and
without sign-in refuses any other host (`HOST` / `PORT` override the address).

To start it yourself, use the Bash tool with `run_in_background: true`, from
the repository root:

```bash
npm start
```

If it was running when you began, leave it running when you finish. If it
wasn't, stop yours when you're done: `start.ps1` can't start the app while the
port is taken.

At start it checks the settings and the database (not set up, it says so and
serves anyway, for `/setup.php`), applies new migrations after a raw copy of
every table, rebuilds the catalog and the question bank if `data/` or the
generators changed (~3 s), takes the day's backup, prints the counts and the
sign-in mode, then serves. Check it's answering, and that it is the database
you expect:

```bash
curl -s 127.0.0.1:8200/api/health; echo; curl -s 127.0.0.1:8200/api/kanji/summary | head -c 200; echo
```

On the owner's PC `/api/health` says `"auth":"none"`, their database's name
and `"owner":1` (the user id the owner's data belongs to).

**On a PC without the owner's database** (their real data is on their home
PC), there is no owner's server: their database does not exist there, and
nothing may create it. A developer's copy there has settings of its own (a
database like `academy_dev`, never `japanese_academy`) — or none: then check
`php backend/server.php` with the throwaway setup instead (below).

To stop it, use the PowerShell tool (`pkill` can't see Windows processes).
Stopping PHP's web server also ends the `php backend/server.php` (and `npm`)
that started it:

```powershell
Get-NetTCPConnection -LocalPort 8200 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force }
```

To restart, stop it, start it, then run the health check.

- **Restart** after changing `data/*.json`, `data/authored-items*.php` or a
  migration: the start-time work picks them up. (A running server also applies
  a new migration at the next request with data, as a website would.)
- **Don't restart** for PHP code: PHP's built-in server reads it again on
  every request. For the frontend, build it again (`npm run build:frontend`)
  and reload the page — or work at the dev server (below).

A restart is safe for the data: every answer is a finished transaction. The
owner may be in the middle of a session, though, so keep the downtime short and
say in your final message that you restarted the server. If the question bank
changed, an exam paper started before the restart can't be submitted after it
(409).

"Failed to listen on 127.0.0.1:8200" means something already listens there. To
see what:

```powershell
Get-NetTCPConnection -LocalPort 8200 -State Listen | ForEach-Object { Get-Process -Id $_.OwningProcess } | Select-Object Id, ProcessName, StartTime
```

A `php` process there is an older copy of this server. Stop it and start again.

## The Angular dev server (port 4400)

While you change the frontend: `npm run frontend` (Bash tool,
`run_in_background: true`) runs `ng serve` on http://localhost:4400,
rebuilding as files are saved. It sends `/api`, `/audio`, `/report` and
`/setup.php` to 127.0.0.1:8200 (`frontend/proxy.conf.json`), so a backend must
run there — the owner's, or on a PC without their data a developer's copy.
Stop it by its port (4400) with the PowerShell snippet above; `ng serve` runs
under npm, so stop the whole tree: `taskkill /PID <pid> /T /F`.

## The throwaway server (port 8300, its own database)

Make its database (a copy of the test template, which the first command brings
up to date) and its settings folder (the three settings files, for that
database only), then run PHP's built-in server with `backend/server.php` as its
router, in the background, from the repository root:

```bash
"$PHP" backend/tests/tools/testdb.php template
"$PHP" backend/tests/tools/testdb.php create academy_test_manual
CONF="$(node -e "console.log(require('os').tmpdir().replace(/\\\\/g,'/'))")/academy-test-config-manual"
"$PHP" backend/tests/tools/testdb.php config "$CONF" academy_test_manual none "$TEMP/academy-manual" "$PWD/frontend/dist/japanese-academy/browser"
ACADEMY_CONFIG_DIR="$CONF" "$PHP" -d opcache.enable=0 -S 127.0.0.1:8300 -t backend backend/server.php
```

`curl -s 127.0.0.1:8300/api/health` must say `"database":"academy_test_manual"`
before you use it. (The app honours a settings folder in `ACADEMY_CONFIG_DIR`
only for an `academy_test_…` database, and refuses to start with one that
names any other.) Stop it with the PowerShell snippet above, using port 8300,
then drop its database and remove the folders:

```bash
"$PHP" backend/tests/tools/testdb.php drop academy_test_manual
rm -rf "$CONF" "$TEMP/academy-manual"
```

To give it some progress, post to its API from Node. Git Bash `curl` can
mangle Japanese in arguments.

```bash
node -e "(async()=>{for(const id of ['k:一','k:二','k:大'])console.log(id,(await fetch('http://127.0.0.1:8300/api/kanji/learn',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})})).status)})()"
```

To make its reviews due, change its database (`testdb.php` only ever touches
`academy_test_…` databases):

```bash
"$PHP" backend/tests/tools/testdb.php sql academy_test_manual "UPDATE srs_progress SET next_review = now() - interval '1 minute' WHERE stage BETWEEN 1 AND 8"
```

### With sign-in, through the test IAM

Never start the IAM for this, and never use a real one. The tests' IAM is a key
pair of your own, whose public half the server reads from a file its settings
name:

```bash
KEYS="$TEMP/academy-manual-iam"; mkdir -p "$KEYS"
"$PHP" backend/tests/tools/iam.php keys "$KEYS"
"$PHP" backend/tests/tools/testdb.php config "$CONF" academy_test_manual iam "$KEYS/jwks.json" "$TEMP/academy-manual" "$PWD/frontend/dist/japanese-academy/browser"
```

Restart the throwaway server after changing its settings. A token for user 42
(from Node: `execFileSync` quotes the JSON right, a shell may not), then a
request with it:

```bash
node -e "const {execFileSync}=require('child_process');const n=Math.floor(Date.now()/1000);console.log(execFileSync(process.env.PHP,['backend/tests/tools/iam.php','token',process.env.KEYS,JSON.stringify({iss:'https://iam.test',sub:'42',aud:'japanese-academy',iat:n,exp:n+3600,roles:['MEMBER'],preferred_username:'tester'})]).toString().trim())" > "$KEYS/token"
curl -s -H "Authorization: Bearer $(cat "$KEYS/token")" 127.0.0.1:8300/api/kanji/summary | head -c 200; echo
```

(`export PHP KEYS` first.) In a browser, such a server shows the Sign in page:
the browser suite answers the IAM's addresses itself (`emulateIam()` in
`frontend/e2e/browser.js`), which a hand-driven browser can't. Delete `$KEYS`
when you're done.

### php backend/server.php itself

The launchers' start command (the summary, the checks at start) runs only with
`php backend/server.php`. To try it on a throwaway database, start this with
the Bash tool's `run_in_background: true`:

```bash
PORT=8300 ACADEMY_CONFIG_DIR="$CONF" "$PHP" backend/server.php > "$TEMP/academy-manual.log" 2>&1
```

Its summary goes to that file (the tool's own capture may show only the web
server's log). Stop it by its port, as above. `HOST=0.0.0.0` in front must
make it refuse to start: without sign-in it listens on this computer only.

Never point a settings folder at the owner's database, and never run a
command that changes a database outside the test tools or a throwaway
server's settings: without them, a PHP process uses this copy's own settings
— on the owner's PC, their real data.
