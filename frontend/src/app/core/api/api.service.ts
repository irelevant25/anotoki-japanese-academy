import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom, Observable } from 'rxjs';
import {
  ApiErrorBody,
  Attempt,
  BroughtBack,
  Catalog,
  ExamMeta,
  ExamPaper,
  ExamResult,
  ExamSpec,
  ItemPatch,
  Person,
  Progress,
  Settings,
  StateAnswer,
  Summary,
  VisitorMove,
  VisitorsCount,
} from './api.types';
import { CARRIES_VISITOR_KEY, issuedAs, VISITOR_KEY_HEADER } from '../auth/issued-as';

/**
 * What a failure is called: the word the server put in its answer; `offline`
 * when there was no answer at all (status 0); else `http_<status>` — an answer
 * that was not the API's own (a proxy's page, a body without a code).
 */
export function errorCode(status: number, body: unknown): string {
  const code = body && typeof body === 'object' ? (body as ApiErrorBody).code : undefined;
  if (typeof code === 'string' && code !== '') {
    return code;
  }
  return status === 0 ? 'offline' : `http_${status}`;
}

/**
 * A failed call: its status, its code (errorCode()) and the server's whole
 * answer. A page words the failure from the code, in the reader's language
 * (core/i18n/error-text.ts). The message is the server's English sentence,
 * kept for the console and never shown on a page that is translated.
 */
export class ApiError extends Error {
  readonly code: string;

  constructor(
    message: string,
    readonly status: number,
    readonly body: ApiErrorBody,
    code?: string,
  ) {
    super(message);
    this.code = code ?? errorCode(status, body);
  }
}

/** For a signed-in person only, whatever the page is shown as: what a visitor may never do (the data file, the admin panel, the move). */
const AS_PERSON = issuedAs('person');

