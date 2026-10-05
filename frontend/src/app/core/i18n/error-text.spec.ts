import { HttpErrorResponse } from '@angular/common/http';
import { ApiError, errorCode, toApiError } from '../api/api.service';
import { DYNAMIC_KEYS } from './dynamic-keys';
import { errorKey, errorParams, signInFailureKey, signInFailureParams } from './error-text';

/** The codes the server puts beside its sentences (backend/src, backend/api/middleware/errors.php), with the status each comes with. */
const SERVER_CODES: [string, number][] = [
  ['no_such_item', 404],
  ['already_learned', 409],
  ['kanji_first', 409],
  ['not_due', 409],
  ['not_learned', 409],
  ['seed_required', 400],
  ['paper_mismatch', 409],
  ['sign_in_required', 401],
  ['invalid_token', 401],
  ['too_many_visitors', 429],
  ['visitor_unknown', 401],
  ['visitors_unavailable', 503],
  ['visitor_move_retry', 503],
  ['too_large', 413],
  ['not_a_data_file', 422],
  ['several_people', 422],
  ['database_unavailable', 503],
  ['server_error', 500],
  ['not_up_to_date', 503],
  ['not_set_up', 503],
  ['not_found', 404],
  ['method_not_allowed', 405],
];

describe('ApiError: what a failed call is called', () => {
  it('takes the code the server put in its answer', () => {
    const error = toApiError(new HttpErrorResponse({ status: 409, error: { error: 'Already learned.', code: 'already_learned', state: { stage: 1 } } }));
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(409);
    expect(error.code).toBe('already_learned');
    expect(error.body.code).toBe('already_learned');
    // The server's sentence is kept for the console; no page shows it.
    expect(error.message).toBe('Already learned.');
  });

  it('is offline when there was no answer at all, and http_<status> for an answer without a code', () => {
    expect(toApiError(new HttpErrorResponse({ status: 0 })).code).toBe('offline');
    expect(toApiError(new HttpErrorResponse({ status: 400, error: { error: 'The request body is not valid JSON.' } })).code).toBe('http_400');
    expect(toApiError(new HttpErrorResponse({ status: 502, error: '<html>Bad gateway</html>' })).code).toBe('http_502');
    expect(errorCode(404, 'No such report')).toBe('http_404');
    expect(errorCode(503, { code: '' })).toBe('http_503');
    expect(errorCode(503, { code: 7 })).toBe('http_503');
    expect(errorCode(0, null)).toBe('offline');
  });

  it('is unknown — not offline — for a fault that was never an answer, and an ApiError stays itself', () => {
    const fault = toApiError(new Error('boom'));
    expect(fault.status).toBe(0);
    expect(fault.code).toBe('unknown');
    const already = new ApiError('x', 409, { code: 'not_due' });
    expect(toApiError(already)).toBe(already);
    expect(already.code).toBe('not_due');
  });
});

