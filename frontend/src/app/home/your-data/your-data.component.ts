import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, InjectionToken, output, signal, viewChild } from '@angular/core';
import { ButtonComponent } from '@anotoki/lib/ui';
import { DialogComponent } from '@anotoki/lib/ui/dialog';
import { ApiError, ApiService, errorCode, toApiError } from '../../core/api/api.service';
import { ApiErrorBody, BroughtBack } from '../../core/api/api.types';
import { AuthService } from '../../core/auth/auth.service';
import { fileNameOf } from '../../core/auth/private-links.service';
import { fmtDateTime } from '../../core/format';
import { errorKey, errorParams } from '../../core/i18n/error-text';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { TranslationService } from '../../core/i18n/translation.service';
import { browserTimeZone } from '../../core/time-zone';

/**
 * The most a server ever takes, in bytes: IMPORT_LIMIT_MAX in
 * backend/src/me.php (a test holds the two together). A server takes less
 * when PHP may use less memory (a 24th of memory_limit): that limit comes
 * with its first 413, and is checked from then on (IMPORT_LIMIT).
 */
export const IMPORT_CEILING = 16 * 1024 * 1024;

/** The most this server takes, as far as the page knows: IMPORT_CEILING, or the limit its last 413 named — for the rest of the page load, so a second file is checked against it before it goes. */
const IMPORT_LIMIT = new InjectionToken<{ bytes: number }>('the most this server takes', { providedIn: 'root', factory: () => ({ bytes: IMPORT_CEILING }) });

/** The data file's format, as backend/src/backup.php writes it (BACKUP_FORMAT, BACKUP_VERSION). */
const FORMAT = 'japanese-academy-backup';
const VERSION = 2;

/** What a chosen file holds, read here before anything is sent: the learner says yes to this. */
export interface FileHolds {
  name: string;
  /** the file's text, sent as it is */
  text: string;
  /** when the file was made (the server's ISO text), or null */
  takenAt: string | null;
  /** the account name in the file, or null */
  username: string | null;
  items: number;
  attempts: number;
}

/** Why a file is not sent, or was not taken: too big (sizes in bytes), or a failure worded from its code. */
export type Refusal = { kind: 'tooBig'; size: number; limit: number } | { kind: 'failed'; error: ApiError };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/*
 * JSON as PHP decodes it (json_decode(…, true)), for the server's shape rules
 * word for word: a list and an object are both arrays there; an array is a
 * list when its keys are 0, 1, 2 … (an empty one — [] or {} — is both).
 */

/** PHP's is_array of a decoded value: a list or an object. */
function phpArray(value: unknown): value is Record<string, unknown> | unknown[] {
  return typeof value === 'object' && value !== null;
}

/** PHP's array_is_list: the keys 0, 1, 2 … in order. */
function phpList(value: Record<string, unknown> | unknown[]): boolean {
  return Array.isArray(value) || Object.keys(value).every((key, i) => key === String(i));
}

/** An object as the app writes one ({} decodes as [] in PHP). */
function phpObject(value: unknown): boolean {
  return phpArray(value) && (Object.keys(value).length === 0 || !phpList(value));
}

/** A list as the app writes one. */
function phpListOf(value: unknown): value is unknown[] | Record<string, unknown> {
  return phpArray(value) && phpList(value);
}

/** A refusal of the file itself, with the code the server would give it, so it is worded the same way. */
function refused(code: 'not_a_data_file' | 'several_people', why: string): ApiError {
  return new ApiError(why, 0, { code }, code);
}

/**
 * What a data file holds, for the question before it replaces anything: the
 * server checks it again, and is the one that decides. Its person is the only
 * one in it, or — a backup of several — the one with the caller's id
 * (`self`), as the server takes it. And it is in the shape the server takes,
 * rule for rule (me_person_in() in backend/src/me.php: the kanji progress an
 * object of version 1 with its items, day counts and settings; the log and the
 * attempts lists; each attempt with its id, a time it finished and no report
 * but a page): a file the server would refuse is refused here, before the
 * learner is asked anything. Throws an ApiError not_a_data_file or
 * several_people.
 */
