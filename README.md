# Japanese Academy

Study companion for a two-part beginner Japanese course (Greetings and
Lessons 1–23). Two parts, one site:

- **Kanji** — a WaniKani-style spaced-repetition trainer for the course's kanji
  and the vocabulary written with them: lessons, reviews, and unlimited practice.
- **Exam** — an 11,523-question multiple-choice test of the whole course, with
  listening, scoring and a report.

Every word is spoken in two voices, female and male.

It runs on your own computer with no sign-in, or as a website
(https://japanese.anotoki.eu) where people sign in with their anotoki account and
each has their own progress — see *The website* below.

It replaced the earlier N4 Coach app on 2026-09-23. N4 Coach is still in the
git history.

## Run it

You need:

- **PHP 8.1 or newer** with the extensions `pdo_pgsql`, `mbstring` and `intl`
  (and `curl` and `openssl`, to test the sign-in's address and to make audio);
- **PostgreSQL 13 or newer**, running on this computer;
- **Node.js** (20.19, 22.12, or 24 and newer): it builds the app, the first
  time and again after an update.

No web server of its own: PHP's built-in one serves the app.

1. **Windows**: double-click `start.ps1`. **Mac/Linux**: run `./start.sh` in a
   terminal. It finds a PHP that can run the app (even when an older PHP comes
   first on PATH), builds the app when its sources changed (the first time
   this downloads its packages and takes a minute or two), starts it and opens
   http://127.0.0.1:8200. Ctrl+C stops it.
2. **The first time** the browser opens the **setup page** instead
   (http://127.0.0.1:8200/setup.php). It asks for the PostgreSQL server, port,
   database, user and password — **Test connection** tries them without
   saving anything —, whether people sign in (for your own copy: no sign-in),
   your user id at the anotoki IAM (1 unless you know otherwise), and the time
   zone. **Set up** saves the settings in `backend/config/` (not in git),
   makes the database and its tables, builds the study content into it, and
   imports your progress and exam history from the files the app used before
   (`progress/`, `results/`, `reports/` — it only reads them). The page stays:
   open it again any time to change the settings. It never shows the password;
   left empty, the saved one stays.
3. Or by hand, with that PHP: `npm run build:frontend` (builds the app), then
   `php backend/server.php` (→ http://127.0.0.1:8200).

The app only listens on this computer (127.0.0.1): other devices on your
network can't reach it, and without sign-in it refuses to listen anywhere
else.

### Updating from the version before

The version before this one ran from `server.php` at the top of the folder,
on port 3000, and asked for its settings in the terminal. To update a
computer that ran it:

1. Get the new version (`git pull`) and start it as always, with `start.ps1`
   (or `start.sh`). It builds the app, starts, and opens the setup page, with
   the old settings from `src/config.local.php` filled in — the password too,
   without showing it.
2. Check them and press **Set up**. It takes a copy of every table first
   (`backups/academy-before-migration-….raw.json`), brings the database up to
   date (updates 002 and 003: every row gets your user id, 1), rebuilds the
   study content, and saves the settings in `backend/config/`. Your progress,
   answer log and exam history stay exactly as they were.
3. If your user id at the anotoki IAM is not 1, type yours in the setup page:
   your data moves to it (a backup is taken first).

From then on the app is at http://127.0.0.1:8200, and `src/config.local.php`
is not used any more: delete it whenever you like.

### Not in git

These stay on this computer only:

- `backend/config/*.local.php` — your settings: the database, with the
  password, the sign-in mode and the time zone (the setup page writes them).
- `backups/` — copies of your study data (see *Your progress* below). Copy
  the newest to a new computer to bring your progress along.
- `books/` — the scanned course books (`textbook-1.pdf`, `workbook-1.pdf`,
  `textbook-2.pdf`, `workbook-2.pdf`, `answer-key.pdf`), and your notes. Only
  the PDF page tool needs them. Copy them in by hand.
- `.env` — your Google Cloud key, only needed to make new audio (below).

---

## Audio

The audio is made with **Google Cloud Text-to-Speech**, in two voices
(`ja-JP-Neural2-B`, female, and `ja-JP-Neural2-C`, male). The clips are in git
(`data/audio/`), so the app plays them on any computer, without a key. In
lessons and reviews the two voices take turns; each exam listening question
uses one of them.

You need a key only to make clips for new words (after adding vocabulary):

1. In the Google Cloud console, create a project, turn on billing, and enable
   the **Cloud Text-to-Speech API**. This amount of text stays inside the free
   tier.
2. Under **APIs & Services → Credentials**, create an **API key**, and restrict
   it to the Cloud Text-to-Speech API.
3. Put it in a file named `.env` in this folder (git ignores it):
   `GOOGLE_TTS_API_KEY=your-key`
4. Run `npm run build:audio` (`php backend/tools/build-audio.php`). It only
   sends the words that have no clip yet; `-- --dry-run` shows what it would
   send, without a key. Restart the app afterwards.

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
changed. The dashboard has a link to download your kanji progress.

Each day, when the app starts (or, if it runs overnight, at the first page you
open the next day), it writes a copy of all the study data — kanji progress,
the answer log and every exam attempt with its report, for everybody in the
database — to `backups/academy-<date>.json` (the last 14 are kept), and it
writes one before a full reset too. To go back to a copy:

```bash
php backend/manage.php --restore=backups/academy-2026-09-24.json
```

It saves what is there now first. A copy from before 2026-09-27 (before
sign-in) holds only your data and replaces only yours.
`php backend/manage.php --backup` writes a copy any time. (`npm run manage --
--backup` does the same with a PHP that can run the app.)

In the database, your data belongs to your user id at the anotoki IAM: 1,
unless you set another. If your id there is not 1, type it in the setup page,
or run `php backend/manage.php --owner-id=N`: your data moves to it (backed up
first).

The files the app used before the database — `progress/`, `results/` and
`reports/` — are kept in git as your history until 2026-09-24. The setup
imported them once; the app doesn't change them any more.

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

The version number at the foot of every page opens the list of what changed,
release by release (`frontend/public/changelog.json`). A small dot on it means
there is news you haven't opened yet.

---

## The website

As a website, Japanese Academy asks everybody to sign in with their account at
the anotoki IAM (https://iam.anotoki.eu), which every anotoki site shares, and
keeps each person's progress, settings and exam history apart. Only accounts
the owner gave a role in this app (`ADMIN` or `MEMBER`) get in. The account
menu at the top right shows who is signed in, links to the account page, and
signs out.

The owner's hosting has no shell, so everything goes up by FTP or SFTP:

1. `npm run build:dist` → `dist/japanese-academy/`: exactly what to upload —
   the built app in `public/`, and `backend/`, `data/` and `backups/` beside it.
2. Upload it into the site's folder, and point the site's document root at
   its `public/`. (`backend/`, `data/` and `backups/` stay off the web.)
3. Open `https://<the site>/setup.php`: it writes a token into
   `backend/config/setup-token.local.php` — get that file by FTP and paste the
   token in — then asks for the database (made in the hosting panel) and the
   IAM's address, each with a **Test connection** button, sets everything up,
   can import your data from a backup file into your IAM user id, and deletes
   itself.

Later updates: build again, and upload over the old files. The first request
afterwards applies new database changes (after a copy of every table) and
rebuilds the study content. `docs/kb/hosting.md` has the whole map, and how to
bring your data from your computer to the site.

---

## Data

```
data/source/
  vocab-part1.tsv  vocab-part2.tsv     vocabulary index (J–E), transcribed
  kanji-part1.tsv  kanji-part2.tsv     the per-lesson kanji lists
  grammar-index-part1/2.tsv            grammar points by lesson
data/vocab.json kanji.json grammar-index.json   (npm run build:data)
data/audio.json audio/                          (npm run build:audio)
data/authored-items-part1.php  -part2.php       hand-written exam items
```

The books are page scans with no text layer, so the vocabulary, kanji and
grammar data was transcribed from the page images. The counts check out
against the books, but any typo will be in `data/source/*.tsv` — fix it there
and run `npm run build:data` (and `npm run build:audio` if a word's spelling or
reading changed). The next start of the app rebuilds the study content in the
database.

## Layout

```
start.ps1 start.sh         one-click start: finds PHP and Node, builds the app, starts it, opens the browser
backend/                   the server: PHP 8.1+, Slim 4, PostgreSQL
  server.php               the server on this computer (PHP's built-in web server): app + API on one address
  setup.php                the setup page, /setup.php: settings, database, tables, content, your data
  manage.php               command-line helpers: --check, --backup, --restore, --import, --owner-id
  api/                     the HTTP side: the Slim app, its routes and middleware, the front controller
  src/                     the app itself: kanji SRS (srs/), exam, content, backups, sign-in, upkeep
  config/                  config.php, and this copy's settings (*.local.php, not in git)
  migrations/              the database tables
  vendor/                  Composer's packages (Slim), committed: a website has no shell to install them
  public/                  index.php and .htaccess, for Apache on a website
  tests/                   PHP unit and API tests
  tools/                   data and audio builders, the website's upload (build-dist.php), the PDF page tool
frontend/                  the app in the browser: Angular 21 (standalone, zoneless, signals)
  src/app/                 home, kanji/, exam/, core/ (API, sign-in, changelog), standin/ (sign in, not set up)
  public/                  favicon, changelog.json
  e2e/                     the browser suites (Edge, playwright-core)
data/                      what the study content is built from, and the audio
docs/kb/                   knowledge base: architecture, data sources, SRS, exam, sign-in, hosting, testing
backups/                   copies of your study data (not in git)
progress/ results/ reports/  your history from before the database
books/                     the scanned books (not in git)
.claude/                   Claude Code: skills, review agents, rules
```

## Development

`DEVELOPING.md` is the guide: what to install, running the backend and the
Angular dev server side by side, signing in against the development IAM, the
tests, and building the website's upload. `docs/kb/` is the reference for
changing anything: where the data came from (with page maps of every book), how
the SRS, the audio and the exam work, what to test, and why things are the way
they are. For Claude Code, `CLAUDE.md` holds the project rules, and `.claude/`
the rest.
