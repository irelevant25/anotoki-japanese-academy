# Exam

Multiple choice only (the user's choice). Code: `backend/src/generate.php`
(bank and papers), `backend/src/conjugate.php`, `backend/src/score.php`,
`backend/src/report.php`, `backend/src/exam.php` (the API side, routed by
`backend/api/routes/exam.php`), and in the browser
`frontend/src/app/exam/` (one component: setup, the paper, the result).

## The bank — 11,523 questions, built when the content is synced

`exam_build_bank()` runs when data/ or the generator changed (the server's
start, the setup page; ~2 s) and the result is stored in the `exam_questions`
table, in bank order (`seq`). Ids are `q1`, `q2` … in the order the builders
make them.

| Section | Part 1 | Part 2 | Built from |
|---|---:|---:|---|
| `listening-word` / `listening-meaning` | 729 / 729 | 662 / 662 | `vocab.json` words and their clips (`backend/src/speech.php`); one of the two voices per question, fixed when the bank is built; distractors chosen by kana similarity (じぶん vs ずいぶん); a word that sounds the same (はし) or shares a meaning (さけ / おさけ) is never a distractor |
| `vocab-jp-en` / `vocab-en-jp` | 761 / 710 | 713 / 680 | `vocab.json`; same-lesson, same part-of-speech distractors, never one that shares a sense with the answer (`exam_same_meaning()`); a gloss shared by two words is never asked EN→JP |
| `kanji-reading` | 460 | 500 | kanji-list compounds; distractors re-read the compound with its kanji's *other* readings; compounds with a kanji outside the course's list skipped |
| `kanji-meaning` | 145 | 172 | `kanji.json` |
| `kanji-writing` | 524 | 672 | compound with one kanji swapped |
| `verb-conjugation` | 462 | 1,461 | `conjugate.php`; a form is filed under the later of the verb's lesson and the lesson that teaches the form (potential L13, volitional L15, ば L18, passive L21, causative L22, causative-passive L23) |
| `verb-class` | 113 | 162 | u / ru / irregular (three options) |
| `adjective` | 372 | 234 | い/な rules crossed over for distractors |
| `kana` | 260 | — | hiragana/katakana tables |
| `particle`, `grammar`, `counter`, `translation` | 50, 69, 26, 30 | 40, 83, 14, 28 | hand-written: `data/authored-items-part1.php`, `data/authored-items-part2.php` |

The listening sections exist only when the audio has been made
(`npm run build:audio`); without it the bank is 2,782 questions smaller.

Keigo verbs (honorific/humble/extra-modest) are excluded from the Part 2 forms
(no causative-passive of いらっしゃる); the five 〜さる verbs take います
(くださいます) with the regularised form (くださります) offered as a distractor.

## Papers

`exam_paper($spec)` (`exam_build_paper()` over the stored bank rows in scope,
in bank order): each section gets `size × weight / Σweights` questions
(weights in `SECTIONS`), spread round-robin across the lessons in scope,
options shuffled by the seeded RNG. Same spec → identical paper. (`books`
means the parts: 1 = Part 1, 2 = Part 2.)

The RNG, the rounding and the string handling reproduce the first
(JavaScript) version exactly — mulberry32 seeded from the seed's UTF-16 code
units, `Math.round`, `toFixed` — so a seed still gives the paper it gave
before the port; `backend/tests/unit/exam-bank.test.php` pins the first numbers.

## The two rules that keep scoring honest

1. **The browser never receives answers.** `/api/exam` sends questions and
   options only. `answerIndex`, `correct`, `distractors`, `explain` must never
   appear in that response (a test walks every key). A listening question sends
   the name of its clip, which is random and says nothing about the word.
2. **Submit rebuilds the paper from the echoed `spec`** — the exact arguments
   the paper was built from. Never rebuild from the resulting question count:
   a 250-question request yields ~252 questions, and rebuilding with 252 makes a
   *different* paper (this bug happened). Answers whose ids aren't in the rebuilt
   paper → 409, nothing saved.

## Scoring and reports

Pass mark 70 %; grades A ≥90, B ≥80, C ≥70, D ≥60, F. Sections/lessons under
60 % are flagged as weaknesses. Unanswered = wrong. Each attempt is stored in
the `exam_attempts` table as the person's who sat it (`user_id`): the whole
record (every answer and its timing, in the shape `results/<id>.json` had) and
its report. An attempt's id is its finishing time and seed, so it is unique
per person only: two people may have the same one, and `/report/<id>` finds
the one of the person asking (somebody else's answers 404). The report is
standalone HTML (inline CSS, no scripts; `GET /report/<id>`, sent with a
Content-Security-Policy that allows no script) with breakdowns by part (when
both), skill and lesson, every missed question with explanation, and the
person's attempt history. Dates in it follow the computer's locale, through
ICU, as the browser's `toLocaleString()` did.

Signed in (auth mode iam), the browser can't just follow the report link: it
carries no token. `PrivateLinksService` fetches the report with the token and
opens it from memory in a new tab ([sign-in.md](sign-in.md)).

## In the browser

`frontend/src/app/exam/exam.component`: the setup screen (part, paper length,
lessons and sections under "Narrow the scope", a paper id to sit the same
paper again, past attempts with their reports), the paper, and the result
(verdict, breakdowns by skill and lesson, the missed questions with their
explanations, the full report). While sitting it: 1–4 or A–D choose — and move
on by themselves, so a long paper stays a flow —, → or Enter the next question
(on the last, Enter finishes), ← back, F flags, R or Space plays the recording
again; a listening question plays its clip when it is shown, and the next
question's clip is fetched meanwhile. "Finish now" asks first when questions
are unanswered.

The attempts from before the database (`results/`, `reports/`, from
2026-09-22) were imported by the setup, their reports unchanged. Migration
002 gave them, with everything else, the owner's user id (1), with the
owner's approval on 2026-09-27; apart from that they are never rewritten.

## Adding hand-written questions

Use the `academy-exam-items` skill. One helper call per item — `$P()` particle,
`$G()` grammar, `$C()` counter, `$T()` translation:
`$G(lesson, question, correct, [3 distractors], explanation, ref)`.
Every distractor must be *wrong* for the question as asked; have the
`academy-japanese-reviewer` agent check new items.
