// Run: node --test tests/customer-photo.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(
  new URL("../app/customer-app/CustomerPhoto.tsx", import.meta.url),
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
}, { filename: "CustomerPhoto.js" });

test("renders a responsive optimized customer photo", () => {
  const props = {
    src: "https://project.supabase.co/storage/v1/object/public/visit-photos/photo.jpg",
    alt: "施術写真",
    sizes: "(max-width: 448px) 50vw, 202px",
  };
  const image = componentExports.default(props);

  assert.equal(image.type, "img");
  assert.equal(image.props.src, props.src);
  assert.equal(image.props.alt, props.alt);
  assert.equal(image.props.fill, true);
  assert.equal(image.props.sizes, props.sizes);
  assert.equal(image.props.className, "object-cover");
});
