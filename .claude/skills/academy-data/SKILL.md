---
name: academy-data
description: Change Japanese Academy's study data safely. Fix a typo, or add or correct a word, kanji, reading or meaning in data/source/*.tsv, rebuild data/*.json, check the invariants, and keep everybody's SRS progress when an item id changes. Use for any edit under data/ or to backend/tools/build-data.php / backend/tools/build-audio.php.
---

# Changing the study data

Sources, page maps, formats and known quirks:
`docs/kb/data-provenance.md`. Read it before your first edit.

## Where things live

| Want to change | Edit | Then |
|---|---|---|
| a word's kana, kanji, English, verb class or lesson | `data/source/vocab-part1.tsv` (Greetings–L12) or `vocab-part2.tsv` (L13–23) | `npm run build:data` |
| a kanji's readings, meaning or example compounds | `data/source/kanji-part1.tsv` / `kanji-part2.tsv` | `npm run build:data` |
| grammar index | `data/source/grammar-index-part1.tsv` / `-part2.tsv` | `npm run build:data` |
| audio | nothing by hand: the clips come from Google Cloud Text-to-Speech | `npm run build:audio` (key in `.env`) after words change; `-- --dry-run` first to see what it would send |
| hand-written exam questions | `data/authored-items*.php` | see the `academy-exam-items` skill |
| how items become SRS items (merging, glosses) | `backend/src/srs/catalog.php` | code change: `academy-code-reviewer` |

Never edit `data/vocab.json`, `kanji.json`, `grammar-index.json` or
`audio.json` by hand. The build overwrites them. The same goes for the
`srs_items` and `exam_questions` tables: the server rebuilds them from `data/`
when it starts.

## Steps

1. **Find the page and read it** (`academy-pdf` skill). The book is the authority,
   not memory. Many "typos" are the book's own wording.
2. **Edit the row** with the Edit tool. The file is tab-separated with no
   header, and the fields per row are:
   - vocab (4): `kana ⇥ kanji ⇥ english ⇥ tag`
   - kanji (7): `no ⇥ kanji ⇥ lesson ⇥ on ⇥ kun ⇥ meaning ⇥ compounds`
   - grammar (3): `lesson ⇥ point ⇥ ref`

   Check the structure:
   ```bash
   # from the repository root
   for f in data/source/*.tsv; do echo "$f: $(awk -F'\t' '{print NF}' "$f" | sort | uniq -c | tr '\n' ' ')"; done
   ```
   Each file must show a single field count (vocab 4, kanji 7, grammar 3).
3. **Keep the conventions:**
   - Readings in hiragana; katakana words stay katakana.
   - `/` between alternatives; `(な)` marks a な-adjective.
   - Verb classes are `[u]`, `[ru]`, `[irr.]` inside the English field.
   - Lesson tags look like `会L7` or `読L9-II`.
   - Compounds are `word(reading)=english`, separated by `;`.
4. **Rebuild and test:** `npm run build:data`, then `npm test`. The catalog
   tests check kanji numbering 1–317, per-lesson totals and unique ids, and the
   frontend's `answer.spec.ts` that every item is answerable with its own
   answers.
5. **Restart the owner's server** (`academy-run`). At its start it sees that
   `data/` changed and rebuilds the catalog and the question bank in the
   database (a few seconds).
6. **Run the `academy-data-auditor` agent** on the rows you changed. Give it the
   file, the rows and the page you used.

## When a change renames an SRS id

SRS items are keyed `k:<kanji>` and `v:<word>`, the word as written. Changing
the kanji spelling of a word, or merging or splitting items, changes the key.
Everybody's progress then stays under the old key and disappears from the app
(on the owner's computer that is the owner's; a website's database holds
several people's, and needs the same move there).

1. Before the change, check whether the old id has progress, for anybody.
   This reads the database of this copy's settings — on the owner's PC their
   real one — and only reads it (`PHP` = a PHP 8 that can run the app, see
   `academy-run`):
   ```bash
   "$PHP" -r 'require "backend/src/bootstrap.php"; var_export(db_all("SELECT user_id, stage FROM srs_progress WHERE item_id = ?", [$argv[1]]));' 'v:OLD'
   ```
2. If it prints an empty array, you're done.
3. If it has progress:
   - Tell the owner, and do the rest only with their go-ahead.
   - Take a backup: `php backend/manage.php --backup` (or
     `npm run manage -- --backup`).
   - Move the rows and their log lines to the new key, for everybody, in one
     transaction:
     ```bash
     "$PHP" -r 'require "backend/src/bootstrap.php"; db_tx(function () use ($argv) { db_exec("UPDATE srs_progress SET item_id = ? WHERE item_id = ?", [$argv[2], $argv[1]]); db_exec("UPDATE srs_log SET item_id = ? WHERE item_id = ?", [$argv[2], $argv[1]]); }); var_export(db_all("SELECT user_id, stage FROM srs_progress WHERE item_id = ?", [$argv[2]]));' 'v:OLD' 'v:NEW'
     ```
     (It fails, and changes nothing, if somebody already has a row for
     `v:NEW`: then ask the owner which record to keep.)
   - Restart the server and confirm the item shows its stage.

Adding brand-new rows needs no migration. The new items simply appear as
lessons.
