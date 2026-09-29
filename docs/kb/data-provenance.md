# Data provenance

Where every piece of study data came from, how it was captured, and how to fix
or extend it.

**Never name the course the data comes from**, anywhere in the repository: not
in code, data, docs, file names or commit messages. The owner's requirement;
`backend/tests/unit/source-names.test.php` checks it. Say "the course", "Part 1 / 2",
"textbook 1" and so on.

## Sources

The course has two parts, each with a textbook and a workbook, and one answer
key for both. The five scanned books are in **`books/`** at the repository root,
which is gitignored: they stay on this computer (`ACADEMY_BOOKS_DIR` points the
page tool elsewhere). They are page **scans with no text layer** — nothing can
be copied out as text. Everything in `data/source/*.tsv` was transcribed by
reading page images (see *Reading the PDFs* below).

| Book | File | page tool key | Pages | Crop | PDF page = printed page + |
|---|---|---|---:|---|---:|
| Textbook, part 1 | `textbook-1.pdf` | `textbook-1` | 391 | none | 7 |
| Workbook, part 1 | `workbook-1.pdf` | `workbook-1` | 156 | none | 3 |
| Textbook, part 2 | `textbook-2.pdf` | `textbook-2` | 396 | page inside a 1080×1920 frame | 5 |
| Workbook, part 2 | `workbook-2.pdf` | `workbook-2` | 136 | as textbook 2 | 3 |
| Answer key (both parts) | `answer-key.pdf` | `answer-key` | 84 | page inside a 1920×1080 frame | 2 |

Page numbers in this knowledge base are **PDF page numbers**, the same numbers
any PDF viewer shows. The blank and section-divider pages are numbered pages of
the book, so each offset holds for the whole book. This was checked at the
start, middle and end of each book, and on both sides of every blank page.

The audio does **not** come from the books: `npm run build:audio` makes it with
Google Cloud Text-to-Speech (see [kanji-srs.md](kanji-srs.md)).

## Page maps (PDF page numbers)

**Textbook 1**
- **Front matter:** kana charts 3–6 · contents 12–18.
- **Kanji lists (読み書き編), two pages per lesson:** L3 311–312 · L4 315–316 ·
  L5 319–320 · L6 325–326 · L7 331–332 · L8 336–337 · L9 341–342 ·
  L10 347–348 · L11 353–354 · L12 359–360.
- **Back matter:** appendix divider 364 · grammar index 365–366 ·
  **vocabulary index J–E 367–375** · E–J 376–384 · map 385–386 ·
  numbers 387–388 · **conjugation chart 389**.

**Textbook 2**
- **Front matter:** the cover is page 1, although the scan stores it last.
  Table of contents with grammar points per lesson 11–14.
- **Kanji lists:** L13 279–280 · L14 286–287 · L15 291–292 · L16 298–299 ·
  L17 304–305 · L18 311–312 · L19 318–319 · L20 326–327 · L21 333–334 ·
  L22 339–340 · L23 345–346.
- **Back matter:** appendix divider 352 · grammar index 353–356 ·
  **vocabulary index J–E 357–372 (covers both parts)** · E–J 373–388 ·
  map 389–390 · numbers 391–392 · **conjugation chart 393 (Part 1 forms) +
  394 (potential, volitional, ば, passive, causative, causative-passive)**.

**Answer key**
- contents 3
- textbook 1 answers 4–19
- textbook 2 answers 20–33
- workbook 1 answers 34–50
- workbook 2 answers 51–64
- listening scripts 65 onwards

**Workbook 1**
- **Front matter:** contents 8–11 · 会話・文法編 divider 12.
- **会話・文法編:** hiragana 14 · greetings 16 · numbers 18 · Lesson 1 from 19.
- **読み書き編:** divider 122 · Lesson 1 from 124.

**Workbook 2**
- **Front matter:** contents 8–11 · 会話・文法編 divider 12.
- **会話・文法編:** Lesson 13 from 14.
- **読み書き編:** divider 112 · Lesson 13 from 114.

## Reading the PDFs

```bash
npm run pdf:pages -- textbook-2 357-359            # full-size pages, by PDF page number
npm run pdf:pages -- textbook-1 364 --book-page    # by printed page number
npm run pdf:pages -- answer-key 1-40 --sheet       # contact sheet to find things
node backend/tools/pdf/pages.js textbook-2 357     # the same, without npm
```

The tool prints image paths; open them with the Read tool. The first call for
a book reads the PDF once and caches one JPEG per page in
`%TEMP%/academy-pages/`.

Why it works this way:
- The PDFs have no text layer.
- The Read tool can't render PDF pages here, because there's no poppler.
- Each page is a single embedded JPEG, which can be copied out without
  decoding.

Page order comes from the PDF's page tree. Where the images sit in the file
doesn't matter, and a blank page that reuses another page's image still gets
its own number. The `academy-pdf` skill covers the whole workflow.

## `data/source/` formats (tab-separated, UTF-8, no header)

