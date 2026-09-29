# Kanji SRS

A WaniKani-style trainer with the time locks removed. Code:
`backend/src/srs/` (server) and `frontend/src/app/kanji/` (browser).

## Items — `backend/src/srs/catalog.php`

Built from `data/kanji.json`, `data/vocab.json`, `data/audio.json` when the
content is synced (the server's start, the setup page; only when `data/` or the
builder changed) and stored in the `srs_items` table, which
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

Review times are rounded down to the local hour (hence 23 h, not 24); in the
autumn's repeated hour, to its first occurrence (as the browser's `Date` does).
Clean review: +1 stage. With `w` wrong answers (meaning + reading):
`stage − ceil(w/2) × (2 if stage ≥ 5 else 1)`, never below 1.

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
address needs a signed-in person (in auth mode `none`, the owner) and works on
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
| `GET /export` | download your progress, in the shape of the old `progress/kanji.json` (`{version, createdAt, updatedAt, settings, items, daily}`) |

Each handler takes the user id of the person asking and returns
`[status, body]`; the item records have the shape of `srs_blank()` in
`backend/src/srs/srs.php`, with times in milliseconds.

## Storage — `backend/src/srs/store.php` (PostgreSQL)

Every row is one person's (`user_id`), and every `store_…` function takes the
user id first.

| Table | |
|---|---|
| `srs_progress` | one row per person and item touched (learned, reviewed, practised, or given a note); an id the catalog no longer has keeps its row |
| `srs_settings` | each person's settings (made at their first change), `created_at` (a full reset starts it again) and `updated_at` |
| `srs_daily` | the dashboard's counts per person and local day |
| `srs_log` | every lesson, review, practice answer and reset (`user_id`, `kind`, `item_id`, `details`) — only ever added to (the one exception: migration 002 gave every existing line the owner's user id, with the owner's approval, on 2026-09-27) |

- **Saving.** Each answer is one transaction: the item (its row locked while
  it is read and written, which also stops a double submit), the day's count
  and the log line are saved together or not at all.
- **Daily backup.** Taken when the server starts (`php backend/server.php`),
  before it answers anything: all the study data, everybody's, in one file,
  `backups/academy-<date>.json` (see `backend/src/backup.php`); the last 14 are
  kept. A server left running overnight, and a hosted site (which has no
  start), take the new day's copy at the first page load
  (`GET /api/kanji/progress`, `/summary` or `/api/meta`: the routes registered
  with `data_route(…, true)`). No backup ever runs inside a lesson, review or
  practice request, and a failed one is only reported. An empty database has
  nothing to back up.
- **Full reset** (`POST /reset`): the person's data is backed up first, theirs
  alone (`academy-before-reset-user-<id>-<time>.json`, with the log; their
  last 14 are kept, and restoring one replaces only their data); the person's
  items and day counts go, their settings and the log stay. Nobody else's are
  touched.
- **Editing by hand** is SQL on the owner's database — only when the owner
  asks, after `php backend/manage.php --backup`, and always with
  `user_id = <the owner's id>` (1 unless `auth.local_user_id` says otherwise).
  The server reads the database on every request, so it needn't be stopped.

The old app's file, `progress/kanji.json`, and its log were imported once by
the setup (see [architecture.md](architecture.md)); nothing writes them any
more.

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

`npm run build:audio` (`php backend/tools/build-audio.php`) voices every word of
`data/vocab.json` and every SRS vocabulary item with Google Cloud
Text-to-Speech, in two voices: female `ja-JP-Neural2-B` and male
`ja-JP-Neural2-C`. After it, restart the server: the catalog and the bank pick
up the new clips.

- **What is spoken** (`speech_spoken()` in `backend/src/speech.php`, shared by the builder,
  the catalog and the exam): the first spelling, without notes, punctuation and
  optional endings (いじわる(な) → いじわる, 妹(さん) → 妹); brackets inside a
  word stay part of it (ほ(う)っておく → ほうっておく), and a phrase is spoken whole
  (かける(かぎを) → かぎをかける). A kanji word is sent as
  SSML with its reading as yomigana, so 今日 can't come out as こんにち — checked
  against the real service: 明日 with あす and with みょうにち give clips as long
  as plain あす and plain みょうにち. Suffixes and patterns (〜円) and words with
  letters in the reading (交通系ICカード) get no audio.
- **Clips** are MP3 files in `data/audio/` under random 16-hex names, listed in
  `data/audio.json` by `"<text>|<reading>"`. A listening question's clip name
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
