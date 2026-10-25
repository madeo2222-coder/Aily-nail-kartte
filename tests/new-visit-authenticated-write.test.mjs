import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL("../app/visits/new/NewVisitPageClient.tsx", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX,
  },
}).outputText;

const CUSTOMER_ID = "10000000-0000-4000-8000-000000000001";
const STAFF_ID = "20000000-0000-4000-8000-000000000002";
const SALON_ID = "30000000-0000-4000-8000-000000000003";
const VISIT_ID = "40000000-0000-4000-8000-000000000004";

function walk(node) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(walk);
  return [node, ...walk(node.props?.children ?? null)];
}

async function mount({
  withPhoto = false,
  authenticationMode = "supabase",
  reservationId = "",
  reservationStatus,
} = {}) {
  const slots = [];
  let cursor = 0;
  let pendingEffects = [];
  let tree;
  const requests = [];
  const dbCalls = [];
  const storageUploads = [];
  const navigations = [];
  const alerts = [];
  const operations = [];

  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) {
        slots[index] = typeof initial === "function" ? initial() : initial;
      }
      return [
        slots[index],
        (value) => {
          slots[index] =
            typeof value === "function" ? value(slots[index]) : value;
        },
      ];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useMemo(fn) {
      return fn();
    },
    useCallback(fn, dependencies) {
      const index = cursor++;
      const previous = slots[index];
      if (
        !previous ||
        dependencies.some(
          (dependency, dependencyIndex) =>
            !Object.is(dependency, previous.dependencies[dependencyIndex]),
        )
      ) {
        slots[index] = { dependencies, value: fn };
      }
      return slots[index].value;
    },
    useEffect(fn, dependencies) {
      const index = cursor++;
      const previous = slots[index];
      if (
        !previous ||
        dependencies.some(
          (dependency, dependencyIndex) =>
            !Object.is(dependency, previous.dependencies[dependencyIndex]),
        )
      ) {
        pendingEffects.push(() => {
          previous?.cleanup?.();
          slots[index] = { dependencies, cleanup: fn() };
        });
      }
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
    alert(message) {
      alerts.push(message);
    },
    console: { error() {} },
    fetch(url, options = {}) {
      requests.push({ url, options });
      operations.push({ type: "fetch", url, options });

      if (url === "/api/visits/registration-data") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            authenticationMode,
            customers: [
              {
                id: CUSTOMER_ID,
                name: "顧客A",
                phone: null,
                salon_id: SALON_ID,
              },
            ],
            staffs: [{ id: STAFF_ID, name: "担当A", salon_id: SALON_ID }],
          }),
        });
      }

      if (url === "/api/visits") {
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => ({ ok: true, visit: { id: VISIT_ID } }),
        });
      }

      if (url === `/api/reservations/${reservationId}/status`) {
        const body = JSON.parse(options.body);
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            reservation: { id: reservationId, status: body.status },
          }),
        });
      }

      if (url === `/api/visits/${VISIT_ID}/photos`) {
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => ({ ok: true, photoCount: 1 }),
        });
      }

      throw new Error(`Unexpected request: ${url}`);
    },
    require(name) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return require(name);
      if (name === "next/link") return { default: "a" };
      if (name === "next/image") return { default: "img" };
      if (name === "next/navigation") {
        return {
          useRouter: () => ({ push: (value) => navigations.push(value) }),
          useSearchParams: () => ({
            get(key) {
              if (key === "customer_id") return CUSTOMER_ID;
              if (key === "reservation_id") return reservationId;
              if (key === "reservation_status") {
                return reservationStatus === undefined
                  ? null
                  : reservationStatus;
              }
              return "";
            },
          }),
        };
      }
      if (name === "@/lib/supabase") {
        return {
          supabase: {
            from(table) {
              if (authenticationMode === "supabase") {
                dbCalls.push(table);
                throw new Error("individual staff registration must use the API");
              }

              const call = { table };
              dbCalls.push(call);
              operations.push({ type: "db", call });
              const chain = {
                insert(value) {
                  call.operation = "insert";
                  call.value = value;
                  return chain;
                },
                select(columns, options) {
                  call.select = { columns, options };
                  return chain;
                },
                eq(column, value) {
                  call.filter = { column, value };
                  return chain;
                },
                single() {
                  return Promise.resolve({
                    data: { id: VISIT_ID },
                    error: null,
                  });
                },
                then(resolve, reject) {
                  return Promise.resolve(
                    table === "visits" && call.operation !== "insert"
                      ? { count: 1, error: null }
                      : { error: null },
                  ).then(resolve, reject);
                },
              };
              return chain;
            },
            rpc(name) {
              dbCalls.push(`rpc:${name}`);
              throw new Error("individual staff registration must use the API");
            },
            storage: {
              from(bucket) {
                assert.equal(bucket, "visit-photos");
                return {
                  async upload(path, file, options) {
                    storageUploads.push({ path, file, options });
                    return { error: null };
                  },
                  getPublicUrl(path) {
                    return {
                      data: {
                        publicUrl: `https://example.supabase.co/storage/v1/object/public/visit-photos/${path}`,
                      },
                    };
                  },
                };
              },
            },
          },
        };
      }
      if (name === "@/lib/visitPhotoStorage") {
        return {
          VISIT_PHOTO_ACCEPT: "image/jpeg,image/png,image/webp",
          validateVisitPhotoMetadata: (file) => file,
          validateVisitPhotoFile: async (file) => ({
            file,
            contentType: file.type,
            extension: "png",
          }),
          createVisitPhotoPath: (visitId) =>
            `${visitId}/photo-50000000-0000-4000-8000-000000000005.png`,
        };
      }
      return require(name);
    },
  });

  function render() {
    cursor = 0;
    tree = exports.default();
    const effects = pendingEffects;
    pendingEffects = [];
    for (const effect of effects) effect();
  }

  render();
  await setImmediate();
  render();

  return {
    requests,
    dbCalls,
    storageUploads,
    navigations,
    alerts,
    operations,
    html() {
      return walk(tree)
        .map((node) =>
          typeof node.props?.children === "string"
            ? node.props.children
            : "",
        )
        .join(" ");
    },
    async submit() {
      if (withPhoto) {
        const fileInput = walk(tree).find(
          (node) => node.type === "input" && node.props?.type === "file",
        );
        assert.ok(fileInput);
        fileInput.props.onChange({
          target: {
            files: [
              {
                type: "image/png",
                size: 100,
                async arrayBuffer() {
                  return new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer;
                },
              },
            ],
            value: "selected",
          },
        });
        render();
      }

      const nodes = walk(tree);
      const staffSelect = nodes.find(
        (node) =>
          node.type === "select" &&
          walk(node).some(
            (child) => child.props?.children === "担当スタッフを選択してください",
          ),
      );
      if (authenticationMode === "supabase") {
        assert.ok(staffSelect, "staff select should be shown for individual auth");
        staffSelect.props.onChange({ target: { value: STAFF_ID } });
        render();
      } else {
        assert.equal(staffSelect, undefined);
      }

      const priceInput = walk(tree).find(
        (node) => node.type === "input" && node.props?.placeholder === "売上金額",
      );
      assert.ok(priceInput);
      priceInput.props.onChange({ target: { value: "5000" } });
      render();

      const form = walk(tree).find((node) => node.type === "form");
      assert.ok(form);
      await form.props.onSubmit({ preventDefault() {} });
      render();
    },
  };
}

