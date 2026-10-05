/**
 * Shared setup of the browser suites (run.js, screens.js, setup.js). The PHP
 * tests have their own, in backend/tests/lib.php.
 *
 * isolate() MUST run before startApp(): it picks a throwaway database
 * (academy_test_<…>) and a temp folder for backups. startApp() makes that
 * database — a copy of academy_test_template, which it first brings up to date,
 * migrations still being written (drafts) included — writes a settings folder
 * for it (backend/tests/tools/test-config.php, named to the server by
 * ACADEMY_CONFIG_DIR, which the app honours for a test database only), starts
 * the real server (PHP's built-in web server running backend/router.php, as
 * composer start does) on a free port serving the built app
 * (frontend/dist/…/browser), with the drafts named in ACADEMY_MIGRATION_DRAFTS
 * (honoured for a test database only), and checks that the server says it uses
 * them. Nothing can reach your database or backend/storage/backups/.
 *
 * Sign-in: there is one way, the IAM's. startApp() first starts the stand-in
 * IAM (backend/tests/tools/stand-in-iam.php) on a free port of this computer,
 * with a key pair of this run's own: its authorize signs the person of its
 * state in at once (iamState({ user })) or refuses (iamState({ deny: true })),
 * its token endpoint takes the code with PKCE, its logout comes straight back.
 * The app trusts its keys (auth.jwks_file) and names it as the issuer, so a
 * browser signs in exactly as on a website: a page opened signed out goes to
 * the stand-in and comes back signed in. iamToken() signs a token of that IAM
 * for the API (a suite's own requests), iamSession() a whole session as the
 * IAM's browser SDK keeps it (planted in a browser before its pages load).
 * Everybody holds MEMBER there (an ordinary learner); ADMIN or EDITOR beside
 * it open the admin panel.
 *
 * Whether the IAM requires sign-in here: the stand-in's login_required (true,
 * as the site's own default), relayed by the server's /api/auth/config. A
 * suite that switches it starts the app with applicationTtl (the seconds the
 * server keeps the IAM's answer; 60 otherwise) and calls app.signInRequired():
 * with false, nobody signed in studies as a visitor (docs/kb/sign-in.md).
 *
 * The database server and its password are the developer's own settings
 * (backend/config/database.local.php): this copy has to be set up first.
 */
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const crypto = require('crypto');
const { execFileSync, spawn } = require('child_process');

const FRONTEND = path.join(__dirname, '..');
const ROOT = path.join(FRONTEND, '..');
const BACKEND = path.join(ROOT, 'backend');
/** The production build the suites run against (node frontend/scripts/ensure-build.mjs). */
const BUILD = path.join(FRONTEND, 'dist', 'japanese-academy', 'browser');
const { findPhp } = require(path.join(BACKEND, 'tools', 'php.js'));
const TESTDB = path.join(BACKEND, 'tests', 'tools', 'testdb.php');
const IAMTOOL = path.join(BACKEND, 'tests', 'tools', 'iam.php');
const STANDIN = path.join(BACKEND, 'tests', 'tools', 'stand-in-iam.php');

/** The stand-in IAM of this run: its address once startApp() (or standInIam()) has started it. */
const IAM = { issuer: null, clientId: 'japanese-academy' };

let TEST = null; // { db, backups, dir }
let made = false; // the database, made by the first startApp()
let open = 0; // servers running; the last one out drops the database
let iam = null; // the stand-in IAM: { base, dir, close }
const closers = []; // every server's close(), for closeAll()

const slashes = (p) => p.replace(/\\/g, '/');

function isolate(name = 'academy-test') {
  if (TEST) throw new Error('isolate() came twice');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
  TEST = { db: `academy_test_${process.pid}_${crypto.randomBytes(3).toString('hex')}`, backups: slashes(dir), dir };
  return dir;
}

