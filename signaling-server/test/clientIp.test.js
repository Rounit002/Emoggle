const test = require("node:test");
const assert = require("node:assert/strict");
const { looksLikeIp, resolveClientIp } = require("../clientIp");

test("untrusted deployments ignore the forwarded header entirely", () => {
  assert.equal(
    resolveClientIp({
      direct: "203.0.113.9",
      forwardedHeader: "198.51.100.1",
      trustProxyHops: 0,
    }),
    "203.0.113.9",
  );
});

test("a single trusted proxy uses the entry that proxy appended", () => {
  assert.equal(
    resolveClientIp({
      direct: "10.0.0.1",
      forwardedHeader: "203.0.113.9",
      trustProxyHops: 1,
    }),
    "203.0.113.9",
  );
});

test("a spoofed left-hand entry cannot displace the real client address", () => {
  // The attacker sends `X-Forwarded-For: 1.2.3.4`; the proxy appends the
  // address it actually saw. Reading left-to-right would hand the flood a
  // fresh rate-limit bucket on every connection.
  assert.equal(
    resolveClientIp({
      direct: "10.0.0.1",
      forwardedHeader: "1.2.3.4, 203.0.113.9",
      trustProxyHops: 1,
    }),
    "203.0.113.9",
  );
});

test("every spoofed value in a long chain resolves to the same bucket", () => {
  const buckets = new Set(
    ["9.9.9.9", "8.8.8.8", "7.7.7.7"].map((spoofed) =>
      resolveClientIp({
        direct: "10.0.0.1",
        forwardedHeader: `${spoofed}, 203.0.113.9`,
        trustProxyHops: 1,
      }),
    ),
  );
  assert.deepEqual([...buckets], ["203.0.113.9"]);
});

test("two trusted proxies step one entry further left", () => {
  assert.equal(
    resolveClientIp({
      direct: "10.0.0.1",
      forwardedHeader: "203.0.113.9, 172.16.0.5",
      trustProxyHops: 2,
    }),
    "203.0.113.9",
  );
});

test("a chain shorter than the hop count falls back to the leftmost entry", () => {
  assert.equal(
    resolveClientIp({
      direct: "10.0.0.1",
      forwardedHeader: "203.0.113.9",
      trustProxyHops: 5,
    }),
    "203.0.113.9",
  );
});

test("a missing forwarded header falls back to the socket peer", () => {
  assert.equal(
    resolveClientIp({ direct: "203.0.113.9", forwardedHeader: undefined, trustProxyHops: 1 }),
    "203.0.113.9",
  );
});

test("a malformed hop is rejected in favour of the socket peer", () => {
  assert.equal(
    resolveClientIp({
      direct: "203.0.113.9",
      forwardedHeader: "not-an-address",
      trustProxyHops: 1,
    }),
    "203.0.113.9",
  );
});

test("an oversized header is discarded rather than parsed", () => {
  assert.equal(
    resolveClientIp({
      direct: "203.0.113.9",
      forwardedHeader: new Array(400).fill("1.2.3.4").join(","),
      trustProxyHops: 1,
    }),
    "203.0.113.9",
  );
});

test("duplicate headers arriving as an array are joined, not indexed", () => {
  assert.equal(
    resolveClientIp({
      direct: "10.0.0.1",
      forwardedHeader: ["1.2.3.4", "203.0.113.9"],
      trustProxyHops: 1,
    }),
    "203.0.113.9",
  );
});

test("IPv4-mapped IPv6 peers normalise to their IPv4 form", () => {
  assert.equal(
    resolveClientIp({ direct: "::ffff:203.0.113.9", forwardedHeader: undefined, trustProxyHops: 0 }),
    "203.0.113.9",
  );
});

test("IPv6 forwarded entries are accepted", () => {
  assert.equal(
    resolveClientIp({
      direct: "10.0.0.1",
      forwardedHeader: "2001:db8::1",
      trustProxyHops: 1,
    }),
    "2001:db8::1",
  );
});

test("looksLikeIp rejects out-of-range octets and non-addresses", () => {
  assert.equal(looksLikeIp("999.1.1.1"), false);
  assert.equal(looksLikeIp("evil"), false);
  assert.equal(looksLikeIp(""), false);
  assert.equal(looksLikeIp("203.0.113.9"), true);
});
