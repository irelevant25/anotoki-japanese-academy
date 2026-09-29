# Sign-in and each person's data

Since 2026-09-27 Japanese Academy can run as a hosted site for several people,
each with their own progress. Sign-in is not the app's own: every anotoki site
signs people in through one identity provider, the **anotoki IAM**
(iam.anotoki.eu; its repository is `anotoki-iam`, next to this one, and its
`docs/integrating-an-app.md` is the contract this page follows). On the
owner's own computer the app still runs without any sign-in.

## Two modes

`auth.mode` in `backend/config/auth.local.php`, which the setup page writes.
It is deployment configuration; a request can never choose it. There is no
default: without the file every address with data answers 503 `not_set_up`.

| Mode | Where | What |
|---|---|---|
| `iam` | a hosted site (the only mode its setup page offers), or a developer's copy against the development IAM | every request with somebody's data needs an access token from the IAM; each person sees and changes only their own rows |
| `none` | the owner's computer (the setup page offers it there) | no sign-in: every request is the owner, IAM user `auth.local_user_id` (1 unless set), with every role. The page looks exactly as it did before sign-in existed |

Mode `none` works only under PHP's built-in server, only from this computer,
and only for a request that came straight to it (`auth_none_allowed()`): its
`Host` is `127.0.0.1`, `localhost` or `[::1]` (any port), and it carries no
`Forwarded`, `X-Forwarded-For` or `X-Real-IP`. A tunnel or a proxy on this
computer would make every visitor come from 127.0.0.1, and a web page
elsewhere can reach 127.0.0.1 through a name of its own that points there
(DNS rebinding); the `Host` gives both away. Anywhere else, every address
with somebody's data, and `/api/auth/config`, answers 403 "Sign-in is off
here"; the app's files, the clips and `/api/health` still answer (health
without naming the database, the folders or the owner).
`php backend/server.php` also refuses to listen anywhere but 127.0.0.1 in mode
`none`. (The Angular dev server's proxy, `ng serve` on localhost:4400, passes
the request on with its own `Host`, `localhost:4400`, and no forwarding
headers, so a developer's copy in mode `none` works through it.)

The application is registered in the IAM as client `japanese-academy`: a
public client, access `members` (only accounts given a role here can sign
in), roles `ADMIN` and `MEMBER`. The owner holds `ADMIN`; the two roles grant
the same things in this app today.

| | Production | Development |
|---|---|---|
| issuer | `https://iam.anotoki.eu` | `http://localhost:4300` |
| redirect URI | `https://japanese.anotoki.eu/auth/callback` | `http://localhost:4400/auth/callback` (the Angular dev server) |
| after sign-out | `https://japanese.anotoki.eu/` | `http://localhost:4400/` |

The IAM registers the development addresses by default. To run a copy against
the development IAM, choose it in the setup page (`DEVELOPING.md`).

## The server — `backend/src/auth.php`

`auth_user()` answers "who is asking" once per request; the person middleware
(`backend/api/middleware/person.php`) asks it for every address with somebody's
data and puts the user id on the request:

1. mode `none`: the owner (`auth.local_user_id`), if the request may be
   served without sign-in at all;
2. mode `iam`: the `Authorization: Bearer …` header (`CGIPassAuth` and a
   `SetEnvIf` in `public/.htaccess` get it to PHP under CGI and FastCGI). The
   token is verified **without asking the IAM** by `backend/src/anotoki_iam.php`,
   the IAM's PHP SDK **v1.0.1**, copied unchanged (1.0.1 is the first with
   nothing PHP 8.5 deprecates, which this app's error handler would turn into
   an error on every page): RS256 signature against the IAM's published keys
   (cached for an hour in `backend/storage/cache/`, not the shared temp
   folder), `typ at+jwt`, issuer, audience `japanese-academy`, expiry. Its
   `sub` is the user id. No token: 401 `Sign in first.`; a token that does not
   verify: 401 `Sign in again.` (the reason goes to the error log only, on one
   line and clipped to 300 characters: it can quote the token's own header,
   which whoever sent it chose); a token without a role here: 403.
3. Then `users_seen()` keeps the person's `users` row up to date (below).

Every address with somebody's data needs it: all of `/api/*` and `/report/*`,
except `/api/auth/config` (how to sign in: `{mode, issuer, clientId}`) and
`/api/health`. The audio clips are shared content and need no sign-in.
Unknown addresses stay 404.

## Each person's data

Migration `002_users.sql` gave every study table a `user_id`, first in each
primary key, pointing at `users` with `ON UPDATE CASCADE`:

