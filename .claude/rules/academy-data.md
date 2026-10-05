---
paths:
  - "backend/data/**"
  - "backend/tools/build-data.php"
  - "backend/tools/build-audio.php"
  - "backend/tools/pdf/**"
  - "backend/src/content.php"
  - "backend/src/speech.php"
---

# Study data (Japanese Academy)

Reference: `docs/kb/data-provenance.md` (sources, page maps,
formats). For the edit procedure, use the `academy-data` skill; to see a book page,
use the `academy-pdf` skill.

- `backend/data/*.json` is generated, so never edit it by hand. Edit
  `backend/data/source/*.tsv`, then run `node backend/tools/php.js backend/tools/build-data.php`. For audio, run
  `node backend/tools/php.js backend/tools/build-audio.php`. A rebuild of unchanged sources must change nothing
  (`backend/tests/unit/build-data.test.php`).
- The TSVs are UTF-8, tab-separated, with no header. Fields per row: vocab 4,
  kanji 7, grammar index 3. Check with
  `awk -F'\t' '{print NF}' <file> | sort | uniq -c`.
- Transcribe what the page prints: readings in hiragana (katakana words in
  katakana), the book's English wording, and `/` between alternatives.
  Don't paraphrase: answers are checked against these glosses.
- The verb-class tags `[u]`, `[ru]` and `[irr.]` in the vocab English field are
  the only source of verb classes, and the conjugation questions depend on them.
- The PDFs in `books/` are gitignored: local only, never commit them. Never
  name the course they belong to anywhere in the repository.
- `backend/data/audio.json` and `backend/data/audio/` come only from `node backend/tools/php.js backend/tools/build-audio.php`
  (Google Cloud Text-to-Speech, needs `GOOGLE_TTS_API_KEY` in `backend/.env`). After a
  word is added or its spelling or reading changes, run it: it voices only
  what is missing and drops unused clips. Otherwise leave the clips as they
  are.
- The catalog and the question bank live in the database (`srs_items`,
  `exam_questions`), rebuilt from `backend/data/` at the first request after
  it changed (on this computer as on a website); never edit those tables.
  `CONTENT_FILES` in `backend/src/content.php` lists what triggers a rebuild:
  add a file there if the builders start reading it. Its `backend/data/` files are also
  what `backend/tools/build-dist.php` uploads, so a data file the site needs
  must be on it.
- Changing a spelling renames an SRS id, which orphans everybody's progress
  for that item. See the id-rename procedure in the `academy-data` skill.
- After an edit: run `node backend/tools/php.js backend/tools/build-data.php`,
  the PHP tests (`node backend/tools/php.js backend/tests/run.php`) and
  `npm test` in `frontend/` (the answer checking against the whole catalog),
  then the `academy-data-auditor` agent on the changed rows. No restart: the
  app's next request rebuilds the content.