/** PHP from the repository's root, never with a test's settings folder left in the environment. */
function php(args, opts = {}) {
  const env = { ...process.env };
  delete env.ACADEMY_CONFIG_DIR;
  delete env.ACADEMY_JWKS_FILE;
  return execFileSync(findPhp(), args, { cwd: ROOT, encoding: 'utf8', env, maxBuffer: 64e6, ...opts });
}

/** SQL in the test's own database; returns the rows. */
const sql = (query, ...params) => JSON.parse(php([TESTDB, 'sql', TEST.db, query, JSON.stringify(params)]));

/** The migrations still being written (no "-- end of NNN" yet), comma-separated: what the tests' servers may apply. */
const drafts = () => php([TESTDB, 'drafts']).trim();

const freePort = () =>
  new Promise((resolve) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });

/** The test IAM's keys (jwks.json, key.json), made on first use, next to the backup folder. */
function iamKeys() {
  const dir = `${TEST.dir}-iam`;
  if (!fs.existsSync(path.join(dir, 'jwks.json'))) {
    fs.mkdirSync(dir, { recursive: true });
    php([IAMTOOL, 'keys', dir]);
  }
  return dir;
}

/**
 * A stand-in IAM on a free port, signing with the keys in `dir` (iam.php keys
 * DIR wrote them) and keeping its state there. setup.js starts its own; the
 * other suites get theirs from startApp().
 */
async function startStandIn(dir) {
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const env = { ...process.env, STAND_IN_ISSUER: base, STAND_IN_DIR: slashes(dir) };
  delete env.ACADEMY_CONFIG_DIR;
  const proc = spawn(findPhp(), ['-d', 'opcache.enable=0', '-S', `127.0.0.1:${port}`, STANDIN], { cwd: BACKEND, env, stdio: 'ignore' });
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    proc.kill();
    await new Promise((r) => (proc.exitCode !== null ? r() : proc.once('exit', r)));
  };
  process.on('exit', () => {
    if (!closed) proc.kill();
  });
  for (let i = 0; !(await fetch(`${base}/.well-known/openid-configuration`).then((r) => r.ok, () => false)); i++) {
    if (i > 100) {
      await close();
      throw new Error('the stand-in IAM did not start');
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  /**
   * Merges `changes` into its state ({ user, deny, down, refuse, ttl, login_required, application_missing });
   * returns the state (its `log` too).
   */
  const state = async (changes = {}) =>
    (await fetch(`${base}/_test/state`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes) })).json();
  return { base, dir, close, state };
}

/** This run's stand-in IAM, started once; IAM.issuer is its address. */
async function standInIam() {
  if (!TEST) throw new Error('standInIam() without isolate()');
  if (!iam) {
    iam = await startStandIn(iamKeys());
    IAM.issuer = iam.base;
    closers.push(async () => {
      if (iam) {
        await iam.close();
        iam = null;
      }
    });
  }
  return iam;
}

/**
 * Whom the stand-in IAM signs in next ({ id, username, roles }), and how it
 * behaves (deny: true refuses every sign-in; login_required: false lets
 * visitors study - app.signInRequired() waits for the server to say it);
 * returns its state with `log`, the requests it was asked
 * ("GET /api/oidc/authorize", …).
 */
async function iamState(changes = {}) {
  return (await standInIam()).state(changes);
}

/**
 * A token of this run's stand-in IAM for user `sub`: an access token for this
 * app, or with typ 'JWT' an ID token. roles (MEMBER alone: a learner) and name
 * go into it; claims replace any.
 */
function iamToken(sub, { roles = ['MEMBER'], name = `user${sub}`, typ = 'at+jwt', ...claims } = {}) {
  if (!IAM.issuer) throw new Error('iamToken() before the stand-in IAM started (startApp() starts it)');
  const now = Math.floor(Date.now() / 1000);
  const body = {
    iss: IAM.issuer,
    sub: String(sub),
    aud: IAM.clientId,
    client_id: IAM.clientId,
    iat: now,
    exp: now + 3600,
    roles,
    preferred_username: name,
    email: `${name}@example.test`,
    email_verified: true,
    locale: 'en',
    ...claims,
  };
  return php([IAMTOOL, 'token', iamKeys(), JSON.stringify(body), typ]).trim();
}

