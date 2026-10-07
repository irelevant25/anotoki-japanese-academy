# Japanese Academy - the frontend

The app in the browser: Angular 21, standalone components, zoneless, signals.
Built into `dist/japanese-academy/browser/`, which the backend serves
(`../backend/router.php` on a computer, Apache's `public/` on the website).
How it works is in [`../docs/kb/architecture.md`](../docs/kb/architecture.md);
setting it up and running it in [`../DEV.md`](../DEV.md).

## Layout

```
src/app/            app.component (the bar, the page - the template of the anotoki library's
                    <anotoki-site-gate>, made only while the site is open; the gate shows its own page
                    instead while the site is not ready -, the foot), app.routes.ts, app.config.ts
  top-bar/          the anotoki family's top bar: brand, Kanji and Exam, language, theme, the person's menu;
                    on a phone (up to 760 px) one menu button; no key pressed in it reaches the page
  ui/               the family's pieces of the bar: brand/, theme-toggle/, icon/
  home/             the home page; visitor-notice/ (studying without signing in: the notice, the notes
                    after a move)
  kanji/            the kanji SRS: dashboard, lessons, reviews, practice, browse, the item page;
                    answer.ts (answer checking)
  exam/             the exam
  home/your-data/   Your data: the learner's data as a file, down and back (GET / PUT /api/me/data)
  core/             api/ (ApiService), auth/ (the sign-in: AuthService, signInGuard and adminSignInGuard,
                    the interceptor with the token - or a visitor's key - and X-Time-Zone, decided as a
                    request is issued (issued-as.ts), visitor-key.ts (the visitor key, the move at
                    sign-in), SignOutService, SignInService; sdk/ the IAM's browser SDK, never
                    edited), storage.ts (localStorage and sessionStorage that never throw), changelog/ (the foot: the version and What's new), i18n/ (the app's words:
                    the translation service, its pipes, the language chooser, failures worded from their
                    codes), theme/ (light, dark or the system's; signed in, the anotoki account's),
                    saves-in-flight.service.ts (the saves a sign-out waits for), time-zone.ts, boot.ts,
                    format.ts (dates and clocks in the language's way, or the account's order and clock),
                    site-status.config.ts and site-status.ts (the anotoki library's migrations module,
                    @anotoki/lib/migrations, wired to this app: where the site stands, its gate and
                    pages, the Migrations page), testing/ (the module as a spec needs it)
  admin/            the admin panel at /admin, English: Translations (EDITOR, ADMIN), Languages,
                    People and Migrations (ADMIN: the library's page); the top bar's links lead between them
  standin/          the Sign in card and the problem page; sign-in-failed/ (a refused sign-in said
                    above a visitor's page)
src/styles/         _tokens.scss (every colour, light and dark; dark also by <html data-theme>), _base.scss,
                    _items.scss
public/             favicon.svg, anotoki.png (the family's mark), theme-boot.js (the light/dark shown last,
                    before the first paint), changelog.json (the releases; the version at the foot)
e2e/                the browser suites: run.js, setup.js, screens.js (Edge, playwright-core)
scripts/            ensure-build.mjs (builds only when the sources changed), catalog-fixture.mjs
                    (the catalog the answer-checking tests use, built by PHP from ../backend/data/)
proxy.conf.json     ng serve sends /api, /audio, /report and /setup.php to the backend on :8200
.nvmrc              the Node.js version (22)
```

## Commands

From `frontend/`:

```bash
npm start              # ng serve on http://localhost:4400, with the proxy (the backend: composer start in ../backend)
npm run build          # production build -> dist/japanese-academy/browser/
npm test               # the unit tests (Vitest, jsdom), after the catalog fixture
npm run e2e            # the browser suite, against the last build (build first), signed in through
                       # the tests' stand-in IAM
npm run e2e:setup      # the setup page in the browser
npm run screens        # screenshots -> e2e/shots/
```

From the repository's top folder, `node frontend/scripts/ensure-build.mjs`
builds when the sources changed (and runs `npm ci` first when the packages
are missing or older than the lock); the browser suites need that build.
