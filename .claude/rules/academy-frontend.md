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
- Styles: the anotoki library's first (`@use "@anotoki/lib/styles" as
  anotoki` in `src/styles.scss`: its tokens and Manrope), then the tokens,
  the page's base and what several screens share, global, in
  `frontend/src/styles/` (`_tokens.scss`: Japanese's palette given to
  `anotoki.root()` and the study colours; `_base.scss`, `_items.scss`); a
  component's own styles in its `.scss`. Colours come only from the tokens,
  each defined for light and dark (the dark ones under
  `prefers-color-scheme: dark` unless `<html data-theme="light">`, and under
  `[data-theme="dark"]`: the theme switch's choice).
  Use `--kanji`/`--vocab` for item types and the stage tokens for SRS stages.
  Check contrast in dark mode.
- Buttons, dialogs and questions, form fields, the spinner and menus are the
  library's kit (`anotokiButton` with `variant` / `size` / `[loading]`,
  `<anotoki-dialog>`, `ConfirmService` - its host is in `app.component.html`
  -, `anotoki-text-field`, `anotoki-select`, `anotoki-checkbox`,
  `<anotoki-spinner>`): never a button or field style of the app's own. Each
  piece comes from its own entry point (`@anotoki/lib/ui/button`, `ui/dialog`,
  `ui/forms`, `ui/config` …), never the `@anotoki/lib/ui` barrel (it would put
  every piece in the first load); its class names are its own
  (`anotoki-<piece>__<part>`: a spec or a style reads them so). Its words are
  the anotoki library's keys in this app's database (`anotoki.topbar.*`,
  `anotoki.theme.*` …, which migration 009 filled with the app's words; the
  translation service's `forKit()` in `core/kit.config.ts`); with no strings,
  `KIT_ENGLISH` where the app says a word its own way, else the library's own
  English or informal Slovak. A global rule of the app never reaches inside a kit
  component: `_base.scss` keeps its element and shared-class rules out of
  them (`$app-only`), and a new one does the same.
- The app talks to the backend only through `ApiService` (HttpClient) —
  except the bundle of words, `GET /api/translations/{code}`, which the
  translation service asks with a plain `fetch()` and no token. The
  auth interceptor adds the sign-in's token and `X-Time-Zone` (the browser's
  IANA zone, `core/time-zone.ts`) to this site's `/api` and `/report`
  addresses and to nothing else; a report the browser would open by itself
  goes through `PrivateLinksService` (it fetches with the token and opens from
  memory, with `lockDown()`'s no-script policy first), and Your data's file
  through `AuthService.fetch()`. The pages never count days themselves: what
  "today" is comes in the server's answers.
- Sign-in is the IAM's alone (`docs/kb/sign-in.md`): every page is behind
  `signInGuard` (`canActivateChild` on the learner's routes; `adminSignInGuard`
  on `/admin`, which a visitor never passes), which sends a signed-out visitor to the IAM and back to the
  address; the Sign in card only after a failed sign-in, or a session that
  ended while the page was open. The admin panel (`/admin/…`, English) is
  `staffOnly` (EDITOR, ADMIN), its Languages and People `adminOnly`: the
  frontend hides, the server refuses. A save made in the background (a
  session's answers, a note, a paper handed in) goes through
  `SavesInFlight.track()` (a note waiting for its moment: `hold()`; something
  a sign-out would lose: `watch()`), so Sign out waits for it and asks.
- Visitors (`docs/kb/sign-in.md`, *Visitors in the browser*): where the
  relayed `loginRequired` is `false`, nobody signed in is the state
  `visiting`. Whose a request is (a person's: the token or not sent at all; a
  visitor's: the key, never a token) is decided as it is **issued**
  (`AuthService.caller()`, `ISSUED_AS`), never from whether a token is there
  when it leaves; what only a person may do is issued `AS_PERSON` in
  `ApiService`. The key lives in `VisitorKey` (`core/auth/visitor-key.ts`):
  read as a request leaves, the first key stays, forgotten compare-and-delete,
  kept while sign-in is required. `AuthService` never injects `VisitorKey`.
  A visitor's Sign in goes through `SignInService` (it waits for the saves).
- `core/auth/sdk/anotoki-auth.mjs` + `.d.ts` are the anotoki IAM's browser SDK
  v1.2.0, copied unchanged from `../anotoki-iam/sdk/js/`. Never edit them; to
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
- At 390 px there must be no horizontal scroll; `node frontend/e2e/screens.js` fails on
  overflow.
- The UI is in English and Slovak (informal "ty"), plain and short, from the
  database (`core/i18n/`, `docs/kb/architecture.md`, *The app's words*).
  Dates, times and numbers follow the language on the page through `Intl`
  (`TranslationService.locale()`: `'en-GB'`, `'sk-SK'`; `core/format.ts`, the
  `localDate` pipe), never the system's locale - but a signed-in person's own
  date order and clock, the anotoki account's, win where they chose them. The learning material, the SRS
  stage names (from the server) and the admin panel stay as they are;
  material carries `lang="en"` or `lang="ja"` whatever the page's language.
- A word a learner reads is a key with an English and a Slovak string — a new
  one comes with a migration (`DEV.md`) — asked for with the `translate` /
  `translatePlural` pipes or `t()` / `plural()`; never English written into a
  template (kept terms like "Kanji" and the admin panel aside). A key put
  together at run time comes from a closed set declared in
  `core/i18n/dynamic-keys.ts`, never from an address, the IAM or what
  somebody typed. What is drawn while there may be no strings (the stand-in pages, the
  top bar) uses `keptWord()` (`standin/`), with the seeded
  English in the code. `backend/translations.php --status` and
  `backend/tests/unit/translations.test.php` hold the keys to the database.
- Where the site stands is the anotoki library's (`@anotoki/lib/migrations`,
  wired in `core/site-status.config.ts`; `docs/kb/architecture.md`): `boot()`
  asks `SiteStatus` first, `<anotoki-site-gate>` wraps everything under the
  bar in `app.component.html`, and while the site is not ready (being
  updated, not set up, out of reach) the library's page stands in, in its
  own words - never the app's problem page, and never a redirect to the IAM
  (the page has its own Sign in). Everything under the bar is the gate's
  marked template (`<ng-template anotokiSitePages>`, `SitePagesDirective`
  in `AppComponent`'s imports; anotoki-lib 0.2.0): made only while the site
  is open, so no page runs behind the library's page, and one open when the
  site stops is taken down - a page that must keep something across that
  does it in its `ngOnDestroy()` (the exam's open paper), never by staying
  alive; keep control flow (`@switch`, `@if`) inside the marked template:
  an unmarked one, or content given as it is, would be made whether the
  site is open or not. `/api/site-status` goes bare (no token, no
  visitor key). The Migrations page is the library's
  `<anotoki-migrations-page>` (`@anotoki/lib/migrations/page`); its looks,
  like the kit's, come from the `--anotoki-*` tokens, which `_tokens.scss`
  gives Japanese's palette, light and dark. The library is a
  package (`@anotoki/lib`, from its release's `.tgz`): never edit
  `node_modules/`; `DEV.md`, *The anotoki library*, says how to update it.
- State holds keys, kinds and `ApiError`s, never a worded sentence: wording
  happens in a template or inside a `computed()`, so a page follows a change
  of language without being made again. A failed request is worded from its
  code (`core/i18n/error-text.ts`), never with the server's sentence (the
  admin panel excepted).
- The top bar is the anotoki family's one bar, the library's
  (`<anotoki-top-bar>`, `@anotoki/lib/shell`), worded and wired in
  `top-bar/` (`docs/kb/architecture.md`, *The top bar*): one row — the
  brand, Kanji (the reviews due) and Exam, the language, the theme, the
  person's menu or Sign in. The wrapper gives it words, links, the person,
  the menu's items and the two actions; never restyle or rebuild the
  library's parts. Keep its rules:
  - **No key pressed anywhere in the bar reaches `document`** (the library's
    `isolateKeys`, on by default - never switch it off): Enter there submits
    a card or hands a paper in, Space plays a word. A key listener added on
    `document` must not count on hearing the bar's keys.
  - The menus are the library's (the focus in, the arrows, Home / End,
    Escape and **Tab / Shift+Tab back to the menu button**, never `<body>`; a
    click outside; a crossing of the fold closes). Sign out and Sign in
    return the promise of `SignOutService` / `SignInService`, so the open
    menu waits for the saves (the item's spinner and "Saving…", the focus on
    the menu button).
  - Up to `PHONE_BAR_MAX` = 760 px (`ADMIN_PHONE_BAR_MAX` = 960 in the admin
    panel) the links and the person's menu fold into one menu button, which
    carries the reviews due and names them (`phoneMark`); above it only the
    person's name gives way (`NAME_BAR_MIN` = 961). Measured with the real
    labels in English and Slovak and 999 due: a change to the bar's words or
    pieces is measured again (the `academy-ui-check` skill).
  - Its words are keys with their English in a `const ENGLISH` map
    (`keptWord()`; `backend/tests/unit/translations.test.php` holds it to the
    seeded English) - the bar's own in `top-bar.component.ts`; the kit's
    (Sign out, the theme, the language …) are the library's keys
    (`core/kit.config.ts`, above); in the admin panel they read in English
    through the translation service (`effectiveLanguage`), never through a
    case in the bar. The language button's
    name holds the code it shows (`{code}`).
- Switching the language changes words only: a session or a paper goes on
  where it was. The five kanji tabs fit 390 px in Slovak (360 px in
  English).
- `frontend/public/changelog.json`: an entry, in plain words, for every
  release the owner will notice; its version has three numbers,
  MAJOR.MINOR.PATCH (big changes, new features, bug fixes), and the newest is
  the `version` of `frontend/package.json` (there is no package at the top
  any more; `changelog.service.spec.ts` holds both). A browser's "read"
  version compares number by number (`compareVersions()`: `0.4` is `0.4.0`).
- The backend serves the last build: run `node frontend/scripts/ensure-build.mjs` (or work at
  http://localhost:4400 with `npm start` in `frontend/`). Run it before the
  browser suites: it builds only when the sources changed.
- After a change: `npm test` in `frontend/`, `node frontend/e2e/run.js` and the
  `academy-ui-check` skill, or the `academy-ui-tester` agent. The latter is
  mandatory before calling the work done.