test("individual staff registration uses the authenticated atomic API without direct table writes", async () => {
  const page = await mount();
  await page.submit();

  assert.equal(page.dbCalls.length, 0);
  assert.equal(page.requests.length, 2);
  assert.equal(page.requests[1].url, "/api/visits");
  assert.equal(page.requests[1].options.method, "POST");

  const body = JSON.parse(page.requests[1].options.body);
  assert.equal(body.customerId, CUSTOMER_ID);
  assert.equal(body.staffId, STAFF_ID);
  assert.equal(body.price, 5000);
  assert.deepEqual(body.payments, [{ method: "現金", amount: 5000 }]);
  assert.deepEqual(page.alerts, ["来店履歴を登録しました"]);
  assert.deepEqual(page.navigations, [`/customers/${CUSTOMER_ID}`]);
});

test("authenticated photo registration uploads the file then stores metadata through the guarded API", async () => {
  const page = await mount({ withPhoto: true });
  await page.submit();

  assert.equal(page.dbCalls.length, 0);
  assert.equal(page.storageUploads.length, 1);
  assert.equal(page.requests.length, 3);
  assert.equal(page.requests[2].url, `/api/visits/${VISIT_ID}/photos`);
  assert.equal(page.requests[2].options.method, "POST");

  const body = JSON.parse(page.requests[2].options.body);
  assert.equal(body.salonId, SALON_ID);
  assert.equal(body.photos.length, 1);
  assert.match(body.photos[0].imageUrl, new RegExp(VISIT_ID));
  assert.equal(body.photos[0].photoType, "after");
});

test("shared-login reservation visit uses guarded status transitions around the linked visit write", async () => {
  const page = await mount({
    authenticationMode: "legacy",
    reservationId: "reservation-1",
    reservationStatus: "confirmed",
  });
  await page.submit();

  const statusRequests = page.requests.filter(
    (request) => request.url === "/api/reservations/reservation-1/status",
  );
  assert.deepEqual(
    statusRequests.map((request) => JSON.parse(request.options.body)),
    [
      { status: "来店", expectedStatus: "confirmed" },
      { status: "完了", expectedStatus: "来店" },
    ],
  );

  const visitInsert = page.dbCalls.find(
    (call) => call.table === "visits" && call.operation === "insert",
  );
  assert.ok(visitInsert);
  assert.equal(visitInsert.value[0].reservation_id, "reservation-1");
  assert.equal(
    page.dbCalls.some((call) => call.table === "reservations"),
    false,
  );

  const firstStatusIndex = page.operations.findIndex(
    (operation) =>
      operation.type === "fetch" &&
      operation.url === "/api/reservations/reservation-1/status" &&
      JSON.parse(operation.options.body).status === "来店",
  );
  const visitInsertIndex = page.operations.findIndex(
    (operation) =>
      operation.type === "db" &&
      operation.call.table === "visits" &&
      operation.call.operation === "insert",
  );
  const completionIndex = page.operations.findIndex(
    (operation) =>
      operation.type === "fetch" &&
      operation.url === "/api/reservations/reservation-1/status" &&
      JSON.parse(operation.options.body).status === "完了",
  );
  assert.ok(firstStatusIndex < visitInsertIndex);
  assert.ok(visitInsertIndex < completionIndex);
});

test("shared-login reservation visit fails closed when its status snapshot is missing", async () => {
  const page = await mount({
    authenticationMode: "legacy",
    reservationId: "reservation-1",
  });
  await page.submit();

  assert.equal(page.dbCalls.length, 0);
  assert.equal(
    page.requests.some((request) =>
      request.url.includes("/api/reservations/reservation-1/status")
    ),
    false,
  );
  assert.match(page.html(), /予約一覧を読み直してから来店登録してください/);
});
