#!/usr/bin/env node
/**
 * Page images from the scanned course books in books/ — the only way to read them: they
 * have no text layer, and this machine has no poppler, so the Read tool cannot
 * render a PDF page. Each PDF page is a single embedded JPEG, which this tool
 * pulls out directly (no decoding), crops to the printed page and scales.
 *
 *   node backend/tools/pdf/pages.js <book> <pages> [--sheet] [--width 1150] [--book-page]
 *   (or: npm run pdf:pages -- <book> <pages> …)
 *
 *   <book>    textbook-1 | workbook-1 | textbook-2 | workbook-2 | answer-key
 *   <pages>   12 | 357-372 | 10,12,20
 *   --book-page  <pages> are the numbers printed in the book (converted with the
 *                offsets below) instead of PDF page numbers
 *   --sheet   one contact sheet of thumbnails instead of single pages — use it
 *             to find where things are before reading pages at full size
 *
 * Prints the path of each image; open it with the Read tool. Everything is
 * cached under %TEMP%/academy-pages/<book>/ (each PDF is read once).
 *
 * Page numbers here are PDF PAGE NUMBERS (1 = the first page, as any PDF
 * viewer counts), which is what the page maps in docs/kb/data-provenance.md use.
 */
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

// books/ sits at the repository's root (gitignored), three folders up from here.
const PDF_DIR = process.env.ACADEMY_BOOKS_DIR || path.join(__dirname, '..', '..', '..', 'books');
const CACHE = path.join(os.tmpdir(), 'academy-pages');

/**
 * crop: the printed page inside the scanned image, in PDF units against the
 * page MediaBox (x0, y0 from the bottom-left, as in the PDF's /CropBox).
 * offset: PDF page = printed page + offset. Checked at the start, middle and
 * end of each book; the blank and divider pages are numbered book pages, so
 * the offset holds throughout.
 */
const BOOKS = {
  'textbook-1': { file: 'textbook-1.pdf', crop: null, offset: 7 },
  'workbook-1': { file: 'workbook-1.pdf', crop: null, offset: 3 },
  'textbook-2': {
    file: 'textbook-2.pdf',
    crop: { x0: 20.16, y0: 223.2, x1: 1059.85, y1: 1696.81, mw: 1080, mh: 1920 },
    offset: 5,
  },
  'workbook-2': {
    file: 'workbook-2.pdf',
    crop: { x0: 20.16, y0: 223.2, x1: 1059.85, y1: 1696.81, mw: 1080.01, mh: 1920.01 },
    offset: 3,
  },
  'answer-key': {
    file: 'answer-key.pdf',
    crop: { x0: 577.44, y0: 0, x1: 1341.85, y1: 1080.01, mw: 1920.01, mh: 1080.01 },
    offset: 2,
  },
};

function usage(msg) {
  if (msg) console.error(`error: ${msg}\n`);
  console.error(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\*?/, '').replace(/^ \* ?/gm, ''));
  process.exit(1);
}

function parsePages(spec) {
  const out = [];
  for (const part of String(spec).split(',')) {
    const m = part.match(/^(\d+)(?:-(\d+))?$/);
    if (!m) usage(`bad page list "${spec}"`);
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    if (b < a) usage(`backwards range "${part}"`);
    for (let p = a; p <= b; p++) out.push(p);
  }
  return out;
}

/* ------------------------------------------------------------ PDF reading */

/** Index just past the << … >> dictionary that opens at `i`. */
function dictEnd(s, i) {
  let depth = 0;
  for (; i < s.length - 1; i++) {
    if (s[i] === '<' && s[i + 1] === '<') {
      depth += 1;
      i += 1;
    } else if (s[i] === '>' && s[i + 1] === '>') {
      depth -= 1;
      i += 1;
      if (!depth) return i + 1;
    }
  }
  return s.length;
}

/** The objects packed inside a compressed object stream (/Type /ObjStm). */
function unpackObjStm(buf, dict, [start, stop], objs) {
  let txt;
  try {
    txt = zlib.inflateSync(buf.subarray(start, stop)).toString('latin1');
  } catch {
    return;
  }
  const n = Number((dict.match(/\/N\s+(\d+)/) || [])[1]);
  const first = Number((dict.match(/\/First\s+(\d+)/) || [])[1]);
  const head = txt.slice(0, first).trim().split(/\s+/).map(Number);
  for (let i = 0; i < n; i++) {
    const from = first + head[2 * i + 1];
    const to = i + 1 < n ? first + head[2 * i + 3] : txt.length;
    objs.set(head[2 * i], { dict: txt.slice(from, to), stream: null });
  }
}

/**
 * Every object in the file: its dictionary text and where its stream lies.
 * A later definition of the same object replaces an earlier one, as in an
 * incremental update. Stream data is skipped, never searched.
 */
