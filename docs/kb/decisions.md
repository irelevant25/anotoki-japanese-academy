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
*(Superseded 2026-09-30: the UI is in English and Slovak, from the database,
and every date and number follows the language on the page — see "The app's
words live in the database".)*

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
*(Reversed 2026-09-30: the IAM's sentence is English, and the page is now in
the reader's language — a refused sign-in is worded from its code.)*

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

**2026-09-30 — The app's words live in the database, in English and
Slovak.** The owner's decision, as on the other anotoki sites: what the app
itself says is a key with a string per language (migration 004: 392 keys,
`languages` / `translation_keys` / `translations`), and the owner rewords
them in the browser (`/translations`, `/languages`). Not files in the build:
the next upload would overwrite them, and a website has no shell to edit one
with. English is the fallback, string by string, so it cannot be hidden,
deleted or left empty; Slovak is informal ("ty"), the owner's choice for
this app. A key
with no string shows as the key itself, on purpose: the owner wants to see
which is missing (a console warning too, which fails the browser suites).
Keys are the code's — migrations write them, the pages only change strings —
so a new or reworded string is a new migration, and a migration's insert
steps aside for a string the owner reworded.

**2026-09-30 — What is not translated, and why.** The study material: the
kanji, the words, their readings and English glosses, the exam's questions,
options and explanations, the learner's notes — the course is learned from
English, and answers are checked against English glosses. The SRS stage and
group names (Apprentice … Burned) are WaniKani's and stay English, from one
source, the server's constants (the frontend's own copies went; the home
page gets them on the summary's groups). The grammar terms, the grades, the
brand, the changelog's entries. The two owner pages are English, the
owner's decision (they list the keys beside every language's strings). The
material stands in a
sentence as a placeholder, and on the page carries `lang="en"` or
`lang="ja"` whatever the page's language.

**2026-09-30 — The exam report stays English.** It is a standalone HTML page
the server renders at submit and stores with the attempt; stored rows are
never rewritten, and wording it per language would need server-side strings.
The link to it is translated and says `hreflang="en"`. A known limit.

**2026-09-30 — A failure is worded from its code; a refused sign-in too.**
The server puts a `code` beside every sentence (`sign_in_required`,
`invalid_token`, `no_access`, `this_computer_only`, `not_up_to_date`,
`database_unavailable`, `server_error` …), and the page words it in the
reader's language (`core/i18n/error-text.ts`, through a table: an unknown
code is `error.unknown`, never a key made from the code). The server's
sentence stays for the command line, the logs and the tests; under PHP's
built-in server a `detail` carries the reason for the owner. This reverses
2026-09-29's "in the IAM's words": a sign-in that came back without one is
worded from its code — `access_denied` is one sentence true whether the
person went back or the account was turned away — and the IAM's English
sentence is not kept. The owner pages, English, still show the server's
sentence.

**2026-09-30 — Numbers and dates follow the language on the page.** Before,
words in dates were `en-GB` and numbers and numeric dates followed the
system's locale (Slovak on the owner's computer), so an English page read
"22. 9. 2026" and "11 481". Now everything goes through `Intl` with the
language's own locale — `en-GB` for English, `sk-SK` for Slovak — whatever
the system's is: "24 Sept 2026", "11,523" on an English page, "24. 9. 2026",
"11 523" on a Slovak one.

**2026-09-30 — The words are one public bundle.** `GET
/api/translations/{code}` is the third address without sign-in (after
`/api/auth/config` and `/api/health`): the app's own words hold nobody's
data and are the same for everybody, and a page needs them before anybody
signs in — on the Sign in page, and when a session has run out. No token is
looked at (the browser sends none: a plain `fetch()`, outside both
interceptors), the answer is the same in both modes and for any `Host`, and
it is revalidated each time (`ETag`, `no-cache`), because the owner's
rewording must show at the next page load. The browser keeps the last
bundle, so a returning reader never sees keys while it is on its way.

**2026-09-30 — ADMIN means the owner's pages.** The two IAM roles studied
alike until now; `ADMIN` now also opens the Translations and Languages pages
and their `/api/owner/…` addresses, decided in one place on the server
(`middleware/owner.php`). Without sign-in the owner is this computer (mode
`none` holds every role), and an `Origin` of another host is refused, since
a page of another site can reach 127.0.0.1 from the owner's browser.

**2026-09-30 — Each database holds its own strings.** The owner's computer
and the website have a database each, and each its own words: migrations
seed both, and a string reworded in one does not reach the other. Export and
import (the Translations page, or `php backend/translations.php`) are the
bridge; a backup of everybody carries the strings too, and a restore passes
them over, since they are the site's and not anybody's study data.

**2026-09-30 — A new language starts hidden.** With no string of its own it
would read in English throughout, under its own name in the chooser. The
Languages page adds it hidden unless the owner ticks the box (the API offers
it unless told `enabled: false`; the page always says which). Slovak, which
the migrations write strings for, can be hidden but not deleted: the next
migration with strings would fail on the missing language, and a failed
migration closes a site that has no shell to mend it from.

**2026-09-30 — "Academy" gives way to the chooser on a phone.** The language
chooser sits beside the version in the top bar, in every state and mode. To
fit a 360 px screen signed in, with a three-digit due badge, in Slovak, the
word "Academy" hides at 440 px and below (up to 370 px before). The kanji
tabs got a little tighter at 440 px and below (5 px a tab, no gap) so all
five fit 390 px in Slovak, whose words are about 50 px wider; in English
they fit 360 px. `npm run screens` measures both.

