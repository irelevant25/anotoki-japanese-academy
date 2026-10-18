/**
 * Finds the PHP that runs the app, and runs a PHP script with it, from the
 * repository's root — for the command line where an older php comes first on
 * PATH (Git Bash's is 7.4 on the owner's computer), and for the browser suites:
 *
 *   node backend/tools/php.js backend/tests/run.php            the PHP tests
 *   node backend/tools/php.js backend/manage.php --check       the helpers, the data and build tools
 *
 * The PHP is the first of ACADEMY_PHP, every php on PATH, and the usual install
 * folders that is PHP 8.2 or newer with pdo_pgsql, mbstring and intl. (Plain
 * `php` would take the first on PATH, whatever its version.)
 */
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const EXE = process.platform === 'win32' ? 'php.exe' : 'php';

function candidates() {
  const out = [];
  if (process.env.ACADEMY_PHP) out.push(process.env.ACADEMY_PHP);
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (dir) out.push(path.join(dir.replace(/^"|"$/g, ''), EXE));
  }
  const globDirs = (base, re) => {
    try {
      return fs
        .readdirSync(base)
        .filter((d) => re.test(d))
        .sort()
        .reverse()
        .map((d) => path.join(base, d));
    } catch {
      return [];
    }
  };
  if (process.platform === 'win32') {
    const home = process.env.USERPROFILE || '';
    const local = process.env.LOCALAPPDATA || '';
    const dirs = [
      'C:\\php',
      ...globDirs('C:\\', /^php/i),
      ...globDirs('C:\\tools', /^php/i),
      path.join(home, 'scoop', 'apps', 'php', 'current'),
      path.join(local, 'Microsoft', 'WinGet', 'Links'),
      ...globDirs(path.join(local, 'Microsoft', 'WinGet', 'Packages'), /^PHP\.PHP/i),
      ...globDirs('C:\\laragon\\bin\\php', /^php/i),
      'C:\\xampp\\php',
    ];
    for (const d of dirs) out.push(path.join(d, EXE));
  } else {
    out.push('/opt/homebrew/bin/php', '/usr/local/bin/php', '/usr/bin/php');
  }
  return [...new Set(out)].filter((p) => fs.existsSync(p));
}

/** '' when this PHP can run the app, else why not. */
function problem(php) {
  try {
    const out = execFileSync(php, ['-r', 'echo PHP_VERSION, " ", implode(",", array_filter(["pdo_pgsql", "mbstring", "intl"], function ($e) { return !extension_loaded($e); }));'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 15000,
    }).trim();
    const [version, missing] = out.split(' ');
    const [major, minor] = version.split('.').map(Number);
    if (major < 8 || (major === 8 && minor < 2)) return `PHP ${version}: too old`;
    return missing ? `PHP ${version}: no ${missing}` : '';
  } catch (e) {
    return 'does not run';
  }
}

let FOUND = null;
function findPhp() {
  if (FOUND) return FOUND;
  const tried = [];
  for (const php of candidates()) {
    const why = problem(php);
    if (!why) return (FOUND = php);
    tried.push(`${php} (${why})`);
  }
  throw new Error(
    'No PHP 8.2+ with pdo_pgsql, mbstring and intl found (README → Run it). ' + 'Set ACADEMY_PHP to its php executable.' + (tried.length ? `\n  tried: ${tried.join('\n         ')}` : ''),
  );
}

if (require.main === module) {
  let php;
  try {
    php = findPhp();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  // Ctrl+C reaches PHP too: wait for it to finish (the audio builder saves its
  // index before it stops) instead of handing the prompt back while it runs.
  process.on('SIGINT', () => {});
  const r = spawnSync(php, process.argv.slice(2), { stdio: 'inherit', cwd: path.join(__dirname, '..', '..') });
  process.exit(r.status === null ? 1 : r.status);
}

module.exports = { findPhp };