function parsePdf(buf) {
  const s = buf.toString('latin1');
  const objs = new Map();
  const re = /(\d+)\s+\d+\s+obj\b/g;
  let m;
  while ((m = re.exec(s))) {
    const num = Number(m[1]);
    const open = s.indexOf('<<', re.lastIndex);
    const end = s.indexOf('endobj', re.lastIndex);
    if (open < 0 || (end >= 0 && end < open)) {
      objs.set(num, { dict: s.slice(re.lastIndex, end < 0 ? re.lastIndex : end), stream: null });
      continue;
    }
    const close = dictEnd(s, open);
    const dict = s.slice(open, close);
    const after = s.slice(close, close + 32).match(/^\s*stream\r?\n/);
    let stream = null;
    if (after) {
      const start = close + after[0].length;
      // a direct length only: "/Length 245 0 R" is a reference, so find endstream instead
      const len = Number((dict.match(/\/Length\s+(\d+)(?!\d)(?!\s+\d+\s+R)/) || [])[1]);
      const stop = len ? start + len : s.indexOf('endstream', start);
      if (stop < 0) break; // a stream that never ends: nothing readable after it
      stream = [start, stop];
      re.lastIndex = stop;
    }
    objs.set(num, { dict, stream });
    if (stream && /\/Type\s*\/ObjStm/.test(dict)) unpackObjStm(buf, dict, stream, objs);
  }
  return objs;
}

const refTo = (text, key) => {
  const m = text.match(new RegExp(`/${key}\\s*(\\d+)\\s+\\d+\\s+R`));
  return m ? Number(m[1]) : null;
};

/** A dictionary-valued entry, written inline (<< … >>) or as a reference. */
function entry(objs, text, key) {
  if (!text) return null;
  const at = text.search(new RegExp(`/${key}\\s*<<`));
  if (at >= 0) {
    const open = text.indexOf('<<', at);
    return text.slice(open, dictEnd(text, open));
  }
  const n = refTo(text, key);
  return n != null && objs.has(n) ? objs.get(n).dict : null;
}

/** The pages in reading order, from the page tree, with inherited /Resources. */
function pageOrder(objs) {
  const catalog = [...objs.values()].find((o) => /\/Type\s*\/Catalog\b/.test(o.dict));
  const pages = [];
  const seen = new Set();
  (function walk(num, inherited) {
    const o = objs.get(num);
    if (!o || seen.has(num)) return;
    seen.add(num);
    const resources = entry(objs, o.dict, 'Resources') || inherited;
    if (/\/Type\s*\/Pages\b/.test(o.dict)) {
      let kids = (o.dict.match(/\/Kids\s*\[([^\]]*)\]/) || [])[1];
      if (kids == null && refTo(o.dict, 'Kids') != null) kids = (objs.get(refTo(o.dict, 'Kids')) || {}).dict || '';
      for (const k of (kids || '').matchAll(/(\d+)\s+\d+\s+R/g)) walk(Number(k[1]), resources);
    } else {
      pages.push(resources);
    }
  })(catalog ? refTo(catalog.dict, 'Pages') : null, null);
  return pages;
}

/** The page's scan: its largest JPEG image. */
function pageJpeg(buf, objs, resources) {
  const xobjects = entry(objs, resources, 'XObject') || '';
  let best = null;
  for (const r of xobjects.matchAll(/\/[^\s/<>[\]()]+\s+(\d+)\s+\d+\s+R/g)) {
    const o = objs.get(Number(r[1]));
    if (!o || !o.stream || !/\/Subtype\s*\/Image/.test(o.dict) || !/DCTDecode/.test(o.dict)) continue;
    const size = (k) => Number((o.dict.match(new RegExp(`/${k}\\s+(\\d+)`)) || [])[1]) || 0;
    const area = size('Width') * size('Height');
    if (!best || area > best.area) best = { o, area };
  }
  if (!best) return null;
  const jpg = buf.subarray(...best.o.stream);
  return jpg[0] === 0xff && jpg[1] === 0xd8 ? jpg : null;
}

/**
 * One JPEG per PDF page, numbered as any PDF viewer numbers pages. The order
 * comes from the page tree, not from where images sit in the file (the book 2
 * scans store their covers last), and a page that reuses another page's image
 * (the blank pages do) still gets its own number, so the numbering never
 * drifts. Written to a temp folder and renamed into place, so an interrupted
 * run or two runs at once never leave a half cache.
 */
