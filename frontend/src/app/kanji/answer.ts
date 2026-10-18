/**
 * Checking typed answers — the part of an SRS you feel on every single card.
 *
 * Meaning (English):
 *   - case, punctuation, "to"/"the"/"a" and parenthesised parts don't matter:
 *     "eat" is right for "to eat", "hot" for "hot (thing)", "older brother" for
 *     "(my) older brother"
 *   - number words and digits are interchangeable: "300" = "three hundred"
 *   - small typos are forgiven ("univercity"), scaled to the word's length —
 *     but never when the typo is itself the meaning of some other item, so
 *     "night" is not accepted as a typo of "right"
 *   - your own synonyms count too
 *
 * Reading (kana):
 *   - hiragana and katakana are interchangeable
 *   - a katakana long vowel can be typed out: サービス = さあびす = さーびす
 *   - no typo tolerance: a reading is right or it isn't
 *
 * The unit tests (answer.spec.ts) check it against every item of the catalog
 * the backend builds.
 */

export type Verdict = 'correct' | 'wrong' | 'invalid';

/**
 * Why an answer was not taken as one. The page words it, in the reader's
 * language, as `answer.check.<kind>` (declared in core/i18n/dynamic-keys.ts).
 */
export type CheckKind = 'readingEmpty' | 'readingUnfinished' | 'readingInKanji' | 'meaningNotEnglish' | 'meaningEmpty';

export interface Check {
  verdict: Verdict;
  /** an invalid answer: what was wrong with it, for the page to say what to do instead */
  kind?: CheckKind;
  /** a meaning forgiven as a typo */
  close?: boolean;
  matched?: string;
}

/* ------------------------------------------------------------------ kana */

export const kataToHira = (s: string): string => String(s).replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

const VOWEL_OF: Record<string, string> = {};
const ROWS: Record<string, string> = {
  a: 'あかさたなはまやらわがざだばぱぁゃゎ',
  i: 'いきしちにひみりぎじぢびぴぃ',
  u: 'うくすつぬふむゆるぐずづぶぷぅゅっ',
  e: 'えけせてねへめれげぜでべぺぇ',
  o: 'おこそとのほもよろをごぞどぼぽぉょ',
};
for (const [v, chars] of Object.entries(ROWS)) {
  for (const c of chars) {
    VOWEL_OF[c] = v;
  }
}
const VOWEL_KANA: Record<string, string[]> = { a: ['あ'], i: ['い'], u: ['う'], e: ['え', 'い'], o: ['お', 'う'] };

/** Normal form for comparing readings: hiragana, no spaces or separators. */
export function canonReading(s: string | null | undefined): string {
  return kataToHira(String(s || '').normalize('NFKC'))
    .replace(/[\s・.,、。]/g, '')
    .trim();
}

/** Every spelling a reading with ー can be typed as. */
export function readingForms(reading: string): Set<string> {
  const base = canonReading(reading);
  const out = new Set([base]);
  if (!base.includes('ー')) {
    return out;
  }
  let forms = [''];
  for (let i = 0; i < base.length; i++) {
    const ch = base[i];
    if (ch !== 'ー') {
      forms = forms.map((f) => f + ch);
      continue;
    }
    const v = VOWEL_OF[base[i - 1]];
    const opts = ['ー', ...(v ? VOWEL_KANA[v] : [])];
    forms = forms.flatMap((f) => opts.map((o) => f + o));
    if (forms.length > 64) {
      break; // pathological input; plenty of forms already
    }
  }
  for (const f of forms) {
    out.add(f);
  }
  return out;
}

const hasLatin = (s: string): boolean => /[a-z]/i.test(s);
const hasKanji = (s: string): boolean => /[一-龯]/.test(s);
const hasKana = (s: string): boolean => /[぀-ヿ]/.test(s);

/**
 * The language a piece of the learning material is in, for its `lang`
 * attribute: Japanese when it holds kana or kanji, English otherwise. The
 * material is never translated, so this holds whatever language the page is
 * in — an exam option, a given answer, a word beside its meaning.
 */
export function materialLang(text: string | null | undefined): 'ja' | 'en' {
  const s = String(text ?? '');
  return hasKana(s) || hasKanji(s) ? 'ja' : 'en';
}

export function checkReading(answer: string, readings: string[]): Check {
  const a = canonReading(answer);
  if (!a) {
    return { verdict: 'invalid', kind: 'readingEmpty' };
  }
  if (hasLatin(a)) {
    return { verdict: 'invalid', kind: 'readingUnfinished' };
  }
  if (hasKanji(a)) {
    return { verdict: 'invalid', kind: 'readingInKanji' };
  }
  for (const r of readings) {
    if (readingForms(r).has(a)) {
      return { verdict: 'correct', matched: r };
    }
  }
  return { verdict: 'wrong' };
}

/* ---------------------------------------------------------- meaning */

const UNITS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};
const SCALES: Record<string, number> = { hundred: 100, thousand: 1000, million: 1000000 };

/** "three hundred" → "300", "twenty-five minutes" → "25 minutes". */
function numify(s: string): string {
  const words = s.split(/[\s-]+/).filter(Boolean);
  const out: string[] = [];
  let i = 0;
  while (i < words.length) {
    const w = words[i];
    if (!(w in UNITS) && !(w in SCALES)) {
      out.push(w);
      i++;
      continue;
    }
    let total = 0;
    let current = 0;
    while (i < words.length) {
      const x = words[i];
      if (x in UNITS) {
        current += UNITS[x];
      } else if (x === 'hundred') {
        current = (current || 1) * 100;
      } else if (x in SCALES) {
        total += (current || 1) * SCALES[x];
        current = 0;
      } else if (x === 'and' && i + 1 < words.length && words[i + 1] in UNITS) {
        // "one hundred and five"
      } else {
        break;
      }
      i++;
    }
    out.push(String(total + current));
  }
  return out.join(' ');
}

