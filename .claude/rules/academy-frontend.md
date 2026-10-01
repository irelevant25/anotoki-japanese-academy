---
paths:
  - "frontend/**"
---

# Frontend (Japanese Academy)

Reference: `docs/kb/architecture.md` (the frontend's map), `DEV.md`.

- Angular 21: standalone components, `ChangeDetectionStrategy.OnPush`, state
  in signals (`signal`, `computed`, `input`, `output`), zoneless
  (`provideZonelessChangeDetection`; no zone.js). **Every component is three
  files** — `.ts`, `.html`, `.scss` — never an inline template or style, even
  for a small one.
- Styles: the tokens, the page's base and what several screens share are
  global, in `frontend/src/styles/` (`_tokens.scss`, `_base.scss`,
  `_items.scss`); a component's own styles in its `.scss`. Colours come only
  from the tokens, each defined for light and `prefers-color-scheme: dark`.
  Use `--kanji`/`--vocab` for item types and the stage tokens for SRS stages.
  Check contrast in dark mode.
- The app talks to the backend only through `ApiService` (HttpClient) —
  except the bundle of words, `GET /api/translations/{code}`, which the
  translation service asks with a plain `fetch()` and no token. The
  auth interceptor adds the sign-in's token to this site's `/api` and
  `/report` addresses and to nothing else; a link the browser would follow by
  itself to somebody's data (a report, the progress download) goes through
  `PrivateLinksService` (in auth mode `iam` it fetches with the token and opens
  from memory; a report gets `lockDown()`'s no-script policy first). In auth
  mode `none` nothing about sign-in shows: no account menu, no Sign in page.
  (The language chooser shows in every mode; the owner's link to Translations
  is in the account menu on a website, at the foot of the home page without
  sign-in.)
- `core/auth/sdk/anotoki-auth.mjs` + `.d.ts` are the anotoki IAM's browser SDK
  v1.1.1, copied unchanged from `../anotoki-iam/sdk/js/`. Never edit them; to
  update, copy the new files and change the version in `auth.service.ts`,
  `docs/kb/sign-in.md` and the test that pins it
  (`backend/tests/api/auth.test.php`). wanakana comes from npm.
- The kanji section: lesson batches, sessions and summaries are drawn over the
  screen they started from (`KanjiScreenService`), and the address stays; the
  shell redraws the screen for a click on a link to the address already shown.
  Answers save in the background; the summary waits for the saves, and is not
  drawn once the learner has left. Keep all three.
- Keys must keep working: Enter submits and continues, F opens item info, ←/→
  or Enter move through lessons; in the exam 1–4 / A–D, ←/→, Enter, F, R or
  Space. Reading inputs use the wanakana IME, and a trailing `n` turns into ん
  on submit.
- At 390 px there must be no horizontal scroll; `npm run screens` fails on
  overflow.
- The UI is in English and Slovak (informal "ty"), plain and short, from the
  database (`core/i18n/`, `docs/kb/architecture.md`, *The app's words*).
  Dates, times and numbers follow the language on the page through `Intl`
  (`TranslationService.locale()`: `'en-GB'`, `'sk-SK'`; `core/format.ts`, the
  `localDate` pipe), never the system's locale. The learning material, the SRS
  stage names (from the server) and the two owner pages stay as they are;
  material carries `lang="en"` or `lang="ja"` whatever the page's language.
- A word a learner reads is a key with an English and a Slovak string — a new
  one comes with a migration (`DEV.md`) — asked for with the `translate` /
  `translatePlural` pipes or `t()` / `plural()`; never English written into a
  template (kept terms like "Kanji" and the owner pages aside). A key put
  together at run time comes from a closed set declared in
  `core/i18n/dynamic-keys.ts`, never from an address, the IAM or what
  somebody typed. What is drawn while there may be no strings (the stand-in pages, the
  top bar) uses `keptWord()` / `keptAround()` (`standin/`), with the seeded
  English in the code. `backend/translations.php --status` and
  `backend/tests/unit/translations.test.php` hold the keys to the database.
- State holds keys, kinds and `ApiError`s, never a worded sentence: wording
  happens in a template or inside a `computed()`, so a page follows a change
  of language without being made again. A failed request is worded from its
  code (`core/i18n/error-text.ts`), never with the server's sentence (the
  owner pages excepted).
- The chooser (and the account menu) keeps its keys to itself
  (`core/menu-keys.ts`): no key pressed inside a menu reaches `document`,
  where Enter submits a card or finishes a paper. Switching the language
  changes words only: a session or a paper goes on where it was.
- "Academy" in the top bar gives way at 440 px and below, so the bar with the
  chooser fits 360 px; the five kanji tabs fit 390 px in Slovak (360 px in
  English). `npm run screens` measures both.
- `frontend/public/changelog.json`: an entry, in plain words, for every
  release the owner will notice; keep its version and the `version` of both
  `package.json` files in step.
- The backend serves the last build: run `npm run build:frontend` (or work at
  http://localhost:4400 with `npm run frontend`). The browser suites build it
  themselves when the sources changed.
- After a change: `npm run test:frontend`, `npm run test:browser` and the
  `academy-ui-check` skill, or the `academy-ui-tester` agent. The latter is
  mandatory before calling the work done.