function extractPages(book) {
  const dir = path.join(CACHE, book, 'pdf-pages');
  if (fs.existsSync(path.join(dir, '.done'))) return dir;
  const file = path.join(PDF_DIR, BOOKS[book].file);
  if (!fs.existsSync(file)) usage(`PDF not found: ${file} (the PDFs belong in books/, or set ACADEMY_BOOKS_DIR)`);
  process.stderr.write(`reading ${BOOKS[book].file} (one-off)…\n`);
  const buf = fs.readFileSync(file);
  const objs = parsePdf(buf);
  const pages = pageOrder(objs);
  if (!pages.length) usage(`no pages found in ${BOOKS[book].file}`);
  const tmp = `${dir}.tmp-${process.pid}`;
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  const missing = [];
  pages.forEach((resources, i) => {
    const jpg = pageJpeg(buf, objs, resources);
    if (jpg) fs.writeFileSync(path.join(tmp, `${String(i + 1).padStart(3, '0')}.jpg`), jpg);
    else missing.push(i + 1);
  });
  if (missing.length === pages.length) {
    fs.rmSync(tmp, { recursive: true, force: true });
    usage(`no page images found in ${BOOKS[book].file}`);
  }
  if (missing.length) process.stderr.write(`  WARNING: no JPEG on page(s) ${missing.join(', ')}\n`);
  fs.writeFileSync(path.join(tmp, '.done'), JSON.stringify({ pages: pages.length, missing }));
  // a folder without .done is a broken leftover (e.g. a half-cleared %TEMP%): replace it
  if (fs.existsSync(dir) && !fs.existsSync(path.join(dir, '.done'))) fs.rmSync(dir, { recursive: true, force: true });
  try {
    fs.renameSync(tmp, dir);
  } catch (err) {
    fs.rmSync(tmp, { recursive: true, force: true }); // another run got there first
    if (!fs.existsSync(path.join(dir, '.done'))) throw err;
  }
  process.stderr.write(`  ${pages.length} pages\n`);
  return dir;
}

/* --------------------------------------------------------------- images */

/** Output folder per width and crop, so changing a crop can't serve stale images. */
function outDir(book, width) {
  const { crop } = BOOKS[book];
  const key = crop ? `-${crypto.createHash('md5').update(JSON.stringify(crop)).digest('hex').slice(0, 6)}` : '';
  return path.join(CACHE, book, `p${width}${key}`);
}

async function page(book, index, width) {
  const sharp = require('sharp');
  const raw = path.join(extractPages(book), `${String(index).padStart(3, '0')}.jpg`);
  if (!fs.existsSync(raw)) usage(`${book} has no page ${index}`);
  const out = path.join(outDir(book, width), `pg${String(index).padStart(3, '0')}.jpg`);
  if (fs.existsSync(out)) return out;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  let img = sharp(raw);
  const { crop } = BOOKS[book];
  if (crop) {
    const md = await sharp(raw).metadata();
    const sx = md.width / crop.mw;
    const sy = md.height / crop.mh;
    const left = Math.max(0, Math.round(crop.x0 * sx));
    const top = Math.max(0, Math.round((crop.mh - crop.y1) * sy));
    img = img.extract({
      left,
      top,
      width: Math.min(md.width - left, Math.round((crop.x1 - crop.x0) * sx)),
      height: Math.min(md.height - top, Math.round((crop.y1 - crop.y0) * sy)),
    });
  }
  // written aside and renamed: an interrupted run must not leave a cut-off page in the cache
  const part = out.replace(/\.jpg$/, `.${process.pid}.part.jpg`);
  await img.resize({ width }).grayscale().jpeg({ quality: 82 }).toFile(part);
  fs.renameSync(part, out);
  return out;
}

async function sheet(book, indexes) {
  const sharp = require('sharp');
  const cols = 7;
  const cellW = 260;
  const cellH = Math.round(cellW * 1.414);
  const comps = [];
  for (let i = 0; i < indexes.length; i++) {
    const src = await page(book, indexes[i], 600);
    const label = Buffer.from(
      `<svg width="${cellW}" height="40"><rect width="72" height="30" fill="#000"/>` +
        `<text x="6" y="22" fill="#fff" font-size="22" font-family="sans-serif">${indexes[i]}</text></svg>`
    );
    const tile = await sharp(src)
      .resize({ width: cellW, height: cellH, fit: 'contain', background: '#fff' })
      .composite([{ input: label, top: 0, left: 0 }])
      .jpeg({ quality: 70 })
      .toBuffer();
    comps.push({ input: tile, top: Math.floor(i / cols) * cellH, left: (i % cols) * cellW });
  }
  const rows = Math.ceil(indexes.length / cols);
  const out = path.join(CACHE, book, `sheet-${indexes[0]}-${indexes[indexes.length - 1]}.jpg`);
  await sharp({ create: { width: cols * cellW, height: rows * cellH, channels: 3, background: '#fff' } })
    .composite(comps)
    .jpeg({ quality: 72 })
    .toFile(out);
  return out;
}

(async () => {
  const args = process.argv.slice(2);
  const flags = new Set();
  const pos = [];
  let width = 1150;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--width') width = Number(args[++i]) || width;
    else if (args[i].startsWith('--')) flags.add(args[i]);
    else pos.push(args[i]);
  }
  const book = pos[0];
  if (!book || !BOOKS[book]) usage(book ? `unknown book "${book}"` : 'which book?');
  if (!pos[1]) usage('which pages?');

  let indexes = parsePages(pos[1]);
  if (flags.has('--book-page')) indexes = indexes.map((p) => p + BOOKS[book].offset);
  if (indexes.length > 60 && !flags.has('--sheet')) usage('more than 60 pages — use --sheet or a smaller range');

  if (flags.has('--sheet')) {
    for (let i = 0; i < indexes.length; i += 49) console.log(await sheet(book, indexes.slice(i, i + 49)));
  } else {
    for (const i of indexes) console.log(await page(book, i, width));
  }
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
