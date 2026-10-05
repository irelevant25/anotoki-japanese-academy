<?php
/**
 * Which address a request comes from, for the limits that count new visitors
 * per address (src/visitors.php) - and what one address is. Never who
 * anybody is.
 *
 * REMOTE_ADDR, unless the connection comes from a proxy this site trusts
 * (app.local.php: 'client_address' => ['trusted_proxies' => [CIDR, …]]):
 * then the address in its header ('client_ip_header', CF-Connecting-IP
 * unless it says otherwise), when that is an address at all. A forwarding
 * header is one the caller writes, so believed from anybody it would let them
 * pick a new address for every request and walk past every limit:
 * X-Forwarded-For is never read on its own. A site behind Cloudflare's proxy
 * lists Cloudflare's ranges there (docs/kb/hosting.md).
 *
 * The header should be one the proxy writes whole (Cloudflare's
 * CF-Connecting-IP: one address). A list such as X-Forwarded-For, which a
 * proxy appends to, starts with whatever the visitor wrote: it is read from
 * the right, the trusted proxies' own addresses skipped, and the first
 * address no trusted proxy has is the one counted.
 *
 * One address, for counting: an IPv4 address as it is, an IPv6 address by
 * its /64 - one household or one server is handed a whole /64 and picks from
 * it at will, so counting single IPv6 addresses would count nothing. An IPv4
 * address written as IPv6 (::ffff:198.51.100.7) is that IPv4 address.
 *
 * The anotoki build analyzer decides the same way (its
 * src/Web/ClientAddress.php), and the IAM too.
 */

declare(strict_types=1);

/** The address of this request ($server is $_SERVER or a request's server params); '?' when there is none. */
function client_address(array $server): string
{
    $ip = (string) ($server['REMOTE_ADDR'] ?? '');
    $proxies = config('app.client_address.trusted_proxies');
    $proxies = is_array($proxies) ? $proxies : [];
    if ($ip !== '' && $proxies && client_address_in_ranges($ip, $proxies)) {
        $header = config('app.client_address.client_ip_header');
        $header = is_string($header) && $header !== '' ? $header : 'CF-Connecting-IP';
        $key = 'HTTP_' . strtoupper(str_replace('-', '_', $header));
        $forwarded = client_address_rightmost_untrusted((string) ($server[$key] ?? ''), $proxies);
        if ($forwarded !== null) {
            $ip = $forwarded;
        }
    }
    return $ip === '' ? '?' : substr($ip, 0, 45);
}

/** What the limits count: the address, or for IPv6 its /64 ("2001:db8:1:2::/64"). */
function client_address_counted(array $server): string
{
    return client_address_bucket(client_address($server));
}

/**
 * The address a proxy's header names: read from the right, past the trusted
 * proxies' own addresses; null when the first other entry is no address at
 * all, or there is none.
 */
function client_address_rightmost_untrusted(string $header, array $proxies): ?string
{
    foreach (array_reverse(explode(',', $header)) as $entry) {
        $entry = trim($entry);
        if (filter_var($entry, FILTER_VALIDATE_IP) === false) {
            return null;
        }
        if (!client_address_in_ranges($entry, $proxies)) {
            return $entry;
        }
    }
    return null;
}

/** One address as the limits count it: IPv4 as it is, IPv4-mapped IPv6 as IPv4, other IPv6 by its /64. */
function client_address_bucket(string $ip): string
{
    $packed = @inet_pton($ip);
    if ($packed === false) {
        return $ip;
    }
    if (strlen($packed) === 4) {
        return (string) inet_ntop($packed);
    }
    if (substr($packed, 0, 12) === str_repeat("\0", 10) . "\xff\xff") {
        return (string) inet_ntop(substr($packed, 12));
    }
    return inet_ntop(substr($packed, 0, 8) . str_repeat("\0", 8)) . '/64';
}

/** Is an address (v4 or v6) inside one of these CIDR ranges? A bare address is a range of one. */
function client_address_in_ranges(string $ip, array $ranges): bool
{
    $address = @inet_pton($ip);
    if ($address === false) {
        return false;
    }
    foreach ($ranges as $range) {
        $parts = explode('/', (string) $range, 2);
        $network = @inet_pton(trim($parts[0]));
        if ($network === false || strlen($network) !== strlen($address)) {
            continue;
        }
        $all = strlen($address) * 8;
        $bits = isset($parts[1]) ? max(0, min($all, (int) $parts[1])) : $all;
        $whole = intdiv($bits, 8);
        $rest = $bits % 8;
        if (substr($address, 0, $whole) !== substr($network, 0, $whole)) {
            continue;
        }
        if ($rest === 0) {
            return true;
        }
        $mask = (0xFF << (8 - $rest)) & 0xFF;
        if ((ord($address[$whole]) & $mask) === (ord($network[$whole]) & $mask)) {
            return true;
        }
    }
    return false;
}
