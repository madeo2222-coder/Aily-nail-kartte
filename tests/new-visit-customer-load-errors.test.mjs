import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import vm from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const compiled = ts.transpileModule(
  readFileSync(
    new URL("../app/visits/new/NewVisitPageClient.tsx", import.meta.url),
    "utf8"
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }
).outputText;

function findNode(node, predicate) {
  if (!node || typeof node !== "object") return null;
  if (predicate(node)) return node;

  for (const child of [node.props?.children].flat(Infinity)) {
    const found = findNode(child, predicate);
    if (found) return found;
  }

  return null;
}

async function mount({ mode = "success", preselectedCustomerId = "" } = {}) {
  const states = [];
  const effects = [];
  const queries = [];
  let cursor = 0;
  let responseMode = mode;

  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) {
        states[index] = typeof initial === "function" ? initial() : initial;
      }

      return [
        states[index],
        (value) => {
          states[index] =
            typeof value === "function" ? value(states[index]) : value;
        },
      ];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = { current: initial };
      return states[index];
    },
    useCallback: (fn) => fn,
    useMemo: (fn) => fn(),
    useEffect(fn) {
      effects.push(fn);
    },
  };

  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    Date,
    Error,
    Map,
    Math,
    Number,
    Promise,
    Set,
    URL: {
      createObjectURL() {
        return "blob:preview";
      },
      revokeObjectURL() {},
    },
    alert() {},
    console: { error() {} },
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return require(name);
      if (name === "next/link") return { default: "a" };
      if (name === "next/image") return { default: "img" };
      if (name === "next/navigation") {
        return {
          useRouter: () => ({ push() {} }),
          useSearchParams: () => ({
            get(key) {
              return key === "customer_id" ? preselectedCustomerId : "";
            },
          }),
        };
      }
      if (name === "@/lib/supabase") {
        return {
          supabase: {
            from(table) {
              const query = { table };
              queries.push(query);
              const chain = {
                select(columns) {
                  query.columns = columns;
                  return chain;
                },
                order(column, options) {
                  query.order = [column, options];
                  return chain;
                },
                then(resolve, reject) {
                  return Promise.resolve()
                    .then(() => {
                      if (responseMode === "rejection") {
                        throw new Error("offline");
                      }
                      if (responseMode === "query-error") {
                        return {
                          data: null,
                          error: { message: "read failed" },
                        };
                      }

                      return {
                        data:
                          responseMode === "empty"
                            ? []
                            : [
                                {
                                  id: "customer-1",
                                  name: "顧客A",
                                  phone: "090-0000-0000",
                                  salon_id: "salon-1",
                                },
                              ],
                        error: null,
                      };
                    })
                    .then(resolve, reject);
                },
              };

              return chain;
            },
            storage: { from() {} },
            rpc() {},
          },
        };
      }
      if (name === "@/lib/visitPhotoStorage") return {
        VISIT_PHOTO_ACCEPT: "image/jpeg,image/png,image/webp",
        validateVisitPhotoMetadata: file => file,
        validateVisitPhotoFile: async file => ({ file, contentType: file.type, extension: "png" }),
        createVisitPhotoPath: () => "visit/photo-test.png",
      };
      throw new Error(`Unexpected import: ${name}`);
    },
  });

  function tree() {
    cursor = 0;
    return exports.default();
  }

  function html() {
    return renderToStaticMarkup(tree());
  }

  const initialTree = tree();
  const initialHtml = renderToStaticMarkup(initialTree);
  for (const effect of effects.splice(0)) effect();
  await setImmediate();

  return {
    html,
    initialHtml,
    queries,
    async retry() {
      const button = findNode(
        tree(),
        (node) => node.type === "button" && node.props.children === "再試行"
      );
      assert.ok(button);
      responseMode = "success";
      button.props.onClick();
      assert.match(html(), /顧客一覧を読み込み中/);
      assert.doesNotMatch(html(), />登録する<|写真を選択する/);
      await setImmediate();
    },
  };
}

for (const mode of ["query-error", "rejection"]) {
  test(`new visit blocks writes after customer ${mode}`, async () => {
    const page = await mount({ mode });

    assert.match(page.initialHtml, /顧客一覧を読み込み中/);
    assert.doesNotMatch(page.initialHtml, />登録する<|写真を選択する/);
    assert.match(page.html(), /role="alert"/);
    assert.match(page.html(), /顧客一覧を確認できません/);
    assert.match(page.html(), /来店登録はまだ行われていません/);
    assert.doesNotMatch(page.html(), />登録する<|写真を選択する|<form/);

    await page.retry();

    assert.doesNotMatch(page.html(), /role="alert"|読み込み中/);
    assert.match(page.html(), /顧客A/);
    assert.match(page.html(), /登録する/);
    assert.match(page.html(), /写真を選択する/);
  });
}

test("new visit preserves an authoritative empty customer result", async () => {
  const page = await mount({ mode: "empty" });

  assert.doesNotMatch(page.html(), /role="alert"|読み込み中/);
  assert.match(page.html(), /登録可能な顧客がいません/);
  assert.match(page.html(), /顧客を追加/);
  assert.doesNotMatch(page.html(), />登録する<|写真を選択する|<form/);
  assert.equal(page.queries.length, 1);
});

test("new visit accepts only a preselected customer in the loaded master", async () => {
  const valid = await mount({ preselectedCustomerId: "customer-1" });
  assert.match(valid.html(), /<option value="customer-1" selected="">/);

  const invalid = await mount({ preselectedCustomerId: "missing-customer" });
  assert.doesNotMatch(
    invalid.html(),
    /<option value="customer-1" selected="">/
  );
  assert.match(invalid.html(), /<option value="" selected="">/);
});