/**
 * A signed-in session of user `sub`, as the IAM's browser SDK keeps it:
 * { key, value } for localStorage. Put it in a browser context before its
 * pages load (plant()), and the pages are signed in, without a trip to the IAM.
 */
function iamSession(sub, opts = {}) {
  const name = opts.name || `user${sub}`;
  const roles = opts.roles || ['MEMBER'];
  return {
    key: `anotoki-auth:${IAM.clientId}`,
    value: JSON.stringify({
      access_token: iamToken(sub, opts),
      access_expires_at: Date.now() + 3600e3,
      refresh_token: 'iam_rt_planted',
      id_token: iamToken(sub, { ...opts, typ: 'JWT' }),
      user: { sub: String(sub), preferred_username: name, email: `${name}@example.test`, email_verified: true, locale: 'en', roles },
      updated_at: Date.now(),
    }),
  };
}

/**
 * Plants a session of `person` ({ sub, name, roles }) in a browser context
 * before its first page loads, once per tab (a sign-out stays a sign-out),
 * and the reader's language when `lang` says one (the token says 'en').
 */
function plant(context, person, lang = null) {
  const session = iamSession(person.sub, person);
  return context.addInitScript(
    ([key, value, lang]) => {
      try {
        if (!sessionStorage.getItem('academy-planted')) {
          localStorage.setItem(key, value);
          if (lang) localStorage.setItem('academy-language', lang);
          sessionStorage.setItem('academy-planted', '1');
        }
      } catch (e) {
        // about:blank has no storage
      }
    },
    [session.key, session.value, lang]
  );
}

/**
 * The real server, on a free port, against the test's database and backup
 * folder, serving the built app, signing people in through this run's
 * stand-in IAM. applicationTtl: the seconds the server keeps the IAM's answer
 * whether sign-in is required (60 otherwise) - for a suite that switches it.
 */
