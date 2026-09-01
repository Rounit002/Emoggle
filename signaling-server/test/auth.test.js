const assert = require("node:assert/strict");
const test = require("node:test");

const {
  SESSION_COOKIE_NAME,
  extractBearerToken,
  extractRequestToken,
  extractSessionResumeToken,
  hashSessionToken,
  normalizeSessionToken,
  parseCookieToken,
} = require("../middleware/verifyToken");

const TOKEN = "a".repeat(64);

test("accepts only a correctly shaped bearer token", () => {
  assert.equal(extractBearerToken(`Bearer ${TOKEN}`), TOKEN);
  assert.equal(extractBearerToken(`Basic ${TOKEN}`), null);
  assert.equal(extractBearerToken("Bearer short"), null);
});

test("parses and validates the session cookie", () => {
  assert.equal(parseCookieToken(`theme=dark; ${SESSION_COOKIE_NAME}=${TOKEN}`), TOKEN);
  assert.equal(parseCookieToken(`${SESSION_COOKIE_NAME}=not-a-token`), null);
  assert.equal(parseCookieToken(`${SESSION_COOKIE_NAME}=%E0%A4%A`), null);
});

test("authorization header takes precedence over a cookie", () => {
  const otherToken = "b".repeat(64);
  assert.equal(
    extractRequestToken({
      headers: { authorization: `Bearer ${TOKEN}` },
      cookies: { [SESSION_COOKIE_NAME]: otherToken },
    }),
    TOKEN,
  );
});

test("session bootstrap does not resume from an origin-wide cookie", () => {
  const otherToken = "b".repeat(64);
  assert.equal(
    extractSessionResumeToken({
      headers: {},
      cookies: { [SESSION_COOKIE_NAME]: otherToken },
    }),
    null,
  );
  assert.equal(
    extractSessionResumeToken({
      headers: { authorization: `Bearer ${TOKEN}` },
      cookies: { [SESSION_COOKIE_NAME]: otherToken },
    }),
    TOKEN,
  );
});

test("rejects malformed cookie-parser values", () => {
  assert.equal(normalizeSessionToken("x".repeat(64)), null);
  assert.equal(
    extractRequestToken({ headers: {}, cookies: { [SESSION_COOKIE_NAME]: "invalid" } }),
    null,
  );
});

test("stores a deterministic hash rather than the raw bearer token", () => {
  const digest = hashSessionToken(TOKEN);
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.notEqual(digest, TOKEN);
  assert.equal(digest, hashSessionToken(TOKEN));
});
