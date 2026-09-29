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
- The app talks to the backend only through `ApiService` (HttpClient). The
  auth interceptor adds the sign-in's token to this site's `/api` and
  `/report` addresses and to nothing else; a link the browser would follow by
  itself to somebody's data (a report, the progress download) goes through
  `PrivateLinksService` (in auth mode `iam` it fetches with the token and opens
  from memory; a report gets `lockDown()`'s no-script policy first). In auth
  mode `none` nothing on the page may change: no account menu, no Sign in
  page.
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
- The UI is in English, plain and short. Dates and times with words use
  `'en-GB'` (`core/format.ts`), because the system locale is Slovak.
- `frontend/public/changelog.json`: an entry, in plain words, for every
  release the owner will notice; keep its version and the `version` of both
  `package.json` files in step.
- The backend serves the last build: run `npm run build:frontend` (or work at
  http://localhost:4400 with `npm run frontend`). The browser suites build it
  themselves when the sources changed.
- After a change: `npm run test:frontend`, `npm run test:browser` and the
  `academy-ui-check` skill, or the `academy-ui-tester` agent. The latter is
  mandatory before calling the work done.
