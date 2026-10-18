import { computed, Injectable, signal } from '@angular/core';

/** One release in public/changelog.json, newest first: what changed, in plain words. */
export interface ChangelogEntry {
  version: string;
  date: string;
  changes: {
    added?: string[];
    fixed?: string[];
    updated?: string[];
  };
}

/** Which version this browser last opened the changelog of (per browser: it is the one that knows; the Privacy page names it). */
export const CHANGELOG_SEEN_KEY = 'academy-changelog-seen';

/** A version's numbers ("0.4.0": [0, 4, 0]), or null for anything that is not numbers between dots. */
function versionParts(version: string): number[] | null {
  return /^\d+(\.\d+)*$/.test(version) ? version.split('.').map(Number) : null;
}

/**
 * Two versions in order: below 0 when $a comes before $b, 0 for the same
 * release, above 0 after it. Their numbers are compared one by one, a missing
 * one counting as 0, so "0.4" - how the changelog wrote a version until
 * 2026-10-07 - is "0.4.0" (three numbers since: MAJOR.MINOR.PATCH). Anything
 * that is not a version is compared as text.
 */
export function compareVersions(a: string, b: string): number {
  const pa = versionParts(a);
  const pb = versionParts(b);
  if (!pa || !pb) {
    return a === b ? 0 : a < b ? -1 : 1;
  }
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

/**
 * The app's version and what changed in it (public/changelog.json). The
 * version shows at the foot of every page, and opens the changelog; until it
 * has been opened once for a new version, a small dot says there is news. A
 * version this browser remembers in another form ("0.4" for "0.4.0") counts
 * as read (compareVersions()).
 */
@Injectable({ providedIn: 'root' })
export class ChangelogService {
  readonly entries = signal<ChangelogEntry[]>([]);
  private readonly seen = signal<string | null>(readSeen());

  readonly version = computed(() => this.entries()[0]?.version ?? '');
  readonly unseen = computed(() => {
    const version = this.version();
    const seen = this.seen();
    return !!version && (seen === null || compareVersions(seen, version) !== 0);
  });

  async load(): Promise<void> {
    try {
      const r = await fetch('changelog.json', { cache: 'no-cache' });
      if (r.ok) {
        this.entries.set((await r.json()) as ChangelogEntry[]);
      }
    } catch {
      // no changelog, no version shown: nothing else depends on it
    }
  }

  markSeen(): void {
    const v = this.version();
    this.seen.set(v);
    try {
      localStorage.setItem(CHANGELOG_SEEN_KEY, v);
    } catch {
      // not remembered: the dot shows again next time
    }
  }
}

function readSeen(): string | null {
  try {
    return localStorage.getItem(CHANGELOG_SEEN_KEY);
  } catch {
    return null;
  }
}
