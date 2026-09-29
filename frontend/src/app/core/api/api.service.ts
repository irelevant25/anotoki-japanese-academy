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

/** A failed call: the server's own sentence, its status and its whole answer. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: ApiErrorBody,
  ) {
    super(message);
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

  /** The answer, or an ApiError with the server's own sentence. */
  private async call<T>(request: Observable<T>): Promise<T> {
    try {
      return await firstValueFrom(request);
    } catch (e) {
      throw toApiError(e);
    }
  }
}

/** Any failure of a call as an ApiError: the server's sentence when it gave one. */
export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) {
    return e;
  }
  if (e instanceof HttpErrorResponse) {
    const body: ApiErrorBody = e.error && typeof e.error === 'object' ? (e.error as ApiErrorBody) : {};
    const message = body.error || (e.status === 0 ? 'the server does not answer' : e.statusText || `HTTP ${e.status}`);
    return new ApiError(message, e.status, body);
  }
  return new ApiError(e instanceof Error ? e.message : String(e), 0, {});
}
