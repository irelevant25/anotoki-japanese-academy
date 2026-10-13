# Japanese Academy

Study companion for a two-part beginner Japanese course (Greetings and
Lessons 1–23). Two parts, one site:

- **Kanji** — a WaniKani-style spaced-repetition trainer for the course's kanji
  and the vocabulary written with them: lessons, reviews, and unlimited practice.
- **Exam** — an 11,523-question multiple-choice test of the whole course, with
  listening, scoring and a report.

Every word is spoken in two voices, female and male. The app itself speaks
English and Slovak (see *Languages* below); the material stays as the
course has it.

It runs on your own computer or as a website (https://japanese.anotoki.eu);
either way people sign in with their anotoki account, and each has their own
progress — see *The website* below. Open any page while signed out and the
app sends you to the anotoki sign-in, and back to that page. (The sign-in on
your computer goes through the development IAM, which must be running:
`DEV.md`.) Once the anotoki IAM says this site does not require sign-in
(and the database has migration 007, applied on the Migrations page), you may study
without signing in too, as a visitor: what you study is kept for your browser
for 30 days after your last visit, and moves into your account when you sign
in (`docs/kb/sign-in.md`, *Visitors*). A sign-in that comes back without one
(you went back from the anotoki page, or the account may not come in here) is
said on a page of its own, with **Try again** and **Back**.

The bar at the top is the one every anotoki site has: the anotoki mark and
"Japanese" (home), **Kanji** with the reviews due and **Exam**, then the
language (**EN / SK**), a light / dark / your system's switch, and your menu
(your name; your anotoki account; **Admin panel** if you may; **Sign out**). On a
phone the links and your menu are in one menu button, with the reviews due
on it.

Signed in, the look (light, dark or your system's), how dates are written
and the clock (24 or 12 hours) are your anotoki account's: the same on every
anotoki site, and on every page here, the admin panel too. The switch here
changes it for all of them; dates and the clock are set on your anotoki
account's page. Not signed in, each browser keeps its own look, as before.

It replaced the earlier N4 Coach app on 2026-09-23. N4 Coach is still in the
git history.

## Run it

You need:

- **PHP 8.2 or newer** with the extensions `pdo_pgsql`, `mbstring` and `intl`
  (and `curl` and `openssl`, to test the sign-in's address and to make audio),
  first on PATH where you start the backend, and **Composer** for its start
  command;
- **PostgreSQL 13 or newer**, running on this computer;
- **Node.js** (20.19, 22.12, or 24 and newer): it builds the app;
- the anotoki IAM running beside it (`../anotoki-iam`), which everybody signs
  in through (`DEV.md`).

No web server of its own: PHP's built-in one serves the app. Two windows, the
way every anotoki site runs on a computer:

1. In `backend/`: `composer start` (that is `php -S localhost:8200
   router.php`) — the API on http://localhost:8200. Ctrl+C stops it.
2. In `frontend/`: `npm start` — the app on http://localhost:4400, which
   sends the backend's addresses on to 8200. Open it there: the IAM knows the
   app at that address.
3. **The first time**, open the **setup page**,
   http://localhost:4400/setup.php. It asks for the PostgreSQL server, port,
   database (`anotoki_japanese` unless you name another), user and password —
   **Test connection** tries them without saving anything and says what Save
   would do —, and the anotoki IAM people sign in through (on your computer
   the development IAM, `http://localhost:4300`). Nothing else: who may
   administer is a role at the IAM. **Save** writes the settings in
   `backend/config/` (not in git), makes the database and its tables, and
   builds the study content into it. The page stays: open it again any time to
   change the settings. It never shows the password; left empty, the saved one
   stays.

Nothing happens when the backend starts: the first page you open rebuilds the
study content when it changed, and takes the day's backup. A new database
change (a migration) is never applied by itself: until an `ADMIN` applies it
on the admin panel's **Migrations** page, the site says it is being updated
(*Languages* below says how). The backend also serves the last build of the
app on 8200 (`npm run build` in `frontend/`).

The app only listens on this computer (localhost): other devices on your
network can't reach it.

### Settings from an earlier version

A copy set up by an earlier version keeps working: what its setup page wrote
besides the database and the IAM (the sign-in mode, your user id, the time
zone) is simply not read any more. A copy that was set up without sign-in
says "This site is not set up yet": open the setup page and **Save** once, with the IAM.
An old `src/config.local.php` at the top of the folder is not read either:
delete it whenever you like.

### Not in git

These stay on this computer only:

- `backend/config/*.local.php` — your settings: the database, with the
  password, and the IAM (the setup page writes them).
- `backend/storage/backups/` — copies of your study data and backups of the
  whole database (see *Your progress* below). Copy the newest to a new
  computer to bring your progress along.
- `backend/storage/logs/` — the error log the admin panel's **Errors** page
  reads (30 days of it).
- `books/` — the scanned course books (`textbook-1.pdf`, `workbook-1.pdf`,
  `textbook-2.pdf`, `workbook-2.pdf`, `answer-key.pdf`), and your notes. Only
  the PDF page tool needs them. Copy them in by hand.
- `backend/.env` — your Google Cloud key, only needed to make new audio (below).

---

## Audio

The audio is made with **Google Cloud Text-to-Speech**, in two voices
(`ja-JP-Neural2-B`, female, and `ja-JP-Neural2-C`, male). The clips are in git
(`backend/data/audio/`), so the app plays them on any computer, without a key. In
lessons and reviews the two voices take turns; each exam listening question
uses one of them.

You need a key only to make clips for new words (after adding vocabulary):

1. In the Google Cloud console, create a project, turn on billing, and enable
   the **Cloud Text-to-Speech API**. This amount of text stays inside the free
   tier.
2. Under **APIs & Services → Credentials**, create an **API key**, and restrict
   it to the Cloud Text-to-Speech API.
3. Put it in a file named `.env` in `backend/` (git ignores it):
   `GOOGLE_TTS_API_KEY=your-key`
4. Run `node backend/tools/php.js backend/tools/build-audio.php` (or
   `php backend/tools/build-audio.php` when the PHP first on PATH can run the
   app). It only sends the words that have no clip yet; `--dry-run` shows what
   it would send, without a key. The app's next page load picks the new clips up.

---

## Kanji

**1,373 study items**: the 316 kanji of the course's kanji lists (々 aside —
it has no reading of its own to ask for) and the 1,057 words, from the
vocabulary lists and the example compounds of the kanji lists, that are written
only with those kanji. Every word has audio.

### How it works

It follows WaniKani's loop:

1. **Lessons** — new items in batches (5 by default; 3 or 10 if you prefer).
   Each is shown with its meaning, readings and example words, then a short quiz
   fixes it into the schedule.
2. **Reviews** — when an item is due, you type its meaning in English and its
   reading in kana. Romaji turns into kana as you type (`taberu` → たべる).
3. **The SRS schedule** — WaniKani's, exactly: Apprentice I–IV, Guru I–II,
   Master, Enlightened, Burned, with reviews after 4 h, 8 h, 1 day, 2 days,
   1 week, 2 weeks, 1 month and 4 months. A clean review moves the item up one
   stage; a review with mistakes drops it `ceil(mistakes / 2)` stages — doubled
   from Guru upwards — never below Apprentice I.

Vocabulary becomes available once its kanji have been learned — 大学 after 大 and
学 — and is filed under the lesson of its latest kanji.

### What is different from WaniKani — on purpose

- **No time locks.** Take as many lesson batches as you want, whenever you want.
  There is no daily limit and no level gating.
- **Practice, as often as you like.** Drill any item you've learned, at any time
  — all of them, the weakest, recent mistakes, recent lessons, one SRS stage, some
  lessons, kanji or vocabulary, meaning or reading only. Practice keeps its own
  statistics (which power "weakest" and "recent mistakes") but **never changes
  your SRS stages or review times**, so drilling can't knock the schedule out of
  shape.
- **Course order.** Items are grouped by course lesson (3–23) instead of
  WaniKani levels, and you can take lessons from any lesson you choose.
- **No radicals, no ready-made mnemonics.** The course doesn't provide either.
  Every item has two note fields (meaning and reading) for your own mnemonics,
  shown in lessons and on the item page.

### Answers

- Meanings forgive case, punctuation, "to"/"be"/"the"/"a", parenthesised parts
  ("older brother" for "(my) older brother") and small typos, scaled to the
  word's length. A typo that happens to spell another item's meaning is *not*
  forgiven — "night" is wrong for 右, even though it's one letter from "right".
- Number words and digits are interchangeable: "300" = "three hundred".
- Readings accept hiragana or katakana, and katakana long vowels typed out
  (サービス = さあびす). A kanji accepts any of its on'yomi or kun'yomi.
- If you know your answer is right but it isn't accepted, **My answer was right**
  saves it as your own synonym (or extra reading) and counts it. You can review
  and remove these on the item page.

Keys: **Enter** submits, and Enter again moves on. **F** opens the item info
once you've answered. Lessons move with **←/→** or Enter.

### Your progress

Saved in the PostgreSQL database named in your settings. Each answer is saved
whole or not at all, and every answer is also written to a log that is never
changed.

Days and review times follow your own time zone: the one your browser is in.
An answer counts on the day it was given where you were; when you travel,
"today" is the new place's day from the first page you open there.

**Your data**, at the foot of the home page (the dashboard links to it), is
yours to take away: all of it — kanji progress, the answer log, every exam
attempt with its report — downloads as one file, and **Bring back a file**
brings it back, here or on another copy of the app. The page first says what
the file holds and asks; bringing it back replaces what you have (a copy of
it is kept on the server first).

Each day, at the first page you open, the app writes a copy of all the study
data — kanji progress, the answer log and every exam attempt with its report,
for everybody in the database — to
`backend/storage/backups/academy-<date>.json` (the date is UTC's; the last 14
are kept), and it writes one before a full reset, before a file is brought
back and before an administrator deletes somebody's data too. To go back to a
copy:

```bash
php backend/manage.php --restore=backend/storage/backups/academy-2026-09-24.json
```

It saves what is there now first. A copy of one person's data (before their
reset, an import or a delete) replaces only theirs. Copies from before
2026-09-27 (version 1, before sign-in) are no longer read; every copy you have
is newer. A copy of everybody
also holds the app's words as you reworded them (*Languages* below); a
restore leaves the words as they are, and
`php backend/translations.php --import sk backend/storage/backups/academy-<date>.json`
takes one language's strings back from it. Before a language is deleted its
strings are copied to `backend/storage/backups/academy-before-language-delete-…json`.
`php backend/manage.php --backup` writes a copy any time. (Where an older PHP
comes first on PATH, `node backend/tools/php.js backend/manage.php --backup`
finds one that can run the app.)

Beside those copies, in the same folder, are the **backups of the whole
database** (`….anotoki-backup`, the anotoki library's, the same on every
anotoki site): one a day, one before every database update, one before a
restore, and whenever an `ADMIN` presses **Back up now** on the admin panel's
**Backups** page, which lists them, downloads one, restores one, and deletes
one. The last 14 daily ones are kept, the last 5 made before an update and
the last 5 before a restore; the ones made with **Back up now** stay until you
delete them there; none is deleted for its age (your decision of 2026-10-11).
So a person whose anotoki account was deleted stays in the backups made
before, until they rotate out or you delete them; a restore checks the
accounts the anotoki IAM deleted again at once. A restore on the **Backups**
page never brings back the data of somebody you deleted on the **People**
page, nor a feedback message you deleted, after that backup was made: it
deletes them again before anybody sees the restored data. Only a backup made
by this copy is restored on its page (each carries the copy's seal); one made
before anotoki-lib 0.5.0 has none, and is restored by hand alone - which does
none of that again (`docs/kb/hosting.md` says how to do it safely) - so make
a backup right after an update. (The app's own copies above are kept as before - the
last 14 days', and each person's last 14 of each kind - and the library never
touches them.)

In the database, your data belongs to your user id at the anotoki IAM: 1.

The files the app used before the database — `progress/`, `results/` and
`reports/` — were deleted on 2026-10-04, by your decision: they were never
imported into the database. Git keeps them.

---

## Exam

**11,523 questions** in 15 sections — listening, vocabulary both ways, kanji
readings, meanings and writing, verb conjugation (every form on both
conjugation charts), adjectives, kana, grammar, particles, counters and
translation. Pick Part 1, Part 2 or both, 40 to 500 questions, and narrow by
lesson or section. Each attempt is saved in the database with a standalone
HTML report (open it from the history), broken down by part, skill and lesson.
Pass mark 70%. Keys while you sit it: **1–4** or **A–D** choose (and move on),
**←/→** go back and forward, **F** flags a question, **R** or Space plays the
recording again, **Enter** on the last question finishes.

---

## What's new

The foot of every page shows the version and **What's new**, which opens the
list of what changed, release by release (`frontend/public/changelog.json`). A
small dot beside it means there is news you haven't opened yet. The version
has three numbers: the first changes with big changes, the second with new
features, the third with bug fixes (0.4.0, then 0.4.1 or 0.5.0).

Beside it, **Send feedback** opens a short form: a mistake you found, an
idea, or anything else, about Kanji, the exam or the site. Signed in, the
form writes your anotoki account's address in for an answer: change it, or
clear it and no address is kept ("Only if you would like an answer"); tick
**Send it without my name** and neither your name nor an address is kept.
No mail is sent: the messages wait on the admin panel's **Feedback** page.

---

## Languages

The app speaks English and Slovak: the round **EN / SK** button in the top
bar switches, and the choice is remembered in that browser — and, signed in,
saved to your anotoki account, so the other anotoki sites speak it too
(when the account can have that language). Signed in, where the anotoki
sign-in keeps your preferences, the app speaks your account's language, and
follows it when you change it elsewhere (on your account's page or another
anotoki site); a choice made here holds for the visit. Otherwise it speaks
the browser's remembered choice, else your account's language or the
browser's, and English when it has none of them. `?lang=sk` in an
address opens that tab in Slovak, whatever else says. Dates and times are
written the way the language writes them, unless you chose a date format or
a clock for your anotoki account.
The study material is never translated — the kanji, the
words, their readings and English meanings, the exam's questions — and
neither are the stage names (Apprentice … Burned), which are WaniKani's.
The exam report stays English.

The app's own words live in the database, so you can reword them in the
browser, with the IAM role `EDITOR` or `ADMIN`: **Admin panel** in your menu at
the top right opens the admin panel (`/admin`, in English; the top bar there
reads in English too, its links are the area's pages, and your menu leads
back). **Translations** shows every
string in every language, with a search, and saves the ones you changed;
what you typed waits in the tab until you save or discard it. The words of
the top bar, the language and theme switches and the dialogs are there too,
under `anotoki.` (the anotoki library's own keys, which the other anotoki
sites have as well). **Languages** (`ADMIN` only) adds a language — hidden
until you switch it on —, renames, orders, hides or deletes one; English cannot be hidden
or deleted, Slovak cannot be deleted. Each language exports to a file and
imports from one. Your computer and the website each keep their own
strings: export from one and import into the other to carry a change over.
These two pages are the anotoki library's (since anotoki-lib 0.3.0), the
same on every anotoki site.
**People** (`ADMIN` only) lists everybody who has signed in, with how far
each has come, and deletes a person's data after asking (a copy of it is kept
on the server first; their account stays). When somebody's anotoki account is
deleted, the site blanks who they were - their name, the name on their exam
papers, the address of their feedback - the next time it asks the anotoki
IAM (at most once an hour, as pages are opened; **Check now** on the page
asks at once), and keeps their study, nobody's now. **Feedback** (`ADMIN` only) has the messages sent from
the foot of the pages; the panel's link counts the new ones. **Errors**
(`ADMIN` only) is what went wrong on the server, and in the pages people had
open (the errors a page meets - a few a page load, each once - are sent
there with their addresses, tokens and anything the browser stores taken
out; a signed-in person's under their account); **Audit log** (`ADMIN` only)
who did what in the admin panel; **Backups** (`ADMIN` only) the backups of the
whole database (*Your progress* above). These pages are the anotoki
library's (since anotoki-lib 0.4.0), the same on every anotoki site.
**Migrations** (`ADMIN` only) shows the database's migrations, applied and
pending (a file still being written or uploaded as a "draft", which waits),
each one's SQL, and **Apply pending**. A new version that brings one does not
apply it by itself: until an `ADMIN` presses **Apply pending** there (the
server keeps a copy of every table first, and says which), everybody else
reads, in their language, that the site is being updated - a calm page that
asks again by itself and comes back once it is done, with only a quiet
**Sign in** while nobody is signed in (an exam paper they were in the middle
of is kept for that tab, and is back with the site). Signed in as an `ADMIN`,
that page says "A database update is waiting" instead, with the way to this
page, the one page that works meanwhile (it too asks again by itself, in case
another `ADMIN` applies the update). So an `ADMIN` who is signed out presses
**Sign in** there, comes back to it, and goes on to the Migrations page. That
behaviour, and the page itself, are the anotoki library's (`anotoki-lib`, the
same on every anotoki site; *Development* below).
A word that shows as its key (`home.intro`) has no string in the database:
`php backend/translations.php --status` lists them.

---

## The website

As a website, Japanese Academy asks everybody to sign in with their account at
the anotoki IAM (https://iam.anotoki.eu), which every anotoki site shares, and
keeps each person's progress, settings and exam history apart. Every account
may study; the roles `EDITOR` (rewords the app's words) and `ADMIN` (also
keeps the languages, sees the people and deletes a person's data, after a
copy of it, reads the feedback and the error and audit logs, keeps the
backups, and applies the database's updates on the Migrations page) open
the admin panel. Your menu at the top right shows who is
signed in (name, address, role), links to your anotoki account and (for those
roles) the admin panel, and signs out — after the answers still on their way
are saved, asking first when something would be lost (an exam not handed
in).

The owner's hosting has no shell, so everything goes up by FTP or SFTP:

1. `node backend/tools/php.js backend/tools/build-dist.php` →
   `dist/japanese-academy/`: exactly what to upload — the built app in
   `public/`, and `backend/` beside it (with the study content and the clips in
   `backend/data/`, and an empty `backend/storage/` for the backups).
2. Upload it into the site's folder, and point the site's document root at
   its `public/`. (`backend/` stays off the web.)
3. Open `https://<the site>/setup.php`: it writes a token into
   `backend/config/setup-token.local.php` — get that file by FTP and paste the
   token in — then asks for the database (made in the hosting panel) and the
   IAM's address, each with a **Test connection** button, and nothing else;
   **Save** sets everything up, and the page deletes itself.

Later updates: build again, and upload over the old files. The first request
afterwards rebuilds the study content. A new database change (a migration)
waits until an `ADMIN` presses **Apply pending** on the admin panel's
Migrations page, which takes a copy of every table first; until then the site
tells everybody it is being updated (an `ADMIN` signs in from that very page).
Once the setup page has finished on the website, the site never offers it
again: should its settings go missing, it says it is not available. The
website needs PHP 8.2 or newer. `docs/kb/hosting.md` has the whole map.

---

## Hosting checklist

What the host and Cloudflare need for this site - check it before the first upload and after any change of
hosting:

- **PHP 8.2 or newer** with `pdo_pgsql`, `mbstring`, `intl`, `openssl`, `json` and `zlib` (the backups); `curl` or `allow_url_fopen` to ask the IAM. `tools/host-check.php` checks all of it on the host: write a long
  random value into its `HOST_CHECK_TOKEN`, upload it beside `index.html`, open
  `https://<the site>/host-check.php?token=<that value>`, and delete it afterwards (the page has a button for
  it). It is never part of a build.
- **Cloudflare** (the zone's settings, the same for every anotoki site):
  - SSL/TLS **Full (strict)**: the connection from Cloudflare to the host is https - the site's secure cookies
    need it end to end (the host check says which it is).
  - Network -> **Pseudo IPv4 not "Overwrite headers"**: that setting would put a made-up IPv4 address into
    `CF-Connecting-IP` for IPv6 visitors.
  - The site believes the visitor's address in `CF-Connecting-IP` only on a connection from Cloudflare's
    published ranges (the anotoki library's list), and counts every limit by it.
- **After an upload**: the private folders (`storage/`, `config/`) answer 403 in a browser; the host check's
  "Who connects" says Cloudflare, not a proxy of the host's (behind one, every visitor would share one
  address); pending database updates are applied on the admin panel's Migrations page.

## Data

```
backend/data/source/
  vocab-part1.tsv  vocab-part2.tsv     vocabulary index (J–E), transcribed
  kanji-part1.tsv  kanji-part2.tsv     the per-lesson kanji lists
  grammar-index-part1/2.tsv            grammar points by lesson
backend/data/vocab.json kanji.json grammar-index.json   (backend/tools/build-data.php)
backend/data/audio.json audio/                          (backend/tools/build-audio.php)
backend/data/authored-items-part1.php  -part2.php       hand-written exam items
```

The books are page scans with no text layer, so the vocabulary, kanji and
grammar data was transcribed from the page images. The counts check out
against the books, but any typo will be in `backend/data/source/*.tsv` — fix
it there and run `node backend/tools/php.js backend/tools/build-data.php`
(and `build-audio.php` the same way if a word's spelling or reading changed).
The app's next page load rebuilds the study content in the database.

## Layout

```
backend/                   the server: PHP 8.2+, Slim 4, PostgreSQL (backend/README.md)
  router.php               PHP's built-in web server on this computer (composer start): API + built app
  setup.php                the setup page, /setup.php: the database and the IAM, tables, content
  manage.php               command-line helpers: --check, --sync, --backup, --restore
  translations.php         the app's own words from the command line: --status, --export, --import
  api/                     the HTTP side: the Slim app, its routes and middleware, the front controller
  src/                     the app itself: kanji SRS (srs/), exam, content, backups, sign-in, upkeep, the app's words
  config/                  config.php, and this copy's settings (*.local.php, not in git)
  migrations/              the database tables
  vendor/                  Composer's packages (Slim, the anotoki library), committed: a website has no shell to install them
  public/                  index.php and .htaccess, for Apache on a website
  data/                    what the study content is built from, and the audio
  storage/                 the copies of your study data and the database's backups (backups/), the error log
                           (logs/), the IAM's keys (not in git)
  tests/                   PHP unit and API tests
  tools/                   data and audio builders, the website's upload (build-dist.php),
                           php.js (finds a PHP 8.2+), the PDF page tool (pdf/, with its own package.json)
frontend/                  the app in the browser: Angular 21 (standalone, zoneless, signals) (frontend/README.md)
  src/app/                 home (and Your data), kanji/, exam/, core/ (API, sign-in, changelog, feedback, i18n, the
                           site's status, the admin tools), admin/ (Translations, Languages, People, Feedback, Errors,
                           Audit log, Backups, Migrations), standin/ (sign in, a problem)
  public/                  favicon, changelog.json
  e2e/                     the browser suites (Edge, playwright-core)
  scripts/                 ensure-build.mjs (builds when the sources changed), the catalog fixture
docs/kb/                   knowledge base: architecture, data sources, SRS, exam, sign-in, hosting, testing
books/                     the scanned books (not in git)
.claude/                   Claude Code: skills, review agents, rules
```

## Development

`DEV.md` is the guide: what to install, running the backend and the
Angular dev server side by side, signing in against the development IAM, the
tests, and building the website's upload. `docs/kb/` is the reference for
changing anything: where the data came from (with page maps of every book), how
the SRS, the audio and the exam work, what to test, and why things are the way
they are. For Claude Code, `CLAUDE.md` holds the project rules, and `.claude/`
the rest.

The database migrations - applying them, and what the site does while one
waits -, the app's words (serving them, the Translations and Languages
pages, the command line), the family's UI kit the pages are drawn with
(buttons, dialogs, fields, menus, cards, alerts, badges, choices; the study's
own pieces - tiles, the sessions, the exam's paper - are the app's), its
styles and font (Manrope) and the top bar, in this app's own colours, the
sign-in (the site's half of it), the
people (the People page, and blanking who somebody was once the IAM deleted
their account) and the admin tools (the error log - with the pages' own
errors -, the audit log, the feedback and its form, the backups), and how
the site tells where a request comes from (behind Cloudflare: the visitor's
address, never Cloudflare's), are the **anotoki library**'s (`anotoki-lib`, shared by every anotoki
site; its repository is `../anotoki-lib`, published as
https://github.com/irelevant25/anotoki-lib): the Composer package
`anotoki/lib` in `backend/vendor/` and the npm package `@anotoki/lib` in
`frontend/`. `DEV.md` (*The anotoki library*) says how to update it.