function normMeaning(s: string): string {
  return String(s || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/['‘’`´]/g, '') // o'clock = oclock
    .replace(/(\d),(?=\d{3}\b)/g, '$1') // 10,000 = 10000
    .replace(/\.\.\.|…/g, ' ')
    .replace(/[^a-z0-9 -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The comparable core of a meaning: normalised, numbers as digits, and no
 * leading "to" / "be" / "the" / "a" — "to be tired" and "tired" are the same answer.
 */
export function core(s: string): string {
  let x = numify(normMeaning(s)).replace(/ - /g, ' ');
  let prev;
  do {
    prev = x;
    x = x.replace(/^(to|be|the|a|an) /, '');
  } while (x !== prev);
  return x.trim();
}

/** Split on ; and , — but not inside parentheses: "work (of art, etc.)" stays whole. */
function splitTop(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of String(s)) {
    if (ch === '(') {
      depth++;
    } else if (ch === ')') {
      depth = Math.max(0, depth - 1);
    }
    if (depth === 0 && (ch === ';' || ch === ',')) {
      parts.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/**
 * A slash offers alternatives for one word: "two vehicles/machines" means
 * "two vehicles" or "two machines"; "Mr./Ms." means "Mr." or "Ms.".
 */
function expandSlashes(phrase: string): string[] {
  let outs = [''];
  for (const tok of phrase.split(' ')) {
    const alts = tok.includes('/') && !/^\(/.test(tok) ? tok.split('/').filter(Boolean) : [tok];
    outs = outs.flatMap((o) => alts.map((a) => (o ? `${o} ${a}` : a)));
    if (outs.length > 16) {
      break;
    }
  }
  return outs;
}

/** "(my) older brother; hot (thing)" → {"my older brother","older brother","hot",…} */
export function meaningVariants(meanings: string[] | null | undefined): Set<string> {
  const out = new Set<string>();
  const add = (v: string): void => {
    const c = core(v);
    if (c) {
      out.add(c);
    }
  };
  for (const m of meanings || []) {
    add(String(m).replace(/\//g, ' '));
    for (const part of splitTop(m)) {
      for (const phrase of expandSlashes(part)) {
        // Each parenthesised group is optional on its own, and a slash inside
        // one is a choice: "(your/someone's) child (polite)" accepts "child",
        // "your child", "someone's child", "child polite", …
        const groups = (phrase.match(/\([^)]*\)/g) || []).slice(0, 3);
        let combos: string[][] = [[]];
        for (const g of groups) {
          const inner = g.slice(1, -1);
          const opts = [
            '',
            inner,
            ...inner
              .split('/')
              .map((s) => s.trim())
              .filter(Boolean),
          ];
          combos = combos.flatMap((c) => [...new Set(opts)].map((o) => [...c, o]));
        }
        for (const combo of combos) {
          let i = 0;
          add(
            phrase.replace(/\([^)]*\)/g, (g) => {
              const r = i < combo.length ? combo[i] : g.slice(1, -1);
              i++;
              return ` ${r} `;
            }),
          );
        }
      }
    }
  }
  return out;
}

/**
 * Edit distance where swapping two neighbouring letters counts as one edit
 * (optimal string alignment) — "rigth" is one slip away from "right", which
 * is how it feels when you make it.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  const m = a.length;
  const n = b.length;
  if (!m) {
    return n;
  }
  if (!n) {
    return m;
  }
  const d = Array.from({ length: m + 1 }, (_, i) => {
    const row = new Array<number>(n + 1).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j <= n; j++) {
    d[0][j] = j;
  }
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[m][n];
}

const tolerance = (len: number): number => (len <= 3 ? 0 : len <= 5 ? 1 : len <= 8 ? 2 : 3);

/**
 * @param answer      what was typed
 * @param meanings    the item's meanings (+ the learner's synonyms)
 * @param knownCores  core() of every meaning of every item — a typo that
 *                    spells another real answer is not forgiven
 */
export function checkMeaning(answer: string, meanings: string[], knownCores?: Set<string> | null): Check {
  if (hasKana(answer) || hasKanji(answer)) {
    return { verdict: 'invalid', kind: 'meaningNotEnglish' };
  }
  const a = core(answer);
  if (!a) {
    return { verdict: 'invalid', kind: 'meaningEmpty' };
  }
  const variants = meaningVariants(meanings);
  if (variants.has(a)) {
    return { verdict: 'correct' };
  }
  if (knownCores && knownCores.has(a)) {
    return { verdict: 'wrong' };
  }
  if (/\d/.test(a)) {
    return { verdict: 'wrong' }; // numbers are exact
  }

  let best: { v: string; d: number } | null = null;
  for (const v of variants) {
    if (/\d/.test(v)) {
      continue;
    }
    const d = levenshtein(a, v);
    if (d <= tolerance(v.length) && (!best || d < best.d)) {
      best = { v, d };
    }
  }
  if (best) {
    return { verdict: 'correct', close: true, matched: best.v };
  }
  return { verdict: 'wrong' };
}

/** The "known meanings" guard, from a catalog. */
export function knownCoresOf(items: { meanings: string[] }[]): Set<string> {
  const s = new Set<string>();
  for (const it of items) {
    for (const v of meaningVariants(it.meanings)) {
      s.add(v);
    }
  }
  return s;
}
