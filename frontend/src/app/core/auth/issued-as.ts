import { HttpContext, HttpContextToken } from '@angular/common/http';
import type { Caller } from './auth.service';

/** The header a visitor's key travels in, both ways (core/auth/visitor-key.ts). */
export const VISITOR_KEY_HEADER = 'X-Visitor-Key';

/**
 * Whom a request of this site's own API is for, when its maker says so
 * (ApiService: the data file's, the admin panel's and the move's are always a
 * person's). A request that does not say is decided by authInterceptor as it
 * is handed over — which, for HttpClient, is the moment it is issued — from
 * what the page is shown as (AuthService.caller()), never from whether a token
 * happens to be there when it leaves.
 */
export const ISSUED_AS = new HttpContextToken<Caller | null>(() => null);

/**
 * The one request that carries the person's token and the visitor's key
 * together: the move after a sign-in (POST /api/visitor/move). The interceptor
 * then adds the token and leaves the key the request set itself; on any other
 * person's request a key is taken off.
 */
export const CARRIES_VISITOR_KEY = new HttpContextToken<boolean>(() => false);

/** A request's context saying whom it is for. */
export function issuedAs(caller: Caller): HttpContext {
  return new HttpContext().set(ISSUED_AS, caller);
}
