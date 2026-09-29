---
name: academy-pdf
description: Read pages of the scanned course books (textbooks and workbooks for both parts, the answer key) as images, the only way to see their content. Use to find or verify vocabulary, kanji, readings, grammar points, conjugation charts, exercises or answers, or to settle any question about what the book says.
---

# Reading the scanned books

The five PDFs are in `books/` at the repository root. That folder is
gitignored: the books stay on this computer, and a new machine needs them
copied in by hand (or `ACADEMY_BOOKS_DIR` pointed at them). They are page scans
with **no text layer**, and these machines have no poppler, so the Read tool
can't open them as PDFs. `backend/tools/pdf/pages.js` copies each page's
embedded JPEG out, crops and scales it, and prints the file path. Open that
path with the Read tool. (It needs `sharp`: `npm install` at the root, once.)

Whatever you learn from a book, never write the course's name into the
repository (see `CLAUDE.md`): say "textbook 1", "the answer key" and so on.

```bash
# from the repository root
node backend/tools/pdf/pages.js textbook-2 357-359          # full pages, by PDF page number
node backend/tools/pdf/pages.js textbook-1 364 --book-page  # by the page number printed in the book
node backend/tools/pdf/pages.js answer-key 1-40 --sheet     # contact sheet of thumbnails to find things
node backend/tools/pdf/pages.js textbook-1 389 --width 1800 # bigger, for small print (furigana, charts)
```

(`npm run pdf:pages -- textbook-2 357-359` does the same.)

Page numbers are **PDF page numbers**, the same numbers a PDF viewer shows. The
offsets hold for whole books, because blank and divider pages are numbered book
pages.

| Book | Key (and file `books/<key>.pdf`) | PDF page = printed page + |
|---|---|---|
| Textbook, part 1 | `textbook-1` | 7 |
| Workbook, part 1 | `workbook-1` | 3 |
| Textbook, part 2 | `textbook-2` | 5 |
| Workbook, part 2 | `workbook-2` | 3 |
| Answer key (both parts) | `answer-key` | 2 |

The first call for a book reads the PDF once into `%TEMP%\academy-pages\`,
which takes a few seconds. Later calls are instant.

## Where things are

The page maps for every book are in `docs/kb/data-provenance.md`
under "Page maps". Read them before searching. The most used pages:

- **Vocabulary index J–E:** textbook 1 367–375. Textbook 2 357–372, which
  covers both parts.
- **Kanji lists:** textbook 1 311–360 and textbook 2 279–346, two pages per
  lesson. See the kb for each lesson's pages.
- **Conjugation charts:** textbook 1 389. Textbook 2 393 (Part 1 forms) and 394
  (potential, volitional, ば, passive, causative, causative-passive).
- **Grammar:** grammar indexes at textbook 1 365–366 and textbook 2 353–356.
  The table of contents of textbook 2, with grammar points, is at 11–14.
- **Answer key:** textbook 1 4–19, textbook 2 20–33, workbook 1 34–50,
  workbook 2 51–64, listening scripts 65 onwards.

If something isn't in the maps, run `--sheet` over a range, spot the page, then
open it full size. Add what you found to the kb page maps.

## Reading carefully

- Check the page number printed on the image to confirm you have the right
  page. The offsets above are verified, but it is cheap to confirm.
- Zoom (`--width 1600` or more) before trusting small kana: ば/ぱ, ゃ/や, っ/つ,
  ー/一, ぺ/ペ and 士/土 look alike in scans.
- Copy exactly: the book's English wording, its punctuation and its
  alternatives. When a page is ambiguous, say so rather than guess.
- Record the page you used (book key + PDF page) in your notes or report so
  anyone can re-check it.

Transcription formats for `data/source` are in the `academy-data` skill.
