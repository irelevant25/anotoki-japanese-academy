import { Injectable } from '@angular/core';

/** The address of a clip of backend/tools/build-audio.php: public, no token needed. */
export function clipUrl(name: string): string {
  return `/audio/${encodeURIComponent(name)}`;
}

/**
 * The spoken words of the kanji trainer. A word has one clip per voice, and
 * the voices take turns, so every word is heard from both over time.
 */
@Injectable({ providedIn: 'root' })
export class AudioService {
  private current: HTMLAudioElement | null = null;
  private turn = 0;

  play(clips: string[] | string | null | undefined): void {
    const list = ([] as (string | null | undefined)[]).concat(clips ?? []).filter((c): c is string => !!c);
    if (!list.length) {
      return;
    }
    const name = list[this.turn++ % list.length];
    try {
      this.current?.pause();
      this.current = new Audio(clipUrl(name));
      this.current.play()?.catch(() => undefined);
    } catch {
      // no audio device: fine
    }
  }
}
