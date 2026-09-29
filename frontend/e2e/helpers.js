/**
 * Shared setup of the browser suites (run.js, screens.js, setup.js). The PHP
 * tests have their own, in backend/tests/lib.php.
 *
 * isolate() MUST run before startApp(): it picks a throwaway database
 * (academy_test_<…>) and a temp folder for backups. startApp() makes that
 * database — a copy of academy_test_template, which it first brings up to date
 * — writes a settings folder for it (backend/tests/tools/test-config.php, named
 * to the server by ACADEMY_CONFIG_DIR, which the app honours for a test
 * database only), starts the real server (PHP's built-in web server running
 * backend/server.php, as npm start does) on a free port serving the built app
 * (frontend/dist/…/browser), and checks that the server says it uses them.
 * Nothing can reach your database or backups/, and no test reads progress/,
 * results/ or reports/.
 *
 * Sign-in: startApp() runs the server without it (auth mode none: every
 * request is the owner); startApp({ auth: 'iam' }) with it, against the test
 * IAM — a key pair of this run's own, whose tokens iamToken() signs and
 * iamSession() puts in a browser as the IAM's SDK would. Its issuer,
 * https://iam.test, exists nowhere: a browser test answers its requests itself
 * (page.route), and no IAM is ever asked. Both kinds of server can run at once,
 * on the same database.
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
/** The production build the suites run against (npm run build:frontend). */
const BUILD = path.join(FRONTEND, 'dist', 'japanese-academy', 'browser');
const { findPhp } = require(path.join(BACKEND, 'tools', 'php.js'));
const TESTDB = path.join(BACKEND, 'tests', 'tools', 'testdb.php');
const IAMTOOL = path.join(BACKEND, 'tests', 'tools', 'iam.php');

/** The test IAM: what a server in auth mode iam is told, and what its tokens say. */
const IAM = { issuer: 'https://iam.test', clientId: 'japanese-academy' };

let TEST = null; // { db, backups, dir }
let made = false; // the database, made by the first startApp()
let open = 0; // servers running; the last one out drops the database
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

const freePort = () =>
  new Promise((resolve) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });

/** The test IAM's keys, made on first use, next to the backup folder. */
function iamKeys() {
  const dir = `${TEST.dir}-iam`;
  if (!fs.existsSync(path.join(dir, 'jwks.json'))) {
    fs.mkdirSync(dir, { recursive: true });
    php([IAMTOOL, 'keys', dir]);
  }
  return dir;
}

/**
 * A token of the test IAM for user `sub`: an access token for this app, or
 * with typ 'JWT' an ID token. roles and name go into it; claims replace any.
 */
function iamToken(sub, { roles = ['MEMBER'], name = `user${sub}`, typ = 'at+jwt', ...claims } = {}) {
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
 * pages load (context.addInitScript), and the pages are signed in.
 */
function iamSession(sub, opts = {}) {
  const name = opts.name || `user${sub}`;
  const roles = opts.roles || ['MEMBER'];
  return {
    key: `anotoki-auth:${IAM.clientId}`,
    value: JSON.stringify({
      access_token: iamToken(sub, opts),
      access_expires_at: Date.now() + 3600e3,
      refresh_token: 'iam_rt_test',
      id_token: iamToken(sub, { ...opts, typ: 'JWT' }),
      user: { sub: String(sub), preferred_username: name, email: `${name}@example.test`, email_verified: true, locale: 'en', roles },
      updated_at: Date.now(),
    }),
  };
}

/**
 * The real server, on a free port, against the test's database and backup
 * folder, serving the built app; with auth 'iam', signing people in through
 * the test IAM.
 */
async function startApp({ auth = 'none', frontend = BUILD } = {}) {
  if (!TEST) throw new Error('startApp() without isolate() would use your real database');
  if (!fs.existsSync(path.join(frontend, 'index.html'))) {
    throw new Error(`The app is not built (${frontend}): npm run build:frontend`);
  }
  if (!made) {
    php([TESTDB, 'template'], { stdio: ['ignore', 'ignore', 'inherit'] });
    php([TESTDB, 'create', TEST.db]);
    made = true;
  }

  const port = await freePort();
  // Its settings: the three files the app requires, for this database only.
  const config = path.join(os.tmpdir(), `academy-test-config-${process.pid}-${port}`);
  php([TESTDB, 'config', slashes(config), TEST.db, auth, ...(auth === 'iam' ? [slashes(path.join(iamKeys(), 'jwks.json'))] : []), TEST.backups, slashes(frontend)]);
  const env = { ...process.env, ACADEMY_CONFIG_DIR: slashes(config) };
  delete env.ACADEMY_JWKS_FILE;

  const log = path.join(os.tmpdir(), `${path.basename(TEST.dir)}-server-${port}.log`);
  const out = fs.openSync(log, 'a');
  // This computer only, like the real server (and no firewall prompt on a new
  // PC); no opcode cache, which on Windows every PHP process of the same build
  // shares (see start_app() in backend/tests/lib.php).
  const server = spawn(
    findPhp(),
    ['-d', 'display_errors=stderr', '-d', 'opcache.enable=0', '-S', `127.0.0.1:${port}`, '-t', BACKEND, path.join(BACKEND, 'server.php')],
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
  closers.push(close);

  let health;
  for (let i = 0; ; i++) {
    try {
      health = await (await fetch(`${base}/api/health`)).json();
      if (health.database !== TEST.db || health.backups !== TEST.backups || health.auth !== auth) {
        await close();
        throw new Error(`the server uses ${health.database} / ${health.backups} / auth ${health.auth}, not this test's database, folder and sign-in`);
      }
      break;
    } catch (e) {
      if (/not this test/.test(e.message)) throw e;
      if (i > 100) throw new Error(`the server did not start: ${fs.readFileSync(log, 'utf8')}`);
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  return {
    base,
    sql,
    /** Whom the server acts as without sign-in (auth.local_user_id). */
    owner: health.owner,
    /** Makes items due for review now, for the owner or another user. */
    makeDue: (ids, agoMs = 60000, userId = health.owner) =>
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
 * Stops every server still running, and with the last one drops the database:
 * for a suite that failed half-way (a finished one closes its own).
 */
async function closeAll() {
  for (const close of closers.splice(0)) {
    await close().catch((e) => console.error(`closing a server: ${e.message}`));
  }
}

/** The catalog as the server builds it, straight from data/ (no server needed). */
const catalog = () => JSON.parse(php([path.join(BACKEND, 'tests', 'tools', 'catalog.php')]));

module.exports = { ROOT, BACKEND, FRONTEND, BUILD, IAM, isolate, startApp, closeAll, catalog, iamToken, iamSession, freePort, php, findPhp };