async function startApp({ frontend = BUILD, applicationTtl = null } = {}) {
  if (!TEST) throw new Error('startApp() without isolate() would use your real database');
  if (!fs.existsSync(path.join(frontend, 'index.html'))) {
    throw new Error(`The app is not built (${frontend}): node frontend/scripts/ensure-build.mjs`);
  }
  const standIn = await standInIam();
  if (!made) {
    php([TESTDB, 'template'], { stdio: ['ignore', 'ignore', 'inherit'] });
    php([TESTDB, 'create', TEST.db]);
    made = true;
  }

  const port = await freePort();
  // Its settings: the three files the app requires, for this database only.
  const config = path.join(os.tmpdir(), `academy-test-config-${process.pid}-${port}`);
  php([TESTDB, 'config', slashes(config), TEST.db, slashes(path.join(iamKeys(), 'jwks.json')), TEST.backups, slashes(frontend), standIn.base, ...(applicationTtl ? [String(applicationTtl)] : [])]);
  const env = { ...process.env, ACADEMY_CONFIG_DIR: slashes(config), ACADEMY_MIGRATION_DRAFTS: drafts() };
  delete env.ACADEMY_JWKS_FILE;

  const log = path.join(os.tmpdir(), `${path.basename(TEST.dir)}-server-${port}.log`);
  const out = fs.openSync(log, 'a');
  // This computer only, like the real server (and no firewall prompt on a new
  // PC); no opcode cache, which on Windows every PHP process of the same build
  // shares (see start_app() in backend/tests/lib.php).
  const server = spawn(
    findPhp(),
    ['-d', 'display_errors=stderr', '-d', 'opcache.enable=0', '-S', `127.0.0.1:${port}`, '-t', BACKEND, path.join(BACKEND, 'router.php')],
    { cwd: ROOT, env, stdio: ['ignore', out, out] }
  );
  const base = `http://127.0.0.1:${port}`;
  open += 1;

  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    server.kill();
    await new Promise((r) => (server.exitCode !== null ? r() : server.once('exit', r)));
    fs.closeSync(out);
    open -= 1;
    if (!open && iam) {
      await iam.close();
      iam = null;
    }
    if (process.env.ACADEMY_KEEP_TEMP) return;
    const leftovers = [log, config];
    if (!open) {
      php([TESTDB, 'drop', TEST.db]);
      made = false;
      leftovers.push(TEST.dir, `${TEST.dir}-iam`);
    }
    for (const p of leftovers) {
      try {
        fs.rmSync(p, { recursive: true, force: true });
      } catch {
        // a file still held open by Windows: harmless leftovers in %TEMP%
      }
    }
  };
  process.on('exit', () => {
    if (!closed) server.kill();
  });
  closers.unshift(close); // the servers before the stand-in IAM

  for (let i = 0; ; i++) {
    try {
      const health = await (await fetch(`${base}/api/health`)).json();
      if (health.database !== TEST.db || health.backups !== TEST.backups) {
        await close();
        throw new Error(`the server uses ${health.database} / ${health.backups}, not this test's database and folder`);
      }
      break;
    } catch (e) {
      if (/not this test/.test(e.message)) throw e;
      if (i > 100) throw new Error(`the server did not start: ${fs.readFileSync(log, 'utf8')}`);
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  /**
   * The API as `who` ({ sub, name, roles }, or a user id): a fetch with their
   * token (and X-Time-Zone when `zone` says one). Returns the Response.
   */
  const api = (url, who, { method = 'GET', body, zone, headers = {} } = {}) => {
    const person = typeof who === 'object' ? who : { sub: who };
    const token = iamToken(person.sub, person);
    return fetch(base + url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(zone ? { 'X-Time-Zone': zone } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
  };

  /**
   * The stand-in IAM told whether sign-in is required here, and waited for
   * until the server relays it (/api/auth/config, kept applicationTtl
   * seconds): a page loaded after this reads it.
   */
  const signInRequired = async (required) => {
    await standIn.state({ login_required: required });
    const until = Date.now() + ((applicationTtl || 60) + 5) * 1000;
    for (;;) {
      const relayed = await (await fetch(`${base}/api/auth/config`)).json().catch(() => ({}));
      if (relayed.loginRequired === required) return;
      if (Date.now() > until) throw new Error(`the server still says loginRequired ${relayed.loginRequired}`);
      await new Promise((r) => setTimeout(r, 250));
    }
  };

  return {
    base,
    sql,
    api,
    signInRequired,
    /** The folder the server keeps its backups in (the copies before an import or a delete land there). */
    backups: TEST.dir,
    /** Makes items due for review now, for user `userId`. */
    makeDue: (ids, agoMs, userId) =>
      sql(
        'UPDATE srs_progress SET next_review = academy_time(?) WHERE user_id = ? AND item_id IN (SELECT json_array_elements_text(?::json))',
        Date.now() - agoMs,
        userId,
        JSON.stringify(ids)
      ),
    close,
  };
}

/**
 * Stops every server still running (the stand-in IAM last), and with the last
 * one drops the database: for a suite that failed half-way (a finished one
 * closes its own).
 */
async function closeAll() {
  for (const close of closers.splice(0)) {
    await close().catch((e) => console.error(`closing a server: ${e.message}`));
  }
}

/** The catalog as the server builds it, straight from backend/data/ (no server needed). */
const catalog = () => JSON.parse(php([path.join(BACKEND, 'tests', 'tools', 'catalog.php')]));

module.exports = {
  ROOT,
  BACKEND,
  FRONTEND,
  BUILD,
  IAM,
  isolate,
  startApp,
  closeAll,
  catalog,
  standInIam,
  startStandIn,
  iamState,
  iamToken,
  iamSession,
  plant,
  drafts,
  freePort,
  php,
  findPhp,
};
