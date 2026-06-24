import { lookup } from "node:dns/promises";

/**
 * Validates an outbound URL to prevent SSRF:
 *  - HTTPS only
 *  - Rejects private/loopback/link-local/reserved IP ranges
 *  - Resolves hostname and re-checks the resolved IP (anti DNS-rebinding)
 */
export async function assertSafePublicUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("URL inválida");
  }
  if (url.protocol !== "https:") {
    throw new Error("Solo se permiten URLs https://");
  }
  const host = url.hostname;
  if (!host) throw new Error("URL sin host");

  // Reject literal IPs that are obviously unsafe before DNS lookup.
  if (isIpLiteral(host)) {
    if (isBlockedIp(host)) throw new Error("Destino no permitido (IP privada/reservada)");
  }

  // Resolve and re-check (DNS rebinding protection).
  try {
    const records = await lookup(host, { all: true });
    for (const r of records) {
      if (isBlockedIp(r.address)) {
        throw new Error("Destino no permitido (IP privada/reservada)");
      }
    }
  } catch (e) {
    // If DNS fails with our own error, rethrow; otherwise wrap.
    if (e instanceof Error && e.message.startsWith("Destino no permitido")) throw e;
    throw new Error("No se pudo resolver el host de destino");
  }

  return url;
}

function isIpLiteral(host: string): boolean {
  return /^[0-9.]+$/.test(host) || host.includes(":");
}

function isBlockedIp(ip: string): boolean {
  // IPv6
  if (ip.includes(":")) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    if (lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) return true;
    // IPv4-mapped IPv6 ::ffff:a.b.c.d
    const m = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (m) return isBlockedIpv4(m[1]);
    return false;
  }
  return isBlockedIpv4(ip);
}

function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split(".").map((n) => Number(n));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true; // malformed -> block
  }
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast / reserved
  return false;
}
