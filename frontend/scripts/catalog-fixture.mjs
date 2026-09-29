/**
 * The catalog the backend builds from data/ (backend/src/srs/catalog.php), as
 * a file the unit tests read: every item must accept its own printed answers
 * (src/app/kanji/answer.spec.ts). Written before every `npm test` run, into
 * src/testing/catalog.fixture.json (gitignored), with a PHP that can run the
 * app (backend/tools/php.js finds it).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(FRONTEND, '..');
const { findPhp } = createRequire(import.meta.url)(join(ROOT, 'backend', 'tools', 'php.js'));

const json = execFileSync(findPhp(), [join(ROOT, 'backend', 'tests', 'tools', 'catalog.php')], {
  cwd: ROOT,
  encoding: 'utf8',
  maxBuffer: 64e6,
});
mkdirSync(join(FRONTEND, 'src', 'testing'), { recursive: true });
writeFileSync(join(FRONTEND, 'src', 'testing', 'catalog.fixture.json'), json);
console.log(`catalog fixture: ${JSON.parse(json).items.length} items`);
