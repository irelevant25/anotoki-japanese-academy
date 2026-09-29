# Decisions

Why things are the way they are. Check here before undoing one; add an entry
when you make a decision someone might later question.

**2026-09-22 — Exam is multiple choice; results are local JSON + HTML reports.**
The user chose both when asked (over typed answers, SQLite, browser storage).
*(Storage superseded 2026-09-24: attempts and reports live in PostgreSQL.)*

**2026-09-22 — Data is transcribed from page images.** The PDFs have no text
layer and no OCR is available; pages were read visually and typed into TSV.
Counts were checked against the books (kanji numbering, per-lesson totals).

**2026-09-22 — The browser never gets exam answers; submit rebuilds the paper
from the echoed spec.** Keeps scoring honest. Rebuilding from the resulting
question count produced a different paper — the spec is echoed verbatim now.

**2026-09-22 — Distractors are generated mistakes, not random words.** Verbs
conjugated as the wrong class, compounds read with their kanji's other
readings, い/な rules crossed. EN→JP skips glosses shared by two words, so
there is never a second right answer.

**2026-09-22 — One app for both parts; the lesson number identifies the part.**
0–12 Part 1, 13–23 Part 2. Avoided duplicating the whole app for Part 2.

**2026-09-22 — Keigo verbs get no Part 2 forms; 〜さる verbs take います.**
A causative-passive of いらっしゃる isn't Japanese; くださります is the common
mistake, so it is offered as the distractor.

**2026-09-23 — The kanji trainer follows WaniKani's schedule exactly, minus the
time locks.** User request: lessons in batches of 5 but unlimited; practice of
learned items as often as wanted. Practice never changes the schedule, so
drilling can't wreck the spacing that makes an SRS work.

**2026-09-23 — Vocabulary is an SRS item only if written with the course's
kanji; it opens once its kanji are learned.** Mirrors WaniKani's
kanji-before-vocabulary order without any time gate.

**2026-09-23 — A kanji accepts any of its on/kun readings.** WaniKani asks for
a specific one; the course data doesn't say which reading is "primary", so the
trainer is deliberately more lenient.

**2026-09-23 — No radicals and no ready-made mnemonics.** The course provides
neither; WaniKani's are its own content. Every item has two note fields for the
learner's own mnemonics.

**2026-09-23 — Typo tolerance, but not for a typo that is another real
answer.** "night" is not accepted for 右 ("right"). Transpositions count as one
edit. Numbers must be exact.

**2026-09-23 — "My answer was right" instead of undo.** Stores the answer as the
learner's synonym (or extra reading) and counts it — covers gaps in the
transcribed meanings without an undo button.

**2026-09-23 — Answers save in the background.** A once-a-day backup copy was
held up by Windows for 5 s and froze the quiz. The next card no longer waits
for the disk; the backup moved to start-up.

**2026-09-23 — Daily backups never run inside an answer.** The start-up
backup copies the file. Past midnight, the new day's first save writes the
backup from memory, asynchronously, so nothing waits and `kanji.json` itself is
never held open. A review found that the old code copied the file during the
second answer of a fresh folder, and during the first answer after midnight.
*(2026-09-24: still never inside an answer; past midnight the first page load
takes it — see "Backups are one file of all your data".)*

**2026-09-23 — The last-resort copy in `renameWithRetry` stays.** When the
rename still fails after 0.9 s of retries, the save copies over `kanji.json`,
which is not atomic. Throwing instead would be purer, but Windows sometimes
holds the new temp file; copying from it keeps answers saving. A crash during
that copy is very unlikely, and even then the unreadable file is set aside at
load (never overwritten), and the daily backups and the answer log still exist.
*(Obsolete 2026-09-24: answers are database transactions now.)*

**2026-09-23 — Tests run the real app in-process, against temp folders.**
`server.js` exports the app and listens only when run directly. The data
folders come from `ACADEMY_*_DIR`. `isolate()` refuses to run once the app is
loaded, and `startApp()` checks the app's real folders. This tests the actual
code paths without ever touching the owner's data.
*(Superseded 2026-09-24: see "Tests get throwaway databases".)*

**2026-09-23 — Browser tests use playwright-core with the installed Edge.** It
needs no browser download, and Edge is always present on Windows.
`BROWSER_PATH` can point at another Chromium browser.

**2026-09-23 — PDF pages are read by pulling out their JPEGs.** Each scanned
page is one embedded JPEG. `tools/pdf/pages.js` copies these out of the raw
file and crops and scales them with sharp. There is no poppler here, and
nothing is decoded twice.