export function readDataFile(name: string, text: string, self: number | null): FileHolds {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw refused('not_a_data_file', 'not JSON');
  }
  if (!isRecord(data) || data['format'] !== FORMAT || data['version'] !== VERSION) {
    throw refused('not_a_data_file', 'not this format or version');
  }
  const users = data['users'];
  const people = (phpArray(users) ? Object.values(users) : []).filter(phpArray) as Record<string, unknown>[];
  if (!people.length) {
    throw refused('not_a_data_file', 'nobody in it');
  }
  const person = people.length === 1 ? people[0] : people.find((p) => self !== null && p['id'] === self);
  if (!person) {
    throw refused('several_people', 'several people, none of them the caller');
  }
  const kanji = person['kanji'];
  if (
    !phpArray(kanji) ||
    Object.keys(kanji).length === 0 ||
    phpList(kanji) ||
    (kanji as Record<string, unknown>)['version'] !== 1 ||
    !['items', 'daily', 'settings'].every((part) => phpObject((kanji as Record<string, unknown>)[part]))
  ) {
    throw refused('not_a_data_file', 'its kanji progress is not as this app writes it');
  }
  if (!phpListOf(person['log'])) {
    throw refused('not_a_data_file', 'its answer log is missing or not a list');
  }
  const attempts = person['attempts'];
  if (!phpListOf(attempts)) {
    throw refused('not_a_data_file', 'its exam attempts are missing or not a list');
  }
  for (const a of Object.values(attempts)) {
    const attempt = phpArray(a) ? (a as Record<string, unknown>)['attempt'] : null;
    const report = phpArray(a) ? (a as Record<string, unknown>)['report'] : null;
    if (
      !phpArray(attempt) ||
      !finished((attempt as Record<string, unknown>)['finishedAt']) ||
      !scalar((attempt as Record<string, unknown>)['id']) ||
      (report !== undefined && report !== null && typeof report !== 'string')
    ) {
      throw refused('not_a_data_file', 'an exam attempt is not as this app writes it');
    }
  }
  const items = Object.values((kanji as Record<string, unknown>)['items'] as object).filter((st) => isRecord(st) && Number(st['stage']) > 0).length;
  return {
    name,
    text,
    takenAt: typeof data['takenAt'] === 'string' ? data['takenAt'] : null,
    username: typeof person['username'] === 'string' && person['username'] !== '' ? person['username'] : null,
    items,
    attempts: Object.keys(attempts).length,
  };
}

/** A time an attempt finished at: text a date can be read from (the app writes ISO; the server reads it with DateTimeImmutable). */
function finished(value: unknown): boolean {
  return typeof value === 'string' && value !== '' && !Number.isNaN(Date.parse(value));
}

/** PHP's is_scalar: text, a number or true / false — not null, a list or an object. */
function scalar(value: unknown): boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

/**
 * Your data, at the foot of the home page: everything the app keeps of the
 * learner — kanji progress and settings, the answers, every exam attempt with
 * its report, their time zone — as one file to take away (GET /api/me/data),
 * and a file brought back (PUT /api/me/data), here or on another copy of the
 * app.
 *
 * Bringing a file back replaces all of the learner's data, never merges: so
 * the file is read here first, the card says what it holds, and nothing is
 * sent until the learner says yes (the kit's dialog, in their language). A
 * copy of what it replaces is kept on the server first. A file too big for
 * the server is not sent (IMPORT_CEILING, or the limit a 413 named).
 *
 * State holds kinds, numbers and ApiErrors; the words are the template's and
 * the computed()s', in the language on the page.
 */