**2026-09-30 — The chooser keeps its keys to itself.** The lesson quiz, the
reviews and the exam listen for keys on `document`, where Enter submits a
card or, on a paper's last question, stores the attempt. Every key pressed
inside the chooser or the account menu stops there (`core/menu-keys.ts`),
and a switch of language changes words only — no screen is made again, so a
session or a paper goes on where it was. The browser suite checks it by keys
on a review card and on a paper's last question.

**2026-10-04 — The IAM is the one way to sign in (follows 2026-09-27 "no
sign-in on the owner's computer" and 2026-09-28 "mode `none` also wants the
request to have come straight to this computer").** The owner's decision for
the whole anotoki family: "There is no need from project to support no iam
alternative/version of the projects. The IAM should be the only option." Mode
`none` is gone from the backend (`auth_mode()`, `auth_none_allowed()`,
`auth_none_only()`, the 403 `this_computer_only`), and with it the owner id it
acted as (`auth.local_user_id`, `auth_local_user_id()`, `src/owner.php`,
`manage.php --owner-id`). On a computer the app signs in against the
development IAM. `auth_from_this_computer()` stays: it decides what this
computer is told (the setup page without a token, a not-set-up answer's
reason, health's database), never who anybody is.

**2026-10-04 — A token with no role here is a learner (follows 2026-09-27 "a
token without a role here is refused").** "Every project should be available
for every user not just admin or editor." IAM migration 007 opens every
first-party site to every account and deletes the `MEMBER` role; refusing a
token without a role would then lock out everybody but the IAM's
administrators, so this release goes live before 007. A stale `MEMBER` in a
token means nothing.

**2026-10-04 — ADMIN and EDITOR, checked on route groups.** "The admin
consoles only for admins and editors with different rights": `EDITOR` rewords
the app's words (reads and saves the strings, exports and imports a
language's); `ADMIN` also adds, changes and deletes languages (and, to come,
deletes a person's data). `/api/owner/…` became `/api/admin/…` (the survey's
prefix) in two Slim groups with the checks on the groups
(`staff_middleware()`, `admin_middleware()`), so a route added later cannot
forget its check; 403 `staff_only` or `admin_only`, never a 401. The `Origin`
check of the owner's addresses (`wrong_origin`) went with mode `none`, which
it existed for: every request there carries a bearer token, never a cookie.
"Applies database updates", the family's other ADMIN right, needs no button
here: the app applies them by itself on the first request after an upload.

**2026-10-04 — The setup page asks for the database and the IAM, nothing else
(follows 2026-09-27 "a web installer" and 2026-09-29 "one setup page for every
copy").** "Had to specify admin id and time zone and backup stuff which is
weird": the sign-in choice, the owner's IAM user id, the time zone, the backup
upload and the `backups/` list, the first version's settings
(`src/config.local.php`) and its JSON files' import are gone. New copies
default to the database `anotoki_japanese` on port 5432 (the owner's
`anotoki_japanese_academy` keeps its name). **Test connection** answers in the
family's words, the survey's, so its button is **Save**. What is saved is
shown on this computer only; a website's page shows none of it, before the
token or after (an empty password still keeps the saved one).

**2026-10-04 — Old settings keys are ignored, not refused (follows 2026-09-29
"the settings are required").** `auth.local.php`'s `mode` (`iam`) and
`local_user_id`, and `app.local.php` with its `timezone`, are what every copy
set up before holds, the owner's and the website's: refusing them would close
both the moment the code lands, and a website's setup page is locked by then.
Only `mode` `none` is "not set up" ("sign-in without the IAM is gone: open
/setup.php and save"): such a copy has no IAM to name. Until each person's
own time zone, review times and days follow the server's own zone.

**2026-10-04 — Every PHP test signs in.** With one way to sign in there is no
server without it: `call()` goes as `TEST_USER` (1, no role) through the test
IAM unless a test sends another token or none (`no_token()`), and the stand-in
IAM (`backend/tests/tools/stand-in-iam.php`, extended rather than a third
file, as the review of the plan asked) signs in by redirect, for the tests now
and for the browser suites with their own change. A version-1 backup restores only with `--user=N`: it
names nobody, and there is no owner id to take for it.

**2026-10-04 — A clean top folder, like every anotoki site's (follows
2026-09-23 "the one-click launcher stays" and 2026-09-29 "backend/ +
frontend/").** The owner: "the project has weird root files like package and
package.json and nmvrc etc. Any other project has clean root structure." The
top folder holds `.claude/`, `.gitignore`, `CLAUDE.md`, `README.md`,
`DEV.md`, `backend/`, `frontend/` and `docs/`, nothing else. `data/` became
`backend/data/` (moved with `git mv`, every file byte for byte the same; the
content stamp names the paths, so each copy rebuilds its study content once);
the backups moved from `backups/` to `backend/storage/backups/` (gitignored
with the rest of `storage/`); the root `package.json`, its lock and
`node_modules/` went: the scripts are documented in their direct form
(`node backend/tools/php.js …`, which finds a PHP 8.1+ where Git Bash's `php`
is 7.4, and the `node frontend/…` scripts after
`node frontend/scripts/ensure-build.mjs`), and the PDF tool's `sharp` has its
own `backend/tools/pdf/package.json` and lock. `.nvmrc` moved to
`frontend/`; `start.ps1` and `start.sh` were deleted. `frontend/package.json`
stays the owner's: its `e2e`, `e2e:setup` and `screens` scripts are as they
were. The audio key's `.env` is `backend/.env`. The upload follows: `public/`
and `backend/` and nothing beside them; a site set up before moves its
`data/audio/` and `backups/` once (hosting.md, *The one-time move*).
`backend/README.md` and `frontend/README.md` map each half.

**2026-10-04 — `progress/`, `results/` and `reports/` deleted (follows
2026-09-23's history rule).** The owner's decision: the files of the app
before the database were never imported into it, and git keeps them. The rule
that forbade deleting them now forbids bringing them back; the source-name
test no longer leaves them out.

**2026-10-04 — `router.php` instead of `server.php`.** "I prefer the same
way: php -S localhost:8200 router.php instead of php server.php."
`composer start` in `backend/` is `php -S localhost:8200 router.php`, as on
every anotoki site, beside `npm start` in `frontend/`. The router is what
`server.php`'s built-in-server branch was (the API, the setup page, the built
app, through `api/front.php`); the start-time work `server.php` did before
serving (migrations after a raw copy, the content rebuild, the day's backup)
was already every request's on a website (`upkeep_middleware()`,
`daily_backup_middleware()`), and now is on a computer too: nothing needs a
restart. The summary it printed is `php backend/manage.php --check`'s
(people, kanji items, exam questions). `composer start` runs with the
`php.ini`'s OPcache; the tests keep `-d opcache.enable=0` (environment.md).

**2026-10-04 — Each person's own time zone; the site's housekeeping in UTC
(follows 2026-10-04 "the setup page asks for the database and the IAM").**
The owner found it "weird" that the setup page asked for a time zone: one
zone for everybody makes no sense once everybody may study here. The
browser names its zone with every request (`X-Time-Zone`, an IANA name PHP
knows, anything else ignored); it is that request's zone, kept on the
person's row (`users.time_zone`, migration 005) when it changed, and a
request without one uses the kept one, else UTC. Every day and hour of the
person's follows it: a review rounded to their hour, the day an answer counts
on, the dashboard's today and forecast, a stored report's date. What a
traveller sees: each answer stays on the day of the zone it was given in;
today follows the new zone from its first request; review times are moments.
The site's own housekeeping (the backups' names, the day of the daily backup)
is UTC, whoever's request it is, so somebody far east cannot take tomorrow's
copy today; the database session is UTC. Without the column (an upload whose
005 is still arriving) the header still counts and nothing is kept: never a
500. Tests give the clock in process and use Pacific/Kiritimati and
Pacific/Pago_Pago on the server, whose dates always differ, as the review of
the plan asked: no test depends on when it runs.

**2026-10-04 — Every person exports and imports their own data; a file
replaces, after a copy.** "The import/export the users data should be
available for every user." `GET /api/me/data` gives all of a person's data
in the backups' format (version 2, one person, no database name);
`PUT /api/me/data` brings such a file back. It replaces, never merges (a
merge would count days and answers twice, and there is no sensible merge of
two schedules); before it, a copy of what it replaces goes to the backups
(their last 14 kept). It takes the file's one person whatever their id (a
file of another copy of the app), or the caller's part of a backup of
several. Import and answers take turns on the person's `users` row (`FOR
UPDATE` against `FOR SHARE`), so an answer during an import works on what the
import brought; the `imports` row is an upsert, so imports never collide. The
size limit is a 24th of `memory_limit` (at most 16 MiB), not `post_max_size`,
which PHP applies to a POSTed form only, as the review of the plan suspected
and a test confirms; a file once read takes about seven times its size. The
kanji-only download (`/api/kanji/export`) went: the file holds all of it.

**2026-10-04 — Version-1 backups are no longer read.** Every backup there is
is version 2 (the owner's of 2026-10-01 among them), and the owner id that a
version-1 file was restored into is gone. `backup_read()` refuses one as
"another version (format 1)"; `manage.php --user` went with it (follows
2026-09-27 "a version-1 file is the owner's" and stage 1's `--user=N`).

**2026-10-04 — People: the administrators see who has data, and delete a
person's.** In the admin area's inner group, for `ADMIN` alone (the family's
split: deleting a person's data is ADMIN's). `GET /api/admin/people` lists
everybody the site has data of, with how much they studied;
`DELETE /api/admin/people/{id}` takes a copy of all of that person's data
first, then deletes their rows and their `users` row in one transaction
holding that row `FOR UPDATE`. A request of theirs still on its way waits,
finds no row, and makes it again: their data starts afresh instead of the
request failing on a missing row (the race the review of the plan found).
Strings they reworded stay, by nobody. Their account is the IAM's.

**2026-10-04 — A migration being written waits as a draft.** The owner's
`composer start` serves this working tree, and the app applies a whole
migration at the next page load: a migration written in parts there would
reach the owner's database half done. So 005 sits in `backend/migrations/`
without its `-- end of 005` line until it is final (the app's own rule makes
it wait, with the study content's rebuild), and says so at its top. The tests
apply it on their throwaway databases only, by name
(`ACADEMY_MIGRATION_DRAFTS`, honoured for `academy_test_…` names alone), so
a file a test leaves half on purpose still waits; the template is made afresh
when a draft changed. The last line is written last. (The review of the plan
offered this or keeping the draft outside the repository; this one keeps the
key test and the tables the code needs in step while it is written.) 005
got its last line on 2026-10-04, after the reviews of the whole change.

**2026-10-04 — Signed out, straight to the IAM; the card only after a failed
sign-in.** The family's rule ("opening any page while signed out sends the
visitor to the IAM's sign-in, and back to that page"), ported from the
survey's `signInGuard`: `canActivateChild` on the learner's pages and
`canActivate` on `/admin`, so every navigation asks. It follows 2026-09-27
"Signed out, a Sign in page, not a jump to the IAM": the worry then — a
sign-out signing the person straight back in — does not come true, because
the IAM's own session ends with Sign out, so the IAM shows its sign-in page.
The Sign in card stays for the cases the redirect cannot serve: a sign-in that
came back refused or cancelled, or that could not start (the browser refuses
the storage the SDK keeps it in) — sent straight back the browser would go
round for ever — and a session that ends while a page is open (as the
survey's pages do: its layouts draw the card when nobody is signed in). The
next navigation from there goes to the IAM by itself. `/auth/callback` is not
behind the guard.

**2026-10-04 — The admin area is `/admin/…`, split by role in the browser as
on the server.** Translations for EDITOR and ADMIN, Languages and People for
ADMIN (`staffOnly`, `adminOnly`); the frontend hides, the server refuses. The
old `/translations` and `/languages` lead to their new addresses. "Admin" in
the account menu, English like the area. Database updates keep applying
themselves at the first request after an upload, so the area has no Apply
button (the plan's decision: nothing can stall waiting for an ADMIN). Until
the family's top bar comes, a line of links over each admin page leads between
them (`admin/admin-nav/`).

**2026-10-04 — Your data lives on the home page, and asks before it
replaces.** A card at the foot of the home page (the dashboard's foot links
to it), not in the account menu (the family's menu stays as specified). A
file is read in the browser first, with the server's own rules, so a file that
is not one, or a backup of others, is refused before anything is sent; then
the card says what the file holds and asks; only Yes sends it. The size is
checked against 16 MiB (the server's most, held together by a test) and,
after a 413, against the limit that server named — there is no fixed limit to
mirror, since it is a share of the host's `memory_limit`. The question is a
dialog of the card's own, worded from keys (the admin area's confirm is
English by design).

**2026-10-04 — Signing out waits for the saves on their way.** The answers of
a lesson, a review or practice are saved in the background and a note a
moment after the typing stops, so a Sign out pressed right after could lose
them. The session, the notes editor and the exam tell one root service
(`SavesInFlight`), which the account menu (and the family's bar after it) can
reach where it cannot reach them; Sign out sends a waiting note at once, waits
for every save with a spinner, and asks in the learner's language — the
browser's own dialog, as a session's "End now?" — when a save failed meanwhile
or an exam paper is open and not handed in (the review of the plan found the
waiting had no mechanism).

**2026-10-04 — Each request names the reader's time zone; the pages count no
days.** The interceptor and `AuthService.fetch()` send `X-Time-Zone` (the
browser's IANA name) to this site only. Which day an answer counts on, today,
the forecast, come in the server's answers; the dashboard names the forecast's
days by the dates the server says they stand for (`forecastDates`, the
person's dates), not by a calendar of its own. (At first it named them by
24-hour steps from the server's `now`; the review found that a day off for an
hour round a change of summer time, as the server's days start at the
person's midnight.)

**2026-10-04 — Time zones are checked against ICU as well as PHP, reports
never fail on a zone; a data file must be in the app's own shape; the upload
build refuses a draft migration.** From the academy-code-reviewer's review of
stages 1-3 of the family's port. PHP and ICU (intl) each carry their own copy
of the zone data, and a report is dated through ICU: a zone only one of them
knows is no zone (`time_zone_known()`), and `report_when()` dates a kept zone
ICU lacks at its offset rather than failing. A file brought back on Your data
is taken only in the shape the app writes (`me_person_in()`), so a half file
is refused before anything changes. `build-dist.php` refuses while a
migration lacks its last line: an upload with a draft would wait on it, and
the content rebuild with it.

**2026-10-04 — The anotoki family's top bar.** The app's own bar (the 日 and
"Japanese Academy", the version beside them, a `<details>` account menu) gives
way to the bar every anotoki site has (the survey's is the reference): the
mark, "anotoki" and "Japanese", the links, the language, a theme switch, the
person's menu or Sign in; on a phone one menu button. The 日 stays the tab's
icon. The app has no Home link: the brand is home, as before. The version
and "What's new" moved to the foot of every page, where the family keeps
them. The admin area's line of links (`admin-nav/`) went: the bar's links are
the area's pages there.

**2026-10-04 — No key pressed in the bar reaches the page.** The lesson quiz,
the reviews and the exam listen for keys on `document`, where Enter submits a
card or hands a paper in and Space plays a word. The survey's bar keeps keys
only inside its menus; here the review of the plan found that the buttons,
links and theme switch outside them would have fed Enter and Space to the
exam (and the exam's `preventDefault()` would have stopped the buttons
working). So the whole header stops every key and handles Escape itself;
specs press every control of the real bar over a real paper and review.

**2026-10-04 — The fold stays at 760 px, measured.** The plan asked for
Japanese's own number, measured with the real labels: at 761 px, in Slovak,
with 999 reviews due and signed in, the row needs about 653 px (English 642),
and signed out with "Prihlásiť sa" less (no links then). The family's 760
leaves room to spare, so Japanese keeps it, and the spec, the scss and the
tests share one number (`PHONE_BAR_MAX`). On a phone the reviews due stand on
the menu button, and its name says them ("Menu: 125 reviews due"), so the
count is not hidden with the Kanji link inside the menu.

**2026-10-04 — The admin area reads in English, by the translation service,
not by the bar.** The survey's pattern: the title strategy tells the
translation service the address (`noteAddress()`), and under `/admin` it
answers from the bundle's English (`pageLanguage`, `<html lang>` with it); the
bar, the foot and the "What's new" dialog have no case of their own. The
reader's choice stays (`language()`): the chooser — hidden there — and the
IAM's pages go by it. The area's own labels in the bar (its sections, the
brand's name there, "Back to Japanese Academy") are English words in the
template, like the area's pages, not keys nobody would read in Slovak.

**2026-10-04 — A migration waits for an administrator's Apply; the area is
"the admin panel".** The owner asked for the IAM's Migrations page in every
site, where pending migrations are seen and applied, and for the area to be
called the admin panel everywhere. Until now the first request after an
upload applied a whole migration by itself (upkeep); now it waits: every
address with data answers 503 `not_up_to_date` (the problem page; an ADMIN
gets "Open the Migrations page"), and an ADMIN applies it on
`/admin/migrations` (the IAM's page shape and words; ADMIN alone, the
owner's split: applying database updates is ADMIN's). Its addresses skip the
waiting check and so does the admin panel's start for an ADMIN
(`TranslationService.refused()`), or nobody could reach it. Kept: the raw
copy of every table before applying, one per upload (now taken by Apply);
the content's rebuild stays automatic once the schema is current; the setup
page and `manage.php` apply as they did, now under the same lock and in the
same way as Apply (`upkeep_apply_ready()`), so an Apply and a `manage.php
--sync` never run at once. Apply waits for the upkeep's lock up to 10 s,
since every request with data takes it for a moment to look while a
migration waits (a single try was refused again and again on a site in
use), then answers 409 `busy` (never a queue of Applies), and applies each
file under a savepoint, so a failure rolls that file back whole and names it
while the ones before it stay, as the IAM's does. "Up to date" only when
nothing is left pending, and after an Apply the panel asks for the app's
words again, so going back to the learner's pages without a page load draws
them in words. A file still uploading is listed
"not whole yet" and blocks nothing (the site goes on, as before). The
reworded strings (`topbar.admin` "Admin panel" / "Administrátorský panel",
`error.not_up_to_date` without "try again in a moment") and the link's new
key are migration 006, as 005 is applied in the owner's database. The admin
bar folds at 960 px, not 760: its four links and the longer brand need 886
px; on a phone its brand reads "admin panel". The e2e suite makes a
migration wait by taking 006 off the list (it re-applies without change),
since no test writes into `backend/migrations`.

**2026-10-04 — A light, dark or the system's look, per device.** The family's
switch, new for this app (dark followed the system only). A choice of light
or dark is `<html data-theme>`; the system's is no attribute, and the tokens'
media query decides (`:root:not([data-theme='light'])` under
`prefers-color-scheme: dark`, and `:root[data-theme='dark']`). Kept in
`localStorage` (`academy-theme`), about the screen, not the person;
`public/theme-boot.js` sets it before the first paint, so a dark choice
never flashes light (a file, not an inline script, for a strict CSP). The
plan said `main.ts`, which runs only after the bundle has loaded.

**2026-10-04 — The browser suites sign in through a stand-in IAM process,
not inside the browser.** Until now `run.js` answered the IAM's addresses
inside the browser (`emulateIam()`, `page.route`), on a second server in the
sign-in mode `none` of before. With one way to sign in, every suite now
starts the tests' own stand-in IAM (`backend/tests/tools/stand-in-iam.php`,
the one the PHP tests and the setup page's Test connection already use, as
the review of the plan asked: no third stand-in) on a free port of this
computer, and names it the issuer of its servers: a page opened signed out
really goes there and back, with PKCE and the app's own callback, exactly as
on a website. `iamState()` says whom it signs in or that it refuses; a
planted session (`plant()`) is kept for the many contexts that only need to
be signed in. `emulateIam()` is gone. A website's address in `setup.js` is
not this computer's, so Edge is told to treat it as secure
(`--unsafely-treat-insecure-origin-as-secure`): the sign-in's PKCE needs
`crypto.subtle`, which a real website has through https.

**2026-10-04 — A failed migration shows PostgreSQL's own words on the
Migrations page, on a website too (follows "A migration waits for an
administrator's Apply").** The owner: "I would like from piano, japanse and
builder to show full error as iam does." Until now the Apply's answer said
why a file failed (`error`) only under PHP's built-in server; a website got
null and the page said "The server's error log says why". Now `upkeep_apply()`
always gives the exception's message, as the IAM's page does: under "Stopped
at …", what was applied first, "The failed file was rolled back as a whole."
and the error in a box. Only an ADMIN reaches that address, the error says
what to fix, and on FTP-only hosting the server's error log is hard to get
at. It is logged as well (`[upkeep] a migration failed: …`). It is the one
exception to `error_reason()`: every other failure still tells a website no
more than a sentence and a code (a database that cannot be reached names its
user and host). The Apply still answers 200 with the failure inside, as
before (the IAM answers 500; nothing calls the address but the page).

**2026-10-05 — Whether sign-in is required is the IAM's to say; the IAM's
SDK reads it; sign-in stays required until visitors can be kept.** The
owner, for the whole anotoki family: "I would like to be able to setup if
log in is required for a specific project and also what roles can log in to
a specific project. The default role for users should be member." IAM
migration 010 gives every application a "Sign-in required" switch and every
account `MEMBER` again. This site reads the switch through the IAM's PHP SDK
1.1.0 (`anotoki_iam_login_required()`), copied unchanged like the rest of
it, instead of a fetch of its own: one reader for the whole family, with one
rule (kept a minute in `backend/storage/cache/`, the last value when the IAM
is away, true whenever nothing better is known - a 404 included, so this
site ships before IAM 010) and one test seam (`application_file`, honoured
for a throwaway database only, as the keys file is). `src/access.php` adds
only that term and one of its own: while the database cannot keep visitors
(migration 007, not written yet: `visitors_ready()`), sign-in is required
whatever the IAM says (asked only when the IAM says no, so the relay needs no
database otherwise); the relay
(`/api/auth/config`'s `loginRequired`) and, when visitors come, the API use
that same answer, so the browser and the server never disagree about it.
`MEMBER` in a token is an ordinary learner: nothing here needs it (the IAM
already decided who may sign in) and nothing refuses it. Only the Bearer
scheme claims to be somebody (`auth_sent_token()`): `Bearer` with nothing
after it is a token that does not verify (401 `invalid_token`), while
`Basic …`, which a host behind a password file sends with every request,
claims nobody - so once visitors come it can never turn a visitor into a
failed sign-in, nor a person into a visitor.

**2026-10-05 — Visitors: the server side (migration 007 written as a draft,
final once the browser suites had passed; the browser's side is the next entry).** The owner: "The visitors will have automatically
created account ... with all data there. Its just they can lose their data
because they are not stored via credentials. But when they register the data
could transfer." The build analyzer's visitor accounts are the pattern; what
differs here, and why ([sign-in.md](sign-in.md), *Visitors*):
- **Nobody reads as an empty learner** (user id 0, which no row has), so the
  kanji pages, a paper and the attempts work for a first-time visitor
  without a "nobody" state in every page; nobody's resets answer at once and
  write nothing (no backup file for user 0).
- **The visitor is made in the save's own transaction** (under an advisory
  lock, the limits counted on the visitor rows themselves): a save refused
  or failed makes nobody and counts nothing - no counters to give back.
- **The order of the rules with 007 pending** (the critique's item 7): one
  expression, `access_login_required()`, which says "required" while the
  database cannot keep visitors, decides the 401. So a key sent then is 401
  `sign_in_required`, which the browser keeps its key on, and never a 503;
  503 `visitors_unavailable` is left to the move (which works whatever the
  switch) and to the defensive checks inside `visitors_find()` /
  `visitors_make()`.
- **The merge at sign-in** (the coordinator's answer, the owner may reverse
  it): the person's progress stays per item both studied, every other item
  moves, the day counts are added, every exam attempt moves (an id both have
  keeps the person's), the log moves but for the visitor's resets of what the
  person kept; a copy of the person's data first. Items are scheduled one by
  one, so a per-item merge is coherent; adding the days keeps every answer
  given.
- **The caps** (the coordinator's answer): 10 exam attempts and 20,000
  answers per visitor, 300 visitors at once, 10 new ones an hour per address
  and 60 in all - each a setting of `app.local.php`. A visitor at the attempt
  cap is refused the paper, not only the submit, so no paper of up to 1,200
  questions is answered in vain.
- **No earlier sweep of "thin" visitors** (the family's design): the notice
  promises 30 days after the last visit; somebody filling the 300 from many
  addresses keeps new visitors out for those 30 days, and
  [hosting.md](hosting.md) names the knobs instead.
- **No data file for visitors**: no download, no copy before their reset or
  the move, none in a backup (`users_all()` is people only; the day's copy is
  taken only when people have data). A restore of everybody deletes them.
- **The address is kept as an HMAC** under a secret in
  `backend/storage/cache/`, so no copy of the database holds an address and
  the few billion IPv4 addresses cannot be tried against it without the
  secret.

**2026-10-05 — Visitors: the browser's side (migration 007's strings with it;
the family's design 4.3).** Built to the critique of the plan, whose one high
finding was in the browser: tying the visitor key to "no token" would let a
signed-in page whose token came back null (a session ended, another person's
sign-in in another tab pending this page's reload, a host that drops
`Authorization`) send a save without a token - the server would make it a
visitor, and the next sign-in would move that person's answer into whoever
signed in. So ([sign-in.md](sign-in.md), *Visitors in the browser*):
- **Whose a request is, is decided as it is issued**, from what the page is
  shown as (`AuthService.caller()`, or the request's own `ISSUED_AS`): a page
  shown to a visitor (the state `visiting`) issues visitors' requests; any
  other page with a sign-in, a person's - with a token, or **not sent at
  all** (a 401 `sign_in_required` of its own). A key arriving on a person's
  answer is not kept, and that answer fails (a 502 `server_error`): the
  server never saw the token (a host that drops `Authorization`, with
  sign-in off), so the save went to a new visitor, not to them - better said
  as not saved than lost silently. `AuthService.fetch()` keeps the same rule
  for the token (it only reads: no visitor is made on a read).
- **A person's page never turns into a visitor's**: its session ending is
  the Sign in card, as before; only a fresh page load can be a visitor's.
  And a page shown to a visitor loads again when somebody signs in in
  another tab, so nothing loaded as the visitor stays on it.
- **The key is kept when sign-in becomes required** (correcting the design's
  section 2: "forgets"): not sent, a 401 `sign_in_required` never forgets
  it, so a sign-in still moves what it holds. A 401 `visitor_unknown`
  forgets only the key that was sent (compare and delete), and the request
  is tried once more without it.
- **One visitor per browser**: the first save that may make one goes alone;
  what is issued meanwhile (reads too) waits for its answer and goes with
  its key, or one at a time again when it failed. The first key stays.
- **Signing in from a visitor's page waits for the saves on their way**, as
  signing out does, and asks when something would be lost: the first save
  brings the key, and cut off by the page leaving for the IAM its study
  would stay behind, out of the move's reach. On a phone the bar's menu stays
  open while it waits, as for Sign out (the UI tester's finding: closed at
  once, a phone showed the wait nowhere - up to 20 s with slow saves - and
  the focus fell on `<body>`); the focus waits on the menu button, and the
  menu closes with it there.
- **The move at the start** (5 s at most), before the words and the first
  page, so the first page shows what moved; asked again later on a failure.
  A key another tab moved first is silent (the moved key is stamped in
  localStorage); one the server let go is said once.
- **A refused sign-in while visiting is said** above the page (in the Sign in
  card's words) - the IAM turning an account away is how an administrator
  blocks somebody here (`MEMBER` taken away), and it is not swallowed.
  Blocking stops signing in, not visiting: to keep somebody out entirely,
  require sign-in.
- **`/admin` stays a signed-in person's** while visiting
  (`adminSignInGuard`): a visitor opening the Migrations page goes to the IAM
  and back, as somebody signed out does.
- The words are 007's (the notice a plural family on the days; the moved note
  with its numbers after a colon, so no word must agree with them; the
  limits worded from which limit the answer names), in English and informal
  Slovak, as every string here.
- **007 was made final only after the browser suites had passed** with it
  (`run.js`'s visitors part: a whole visitor's life, from a page with no trip
  to the IAM to the move at sign-in, and sign-in switched on with a key
  held): the owner's computer and the site take it from then on, by an
  ADMIN's Apply. The release notes (0.2) say it in two lines: you can study
  without signing in where the site allows it, and the old "you always sign
  in" became "unless the site lets you study without signing in" - the
  site's own default stays sign-in required.

**2026-10-06 — The family's visitor counter, without the query string.** The
owner asked for Umami - the family's own, at `umami.anotoki.eu` - on every
anotoki site. `frontend/src/index.html` loads its script (no policy here
names scripts for the app's pages; a report's own still allows none). It sets
no cookie and stores nothing in the browser. It is told to leave the query
string and the fragment out (`data-exclude-search`, `data-exclude-hash`): the
sign-in comes back to `/auth/callback?code=...&state=...`, and the script may
read the address before the app has run - a counter that kept it would hold
every sign-in's code. It is `async`, so the app never waits for it. The paths
still go, which is what the counter is for. The browser suites are not
counted: Umami answers a headless browser and keeps nothing.

**2026-10-06 — The theme, the dates and the clock are the account's; the
browser SDK is v1.2.0 (follows 2026-10-04 "A light, dark or the system's
look, per device").** The owner's decision for the whole anotoki family (the
IAM's `docs/decisions.md`, the same day): "it should be in the iam only and
apply for every project/application"; asked, the owner chose that a site's own
controls save to the account for a signed-in person, and one theme everywhere
- every site, every area of it, admin areas included. The IAM keeps them
beside the language (its migration 015) and sends them in the tokens; its
browser SDK 1.2.0, copied unchanged, hands them over (`user().preferences`)
and saves a change (`savePreferences()`). Here
([sign-in.md](sign-in.md), *The account's preferences*):
- **The theme**, signed in, is the account's: the switch shows it and saves a
  choice to it (the account's `auto` is this app's `system`), on the
  learner's pages and in the admin panel alike; one save at a time, the
  latest last, and no flicking back while one is on its way (the IAM's own
  `ThemeService` is the reference). The theme shown is still written to
  `academy-theme`, so `theme-boot.js` paints it first. "Per device" stays for
  a visitor and anybody signed out; the account's takes over at sign-in, and
  a device's earlier choice is not carried into the account (the IAM's rule:
  which device should win is not knowable).
- **A refused theme save** puts the account's theme back, and a line under
  the switch says why — in the sentences every failed request already has
  (`error.offline`, `error.http`, `error.unknown`, `error.sign_in_required`,
  `error.invalid_token`, through `preferencesFailure()`), not a new string: a
  new one needs a migration, a draft until the browser suites pass and then an
  ADMIN's Apply on every database, for a line seen only when the IAM cannot be
  reached or refuses. A sentence of its own ("Your theme could not be saved to
  your account") is the owner's to ask for.
- **Dates and clocks**: the account's date order and clock win over the
  language's way when chosen, wherever the pages write one (`core/format.ts`,
  the `localDate` pipe, the admin panel's People and Migrations); the four
  orders and the two clocks are the family's (the IAM's `date-patterns.ts`).
  The exam report's date is not touched: the report is a page stored once,
  when the paper is handed in, in English and the server's locale.
- **The language is the account's too**, as the IAM tells every site to
  treat it (its `docs/integrating-an-app.md`, *The account's preferences*:
  signed in, a site speaks the account's `locale` when it has that language)
  and as the survey site, the family's reference, orders it: for somebody
  signed in through an IAM that sends the account's preferences, the order is
  this tab's `?lang=` and a choice made on this page, then the account's
  language (the token's `locale`), then what this device remembered, the
  browser's, English. A change of the account's language made elsewhere (its
  page, another site, another tab) is followed when it comes, over the
  device's choice and an earlier choice on the page — not over this tab's
  `?lang=`, and not while a choice made here is on its way to the account
  (the answer to an earlier save would turn the page back). The chooser's
  choice is saved to the account, one at a time, the latest last, and holds
  for the visit whatever the account answers; a refusal says nothing and
  puts nothing back — a language the IAM does not offer (`invalid_request`)
  is this site's own for the visit. Signed out, a visitor, or an IAM that
  sends no preferences: the device's choice before the token's `locale`, as
  before, and a changed `locale` followed only while nothing is stored here.
- `AuthService.savePreferences()` asks the IAM only for the person the page
  shows (*A page is one person's*): nothing is sent while the SDK holds
  somebody else's session, signed in in another tab. The SDK then sends that
  person's own token and no other (fixed in the IAM's SDK the same day,
  still 1.2.0, after this site's review pointed at it).
- **One save of the account's preferences at a time, whoever asks** (the
  theme switch or the language): each answer is the whole account, which the
  SDK puts into `user()`, so the answer to an earlier save arriving after a
  later one's would put back what that one changed — and the page would
  follow it back (the code review's finding). The theme and the language
  keep their own "latest choice last" on top of it.
- The dashboard's hour axis follows the clock too (`fmtHour()`: "15", or
  "3 pm" on a 12-hour clock), as its bars' own words do.
- The test that pins the SDK's version (`backend/tests/api/auth.test.php`)
  takes the `.d.ts` as git checks it out where `core.autocrlf` is on: its `$`
  stopped before a `\n` only, and the CRLF copy failed it on the owner's
  computer before this change.

**2026-10-07 — The anotoki library says what the site does while it is not
ready, and applies the migrations (follows 2026-10-04 "A migration waits for
an administrator's Apply").** The owner's words, for the whole anotoki
family:

> When there is a new migration, some sites behave differently than others.
> Japanese won't let me go to the admin or anywhere if I am not logged in,
> but I cannot log in because a migration is waiting. Genshin gives me no
> warning. Piano and survey show me a setup error with buttons to the setup
> page or the migrations page. This needs to be consistent. I do not want
> logged-in users or visitors to see the error about what is going on. The
> admin should see it. If the setup was already done it should never offer
> that button again, especially as setup.php is no longer there.

So the migrations, and what a site does while it is not ready, are one
library now, the same on every anotoki site: `anotoki-lib` 0.1.0 (the
Composer package `anotoki/lib`, committed in `backend/vendor/`, and
`@anotoki/lib`, from its release's tarball). Here
([architecture.md](architecture.md), *The Slim app* and *A whole migration
waits for an administrator*):

- **The deadlock is gone.** While a migration waited, the app's words
  answered 503 `not_up_to_date`, the start stopped on the problem page and
  the router never started — nor the sign-in with it: an administrator who
  was signed out could not sign in to apply it. Now the words, how to sign
  in, the health check, the clips and the Migrations page's addresses answer
  while an update waits (the SiteGate's open addresses); the start asks where
  the site stands first and goes on as ever while an update waits; the guard
  sends nobody to the IAM then, and the library's page stands in front of the
  pages with a quiet **Sign in**, which comes back to the page asked for. The
  browser suite goes that way now: a signed-out administrator signs in from
  that page, opens Migrations and applies.
- **What people read.** A visitor, a learner, an editor: "The site is being
  updated", in the language on the page (the library's own English and
  Slovak) — no error, no code, no button but that Sign in while nobody is
  signed in; it asks again every 30 s and loads afresh once the site is
  back. The site's `ADMIN` (from the token): "A database update is waiting"
  and **Open Migrations**, the one page that works then. Not set up: "This
  site is not set up yet" and the setup page — only while the copy was never
  installed (`backend/storage/installed.lock`, which a website's setup
  writes; this computer's never does); installed once and its settings lost
  since: "The site is not available right now", never the setup page.
  Settings whose database is missing or does not answer read "not available
  right now" too (the library's `unavailable`: the settings are there) —
  until now the app called a missing database "not set up yet" and pointed
  at the setup page.
- **The server.** Where the site stands (the library's `SiteState`:
  `not_set_up`, `update_pending`, `unavailable`, `ready`) is decided afresh
  for every request; its `SiteGate`, in front of every route, answers 503
  `not_set_up` (with `installed`, and `setup` only while never installed) or
  `update_pending` (`Retry-After: 60`); `GET /api/site-status` says it to
  anybody, always. The engine is the library's `Migrator`, set up for this
  site (`db_migrator()`): the `migrations` table as it was, each file whole in
  one exec as ever (`split` off), a draft by the `-- end of NNN` rule, under
  the upkeep's lock. Apply no longer waits up to 10 s for the lock — no
  request takes it to look while an update waits any more (the SiteGate
  answers them first) —: another apply, or the content's rebuild, holding it
  is `busy` at once. The Migrations page's addresses are the library's,
  checked by `ADMIN` in the token alone (`migrations_admin_middleware()`), so
  they work on a database the migrations have yet to build; the page is the
  library's, in its English (the IAM's model, as before), and shows each
  file's SQL now. The addresses that stay open while an update waits are
  each their exact route, never a prefix (the gate reads the path decoded
  once: a prefix would let `/api/admin/migrations/../x`, `%2e%2e` or `%2F`
  past it — the coordinator's finding from the survey site, the same day).
  The Apply asks for 300 s and to finish if the administrator leaves, as the
  site's own Apply did.
- **What the pages do around it.** The top bar offers no section and no
  Admin panel while the library's page stands in (each would lead to it), the
  ADMIN on the Migrations page its link alone, and the tab's title is the
  app's name. An exam paper open when the site stops is kept for the tab and
  put back once it is back ([exam.md](exam.md), *In the browser*): the
  library's page reloads the page then, and its hand-in is refused without a
  dialog; keys never reach a hidden paper or lesson batch. Both came out of
  the checkpoint reviews of this change.
- **PHP 8.2** is the floor (the library's), on the host too. The site's own
  code still parses as 7.4 for the owner's editor
  (`php74-syntax.test.php`); the library in `vendor/` is 8.2 code.
- **Kept**: the raw copy of every table before an apply, one per upload (the
  engine's `beforeApply`); the setup page and `manage.php` applying the same
  way, under the same lock; PostgreSQL's words for a failed file, on a
  website too; the content's rebuild at the first request once the schema is
  current; the problem page for every other failure (an upload whose 004 is
  still arriving, a server error).
- **Gone**: the app's own gates (`middleware/setup.php`, `not_set_up()`,
  `upkeep_waiting()`, `tables_middleware()`, `upkeep_apply()` and the rest of
  its own engine), the reason a not-set-up answer gave this computer
  (`manage.php --check` says it), the app's "not set up yet" page
  (`standin/not-set-up/`, and `keptAround()`, which it alone used) and the
  problem page's link to the Migrations page. Their words go with migration
  008 — a draft: its last line, `-- end of 008`, is the owner's to write once
  they accept that, and the upload is refused until then.
