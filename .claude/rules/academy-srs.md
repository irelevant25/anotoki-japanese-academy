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
  down to the local hour. The penalty is `ceil(w/2)` stages, doubled from Guru
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
  user id first (from `auth_user()`, never from a request's body), and every
  query has `WHERE user_id = ?`. One person can never read or change another's
  items, day counts, log or settings.
- `store.php` saves each answer in one transaction: the item, the day's count
  and the `srs_log` line. The log is only ever added to; the one exception
  was migration `002_users.sql`, which gave every existing line the owner's
  user id, a one-time change the owner approved on 2026-09-27. The day's
  backup (`backend/src/backup.php`) runs when the server starts or at the
  first page load of a new day (the routes registered with
  `data_route(…, true)`), never on an answer; nothing slow goes on the answer
  path (the one bend: on a website, the first request after an upload applies
  migrations and rebuilds content, whatever request it is —
  `backend/src/upkeep.php`). The item records keep the shape of `srs_blank()`,
  which the browser (`ItemState` in `api.types.ts`), the export and the
  backups share.
- `frontend/src/app/kanji/answer.ts`: every catalog item must accept its own
  printed answers (`answer.spec.ts` checks the whole catalog). A typo that
  spells another item's meaning stays wrong. Any change here needs the
  `academy-japanese-reviewer` agent.
- The browser saves answers in the background, and the summary waits for
  pending saves. Keep it that way; the next card must never wait for the
  server.
- Run `npm test`. If the UI changed, also run `npm run test:browser` and the
  `academy-ui-check` skill (or the `academy-ui-tester` agent).
