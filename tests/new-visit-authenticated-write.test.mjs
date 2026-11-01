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
const visitSubmissionLockExports = {};
const visitSubmissionLockSource = ts.transpileModule(
  readFileSync(
    new URL("../lib/visit-submission-lock.ts", import.meta.url),
    "utf8",
  ),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;
vm.runInNewContext(visitSubmissionLockSource, {
  exports: visitSubmissionLockExports,
  Date,
  JSON,
  Number,
});

const CUSTOMER_ID = "10000000-0000-4000-8000-000000000001";
const STAFF_ID = "20000000-0000-4000-8000-000000000002";
const SALON_ID = "30000000-0000-4000-8000-000000000003";
const VISIT_ID = "40000000-0000-4000-8000-000000000004";

function makeStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

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
  resumeExistingVisit = false,
  completionFirstResult = null,
  authenticatedVisitResult = null,
  legacyVisitResult = {
    data: { id: VISIT_ID },
    error: null,
  },
  legacyVisitCount = 1,
  legacyVisitCountError = null,
  legacyRpcResults = {},
  legacyInsertResults = {},
  legacyStorageUploadResult = { error: null },
  legacyPhotoPublicUrlResult = null,
  photoMetadataResult = null,
  localStorage = makeStorage(),
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
  let completionAttempts = 0;

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
    window: { localStorage },
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
        if (authenticatedVisitResult !== null) {
          return typeof authenticatedVisitResult === "function"
            ? authenticatedVisitResult()
            : authenticatedVisitResult;
        }

        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => ({ ok: true, visit: { id: VISIT_ID } }),
        });
      }

      if (url === `/api/reservations/${reservationId}/status`) {
        const body = JSON.parse(options.body);

        if (body.status === "完了") {
          completionAttempts += 1;

          if (completionAttempts === 1 && completionFirstResult === "network") {
            throw new Error("response lost after completion");
          }

          if (completionAttempts === 1 && completionFirstResult === "server") {
            return Promise.resolve({
              ok: false,
              status: 500,
              json: async () => ({ ok: false }),
            });
          }

          if (completionAttempts === 1 && completionFirstResult === "invalid") {
            return Promise.resolve({
              ok: true,
              status: 200,
              json: async () => null,
            });
          }
        }

        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            reservation: { id: reservationId, status: body.status },
            ...(resumeExistingVisit && body.status === "来店"
              ? { existingVisit: { id: VISIT_ID } }
              : {}),
          }),
        });
      }

      if (url === `/api/visits/${VISIT_ID}/photos`) {
        if (photoMetadataResult !== null) {
          return typeof photoMetadataResult === "function"
            ? photoMetadataResult()
            : photoMetadataResult;
        }

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
                  return Promise.resolve(
                    table === "visits" && call.operation === "insert"
                      ? legacyVisitResult
                      : { data: { id: VISIT_ID }, error: null },
                  );
                },
                then(resolve, reject) {
                  const configuredInsertResult = Object.hasOwn(
                    legacyInsertResults,
                    table,
                  )
                    ? legacyInsertResults[table]
                    : { error: null };
                  const insertResult =
                    typeof configuredInsertResult === "function"
                      ? configuredInsertResult()
                      : configuredInsertResult;

                  return Promise.resolve(
                    table === "visits" && call.operation !== "insert"
                      ? {
                          count: legacyVisitCount,
                          error: legacyVisitCountError,
                        }
                      : insertResult,
                  ).then(resolve, reject);
                },
              };
              return chain;
            },
            rpc(name) {
              dbCalls.push(`rpc:${name}`);
              if (authenticationMode === "supabase") {
                throw new Error("individual staff registration must use the API");
              }
              return Promise.resolve(
                Object.hasOwn(legacyRpcResults, name)
                  ? legacyRpcResults[name]
                  : { data: null, error: null },
              );
            },
            storage: {
              from(bucket) {
                assert.equal(bucket, "visit-photos");
                return {
                  async upload(path, file, options) {
                    storageUploads.push({ path, file, options });
                    return typeof legacyStorageUploadResult === "function"
                      ? legacyStorageUploadResult()
                      : legacyStorageUploadResult;
                  },
                  getPublicUrl(path) {
                    if (legacyPhotoPublicUrlResult !== null) {
                      return typeof legacyPhotoPublicUrlResult === "function"
                        ? legacyPhotoPublicUrlResult(path)
                        : legacyPhotoPublicUrlResult;
                    }

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
      if (name === "@/lib/visit-submission-lock") {
        return visitSubmissionLockExports;
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
    localStorage,
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
    customerSelect() {
      return walk(tree).find(
        (node) =>
          node.type === "select" &&
          walk(node).some(
            (child) => child.props?.children === "顧客を選択してください",
          ),
      );
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
      if (authenticationMode === "supabase" && !reservationId) {
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

test("individual staff registration locks resubmission when the atomic API result is unknown", async () => {
  const page = await mount({
    authenticatedVisitResult: () => {
      throw new Error("sensitive authenticated visit transport detail");
    },
  });
  await page.submit();

  const requestCount = page.requests.length;
  assert.equal(page.dbCalls.length, 0);
  assert.equal(page.requests.at(-1).url, "/api/visits");
  assert.match(
    page.html(),
    /登録結果を確認できませんでした。再送信せず、管理者へ確認してください/,
  );
  assert.doesNotMatch(
    page.html(),
    /sensitive authenticated visit transport detail/,
  );
  assert.deepEqual(page.storageUploads, []);
  assert.deepEqual(page.alerts, []);
  assert.deepEqual(page.navigations, []);

  await page.submit();
  assert.equal(page.requests.length, requestCount);
});

test("individual staff registration restores its unknown-result lock after reload", async () => {
  const localStorage = makeStorage();
  const first = await mount({
    localStorage,
    authenticatedVisitResult: () => {
      throw new Error("response lost after visit commit");
    },
  });
  await first.submit();

  const reloaded = await mount({ localStorage });
  await reloaded.submit();

  assert.equal(
    reloaded.requests.some((request) => request.url === "/api/visits"),
    false,
  );
  assert.match(reloaded.html(), /前回の登録結果を確認できていません/);
  assert.deepEqual(reloaded.alerts, []);
  assert.deepEqual(reloaded.navigations, []);
});

for (const error of [
  "この予約は既に完了しています。",
  "この予約には既に来店履歴があります。",
]) {
  test(`individual staff registration locks resubmission after terminal conflict: ${error}`, async () => {
    const page = await mount({
      reservationId: "reservation-1",
      reservationStatus: "confirmed",
      authenticatedVisitResult: Promise.resolve({
        ok: false,
        status: 409,
        json: async () => ({ ok: false, error }),
      }),
    });
    await page.submit();

    const requestCount = page.requests.length;
    assert.match(page.html(), new RegExp(error));
    assert.deepEqual(page.storageUploads, []);
    assert.deepEqual(page.alerts, []);
    assert.deepEqual(page.navigations, []);

    await page.submit();
    assert.equal(page.requests.length, requestCount);
  });
}

test("individual staff registration keeps a correctable conflict retryable", async () => {
  let attempts = 0;
  const page = await mount({
    authenticatedVisitResult: () => {
      attempts += 1;
      return Promise.resolve({
        ok: false,
        status: 409,
        json: async () => ({
          ok: false,
          error: "利用できるクーポン残高を確認してください。",
        }),
      });
    },
  });

  await page.submit();
  assert.match(page.html(), /利用できるクーポン残高を確認してください/);
  await page.submit();
  assert.equal(attempts, 2);
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
  assert.equal(page.customerSelect()?.props.disabled, true);
  assert.match(page.html(), /予約に登録された顧客へ来店履歴を保存します/);
  await page.submit();

  const statusRequests = page.requests.filter(
    (request) => request.url === "/api/reservations/reservation-1/status",
  );
  assert.deepEqual(
    statusRequests.map((request) => JSON.parse(request.options.body)),
    [
      {
        status: "来店",
        expectedCustomerId: CUSTOMER_ID,
        expectedStatus: "confirmed",
      },
      {
        status: "完了",
        expectedCustomerId: CUSTOMER_ID,
        expectedStatus: "来店",
      },
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

test("shared-login visit blocks resubmission when the visit insert result is unknown", async () => {
  const page = await mount({
    authenticationMode: "legacy",
    reservationId: "reservation-1",
    reservationStatus: "confirmed",
    legacyVisitResult: { data: null, error: null },
  });
  await page.submit();

  const operationCount = page.operations.length;
  assert.match(
    page.html(),
    /来店履歴の登録結果を確認できませんでした。再送信せず、管理者へ確認してください/,
  );

  await page.submit();

  assert.equal(page.operations.length, operationCount);
  assert.deepEqual(page.alerts, []);
  assert.deepEqual(page.navigations, []);
});

test("shared-login visit does not expose a coded database error message", async () => {
  const page = await mount({
    authenticationMode: "legacy",
    reservationId: "reservation-1",
    reservationStatus: "confirmed",
    legacyVisitResult: {
      data: null,
      error: { code: "23514", message: "sensitive constraint detail" },
    },
  });
  await page.submit();

  assert.match(
    page.html(),
    /来店履歴の登録に失敗しました。入力内容を確認してください/,
  );
  assert.doesNotMatch(page.html(), /sensitive constraint detail/);
});

for (const [label, paymentResult] of [
  ["malformed", {}],
  [
    "rejected",
    () => {
      throw new Error("sensitive payment transport detail");
    },
  ],
]) {
  test(`shared-login visit locks resubmission after a ${label} payment result`, async () => {
    const page = await mount({
      authenticationMode: "legacy",
      reservationId: "reservation-1",
      reservationStatus: "confirmed",
      legacyInsertResults: { visit_payments: paymentResult },
    });
    await page.submit();

    const operationCount = page.operations.length;
    assert.equal(
      page.dbCalls.some(
        (call) =>
          call.table === "visit_payments" && call.operation === "insert",
      ),
      true,
    );
    assert.equal(
      page.dbCalls.some(
        (call) => call.table === "visits" && call.operation !== "insert",
      ),
      false,
    );
    assert.match(page.html(), /支払い内訳の登録結果を確認できませんでした/);
    assert.doesNotMatch(page.html(), /sensitive payment transport detail/);
    assert.deepEqual(page.alerts, []);
    assert.deepEqual(page.navigations, []);

    await page.submit();
    assert.equal(page.operations.length, operationCount);
  });
}

for (const [label, uploadResult] of [
  ["malformed", {}],
  [
    "rejected",
    () => {
      throw new Error("sensitive storage transport detail");
    },
  ],
]) {
  test(`shared-login visit locks resubmission after a ${label} photo upload result`, async () => {
    const page = await mount({
      authenticationMode: "legacy",
      reservationId: "reservation-1",
      reservationStatus: "confirmed",
      withPhoto: true,
      legacyStorageUploadResult: uploadResult,
    });
    await page.submit();

    const operationCount = page.operations.length;
    assert.equal(page.storageUploads.length, 1);
    assert.equal(
      page.requests.some(
        (request) => request.url === `/api/visits/${VISIT_ID}/photos`,
      ),
      false,
    );
    assert.equal(
      page.requests.some((request) => {
        if (request.url !== "/api/reservations/reservation-1/status") {
          return false;
        }
        return JSON.parse(request.options.body).status === "完了";
      }),
      false,
    );
    assert.match(
      page.html(),
      /写真アップロードの結果を確認できませんでした/,
    );
    assert.doesNotMatch(page.html(), /sensitive storage transport detail/);
    assert.deepEqual(page.alerts, []);
    assert.deepEqual(page.navigations, []);

    await page.submit();
    assert.equal(page.operations.length, operationCount);
    assert.equal(page.storageUploads.length, 1);
  });
}

test("shared-login visit locks resubmission when the uploaded photo URL is unknown", async () => {
  const page = await mount({
    authenticationMode: "legacy",
    reservationId: "reservation-1",
    reservationStatus: "confirmed",
    withPhoto: true,
    legacyPhotoPublicUrlResult: () => {
      throw new Error("sensitive public URL detail");
    },
  });
  await page.submit();

  const operationCount = page.operations.length;
  assert.equal(page.storageUploads.length, 1);
  assert.equal(
    page.requests.some(
      (request) => request.url === `/api/visits/${VISIT_ID}/photos`,
    ),
    false,
  );
  assert.match(page.html(), /写真URLの取得結果を確認できませんでした/);
  assert.doesNotMatch(page.html(), /sensitive public URL detail/);
  assert.deepEqual(page.alerts, []);
  assert.deepEqual(page.navigations, []);

  await page.submit();
  assert.equal(page.operations.length, operationCount);
  assert.equal(page.storageUploads.length, 1);
});

test("shared-login visit locks resubmission when photo metadata persistence is unknown", async () => {
  const page = await mount({
    authenticationMode: "legacy",
    reservationId: "reservation-1",
    reservationStatus: "confirmed",
    withPhoto: true,
    photoMetadataResult: () => {
      throw new Error("sensitive photo metadata transport detail");
    },
  });
  await page.submit();

  const operationCount = page.operations.length;
  assert.equal(page.storageUploads.length, 1);
  assert.equal(
    page.requests.some(
      (request) => request.url === `/api/visits/${VISIT_ID}/photos`,
    ),
    true,
  );
  assert.equal(
    page.requests.some((request) => {
      if (request.url !== "/api/reservations/reservation-1/status") {
        return false;
      }
      return JSON.parse(request.options.body).status === "完了";
    }),
    false,
  );
  assert.match(page.html(), /写真情報の保存結果を確認できませんでした/);
  assert.doesNotMatch(page.html(), /sensitive photo metadata transport detail/);
  assert.deepEqual(page.alerts, []);
  assert.deepEqual(page.navigations, []);

  await page.submit();
  assert.equal(page.operations.length, operationCount);
  assert.equal(page.storageUploads.length, 1);
});

test("shared-login visit keeps the saved payment and locks resubmission when the visit count is unknown", async () => {
  const page = await mount({
    authenticationMode: "legacy",
    reservationId: "reservation-1",
    reservationStatus: "confirmed",
    legacyVisitCount: null,
    legacyVisitCountError: { message: "sensitive count detail" },
  });
  await page.submit();

  const operationCount = page.operations.length;
  assert.equal(
    page.dbCalls.some(
      (call) => call.table === "visit_payments" && call.operation === "insert",
    ),
    true,
  );
  assert.match(page.html(), /来店回数を確認できませんでした/);
  assert.doesNotMatch(page.html(), /sensitive count detail/);
  assert.deepEqual(page.alerts, []);
  assert.deepEqual(page.navigations, []);

  await page.submit();
  assert.equal(page.operations.length, operationCount);
});

test("shared-login visit reports an unconfirmed coupon award without exposing database details", async () => {
  const page = await mount({
    authenticationMode: "legacy",
    reservationId: "reservation-1",
    reservationStatus: "confirmed",
    legacyVisitCount: 6,
    legacyRpcResults: {
      increment_coupon_500: {
        data: null,
        error: { message: "sensitive coupon detail" },
      },
    },
  });
  await page.submit();

  assert.equal(
    page.dbCalls.some(
      (call) => call.table === "visit_payments" && call.operation === "insert",
    ),
    true,
  );
  assert.equal(page.dbCalls.includes("rpc:increment_coupon_500"), true);
  assert.equal(
    page.dbCalls.some(
      (call) => call.table === "coupon_histories" && call.operation === "insert",
    ),
    false,
  );
  assert.match(page.html(), /500円クーポンの付与を確認できませんでした/);
  assert.doesNotMatch(page.html(), /sensitive coupon detail/);
  assert.deepEqual(page.alerts, []);
  assert.deepEqual(page.navigations, []);
});

test("shared-login visit reports an unconfirmed coupon history after the award", async () => {
  const page = await mount({
    authenticationMode: "legacy",
    reservationId: "reservation-1",
    reservationStatus: "confirmed",
    legacyVisitCount: 6,
    legacyInsertResults: {
      coupon_histories: {
        error: { message: "sensitive coupon history detail" },
      },
    },
  });
  await page.submit();

  assert.equal(page.dbCalls.includes("rpc:increment_coupon_500"), true);
  assert.equal(
    page.dbCalls.some(
      (call) => call.table === "coupon_histories" && call.operation === "insert",
    ),
    true,
  );
  assert.match(page.html(), /500円クーポンの履歴保存を確認できませんでした/);
  assert.doesNotMatch(page.html(), /sensitive coupon history detail/);
  assert.deepEqual(page.alerts, []);
  assert.deepEqual(page.navigations, []);
});

test("shared-login reservation visit completes a fully saved existing visit without inserting it again", async () => {
  const page = await mount({
    authenticationMode: "legacy",
    reservationId: "reservation-1",
    reservationStatus: "来店",
    resumeExistingVisit: true,
  });
  await page.submit();

  const statusRequests = page.requests.filter(
    (request) => request.url === "/api/reservations/reservation-1/status",
  );
  assert.deepEqual(
    statusRequests.map((request) => JSON.parse(request.options.body)),
    [
      {
        status: "来店",
        expectedCustomerId: CUSTOMER_ID,
        expectedStatus: "来店",
      },
      {
        status: "完了",
        expectedCustomerId: CUSTOMER_ID,
        expectedStatus: "来店",
      },
    ],
  );
  assert.equal(
    page.dbCalls.some(
      (call) => call.table === "visits" && call.operation === "insert",
    ),
    false,
  );
  assert.equal(
    page.dbCalls.some(
      (call) => call.table === "visit_payments" && call.operation === "insert",
    ),
    false,
  );
  assert.deepEqual(page.alerts, ["来店履歴を登録しました"]);
  assert.deepEqual(page.navigations, [`/customers/${CUSTOMER_ID}`]);
});

for (const completionFirstResult of ["network", "server", "invalid"]) {
  test(`shared-login reservation visit retries an unknown ${completionFirstResult} completion result without another visit`, async () => {
    const page = await mount({
      authenticationMode: "legacy",
      reservationId: "reservation-1",
      reservationStatus: "confirmed",
      completionFirstResult,
    });
    await page.submit();

    const statusRequests = page.requests.filter(
      (request) => request.url === "/api/reservations/reservation-1/status",
    );
    const completionRequests = statusRequests.filter(
      (request) => JSON.parse(request.options.body).status === "完了",
    );
    const visitInserts = page.dbCalls.filter(
      (call) => call.table === "visits" && call.operation === "insert",
    );

    assert.equal(completionRequests.length, 2);
    assert.equal(visitInserts.length, 1);
    assert.deepEqual(page.alerts, ["来店履歴を登録しました"]);
    assert.deepEqual(page.navigations, [`/customers/${CUSTOMER_ID}`]);
  });
}