@Component({
  selector: 'app-your-data',
  imports: [ButtonComponent, DialogComponent, TranslatePipe],
  templateUrl: './your-data.component.html',
  styleUrl: './your-data.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class YourDataComponent {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly i18n = inject(TranslationService);
  private readonly picker = viewChild.required<ElementRef<HTMLInputElement>>('file');
  private readonly limit = inject(IMPORT_LIMIT);

  /** A file came back and replaced the learner's data: the page around it loads what it shows again. */
  readonly brought = output<BroughtBack>();

  /** The browser's time zone, which the server counts the learner's days in (null: the browser names none). */
  readonly zone = browserTimeZone();

  readonly downloading = signal(false);
  readonly downloadFailed = signal<ApiError | null>(null);
  /** The file chosen and read, waiting for the learner's yes: the question is drawn while it is there, the focus on Keep mine (`autofocus`). */
  readonly holds = signal<FileHolds | null>(null);
  readonly bringing = signal(false);
  readonly refusal = signal<Refusal | null>(null);
  readonly done = signal<BroughtBack | null>(null);

  /** The sentence of a refusal, in the language on the page. */
  readonly refusalText = computed(() => {
    const refusal = this.refusal();
    if (!refusal) {
      return '';
    }
    if (refusal.kind === 'tooBig') {
      return this.i18n.t('yourData.tooBig', { size: this.megabytes(refusal.size), limit: this.megabytes(refusal.limit) });
    }
    return this.i18n.t('yourData.notBrought', { reason: this.i18n.t(errorKey(refusal.error), errorParams(refusal.error)) });
  });

  readonly downloadFailedText = computed(() => {
    const error = this.downloadFailed();
    return error ? this.i18n.t('yourData.downloadFailed', { reason: this.i18n.t(errorKey(error), errorParams(error)) }) : '';
  });

  /** When the chosen file was made, in the language on the page; '' when it does not say. */
  readonly takenAt = computed(() => {
    const at = this.holds()?.takenAt;
    return at && !Number.isNaN(Date.parse(at)) ? fmtDateTime(this.i18n, at) : '';
  });

  /** The learner's data as a file, under the name the server gives it (their day in it). */
  async download(): Promise<void> {
    if (this.downloading()) {
      return;
    }
    this.downloading.set(true);
    this.downloadFailed.set(null);
    try {
      const r = await this.auth.fetch('/api/me/data');
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as ApiErrorBody;
        this.downloadFailed.set(new ApiError(body.error || `HTTP ${r.status}`, r.status, body, errorCode(r.status, body)));
        return;
      }
      saveBlob(fileNameOf(r) || 'japanese-academy.json', await r.blob());
    } catch (e) {
      console.error('[your data] the download failed', e);
      this.downloadFailed.set(new ApiError('the server does not answer', 0, {}, 'offline'));
    } finally {
      this.downloading.set(false);
    }
  }

  /** Bring back: the file picker. */
  choose(): void {
    this.picker().nativeElement.click();
  }

  /** A file was chosen: its size checked, then read here, and the question asked (nothing is sent yet). */
  async chosen(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // the same file chosen again is a change again
    if (!file) {
      return;
    }
    this.refusal.set(null);
    this.done.set(null);
    if (file.size > this.limit.bytes) {
      this.refusal.set({ kind: 'tooBig', size: file.size, limit: this.limit.bytes });
      return;
    }
    // The IAM user id is the id the app keeps the learner's data by: a backup of several is read for theirs.
    const sub = this.auth.subject();
    const self = sub !== null && /^[1-9][0-9]{0,15}$/.test(sub) ? Number(sub) : null;
    try {
      this.holds.set(readDataFile(file.name, await file.text(), self));
    } catch (e) {
      this.refusal.set({ kind: 'failed', error: toApiError(e) });
    }
  }

  /** No - Keep mine, Escape, the dialog's Close: nothing is sent, nothing changes. Not while the file is on its way (the dialog is busy). */
  cancel(): void {
    this.holds.set(null);
  }

  /** Yes: the file replaces the learner's data. */
  async replace(): Promise<void> {
    const holds = this.holds();
    if (!holds || this.bringing()) {
      return;
    }
    this.bringing.set(true);
    try {
      const counts = await this.api.bringBack(holds.text);
      this.done.set(counts);
      this.brought.emit(counts);
    } catch (e) {
      const error = toApiError(e);
      const limit = error.body.limit;
      if (error.code === 'too_large' && typeof limit === 'number' && limit > 0) {
        this.limit.bytes = Math.min(this.limit.bytes, limit);
        this.refusal.set({ kind: 'tooBig', size: new Blob([holds.text]).size, limit });
      } else {
        this.refusal.set({ kind: 'failed', error });
      }
    } finally {
      this.bringing.set(false);
      this.holds.set(null);
    }
  }

  /** Keys pressed in the question stay in it: nothing on the page behind hears them. */
  keys(event: KeyboardEvent): void {
    event.stopPropagation();
  }

  /** "2.5 MB" / "2,5 MB": a size as the language writes numbers. */
  private megabytes(bytes: number): string {
    return this.i18n.t('yourData.megabytes', { n: this.i18n.number(bytes / (1024 * 1024), { maximumFractionDigits: 1 }) });
  }
}

/** Hands the browser a file to save, from memory: the address it saves from is a blob's, so no token ever stands in one. */
function saveBlob(name: string, blob: Blob): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
