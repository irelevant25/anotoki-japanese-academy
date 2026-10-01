import { TranslationParams } from './translation.service';

/**
 * What the app says when a request fails, in the reader's language.
 *
 * A learner is never shown the server's English sentence — nor the IAM's, nor
 * its SDK's. The server puts a code beside every sentence; the codes are
 * worded here. A page that knows better words its own refusal first (an item
 * already learned is no failure to a lesson) and falls back to this. Frames
 * take the answer as a whole sentence: "Could not save that: {reason}".
 *
 * The two owner pages are English and go on showing the server's sentence.
 *
 * The key comes from a table and never from the code itself: a code nobody
 * listed is `error.unknown`. The tails are also in dynamic-keys.ts.
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
  ['no_access', 'error.no_access'],
  ['this_computer_only', 'error.this_computer_only'],
  // the server itself
  ['database_unavailable', 'error.database_unavailable'],
  ['server_error', 'error.server_error'],
  ['not_up_to_date', 'error.not_up_to_date'],
  ['not_set_up', 'error.not_set_up'],
  ['not_found', 'error.not_found'],
  ['method_not_allowed', 'error.method_not_allowed'],
]);

/** What errorKey() reads of a failure: an ApiError has both, and so does a StartProblem of the kind `server`. */
export interface Failure {
  status: number;
  code: string;
}

/**
 * The key for a failed request. `error.http` is for an answer that was not
 * the API's own (no code in it) and has a `{status}` — word it with
 * errorParams(), or the placeholder stays as written.
 */
export function errorKey(error: Failure): string {
  const byCode = BY_CODE.get(error.code);
  if (byCode) {
    return byCode;
  }
  return error.status > 0 && error.code === `http_${error.status}` ? 'error.http' : 'error.unknown';
}

/** What errorKey()'s strings are filled with: `i18n.t(errorKey(error), errorParams(error))`. */
export function errorParams(error: Failure): TranslationParams {
  return { status: error.status };
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
