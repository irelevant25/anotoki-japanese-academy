# Kanji SRS

A WaniKani-style trainer with the time locks removed. Code:
`backend/src/srs/` (server) and `frontend/src/app/kanji/` (browser).

## Items — `backend/src/srs/catalog.php`

Built from `backend/data/kanji.json`, `vocab.json` and `audio.json` when the
content is synced (the first request after they changed, the setup page,
`manage.php --sync`; only when `backend/data/` or the builder changed) and
stored in the `srs_items` table, which
`GET /api/kanji/catalog` sends as it is.

- **Kanji** (316): every kanji of the course except 々. Id `k:<kanji>`.
  Accepted readings = every on/kun reading **plus** the dictionary form of words
  that are the kanji + okurigana only (食 accepts しょく, た, たべる).
- **Vocabulary** (1,057): words from the vocabulary lists and the kanji-list
  compounds written only with the course's kanji + kana. Id `v:<word>`. Same
  word from both sources → one item (meanings and readings merged). Spelling
  variants with the same kanji and reading → one item (the vocabulary-list
  spelling wins).
- `lesson` = the item's level: a kanji's course lesson; a word's **latest**
  kanji's lesson (大学 → 6, not 1). `courseLesson` = where the word first
  appears in the lists.
- `order` = course order: lesson by lesson, kanji first (list number), then
  vocabulary. "Next lessons" walks this order.
- **Availability**: kanji always; vocabulary once all its kanji are learned.
  Enforced by the server (`POST /learn` → 409) and mirrored in
  `KanjiStateService.isAvailable()`.
- **Audio**: every vocabulary item has `audio: [female, male]`, the clip names
  of `backend/src/speech.php`'s `speech_clips_for()`, spoken with the item's first reading.
  Kanji items have none (a kanji has several readings).

Changing catalog rules can rename or remove ids — see the warning in
[data-provenance.md](data-provenance.md).

## Schedule — `backend/src/srs/srs.php` (WaniKani's, exactly)

| Stage | Name | Next review |
|---|---|---|
| 1–4 | Apprentice I–IV | 4 h · 8 h · 23 h · 47 h |
| 5–6 | Guru I–II | 167 h · 335 h |
| 7 | Master | 719 h |
| 8 | Enlightened | 2879 h |
| 9 | Burned | never |

Review times are rounded down to the hour of the learner's own time zone
(hence 23 h, not 24; in a half-hour zone such as India's, an hour there
begins at :30 UTC); in the autumn's repeated hour, to its first occurrence (as
the browser's `Date` does).
Clean review: +1 stage. With `w` wrong answers (meaning + reading):
`stage − ceil(w/2) × (2 if stage ≥ 5 else 1)`, never below 1.

## Each learner's own time zone (2026-10-04)

