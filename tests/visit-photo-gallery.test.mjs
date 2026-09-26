// Run: node --test tests/visit-photo-gallery.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(
  new URL("../app/components/VisitPhotoGallery.tsx", import.meta.url),
  "utf8"
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
  },
}).outputText;

function createRenderer() {
  const states = [];
  let cursor = 0;
  const jsx = (type, props, key) => ({ type, props: props || {}, key });
  const exports = {};

  vm.runInNewContext(compiled, {
    exports,
    require(name) {
      if (name === "react") {
        return {
          useState(initial) {
            const index = cursor++;
            if (!(index in states)) states[index] = initial;
            return [states[index], (value) => {
              states[index] = typeof value === "function"
                ? value(states[index])
                : value;
            }];
          },
        };
      }
      if (name === "react/jsx-runtime") {
        return { Fragment: "fragment", jsx, jsxs: jsx };
      }
      if (name === "next/image") return { default: "img" };
      throw new Error(`Unexpected import: ${name}`);
    },
  }, { filename: "VisitPhotoGallery.js" });

  return (photos) => {
    cursor = 0;
    return exports.default({ photos });
  };
}

function findAll(node, type, result = []) {
  if (!node || typeof node !== "object") return result;
  if (node.type === type) result.push(node);
  const children = node.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    findAll(child, type, result);
  }
  return result;
}

test("renders fixed-size optimized thumbnails", () => {
  const render = createRenderer();
  const tree = render([
    "https://project.supabase.co/storage/v1/object/public/visit-photos/a.jpg",
    "https://project.supabase.co/storage/v1/object/public/visit-photos/b.jpg",
  ]);
  const images = findAll(tree, "img");

  assert.equal(images.length, 2);
  assert.deepEqual(
    images.map(({ props }) => [props.width, props.height, props.sizes]),
    [[96, 96, "96px"], [96, 96, "96px"]]
  );
});

test("opens the selected photo in a responsive contained viewer", () => {
  const render = createRenderer();
  const photoUrl =
    "https://project.supabase.co/storage/v1/object/public/visit-photos/a.jpg";
  const initialTree = render([photoUrl]);
  findAll(initialTree, "button")[0].props.onClick();

  const selectedTree = render([photoUrl]);
  const images = findAll(selectedTree, "img");
  const expanded = images.find(({ props }) => props.alt === "拡大写真");

  assert.ok(expanded);
  assert.equal(expanded.props.src, photoUrl);
  assert.equal(expanded.props.fill, true);
  assert.equal(expanded.props.sizes, "90vw");
  assert.match(expanded.props.className, /object-contain/);
});

test("keeps the empty gallery state", () => {
  const render = createRenderer();
  const tree = render([]);

  assert.equal(tree.type, "p");
  assert.equal(tree.props.children, "写真なし");
});