/**
 * Every call the app makes to its backend, same-origin (/api/...). The token
 * of a sign-in — or a visitor's key — is the interceptor's to add
 * (core/auth/auth.interceptor.ts), for whom the page is shown to as the call
 * is issued; the calls only a person may make say so (AS_PERSON), and go with
 * a token or not at all.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  /* ---------------------------------------------------------------- kanji */

  catalog(): Promise<Catalog> {
    return this.call(this.http.get<Catalog>('/api/kanji/catalog'));
  }

  progress(): Promise<Progress> {
    return this.call(this.http.get<Progress>('/api/kanji/progress'));
  }

  summary(): Promise<Summary> {
    return this.call(this.http.get<Summary>('/api/kanji/summary'));
  }

  learn(id: string): Promise<StateAnswer> {
    return this.call(this.http.post<StateAnswer>('/api/kanji/learn', { id }));
  }

  review(id: string, meaningWrong: number, readingWrong: number): Promise<StateAnswer> {
    return this.call(this.http.post<StateAnswer>('/api/kanji/review', { id, meaningWrong, readingWrong }));
  }

  practice(id: string, firstTryCorrect: boolean, wrong: number): Promise<StateAnswer> {
    return this.call(this.http.post<StateAnswer>('/api/kanji/practice', { id, firstTryCorrect, wrong }));
  }

  item(id: string, patch: ItemPatch): Promise<StateAnswer> {
    return this.call(this.http.post<StateAnswer>('/api/kanji/item', { id, ...patch }));
  }

  settings(patch: Partial<Settings>): Promise<{ settings: Settings }> {
    return this.call(this.http.post<{ settings: Settings }>('/api/kanji/settings', patch));
  }

  resetItem(id: string): Promise<StateAnswer> {
    return this.call(this.http.post<StateAnswer>('/api/kanji/reset-item', { id }));
  }

  /* ----------------------------------------------------------------- exam */

  meta(): Promise<ExamMeta> {
    return this.call(this.http.get<ExamMeta>('/api/meta'));
  }

  paper(request: { size: number; books: number[]; lessons: number[]; sections: string[]; seed: string | null }): Promise<ExamPaper> {
    return this.call(this.http.post<ExamPaper>('/api/exam', request));
  }

  submit(body: {
    spec: ExamSpec;
    startedAt: string | null;
    meta: { candidate: string };
    responses: Record<string, { choice: number | null; ms: number }>;
  }): Promise<ExamResult> {
    return this.call(this.http.post<ExamResult>('/api/submit', body));
  }

  attempts(): Promise<Attempt[]> {
    return this.call(this.http.get<Attempt[]>('/api/attempts'));
  }

  /* ------------------------------------------------------- your own data */
  // Every signed-in person, their own data only (backend/api/routes/me.php).
  // The download is AuthService.fetch()'s (a file, saved from a Blob): see home/your-data.

  /**
   * A data file's text, as it is, replaces all of this person's data (a copy
   * of what was there is kept on the server first). 413 too_large {limit},
   * 422 not_a_data_file, 422 several_people.
   */
  bringBack(text: string): Promise<BroughtBack> {
    return this.call(this.http.put<BroughtBack>('/api/me/data', text, { headers: { 'Content-Type': 'application/json' }, context: AS_PERSON }));
  }

  /* ------------------------------------------------------------ visitors */

  /**
   * After a sign-in: what this browser's visitor studied (`key`) moves into
   * the signed-in person's account (core/auth/visitor-key.ts). The one request
   * with both the token and the key. Repeatable: a key nobody has any more is
   * 200 {found: false}; 422 bad_visitor_key, 503 visitor_move_retry.
   */
  moveVisitor(key: string): Promise<VisitorMove> {
    return this.call(
      this.http.post<VisitorMove>('/api/visitor/move', {}, { headers: { [VISITOR_KEY_HEADER]: key }, context: issuedAs('person').set(CARRIES_VISITOR_KEY, true) }),
    );
  }

  /* --------------------------------------------------- the admin panel: people */
  // ADMIN alone (backend/api/middleware/staff.php). The pages only hide what the server refuses. (The
  // Translations, Languages and Migrations pages are the anotoki library's, which ask their own addresses
  // through this app's HttpClient: core/i18n/translations.config.ts, core/site-status.config.ts.)

  /** Everybody the site has, the latest seen first (ADMIN). */
  people(): Promise<Person[]> {
    return this.call(this.http.get<{ people: Person[] }>('/api/admin/people', { context: AS_PERSON })).then((r) => r.people);
  }

  /** All of this person's data goes, after a copy of it on the server: answers the copy's file name (ADMIN). */
  deletePerson(id: number): Promise<{ deleted: number; copy: string }> {
    return this.call(this.http.delete<{ deleted: number; copy: string }>(`/api/admin/people/${encodeURIComponent(String(id))}`, { context: AS_PERSON }));
  }

  /** How many visitors the site keeps now, the oldest seen when, and its limits (ADMIN): the People page's line. */
  visitors(): Promise<VisitorsCount> {
    return this.call(this.http.get<VisitorsCount>('/api/admin/visitors', { context: AS_PERSON }));
  }

  /** The answer, or an ApiError: its status, its code and the server's answer. */
  private async call<T>(request: Observable<T>): Promise<T> {
    try {
      return await firstValueFrom(request);
    } catch (e) {
      throw toApiError(e);
    }
  }
}

/**
 * Any failure of a call as an ApiError. Something that was not an answer at
 * all (a fault in the page's own code) is `unknown`, not `offline`: the server
 * was never asked.
 */
export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) {
    return e;
  }
  if (e instanceof HttpErrorResponse) {
    const body: ApiErrorBody = e.error && typeof e.error === 'object' ? (e.error as ApiErrorBody) : {};
    const message = body.error || (e.status === 0 ? 'the server does not answer' : e.statusText || `HTTP ${e.status}`);
    return new ApiError(message, e.status, body);
  }
  return new ApiError(e instanceof Error ? e.message : String(e), 0, {}, 'unknown');
}
