// SSRF protection. Resolves a hostname and rejects any address in a private,
// loopback, link-local, multicast, metadata, or reserved range. Re-checked after
// every redirect by safe-fetch.

import dns from 'node:dns/promises';
import net from 'node:net';

export function isPrivateIp(ip) {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  if (net.isIPv6(ip)) return isPrivateIPv6(ip);
  return true; // unknown -> treat as unsafe
}

function isPrivateIPv4(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  if (a === 0) return true;                       // 0.0.0.0/8
  if (a === 10) return true;                      // 10/8
  if (a === 127) return true;                     // loopback
  if (a === 169 && b === 254) return true;        // link-local + metadata (169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true;        // 192.168/16
  if (a === 192 && b === 0) return true;          // 192.0.0/24, 192.0.2/24
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a >= 224) return true;                      // multicast + reserved
  return false;
}

function isPrivateIPv6(ip) {
  const lower = ip.toLowerCase();
  if (lower === '::1') return true;               // loopback
  if (lower === '::') return true;
  if (lower.startsWith('fe80')) return true;      // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local
  if (lower.startsWith('ff')) return true;        // multicast
  // IPv4-mapped IPv6 (::ffff:a.b.c.d)
  const m = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (m) return isPrivateIPv4(m[1]);
  return false;
}

// Resolve a hostname to addresses and ensure ALL are public. Returns the list of
// resolved IPs, or throws when any is private/unsafe.
export async function assertPublicHost(hostname) {
  // Literal IPs are checked directly.
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error(`blocked private address: ${hostname}`);
    return [hostname];
  }
  const records = await dns.lookup(hostname, { all: true });
  if (!records.length) throw new Error(`could not resolve ${hostname}`);
  for (const r of records) {
    if (isPrivateIp(r.address)) throw new Error(`blocked private address for ${hostname}: ${r.address}`);
  }
  return records.map((r) => r.address);
}
