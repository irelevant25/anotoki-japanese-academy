/**
 * The production build of the app, made only when its sources changed since
 * the last one: what the browser suites and anotoki-deploy's build (backend/composer.json's frontendBuild) run
 * before they need the build.
 *
 *   node frontend/scripts/ensure-build.mjs            build when needed (npm ci first, when
 *                                                     node_modules/ is missing or older than the lock)
 *   node frontend/scripts/ensure-build.mjs --check    exit code 1 when a build is needed, building nothing
 *
 * The build lands in frontend/dist/japanese-academy/browser/, with a stamp of
 * the sources it was made from beside it (.build-stamp).
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = join(FRONTEND, 'dist', 'japanese-academy');
const STAMP = join(BUILD, '.build-stamp');
const SOURCES = ['src', 'public', 'angular.json', 'package.json', 'package-lock.json', 'tsconfig.json', 'tsconfig.app.json'];

/** Every file the build is made from: its path, size and time. */
function stamp() {
  const lines = [];
  const walk = (path) => {
    if (!existsSync(path)) {
      return;
    }
    const st = statSync(path);
    if (st.isDirectory()) {
      for (const name of readdirSync(path).sort()) {
        if (name !== 'testing' && !name.endsWith('.spec.ts')) {
          walk(join(path, name));
        }
      }
      return;
    }
    lines.push(`${relative(FRONTEND, path).replace(/\\/g, '/')} ${st.size} ${Math.floor(st.mtimeMs)}`);
  };
  for (const source of SOURCES) {
    walk(join(FRONTEND, source));
  }
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}

/** npm, run in frontend/ (npm.cmd on Windows). */
function npm(args) {
  const r = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, { cwd: FRONTEND, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
}

const now = stamp();
const built = existsSync(join(BUILD, 'browser', 'index.html')) && existsSync(STAMP) && readFileSync(STAMP, 'utf8').trim() === now;
if (process.argv.includes('--check')) {
  console.log(built ? 'The app is built, and current.' : 'The app needs building.');
  process.exit(built ? 0 : 1);
}
if (built) {
  console.log('The app is built, and current.');
  process.exit(0);
}

const modules = join(FRONTEND, 'node_modules');
const lock = join(FRONTEND, 'package-lock.json');
if (!existsSync(join(modules, '.package-lock.json')) || statSync(lock).mtimeMs > statSync(join(modules, '.package-lock.json')).mtimeMs) {
  console.log("Installing the frontend's packages (npm ci)…");
  npm(['ci', '--no-audit', '--no-fund']);
}
console.log('Building the app (ng build)…');
npm(['run', 'build']);
writeFileSync(STAMP, `${now}\n`);
console.log('The app is built.');
