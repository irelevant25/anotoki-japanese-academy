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

/** A version's numbers ("0.4.0": [0, 4, 0]), or null for anything that is not numbers between dots. */
function versionParts(version: string): number[] | null {
  return /^\d+(\.\d+)*$/.test(version) ? version.split('.').map(Number) : null;
}

/**
 * Two versions in order: below 0 when $a comes before $b, 0 for the same
 * release, above 0 after it. Their numbers are compared one by one, a missing
 * one counting as 0, so "0.4" - how the changelog wrote a version until
 * 2026-10-07 - is "0.4.0" (three numbers since: MAJOR.MINOR.PATCH). Anything
 * that is not a version is compared as text. The changelog's spec holds its
 * releases newest first with it.
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
 * The app's version and what changed in it (public/changelog.json, asked for
 * once a page load: AppComponent). The version is the newest entry's - the one
 * source of it, which frontend/package.json's is held to (the spec) - and the
 * family's footer shows it ("v0.5.1", "Version 0.5.1" to a screen reader),
 * with What's new beside it, which
 * opens the changelog (changelog-dialog.component.ts). Nothing of it is kept
 * in the browser: the footer marks no news unread (the owner's footer, the
 * build analyzer's, has no dot).
 */
@Injectable({ providedIn: 'root' })
export class ChangelogService {
  readonly entries = signal<ChangelogEntry[]>([]);

  /** The newest release's version, or '' while there is no changelog (not loaded yet, or none on the server). */
  readonly version = computed(() => this.entries()[0]?.version ?? '');

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
}