**2026-09-23 — Page numbers are PDF page numbers, taken from the page tree.**
The first version of the tool numbered the images in the order they appear in
the file. That numbering drifted from the real pages for two reasons: blank
pages reuse one image, which that version counted once, and the part 2 scans
store their covers last. As a result, `--book-page` was off by up to 3 pages in
the second half of the workbooks. The tool now walks the PDF's page tree, and
the page maps were converted and checked against the printed page numbers.

**2026-09-23 — English UI, including dates with words.** The system locale is
Slovak; word-based dates use `en-GB`, numeric ones follow the locale.

**2026-09-23 — Claude Code setup lives in the repository's `.claude/`.** The
agents, skills and rules sit next to the app, with `CLAUDE.md` at the root, and
sessions start at the root. Claude Code finds agents only in the start folder
and the folders above it; skills and rules in subfolders load only after Claude
has touched files there. (Before the move into this repository they lived in
the workspace folder above the app, and the rule globs also carried a form with
the app's folder name.)

**2026-09-23 — This app replaced N4 Coach in the repository.** The owner found
N4 Coach's sentences and learning path wrong and asked for the switch. The app
moved from its own workspace folder to the repository root. N4 Coach is in the
git history; its last uncommitted changes were kept as a git stash entry.

**2026-09-23 — The books stay out of git.** The owner asked for the PDFs to go
into a local, gitignored folder: `books/`. The TSVs and the built JSON are in
git.

**2026-09-23 — Progress, results and reports are tracked in git.** Carried over
from N4 Coach, where the owner chose to version their progress in git.
`progress/backups/` and half-written `*.tmp` saves are gitignored; git already
keeps the history.
*(2026-09-24: the files stay in git as the history before the database; the
app no longer writes them. Your data is in PostgreSQL, copied daily to the
gitignored `backups/`.)*

**2026-09-23 — The server listens on 127.0.0.1 only.** Carried over from
N4 Coach. The app has no login, and `POST /api/kanji/reset` wipes progress, so
it must not be reachable from the network by default. `HOST=0.0.0.0 npm start`
opens it (for a phone, say) when the owner wants that. The tests' server
listens on 127.0.0.1 too (`tests/lib.php`, `tests/helpers.js`), which also
spares a new PC the firewall prompt.
*(2026-09-27: without sign-in `php server.php` now refuses any other host;
other devices need a copy with sign-in — see "Sign-in through the anotoki
IAM".)*

**2026-09-23 — The one-click launcher stays.** `start.ps1` / `start.sh` /
`.nvmrc` come from N4 Coach: they check Node through NVM, install the
dependencies, start the app and open the browser. They read `.nvmrc` and
`config` in `package.json`, so the server takes its host and port from there.
*(2026-09-24: they now look for PHP instead of Node, run `setup.php`, and take
the address from `php server.php --url`; `.nvmrc` pins Node for the developer
tools only.)*
*(2026-09-29: they look for PHP and Node, build the Angular app when its
sources changed, start `php backend/server.php` and open the app — or the
setup page, which replaced the terminal questions.)*

**2026-09-23 — A click on a link to the address already shown re-routes.**
Lesson batches, sessions and summaries draw over the screen they started from
without changing the hash, and the browser fires no `hashchange` for a link to
the current address. So after a lesson started from the dashboard (still at
`#/`), Dashboard did nothing (the owner's bug report), and "New practice" did
nothing after a practice session. One delegated click handler in `app.js`
fixes every such link; giving sessions routes of their own would have meant
rebuilding in-memory batches from the URL. Because the learner can now leave
at any moment, a session that finishes saving after they left no longer draws
its summary over the new screen (a slow save would otherwise make Dashboard
look broken again).
*(2026-09-29: the same in Angular: the kanji shell catches such a click before
the router, which would do nothing, and draws the screen again, fresh.)*

**2026-09-23 — The app is called Japanese Academy, and nothing in the
repository names the course its data comes from.** The owner's requirement:
the repository on GitHub must not show where the data is from. Code, data
files, skills, agents, rules, environment variables (`ACADEMY_*`), the exam's
parts ("Part 1 / Part 2") and the PDFs (`textbook-1.pdf` …) were renamed, and
`tests/unit/source-names.test.js` fails on any mention. The real vocabulary
word 元気 stays in the data. Old N4 Coach commits mention the course once, in a
writing guideline; the owner chose to leave the history as it is.

**2026-09-23 — The audio is made with Google Cloud Text-to-Speech.** The
recordings that came with the source material were not licensed for this app,
and only 475 of the trainer's words had one. The owner chose Google Cloud TTS
(over VOICEVOX and the Windows voices) for its quality; this much text is
inside the free tier. Every word (2,041) gets two voices, female and male, and
the clips are committed (the owner's choice), so every PC has sound without a
key. Kanji words are sent with their reading as yomigana, so the reading is
always the list's. Clip names are random, so a listening question can't give
its answer away. The listening questions now come from the vocabulary list
itself, and a word that sounds the same is never offered as a distractor.

**2026-09-24 — The backend is PHP and the data is in PostgreSQL.** The owner's
request: the server in PHP instead of Node, and a database instead of JSON
files. Plain PHP 8.1+ with no framework or Composer, laid out like the owner's
other PHP project (`src/config.php` + a gitignored `config.local.php`,
numbered SQL migrations, `setup.php`). PHP's built-in web server runs it
(`php server.php`), so the app needs no Apache; it listens on 127.0.0.1 as
before. The JavaScript was ported function by function and checked against
itself before it was removed: the same bank (all 11,523 questions), catalog,
papers, scores, reports and SRS times, the same data builds byte for byte, and
the same answer to every API request of a long scripted session. Where PHP and
JavaScript differ (`Math.round`, `toFixed`, `trim`, UTF-16 lengths, 32-bit
integer maths, the autumn's repeated hour) `src/util.php` does it the
JavaScript way, so old seeds give their old papers. Node stays for the
developer tools only: the browser suites, the test of the browser's answer
checking, and the PDF page tool.
*(2026-09-29: now with Slim 4 through Composer, and an Angular frontend that
Node builds — see "backend/ + frontend/".)*

**2026-09-24 — The study content is built into the database, not per
request.** Building the bank takes about 2 s in PHP, and a PHP request starts
from nothing, so `content_sync()` builds the catalog and the bank when the
server starts (and in `setup.php`) and stores them (`srs_items`,
`exam_questions`). It rebuilds only when a hash of `data/` and of the code that
builds from it changed, so a data edit or a generator change is picked up by
the next restart, as before.

**2026-09-24 — The old JSON files are imported once and left as they are.**
`setup.php` reads `progress/`, `results/` and `reports/` into an empty database
the first time (recorded in `imports`), and never writes to them. They stay in
git as the history before the database. Automatically it imports only into the
real database, and not when backups already exist (then a backup is newer than
the files, and it suggests `--restore` instead).

**2026-09-24 — Backups are one file of all your data, taken at start-up.**
With the data in a database, a save can no longer be half-written, but a
database can be lost (a PostgreSQL reinstall) and the old git history of the
files no longer grows. So `backups/academy-<date>.json` holds everything —
progress, answer log, exam attempts with their reports — taken when the server
starts, the last 14 kept, plus one before a full reset or a restore;
`setup.php --restore` puts one back. PHP has no background work, so a server
left running overnight takes the new day's copy at the first page load (never
an answer: a copy inside an answer is what froze the quiz once); a failed
backup is reported and the app runs on, as before. Before a migration the copy
is raw — every table's rows, whatever the columns — because this version's
queries may expect the tables the migration is about to make. A database named
by `ACADEMY_DB_NAME` keeps its backups in the temp folder unless
`ACADEMY_BACKUPS_DIR` says otherwise, so a throwaway copy can never stand in
for the owner's day or push one of theirs out of the last 14 (the code review
found that hole).

**2026-09-24 — The web server keeps its database connection open.**
Connecting to PostgreSQL costs 50–70 ms here (the password check), which made
every request ten times slower than the Node server and broke the browser
suite's timing. A persistent PDO connection brings requests back to 5–10 ms.
PDO rolls back a transaction a request leaves open, so a failed request can't
leave one behind.

**2026-09-24 — Tests get throwaway databases.** Each PHP test file and each
browser suite gets `academy_test_<…>`, copied from `academy_test_template`
(made and updated at the start of a run), and its own temp backup folder;
`tests/lib.php` / `tests/helpers.js` set them before the app starts, refuse to
go on otherwise, and check that the server says it uses them. Copying a
template takes a fraction of a second, where building the content takes
seconds.
*(2026-09-29: the tests name them in settings folders of their own,
`ACADEMY_CONFIG_DIR`, which the app honours for `academy_test_…` databases
only — see "The settings are required".)*

**2026-09-27 — Sign-in through the anotoki IAM, and no sign-in on the
owner's computer.** The owner's decision: as a hosted site the app requires a
sign-in at iam.anotoki.eu, the identity provider every anotoki site shares
(OpenID Connect, code flow with PKCE; the backend checks the RS256 access
token itself, against the IAM's keys). On the owner's own computer, without
the IAM, it keeps working exactly as before: auth mode `none`, every request
the owner (`auth.local_user_id`, 1). The mode is deployment configuration,
never a request's. The default is `iam`, so a server whose settings are
missing is not open; `setup.php` writes `none` on the owner's computer, the
web installer writes `iam`. Mode `none` only works under `php server.php` and
from this computer — under Apache, or from another address, every address with
somebody's data answers 403 — because a mistaken `none` on a website would
give everybody the owner's data.
(This supersedes the "no login" of "The server listens on 127.0.0.1 only".)
*(2026-09-29: there is no default any more: without its settings a copy
serves nothing with data — see "The settings are required".)*

**2026-09-27 — Signed out, a Sign in page, not a jump to the IAM.** The brief
allowed either. Straight to the IAM would sign a person back in the moment
they signed out (the post-logout address is `/`), and a refused sign-in would
bounce between the two. A page with one button says plainly what is going on;
the IAM itself tells who may use the app.

**2026-09-27 — A token without a role here is refused (403).** The app is
registered with access `members`, so the IAM issues no token without a role;
checking again here costs one line and covers a token issued before a role was
taken away. If the IAM's access is ever changed to `everyone`, this check must
go with it.

**2026-09-27 — Each person's data is their own: `user_id` in every study
table.** The owner's decision. `users` holds the IAM user id (the primary key),
the name from the latest token and when a person was first and last seen,
filled in as verified requests arrive; nothing else about identity is kept.
Every study table carries `user_id`, first in its primary key, and every query
has it — explicitly passed, not a global, so a query without it stands out in
review. Attempt ids are unique per person (an id is a time and a seed; two
people can share one). The foreign keys to `users` cascade on update, so
`--owner-id` is one update of a users row and cannot miss a table.

**2026-09-27 — The owner's study tables were migrated once (002), with the
owner's approval.** Until then the rules said the owner's rows are never
migrated or rewritten. Giving each row a person needs exactly that, so the
owner approved one migration: every existing row became user 1's (the owner's
IAM user id), and the check at its end compares every table's row count and a
fingerprint of its content before and after, failing the whole migration
(which then changes nothing) if anything differs. Apart from this, the rows
are still never rewritten; `--owner-id` only changes whose they are, at the
owner's request.

**2026-09-27 — Backups hold everybody; a version-1 file is the owner's.**
Backup format version 2 has a list of people, each with the version-1 content
(kanji export, log, attempts). A restore of a version-2 file replaces
everybody's study data; a version-1 file — every backup from before this
change, and the owner's real ones are such — restores into the owner's account
only, leaving everybody else alone. The web installer imports one person from
either version, into the IAM user id the owner names.

**2026-09-27 — Reports and the progress download are fetched with the token
and opened from memory.** A link the browser follows carries no bearer token,
and a token in a URL ends up in logs and history. Signed in, `auth.js` fetches
them and opens a `blob:` page (the report, in a tab opened during the click so
no pop-up blocker stops it) or saves the file under the server's name. The
blob page has the app's origin, where the tokens live, and a report is stored
HTML that a backup could bring in: so it gets a Content-Security-Policy that
allows no script (the server sends the same policy with `/report/…`). Without
sign-in the links work as they always did.

**2026-09-27 — The audio stays public.** The clips are the same for everybody
and hold nothing personal; a clip's random name says nothing about a listening
question. Everything else with data — the catalog included — needs a sign-in,
which keeps the rule simple: every `/api` and `/report` address but two.

**2026-09-27 — Hosted on Apache with the document root at `public/`.** The
owner's hosting is FTP-only (no shell, no cron, no processes). One router
(`src/router.php`) serves both `php server.php` and Apache's front controller
(`public/index.php`), refactored out of `server.php` rather than copied. Only
`public/` is on the web; `src/`, `data/`, `storage/` and `backups/` sit beside
it (with a deny-all `.htaccess` each, should the document root be set wrong).
`.htaccess` passes the Authorization header with `CGIPassAuth` (guarded by
`mod_version`) and `SetEnvIf` as the fallback, and sets no `DirectoryIndex` or
`Options`, which some hosts refuse in `.htaccess` with a 500 for the site.
*(2026-09-29: `public/` now holds the built Angular app beside `index.php`,
and `backend/`, `data/` and `backups/` sit beside it; the one router became the
Slim app behind `backend/api/front.php`.)*

**2026-09-27 — The start-time work happens on requests.** A hosted site never
"starts". Every request compares one stamp (the names, sizes and times of the
content files and the migrations) with `content_state.stamp`: a query and a
dozen `stat()`s, instead of hashing megabytes each time. When it differs, the
request applies new migrations (after a raw copy of every table, as
`setup.php` does) and rebuilds the content, under an advisory lock. It does
not set up an empty database — that is the installer's job, so a passing
request can't install a site. The day's backup was a page load's job already.
Whichever request comes first after an upload does the work, and it may be an
answer: the "nothing slow in an answer" rule bends here, once per upload,
because refusing the answer would lose it, and answering it against tables a
migration has not reached yet could break it. The kanji session saves in the
background, so no card waits for it.

**2026-09-27 — A web installer, modelled on the genshin site's.** It proves
the visitor owns the server with a token it writes into a file only FTP
reaches, asks for the database, writes `src/config.local.php` itself (owner
only), runs the migrations, builds the content, offers to import the owner's
backup into an IAM user id, writes a lock and deletes itself. A backup can be
sent with the form, or, when it is bigger than the host takes in a form, put in
`backups/` by FTP and chosen there. The time zone is asked for: review times
and days are the site's, one zone for everybody (the owner's), since the host's
own zone may be UTC.
*(2026-09-29: the setup page, `backend/setup.php`, took its place, and that of
`setup.php` on a computer — see "One setup page for every copy".)*

**2026-09-27 — The IAM's keys are cached in `storage/`, not the temp folder.**
The SDK's default is the system temp folder, which other sites on a shared
host may write to; a key set placed there would decide who is signed in.

**2026-09-27 — Errors say less on a hosted site.** Under `php server.php` an
error answers with its message, as before; on a website with a sentence, the
details going to the error log (a database error names the host and the user).
`/api/health` shows the database, the backup folder and the owner only under
`php server.php`, where the tests and the launchers need them.

**2026-09-27 — `tools/build-dist.php` assembles the upload.** Exactly what a
site runs: `public/`, `src/` without settings, tokens or data builders, the
`data/` files the content is built from, the clips, and empty `storage/` and
`backups/`. It re-checks the result against a list of what must never be
uploaded (tests, tools, docs, books, the owner's history, backups, `.env`,
`*.local.php`) and parses every PHP file. `--no-audio` makes an update without
the 4,000 clips, which rarely change; the site test builds that way and checks
the full list with `--list`.
*(2026-09-29: `backend/tools/build-dist.php`, with the built Angular app as
`public/`; it builds the frontend first when its sources changed.)*

**2026-09-27 — The SDKs are vendored unchanged.** `public/vendor/anotoki-auth.js`
(the IAM's browser SDK, v1.1.0, the classic-script build that defines
`window.AnotokiAuth`) and `src/anotoki_iam.php` (the PHP verifier, v1.0.0),
like wanakana: no CDN, no build step. A test pins both versions, so updating
one means changing the notes that name it.
*(2026-09-29: the browser SDK is now its ES module build, `anotoki-auth.mjs`
with its types `anotoki-auth.d.ts`, in `frontend/src/app/core/auth/sdk/`, and
bundled with the app; the PHP SDK is `backend/src/anotoki_iam.php`. Still
copied unchanged, still pinned by a test.)*

**2026-09-27 — A syntax check stands in for PHP 7.4.** The code must stay
parseable by 7.4 for the owner's editor, and a computer may have no 7.4 to try
(this one had none). `tests/unit/php74-syntax.test.php` finds the PHP 8-only
syntax with PHP's own tokenizer, in every file git would publish.

**2026-09-28 — The IAM's PHP SDK loads with PHP 8.5's deprecation masked.**
PHP 8.5 deprecates `$http_response_header`, which the SDK reads when it
downloads the IAM's keys without curl, and reports it while compiling the
file. This app turns every notice into an error (a warning is a bug here), so
on PHP 8.5 — the owner's PC runs 8.5 — every page stopped at that `require`.
The copy stays unchanged, so `src/bootstrap.php` masks `E_DEPRECATED` for that
one `require` only (checked: 8.5 reports it at compile time, not when the
function runs). Our own code's deprecations stay loud. The real fix is the
SDK's (`http_get_last_response_headers()`, PHP 8.4+); drop the mask when a
fixed version is copied in.

**2026-09-28 — …and dropped again the same day.** The SDK was fixed upstream
as v1.0.1: without curl it reads the status line from the stream itself
(`stream_get_meta_data()`, which works from PHP 7.4 to 8.5 alike, rather than
the 8.4-only function), and it no longer calls `curl_close()`, which 8.5
deprecates too. The fixed copy is `src/anotoki_iam.php`, and
`src/bootstrap.php` requires it plainly again.

**2026-09-28 — Mode `none` also wants the request to have come straight to
this computer.** A peer at 127.0.0.1 is not enough: a tunnel or a reverse
proxy on the owner's computer makes every visitor come from there, and a web
page elsewhere can reach the app through a name of its own that it points at
127.0.0.1 (DNS rebinding). Both show in the request: a `Host` other than
`127.0.0.1`, `localhost` or `[::1]`, or a `Forwarded`, `X-Forwarded-For` or
`X-Real-IP` header. Such a request is refused like one to a website in mode
`none`, and `/api/health` tells it nothing about the database or the folders.

**2026-09-28 — A migration runs only once it ends with `-- end of NNN`.** An
FTP upload writes a file bit by bit, and the first request after it may read
half a migration, which PostgreSQL would run as far as it goes. A last line
naming the file's own number shows it is whole: a cut-off file can't end with
it, and a line copied from another migration names the wrong number. Until
then it waits, and every migration after it too; the stamp is saved, so
requests don't keep looking, and the rest of the upload changes it. 001 is
exempt: it was applied on the owner's computer before the rule, and an applied
migration is never edited (002 and 003 had run only in tests).

**2026-09-28 — One raw copy per upload, not per try.** A migration that fails
is tried again by every request, each rolling back; a full copy of every table
each time would fill `backups/` in minutes. The copy's note,
`backups/.before-migration.json`, holds the stamp of the files and the pending
migrations it was taken with, and while both are the same no new copy is
taken. It stays exact: while a migration fails, every address with data
answers 503, so nothing changes the tables. The note keys on the stamp, not
only on the names, because a failing migration taken out lets the site be
used again with the stamp of before; put back, the same names would pass for
the same tables. The fixed file is an upload of its own and gets a fresh copy
right before it applies. The web installer, run again on a site in use, takes
the copy the same way.

**2026-09-28 — The stamp stored is the one taken before the work.** The work
reads the files, and a file can land while it does. Stored with the result,
the stamp from before can only be older than the files, so the next request
looks again; a stamp taken afterwards would pass off a file the work never saw
as done, until the next upload.

**2026-09-28 — A reset backs up that person alone.** A full reset is one
click and a confirmation, and each one copied everybody's data. Now it copies
the person's (`academy-before-reset-user-<id>-<time>.json`, `"everybody":
false`), and keeps their last 14. Restoring such a file replaces their data
and nobody else's; a copy of everybody says `"everybody": true`, and files from
before the flag count as everybody's. A version-2 file that holds nobody is
refused before anything is deleted.

**2026-09-28 — A report's policy is the first thing in it, not a sandboxed
frame.** The reviewer's other way was a wrapper page showing the report in an
`<iframe sandbox srcdoc>` without `allow-scripts`. A report is meant to be read
and printed as a page, though: a wrapper prints only what shows in the frame,
and a sandboxed frame without `allow-modals` can't print itself. So the
Content-Security-Policy `<meta>` goes before anything of the report's: right
after a leading doctype (with only HTML's own spaces before it), or at the very
start. Nothing of the report's is parsed before it, so nothing runs; the
browser suite opens reports made to get round it (a script before `<head>`, a
no-break space before the doctype).

**2026-09-28 — The browser SDK is v1.1.1.** Its `safeReturnTo()` let
`"/\t/evil.example"` through, which the browser reads as `"//evil.example"`
(it drops tabs and line breaks): an open redirect after sign-in. 1.1.1 refuses
control characters and backslashes and wants the address to stay on this
origin; copied unchanged, like 1.1.0.

**2026-09-28 — The token goes to this site only.** The SDK's `fetch()` adds
the token to any address it is given; `Academy.fetch()` hands it only
addresses of this site's own origin, and fetches anything else plainly. Every
call is to this site today; the check keeps a later absolute address from
carrying a token away.
*(2026-09-29: in Angular the HTTP interceptor does it, for this site's `/api`
and `/report` only; the browser suite checks every request of a signed-in
browser.)*

**2026-09-29 — `backend/` + `frontend/`: Slim 4 and Angular 21.** The owner's
conventions for every anotoki site, applied here: the backend in `backend/`
(PHP with Slim 4 and PostgreSQL, like the genshin site and the IAM: a front
controller, route files, middleware), the frontend in `frontend/` (Angular 21,
standalone components, zoneless, signals; every component in three files).
All the domain code and its behaviour stayed as they were — the SRS, the
exam, the content build, backups, sign-in, the upkeep — moved from `src/` to
`backend/src/`; only the HTTP side became Slim (`backend/api/`), and the
pages were rebuilt in Angular screen by screen, with the same flows, keys and
looks (the browser suite and side-by-side screenshots checked it). `data/`
stays at the root: it is what the content is built from and the audio,
shared by the backend's build, the tools and the upload, and the clips stay
exactly where they were. The build is not committed: the launchers build it
once, and again when its sources change (`frontend/scripts/ensure-build.mjs`
compares a stamp of the sources), so the owner's computer needs Node, which
it has.

**2026-09-29 — Composer's packages are committed.** A website has no shell to
run `composer install`, and the owner's computer shouldn't need Composer to
start the app: `backend/vendor/` (Slim, slim/psr7 and what they need) is in
git, as in the genshin site. Other people's code, so the PHP 7.4 syntax check
leaves it out.

**2026-09-29 — The settings are required, and have no defaults.** Three
files in `backend/config/` — the database, sign-in, the app (time zone) —
written by the setup page and never by hand or from a template. Without them
every address with data answers `503 {"code": "not_set_up"}`, pointing at
`/setup.php`, and the app shows a "not set up yet" page (to this computer
also what is missing). A default would have to be a guess: a database name,
or a sign-in mode, that could be the wrong one for the copy it runs in. The
tests' hooks (`ACADEMY_CONFIG_DIR`, a keys file, a backup folder, another
build) count only for `academy_test_…` databases, so no stray variable can
point a real copy elsewhere.

**2026-09-29 — One setup page for every copy.** `backend/setup.php` replaced
both `setup.php` (terminal questions on a computer) and the web installer. It
tells the two apart by the request: straight from this computer under PHP's
built-in server it needs no token (a nonce in a `SameSite=Strict` cookie and
the form, and the `Origin` checked, keep other sites' pages out), stays, can
be run again, and offers sign-in off; anywhere else it wants the token from a
file only FTP reaches, offers only sign-in through the IAM, then locks and
deletes itself. **Test connection** buttons try the database and the IAM
without sending the form, so a wrong password or address shows before
anything is written. It never shows a password; left empty, the saved one
stays. On the owner's computer it also carries the version before's settings
over (`src/config.local.php`, offered once) and runs the upgrade: a raw copy,
migrations 002 and 003, the content. The command-line helpers that need no
questions stayed, in `backend/manage.php`.

**2026-09-29 — The setup page sends its form with `Referrer-Policy:
same-origin`.** Under `no-referrer` a browser sends a page's own form with
`Origin: null`, and on this computer the page refuses a form whose `Origin`
is not its own — so the first real browser run refused the page's own form
(the tests with curl send no `Origin`, and passed). `same-origin` lets the
browser say where the form comes from; `null` stays refused, since any page
can make its form say `null`.

**2026-09-29 — Port 8200, and 4400 for the Angular dev server.** The other
anotoki projects hold 4200, 4300, 8000 and 8100; this app's own pair follows
their pattern (the IAM registers `http://localhost:4400` for it). The owner's
bookmarks change once, from :3000 to :8200.

**2026-09-29 — One address for the app and the API; a page's address gets
`index.html` only when it has no file extension.** Same origin, as on the
website: no CORS, and the token stays on one origin. The fallback to
`index.html` is for the app's own addresses (`/kanji/reviews`); an address with
a file extension that is not a file is a 404, so a missing script or image
shows as missing instead of arriving as HTML.

**2026-09-29 — The router's first navigation waits until the app can be
used.** While the copy is not set up, or nobody is signed in, the page shows
what stands in for the app — but the router would still have run the
screen's data loading behind it, asking the API for what it cannot give. So
the first navigation starts only once `AuthService` says the app is ready.

**2026-09-29 — The version opens the changelog; nothing pops up by itself.**
Like the genshin site: `frontend/public/changelog.json`, the version at the
foot of every page, a dialog of what changed. A dot on the version says there
is news until it is opened (remembered per browser). No automatic pop-up: the
kanji screens are keyboard flows, and a dialog appearing over a review would
swallow the next Enter.

**2026-09-29 — `legacy-peer-deps` for the frontend's packages.** Vitest
declares optional peers that npm's resolver chokes on ("Cannot read
properties of null (reading 'edgesOut')") in a fresh install;
`frontend/.npmrc` sets `legacy-peer-deps=true`, which installs the same
packages without that step.

**2026-09-29 — Two small fixes found in the port.** An item's page wrote
"irregularverb" (two words that the old page's markup ran together), and the
stage label of an item not learned yet was dark text on a dark pill in dark
mode (it had no colour token of its own); both are fixed, and the changelog
says so.

**2026-09-29 — A website's setup page needs a whole token, and shows nothing
of what is set before it.** The code review found that the page could read a
half-written token file (a first view racing another, a full disk) as "no
token", and then took a form without a token as proven. Now the token is
written aside and renamed like the settings (and dropped from PHP's cache),
read back, and without one the page stops; an empty token never passes. It
also found the page filling in the saved settings (database, user, IAM, the
owner's user id) and listing `backups/` for anybody who opened it — which
matters when the page is uploaded again to a site in use. They now come only
after the token is proven: the token's own **Check** button, pressed by
itself once one is pasted, hands them over (never the password), so the
owner keeps the filled-in form without a second page. On this computer
nothing changed: only this computer can open that page.

**2026-09-29 — Somebody else signing in, in another tab, reloads the page.**
The SDK shares one session with every tab, but what a page loaded stays in
root services (the kanji state, the exam's paper): after another person
signed in elsewhere, the kanji screens showed the first person's progress and
would have sent answers with the second one's token. As the pages before
Angular did, a page that has shown somebody's data loads again when a
different IAM user id signs in — also after a sign-out there; a refreshed
token or the same person again changes nothing, and a page that loaded
signed out simply starts. Clearing each service by hand would miss the next
one added. Until the reload, `AuthService` hands out no token of the other
person — the interceptor and `AuthService.fetch()` (reports, the progress
download) both take theirs from it, so what the page sends meanwhile goes
without a token and is refused — and a retry after a 401 goes out only with
the same person's fresh token. `AuthService.fetch()` no longer uses the SDK's
own `fetch()`, which sends whoever's token the SDK holds.

**2026-09-29 — Any `not_set_up` answer puts up the "not set up yet" page.**
`/api/auth/config` needs only the settings, so a copy whose database is
missing or has no tables started as usual and then showed errors (on a
website, after the Sign in page). Rather than make the first question of
every page load ask the database, any answer 503 `not_set_up` switches the
app to that page (an interceptor, for this site's answers only, and
`AuthService.fetch()`), until a page load. The top bar's Kanji and Exam show
only while the app can be used, since links that lead nowhere should not be
there at all; and a guard on those two routes (`whenReady`) keeps Back and
Forward, which still navigate once the router has started, from loading their
data behind a stand-in page.

**2026-09-29 — A refused or cancelled sign-in says so in the IAM's words.**
The Sign in page put "Signing in did not work:" before every failure. For
`access_denied` the IAM's `error_description` is a sentence meant to be shown
as it is — "The sign-in was cancelled" when the person went back from its
page, or the refusal itself ("This account cannot use Japanese Academy") —
and the app decides nothing from it (the IAM's `docs/api.md`). So that
sentence stands alone, with a full stop, as in the owner's other apps
(`describeSignInFailure()`); any other failure keeps the prefix.

**2026-09-29 — A migration that fails at the server's start does not stop
it.** It was reported as "Cannot reach the database … Is PostgreSQL
running?", and the server exited, so the setup page could not be opened
either. Now `db_migrate()` names the failing file in its error (for the
server's start, the setup page and a website's error log alike), and the
server says so and serves: every address with data answers 503 with the
reason, and each request tries again. A database it cannot reach at all
still stops it.

**2026-09-29 — The answer bar's verdicts have fill colours of their own.**
In dark mode the white answer on the light green, red and amber of the
verdicts read at 2.2–2.9:1. `--good-fill`, `--bad-fill` and `--ok-fill` stay
dark enough under white in both themes (at least 4.8:1), as the item colours
do, rather than turning the text dark in dark mode; `--ok-text` is the amber
as small text on the page (the changelog's heading, a flagged exam question).
