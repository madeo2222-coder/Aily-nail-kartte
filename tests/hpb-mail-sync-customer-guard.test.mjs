import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);

function loadSync(manualCustomerId, options = {}) {
  const writes = [];
  const customer = { id: "mail-customer", name: "テスト顧客", phone: "09000000000" };
  const manual = {
    id: "manual-reservation", customer_id: manualCustomerId,
    staff_id: null, salon_id: "salon-1", menu: "HPB予約",
    memo: options.memo ?? (options.existing ? "HPB予約番号：A123456" : "電話で先に登録"), status: options.status ?? "confirmed",
  };
  const db = {
    from(table) {
      if (options.rejectDatabaseAccess) {
        throw new Error("invalid mail must stop before database access");
      }
      if (table === "customers" && options.rejectCustomerLookup) {
        throw new Error("cancelled replay must not resolve or create customers");
      }
      let operation = "read";
      let externalLookup = false;
      let payload;
      let selected;
      const filters = [];
      const query = {
        select(columns) { selected = columns; return query; },
        eq(key, value) { filters.push([key, value]); return query; },
        not() { return query; },
        gte() { return query; },
        lte() { return query; },
        limit() { return query; },
        ilike() { externalLookup = true; return query; },
        update(value) { operation = "update"; payload = value; return query; },
        insert(value) { operation = "insert"; payload = value; return query; },
        upsert(value) { operation = "upsert"; payload = value; return query; },
        single() { return query; },
        maybeSingle() { return query; },
        then(resolve, reject) {
          if (operation !== "read") {
            writes.push({ table, operation, payload, selected, filters });
            const data = Object.hasOwn(options, "updateData")
              ? options.updateData : { id: payload?.id ?? manual.id };
            return Promise.resolve({ data, error: options.updateError ?? null }).then(resolve, reject);
          }
          const data = table === "salons" ? [{ id: "salon-1" }]
            : table === "customers" ? [customer]
              : table === "reservations" ? (options.missingReservation
                  ? []
                  : externalLookup && !options.existing ? [] : [manual])
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
  return { sync: load("../lib/hpb-mail-sync.ts").syncHpbMailText, writes };
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
  assert.deepEqual(runtime.writes[0].filters, [["id", "manual-reservation"], ["salon_id", "salon-1"]]);
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

const mail = `予約番号：A123456
氏名：テスト顧客
電話番号：09000000000
来店日時：2099年10月20日 10:00
指名スタッフ：指名なし
所要時間目安：90分`;

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

test("a cancellation received before its booking creates a persistent tombstone", async () => {
  const cancellation = loadSync("mail-customer", {
    missingReservation: true,
    rejectCustomerLookup: true,
  });
  const result = await cancellation.sync(`ご予約のキャンセル\n${mail}`);

  assert.equal(result.result.mode, "cancelled");
  assert.equal(result.result.createdCancellation, true);
  assert.equal(cancellation.writes.length, 1);
  assert.equal(cancellation.writes[0].operation, "insert");
  assert.equal(cancellation.writes[0].payload.status, "キャンセル");
  assert.equal(cancellation.writes[0].payload.salon_id, "salon-1");
  assert.equal(cancellation.writes[0].payload.customer_id, undefined);
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

for (const [reason, response] of [
  ["no inserted row", { updateData: null }],
  ["unexpected row", { updateData: { id: "other-reservation" } }],
  ["database error", { updateError: { message: "fixture insert rejected" } }],
]) {
  test(`an unmatched cancellation does not report success for ${reason}`, async () => {
    const runtime = loadSync("mail-customer", {
      missingReservation: true,
      rejectCustomerLookup: true,
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
    assert.equal(retry.writes.length, 1);
    assert.equal(retry.writes[0].operation, "update");
    memo = retry.writes[0].payload.memo;
    assert.equal(memo, firstMemo);
  }
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
