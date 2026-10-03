const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
test("production database URL cannot downgrade verified TLS", () => {
  const script = `const {pool}=require('./db'); const {Client}=require('pg'); const ssl=new Client(pool.options).connectionParameters.ssl; console.log(JSON.stringify({verified:ssl.rejectUnauthorized,override:pool.options.connectionString.includes('sslmode')})); pool.end();`;
  const result = JSON.parse(execFileSync(process.execPath, ["-e", script], {
    cwd: path.join(__dirname, ".."),
    env: { ...process.env, NODE_ENV: "production", DATABASE_URL: "postgresql://user:password@localhost:5432/disposable?sslmode=no-verify", DB_CA_CERT: "" },
    encoding: "utf8",
  }));
  assert.equal(result.verified, true);
  assert.equal(result.override, false);
});
