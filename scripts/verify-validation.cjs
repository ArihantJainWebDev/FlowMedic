/* eslint-disable @typescript-eslint/no-require-imports -- standalone Node acceptance runner */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const compiled = ts.transpileModule(fs.readFileSync("src/lib/repair-validation.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const mod = { exports: {} };
new Function("exports", "module", compiled)(mod.exports, mod);
const { parseRepairProposal, validateRepairProposal } = mod.exports;
const valid = {
  diagnosis: "Renamed title column",
  rootCause: "Destination schema drift",
  confidence: 0.9,
  mappings: [
    { sourceField: "issue_title", targetField: "title", rationale: "Renamed destination field" },
  ],
};
const columns = [{ columnName: "title", dataType: "text", nullable: false, hasDefault: false }];
const check = (p, c = columns) => validateRepairProposal(parseRepairProposal(p), c).passed;
test("supported mapping passes", () => assert.equal(check(valid), true));
for (const target of [
  "password",
  "title; DROP TABLE github_issues",
  "Title",
  "pg_catalog",
  "title()",
])
  test("reject target " + target, () =>
    assert.equal(
      check({ ...valid, mappings: [{ ...valid.mappings[0], targetField: target }] }),
      false,
    ),
  );
test("reject duplicate targets", () =>
  assert.equal(check({ ...valid, mappings: [valid.mappings[0], valid.mappings[0]] }), false));
test("reject wrong destination type", () =>
  assert.equal(check(valid, [{ ...columns[0], dataType: "integer" }]), false));
test("reject missing destination", () => assert.equal(check(valid, []), false));
test("reject uncovered required column", () =>
  assert.equal(
    check(valid, [
      ...columns,
      { columnName: "secret", dataType: "text", nullable: false, hasDefault: false },
    ]),
    false,
  ));
test("reject extra executable field", () =>
  assert.throws(() => parseRepairProposal({ ...valid, sql: "DROP TABLE github_issues" })));
test("reject non-finite confidence", () =>
  assert.throws(() => parseRepairProposal({ ...valid, confidence: Infinity })));
test("reject oversized diagnosis", () =>
  assert.throws(() => parseRepairProposal({ ...valid, diagnosis: "x".repeat(501) })));
