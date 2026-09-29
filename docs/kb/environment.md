# Environment — the computers it is worked on

Windows 11 PCs. The app needs PHP 8.1+ (with pdo_pgsql, mbstring and intl;
curl and openssl for the IAM and the audio) and PostgreSQL (13 or newer;
tested with 18); the frontend and the developer tools need Node.js (22, see
`.nvmrc`) and npm, and the browser suites Edge or Chrome. Claude Code's Bash
tool is **Git Bash**; there is also a PowerShell tool. The repository root is
the usual session start folder. The PDFs are in `books/` (only on the owner's
computers).

The owner studies with the app on their home PC, where their study database
lives. Other PCs — the one with all the anotoki repositories side by side,
where sign-in, hosting and the move to `backend/` + `frontend/` were built —
have **no study database** of the owner's: it does not exist there, and
nothing may create it. Work on those with throwaway databases
(`academy_test_…`) and a development copy of their own.

## What differs between the PCs

| Thing | What to know |
|---|---|
| `php` on PATH | On one PC it is PHP 7.4 (first on PATH, no pdo_pgsql), which can't run the app; on another a PHP 8.5 with its own `php.ini`. The npm scripts and the launchers find a PHP that can run the app themselves (`backend/tools/php.js`: `ACADEMY_PHP`, every `php` on PATH, the usual install folders), so plain `npm start` / `npm test` work either way. By hand, call that PHP, or set `ACADEMY_PHP`. `backend/server.php` and `backend/manage.php` say so themselves when started with an old PHP |
| PostgreSQL's port | 5432 on one PC, 5433 on another. It lives in this copy's settings (`backend/config/database.local.php`); the setup page asks for it and **Test connection** tries it |
| The owner's editor | Checks PHP with a 7.4: the code stays parseable by 7.4 on purpose (no constructor promotion, no `throw` expressions, …), so it shows no false errors; it still needs 8.1 to run. There may be no 7.4 to try it with: `backend/tests/unit/php74-syntax.test.php` checks it with PHP's tokenizer |
| Ports | 4200, 4300, 8000 and 8100 belong to the other anotoki projects (genshin's pages and API, the IAM's pages on 4300 and API on 8100): don't start anything there. This app: 8200 (the backend, `npm start`) and 4400 (`ng serve`) |

## Pitfalls met so far, and what works

