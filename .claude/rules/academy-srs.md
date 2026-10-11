---
paths:
  - "backend/src/srs/**"
  - "backend/src/backup.php"
  - "backend/api/routes/kanji.php"
  - "frontend/src/app/kanji/**"
---

# Kanji SRS (Japanese Academy)

Reference: `docs/kb/kanji-srs.md`. Read it before changing the trainer.

- The schedule is WaniKani's: 4, 8, 23, 47, 167, 335, 719 and 2879 h, rounded
  down to the hour of the learner's own time zone (their browser's
  `X-Time-Zone`; days and the dashboard's today are theirs too, the backups'
  names UTC: `docs/kb/kanji-srs.md`). The penalty is `ceil(w/2)` stages, doubled from Guru
  up, and never goes below Apprentice I. Change it only if the owner asks, and
  update `backend/tests/unit/srs.test.php` with it.
- `srs_practice()` updates only `practice.*` and `lastWrongAt`. It must never
  touch `stage`, `nextReview` or the review counters: the owner drills as often
  as they like because practice can't move the schedule.
- No daily caps and no time locks on lessons (batches, 5 by default) or on
  practice. This is the owner's requirement.
- `POST /review` is accepted only for a due item (60 s grace) and answers 409
  otherwise. That same check, with the item's row locked, blocks double
  submits.
- Vocabulary opens once all its kanji are learned. The server (`POST /learn` →
  409) and `KanjiStateService.isAvailable()` must agree.
- A catalog change can rename or drop `k:`/`v:` ids, which orphans everybody's
  progress for those items. If it can't be avoided, move the rows in
  `srs_progress` and `srs_log` (backup first; the `academy-data` skill has the
  steps) and tell the owner.
- Every row is one person's: each `store_…` and `kanji_…` function takes the
  user id first (from the token's `sub` through the library's `Identify`,
  never from a request's body), and every
  query has `WHERE user_id = ?`. One person can never read or change another's
  items, day counts, log or settings.
- `store.php` saves each answer in one transaction: the item, the day's count
  and the `srs_log` line. A person's log is only ever added to; the one exception
  was migration `002_users.sql`, which gave every existing line the owner's
  user id, a one-time change the owner approved on 2026-09-27 (a visitor's
  lines become the person's at sign-in, `visitors_move()`, all but the
  visitor's resets of what the person kept). The day's
  backup (`backend/src/backup.php`) runs at the first page load of a day (the
  routes registered with `study_route(…, true)`), never on an answer; nothing
  slow goes on the answer path (the one bend: the first request after the
  files changed — an upload, a pull — rebuilds content, whatever request it
  is, on this computer as on a website — `backend/src/upkeep.php`; a new
  migration is never applied by a request: it waits for an ADMIN's Apply on
  the Migrations page, and the pages say "The site is being updated" meanwhile). The item records keep the shape of `srs_blank()`,
  which the browser (`ItemState` in `api.types.ts`), the export and the
  backups share.
- `frontend/src/app/kanji/answer.ts`: every catalog item must accept its own
  printed answers (`answer.spec.ts` checks the whole catalog). A typo that
  spells another item's meaning stays wrong. Any change here needs the
  `academy-japanese-reviewer` agent.
- The browser saves answers in the background, and the summary waits for
  pending saves. Keep it that way; the next card must never wait for the
  server.
- Run the PHP tests (`node backend/tools/php.js backend/tests/run.php`) and
  `npm test` in `frontend/`. If the UI changed, also run `node frontend/e2e/run.js` (after
  `node frontend/scripts/ensure-build.mjs`) and the
  `academy-ui-check` skill (or the `academy-ui-tester` agent).
