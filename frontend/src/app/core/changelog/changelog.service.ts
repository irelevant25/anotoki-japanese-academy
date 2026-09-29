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

/** Which version this browser last opened the changelog of (per browser: it is the one that knows). */
const SEEN_KEY = 'academy-changelog-seen';

/**
 * The app's version and what changed in it (public/changelog.json). The
 * version shows at the foot of every page, and opens the changelog; until it
 * has been opened once for a new version, a small dot says there is news.
 */
@Injectable({ providedIn: 'root' })
export class ChangelogService {
  readonly entries = signal<ChangelogEntry[]>([]);
  private readonly seen = signal<string | null>(readSeen());

  readonly version = computed(() => this.entries()[0]?.version ?? '');
  readonly unseen = computed(() => !!this.version() && this.seen() !== this.version());

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
      localStorage.setItem(SEEN_KEY, v);
    } catch {
      // not remembered: the dot shows again next time
    }
  }
}

function readSeen(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}