| Problem | Do this |
|---|---|
| **OPcache on Windows is one cache for every `php.exe` process of the build** (see `opcache.cache_id`), and PHP 8.5 has it on for the built-in server. Two servers with different extensions or settings (another `PHPRC`, `-d` flags) then ran each other's compiled code against the wrong internal functions: on 2026-09-28 `unpack()` ran as `numfmt_get_locale()` in this app's test servers, and `openssl_verify()` as `transliterator_get_error_code()` in another project's; plain CLI never | The tests' servers start with `-d opcache.enable=0` (`backend/tests/lib.php`, `frontend/e2e/helpers.js`, the site and setup tests), and so does the one `php backend/server.php` starts (`server_serve()`: `npm start`, the launchers), so they stay out of any cache another process shares. A `php.ini` with `opcache.enable=0` settles it for plain `php`. A server of your own that behaves impossibly: restart it with `-d opcache.enable=0`. Never edit a machine's global `php.ini` without the owner's approval |
| The IAM's PHP SDK before v1.0.1 read `$http_response_header`, which PHP 8.5 deprecates as soon as it compiles the file; this app's error handler turns that into an error that stops every page | Keep `backend/src/anotoki_iam.php` at v1.0.1 or later, copied unchanged from the IAM's `sdk/php/`: nothing in it is deprecated up to 8.5 |
| **A command that does not go through the tests' settings uses the developer's settings** — on the owner's PC, the real database | Any scratch or test command uses a throwaway database: the test tools (`backend/tests/tools/testdb.php`, which refuses other names), or a server with settings of its own (`ACADEMY_CONFIG_DIR`, honoured for `academy_test_…` databases only; the academy-run skill). Never experiment on the owner's database |
| Connecting to PostgreSQL costs 50–70 ms (the password check) | The web server keeps its connection open (`db()` in `backend/src/db.php`); a CLI script pays it once |
| PHP's curl has no CA certificates on Windows (`unable to get local issuer certificate`) | `backend/tools/build-audio.php` uses Windows' own store (`CURLSSLOPT_NATIVE_CA`); for the IAM's keys, a `php.ini` with a CA bundle as `curl.cainfo` and `openssl.cafile` |
| `escapeshellarg()` on Windows turns `"` into spaces | Don't pass JSON through a shell argument from PHP; Node's `execFileSync` quotes properly (`backend/tests/tools/iam.php` is called that way) |
| The built-in server logs every request to stderr | Tests send it to a file (a pipe nobody reads would fill up and stall the server) |
| `php -r "…$x…"` in Git Bash: the shell or PHP expands `$` | Write a small script file, or single-quote the PHP code |
| `/tmp` in Git Bash is not the `/tmp` Node sees (Node maps it to `C:\tmp`) | Put scratch files in the session scratchpad or the project, and pass absolute Windows-style paths to Node |
| Large heredocs (`cat <<'EOF'`) containing quotes sometimes fail with "unexpected EOF" | Write files with the Write tool |
| `pkill node` / `pkill php` do nothing to Windows processes | `Get-NetTCPConnection -LocalPort <port> -State Listen \| Select -Expand OwningProcess -Unique \| % { Stop-Process -Id $_ -Force }` in PowerShell; `ng serve` started through npm needs its process tree stopped (`taskkill /PID <pid> /T /F`) |
| `sed` with a regex containing `/` silently breaks the expression | Use the Edit tool for code edits |
| Python may be missing (`python` on PATH can be the Microsoft Store stub) | Use PHP or Node for tools and scripts |
| No poppler, so the Read tool can't render PDF pages | `npm run pdf:pages -- …` (see data-provenance.md) |
| Windows Defender can hold a just-written file for seconds | Backups, settings and `data/audio.json` are written aside and renamed, with retries (`file_put_atomic()` in `backend/src/backup.php`, `config_write()`) |
| The system locale is Slovak: `toLocaleDateString([], {weekday:'short'})` gives "pi, so, ne…" | The UI is English: pass `'en-GB'` for anything with words; numeric dates/times may use the locale (the reports do, through ICU in PHP, like the browser) |
| PHP says UTC unless told | The time zone is a setting (`app.local.php`, asked by the setup page, which fills in the browser's own); `backend/src/bootstrap.php` applies it |
| Playwright wants to download browsers | Use `playwright-core` with the installed Edge (`frontend/e2e/browser.js`) |
| In Playwright, Angular's screen changes a moment after a key or a click (zoneless: it draws on the next frame) | Wait for the result (`waitForSelector`, `waitForFunction`) instead of reading right after `keyboard.press` |
| Playwright's `text=/^…$/` misses a button whose text has spaces around it (Angular keeps one) | Find it by role and name: `getByRole('button', { name: /^Learn \d+ items?$/ })` |
| Opening the same URL in Playwright doesn't reload the page | Go to `about:blank` first |
| A full-page screenshot in a phone context (`isMobile`, `hasTouch`) can switch Edge's touch emulation off: that shot, and the page after it, draw with `(pointer: coarse)` false, so most phone shots of `npm run screens` show the buttons at their mouse size (seen 2026-09-29) | Check finger-sized targets with `locator.boundingBox()` in a fresh phone context, before any screenshot; don't read them off the shots |
| The first `npm ci` in `frontend/` stops with "Cannot read properties of null (reading 'edgesOut')" | Vitest's optional peers confuse npm's resolver: `frontend/.npmrc` sets `legacy-peer-deps=true` |
| The app looks old after a change | The backend serves the last build: `npm run build:frontend` (the launchers and the browser suites build when the sources changed), or work at http://localhost:4400 (`npm run frontend`) |
| A trailing `n` in a reading shows as `n` while typing | Normal IME behaviour; `toKana` converts it on submit |
| Browser audio requests come back 206 | Normal (byte ranges) |
| An `academy-*` agent created or edited during a session is "not found", or runs its old text | Agents load when a session starts. Start a new session, or meanwhile run a general-purpose agent told to follow the agent file (`.claude/agents/<name>.md`) and stay read-only |
| `git config core.autocrlf` is `true`: a checkout can turn LF text files into CRLF, and a rebuilt `data/*.json` (LF) then shows as modified with no content change | Harmless: `git diff` shows nothing, `git checkout -- data/<file>` clears it. The PHP readers accept CRLF; the build-data test compares without it |
| `rmdir` says "Device or resource busy" for an empty folder | A tool shell still has its working directory inside it: move that shell out first (e.g. `Set-Location` in PowerShell) |
| Claude Code's sandbox blocks github.com (npm, PyPI, Hugging Face and Google's APIs work) | Don't plan on GitHub downloads; ask the owner to download, or use npm |
| The audio builder says "No API key" | The key goes in `.env` as `GOOGLE_TTS_API_KEY=…` (gitignored). Never print it or paste it into a message |
| A check under a real Apache | An Apache 2.4 (XAMPP's, say) runs with a config of one's own (`httpd.exe -f <file>`, a free port, mod_php with its own `PHPIniDir`). For PHP over FastCGI, `php-cgi.exe -b 127.0.0.1:<port>` behind `mod_proxy_fcgi` needs `SetHandler "proxy:fcgi://127.0.0.1:<port>/"` (with the slash), `ProxyFCGIBackendType GENERIC` and `ProxyFCGISetEnvIf "true" SCRIPT_FILENAME "<document root>%{reqenv:SCRIPT_NAME}"`, or php-cgi answers "No input file specified." Stop both afterwards |

## Ports

The owner's app: 127.0.0.1:8200 (`start.ps1`, `npm start`,
`php backend/server.php`). The Angular dev server: localhost:4400
(`npm run frontend`). Use another port (e.g. 8300) for any manual test
server, always with a throwaway database — see the `academy-run` skill. The
automated suites pick a free port themselves.
