const test = require("node:test");
const assert = require("node:assert/strict");
const { supportAmountInCents } = require("../supportAmount");

test("converts valid USD contributions to cents", () => {
  assert.equal(supportAmountInCents("1"), 100);
  assert.equal(supportAmountInCents("1.01"), 101);
  assert.equal(supportAmountInCents("25.5"), 2550);
});

test("rejects sub-dollar, malformed, and unsafe amounts", () => {
  for (const amount of ["0.99", "0", "1.001", "-1", "1e3", "1,000", "", 2, "999999999999999999"]) {
    assert.equal(supportAmountInCents(amount), null, String(amount));
  }
});
