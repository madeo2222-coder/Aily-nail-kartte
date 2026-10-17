// Run: node --test tests/inbound-portfolio-gallery.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(
  new URL(
    "../app/customer-app/inbound/InboundPortfolioGallery.tsx",
    import.meta.url
  ),
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
}, { filename: "InboundPortfolioGallery.js" });

function findAll(node, type, result = []) {
  if (!node || typeof node !== "object") return result;
  if (node.type === type) result.push(node);
  const children = node.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    findAll(child, type, result);
  }
  return result;
}

test("renders all five portfolio images with responsive optimization metadata", () => {
  const captions = ["One", "Two", "Three", "Four", "Five"];
  const tree = componentExports.default({ captions });
  const images = findAll(tree, "img");

  assert.equal(images.length, 5);
  assert.deepEqual(
    images.map(({ props }) => props.src),
    [
      "/inbound-gallery/one-piece1.jpg",
      "/inbound-gallery/attack-on-titan.jpeg",
      "/inbound-gallery/demon-slayer.jpeg",
      "/inbound-gallery/jojo.jpeg",
      "/inbound-gallery/dragon-ball.jpeg",
    ]
  );
  assert.deepEqual(images.map(({ props }) => props.alt), captions);
  assert.deepEqual(
    images.map(({ props }) => [props.width, props.height]),
    [
      [1206, 1114],
      [623, 805],
      [525, 502],
      [578, 819],
      [1206, 1175],
    ]
  );
  assert.ok(images.every(({ props }) => props.sizes));
});

test("keeps the four-card crop and full-width contained final image", () => {
  const tree = componentExports.default({ captions: [] });
  const images = findAll(tree, "img");
  const fullWidthWrappers = findAll(tree, "div").filter(
    ({ props }) => props.className === "col-span-2"
  );

  assert.ok(images.slice(0, 4).every(({ props }) => /object-cover/.test(props.className)));
  assert.match(images[4].props.className, /object-contain/);
  assert.equal(fullWidthWrappers.length, 1);
  assert.deepEqual(
    images.map(({ props }) => props.alt),
    ["Nail design 1", "Nail design 2", "Nail design 3", "Nail design 4", "Nail design 5"]
  );
});