**`vocab-part1.tsv`, `vocab-part2.tsv`** — from the vocabulary index J–E
```
kana ⇥ kanji ⇥ english ⇥ tag
あう ⇥ 会う ⇥ to meet; to see (a person) [u] ⇥ 会L4
しずか(な) ⇥ 静か ⇥ quiet ⇥ 会L5
```
- `english` keeps the list's verb class `[u]` / `[ru]` / `[irr.]`: it is the
  only source of verb classes, which the exam's conjugation questions depend on.
- `(な)` marks a な-adjective; other parentheses are optional parts: `弟(さん)`.
- `tag`: `会L7` conversation & grammar, Lesson 7 · `読L9-II` reading & writing ·
  `会G` greetings · `(e)` Useful Expressions page. Only the first tag was kept.
- `vocab-part2.tsv` holds only Lesson 13+ entries: the index of textbook 2
  repeats every Part 1 word, and those come from `vocab-part1.tsv`. 38 of its
  rows repeat a Part 1 word listed again for a later lesson (あんないする
  読L9-II, 会L16); the build keeps the Part 1 row, so 1,753 rows give 1,715
  entries.

**`kanji-part1.tsv`, `kanji-part2.tsv`** — from the per-lesson kanji lists
```
no ⇥ kanji ⇥ lesson ⇥ on ⇥ kun ⇥ meaning ⇥ compounds
016 ⇥ 日 ⇥ 4 ⇥ に/にち/にっ ⇥ び/ひ/か ⇥ day; sun ⇥ 日本(にほん)=Japan;毎日(まいにち)=every day
```
- Readings in hiragana, `/`-separated, sound-change variants included (いち/いっ).
- Compounds are `word(reading)=english`, `;`-separated; alternatives use `/`
  inside a field: `入り口/入口(いりぐち)=entrance`.

**`grammar-index-part1.tsv`, `grammar-index-part2.tsv`**: `lesson ⇥ point ⇥ ref`
(`ref` like `L8-3` = Lesson 8, grammar note 3; the book's letters are kept:
`-E` Expression Notes, `-U` Useful Expressions, `-C` Culture Notes — legend on
textbook 1, PDF page 365).

## Built data (`npm run build:data` = `php backend/tools/build-data.php`, `npm run build:audio` = `php backend/tools/build-audio.php`)

The builders write exactly what the first (JavaScript) builders wrote —
`JSON.stringify(x, null, 1)`, no trailing newline — so a rebuild of unchanged
sources changes nothing (`backend/tests/unit/build-data.test.php`).

| File | Entries | Notes |
|---|---:|---|
| `data/vocab.json` | 1,715 | both parts; `verbClass`, `adjClass`, `pos`, `lesson` derived |
| `data/kanji.json` | 317 | numbered 1–317 without gaps; per-lesson totals match the book |
| `data/grammar-index.json` | 141 | |
| `data/audio.json` + `data/audio/` | 2,041 words × 2 voices | made by Google Cloud Text-to-Speech, not from the books |

The kanji totals per lesson are asserted in `backend/tests/unit/catalog.test.php`:
L3–12 15/14/14/15/14/14/15/14/16/14 · L13–23 16/16/16/16/15/16/16/15/15/16/15.

## Known quirks — deliberate, don't "fix"

- **々** is kanji #133 but has no reading of its own: it is in `kanji.json` and
  the exam, not in the kanji SRS.
- A word with any kanji outside the course's 317 (残念: 念, 雑誌) is in the
  exam's vocabulary questions but is **not** an SRS item.
- The SRS merges spelling variants (入口 / 入り口 → one item) and resolves keigo
  glosses ("honorific expression for くれる" also accepts "to give (me)").
- `なにも + negative` style notes are stripped from readings (catalog build).
- Suffixes and patterns (〜円, 〜か〜) and words whose reading has letters
  (交通系ICカード) get no audio (`backend/src/speech.php`). A word written with letters
  keeps its reading in the kana column, as the index prints it in brackets:
  `ティーシャツ ⇥ Tシャツ`, `エルサイズ ⇥ Lサイズ`, `エスエヌエス ⇥ SNS`.
- Minute words keep both forms the index gives, in its order: one row when it
  prints them together (`さんじっぷん/さんじゅっぷん`), two rows when it lists
  them apart (はちふん and はっぷん). Textbook 1 p.62 gives the っぷん forms as
  the main ones.

## Fixing a typo or adding content

1. Find the page (`npm run pdf:pages`, page maps above) and read it.
2. Edit the TSV row. Keep the format exactly — tabs, not spaces.
3. `npm run build:data`, then `npm test` (the counts and invariants will catch slips).
4. If a word was added or its spelling or reading changed, `npm run build:audio`
   voices it (it needs the API key) and drops the clips nothing uses any more.
5. Restart the server (`academy-run` skill): at its start it sees that `data/`
   changed and rebuilds the catalog and the question bank in the database.
6. Ask the `academy-data-auditor` agent to check the edited rows against the page.

**Changing a spelling changes an SRS id.** Items are keyed `k:<kanji>` and
`v:<word>`; if a fix renames one, the learner's progress stays under the old key
and stops showing. After a backup (`php backend/manage.php --backup`), rename the key in
the database — `UPDATE srs_progress SET item_id = 'v:NEW' WHERE item_id = 'v:OLD'`
(and the same in `srs_log`) — then restart. The `academy-data` skill has the steps.
