import assert from "node:assert/strict";
import { getName, setName, validateName } from "../app/lib/storage";

const values = new Map<string, string>();
Object.assign(globalThis, { window: { localStorage: {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
  removeItem: (key: string) => values.delete(key),
} } });
assert.equal(setName(" Sarah "), "Sarah");
assert.equal(setName("f.u.c.k"), null);
assert.equal(getName(), "Sarah");
values.set("emoggle_user_name", "pornstar");
assert.equal(getName(), null, "Previously saved prohibited names must be revalidated");
assert.equal(values.has("emoggle_user_name"), false);
for (const name of ["n1gg3r", "niiggeer", "nіgger", "ni99er"]) {
  assert.equal(setName(name), null);
  assert.equal(values.has("emoggle_user_name"), false);
}
for (const name of ["", "a".repeat(21), "a\nb", "kill yourself"]) {
  assert.equal(validateName(name), null);
}
assert.equal(validateName("Cassidy"), "Cassidy");
console.log("Display name storage checks passed.");
