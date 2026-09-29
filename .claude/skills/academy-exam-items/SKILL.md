---
name: academy-exam-items
description: Write, fix or review the hand-written Japanese Academy exam questions (particles, grammar, counters, translation) in data/authored-items-part1.php and data/authored-items-part2.php. Use when adding questions, fixing a question with a wrong or doubtful answer, or checking distractors.
---

# Hand-written exam questions

Only four sections are hand-written: `particle`, `grammar`, `counter` and
`translation`. The rest of the exam is generated from data, so fix that through
`data/source` (`academy-data` skill) or the generators
(`backend/src/generate.php`, `backend/src/conjugate.php`).

| Lessons | File |
|---|---|
| 0–12 (Part 1) | `data/authored-items-part1.php` (~175 items) |
| 13–23 (Part 2) | `data/authored-items-part2.php` (~165 items) |

## Format

Each item is one helper call, placed in the matching array (`$PARTICLES`,
`$GRAMMAR`, `$COUNTERS`, `$TRANSLATION`) and in lesson order. The helpers are
defined at the top of each file; they check the types (the lesson a number,
the distractors a list):

```php
$P(lesson, question, correct, [d1, d2, d3], explain, ref)         // particle
$G(lesson, question, correct, [d1, d2, d3], explain, ref, hint?)  // grammar; hint shows under the question
$C(lesson, question, correct, [d1, d2, d3], explain, ref)         // counter
$T(lesson, question, correct, [d1, d2, d3], explain, ref)         // translation

$P(4, 'つくえの上に本＿あります。', 'が', ['を', 'は', 'に'],
    'あります/います take が for the thing that exists.', 'L4-1'),
```

- Strings are PHP single-quoted: write a `'` inside one as `\'` (the items use
  the typographic ’ instead), and never use `"…"` strings, which would read
  `$` as a variable.
- The blank is `＿` (full-width low line, U+FF3F).
- `explain` is one short English sentence giving the rule, not just the answer.
  It appears in the report next to a missed question.
- `ref` is `L<lesson>-<grammar note>` from the grammar index
  (`data/grammar-index.json`, whose `ref` column uses the same format), or
  `L<lesson>` when the item isn't about one note.
- Translation prompts are English in straight double quotes, and the options
  are full Japanese sentences.

## Rules for a good item

1. **Exactly one right answer.** Test each distractor on its own: is the
   sentence wrong, or does it mean something different from what is asked? If
   a distractor is also correct (は vs が in many sentences, に vs へ for
   destinations, で vs に in some place expressions), replace it.
2. **Plausible distractors.** Use the mistakes learners make: a neighbouring
   particle, the wrong conjugation, a similar counter. Avoid nonsense options.
3. **Only what's been taught.** Use grammar and vocabulary from that lesson or
   earlier (check `data/vocab.json` lessons and the grammar index).
4. **Written the way the book writes it.** Sentences come from, or are modelled
   on, the textbook and the answer key. Use the `academy-pdf` skill to check
   them. Keep their spelling: kanji where the answer key uses kanji, as the
   existing items do.
5. **Distinct options.** No duplicates, and nothing that differs only in
   spacing. `npm test` checks this for every question.

## After editing

1. `npm test`, from the repository root. The bank tests check the option count,
   uniqueness and the answer index.
2. Run the `academy-japanese-reviewer` agent on the new or changed items. Give it
   the file and the lessons.
3. Restart the owner's server (`academy-run`): at its start it rebuilds the
   question bank in the database, because an item file changed. Question ids
   are sequential, so edits shift the ids of later authored items. That only
   matters for a paper already in progress.
4. If the counts changed noticeably, update the bank figures in `README.md`
   and `docs/kb/exam.md`.
