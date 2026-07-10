import IPAddr from "ipaddr.js";
import { config } from "../config";

const METADATA_HOSTS = new Set(["metadata.google.internal", "metadata"]);

function shouldAllowLocal(): boolean {
  return (
    config.ALLOW_LOCAL_WEBHOOKS === true &&
    config.TEST_SUITE_SELF_HOSTED === true
  );
}

function ipv4FromParts(parts: number[]): string {
  return [
    (parts[0] >> 8) & 255,
    parts[0] & 255,
    (parts[1] >> 8) & 255,
    parts[1] & 255,
  ].join(".");
}

function embeddedIpv4FromNat64(parts: number[]): string {
  return [
    (parts[6] >> 8) & 255,
    parts[6] & 255,
    (parts[7] >> 8) & 255,
    parts[7] & 255,
  ].join(".");
}

function isUnsafeIpLiteral(hostname: string): boolean {
  if (!IPAddr.isValid(hostname)) return false;
  const addr = IPAddr.parse(hostname);

  if (addr.kind() === "ipv6") {
    const ipv6 = addr as IPAddr.IPv6;
    if (ipv6.isIPv4MappedAddress()) {
      return isUnsafeIpLiteral(ipv6.toIPv4Address().toString());
    }

    const parts = ipv6.parts;
    // 6to4 embeds an IPv4 address in 2002:V4ADDR::/48.
    if (parts[0] === 0x2002) {
      return isUnsafeIpLiteral(ipv4FromParts([parts[1], parts[2]]));
    }

    // Well-known NAT64 prefix 64:ff9b::/96 embeds IPv4 in the last 32 bits.
    if (
      parts[0] === 0x0064 &&
      parts[1] === 0xff9b &&
      parts[2] === 0 &&
      parts[3] === 0 &&
      parts[4] === 0 &&
      parts[5] === 0
    ) {
      return isUnsafeIpLiteral(embeddedIpv4FromNat64(parts));
    }
  }

  return addr.range() !== "unicast";
}

export function assertPublicHttpUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Invalid URL");
  }

  if (parsed.username || parsed.password) {
    throw new Error("Invalid URL. Credentials are not allowed.");
  }

  const hostname = parsed.hostname
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "")
    .toLowerCase();
  if (!shouldAllowLocal()) {
    if (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      METADATA_HOSTS.has(hostname) ||
      isUnsafeIpLiteral(hostname)
    ) {
      throw new Error(
        "Invalid URL. Private, reserved, or metadata addresses are not allowed.",
      );
    }
  }

  return url;
}
