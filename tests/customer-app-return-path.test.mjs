import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(
  new URL("../lib/customerAppReturnPath.ts", import.meta.url),
  "utf8"
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

const exports = {};
vm.runInNewContext(compiled, { exports, String });

test("keeps reservation deep links inside the customer app", () => {
  assert.equal(
    exports.getSafeCustomerAppReturnPath(
      "/customer-app/reservations/reservation-1"
    ),
    "/customer-app/reservations/reservation-1"
  );
  assert.equal(
    exports.getSafeCustomerAppReturnPath("/customer-app"),
    "/customer-app"
  );
});

test("rejects external and lookalike return paths", () => {
  for (const value of [
    "https://attacker.example/customer-app",
    "//attacker.example/customer-app",
    "/customer-application",
    "/customer-app\\attacker.example",
    "/login",
    "",
    null,
  ]) {
    assert.equal(
      exports.getSafeCustomerAppReturnPath(value),
      "/customer-app"
    );
  }
});
