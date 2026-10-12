<?php
/**
 * Which address a request comes from, for the limits that count new visitors
 * per address (src/visitors.php) - and what one address is. Never who
 * anybody is.
 *
 * The anotoki family's one rule (the owner's of 2026-10-11; anotoki-lib
 * 0.5's Support\ClientAddress, which reads it here too): REMOTE_ADDR,
 * unless the connection comes from one of the proxies this site trusts - and
 * then the one address in Cloudflare's CF-Connecting-IP, when it is an
 * address at all. The site is behind Cloudflare, so the trusted proxies are
 * Cloudflare's published ranges (CLIENT_ADDRESS_DEFAULTS, config/config.php:
 * the committed default); app.local.php may name others ('client_address' =>
 * ['trusted_proxies' => [CIDR, …]]) - a list there takes the default's place
 * whole, [] believes nobody (a copy that is not behind Cloudflare,
 * docs/kb/hosting.md). The header is pinned here, never a setting: CF-Connecting-IP
 * is the one Cloudflare writes over whatever the visitor sent, while it passes
 * X-Real-IP, True-Client-IP and the head of X-Forwarded-For on as the visitor
 * wrote them - a setting that pointed at one of those would let anybody pick
 * a new address for every request and walk past every limit. A header from
 * anybody else is never believed, and a header that names more than one
 * address (a list a proxy appends to) names none - the proxy's own address
 * counts then. A trusted range so wide it is no proxy's (an IPv4 prefix
 * shorter than /8, an IPv6 one shorter than /16 - 0.0.0.0/0, ::/0: everybody),
 * or one that is no range at all, is refused, never believed.
 *
 * One address, for counting: an IPv4 address as it is, an IPv6 address by
 * its /64 - one household or one server is handed a whole /64 and picks from
 * it at will, so counting single IPv6 addresses would count nothing. An IPv4
 * address written as IPv6 (::ffff:198.51.100.7) is that IPv4 address.
 *
 * Never kept as it is: a visitor's row keeps a keyed HMAC of what the limits
 * count (visitors_address_hash()) - a stable pseudonym of the address bucket
 * for as long as its key lasts, which whoever holds the key can test an
 * address against, but no address in the database or a backup of it. The
 * library's admin tools - the feedback form's limits, the error log's client
 * hash - read the address by the same rule (academy_admin_context(),
 * src/admin.php) and keep a keyed HMAC of it too.
 */

declare(strict_types=1);

use Anotoki\Lib\Support\ClientAddress;
use Psr\Http\Message\ServerRequestInterface as Request;

/** The widest range a trusted proxy may be named by: an IPv4 prefix of /8, an IPv6 one of /16 - anything wider is no proxy's. */
const CLIENT_ADDRESS_WIDEST_IPV4 = 8;
const CLIENT_ADDRESS_WIDEST_IPV6 = 16;

/**
 * The proxies whose CF-Connecting-IP names a request's address:
 * app.local.php's client_address.trusted_proxies when it is a list ([]
 * believes nobody), else the committed default, Cloudflare's published
 * ranges. A range of that list that is no proxy's (client_address_range_ok())
 * is left out - refused, never believed - and said in PHP's error log, once
 * for every request that reads the list (loud until the setting is fixed).
 *
 * @return list<string>
 */
function client_address_trusted_proxies(): array
{
    $configured = client_address_setting('trusted_proxies');
    if (!is_array($configured)) {
        return CLIENT_ADDRESS_DEFAULTS['trusted_proxies'];
    }
    static $said = [];
    $trusted = [];
    foreach ($configured as $range) {
        if (client_address_range_ok($range)) {
            $trusted[] = trim($range);
            continue;
        }
        $shown = is_scalar($range) ? auth_log_text((string) $range) : gettype($range);
        if (!isset($said[$shown])) {
            $said[$shown] = true;
            error_log("[client_address] a trusted proxy in app.local.php refused, never believed (no range, or wider than /8 for IPv4, /16 for IPv6): $shown");
        }
    }
    return $trusted;
}

/**
 * Whether $range names a proxy: one address, or a CIDR range no wider than
 * /8 for IPv4 and /16 for IPv6. A catch-all (0.0.0.0/0, ::/0, 10.0.0.0/7 …)
 * would believe anybody's header; anything that is no address or no prefix
 * of its length is nothing.
 *
 * @param mixed $range
 */
function client_address_range_ok($range): bool
{
    if (!is_string($range)) {
        return false;
    }
    $parts = explode('/', trim($range), 2);
    $packed = @inet_pton($parts[0]);
    if ($packed === false) {
        return false;
    }
    $length = strlen($packed) * 8;
    if (!isset($parts[1])) {
        return true; // one address
    }
    if (!ctype_digit($parts[1]) || (int) $parts[1] > $length) {
        return false;
    }
    return (int) $parts[1] >= ($length === 32 ? CLIENT_ADDRESS_WIDEST_IPV4 : CLIENT_ADDRESS_WIDEST_IPV6);
}

/**
 * One of app.local.php's client_address settings, or null. Settings that
 * cannot be read at all (config_all() refuses a test's folder of settings
 * that names a real database) are none: the defaults hold, and the site's
 * gate says what is wrong (config_problem()) - the admin tools' context,
 * which asks while the app is built, never stops it.
 *
 * @return mixed
 */
function client_address_setting(string $name)
{
    try {
        return config("app.client_address.$name");
    } catch (RuntimeException $e) {
        return null;
    }
}

/** The address of this request (the library's rule over this site's proxies, Cloudflare's header pinned); '?' when there is none. */
function client_address(Request $request): string
{
    return ClientAddress::of($request, client_address_trusted_proxies(), ClientAddress::CLOUDFLARE_HEADER) ?? '?';
}

/** What the limits count: the address's bucket - the address, or for IPv6 its /64 ("2001:db8:1:2::/64") - in memory, never kept. */
function client_address_counted(Request $request): string
{
    $address = client_address($request);
    return $address === '?' ? $address : ClientAddress::bucket($address);
}
