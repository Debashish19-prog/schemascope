import dns from "node:dns/promises";
import net from "node:net";

// Public mode is for deploying the viewer for other people. By default it only
// listens on this computer, where reaching a database on localhost is the point.
export const PUBLIC_MODE = process.env.PUBLIC_MODE === "true";

const blocked = new net.BlockList();
for (const [ip, bits] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16], // includes cloud metadata services
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
]) {
  blocked.addSubnet(ip, bits, "ipv4");
}
blocked.addAddress("::1", "ipv6");
blocked.addSubnet("fc00::", 7, "ipv6");
blocked.addSubnet("fe80::", 10, "ipv6");

/** In public mode, refuses hosts that resolve to private addresses (SSRF protection). */
export async function assertHostAllowed(host) {
  if (!PUBLIC_MODE) return;
  const addresses = await dns.lookup(host, { all: true });
  for (const { address, family } of addresses) {
    const plain = address.replace(/^::ffff:/i, "");
    const type = family === 6 && plain === address ? "ipv6" : "ipv4";
    if (blocked.check(plain, type)) {
      const err = new Error("This host is on a private network and can't be reached from here.");
      err.code = "VIEWER_PRIVATE_HOST";
      throw err;
    }
  }
}

const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 20;

/** Limits connection attempts per client, so the form can't be used to guess passwords or scan ports. */
export function allowAttempt(ip) {
  const now = Date.now();
  const recent = (attempts.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  attempts.set(ip, recent);
  return recent.length <= MAX_ATTEMPTS;
}

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Blocks DNS-rebinding and cross-site requests against a viewer running on this computer. */
export function guardRequests(req, res, next) {
  if (!PUBLIC_MODE) {
    const hostname = (req.headers.host ?? "").replace(/:\d+$/, "");
    if (!LOCAL_HOSTNAMES.has(hostname)) return res.status(403).json({ error: "Forbidden" });
  }
  if (req.method !== "GET" && req.headers.origin) {
    let originHost = "";
    try {
      originHost = new URL(req.headers.origin).host;
    } catch {
      /* treated as a mismatch below */
    }
    const devProxy = !PUBLIC_MODE && LOCAL_HOSTNAMES.has(originHost.replace(/:\d+$/, ""));
    if (originHost !== req.headers.host && !devProxy) return res.status(403).json({ error: "Forbidden" });
  }
  next();
}

export function securityHeaders(_req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  );
  next();
}

/** Turns driver errors into messages that help without echoing connection details. */
export function friendlyError(err) {
  switch (err?.code) {
    case "VIEWER_PRIVATE_HOST":
      return err.message;
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return "Couldn't find that host. Check the spelling.";
    case "ECONNREFUSED":
      return "The host refused the connection. Check the port and that MySQL is running.";
    case "ETIMEDOUT":
    case "PROTOCOL_CONNECTION_LOST":
    case "ECONNRESET":
      return "The connection timed out or dropped. Check the host, the port and any firewall rules.";
    case "ER_ACCESS_DENIED_ERROR":
    case "ER_NOT_SUPPORTED_AUTH_MODE":
      return "MySQL rejected that username or password.";
    case "ER_DBACCESS_DENIED_ERROR":
      return "This user doesn't have access to that database.";
    case "ER_BAD_DB_ERROR":
      return "That database doesn't exist on this server.";
    case "ER_SECURE_TRANSPORT_REQUIRED":
    case "HANDSHAKE_NO_SSL_SUPPORT":
      return "TLS settings don't match this server. Try switching the Use TLS option.";
    default:
      if (/certificate|self.signed|SSL|TLS/i.test(`${err?.code} ${err?.message}`)) {
        return "The server's TLS certificate couldn't be verified. Paste the provider's CA certificate.";
      }
      return "Couldn't connect to that database.";
  }
}
