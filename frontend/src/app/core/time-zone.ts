/**
 * The reader's own time zone, as the browser names it: an IANA name
 * ("Europe/Bratislava", "Asia/Tokyo"), or null when the browser gives none.
 *
 * The server counts each person's days and review hours in it: it comes with
 * every request to this site's /api/ and /report/ as `X-Time-Zone`
 * (TIME_ZONE_HEADER: the auth interceptor, AuthService.fetch(), and the two
 * plain reads, the sign-in's settings and the app's words), never to anybody
 * else. The server takes an exact IANA name that both PHP and ICU know
 * (time_zone_known() in backend/src/util.php) and ignores anything else, falling back to the zone it kept for the person, else UTC
 * (docs/kb/kanji-srs.md). The pages never count days themselves: what is
 * "today", which day a review falls on, comes in the server's answers.
 */
export function browserTimeZone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof zone === 'string' && zone !== '' ? zone : null;
  } catch {
    return null;
  }
}

/** The request header the server reads the zone from (backend/src/auth.php, auth_time_zone_header()). */
export const TIME_ZONE_HEADER = 'X-Time-Zone';
