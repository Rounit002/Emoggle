/*
 * Client address resolution for abuse controls.
 *
 * Lives in its own module so the hop-counting rules can be unit tested
 * without booting the signaling server. `index.js` is the only caller.
 */

const IPV4_PATTERN = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IPV6_PATTERN = /^[0-9a-f:]{2,45}$/i;

function cleanIp(ip) {
  if (!ip) return null;
  let s = typeof ip === "string" ? ip : String(ip);
  if (s.startsWith("::ffff:")) s = s.slice(7);
  if (s === "::1") return "127.0.0.1";
  return s;
}

function looksLikeIp(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 45) return false;
  if (IPV4_PATTERN.test(value)) return value.split(".").every((part) => Number(part) <= 255);
  return IPV6_PATTERN.test(value) && value.includes(":");
}

/**
 * Resolve the address a connection should be rate-limited against.
 *
 * `X-Forwarded-For` is append-only: each proxy tacks its view of the caller
 * onto the END of the list, so only the trailing entries were written by
 * infrastructure we control. Everything to the left of those arrived verbatim
 * from the client and is attacker-controlled — reading the leftmost entry
 * lets a flood mint a brand new "IP" on every handshake and never touch the
 * per-IP caps.
 *
 * So hops are counted from the right, exactly the way Express resolves
 * `req.ip` under `trust proxy`, falling back to the raw socket address when
 * the chain is shorter than the configured hop count or the entry landed on
 * is not a well-formed address.
 *
 * @param {object} args
 * @param {string|null} args.direct      Raw socket peer address.
 * @param {string|string[]|undefined} args.forwardedHeader Raw XFF header.
 * @param {number} args.trustProxyHops   Trusted proxies in front of us.
 * @returns {string} Address to key rate-limit state on.
 */
function resolveClientIp({ direct, forwardedHeader, trustProxyHops }) {
  const peer = cleanIp(direct);
  const hops = Number(trustProxyHops);
  if (!Number.isInteger(hops) || hops <= 0) return peer || "unknown";

  const raw = Array.isArray(forwardedHeader) ? forwardedHeader.join(",") : forwardedHeader;
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 1024) return peer || "unknown";

  // [nearest proxy, ...chain right-to-left]; index N is N trusted hops out.
  const chain = [peer, ...raw.split(",").map((entry) => cleanIp(entry.trim())).reverse()];
  const candidate = chain[Math.min(hops, chain.length - 1)];
  return looksLikeIp(candidate) ? candidate : peer || "unknown";
}

module.exports = { cleanIp, looksLikeIp, resolveClientIp };
