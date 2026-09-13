const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { isInappropriateName } = require("../nameModeration");

test("rejects profanity, sexual content, hate, and disguised abuse", () => {
  for (const name of ["fuckyou", "bitch", "pornstar", "blowjob", "nigger", "faggot", "heil hitler", "kill yourself", "chutiya", "f.u.c.k", "f u c k", "fück", "ＦＵＣＫ", "f\u200buck", "fuuuck", "sh1t", "a$$hole", "s e x", "nudes99"]) {
    assert.equal(isInappropriateName(name), true, name);
  }
});

test("preserves ordinary names, international scripts, and harmless substrings", () => {
  for (const name of ["Sarah", "Cassidy", "Scunthorpe", "Dick", "Cockburn", "Sussex", "Titus", "Nikhil", "José", "O'Connor", "Anne-Marie", "Player42", "王小明", "आरव"]) {
    assert.equal(isInappropriateName(name), false, name);
  }
});

test("rejects racist slurs with repeated letters, digits, Unicode lookalikes and separators", () => {
  for (const name of ["niiggeer", "n1gg3r", "n!gg@", "nіgger", "nιgga", "ni99er", "ni66a", "n.i.g.g.e.r", "ＮＩＧＧＥＲ", "n\u200bi\u200bgger", "wetback", "raghead", "towelhead"]) {
    assert.equal(isInappropriateName(name), true, name);
  }
});

test("browser and server policies stay identical", (t) => {
  const browser = path.join(__dirname, "../../frontend/app/lib/nameModeration.js");
  if (!fs.existsSync(browser)) return t.skip("Standalone server deployment");
  assert.equal(fs.readFileSync(browser, "utf8"), fs.readFileSync(path.join(__dirname, "../nameModeration.js"), "utf8"));
});
