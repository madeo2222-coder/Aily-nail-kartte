// Run: node --test tests/visit-edit-photo.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(
  new URL("../app/visits/[id]/edit/VisitEditPhoto.tsx", import.meta.url),
  "utf8"
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
  },
}).outputText;

const jsx = (type, props, key) => ({ type, props: props || {}, key });
const componentExports = {};

vm.runInNewContext(compiled, {
  exports: componentExports,
  require(name) {
    if (name === "react/jsx-runtime") {
      return { Fragment: "fragment", jsx, jsxs: jsx };
    }
    if (name === "next/image") return { default: "img" };
    throw new Error(`Unexpected import: ${name}`);
  },
}, { filename: "VisitEditPhoto.js" });

test("optimizes stored visit photos", () => {
  const image = componentExports.default({
    src: "https://project.supabase.co/storage/v1/object/public/visit-photos/photo.jpg",
    alt: "visit photo",
  });

  assert.equal(image.type, "img");
  assert.equal(image.props.fill, true);
  assert.equal(image.props.unoptimized, false);
  assert.equal(image.props.sizes, "(max-width: 640px) calc(50vw - 30px), 202px");
});

test("keeps local object URL previews unoptimized", () => {
  const image = componentExports.default({
    src: "blob:https://example.test/local-photo",
    alt: "new preview",
    unoptimized: true,
  });

  assert.equal(image.props.src, "blob:https://example.test/local-photo");
  assert.equal(image.props.unoptimized, true);
  assert.equal(image.props.alt, "new preview");
});