| Table | Key |
|---|---|
| `users` | `id`: the IAM user id. Also `preferred_username` (from the latest token), `created_at`, `last_seen_at` |
| `srs_settings` | `user_id` (one row per person; made at their first change) |
| `srs_progress` | `(user_id, item_id)` |
| `srs_daily` | `(user_id, day)` |
| `srs_log` | `id`, and `user_id` (indexed with `id`) |
| `exam_attempts` | `(user_id, id)`: two people may have attempts with the same id |
| `imports` | `(user_id, source)` |

Every function that reads or writes them takes the user id first
(`store_…`, `kanji_…`, `exam_history()`, `exam_report()`, …) and every query
has `WHERE user_id = ?`. A report of somebody else's attempt answers 404, as
if it did not exist. The study content (`srs_items`, `exam_questions`,
`content_state`) is the same for everybody.

**The owner's data.** Until 2026-09-27 the database held the owner's data
only. Migration 002 gave all of it to user 1 (the owner's IAM user id) and
checks at its end that every row came through unchanged (counts and a
fingerprint of every table); otherwise it fails and changes nothing. The
owner approved this one-time rewrite of the study tables on 2026-09-27; apart
from it the rows are never rewritten. If the owner's user id at the hosted
IAM is not 1, a new user id in the setup page on the owner's computer (or
`php backend/manage.php --owner-id=N`) moves everything of the current owner
id to user N in one update (`owner_change()` in `backend/src/owner.php`,
backed up first) — refused when user N already has data here — and saves
`auth.local_user_id = N`. When user N holds the study data already and the
current id holds none (a backup restored under N), there is nothing to move,
and it only saves the setting.

**The users table** is filled in as requests arrive: the first request of a
verified person makes their row, and a request writes it again at most every
five minutes (or when the name in the token changed). The IAM owns identity:
no passwords, no emails, nothing decided from anything but a verified token.

## The browser — `frontend/src/app/core/auth/`

The IAM's browser SDK **v1.1.1** is copied unchanged into `sdk/`
(`anotoki-auth.mjs` and its types, `anotoki-auth.d.ts`, from the IAM's
`sdk/js/`), and bundled with the app.

- `AuthService.init()` runs before anything else (`provideAppInitializer`):
  it asks `GET /api/auth/config`. In mode `none` it does nothing more, and
  nothing on the page changes. A 503 `not_set_up` shows the "not set up yet"
  page (with a link to `/setup.php`, and, to this computer, why); a server
  that does not answer, a page that says so. `/api/auth/config` needs only the
  settings, so a copy whose database is missing or has no tables starts all
  the same; the first address with data then answers `not_set_up`, and any
  such answer from this site puts up the same page
  (`core/api/not-set-up.interceptor.ts`, and `AuthService.fetch()` for its own
  calls). Only a page load leaves it.
- In mode `iam` it creates the SDK with this site's `/auth/callback` as the
  redirect URI and `/` after sign-out, and runs its `init()`, which finishes a
  sign-in coming back from the IAM (the code exchanged, the address the person
  started from put back) or restores the session from `localStorage`
  (refreshing the access token when it ran out; refresh tokens rotate, and the
  SDK serialises refreshes across tabs). Only then does the router's first
  navigation run, so no screen asks for data before the sign-in is settled.
  Signed out, a page with a **Sign in** button stands in for the app (a click
  goes to the IAM, which shows who is allowed), and the top bar holds only the
  name — its Kanji and Exam show only while the app can be used, since
  following one would load its data, and the same guard on those routes
  (`whenReady`, `app.routes.ts`) keeps Back or Forward from loading it; signed
  in, the top bar shows an avatar and the name, with a menu: *Signed in as …*,
  *Your account* (the IAM's account page), *Sign out* (the IAM ends its
  session and sends the browser back to `/`).
