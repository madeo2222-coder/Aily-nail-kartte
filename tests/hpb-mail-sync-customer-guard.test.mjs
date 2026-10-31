import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);

function buildExternalCustomerId(source, reservationNumber) {
  const bytes = createHash("sha256")
    .update(`aily:external-customer:${source}:${reservationNumber.trim()}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const autoCustomerId = buildExternalCustomerId("hpb", "A123456");

function loadSync(manualCustomerId, options = {}) {
  const writes = [];
  const customerReadCursors = [];
  const reservationReadCursors = [];
  const manualReservationReadCursors = [];
  const reservationLookupPatterns = [];
  const customer = { id: "mail-customer", name: "テスト顧客", phone: "09000000000" };
  const manual = {
    id: "manual-reservation", customer_id: manualCustomerId,
    staff_id: options.staffId ?? null,
    salon_id: Object.hasOwn(options, "reservationSalonId")
      ? options.reservationSalonId
      : "salon-1",
    menu: options.menu ?? "HPB予約",
    memo: options.memo ?? (options.existing ? "HPB予約番号：A123456" : "電話で先に登録"), status: options.status ?? "confirmed",
    start_at: options.startAt ?? "2099-10-20T01:00:00.000Z",
    end_at: options.endAt ?? "2099-10-20T02:30:00.000Z",
  };
  const db = {
    from(table) {
      if (options.rejectDatabaseAccess) {
        throw new Error("invalid mail must stop before database access");
      }
      if (table === "customers" && options.rejectCustomerLookup) {
        throw new Error("cancelled replay must not resolve or create customers");
      }
      if (table === "staffs" && options.rejectStaffLookup) {
        throw new Error("staff lookup must be deferred for completed replays");
      }
      let operation = "read";
      let externalLookup = false;
      let payload;
      let selected;
      let idCursor = null;
      let pageLimit = null;
      const filters = [];
      const query = {
        select(columns) { selected = columns; return query; },
        eq(key, value) { filters.push([key, value]); return query; },
        gt(key, value) {
          if (key === "id") idCursor = value;
          return query;
        },
        is(key, value) { filters.push([key, value]); return query; },
        not() { return query; },
        gte() { return query; },
        lte() { return query; },
        limit(value) { pageLimit = value; return query; },
        order() { return query; },
        ilike(_column, pattern) {
          externalLookup = true;
          if (table === "reservations") reservationLookupPatterns.push(pattern);
          return query;
        },
        update(value) { operation = "update"; payload = value; return query; },
        insert(value) { operation = "insert"; payload = value; return query; },
        upsert(value) { operation = "upsert"; payload = value; return query; },
        single() { return query; },
        maybeSingle() { return query; },
        then(resolve, reject) {
          if (operation !== "read") {
            writes.push({ table, operation, payload, selected, filters });
            const updateWriteCount = writes.filter(
              (write) => write.operation === "update"
            ).length;
            if (
              operation === "update" &&
              updateWriteCount === 1 &&
              Object.hasOwn(options, "latestStatusOnUpdate")
            ) {
              manual.status = options.latestStatusOnUpdate;
            }
            if (
              operation === "update" &&
              updateWriteCount === 1 &&
              Object.hasOwn(options, "latestMemoOnUpdate")
            ) {
              manual.memo = options.latestMemoOnUpdate;
            }
            if (
              operation === "update" &&
              updateWriteCount === 1 &&
              Object.hasOwn(options, "latestStartAtOnUpdate")
            ) {
              manual.start_at = options.latestStartAtOnUpdate;
            }
            if (
              operation === "update" &&
              updateWriteCount === 1 &&
              Object.hasOwn(options, "latestEndAtOnUpdate")
            ) {
              manual.end_at = options.latestEndAtOnUpdate;
            }
            if (
              operation === "update" &&
              updateWriteCount === 1 &&
              Object.hasOwn(options, "latestCustomerIdOnUpdate")
            ) {
              manual.customer_id = options.latestCustomerIdOnUpdate;
            }
            if (
              operation === "update" &&
              updateWriteCount === 1 &&
              Object.hasOwn(options, "latestStaffIdOnUpdate")
            ) {
              manual.staff_id = options.latestStaffIdOnUpdate;
            }
            if (
              operation === "update" &&
              updateWriteCount === 1 &&
              Object.hasOwn(options, "latestMenuOnUpdate")
            ) {
              manual.menu = options.latestMenuOnUpdate;
            }
            const writeTargetId = filters.find(([key]) => key === "id")?.[1];
            const data = table === "customers" && operation === "insert"
              ? Object.hasOwn(options, "customerInsertData")
                ? options.customerInsertData
                : { id: payload.id, name: payload.name, salon_id: payload.salon_id }
              : Array.isArray(options.updateDataSequence)
                ? options.updateDataSequence[updateWriteCount - 1]
                : Object.hasOwn(options, "updateData")
                  ? options.updateData
                  : { id: payload?.id ?? writeTargetId ?? manual.id };
            const error = table === "customers" && operation === "insert" && Object.hasOwn(options, "customerInsertError")
              ? options.customerInsertError
              : operation === "insert" && Object.hasOwn(options, "insertError")
                ? options.insertError
                : options.updateError ?? null;
            return Promise.resolve({ data, error }).then(resolve, reject);
          }
          const deterministicId = filters.find(([key]) => key === "id")?.[1];
          const externalCustomer = options.concurrentExternalCustomer &&
              writes.some((write) => write.table === "customers" && write.operation === "insert")
            ? options.concurrentExternalCustomer
            : options.existingExternalCustomer ?? null;
          const existingReservationCustomer = options.existingReservationCustomer === null
            ? null
            : options.existingReservationCustomer ?? (manualCustomerId
              ? {
                  id: manualCustomerId,
                  salon_id: "salon-1",
                  name: manualCustomerId === "mail-customer"
                    ? "テスト顧客"
                    : "スタッフ修正顧客",
                }
              : null);
          if (pageLimit !== null) {
            if (table === "customers") customerReadCursors.push(idCursor);
            if (table === "reservations" && externalLookup) {
              reservationReadCursors.push(idCursor);
            } else if (table === "reservations") {
              manualReservationReadCursors.push(idCursor);
            }
          }
          if (
            table === "customers" &&
            pageLimit !== null &&
            options.customerReadErrorAfterId === idCursor
          ) {
            return Promise.resolve({
              data: null,
              error: { message: "fixture customer page rejected" },
            }).then(resolve, reject);
          }
          if (
            table === "reservations" &&
            externalLookup &&
            pageLimit !== null &&
            options.reservationReadErrorAfterId === idCursor
          ) {
            return Promise.resolve({
              data: null,
              error: { message: "fixture reservation page rejected" },
            }).then(resolve, reject);
          }
          if (
            table === "reservations" &&
            !externalLookup &&
            pageLimit !== null &&
            options.manualReservationReadErrorAfterId === idCursor
          ) {
            return Promise.resolve({
              data: null,
              error: { message: "fixture manual reservation page rejected" },
            }).then(resolve, reject);
          }
          const paginate = (rows) => {
            if (pageLimit === null) return rows;
            const ordered = [...rows].sort((left, right) =>
              String(left.id).localeCompare(String(right.id))
            );
            const remaining = idCursor
              ? ordered.filter((row) => String(row.id) > idCursor)
              : ordered;
            const responseLimit = Math.min(
              pageLimit,
              options.dataApiMaxRows ?? pageLimit
            );
            return remaining.slice(0, responseLimit);
          };
          const data = table === "salons" ? [{ id: "salon-1" }]
            : table === "staffs" ? options.staffRows ?? []
            : table === "customers" ? (deterministicId
                ? deterministicId === manualCustomerId && options.existing
                  ? existingReservationCustomer
                  : externalCustomer
                : (() => {
                    const rows = options.customerRows ?? [customer];
                    return paginate(rows);
                  })())
              : table === "reservations" ? (externalLookup && Array.isArray(options.externalReservationRows)
                  ? paginate(options.externalReservationRows)
                  : deterministicId && options.concurrentReservation &&
                    writes.some((write) => write.operation === "insert")
                  ? { ...manual, ...options.concurrentReservation, id: deterministicId }
                  : options.missingReservation ||
                    (externalLookup && options.externalLookupMissing) ||
                    (deterministicId &&
                      options.deterministicReservationMissing &&
                      writes.length === 0)
                    ? []
                    : deterministicId
                      ? { ...manual, id: deterministicId }
                    : externalLookup && !options.existing ? []
                      : Array.isArray(options.manualReservationRows)
                        ? paginate(options.manualReservationRows)
                        : paginate([{ ...manual }]))
                : [];
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  function load(path) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    const compiled = ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    } }).outputText;
    const exports = {};
    vm.runInNewContext(compiled, {
      exports,
      process: { env: {
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "fixture-only",
      } },
      require(name) {
        if (name === "server-only") return {};
        if (name === "@supabase/supabase-js") return { createClient: () => db };
        if (name.startsWith("@/lib/")) return load(`../${name.slice(2)}.ts`);
        return require(name);
      },
    });
    return exports;
  }
  return {
    sync: load("../lib/hpb-mail-sync.ts").syncHpbMailText,
    writes,
    customerReadCursors,
    reservationReadCursors,
    manualReservationReadCursors,
    reservationLookupPatterns,
  };
}

for (const cancelling of [false, true]) {
  for (const [reason, response] of [
    ["no updated row", { updateData: null }],
    ["unexpected row", { updateData: { id: "other-reservation" } }],
    ["database error", { updateError: { message: "fixture update rejected" } }],
  ]) {
    test(`${cancelling ? "cancellation" : "delayed update"} does not report success for ${reason}`, async () => {
      const runtime = loadSync("mail-customer", { existing: cancelling, ...response });
      await assert.rejects(
        runtime.sync(cancelling ? `ご予約のキャンセル\n${mail}` : mail),
        /更新結果を確認できません|fixture update rejected/
      );
      assert.equal(runtime.writes.length, 1);
      assert.equal(runtime.writes[0].operation, "update");
    });
  }
}

test("cancellation reports success only for the returned target reservation", async () => {
  const runtime = loadSync("mail-customer", { existing: true });
  const result = await runtime.sync(`ご予約のキャンセル\n${mail}`);
  assert.equal(result.result.mode, "cancelled");
  assert.equal(runtime.writes[0].selected, "id");
  assert.deepEqual(runtime.writes[0].filters, [
    ["id", "manual-reservation"],
    ["salon_id", "salon-1"],
    ["status", "confirmed"],
    ["memo", "HPB予約番号：A123456"],
  ]);
});

test("HPB cancellation in the Gmail subject is not replayed as a booking", async () => {
  const runtime = loadSync("mail-customer", { existing: true });
  const result = await runtime.sync(
    mail,
    "【SALON BOARD】予約キャンセルのお知らせ"
  );

  assert.equal(result.parsed.action, "cancel");
  assert.equal(result.result.mode, "cancelled");
  assert.equal(runtime.writes.length, 1);
  assert.equal(runtime.writes[0].payload.status, "キャンセル");
  assert.doesNotMatch(runtime.writes[0].payload.memo, /SALON BOARD/);
});

test("minimo cancellation in the Gmail subject is not replayed as a booking", async () => {
  const runtime = loadSync("mail-customer", {
    existing: true,
    memo: "ミニモ予約ID：MINIMO-123",
  });
  const result = await runtime.sync(
    `予約ID：MINIMO-123
氏名：テスト顧客
電話番号：09000000000
来店日時：2099年10月20日 10:00
担当者：指名なし
施術時間：90分`,
    "【ミニモ】予約キャンセルのお知らせ"
  );

  assert.equal(result.parsed.source, "minimo");
  assert.equal(result.parsed.action, "cancel");
  assert.equal(result.result.mode, "cancelled");
  assert.equal(runtime.writes.length, 1);
  assert.equal(runtime.writes[0].payload.status, "キャンセル");
  assert.doesNotMatch(runtime.writes[0].payload.memo, /予約キャンセルのお知らせ/);
});

test("HPB reservation subject keeps a customer cancellation note from cancelling the booking", async () => {
  const runtime = loadSync("mail-customer", { existing: true });
  const result = await runtime.sync(
    `予約番号：A123456
氏名：テスト顧客
電話番号：09000000000
来店日時：2099年10月20日 10:00
所要時間目安：90分
ご要望：前回のご予約のキャンセルについて相談したい`,
    "【SALON BOARD】ご予約内容のお知らせ"
  );

  assert.equal(result.parsed.source, "hpb");
  assert.equal(result.parsed.action, "reservation");
  assert.equal(result.result.mode, "updated");
  assert.equal(runtime.writes[0].payload.status, "confirmed");
});

test("minimo reservation subject keeps cancellation wording in the menu from cancelling the booking", async () => {
  const runtime = loadSync("mail-customer", {
    existing: true,
    memo: "ミニモ予約ID：MINIMO-123",
  });
  const result = await runtime.sync(
    `予約ID：MINIMO-123
氏名：テスト顧客
電話番号：09000000000
来店日時：2099年10月20日 10:00
施術時間：90分
メニュー：キャンセル理由相談つきネイル`,
    "【ミニモ】新しい予約を受け付けました"
  );

  assert.equal(result.parsed.source, "minimo");
  assert.equal(result.parsed.action, "reservation");
  assert.equal(result.result.mode, "updated");
  assert.equal(runtime.writes[0].payload.status, "confirmed");
});

test("HPB request text does not cancel a forwarded booking with a generic subject", async () => {
  const runtime = loadSync("mail-customer", { existing: true });
  const result = await runtime.sync(
    `予約番号：A123456
氏名：テスト顧客
電話番号：09000000000
来店日時：2099年10月20日 10:00
所要時間目安：90分
ご要望：前回のご予約のキャンセルについて相談したい`,
    "Fwd: 予約のお知らせ"
  );

  assert.equal(result.parsed.source, "hpb");
  assert.equal(result.parsed.action, "reservation");
  assert.equal(result.result.mode, "updated");
  assert.equal(runtime.writes[0].payload.status, "confirmed");
});

test("minimo menu text does not cancel a forwarded booking with a generic subject", async () => {
  const runtime = loadSync("mail-customer", {
    existing: true,
    memo: "ミニモ予約ID：MINIMO-123",
  });
  const result = await runtime.sync(
    `予約ID：MINIMO-123
氏名：テスト顧客
電話番号：09000000000
来店日時：2099年10月20日 10:00
施術時間：90分
メニュー：キャンセル理由相談つきネイル`,
    "Fwd: 予約のお知らせ"
  );

  assert.equal(result.parsed.source, "minimo");
  assert.equal(result.parsed.action, "reservation");
  assert.equal(result.result.mode, "updated");
  assert.equal(runtime.writes[0].payload.status, "confirmed");
});

test("HPB source markers take priority over an unrelated reservation ID field", async () => {
  const runtime = loadSync("mail-customer", { existing: true });
  const result = await runtime.sync(
    `SALON BOARD 予約受付
予約番号：A123456
連携用予約ID：PORTAL-999
氏名：テスト顧客
電話番号：09000000000
来店日時：2099年10月20日 10:00
所要時間目安：90分`,
    "HOT PEPPER Beauty ご予約内容のお知らせ"
  );

  assert.equal(result.parsed.source, "hpb");
  assert.equal(result.parsed.reservationNumber, "A123456");
  assert.equal(result.result.mode, "updated");
  assert.match(runtime.writes[0].payload.memo, /^HPB予約番号：A123456/m);
  assert.doesNotMatch(runtime.writes[0].payload.memo, /^ミニモ予約ID/m);
});

test("HPB subject keeps customer notes mentioning minimo from changing the provider", async () => {
  const runtime = loadSync("mail-customer", { existing: true });
  const result = await runtime.sync(
    `予約番号：A123456
氏名：テスト顧客
電話番号：09000000000
来店日時：2099年10月20日 10:00
所要時間目安：90分
ご要望：ミニモで見たデザインを希望`,
    "【SALON BOARD】ご予約内容のお知らせ"
  );

  assert.equal(result.parsed.source, "hpb");
  assert.equal(result.parsed.reservationNumber, "A123456");
  assert.equal(result.result.mode, "updated");
  assert.match(runtime.writes[0].payload.memo, /^HPB予約番号：A123456/m);
  assert.doesNotMatch(runtime.writes[0].payload.memo, /^ミニモ予約ID/m);
});

test("HPB reservation number keeps a generic subject and minimo customer note on HPB", async () => {
  const runtime = loadSync("mail-customer", { existing: true });
  const result = await runtime.sync(
    `予約番号：A123456
氏名：テスト顧客
電話番号：09000000000
来店日時：2099年10月20日 10:00
所要時間目安：90分
ご要望：ミニモで見たデザインを希望`,
    "ご予約内容のお知らせ"
  );

  assert.equal(result.parsed.source, "hpb");
  assert.equal(result.parsed.reservationNumber, "A123456");
  assert.equal(result.result.mode, "updated");
  assert.match(runtime.writes[0].payload.memo, /^HPB予約番号：A123456/m);
  assert.doesNotMatch(runtime.writes[0].payload.memo, /^ミニモ予約ID/m);
});

test("copied HPB reservation number keeps a generic subject and minimo customer note on HPB", async () => {
  const runtime = loadSync("mail-customer", { existing: true });
  const result = await runtime.sync(
    `予約番号：Ａ \u200B１ ２３ ４５６
氏名：テスト顧客
電話番号：09000000000
来店日時：2099年10月20日 10:00
所要時間目安：90分
ご要望：ミニモで見たデザインを希望`,
    "ご予約内容のお知らせ"
  );

  assert.equal(result.parsed.source, "hpb");
  assert.equal(result.parsed.reservationNumber, "A123456");
  assert.equal(result.result.mode, "updated");
  assert.equal(result.result.reservationId, "manual-reservation");
  assert.match(runtime.writes[0].payload.memo, /^HPB予約番号：A123456/m);
  assert.doesNotMatch(runtime.writes[0].payload.memo, /^ミニモ予約ID/m);
});

for (const subject of [
  "【サロンボード】ご予約内容のお知らせ",
  "【ホットペッパービューティー】ご予約内容のお知らせ",
  "【ホットペッパーBeauty】ご予約内容のお知らせ",
]) {
  test(`${subject} keeps customer notes mentioning minimo from changing the provider`, async () => {
    const runtime = loadSync("mail-customer", { existing: true });
    const result = await runtime.sync(
      `予約番号：A123456
氏名：テスト顧客
電話番号：09000000000
来店日時：2099年10月20日 10:00
所要時間目安：90分
ご要望：ミニモで見たデザインを希望`,
      subject
    );

    assert.equal(result.parsed.source, "hpb");
    assert.equal(result.parsed.reservationNumber, "A123456");
    assert.equal(result.result.mode, "updated");
    assert.match(runtime.writes[0].payload.memo, /^HPB予約番号：A123456/m);
    assert.doesNotMatch(runtime.writes[0].payload.memo, /^ミニモ予約ID/m);
  });
}

test("minimo subject keeps menu text mentioning HPB from changing the provider", async () => {
  const runtime = loadSync("mail-customer", {
    existing: true,
    memo: "ミニモ予約ID：MINIMO-123",
  });
  const result = await runtime.sync(
    `予約ID：MINIMO-123
氏名：テスト顧客
電話番号：09000000000
来店日時：2099年10月20日 10:00
施術時間：90分
メニュー：HOT PEPPER Beauty掲載デザイン`,
    "【ミニモ】新しい予約を受け付けました"
  );

  assert.equal(result.parsed.source, "minimo");
  assert.equal(result.parsed.reservationNumber, "MINIMO-123");
  assert.equal(result.result.mode, "updated");
  assert.match(runtime.writes[0].payload.memo, /^ミニモ予約ID：MINIMO-123/m);
  assert.doesNotMatch(runtime.writes[0].payload.memo, /^HPB予約番号/m);
});

test("minimo reservation ID keeps a generic subject and HPB menu text on minimo", async () => {
  const runtime = loadSync("mail-customer", {
    existing: true,
    memo: "ミニモ予約ID：MINIMO-123",
  });
  const result = await runtime.sync(
    `予約ID：MINIMO-123
氏名：テスト顧客
電話番号：09000000000
来店日時：2099年10月20日 10:00
施術時間：90分
メニュー：HOT PEPPER Beauty掲載デザイン`,
    "ご予約内容のお知らせ"
  );

  assert.equal(result.parsed.source, "minimo");
  assert.equal(result.parsed.reservationNumber, "MINIMO-123");
  assert.equal(result.result.mode, "updated");
  assert.match(runtime.writes[0].payload.memo, /^ミニモ予約ID：MINIMO-123/m);
  assert.doesNotMatch(runtime.writes[0].payload.memo, /^HPB予約番号/m);
});

for (const [source, body, subject, memo] of [
  [
    "HPB",
    `予約番号：A123456
氏名：テスト顧客
電話番号：非公開
来店日時：2099年10月20日 10:00
所要時間目安：未定`,
    "【SALON BOARD】予約キャンセルのお知らせ",
    "HPB予約番号：A123456",
  ],
  [
    "minimo",
    `ミニモ予約受付
予約ID：MINIMO-123
氏名：テスト顧客
電話番号：非公開
来店日時：2099年10月20日 10:00
施術時間：未定`,
    "【ミニモ】予約キャンセルのお知らせ",
    "ミニモ予約ID：MINIMO-123",
  ],
]) {
  test(`${source} cancellation ignores malformed optional customer details for an existing reservation`, async () => {
    const runtime = loadSync("mail-customer", { existing: true, memo });

    const result = await runtime.sync(body, subject);

    assert.equal(result.parsed.action, "cancel");
    assert.equal(result.result.mode, "cancelled");
    assert.equal(runtime.writes.length, 1);
    assert.equal(runtime.writes[0].payload.status, "キャンセル");
  });

  test(`${source} cancellation with an invalid duration does not create an unmatched cancellation`, async () => {
    const runtime = loadSync("mail-customer", { missingReservation: true });

    await assert.rejects(
      runtime.sync(body, subject),
      /氏名と来店日時が不足しています/
    );
    assert.equal(runtime.writes.length, 0);
  });
}

for (const [source, body, subject, memo] of [
  [
    "HPB",
    "予約番号：A123456",
    "【SALON BOARD】予約キャンセルのお知らせ",
    "HPB予約番号：A123456",
  ],
  [
    "minimo",
    "予約ID：MINIMO-123",
    "【ミニモ】予約キャンセルのお知らせ",
    "ミニモ予約ID：MINIMO-123",
  ],
]) {
  test(`${source} cancellation with only its external ID cancels the existing reservation`, async () => {
    const runtime = loadSync("mail-customer", {
      existing: true,
      memo,
      rejectCustomerLookup: true,
    });

    const result = await runtime.sync(body, subject);

    assert.equal(result.parsed.action, "cancel");
    assert.equal(result.result.mode, "cancelled");
    assert.equal(runtime.writes.length, 1);
    assert.equal(runtime.writes[0].operation, "update");
    assert.equal(runtime.writes[0].payload.status, "キャンセル");
  });

  test(`${source} cancellation with only its external ID stops when no reservation exists`, async () => {
    const runtime = loadSync("mail-customer", {
      missingReservation: true,
      rejectCustomerLookup: true,
    });

    await assert.rejects(
      runtime.sync(body, subject),
      /氏名と来店日時が不足しています/
    );
    assert.equal(runtime.writes.length, 0);
  });
}

const mail = `予約番号：A123456
氏名：テスト顧客
電話番号：09000000000
来店日時：2099年10月20日 10:00
指名スタッフ：指名なし
所要時間目安：90分`;

const namedStaffMail = mail.replace(
  "指名スタッフ：指名なし",
  "指名スタッフ：退職スタッフ"
);

test("HPB mail normalizes full-width and lowercase booking identifiers before matching", async () => {
  const runtime = loadSync("mail-customer", { existing: true });
  const result = await runtime.sync(
    mail
      .replace("A123456", "ａ１２３４５６")
      .replace("2099年10月20日 10:00", "２０９９年１０月２０日 １０：００")
      .replace("90分", "９０分")
  );

  assert.equal(result.parsed.reservationNumber, "A123456");
  assert.equal(result.parsed.startAt, "2099-10-20T01:00:00.000Z");
  assert.equal(result.parsed.endAt, "2099-10-20T02:30:00.000Z");
  assert.equal(result.result.reservationId, "manual-reservation");
  assert.equal(runtime.writes.length, 1);
  assert.equal(runtime.writes[0].operation, "update");
  assert.match(runtime.writes[0].payload.memo, /予約番号：ａ１２３４５６/);
});

test("HPB mail matches an existing booking when copied ID separators are mixed", async () => {
  const runtime = loadSync("mail-customer", { existing: true });
  const result = await runtime.sync(
    mail.replace("A123456", "Ａ \u200B１ ２３ ４５６")
  );

  assert.equal(result.parsed.reservationNumber, "A123456");
  assert.equal(result.result.reservationId, "manual-reservation");
  assert.equal(runtime.writes.length, 1);
  assert.equal(runtime.writes[0].operation, "update");
});

test("HPB mail does not accept a partial booking number before another identifier character", async () => {
  const runtime = loadSync("mail-customer", {
    rejectDatabaseAccess: true,
  });

  await assert.rejects(
    runtime.sync(mail.replace("A123456", "A 123456 X")),
    /予約番号を解析できませんでした/
  );
  assert.equal(runtime.writes.length, 0);
});

test("minimo mail normalizes full-width source markers, IDs and date fields", async () => {
  const runtime = loadSync("mail-customer", {
    existing: true,
    memo: "ミニモ予約ID：MINIMO-123",
  });
  const result = await runtime.sync(`ＭＩＮＩＭＯ予約受付
予約ＩＤ：ＭＩＮＩＭＯ－１２３
氏名：テスト顧客
電話番号：０９０００００００００
来店日時：２０９９年１０月２０日 １０：００
担当者：指名なし
施術時間：９０分`);

  assert.equal(result.parsed.source, "minimo");
  assert.equal(result.parsed.reservationNumber, "MINIMO-123");
  assert.equal(result.parsed.startAt, "2099-10-20T01:00:00.000Z");
  assert.equal(result.parsed.endAt, "2099-10-20T02:30:00.000Z");
  assert.equal(result.result.reservationId, "manual-reservation");
  assert.equal(runtime.writes.length, 1);
  assert.equal(runtime.writes[0].operation, "update");
});

test("minimo mail matches an existing booking when copied ID separators are mixed", async () => {
  const runtime = loadSync("mail-customer", {
    existing: true,
    memo: "ミニモ予約ID：MINIMO-123",
  });
  const result = await runtime.sync(`ミニモ予約受付
予約ID：ＭＩＮＩＭＯ - \u200B１２３
氏名：テスト顧客
電話番号：09000000000
来店日時：2099年10月20日 10:00
担当者：指名なし
施術時間：90分`);

  assert.equal(result.parsed.reservationNumber, "MINIMO-123");
  assert.equal(result.result.reservationId, "manual-reservation");
  assert.equal(runtime.writes.length, 1);
  assert.equal(runtime.writes[0].operation, "update");
});

test("minimo replay adopts a legacy full-width lowercase reservation marker", async () => {
  const runtime = loadSync("mail-customer", {
    existing: true,
    memo: "ミニモ予約ＩＤ：ｍｉｎｉｍｏ－１２３",
  });
  const result = await runtime.sync(`ミニモ予約受付
予約ID：minimo-123
氏名：テスト顧客
電話番号：09000000000
来店日時：2099年10月20日 10:00
担当者：指名なし
施術時間：90分`);

  assert.equal(result.parsed.reservationNumber, "MINIMO-123");
  assert.equal(result.result.reservationId, "manual-reservation");
  assert.equal(runtime.writes.length, 1);
  assert.deepEqual(runtime.reservationLookupPatterns, [
    "%ミニモ予約%",
    "%ミニモ予約%",
  ]);
  assert.equal(runtime.writes[0].operation, "update");
});

test("HPB lookup does not require one historical colon spelling", async () => {
  const runtime = loadSync("mail-customer", {
    existing: true,
    memo: "HPB予約番号:A123456",
  });

  const result = await runtime.sync(`予約番号：A123456
氏名：テスト顧客
電話番号：09000000000
来店日時：2099年10月20日 10:00
施術時間：90分`);

  assert.equal(result.result.reservationId, "manual-reservation");
  assert.deepEqual(runtime.reservationLookupPatterns, [
    "%予約番号%",
    "%予約番号%",
  ]);
  assert.equal(runtime.writes[0].operation, "update");
});

test("HPB replay adopts a legacy full-width source marker", async () => {
  const runtime = loadSync("mail-customer", {
    existing: true,
    memo: "ＨＰＢ予約番号：ａ１２３４５６",
  });

  const result = await runtime.sync(`予約番号：A123456
氏名：テスト顧客
電話番号：09000000000
来店日時：2099年10月20日 10:00
施術時間：90分`);

  assert.equal(result.result.reservationId, "manual-reservation");
  assert.deepEqual(runtime.reservationLookupPatterns, [
    "%予約番号%",
    "%予約番号%",
  ]);
  assert.equal(runtime.writes[0].operation, "update");
});

test("external reservation lookup reads the 501st row when Data API max_rows is 500", async () => {
  const unrelated = Array.from({ length: 500 }, (_, index) => ({
    id: `external-${String(index).padStart(4, "0")}`,
    customer_id: "mail-customer",
    staff_id: null,
    salon_id: "salon-1",
    menu: "ミニモ予約",
    memo: `ミニモ予約ID：OTHER-${index}`,
    status: "confirmed",
    start_at: "2099-10-20T01:00:00.000Z",
    end_at: "2099-10-20T02:30:00.000Z",
  }));
  const target = {
    id: "external-0500-target",
    customer_id: "mail-customer",
    staff_id: null,
    salon_id: "salon-1",
    menu: "ミニモ予約",
    memo: "ミニモ予約ＩＤ：ｍｉｎｉｍｏ－１２３",
    status: "confirmed",
    start_at: "2099-10-20T01:00:00.000Z",
    end_at: "2099-10-20T02:30:00.000Z",
  };
  const runtime = loadSync("mail-customer", {
    existing: true,
    externalReservationRows: [...unrelated, target],
    dataApiMaxRows: 500,
  });

  const result = await runtime.sync(`ミニモ予約受付
予約ID：MINIMO-123
氏名：テスト顧客
電話番号：09000000000
来店日時：2099年10月20日 10:00
担当者：指名なし
施術時間：90分`);

  assert.equal(result.result.reservationId, "external-0500-target");
  assert.deepEqual(runtime.reservationReadCursors, [
    null,
    "external-0499",
    "external-0500-target",
  ]);
  assert.equal(runtime.writes[0].operation, "update");
});

test("external reservation lookup fails closed when a cursor page cannot be read", async () => {
  const firstPage = Array.from({ length: 500 }, (_, index) => ({
    id: `external-${String(index).padStart(4, "0")}`,
    memo: `ミニモ予約ID：OTHER-${index}`,
  }));
  const runtime = loadSync("mail-customer", {
    existing: true,
    externalReservationRows: firstPage,
    dataApiMaxRows: 500,
    reservationReadErrorAfterId: "external-0499",
  });

  await assert.rejects(
    runtime.sync(`ミニモ予約受付
予約ID：MINIMO-123
氏名：テスト顧客
電話番号：09000000000
来店日時：2099年10月20日 10:00
担当者：指名なし
施術時間：90分`),
    /fixture reservation page rejected/
  );
  assert.equal(runtime.writes.length, 0);
});

test("manual reservation lookup reads the 501st row when Data API max_rows is 500", async () => {
  const unrelated = Array.from({ length: 500 }, (_, index) => ({
    id: `manual-${String(index).padStart(4, "0")}`,
    customer_id: `other-customer-${index}`,
    staff_id: null,
    salon_id: "salon-1",
    menu: "HPB予約",
    memo: "HPBから電話で先に登録",
    status: "confirmed",
    start_at: "2099-10-20T01:00:00.000Z",
    end_at: "2099-10-20T02:30:00.000Z",
  }));
  const runtime = loadSync(null, {
    externalLookupMissing: true,
    deterministicReservationMissing: true,
    manualReservationRows: [
      ...unrelated,
      {
        id: "manual-0500-target",
        customer_id: "mail-customer",
        staff_id: null,
        salon_id: "salon-1",
        menu: "HPB予約",
        memo: "HPBから電話で先に登録",
        status: "confirmed",
        start_at: "2099-10-20T01:00:00.000Z",
        end_at: "2099-10-20T02:30:00.000Z",
      },
    ],
    dataApiMaxRows: 500,
  });

  const result = await runtime.sync(mail);

  assert.equal(result.result.reservationId, "manual-0500-target");
  assert.equal(result.result.reconciledManualEntry, true);
  assert.deepEqual(runtime.manualReservationReadCursors, [
    null,
    "manual-0499",
    "manual-0500-target",
  ]);
  assert.equal(runtime.writes.length, 1);
  assert.equal(runtime.writes[0].operation, "update");
});

test("manual reservation lookup fails closed when a cursor page cannot be read", async () => {
  const firstPage = Array.from({ length: 500 }, (_, index) => ({
    id: `manual-${String(index).padStart(4, "0")}`,
    customer_id: `other-customer-${index}`,
    staff_id: null,
    salon_id: "salon-1",
    menu: "HPB予約",
    memo: "HPBから電話で先に登録",
    status: "confirmed",
    start_at: "2099-10-20T01:00:00.000Z",
    end_at: "2099-10-20T02:30:00.000Z",
  }));
  const runtime = loadSync(null, {
    externalLookupMissing: true,
    deterministicReservationMissing: true,
    manualReservationRows: firstPage,
    dataApiMaxRows: 500,
    manualReservationReadErrorAfterId: "manual-0499",
  });

  await assert.rejects(
    runtime.sync(mail),
    /fixture manual reservation page rejected/
  );
  assert.deepEqual(runtime.manualReservationReadCursors, [
    null,
    "manual-0499",
  ]);
  assert.equal(runtime.writes.length, 0);
});

for (const [label, invalidDateTime] of [
  ["an impossible calendar date", "2099年2月30日 10:00"],
  ["an out-of-range month", "2099年13月20日 10:00"],
  ["an out-of-range hour", "2099年10月20日 24:00"],
  ["an out-of-range minute", "2099年10月20日 10:60"],
]) {
  test(`HPB mail rejects ${label} before database access`, async () => {
    const runtime = loadSync("mail-customer", { rejectDatabaseAccess: true });
    await assert.rejects(
      runtime.sync(mail.replace("2099年10月20日 10:00", invalidDateTime)),
      /来店日時を解析できませんでした/
    );
    assert.equal(runtime.writes.length, 0);
  });
}

test("minimo mail rejects an impossible calendar date before database access", async () => {
  const runtime = loadSync("mail-customer", { rejectDatabaseAccess: true });
  await assert.rejects(
    runtime.sync(`ミニモ予約受付
予約ID：MINIMO-123
氏名：テスト顧客
電話番号：09000000000
来店日時：2099年2月30日 10:00
担当者：指名なし
施術時間：90分`),
    /ミニモ来店日時を解析できませんでした/
  );
  assert.equal(runtime.writes.length, 0);
});

for (const [label, invalidDuration] of [
  ["zero minutes", "0分"],
  ["more than one day", "1441分"],
  ["an out-of-range minute component", "1時間60分"],
  ["an unparseable explicit value", "未定"],
]) {
  test(`HPB mail rejects ${label} before database access`, async () => {
    const runtime = loadSync("mail-customer", { rejectDatabaseAccess: true });
    await assert.rejects(
      runtime.sync(mail.replace("90分", invalidDuration)),
      /予約所要時間を解析できませんでした/
    );
    assert.equal(runtime.writes.length, 0);
  });
}

test("minimo mail rejects an invalid explicit duration before database access", async () => {
  const runtime = loadSync("mail-customer", { rejectDatabaseAccess: true });
  await assert.rejects(
    runtime.sync(`ミニモ予約受付
予約ID：MINIMO-123
氏名：テスト顧客
電話番号：09000000000
来店日時：2099年10月20日 10:00
担当者：指名なし
施術時間：0分`),
    /予約所要時間を解析できませんでした/
  );
  assert.equal(runtime.writes.length, 0);
});

test("minimo mail accepts an hours-and-minutes duration", async () => {
  const runtime = loadSync("mail-customer");
  const result = await runtime.sync(`ミニモ予約受付
予約ID：MINIMO-123
氏名：テスト顧客
電話番号：09000000000
来店日時：2099年10月20日 10:00
担当者：指名なし
施術時間：1時間30分`);

  assert.equal(result.parsed.startAt, "2099-10-20T01:00:00.000Z");
  assert.equal(result.parsed.endAt, "2099-10-20T02:30:00.000Z");
});

test("booking mail without a duration keeps the compatibility default", async () => {
  const runtime = loadSync("mail-customer");
  const result = await runtime.sync(
    mail.replace("\n所要時間目安：90分", "")
  );

  assert.equal(result.parsed.startAt, "2099-10-20T01:00:00.000Z");
  assert.equal(result.parsed.endAt, "2099-10-20T02:30:00.000Z");
});

test("replaying the original booking after cancellation does not reactivate it", async () => {
  const initial = loadSync("mail-customer");
  await initial.sync(mail);
  const cancellation = loadSync("mail-customer", {
    existing: true, memo: initial.writes[0].payload.memo,
  });
  await cancellation.sync(`ご予約のキャンセル\n${mail}`);
  const cancelled = cancellation.writes[0].payload;
  const replay = loadSync("mail-customer", {
    existing: true, memo: cancelled.memo, status: cancelled.status,
  });
  const result = await replay.sync(mail);
  assert.equal(replay.writes.length, 0);
  assert.equal(result.result.mode, "cancelled");
  assert.equal(result.result.reservationId, "manual-reservation");
  assert.equal(result.result.alreadyCancelled, true);
});

test("a cancellation committed during an existing booking update wins the race", async () => {
  const runtime = loadSync("mail-customer", {
    existing: true,
    updateData: null,
    latestStatusOnUpdate: "キャンセル",
  });

  const result = await runtime.sync(mail);

  assert.equal(result.result.mode, "cancelled");
  assert.equal(result.result.alreadyCancelled, true);
  assert.equal(result.result.reservationId, "manual-reservation");
  assert.equal(runtime.writes.length, 1);
  assert.deepEqual(runtime.writes[0].filters, [
    ["id", "manual-reservation"],
    ["salon_id", "salon-1"],
    ["status", "confirmed"],
    ["memo", "HPB予約番号：A123456"],
    ["start_at", "2099-10-20T01:00:00.000Z"],
    ["end_at", "2099-10-20T02:30:00.000Z"],
    ["customer_id", "mail-customer"],
    ["staff_id", null],
    ["menu", "HPB予約"],
  ]);
});

test("booking sync stops instead of overwriting a concurrently edited staff memo", async () => {
  const latestMemo = "HPB予約番号：A123456\nスタッフが直前に追記";
  const runtime = loadSync("mail-customer", {
    existing: true,
    latestMemoOnUpdate: latestMemo,
    updateData: null,
  });

  await assert.rejects(runtime.sync(mail), /スタッフの追記を保護/);

  assert.equal(runtime.writes.length, 1);
  assert.deepEqual(runtime.writes[0].filters, [
    ["id", "manual-reservation"],
    ["salon_id", "salon-1"],
    ["status", "confirmed"],
    ["memo", "HPB予約番号：A123456"],
    ["start_at", "2099-10-20T01:00:00.000Z"],
    ["end_at", "2099-10-20T02:30:00.000Z"],
    ["customer_id", "mail-customer"],
    ["staff_id", null],
    ["menu", "HPB予約"],
  ]);
});

test("booking sync stops instead of overwriting a concurrently moved reservation", async () => {
  const runtime = loadSync("mail-customer", {
    existing: true,
    latestStartAtOnUpdate: "2099-10-20T01:30:00.000Z",
    latestEndAtOnUpdate: "2099-10-20T03:00:00.000Z",
    updateData: null,
  });

  await assert.rejects(runtime.sync(mail), /予約日時が変更されました/);

  assert.equal(runtime.writes.length, 1);
  assert.deepEqual(runtime.writes[0].filters, [
    ["id", "manual-reservation"],
    ["salon_id", "salon-1"],
    ["status", "confirmed"],
    ["memo", "HPB予約番号：A123456"],
    ["start_at", "2099-10-20T01:00:00.000Z"],
    ["end_at", "2099-10-20T02:30:00.000Z"],
    ["customer_id", "mail-customer"],
    ["staff_id", null],
    ["menu", "HPB予約"],
  ]);
});

test("booking sync stops instead of overwriting a concurrently corrected customer link", async () => {
  const runtime = loadSync("mail-customer", {
    existing: true,
    latestCustomerIdOnUpdate: "staff-corrected-customer",
    updateData: null,
  });

  await assert.rejects(runtime.sync(mail), /顧客紐付けが変更されました/);

  assert.equal(runtime.writes.length, 1);
  assert.deepEqual(runtime.writes[0].filters, [
    ["id", "manual-reservation"],
    ["salon_id", "salon-1"],
    ["status", "confirmed"],
    ["memo", "HPB予約番号：A123456"],
    ["start_at", "2099-10-20T01:00:00.000Z"],
    ["end_at", "2099-10-20T02:30:00.000Z"],
    ["customer_id", "mail-customer"],
    ["staff_id", null],
    ["menu", "HPB予約"],
  ]);
});

test("booking sync stops instead of overwriting a concurrently corrected staff assignment", async () => {
  const runtime = loadSync("mail-customer", {
    existing: true,
    latestStaffIdOnUpdate: "staff-corrected-assignment",
    updateData: null,
  });

  await assert.rejects(runtime.sync(mail), /担当スタッフが変更されました/);

  assert.equal(runtime.writes.length, 1);
});

test("booking sync stops instead of overwriting a concurrently corrected menu", async () => {
  const runtime = loadSync("mail-customer", {
    existing: true,
    latestMenuOnUpdate: "スタッフ修正メニュー",
    updateData: null,
  });

  await assert.rejects(runtime.sync(mail), /メニューが変更されました/);

  assert.equal(runtime.writes.length, 1);
});

test("a cancellation retry preserves staff notes saved during the first update", async () => {
  const latestMemo = "HPB予約番号：A123456\nスタッフが直前に追記";
  const runtime = loadSync("mail-customer", {
    existing: true,
    latestMemoOnUpdate: latestMemo,
    updateDataSequence: [null, { id: "manual-reservation" }],
  });

  const result = await runtime.sync(`ご予約のキャンセル\n${mail}`);

  assert.equal(result.result.mode, "cancelled");
  assert.equal(runtime.writes.length, 2);
  assert.match(runtime.writes[1].payload.memo, /スタッフが直前に追記/);
  assert.match(runtime.writes[1].payload.memo, /【HPBキャンセルメール本文】/);
  assert.deepEqual(runtime.writes[1].filters, [
    ["id", "manual-reservation"],
    ["salon_id", "salon-1"],
    ["status", "confirmed"],
    ["memo", latestMemo],
  ]);
});

test("a cancellation retry stops after a second concurrent reservation change", async () => {
  const runtime = loadSync("mail-customer", {
    existing: true,
    latestMemoOnUpdate: "HPB予約番号：A123456\nスタッフが直前に追記",
    updateDataSequence: [null, null],
  });

  await assert.rejects(
    runtime.sync(`ご予約のキャンセル\n${mail}`),
    /続けて変更されました/
  );
  assert.equal(runtime.writes.length, 2);
});

test("a cancellation received before its booking creates a customer-linked persistent tombstone", async () => {
  const cancellation = loadSync("mail-customer", {
    missingReservation: true,
  });
  const result = await cancellation.sync(`ご予約のキャンセル\n${mail}`);

  assert.equal(result.result.mode, "cancelled");
  assert.equal(result.result.createdCancellation, true);
  assert.equal(cancellation.writes.length, 1);
  assert.equal(cancellation.writes[0].operation, "insert");
  assert.equal(cancellation.writes[0].payload.status, "キャンセル");
  assert.equal(cancellation.writes[0].payload.salon_id, "salon-1");
  assert.equal(cancellation.writes[0].payload.customer_id, "mail-customer");
  assert.match(cancellation.writes[0].payload.memo, /^HPB予約番号：A123456/m);
  assert.match(cancellation.writes[0].payload.memo, /【HPBキャンセルメール本文】/);

  const replay = loadSync("mail-customer", {
    existing: true,
    status: cancellation.writes[0].payload.status,
    memo: cancellation.writes[0].payload.memo,
    rejectCustomerLookup: true,
  });
  const replayResult = await replay.sync(mail);

  assert.equal(replayResult.result.mode, "cancelled");
  assert.equal(replayResult.result.alreadyCancelled, true);
  assert.equal(replay.writes.length, 0);
});

test("a cancellation tombstone stays unlinked when the mail has no stable customer key", async () => {
  const cancellation = loadSync(null, {
    missingReservation: true,
    rejectCustomerLookup: true,
  });
  const result = await cancellation.sync(
    `ご予約のキャンセル\n${mail.replace("\n電話番号：09000000000", "")}`
  );

  assert.equal(result.result.mode, "cancelled");
  assert.equal(result.result.createdCancellation, true);
  assert.equal(cancellation.writes.length, 1);
  assert.equal(cancellation.writes[0].operation, "insert");
  assert.equal(cancellation.writes[0].payload.customer_id, undefined);
});

test("a cancellation does not reconcile a manual booking through a same-name customer with no phone", async () => {
  const cancellation = loadSync("same-name-customer", {
    externalLookupMissing: true,
    deterministicReservationMissing: true,
    customerRows: [
      { id: "same-name-customer", name: "テスト顧客", phone: null },
    ],
    memo: "HPBから電話で先に登録",
  });

  await assert.rejects(
    cancellation.sync(`ご予約のキャンセル\n${mail}`),
    /顧客を一意に特定できません（matched_by_name: 1件）/
  );
  assert.equal(cancellation.writes.length, 0);
});

test("a cancellation tombstone does not link a same-name customer whose phone is missing", async () => {
  const cancellation = loadSync(null, {
    externalLookupMissing: true,
    deterministicReservationMissing: true,
    manualReservationRows: [],
    customerRows: [
      { id: "same-name-customer", name: "テスト顧客", phone: null },
    ],
  });

  const result = await cancellation.sync(`ご予約のキャンセル\n${mail}`);

  assert.equal(result.result.mode, "cancelled");
  assert.equal(result.result.createdCancellation, true);
  assert.equal(cancellation.writes.length, 1);
  assert.equal(cancellation.writes[0].operation, "insert");
  assert.equal(cancellation.writes[0].payload.customer_id, undefined);
});

test("a cancellation tombstone may reuse the exact provider reservation customer ID", async () => {
  const cancellation = loadSync(null, {
    externalLookupMissing: true,
    deterministicReservationMissing: true,
    manualReservationRows: [],
    existingExternalCustomer: {
      id: autoCustomerId,
      salon_id: "salon-1",
      name: "テスト顧客",
    },
    customerRows: [
      { id: "different-phone-customer", name: "テスト顧客", phone: null },
    ],
  });

  const result = await cancellation.sync(`ご予約のキャンセル\n${mail}`);

  assert.equal(result.result.mode, "cancelled");
  assert.equal(result.result.createdCancellation, true);
  assert.equal(cancellation.writes.length, 1);
  assert.equal(cancellation.writes[0].operation, "insert");
  assert.equal(cancellation.writes[0].payload.customer_id, autoCustomerId);
});

test("a cancellation reconciles a source-marked manual booking when the original booking mail was missed", async () => {
  const runtime = loadSync("mail-customer", {
    externalLookupMissing: true,
    deterministicReservationMissing: true,
    memo: "HPBから電話で先に登録",
  });

  const result = await runtime.sync(`ご予約のキャンセル\n${mail}`);

  assert.equal(result.result.mode, "cancelled");
  assert.equal(result.result.reservationId, "manual-reservation");
  assert.equal(result.result.reconciledManualEntry, true);
  assert.equal(result.result.customerMatch.matchStatus, "matched_by_phone");
  assert.equal(runtime.writes.length, 1);
  assert.equal(runtime.writes[0].operation, "update");
  assert.equal(runtime.writes[0].payload.status, "キャンセル");
  assert.equal(runtime.writes[0].payload.customer_id, "mail-customer");
  assert.match(runtime.writes[0].payload.memo, /^HPB予約番号：A123456/m);
  assert.match(runtime.writes[0].payload.memo, /HPBから電話で先に登録/);
  assert.match(runtime.writes[0].payload.memo, /HPB手入力予約を同期済み：true/);
  assert.match(runtime.writes[0].payload.memo, /【HPBキャンセルメール本文】/);
  assert.deepEqual(runtime.writes[0].filters, [
    ["id", "manual-reservation"],
    ["salon_id", "salon-1"],
    ["status", "confirmed"],
    ["memo", "HPBから電話で先に登録"],
    ["start_at", "2099-10-20T01:00:00.000Z"],
    ["end_at", "2099-10-20T02:30:00.000Z"],
    ["customer_id", "mail-customer"],
    ["staff_id", null],
    ["menu", "HPB予約"],
  ]);

  const replay = loadSync("mail-customer", {
    existing: true,
    status: runtime.writes[0].payload.status,
    memo: runtime.writes[0].payload.memo,
    rejectCustomerLookup: true,
  });
  const replayResult = await replay.sync(`ご予約のキャンセル\n${mail}`);
  assert.equal(replayResult.result.alreadyCancelled, true);
  assert.equal(replay.writes.length, 0);
});

test("a cancellation uses the resolved customer when source-marked manual bookings share a time window", async () => {
  const runtime = loadSync(null, {
    externalLookupMissing: true,
    deterministicReservationMissing: true,
    manualReservationRows: [
      {
        id: "different-customer-reservation",
        customer_id: "different-customer",
        staff_id: null,
        salon_id: "salon-1",
        menu: "HPB予約",
        memo: "HPBから別のお客様を先に登録",
        status: "confirmed",
        start_at: "2099-10-20T01:00:00.000Z",
        end_at: "2099-10-20T02:30:00.000Z",
      },
      {
        id: "matching-customer-reservation",
        customer_id: "mail-customer",
        staff_id: null,
        salon_id: "salon-1",
        menu: "HPB予約",
        memo: "HPBから対象のお客様を先に登録",
        status: "confirmed",
        start_at: "2099-10-20T01:00:00.000Z",
        end_at: "2099-10-20T02:30:00.000Z",
      },
    ],
  });

  const result = await runtime.sync(`ご予約のキャンセル\n${mail}`);

  assert.equal(result.result.reservationId, "matching-customer-reservation");
  assert.equal(result.result.reconciledManualEntry, true);
  assert.equal(runtime.writes.length, 1);
  assert.equal(runtime.writes[0].payload.status, "キャンセル");
  assert.match(runtime.writes[0].payload.memo, /対象のお客様を先に登録/);
  assert.doesNotMatch(runtime.writes[0].payload.memo, /別のお客様を先に登録/);
});

test("a cancellation does not cancel another customer's source-marked manual booking", async () => {
  const runtime = loadSync("different-customer", {
    externalLookupMissing: true,
    deterministicReservationMissing: true,
    memo: "HPBから電話で先に登録",
  });

  await assert.rejects(
    runtime.sync(`ご予約のキャンセル\n${mail}`),
    /手入力予約とメールの顧客が一致しません/
  );
  assert.equal(runtime.writes.length, 0);
});

test("a cancellation without a stable customer key stops before changing a likely manual booking", async () => {
  const runtime = loadSync("mail-customer", {
    externalLookupMissing: true,
    deterministicReservationMissing: true,
    memo: "HPBから電話で先に登録",
  });
  const cancellationWithoutPhone = `ご予約のキャンセル\n${mail.replace(
    "電話番号：09000000000",
    "電話番号：非公開"
  )}`;

  await assert.rejects(
    runtime.sync(cancellationWithoutPhone),
    /顧客を一意に特定できません（phone_missing: 0件）/
  );
  assert.equal(runtime.writes.length, 0);
});

test("a reconciled cancellation protects a manual booking changed during sync", async () => {
  const runtime = loadSync("mail-customer", {
    externalLookupMissing: true,
    deterministicReservationMissing: true,
    memo: "HPBから電話で先に登録",
    updateData: null,
    latestCustomerIdOnUpdate: "staff-corrected-customer",
  });

  await assert.rejects(
    runtime.sync(`ご予約のキャンセル\n${mail}`),
    /顧客紐付けが変更されました/
  );
  assert.equal(runtime.writes.length, 1);
});

test("concurrent duplicate cancellation converges after the deterministic insert loses the race", async () => {
  const cancellationBody = `ご予約のキャンセル\n${mail}`;
  const runtime = loadSync("mail-customer", {
    missingReservation: true,
    insertError: { code: "23505", message: "duplicate key" },
    concurrentReservation: {
      salon_id: "salon-1",
      memo: `HPB予約番号：A123456\n\n【HPBキャンセルメール本文】\n${cancellationBody}`,
      status: "キャンセル",
    },
  });

  const result = await runtime.sync(cancellationBody);

  assert.equal(result.result.mode, "cancelled");
  assert.equal(result.result.alreadyCancelled, true);
  assert.equal(runtime.writes.length, 1);
  assert.equal(runtime.writes[0].operation, "insert");
});

test("concurrent booking insert is cancelled after the cancellation tombstone loses the race", async () => {
  const runtime = loadSync("mail-customer", {
    missingReservation: true,
    insertError: { code: "23505", message: "duplicate key" },
    concurrentReservation: {
      salon_id: "salon-1",
      memo: "HPB予約番号：A123456\n【HPBメール本文】\n予約受付",
      status: "confirmed",
    },
  });

  const result = await runtime.sync(`ご予約のキャンセル\n${mail}`);

  assert.equal(result.result.mode, "cancelled");
  assert.equal(runtime.writes.length, 2);
  assert.equal(runtime.writes[0].operation, "insert");
  assert.equal(runtime.writes[1].operation, "update");
  assert.equal(runtime.writes[1].payload.status, "キャンセル");
});

test("concurrent cancellation does not update a deterministic row from another salon", async () => {
  const runtime = loadSync("mail-customer", {
    missingReservation: true,
    insertError: { code: "23505", message: "duplicate key" },
    concurrentReservation: {
      salon_id: "salon-2",
      memo: "HPB予約番号：A123456",
      status: "confirmed",
    },
  });

  await assert.rejects(
    runtime.sync(`ご予約のキャンセル\n${mail}`),
    /別サロン.*同期を停止/
  );
  assert.equal(runtime.writes.length, 1);
  assert.equal(runtime.writes[0].operation, "insert");
});

test("an already-cancelled deterministic row from another salon is not reported as synced", async () => {
  const cancellationBody = `ご予約のキャンセル\n${mail}`;
  const runtime = loadSync("mail-customer", {
    externalLookupMissing: true,
    reservationSalonId: "salon-2",
    status: "キャンセル",
    memo: `HPB予約番号：A123456\n\n【HPBキャンセルメール本文】\n${cancellationBody}`,
    rejectCustomerLookup: true,
  });

  await assert.rejects(
    runtime.sync(cancellationBody),
    /別サロン.*同期を停止/
  );
  assert.equal(runtime.writes.length, 0);
});

test("an exact booking replay with a missing salon does not report success", async () => {
  const runtime = loadSync("mail-customer", {
    existing: true,
    reservationSalonId: null,
    memo: `HPB予約番号：A123456\n【HPBメール本文】\n${mail}`,
    rejectCustomerLookup: true,
  });

  await assert.rejects(runtime.sync(mail), /別サロン.*同期を停止/);
  assert.equal(runtime.writes.length, 0);
});

test("concurrent cancellation tombstone is not revived by a delayed booking insert", async () => {
  const cancellationBody = `ご予約のキャンセル\n${mail}`;
  const runtime = loadSync("mail-customer", {
    missingReservation: true,
    insertError: { code: "23505", message: "duplicate key" },
    concurrentReservation: {
      salon_id: "salon-1",
      memo: `HPB予約番号：A123456\n\n【HPBキャンセルメール本文】\n${cancellationBody}`,
      status: "キャンセル",
    },
  });

  const result = await runtime.sync(mail);

  assert.equal(result.result.mode, "cancelled");
  assert.equal(result.result.alreadyCancelled, true);
  assert.equal(runtime.writes.length, 1);
  assert.equal(runtime.writes[0].operation, "insert");
});

test("concurrent duplicate booking keeps staff edits made after the winning insert", async () => {
  const runtime = loadSync("mail-customer", {
    missingReservation: true,
    insertError: { code: "23505", message: "duplicate key" },
    concurrentReservation: {
      salon_id: "salon-1",
      customer_id: "mail-customer",
      staff_id: "staff-corrected",
      menu: "スタッフ修正メニュー",
      memo: `HPB予約番号：A123456\nスタッフ追記\n\n【HPBメール本文】\n${mail}`,
      status: "confirmed",
      start_at: "2099-10-20T01:30:00.000Z",
      end_at: "2099-10-20T03:00:00.000Z",
    },
  });

  const result = await runtime.sync(mail);

  assert.equal(result.result.mode, "updated");
  assert.equal(result.result.alreadySynced, true);
  assert.equal(runtime.writes.length, 1);
  assert.equal(runtime.writes[0].operation, "insert");
});

test("concurrent progressed booking keeps its staff status after an insert race", async () => {
  const runtime = loadSync("mail-customer", {
    missingReservation: true,
    insertError: { code: "23505", message: "duplicate key" },
    concurrentReservation: {
      salon_id: "salon-1",
      memo: "HPB予約番号：A123456\nスタッフ処理済み",
      status: "来店",
    },
  });

  const result = await runtime.sync(mail);

  assert.equal(result.result.mode, "updated");
  assert.equal(runtime.writes.length, 2);
  assert.equal(runtime.writes[0].operation, "insert");
  assert.equal(runtime.writes[1].operation, "update");
  assert.equal(runtime.writes[1].payload.status, "来店");
  assert.deepEqual(runtime.writes[1].filters.slice(-8), [
    ["salon_id", "salon-1"],
    ["status", "来店"],
    ["memo", "HPB予約番号：A123456\nスタッフ処理済み"],
    ["start_at", "2099-10-20T01:00:00.000Z"],
    ["end_at", "2099-10-20T02:30:00.000Z"],
    ["customer_id", "mail-customer"],
    ["staff_id", null],
    ["menu", "HPB予約"],
  ]);
});

test("concurrent booking insert stops before overwriting a moved deterministic row", async () => {
  const runtime = loadSync("mail-customer", {
    missingReservation: true,
    insertError: { code: "23505", message: "duplicate key" },
    concurrentReservation: {
      salon_id: "salon-1",
      memo: "HPB予約番号：A123456",
      status: "confirmed",
    },
    latestStartAtOnUpdate: "2099-10-20T01:30:00.000Z",
    latestEndAtOnUpdate: "2099-10-20T03:00:00.000Z",
    updateData: null,
  });

  await assert.rejects(runtime.sync(mail), /予約日時が変更されました/);

  assert.equal(runtime.writes.length, 2);
  assert.equal(runtime.writes[0].operation, "insert");
  assert.equal(runtime.writes[1].operation, "update");
  assert.deepEqual(runtime.writes[1].filters.slice(-8), [
    ["salon_id", "salon-1"],
    ["status", "confirmed"],
    ["memo", "HPB予約番号：A123456"],
    ["start_at", "2099-10-20T01:00:00.000Z"],
    ["end_at", "2099-10-20T02:30:00.000Z"],
    ["customer_id", "mail-customer"],
    ["staff_id", null],
    ["menu", "HPB予約"],
  ]);
});

test("concurrent booking insert refuses to reassign a staff-corrected customer", async () => {
  const runtime = loadSync("mail-customer", {
    missingReservation: true,
    insertError: { code: "23505", message: "duplicate key" },
    concurrentReservation: {
      salon_id: "salon-1",
      customer_id: "staff-corrected-customer",
      memo: "HPB予約番号：A123456",
      status: "confirmed",
    },
  });

  await assert.rejects(runtime.sync(mail), /顧客.*一致.*同期を停止/);

  assert.equal(runtime.writes.length, 1);
  assert.equal(runtime.writes[0].operation, "insert");
});

test("concurrent booking insert does not update a deterministic row from another salon", async () => {
  const runtime = loadSync("mail-customer", {
    missingReservation: true,
    insertError: { code: "23505", message: "duplicate key" },
    concurrentReservation: {
      salon_id: "salon-2",
      memo: "HPB予約番号：A123456",
      status: "confirmed",
    },
  });

  await assert.rejects(runtime.sync(mail), /別サロン.*同期を停止/);
  assert.equal(runtime.writes.length, 1);
  assert.equal(runtime.writes[0].operation, "insert");
});

for (const [reason, response] of [
  ["no inserted row", { updateData: null }],
  ["unexpected row", { updateData: { id: "other-reservation" } }],
  ["database error", { insertError: { code: "XX000", message: "fixture booking insert rejected" } }],
]) {
  test(`a new booking does not report success for ${reason}`, async () => {
    const runtime = loadSync("mail-customer", {
      missingReservation: true,
      ...response,
    });

    await assert.rejects(
      runtime.sync(mail),
      /保存結果を確認できません|fixture booking insert rejected/
    );
    assert.equal(runtime.writes.length, 1);
    assert.equal(runtime.writes[0].operation, "insert");
  });
}

for (const [reason, response] of [
  ["no inserted row", { updateData: null }],
  ["unexpected row", { updateData: { id: "other-reservation" } }],
  ["database error", { updateError: { message: "fixture insert rejected" } }],
]) {
  test(`an unmatched cancellation does not report success for ${reason}`, async () => {
    const runtime = loadSync("mail-customer", {
      missingReservation: true,
      ...response,
    });

    await assert.rejects(
      runtime.sync(`ご予約のキャンセル\n${mail}`),
      /保存結果を確認できません|fixture insert rejected/
    );
    assert.equal(runtime.writes.length, 1);
    assert.equal(runtime.writes[0].operation, "insert");
  });
}

test("all recognized cancellation states stop replay before customer resolution", async () => {
  for (const status of ["キャンセル", "cancelled", "canceled", "cancel", "取消", "取り消し"]) {
    const runtime = loadSync("mail-customer", {
      existing: true, status, rejectCustomerLookup: true,
    });
    const result = await runtime.sync(mail);
    assert.equal(result.result.alreadyCancelled, true, status);
    assert.equal(runtime.writes.length, 0, status);
  }
});

test("replaying a booking preserves staff-progressed reservation states", async () => {
  for (const status of ["来店", "来店予定", "完了待ち", "完了", "completed"]) {
    const runtime = loadSync("mail-customer", { existing: true, status });
    const result = await runtime.sync(mail);

    assert.equal(result.result.mode, "updated", status);
    assert.equal(runtime.writes.length, 1, status);
    assert.equal(runtime.writes[0].operation, "update", status);
    assert.equal(runtime.writes[0].payload.status, status, status);
  }
});

test("replaying an active booking still converges its state to confirmed", async () => {
  const runtime = loadSync("mail-customer", {
    existing: true,
    status: "予約",
  });
  await runtime.sync(mail);

  assert.equal(runtime.writes.length, 1);
  assert.equal(runtime.writes[0].payload.status, "confirmed");
});

test("replaying a reconciled mail retains the original manual memo without nesting it", async () => {
  const initial = loadSync("mail-customer");
  await initial.sync(mail);
  const firstMemo = initial.writes[0].payload.memo;
  let memo = firstMemo;
  for (let attempt = 0; attempt < 2; attempt++) {
    const retry = loadSync("mail-customer", { existing: true, memo });
    const result = await retry.sync(mail);
    assert.equal(result.result.reservationId, "manual-reservation");
    assert.equal(result.result.alreadySynced, true);
    assert.equal(retry.writes.length, 0);
    assert.equal(memo, firstMemo);
  }
});

test("replaying the same Gmail booking preserves staff corrections without a write", async () => {
  const initial = loadSync("mail-customer");
  await initial.sync(mail);
  const syncedMemo = initial.writes[0].payload.memo;
  const replay = loadSync("staff-corrected-customer", {
    existing: true,
    memo: syncedMemo,
    staffId: "staff-corrected",
    menu: "スタッフ修正メニュー",
    startAt: "2099-10-20T03:00:00.000Z",
    endAt: "2099-10-20T04:30:00.000Z",
  });

  const result = await replay.sync(mail);

  assert.equal(result.result.mode, "updated");
  assert.equal(result.result.alreadySynced, true);
  assert.equal(result.result.reservationId, "manual-reservation");
  assert.equal(replay.writes.length, 0);
});

test("an unchanged replay does not fail after its former staff becomes inactive", async () => {
  const replay = loadSync("mail-customer", {
    existing: true,
    memo: `HPB予約番号：A123456\n【HPBメール本文】\n${namedStaffMail}`,
    rejectStaffLookup: true,
  });

  const result = await replay.sync(namedStaffMail);

  assert.equal(result.result.mode, "updated");
  assert.equal(result.result.alreadySynced, true);
  assert.equal(replay.writes.length, 0);
});

test("an existing cancellation does not require its former staff to remain active", async () => {
  const runtime = loadSync("mail-customer", {
    existing: true,
    rejectStaffLookup: true,
  });

  const result = await runtime.sync(`ご予約のキャンセル\n${namedStaffMail}`);

  assert.equal(result.result.mode, "cancelled");
  assert.equal(runtime.writes.length, 1);
  assert.equal(runtime.writes[0].payload.status, "キャンセル");
});

test("an unmatched cancellation persists when its former staff is no longer active", async () => {
  const runtime = loadSync("mail-customer", {
    missingReservation: true,
    staffRows: [],
  });

  const result = await runtime.sync(`ご予約のキャンセル\n${namedStaffMail}`);

  assert.equal(result.result.mode, "cancelled");
  assert.equal(result.result.createdCancellation, true);
  assert.equal(runtime.writes.length, 1);
  assert.equal(runtime.writes[0].operation, "insert");
  assert.equal(runtime.writes[0].payload.status, "キャンセル");
  assert.equal(runtime.writes[0].payload.staff_id, undefined);
});

test("an unmatched cancellation still closes one customer-matched manual booking when its former staff is inactive", async () => {
  const runtime = loadSync("mail-customer", {
    externalLookupMissing: true,
    deterministicReservationMissing: true,
    staffRows: [],
    memo: "HPBから電話で先に登録",
  });

  const result = await runtime.sync(`ご予約のキャンセル\n${namedStaffMail}`);

  assert.equal(result.result.mode, "cancelled");
  assert.equal(result.result.reconciledManualEntry, true);
  assert.equal(result.result.reservationId, "manual-reservation");
  assert.equal(runtime.writes.length, 1);
  assert.equal(runtime.writes[0].operation, "update");
  assert.equal(runtime.writes[0].payload.status, "キャンセル");
});

test("an inactive-staff cancellation does not close a source-marked manual booking without a customer", async () => {
  const runtime = loadSync(null, {
    externalLookupMissing: true,
    deterministicReservationMissing: true,
    staffRows: [],
    memo: "HPBから電話で先に登録",
    customerRows: [
      { id: "mail-customer", name: "テスト顧客", phone: "09000000000" },
    ],
  });

  await assert.rejects(
    runtime.sync(`ご予約のキャンセル\n${namedStaffMail}`),
    /顧客が一致しません/
  );
  assert.equal(runtime.writes.length, 0);
});

test("an inactive-staff cancellation closes neither an unlinked nor another customer's source-marked booking", async () => {
  const runtime = loadSync(null, {
    externalLookupMissing: true,
    deterministicReservationMissing: true,
    staffRows: [],
    customerRows: [
      { id: "mail-customer", name: "テスト顧客", phone: "09000000000" },
    ],
    manualReservationRows: [
      {
        id: "unlinked-manual",
        customer_id: null,
        staff_id: "former-staff",
        menu: "HPB予約",
        memo: "HPBから電話で先に登録",
        status: "confirmed",
        start_at: "2099-10-20T01:00:00.000Z",
        end_at: "2099-10-20T02:30:00.000Z",
      },
      {
        id: "other-customer-manual",
        customer_id: "other-customer",
        staff_id: "former-staff",
        menu: "HPB予約",
        memo: "HPBから電話で先に登録",
        status: "confirmed",
        start_at: "2099-10-20T01:00:00.000Z",
        end_at: "2099-10-20T02:30:00.000Z",
      },
    ],
  });

  await assert.rejects(
    runtime.sync(`ご予約のキャンセル\n${namedStaffMail}`),
    /顧客が一致しません/
  );
  assert.equal(runtime.writes.length, 0);
});

test("an unassigned cancellation does not close a source-marked manual booking without a customer", async () => {
  const runtime = loadSync(null, {
    externalLookupMissing: true,
    deterministicReservationMissing: true,
    memo: "HPBから電話で先に登録",
    customerRows: [
      { id: "mail-customer", name: "テスト顧客", phone: "09000000000" },
    ],
  });

  await assert.rejects(
    runtime.sync(`ご予約のキャンセル\n${mail}`),
    /顧客が一致しません/
  );
  assert.equal(runtime.writes.length, 0);
});

test("an unassigned cancellation closes one source-marked booking with the exact customer", async () => {
  const runtime = loadSync("mail-customer", {
    externalLookupMissing: true,
    deterministicReservationMissing: true,
    memo: "HPBから電話で先に登録",
  });

  const result = await runtime.sync(`ご予約のキャンセル\n${mail}`);

  assert.equal(result.result.mode, "cancelled");
  assert.equal(result.result.reconciledManualEntry, true);
  assert.equal(result.result.reservationId, "manual-reservation");
  assert.equal(runtime.writes.length, 1);
  assert.equal(runtime.writes[0].operation, "update");
  assert.equal(runtime.writes[0].payload.status, "キャンセル");
});

test("an unassigned cancellation does not close another customer's source-marked booking", async () => {
  const runtime = loadSync("other-customer", {
    externalLookupMissing: true,
    deterministicReservationMissing: true,
    memo: "HPBから電話で先に登録",
    customerRows: [
      { id: "mail-customer", name: "テスト顧客", phone: "09000000000" },
    ],
  });

  await assert.rejects(
    runtime.sync(`ご予約のキャンセル\n${mail}`),
    /顧客が一致しません/
  );
  assert.equal(runtime.writes.length, 0);
});

test("a resolved-staff cancellation does not close a source-marked manual booking without a customer", async () => {
  const runtime = loadSync(null, {
    externalLookupMissing: true,
    deterministicReservationMissing: true,
    staffRows: [{ id: "active-staff", name: "退職スタッフ" }],
    memo: "HPBから電話で先に登録",
    customerRows: [
      { id: "mail-customer", name: "テスト顧客", phone: "09000000000" },
    ],
  });

  await assert.rejects(
    runtime.sync(`ご予約のキャンセル\n${namedStaffMail}`),
    /顧客が一致しません/
  );
  assert.equal(runtime.writes.length, 0);
});

test("a resolved-staff cancellation closes one source-marked booking with the exact customer", async () => {
  const runtime = loadSync("mail-customer", {
    externalLookupMissing: true,
    deterministicReservationMissing: true,
    staffRows: [{ id: "active-staff", name: "退職スタッフ" }],
    staffId: "active-staff",
    memo: "HPBから電話で先に登録",
  });

  const result = await runtime.sync(`ご予約のキャンセル\n${namedStaffMail}`);

  assert.equal(result.result.mode, "cancelled");
  assert.equal(result.result.reconciledManualEntry, true);
  assert.equal(result.result.reservationId, "manual-reservation");
  assert.equal(runtime.writes.length, 1);
  assert.equal(runtime.writes[0].operation, "update");
  assert.equal(runtime.writes[0].payload.status, "キャンセル");
});

test("a resolved-staff cancellation closes the exact customer's manually reassigned booking", async () => {
  const runtime = loadSync("mail-customer", {
    externalLookupMissing: true,
    deterministicReservationMissing: true,
    staffRows: [{ id: "provider-staff", name: "退職スタッフ" }],
    staffId: "corrected-staff",
    memo: "HPBから電話で先に登録",
  });

  const result = await runtime.sync(`ご予約のキャンセル\n${namedStaffMail}`);

  assert.equal(result.result.mode, "cancelled");
  assert.equal(result.result.reconciledManualEntry, true);
  assert.equal(result.result.reservationId, "manual-reservation");
  assert.equal(runtime.writes.length, 1);
  assert.equal(runtime.writes[0].operation, "update");
  assert.equal(runtime.writes[0].payload.status, "キャンセル");
  assert.equal(runtime.writes[0].payload.staff_id, undefined);
  assert.deepEqual(
    runtime.writes[0].filters.find(([key]) => key === "staff_id"),
    ["staff_id", "corrected-staff"]
  );
});

test("a resolved-staff cancellation does not close another customer's manually reassigned booking", async () => {
  const runtime = loadSync("other-customer", {
    externalLookupMissing: true,
    deterministicReservationMissing: true,
    staffRows: [{ id: "provider-staff", name: "退職スタッフ" }],
    staffId: "corrected-staff",
    memo: "HPBから電話で先に登録",
    customerRows: [
      { id: "mail-customer", name: "テスト顧客", phone: "09000000000" },
    ],
  });

  await assert.rejects(
    runtime.sync(`ご予約のキャンセル\n${namedStaffMail}`),
    /顧客が一致しません/
  );
  assert.equal(runtime.writes.length, 0);
});

test("a changed booking still requires its named staff to be active", async () => {
  const runtime = loadSync("mail-customer", {
    existing: true,
    memo: `HPB予約番号：A123456\n【HPBメール本文】\n${namedStaffMail}`,
    rejectStaffLookup: true,
  });

  await assert.rejects(
    runtime.sync(
      namedStaffMail.replace("2099年10月20日 10:00", "2099年10月20日 11:00")
    ),
    /staff lookup must be deferred/
  );
  assert.equal(runtime.writes.length, 0);
});

test("a new booking still resolves and saves its active named staff", async () => {
  const runtime = loadSync(null, {
    missingReservation: true,
    customerRows: [],
    staffRows: [{ id: "active-staff", name: "退職スタッフ" }],
  });

  const result = await runtime.sync(namedStaffMail);

  assert.equal(result.result.mode, "inserted");
  assert.equal(runtime.writes.at(-1).table, "reservations");
  assert.equal(runtime.writes.at(-1).payload.staff_id, "active-staff");
});

test("a delayed named-staff mail fills an unassigned manual reservation without inserting a duplicate", async () => {
  const runtime = loadSync("mail-customer", {
    staffRows: [{ id: "active-staff", name: "退職スタッフ" }],
  });

  const result = await runtime.sync(namedStaffMail);

  assert.equal(result.result.mode, "updated");
  assert.equal(result.result.reconciledManualEntry, true);
  assert.equal(result.result.reservationId, "manual-reservation");
  assert.equal(runtime.writes.length, 1);
  assert.equal(runtime.writes[0].operation, "update");
  assert.equal(runtime.writes[0].payload.staff_id, "active-staff");
  assert.deepEqual(
    runtime.writes[0].filters.find(([key]) => key === "staff_id"),
    ["staff_id", null]
  );
});

test("a changed Gmail booking still follows normal reconciliation", async () => {
  const initial = loadSync("mail-customer");
  await initial.sync(mail);
  const replay = loadSync("mail-customer", {
    existing: true,
    memo: initial.writes[0].payload.memo,
  });

  const result = await replay.sync(
    mail.replace("2099年10月20日 10:00", "2099年10月20日 11:00")
  );

  assert.equal(result.result.mode, "updated");
  assert.equal(result.result.alreadySynced, undefined);
  assert.equal(replay.writes.length, 1);
  assert.equal(replay.writes[0].operation, "update");
  assert.equal(replay.writes[0].payload.start_at, "2099-10-20T02:00:00.000Z");
});

test("a changed booking reuses its auto-created customer without overwriting staff corrections", async () => {
  const runtime = loadSync(autoCustomerId, {
    existing: true,
    customerRows: [],
    existingExternalCustomer: {
      id: autoCustomerId,
      salon_id: "salon-1",
      name: "スタッフ修正名",
    },
    existingReservationCustomer: {
      id: autoCustomerId,
      salon_id: "salon-1",
      name: "スタッフ修正名",
    },
  });

  const result = await runtime.sync(
    mail.replace("2099年10月20日 10:00", "2099年10月20日 11:00")
  );

  assert.equal(result.result.mode, "updated");
  assert.equal(
    result.result.customerMatch.matchStatus,
    "preserved_existing_reservation_customer"
  );
  assert.equal(result.result.customerMatch.matchedName, "スタッフ修正名");
  assert.equal(runtime.writes.length, 1);
  assert.equal(runtime.writes[0].table, "reservations");
  assert.equal(runtime.writes[0].operation, "update");
});

test("a new external booking inserts a deterministic customer instead of upserting", async () => {
  const runtime = loadSync(null, {
    missingReservation: true,
    customerRows: [],
  });

  const result = await runtime.sync(mail);

  assert.equal(result.result.mode, "inserted");
  assert.equal(runtime.writes.length, 2);
  assert.equal(runtime.writes[0].table, "customers");
  assert.equal(runtime.writes[0].operation, "insert");
  assert.equal(runtime.writes[0].payload.id, autoCustomerId);
  assert.equal(runtime.writes[1].table, "reservations");
  assert.equal(runtime.writes[1].payload.customer_id, autoCustomerId);
});

test("a new booking checks ambiguous manual rows before creating its customer", async () => {
  const manualReservationRows = ["manual-one", "manual-two"].map((id) => ({
    id,
    customer_id: null,
    staff_id: null,
    salon_id: "salon-1",
    menu: "HPB予約",
    memo: "HPBから電話で先に登録",
    status: "confirmed",
    start_at: "2099-10-20T01:00:00.000Z",
    end_at: "2099-10-20T02:30:00.000Z",
  }));
  const runtime = loadSync(null, {
    externalLookupMissing: true,
    deterministicReservationMissing: true,
    customerRows: [],
    manualReservationRows,
  });

  await assert.rejects(
    runtime.sync(mail),
    /同時刻に未照合の外部予約が複数あります/
  );

  assert.equal(runtime.writes.length, 0);
});

test("a new booking checks a differently linked manual row before creating its customer", async () => {
  const runtime = loadSync(null, {
    externalLookupMissing: true,
    deterministicReservationMissing: true,
    customerRows: [],
    manualReservationRows: [
      {
        id: "other-customer-manual",
        customer_id: "other-customer",
        staff_id: null,
        salon_id: "salon-1",
        menu: "HPB予約",
        memo: "HPBから電話で先に登録",
        status: "confirmed",
        start_at: "2099-10-20T01:00:00.000Z",
        end_at: "2099-10-20T02:30:00.000Z",
      },
    ],
  });

  await assert.rejects(runtime.sync(mail), /手入力予約とメールの顧客が一致しません/);

  assert.equal(runtime.writes.length, 0);
});

test("a new booking creates its customer and reuses one unlinked manual row", async () => {
  const runtime = loadSync(null, {
    externalLookupMissing: true,
    deterministicReservationMissing: true,
    customerRows: [],
    manualReservationRows: [
      {
        id: "unlinked-manual",
        customer_id: null,
        staff_id: null,
        salon_id: "salon-1",
        menu: "HPB予約",
        memo: "HPBから電話で先に登録",
        status: "confirmed",
        start_at: "2099-10-20T01:00:00.000Z",
        end_at: "2099-10-20T02:30:00.000Z",
      },
    ],
  });

  const result = await runtime.sync(mail);

  assert.equal(result.result.mode, "updated");
  assert.equal(result.result.reconciledManualEntry, true);
  assert.equal(result.result.reservationId, "unlinked-manual");
  assert.equal(runtime.writes.length, 2);
  assert.equal(runtime.writes[0].table, "customers");
  assert.equal(runtime.writes[0].operation, "insert");
  assert.equal(runtime.writes[1].table, "reservations");
  assert.equal(runtime.writes[1].operation, "update");
  assert.equal(runtime.writes[1].payload.customer_id, autoCustomerId);
});

test("a new booking does not attach to a same-name customer with a different phone", async () => {
  const runtime = loadSync(null, {
    missingReservation: true,
    customerRows: [
      {
        id: "same-name-other-customer",
        name: "テスト顧客",
        phone: "08011112222",
      },
    ],
  });

  const result = await runtime.sync(mail);

  assert.equal(result.result.mode, "inserted");
  assert.equal(result.result.customerMatch.matchStatus, "auto_created");
  assert.equal(result.result.customerMatch.customerId, autoCustomerId);
  assert.equal(runtime.writes.length, 2);
  assert.equal(runtime.writes[0].table, "customers");
  assert.equal(runtime.writes[0].payload.id, autoCustomerId);
  assert.equal(runtime.writes[1].table, "reservations");
  assert.equal(runtime.writes[1].payload.customer_id, autoCustomerId);
});

test("a new booking without a phone does not attach to a same-name customer", async () => {
  const runtime = loadSync(null, {
    missingReservation: true,
    customerRows: [
      {
        id: "same-name-customer",
        name: "テスト顧客",
        phone: "09011112222",
      },
    ],
  });

  await assert.rejects(
    runtime.sync(mail.replace("\n電話番号：09000000000", "")),
    /電話番号がない新規予約メールは顧客を安全に特定できない/
  );
  assert.equal(runtime.writes.length, 0);
});

test("an existing external booking without a phone preserves its customer link", async () => {
  const runtime = loadSync("mail-customer", { existing: true });
  const result = await runtime.sync(
    mail.replace("\n電話番号：09000000000", "")
  );

  assert.equal(result.result.mode, "updated");
  assert.equal(
    result.result.customerMatch.matchStatus,
    "preserved_existing_reservation_customer"
  );
  assert.equal(runtime.writes.length, 1);
  assert.equal(runtime.writes[0].table, "reservations");
  assert.equal(runtime.writes[0].payload.customer_id, "mail-customer");
});

test("customer matching treats Japanese international phone notation as equal", async () => {
  const runtime = loadSync(null, {
    missingReservation: true,
    customerRows: [
      {
        id: "international-phone-customer",
        name: "顧客名の別表記",
        phone: "+81 90-0000-0000",
      },
    ],
  });

  const result = await runtime.sync(mail);

  assert.equal(result.result.mode, "inserted");
  assert.equal(result.result.customerMatch.matchStatus, "matched_by_phone");
  assert.equal(
    result.result.customerMatch.customerId,
    "international-phone-customer"
  );
  assert.equal(runtime.writes.length, 1);
  assert.equal(runtime.writes[0].table, "reservations");
  assert.equal(
    runtime.writes[0].payload.customer_id,
    "international-phone-customer"
  );
});

for (const mailPhone of [
  "+81 (0)90-0000-0000",
  "０９０ ００００ ００００",
]) {
  test(`customer matching parses formatted mail phone ${mailPhone}`, async () => {
    const runtime = loadSync(null, {
      missingReservation: true,
      customerRows: [
        {
          id: "existing-phone-customer",
          name: "顧客名の別表記",
          phone: "09000000000",
        },
      ],
    });

    const result = await runtime.sync(
      mail.replace("電話番号：09000000000", `電話番号：${mailPhone}`)
    );

    assert.equal(result.result.mode, "inserted");
    assert.equal(result.result.customerMatch.matchStatus, "matched_by_phone");
    assert.equal(
      result.result.customerMatch.customerId,
      "existing-phone-customer"
    );
    assert.equal(runtime.writes.length, 1);
    assert.equal(runtime.writes[0].table, "reservations");
  });
}

test("customer matching parses a formatted phone on the line after its label", async () => {
  const runtime = loadSync(null, {
    missingReservation: true,
    customerRows: [
      {
        id: "existing-phone-customer",
        name: "顧客名の別表記",
        phone: "09000000000",
      },
    ],
  });

  const result = await runtime.sync(
    mail.replace(
      "電話番号：09000000000",
      "電話番号：\n＋８１ （０）９０－００００－００００"
    )
  );

  assert.equal(result.result.customerMatch.matchStatus, "matched_by_phone");
  assert.equal(
    result.result.customerMatch.customerId,
    "existing-phone-customer"
  );
  assert.equal(runtime.writes.length, 1);
  assert.equal(runtime.writes[0].table, "reservations");
});

test("customer matching keeps same-line phone labels without a colon compatible", async () => {
  const runtime = loadSync(null, {
    missingReservation: true,
    customerRows: [
      {
        id: "existing-phone-customer",
        name: "顧客名の別表記",
        phone: "09000000000",
      },
    ],
  });

  const result = await runtime.sync(
    mail.replace("電話番号：09000000000", "電話番号 090-0000-0000")
  );

  assert.equal(result.result.customerMatch.matchStatus, "matched_by_phone");
  assert.equal(
    result.result.customerMatch.customerId,
    "existing-phone-customer"
  );
  assert.equal(runtime.writes.length, 1);
  assert.equal(runtime.writes[0].table, "reservations");
});

test("a malformed labelled phone stops before database access", async () => {
  const runtime = loadSync(null, { rejectDatabaseAccess: true });

  await assert.rejects(
    runtime.sync(
      mail.replace("電話番号：09000000000", "電話番号：090-ABCD-0000")
    ),
    /電話番号を解析できませんでした/
  );

  assert.equal(runtime.writes.length, 0);
});

test("a new booking stops before writes when one phone belongs to multiple customers", async () => {
  const runtime = loadSync(null, {
    missingReservation: true,
    customerRows: [
      {
        id: "duplicate-phone-customer-1",
        name: "別顧客一",
        phone: "09000000000",
      },
      {
        id: "duplicate-phone-customer-2",
        name: "別顧客二",
        phone: "+81 90-0000-0000",
      },
    ],
  });

  await assert.rejects(
    runtime.sync(mail),
    /顧客候補を一意に特定できません（multiple_found_by_phone: 2件）/
  );
  assert.equal(runtime.writes.length, 0);
});

test("customer matching reads the 501st row when Data API max_rows is 500", async () => {
  const customerRows = Array.from({ length: 501 }, (_, index) => ({
    id: `customer-${String(index).padStart(4, "0")}`,
    name: `別顧客${index}`,
    phone: `080${String(index).padStart(8, "0")}`,
  }));
  customerRows[500] = {
    id: "customer-0500-target",
    name: "テスト顧客",
    phone: "09000000000",
  };

  const runtime = loadSync(null, {
    missingReservation: true,
    customerRows,
    dataApiMaxRows: 500,
  });

  const result = await runtime.sync(mail);

  assert.equal(result.result.mode, "inserted");
  assert.equal(result.result.customerMatch.matchStatus, "matched_by_phone");
  assert.equal(result.result.customerMatch.customerId, "customer-0500-target");
  assert.deepEqual(runtime.customerReadCursors, [
    null,
    "customer-0499",
    "customer-0500-target",
  ]);
  assert.equal(runtime.writes.length, 1);
  assert.equal(runtime.writes[0].table, "reservations");
  assert.equal(runtime.writes[0].payload.customer_id, "customer-0500-target");
});

test("customer matching fails closed when a cursor page cannot be read", async () => {
  const customerRows = Array.from({ length: 500 }, (_, index) => ({
    id: `customer-${String(index).padStart(4, "0")}`,
    name: `別顧客${index}`,
    phone: `080${String(index).padStart(8, "0")}`,
  }));
  const runtime = loadSync(null, {
    missingReservation: true,
    customerRows,
    dataApiMaxRows: 500,
    customerReadErrorAfterId: "customer-0499",
  });

  await assert.rejects(runtime.sync(mail), /fixture customer page rejected/);
  assert.deepEqual(runtime.customerReadCursors, [
    null,
    "customer-0499",
  ]);
  assert.equal(runtime.writes.length, 0);
});

test("concurrent deterministic customer creation converges without overwriting the winner", async () => {
  const runtime = loadSync(null, {
    missingReservation: true,
    customerRows: [],
    customerInsertError: { code: "23505", message: "duplicate key" },
    concurrentExternalCustomer: {
      id: autoCustomerId,
      salon_id: "salon-1",
      name: "同時作成済み顧客",
    },
  });

  const result = await runtime.sync(mail);

  assert.equal(result.result.mode, "inserted");
  assert.equal(result.result.customerMatch.matchStatus, "matched_by_external_id");
  assert.equal(runtime.writes.length, 2);
  assert.equal(runtime.writes[0].table, "customers");
  assert.equal(runtime.writes[0].operation, "insert");
  assert.equal(runtime.writes[1].table, "reservations");
  assert.equal(runtime.writes[1].payload.customer_id, autoCustomerId);
});

test("a deterministic external customer in another salon stops before any write", async () => {
  const runtime = loadSync(null, {
    missingReservation: true,
    customerRows: [],
    existingExternalCustomer: {
      id: autoCustomerId,
      salon_id: "salon-2",
      name: "別サロン顧客",
    },
  });

  await assert.rejects(runtime.sync(mail), /顧客が別サロン.*同期を停止/);
  assert.equal(runtime.writes.length, 0);
});

test("a manual-memo marker inside the mail body is not treated as saved staff notes", async () => {
  const runtime = loadSync("mail-customer", {
    existing: true,
    memo: "HPB予約番号：A123456\n【HPBメール本文】\n【同期前の手入力メモ】\nメール内の文字列",
  });
  await runtime.sync(mail);
  assert.doesNotMatch(runtime.writes[0].payload.memo, /メール内の文字列|【同期前の手入力メモ】/);
});

test("delayed mail refuses to reassign another customer's source-marked reservation", async () => {
  const runtime = loadSync("different-customer");
  await assert.rejects(runtime.sync(mail), /顧客.*一致.*同期を停止/);
  assert.equal(runtime.writes.length, 0);
});

test("delayed mail uses the resolved customer when source-marked bookings share a time window", async () => {
  const runtime = loadSync(null, {
    manualReservationRows: [
      {
        id: "different-customer-reservation",
        customer_id: "different-customer",
        staff_id: "staff-2",
        salon_id: "salon-1",
        menu: "HPB予約",
        memo: "別のお客様を先に登録",
        status: "confirmed",
        start_at: "2099-10-20T01:00:00.000Z",
        end_at: "2099-10-20T02:30:00.000Z",
      },
      {
        id: "matching-customer-reservation",
        customer_id: "mail-customer",
        staff_id: "staff-1",
        salon_id: "salon-1",
        menu: "HPB予約",
        memo: "対象のお客様を先に登録",
        status: "confirmed",
        start_at: "2099-10-20T01:00:00.000Z",
        end_at: "2099-10-20T02:30:00.000Z",
      },
    ],
  });

  const result = await runtime.sync(mail);

  assert.equal(result.result.reservationId, "matching-customer-reservation");
  assert.equal(result.result.reconciledManualEntry, true);
  assert.equal(runtime.writes.length, 1);
  assert.equal(runtime.writes[0].operation, "update");
  assert.deepEqual(runtime.writes[0].filters.slice(0, 2), [
    ["id", "matching-customer-reservation"],
    ["salon_id", "salon-1"],
  ]);
  assert.match(runtime.writes[0].payload.memo, /対象のお客様を先に登録/);
  assert.doesNotMatch(runtime.writes[0].payload.memo, /別のお客様を先に登録/);
});

test("delayed mail uses provider end time when the same customer has nearby manual bookings", async () => {
  const runtime = loadSync(null, {
    manualReservationRows: [
      {
        id: "shorter-manual-reservation",
        customer_id: "mail-customer",
        staff_id: null,
        salon_id: "salon-1",
        menu: "HPB予約",
        memo: "短い別予約",
        status: "confirmed",
        start_at: "2099-10-20T01:00:00.000Z",
        end_at: "2099-10-20T02:00:00.000Z",
      },
      {
        id: "matching-manual-reservation",
        customer_id: "mail-customer",
        staff_id: null,
        salon_id: "salon-1",
        menu: "HPB予約",
        memo: "同期対象の予約",
        status: "confirmed",
        start_at: "2099-10-20T01:03:00.000Z",
        end_at: "2099-10-20T02:32:00.000Z",
      },
    ],
  });

  const result = await runtime.sync(mail);

  assert.equal(result.result.reservationId, "matching-manual-reservation");
  assert.equal(result.result.reconciledManualEntry, true);
  assert.equal(runtime.writes.length, 1);
  assert.equal(runtime.writes[0].operation, "update");
  assert.match(runtime.writes[0].payload.memo, /同期対象の予約/);
  assert.doesNotMatch(runtime.writes[0].payload.memo, /短い別予約/);
});

test("a changed external booking preserves the staff-corrected customer link", async () => {
  const runtime = loadSync("staff-corrected-customer", {
    existing: true,
    existingExternalCustomer: {
      id: autoCustomerId,
      salon_id: "salon-1",
      name: "旧自動作成顧客",
    },
  });

  const result = await runtime.sync(
    mail.replace("2099年10月20日 10:00", "2099年10月20日 11:00")
  );

  assert.equal(result.result.mode, "updated");
  assert.equal(
    result.result.customerMatch.matchStatus,
    "preserved_existing_reservation_customer"
  );
  assert.equal(result.result.customerMatch.customerId, "staff-corrected-customer");
  assert.equal(runtime.writes.length, 1);
  assert.equal(runtime.writes[0].table, "reservations");
  assert.equal(runtime.writes[0].payload.customer_id, "staff-corrected-customer");
  assert.equal(runtime.writes[0].payload.start_at, "2099-10-20T02:00:00.000Z");
});

test("a changed external booking stops when its linked customer is missing", async () => {
  const runtime = loadSync("missing-customer", {
    existing: true,
    existingReservationCustomer: null,
  });

  await assert.rejects(runtime.sync(mail), /紐づく顧客を確認できません/);
  assert.equal(runtime.writes.length, 0);
});

test("a changed external booking stops when its linked customer belongs to another salon", async () => {
  const runtime = loadSync("other-salon-customer", {
    existing: true,
    existingReservationCustomer: {
      id: "other-salon-customer",
      salon_id: "salon-2",
      name: "別サロン顧客",
    },
  });

  await assert.rejects(runtime.sync(mail), /顧客が別サロン.*同期を停止/);
  assert.equal(runtime.writes.length, 0);
});

for (const customerId of ["mail-customer", null]) {
  test(`delayed mail preserves reconciliation for ${customerId ?? "unassigned customer"}`, async () => {
    const runtime = loadSync(customerId);
    const result = await runtime.sync(mail);
    assert.equal(result.result.reservationId, "manual-reservation");
    assert.equal(result.result.reconciledManualEntry, true);
    assert.equal(runtime.writes.length, 1);
    assert.equal(runtime.writes[0].operation, "update");
    assert.equal(runtime.writes[0].payload.customer_id, "mail-customer");
    assert.match(runtime.writes[0].payload.memo, /電話で先に登録/);
  });
}
