---
paths:
  - "backend/api/routes/exam.php"
  - "backend/src/generate.php"
  - "backend/src/conjugate.php"
  - "backend/src/score.php"
  - "backend/src/report.php"
  - "backend/src/exam.php"
  - "backend/src/util.php"
  - "frontend/src/app/exam/**"
  - "data/authored-items*.php"
---

# Exam (Japanese Academy)

Reference: `docs/kb/exam.md`.

- The browser never receives answers. `POST /api/exam` sends questions and
  options only (`exam_start()` in `backend/src/exam.php`). `answerIndex`,
  `correct`, `distractors` and `explain` stay on the server; an API test walks
  every key of the response.
- `POST /api/submit` rebuilds the paper from the echoed `spec`. Answers whose
  ids aren't in the rebuilt paper → 409, and nothing is saved. The frontend
  echoes `spec` verbatim (`ExamComponent.finish()`); keep it that way.
- Papers are seeded: the same spec gives the same paper. The RNG and the
  JavaScript-compatible helpers in `backend/src/util.php` (`js_round`,
  `js_to_fixed`, `utf16_units`, `imul` …) must keep giving the first version's
  results; `backend/tests/unit/exam-bank.test.php` pins them. If the question
  bank or the order of RNG calls changes, a paper started before a server
  restart can't be submitted afterwards. Mention this when you restart during
  the owner's study time.
- Every question has one right answer and 1–3 distinct distractors, and each
  distractor is wrong for the question as asked. Generated distractors are
  plausible mistakes: the wrong verb class, a compound read with its kanji's
  other readings, い/な rules crossed.
- `conjugate.php` is checked cell by cell against both Conjugation Charts.
  Keigo verbs get no Part 2 forms. The five 〜さる verbs take います
  (くださいます), and the regularised くださります is the distractor.
- Forms are filed under the later of the verb's lesson and the lesson that
  teaches the form: potential L13, volitional L15, ば L18, passive L21,
  causative L22, causative-passive L23.
- The rows of `exam_attempts` are their people's: on the owner's computer the
  owner's (some were imported from `results/` and `reports/`). If you change
  the attempt record, the stored ones must still load in the history and the
  reports. Never migrate or rewrite them. The one exception was migration
  `002_users.sql`, which gave every stored attempt the owner's user id (1): a
  one-time change the owner approved on 2026-09-27, with a check that no row
  was lost or changed. Apart from it the rows are never rewritten.
- An attempt belongs to the person who sat it (`user_id`), and its id is
  unique per person only: `exam_history()`, `exam_report()`,
  `exam_attempts_all()`, `exam_save_attempt()` and `exam_meta()` all take the
  user id. `/report/:id` of somebody else's attempt answers 404. Reports go out
  with a Content-Security-Policy that allows no script; signed in, the browser
  fetches them with the token (`PrivateLinksService`).
- The bank is built into the database when the server starts
  (`backend/src/content.php`). When its size changes, update the count in
  `README.md`, `CLAUDE.md` and in `docs/kb/` (exam.md, architecture.md).
- The exam screen renders through Angular's templates, which escape what they
  interpolate: never bind question or answer text with `[innerHTML]`.
  `backend/src/report.php` escapes with `report_esc()`.
- The keys while sitting a paper must keep working: 1–4 / A–D choose and move
  on, ←/→, Enter (finishes on the last), F flags, R or Space replays.
- Changes to generation, conjugation or authored items need the
  `academy-japanese-reviewer` agent. Write authored items with the
  `academy-exam-items` skill.