- A sign-in that comes back without one says why on the Sign in page
  (`describeSignInFailure()`). For `access_denied` that is the IAM's own
  sentence alone, as the IAM means it to be shown — "The sign-in was
  cancelled." when the person went back from its page, or the refusal itself
  ("This account cannot use Japanese Academy.", "Confirm your email address
  first."); the app decides nothing from those words. Anything else reads
  "Signing in did not work: …".
- **A page is one person's.** The SDK shares its session with every tab, and
  what a page loaded stays in root services (the kanji state, a paper of the
  exam). So once the app has shown somebody's data, a sign-in of somebody else
  in another tab — also after a sign-out there — makes the page load again, as
  them (`AuthService.follow()` compares the IAM user id the app became ready
  with), as the pages before Angular did. Until it has, `AuthService.token()`
  and `refreshToken()` hand out no token of the other person, and both the
  interceptor and `AuthService.fetch()` take their tokens from them, so
  nothing the page sends goes out as theirs (it goes without a token, and is
  refused). The same person again, or a token refreshed, changes nothing; a
  page that loaded signed out has shown nobody's data, and simply starts.
- **The interceptor** (`auth.interceptor.ts`) adds the access token to every
  HttpClient request to this site's `/api/…` and `/report/…` — to its own
  origin only, whatever address it is given — and to nothing else, and in mode
  `none` adds nothing. A 401 to a token the SDK thought good gets one fresh
  token and one retry, for the same person only: a fresh token of somebody who
  signed in in another tab meanwhile is not sent with a request this page made
  (the page loads again as them, above). When the IAM gives none, the session
  is over and the Sign in page takes over. `AuthService.fetch()` does the same
  for the few plain `fetch()` calls: this site only, the page's own person's
  token, one retry for the same person (it does not use the SDK's own
  `fetch()`, which sends whoever's token it holds wherever it is asked to).
- **Links the browser would follow by itself** cannot carry a token.
  `PrivateLinksService` handles a report (`/report/:id`) and the progress
  download (`/api/kanji/export`): in mode `iam` a click fetches them with the
  token and opens the report from memory (a `blob:` address, in a tab opened
  during the click so no pop-up blocker stops it), or saves the file under the
  server's name. A report opened like that gets a Content-Security-Policy that
  allows no script (and the server sends the same header), because a report is
  stored HTML that a backup may have brought in, and the page shares its
  origin with the tokens. The policy is a `<meta>` put before anything of the
  report's (`lockDown()`: right after a leading doctype, or at the very
  start): a policy counts from where it stands, so one after the report's own
  `<head>` would come after a script put before it. Only HTML's own spaces may
  come before that doctype: a character HTML reads as text would put the
  `<meta>` in the body, where it counts for nothing. Without sign-in the links
  work as they always did.

The avatar menu uses the colour tokens (`--shadow` among them) and works at
390 px: the name hides, the avatar stays.

## Testing with tokens

No test asks an IAM. The tests have one of their own:

- PHP (`backend/tests/lib.php`): `test_iam()` makes a key pair and writes its
  public half as a JWKS file; `start_app(test_iam_env())` starts a server in
  mode `iam` whose test settings name that file (`auth.jwks_file`, issuer
  `https://iam.test`, which exists nowhere); `test_token($id, $roles, $claims,
  $typ)` signs whatever a test needs with the SDK's test helpers — good
  tokens, expired ones, ones for another app, ID tokens. A keys file counts
  for a throwaway database only (`auth_jwks_file()`, `backend/src/auth.php`):
  for any other, a line in `auth.local.php` naming one is ignored, so a
  copy's sign-in can never rest on a file instead of the IAM.
- Node (`frontend/e2e/helpers.js`): `startApp({ auth: 'iam' })`, `iamToken()`
  (made by `backend/tests/tools/iam.php`) and `iamSession()`, a signed-in
  session as the SDK keeps it, for a browser context.
  `frontend/e2e/browser.js` `emulateIam()` answers the IAM's addresses inside
  the browser (discovery, sign-in, token, sign-out, userinfo), so the browser
  suite runs the whole sign-in and sign-out without a network, and records
  what the IAM was asked (with ` +bearer` after a request that carried a
  token: none should). The suite also checks every request of the signed-in
  browser: the token went with each call to the API, and with nothing else.
  After the sign-out it signs people in from a second tab (their sessions
  written into `localStorage`, as the SDK there would): the first starts the
  app, the next makes the page load again, as them.
- The Angular unit tests check the interceptor with a fake sign-in
  (`auth.interceptor.spec.ts`: a retry only as the same person), and
  `AuthService`'s states with a fake server and the real SDK, other tabs
  played by `storage` events (somebody else signing in, a sign-out and back,
  a refresh; its own `fetch()` then sending no token of theirs). The Sign in
  page's words for a cancelled, a refused and a failed sign-in are checked
  through the SDK's own callback (`standin/sign-in/sign-in.component.spec.ts`).
- The setup page's IAM **Test connection** is tried against a stand-in IAM
  (`backend/tests/tools/stand-in-iam.php`: a discovery document and keys).
- Everything else runs in mode `none`, as on the owner's computer.

See [testing.md](testing.md) for what each suite pins down, and
[hosting.md](hosting.md) for running it as a website.