Days and hours are the learner's own, not the server's
(`backend/api/middleware/person.php`, after the library's `Identify` in `backend/src/auth.php`):

- **Which zone.** The browser names its zone with every request to this
  site's `/api` and `/report` addresses: `X-Time-Zone: Europe/Bratislava`
  (an IANA name both PHP and ICU know: `time_zone_known()` in
  `backend/src/util.php`; anything else is ignored). It is that request's zone, and it is kept on the
  person's row (`users.time_zone`, migration 005) when it differs from the
  kept one — at most one write, inside `people_seen()` (the library's
  `PeopleRecorder`, which writes it with the row). A request that names
  none (a tool, a browser that will not say) uses the kept one; somebody who
  never named one is counted in UTC.
- **What follows it.** PHP's zone is the person's for the rest of the
  request, so everything that says "local" does: a review time rounded to the
  hour (`srs_floor_hour()`), the day an answer counts on (`srs_daily.day`,
  `store_bump_daily()`), the dashboard's *today* and its 7-day forecast
  (`kanji_summarize()`: day i is the 24 hours from the person's midnight +
  i × 24 h, and `forecastDates` says the person's date each stands for — the
  date at its middle, right next to a change of summer time too; the page
  names the days from those), the date and time written into a stored exam report
  (`report_when()`), and the name of the data file
  (`japanese-academy-<date>.json`).
- **PHP and ICU.** A zone is taken only when PHP and ICU (intl) both know it
  (`time_zone_known()`, `time_zone_icu_knows()`): each has its own copy of the
  zone data, and a report is dated through ICU. With PHP 8.5.10 and ICU 77.1
  they differ in America/Coyhaique. A zone ICU lacks that is already kept on a
  person's row is read back as none (UTC), and the row is left as it is.
  `report_when()` never fails on a zone: one ICU does not know is dated at its
  offset from UTC at that moment (`report_icu_zone()`), a name neither knows in
  UTC.
- **What does not.** The site's own housekeeping is UTC, whoever's request
  it is: the names of the backups and the day of the daily backup
  (`utc_date()`, `utc_stamp()`). The database session is UTC too, and no query
  reads it.
- **A learner who travels.** Each answer counts on the day of the zone their
  browser was in when they gave it, and stays there: nothing is moved
  afterwards. *Today* and the forecast are the new zone's from the first
  request made there, so on the day of a long flight east a day may seem to
  end early (the counts of the old zone's day are under that day), and going
  west a day may seem to last longer. Review times are moments, not wall-clock
  times: a review due "at 09:00" at home is due at the same moment abroad
  (the hour it was rounded to is home's).
- **Before migration 005** (an upload still arriving, or a server that has
  not loaded a page since: see [architecture.md](architecture.md),
  *Migrations*) there is no column:
  `users_time_zone_ready()` says so once per request, the header still counts
  for the request, and nothing is kept.

Tests: `backend/tests/api/time-zone.test.php` — in process with the clock
given (the same moment is the 5th in Tokyo and the 4th in New York; Kolkata's
hour begins at :30 UTC), and on the server with Pacific/Kiritimati (UTC+14)
and Pacific/Pago_Pago (UTC−11), whose dates differ at every moment, so no test
depends on when it runs.

## The user's modifications (requirements, 2026-09-23)

- **Unlimited lessons.** Batches of 5 by default (3/10/any 1–20 via settings),
  as many batches as wanted, no daily cap, no level gating.
- **Unlimited practice** of anything learned. `srs_practice()` records its own
  counters (`practice.correct/incorrect`, `lastWrongAt`) and **never changes
  `stage` or `nextReview`**. Tests assert this — keep it that way.
- **Reviews** are the only thing that moves stages, and only for due items
  (`POST /review` on a non-due item → 409, which also blocks double submits).

## API — `backend/api/routes/kanji.php` → `backend/src/srs/kanji.php`

The routes (`/api/kanji/…`) hand each request to a `kanji_…` handler. Every
address needs a signed-in person and works on
that person's progress only ([sign-in.md](sign-in.md)).

| | |
|---|---|
| `GET /catalog` | all items + stage and group definitions (the same for everybody) |
| `GET /progress` | `{settings, items, summary}` — `summary` = due, available, groups, forecast, per-lesson, today, 14-day history |
| `GET /summary` | summary only (home page) |
| `POST /learn {id}` | lesson quiz passed → Apprentice I |
| `POST /review {id, meaningWrong, readingWrong}` | → `{state, from, to}` |
| `POST /practice {id, firstTryCorrect, wrong}` | practice statistics only |
| `POST /item {id, notes?, addSynonym?, removeSynonym?, addReading?, removeReading?}` | the learner's notes and accepted answers |
| `POST /settings {batchSize?, lessonTypes?, autoplay?}` | validated and clamped |
| `POST /reset-item {id}` · `POST /reset {confirm:"RESET"}` | reset keeps notes; full reset is backed up first |

Each handler takes the user id of the person asking and returns
`[status, body]`; the item records have the shape of `srs_blank()` in
`backend/src/srs/srs.php`, with times in milliseconds. Every handler that
writes holds the person's `users` row `FOR SHARE` first (`users_hold()`), so
it takes turns with an import of their data or an administrator deleting it
([architecture.md](architecture.md), *Your own data*).

The kanji-only download (`GET /api/kanji/export`) went on 2026-10-04: all of a
person's data, kanji progress included (in the `{version, createdAt,
updatedAt, settings, items, daily}` shape it had), is one file now,
`GET /api/me/data`.

## Storage — `backend/src/srs/store.php` (PostgreSQL)

Every row is one person's (`user_id`), and every `store_…` function takes the
user id first.

| Table | |
|---|---|
| `srs_progress` | one row per person and item touched (learned, reviewed, practised, or given a note); an id the catalog no longer has keeps its row |
| `srs_settings` | each person's settings (made at their first change), `created_at` (a full reset starts it again) and `updated_at` |
| `srs_daily` | the dashboard's counts per person and day, the day of their own time zone when they answered |
| `srs_log` | every lesson, review, practice answer and reset (`user_id`, `kind`, `item_id`, `details`) — a person's lines only ever added to (the one exception: migration 002 gave every existing line the owner's user id, with the owner's approval, on 2026-09-27); a visitor's lines become the person's when they sign in (*A visitor's progress at sign-in*, below) |

- **Saving.** Each answer is one transaction: the item (its row locked while
  it is read and written, which also stops a double submit), the day's count
  and the log line are saved together or not at all.
- **Daily backup.** Taken at the day's first page load
  (`GET /api/kanji/progress`, `/summary` or `/api/meta`: the routes registered
  with `study_route(…, true)`), on this computer as on a hosted site (neither
  server does anything at start): all the study data, everybody's, in one
  file, `backend/storage/backups/academy-<date>.json` (the UTC day, whoever's
  page load it is; see
  `backend/src/backup.php`); the last 14 are kept. The same page load asks
  for the anotoki library's backup of the whole database for the day, made
  after its answer (the library keeps the last 14 of them;
  [architecture.md](architecture.md), *The admin tools*). No backup ever runs inside a lesson, review or
  practice request, and a failed one is only reported. An empty database has
  nothing to back up in the app's copy, nor one where only visitors studied
  (their data is in none of the app's copies; the library's holds every row).
- **Full reset** (`POST /reset`): the person's data is backed up first, theirs
  alone (`academy-before-reset-user-<id>-<time>.json`, with the log; their
  last 14 are kept, and restoring one replaces only their data); the person's
  items and day counts go, their settings and the log stay. Nobody else's are
  touched. A visitor's reset takes no copy (a visitor has no data file), and
  nobody's (no visitor yet) has nothing to reset and writes nothing.
- **A visitor's progress at sign-in** (where the IAM lets people study
  without signing in: [sign-in.md](sign-in.md), *Visitors*). A visitor's
  rows are like anybody's, under a negative user id; when they sign in, `POST
  /api/visitor/move` merges them into the account in one transaction, after a
  copy of the account's data. Items are scheduled one by one, so the merge is
  per item: an item both studied keeps the person's row untouched (its stage,
  its next review, its notes), every other item moves as it is; a day both
  have adds the counts (both sets of answers were given); every log line
  moves, in the order the answers came (the log's id), except the visitor's
  full resets and its resets of items the person kept - they reset only the
  visitor's copy, and in the person's log would say the person had reset
  them. The settings are the person's when they have them.
- **Editing by hand** is SQL on the owner's database — only when the owner
  asks, after `php backend/manage.php --backup`, and always with
  `user_id = <the owner's id>` (1, their user id at the IAM).
  The server reads the database on every request, so it needn't be stopped.

The old app's file, `progress/kanji.json`, and its log were never imported
into the database: the owner deleted them on 2026-10-04, and git keeps them.

## Answer checking — `frontend/src/app/kanji/answer.ts`

- **Meaning**: lowercase; apostrophes and punctuation dropped; leading
  to/be/the/a/an removed; number words = digits ("300" = "three hundred");
  `;`/`,` split alternatives (not inside parentheses); a `/` offers per-word
  alternatives ("two vehicles/machines"); every parenthesised group is optional
  on its own, and `/` inside one is a choice.
- **Typos** are forgiven by length (0 edits for ≤3 letters, 1 for ≤5, 2 for ≤8,
  3 beyond; a swap of two letters is one edit) — **unless** the typed answer is
  exactly another item's meaning ("night" for 右). Numbers are never forgiven.
- **Reading**: hiragana = katakana; a katakana long vowel may be typed out
  (サービス = さあびす). No typo tolerance. Kana typed into the meaning box, or
  leftover romaji/kanji in the reading box, is *invalid* (the card shakes, no
  penalty).
- Learner synonyms / extra readings (from "My answer was right" or the item
  page) are accepted like printed answers.
- An invalid answer comes back with its kind (`readingEmpty`,
  `readingUnfinished`, `readingInKanji`, `meaningNotEnglish`,
  `meaningEmpty`), which the session words in the page's language as
  `answer.check.<kind>`; `answer.ts` holds no sentence. `materialLang()`
  says whether a piece of material is Japanese (`ja`: it has kana or kanji)
  or English (`en`), for the `lang` it carries on the page. The stage names
  (Apprentice … Burned) are never translated: the page takes them from the
  server (the catalog's `stages` and `groups`, and the summary's groups).

## Browser flow — `frontend/src/app/kanji/session/`

The screens have addresses of their own: `/kanji` (the dashboard),
`/kanji/lessons`, `/kanji/reviews`, `/kanji/practice`, `/kanji/browse`
(`?lesson=6`), `/kanji/item/:id`. Every screen loads the person's progress
fresh first (a resolver, run again even for the address already shown); the
catalog is loaded once.

Meaning then reading, back to back (`session-engine.ts`, the answering engine
without the page, and `session.component`). A miss shows the answer and
re-queues that half 2–4 cards later; an item completes when both halves are
right, and the misses are what the schedule sees. Completing an item **saves
in the background** (the next card never waits for the server); the summary
waits for all saves. Reading input is bound to wanakana (IME mode): a trailing
`n` stays `n` until Enter, when `toKana` turns it into ん — expected
behaviour.

A batch, its quiz and the summary draw over the screen they started from; the
address doesn't change (a batch started on the dashboard stays at `/kanji`;
`kanji-screen.service.ts` holds what is drawn over the screen). The tabs still
work because the kanji shell routes a click on a link to the current address
by hand (the router does nothing for it), drawing that screen again, fresh. If
the learner leaves while the last answers are still saving, the saves still
land, but the summary is not drawn over the new screen (the session sends its
result only while it is still on the page, and the shell checks that it is
still what is drawn).

Keys: Enter submit / continue · F item info · lessons ←/→ or Enter.

## Audio — `backend/src/speech.php`, `backend/tools/build-audio.php`

`php backend/tools/build-audio.php` (through `node backend/tools/php.js` where
an older php comes first on PATH) voices every word of
`backend/data/vocab.json` and every SRS vocabulary item with Google Cloud
Text-to-Speech, in two voices: female `ja-JP-Neural2-B` and male
`ja-JP-Neural2-C`. The app's next request rebuilds the catalog and the bank
with the new clips (`audio.json` is one of the content files).

- **What is spoken** (`speech_spoken()` in `backend/src/speech.php`, shared by the builder,
  the catalog and the exam): the first spelling, without notes, punctuation and
  optional endings (いじわる(な) → いじわる, 妹(さん) → 妹); brackets inside a
  word stay part of it (ほ(う)っておく → ほうっておく), and a phrase is spoken whole
  (かける(かぎを) → かぎをかける). A kanji word is sent as
  SSML with its reading as yomigana, so 今日 can't come out as こんにち — checked
  against the real service: 明日 with あす and with みょうにち give clips as long
  as plain あす and plain みょうにち. Suffixes and patterns (〜円) and words with
  letters in the reading (交通系ICカード) get no audio.
- **Clips** are MP3 files in `backend/data/audio/` under random 16-hex names, listed in
  `backend/data/audio.json` by `"<text>|<reading>"`. A listening question's clip name
  therefore gives nothing away. The clips are in git.
- **Rebuilds** only send what is missing. Each clip is stamped with the recipe
  and voice that made it (`made` in `audio.json`), so a new word, a changed
  spelling or reading, or a changed voice or `AUDIO_RECIPE` remakes exactly those
  clips, even after a partial run. After a complete run, clips nothing uses any
  more are deleted. `--dry-run` counts the characters without a key; `--limit N`
  makes at most N.
- **Failures**: requests go one at a time, at most 10 a second, under Google's
  per-minute quota, and a 429 waits for the minute to turn. The index is saved every 100
  clips and at the end, also after a failure or Ctrl+C, and nothing is deleted
  then. A word Google refuses (400) is skipped and listed; the rest go on. An
  unreadable `audio.json` stops the build instead of remaking and deleting
  everything.
- **The key**: `GOOGLE_TTS_API_KEY` in the environment or in the gitignored
  `.env` (README). It is sent in a header, never in a URL, and never printed.
- **In the browser** (`AudioService` in `frontend/src/app/core/audio.service.ts`):
  the voices take turns, so every word is heard from both over time.
