import { ApiError } from '../core/api/api.service';

/**
 * Why a call of the owner pages failed, as a sentence: the server's own
 * (they are English, as these pages are), with a capital and a full stop —
 * "the server does not answer" comes without either.
 */
export function reason(error: ApiError): string {
  const text = error.message.trim() || 'Something went wrong.';
  const sentence = text[0].toUpperCase() + text.slice(1);
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

/**
 * A save the server did not take from this person: signed out (401), or not
 * the owner here (403). What was typed is kept all the same — said, so nobody
 * types it again.
 */
export function refusedPerson(error: ApiError): boolean {
  return error.status === 401 || error.status === 403;
}
