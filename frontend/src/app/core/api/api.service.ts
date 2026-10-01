import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom, Observable } from 'rxjs';
import {
  ApiErrorBody,
  Attempt,
  Catalog,
  ExamMeta,
  ExamPaper,
  ExamResult,
  ExamSpec,
  ItemPatch,
  Progress,
  Settings,
  StateAnswer,
  Summary,
} from './api.types';
import { LanguageChanges, NewLanguage, OwnerLanguage, TranslationChanges, TranslationGrid } from '../i18n/translation.model';

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

/**
 * Every call the app makes to its backend, same-origin (/api/...). The token
 * of a sign-in is the interceptor's to add (core/auth/auth.interceptor.ts);
 * nothing here knows about it.
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

  /* --------------------------------------- the owner's words and languages */
  // Only the owner may (the server's owner_middleware: ADMIN, or this computer).

  languages(): Promise<OwnerLanguage[]> {
    return this.call(this.http.get<{ languages: OwnerLanguage[] }>('/api/owner/languages')).then((r) => r.languages);
  }

  createLanguage(language: NewLanguage): Promise<OwnerLanguage> {
    return this.call(this.http.post<{ language: OwnerLanguage }>('/api/owner/languages', language)).then((r) => r.language);
  }

  updateLanguage(code: string, changes: LanguageChanges): Promise<OwnerLanguage> {
    return this.call(this.http.put<{ language: OwnerLanguage }>(`/api/owner/languages/${encodeURIComponent(code)}`, changes)).then((r) => r.language);
  }

  /** Answers the name of the copy of its strings the server made in backups/ first. */
  deleteLanguage(code: string): Promise<{ copy: string }> {
    return this.call(this.http.delete<{ copy: string }>(`/api/owner/languages/${encodeURIComponent(code)}`));
  }

  translationGrid(): Promise<TranslationGrid> {
    return this.call(this.http.get<TranslationGrid>('/api/owner/translations'));
  }

  /** Only the changed cells; the server checks them all before it writes any, and answers the grid as it is now. */
  saveTranslations(values: TranslationChanges): Promise<TranslationGrid> {
    return this.call(this.http.put<TranslationGrid>('/api/owner/translations', { values }));
  }

  /** A language's own strings, flat: fetched here, with the token, and saved by the page from a Blob. */
  exportTranslations(code: string): Promise<Record<string, string>> {
    return this.call(this.http.get<Record<string, string>>(`/api/owner/translations/${encodeURIComponent(code)}/export`));
  }

  importTranslations(code: string, values: Record<string, string>): Promise<TranslationGrid> {
    return this.call(this.http.put<TranslationGrid>(`/api/owner/translations/${encodeURIComponent(code)}/import`, values));
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
