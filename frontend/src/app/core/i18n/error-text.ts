import { TranslationParams } from '@anotoki/lib/translations';
import { ApiErrorBody } from '../api/api.types';

/**
 * What the app says when a request fails, in the reader's language.
 *
 * A learner is never shown the server's English sentence — nor the IAM's, nor
 * its SDK's. The server puts a code beside every sentence; the codes are
 * worded here. A page that knows better words its own refusal first (an item
 * already learned is no failure to a lesson) and falls back to this. Frames
 * take the answer as a whole sentence: "Could not save that: {reason}".
 *
 * The admin area is English and goes on showing the server's sentence
 * (staff_only, admin_only, not_found are its codes).
 *
 * The key comes from a table and never from the code itself: a code nobody
 * listed is `error.unknown`. The tails are also in dynamic-keys.ts. The one
 * code worded from more than itself is visitor_limit: which of a visitor's
 * limits (`limit`, checked against its closed set) and its number (`max`),
 * from the answer's body. The one code worded under another's key is
 * translations_unavailable, the anotoki library's answer of the words'
 * address while the database has none yet (an upload whose 004 has not
 * arrived): it is what not_up_to_date said there before, and its sentence
 * stays error.not_up_to_date's - a key a migration of before checks, so it
 * keeps its name.
 */
const BY_CODE = new Map<string, string>([
  // no answer at all
  ['offline', 'error.offline'],
  // the kanji trainer (backend/src/srs/kanji.php)
  ['no_such_item', 'error.no_such_item'],
  ['already_learned', 'error.already_learned'],
  ['kanji_first', 'error.kanji_first'],
  ['not_due', 'error.not_due'],
  ['not_learned', 'error.not_learned'],
  // the exam (exam_submit())
  ['seed_required', 'error.seed_required'],
  ['paper_mismatch', 'error.paper_mismatch'],
  // sign-in (auth_user())
  ['sign_in_required', 'error.sign_in_required'],
  ['invalid_token', 'error.invalid_token'],
  // studying without signing in (backend/src/visitors.php); visitor_limit is worded from its body (VISITOR_LIMITS)
  ['too_many_visitors', 'error.too_many_visitors'],
  ['visitor_unknown', 'error.visitor_unknown'],
  ['visitors_unavailable', 'error.visitors_unavailable'],
  ['visitor_move_retry', 'error.visitor_move_retry'],
  // your own data brought back (PUT /api/me/data, backend/src/me.php)
  ['too_large', 'error.too_large'],
  ['not_a_data_file', 'error.not_a_data_file'],
  ['several_people', 'error.several_people'],
  // the server itself
  ['database_unavailable', 'error.database_unavailable'],
  ['server_error', 'error.server_error'],
  ['not_up_to_date', 'error.not_up_to_date'],
  ['translations_unavailable', 'error.not_up_to_date'],
  ['not_set_up', 'error.not_set_up'],
  ['not_found', 'error.not_found'],
  ['method_not_allowed', 'error.method_not_allowed'],
]);

/** A visitor's limits, as visitor_limit names them in `limit`: each worded as error.visitor_limit.<limit>. */
const VISITOR_LIMITS: readonly string[] = ['attempts', 'answers'];

/**
 * What errorKey() reads of a failure: an ApiError has all three, and a
 * StartProblem of the kind `server` the first two. The body only for the
 * codes worded from more than themselves (visitor_limit).
 */
export interface Failure {
  status: number;
  code: string;
  body?: ApiErrorBody;
}

/**
 * The key for a failed request. `error.http` is for an answer that was not
 * the API's own (no code in it) and has a `{status}` — word it with
 * errorParams(), or the placeholder stays as written.
 */
export function errorKey(error: Failure): string {
  if (error.code === 'visitor_limit') {
    const limit = error.body?.limit;
    return typeof limit === 'string' && VISITOR_LIMITS.includes(limit) ? `error.visitor_limit.${limit}` : 'error.unknown';
  }
  const byCode = BY_CODE.get(error.code);
  if (byCode) {
    return byCode;
  }
  return error.status > 0 && error.code === `http_${error.status}` ? 'error.http' : 'error.unknown';
}

/** What errorKey()'s strings are filled with: `i18n.t(errorKey(error), errorParams(error))`. */
export function errorParams(error: Failure): TranslationParams {
  const max = error.body?.max;
  return typeof max === 'number' && Number.isFinite(max) ? { status: error.status, max } : { status: error.status };
}

/** An OAuth error code, or one of the SDK's own: a short word, nothing a sentence could hide in. */
const FAILURE_CODE = /^[A-Za-z0-9_.-]{1,40}$/;

/**
 * The key for a sign-in that came back without one. `access_denied` is the IAM
 * turning the account away, or the person going back from its page — one
 * sentence that is true either way. Anything else is `signIn.failed`, which
 * has a `{code}`: the code (signInFailureParams()), never the IAM's or the
 * SDK's own English sentence.
 */
export function signInFailureKey(code: string): string {
  return code === 'access_denied' ? 'signIn.notCompleted' : 'signIn.failed';
}

/** The `{code}` of `signIn.failed`: the code when it looks like one, `unknown` otherwise — it came through the address. */
export function signInFailureParams(code: string): TranslationParams {
  return { code: FAILURE_CODE.test(code) ? code : 'unknown' };
}