describe('errorKey(): a failed request in the reader’s words', () => {
  it('words every code the server sends, through the table', () => {
    for (const [code, status] of SERVER_CODES) {
      expect(errorKey(new ApiError('x', status, { code })), code).toBe(`error.${code}`);
    }
    expect(errorKey(toApiError(new HttpErrorResponse({ status: 0 })))).toBe('error.offline');
  });

  it('takes what a StartProblem of the kind server holds, as it takes an ApiError', () => {
    expect(errorKey({ status: 401, code: 'invalid_token' })).toBe('error.invalid_token');
    expect(errorKey({ status: 503, code: 'not_up_to_date' })).toBe('error.not_up_to_date');
    expect(errorKey({ status: 502, code: 'http_502' })).toBe('error.http');
  });

  it('says the status of an answer that was not the API’s own', () => {
    const error = toApiError(new HttpErrorResponse({ status: 502, error: '<html>Bad gateway</html>' }));
    expect(errorKey(error)).toBe('error.http');
    expect(errorParams(error)).toEqual({ status: 502 });
  });

  it('falls back to one key for anything else — never a key made from the code', () => {
    expect(errorKey(new ApiError('x', 409, { code: 'conflict' }))).toBe('error.unknown');
    expect(errorKey(new ApiError('x', 422, { code: 'constructor' }))).toBe('error.unknown');
    expect(errorKey(new ApiError('x', 422, { code: 'http' }))).toBe('error.unknown');
    expect(errorKey(new ApiError('x', 500, { code: 'http_404' }))).toBe('error.unknown');
    expect(errorKey(new ApiError('x', 0, { code: 'unknown' }))).toBe('error.unknown');
    // The admin area's refusals are shown in the server's English there; anywhere else they are one general sentence.
    expect(errorKey(new ApiError('x', 403, { code: 'staff_only' }))).toBe('error.unknown');
    expect(errorKey(new ApiError('x', 403, { code: 'admin_only' }))).toBe('error.unknown');
    // Gone with the sign-in mode none: nothing sends them, and nothing words them.
    expect(errorKey(new ApiError('x', 403, { code: 'no_access' }))).toBe('error.unknown');
    expect(errorKey(new ApiError('x', 403, { code: 'this_computer_only' }))).toBe('error.unknown');
    expect(errorKey(toApiError(new Error('boom')))).toBe('error.unknown');
  });

  it('only ever answers a key the key scan is told about — and every one it is told about', () => {
    const declared = [...DYNAMIC_KEYS['error.'].map((tail) => `error.${tail}`), ...DYNAMIC_KEYS['error.visitor_limit.'].map((tail) => `error.visitor_limit.${tail}`)];
    const answered = [
      ...SERVER_CODES.map(([code, status]) => errorKey({ status, code })),
      errorKey({ status: 0, code: 'offline' }),
      errorKey({ status: 502, code: 'http_502' }),
      errorKey({ status: 400, code: 'nothing' }),
      errorKey({ status: 422, code: 'visitor_limit', body: { limit: 'attempts', max: 10 } }),
      errorKey({ status: 422, code: 'visitor_limit', body: { limit: 'answers', max: 20000 } }),
    ];
    expect([...new Set(answered)].sort()).toEqual([...declared].sort());
  });

  it('visitor_limit: worded by which of a visitor’s limits its answer names, with its number — a limit nobody listed is the general sentence', () => {
    const atCap = toApiError(
      new HttpErrorResponse({ status: 422, error: { error: 'Without signing in, …', code: 'visitor_limit', limit: 'attempts', max: 10 } }),
    );
    expect([errorKey(atCap), errorParams(atCap)]).toEqual(['error.visitor_limit.attempts', { status: 422, max: 10 }]);
    const answers = new ApiError('x', 422, { code: 'visitor_limit', limit: 'answers', max: 20000 });
    expect([errorKey(answers), errorParams(answers)]).toEqual(['error.visitor_limit.answers', { status: 422, max: 20000 }]);
    expect(errorKey(new ApiError('x', 422, { code: 'visitor_limit', limit: 'constructor', max: 1 }))).toBe('error.unknown');
    expect(errorKey(new ApiError('x', 422, { code: 'visitor_limit', limit: 5 }))).toBe('error.unknown');
    expect(errorKey(new ApiError('x', 422, { code: 'visitor_limit' }))).toBe('error.unknown');
    expect(errorParams(new ApiError('x', 422, { code: 'visitor_limit', limit: 'answers', max: 'many' as unknown as number }))).toEqual({ status: 422 });
  });
});

describe('signInFailureKey(): a sign-in that came back without one', () => {
  it('has one sentence for access_denied, true whoever ended it', () => {
    expect(signInFailureKey('access_denied')).toBe('signIn.notCompleted');
  });

  it('says the code for anything else — the code, never somebody’s sentence', () => {
    expect(signInFailureKey('state_mismatch')).toBe('signIn.failed');
    expect(signInFailureKey('')).toBe('signIn.failed');
    expect(signInFailureParams('state_mismatch')).toEqual({ code: 'state_mismatch' });
    expect(signInFailureParams('http_503')).toEqual({ code: 'http_503' });
    expect(signInFailureParams('Your account is locked. Call 0900 123 456')).toEqual({ code: 'unknown' });
    expect(signInFailureParams('')).toEqual({ code: 'unknown' });
  });
});

describe('DYNAMIC_KEYS: the keys put together at run time', () => {
  it('names the exam’s 15 sections, its two parts, the player’s four states and the five answer checks', () => {
    expect(DYNAMIC_KEYS['exam.section.']).toHaveLength(15);
    expect(new Set(DYNAMIC_KEYS['exam.section.']).size).toBe(15);
    expect(DYNAMIC_KEYS['exam.part.']).toEqual(['1', '2']);
    expect(DYNAMIC_KEYS['exam.play.']).toEqual(['tap', 'playing', 'again', 'unavailable']);
    expect(DYNAMIC_KEYS['answer.check.']).toEqual(['readingEmpty', 'readingUnfinished', 'readingInKanji', 'meaningNotEnglish', 'meaningEmpty']);
    expect(DYNAMIC_KEYS['error.visitor_limit.']).toEqual(['attempts', 'answers']);
    expect(Object.keys(DYNAMIC_KEYS).sort()).toEqual(['answer.check.', 'error.', 'error.visitor_limit.', 'exam.part.', 'exam.play.', 'exam.section.']);
  });
});
