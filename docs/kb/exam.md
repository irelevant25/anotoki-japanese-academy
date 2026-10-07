# Exam

Multiple choice only (the user's choice). Code: `backend/src/generate.php`
(bank and papers), `backend/src/conjugate.php`, `backend/src/score.php`,
`backend/src/report.php`, `backend/src/exam.php` (the API side, routed by
`backend/api/routes/exam.php`), and in the browser
`frontend/src/app/exam/` (one component: setup, the paper, the result).

## The bank — 11,523 questions, built when the content is synced

`exam_build_bank()` runs when `backend/data/` or the generator changed (the
first request after the change, the setup page, `manage.php --sync`; ~2 s) and the result is stored in the `exam_questions`
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
| `particle`, `grammar`, `counter`, `translation` | 50, 69, 26, 30 | 40, 83, 14, 28 | hand-written: `backend/data/authored-items-part1.php`, `backend/data/authored-items-part2.php` |

The listening sections exist only when the audio has been made
(`backend/tools/build-audio.php`); without it the bank is 2,782 questions smaller.

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
record (every answer and its timing, in the shape the old app's `results/<id>.json` had) and
its report. An attempt's id is its finishing time and seed, so it is unique
per person only: two people may have the same one, and `/report/<id>` finds
the one of the person asking (somebody else's answers 404). The report is
standalone HTML (inline CSS, no scripts; `GET /report/<id>`, sent with a
Content-Security-Policy that allows no script) with breakdowns by part (when
both), skill and lesson, every missed question with explanation, and the
person's attempt history. Dates in it follow the computer's locale, through
ICU, as the browser's `toLocaleString()` did. The report stays English in
every language (a stored row is never rewritten); the page's link to it is
translated and says `hreflang="en"`.

Signed in, the browser can't just follow the report link: it
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

**A paper open while the site stops for an update** (since 2026-10-07): the
anotoki library's page stands in front of it ("The site is being updated"),
its handing in is refused without a dialog (503 `update_pending`: the library's
page says what is going on), and no key reaches the hidden paper. The paper is
kept for the tab meanwhile (`sessionStorage`, `academy-exam-kept-paper`: the
paper, the question it is on, the answers with their times, the flags, the
name, its start) — the library's page loads the page afresh once the site is
back, which would lose a paper held only in memory — and put back as it was
when the exam opens again, for the person it was kept for (or whoever signs
in where a visitor kept it), its clock counting from its start; then it is
handed in as ever. A paper left the usual way, the site ready, goes as it
always has. Until then the refusal said "not up to date" in a dialog and the
paper stayed on the page.

The page's frame is in the language on the page (setup, the running paper's
chrome, the result, the history); the questions, options, hints and
explanations are material and stay as written, marked `lang="en"` or
`lang="ja"`. The section, part and lesson names are worded from the ids the
server sends (`exam.section.<id>`, `exam.part.<id>`, `common.lesson`; a
review row carries `sectionId` beside its name), so the server's names stay
in its answers, unused by the page.

The attempts of the app before the database (`results/`, `reports/`, from
2026-09-22) were never imported into it: the owner deleted the folders on
2026-10-04, and git keeps them. Migration 002 gave every study row there was
the owner's user id (1), with the owner's approval on 2026-09-27; apart from
that attempts are never rewritten.

## Adding hand-written questions

Use the `academy-exam-items` skill. One helper call per item — `$P()` particle,
`$G()` grammar, `$C()` counter, `$T()` translation:
`$G(lesson, question, correct, [3 distractors], explanation, ref)`.
Every distractor must be *wrong* for the question as asked; have the
`academy-japanese-reviewer` agent check new items.
