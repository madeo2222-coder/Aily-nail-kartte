"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Salon = {
  id: string;
  name: string | null;
};

type Customer = {
  id: string;
  name: string | null;
  salon_id: string | null;
};

type Staff = {
  id: string;
  name: string | null;
  salon_id: string | null;
};

type ReservationMode = "normal" | "external";

const STATUS_OPTIONS = ["予約", "来店", "完了", "キャンセル"] as const;

const EXTERNAL_SOURCE_OPTIONS = [
  "ホットペッパー",
  "ミニモ",
  "電話予約",
  "Instagram DM",
  "LINE",
  "休憩",
  "店休日",
  "その他ブロック",
] as const;

const DURATION_OPTIONS = [30, 45, 60, 75, 90, 120, 150, 180];

function buildUtcIsoFromJst(targetDate: string, targetTime: string) {
  if (!targetDate || !targetTime) return null;

  const date = new Date(`${targetDate}T${targetTime}:00+09:00`);

  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString();
}

function addMinutesToUtcIso(
  targetDate: string,
  targetTime: string,
  minutes: number
) {
  const startIso = buildUtcIsoFromJst(targetDate, targetTime);
  if (!startIso) return null;

  const start = new Date(startIso);
  const end = new Date(start.getTime() + minutes * 60 * 1000);

  if (Number.isNaN(end.getTime())) return null;

  return end.toISOString();
}

function isCancelledStatus(status: string | null | undefined) {
  return status === "キャンセル" || status === "cancelled";
}

export default function ReservationNewPage() {
  const router = useRouter();

  const [salons, setSalons] = useState<Salon[]>([]);
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [allStaffs, setAllStaffs] = useState<Staff[]>([]);

  const [reservationMode, setReservationMode] =
    useState<ReservationMode>("normal");

  const [salonId, setSalonId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("10:00");
  const [durationMinutes, setDurationMinutes] = useState(90);
  const [menu, setMenu] = useState("");
  const [memo, setMemo] = useState("");
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number]>("予約");

  const [externalSource, setExternalSource] =
    useState<(typeof EXTERNAL_SOURCE_OPTIONS)[number]>("ホットペッパー");
  const [externalTitle, setExternalTitle] = useState("");

  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function fetchMasterData() {
      setPageLoading(true);
      setErrorMessage("");

      const [salonsRes, customersRes, staffsRes] = await Promise.all([
        supabase
          .from("salons")
          .select("id, name")
          .order("created_at", { ascending: true }),
        supabase
          .from("customers")
          .select("id, name, salon_id")
          .order("created_at", { ascending: false }),
        supabase
          .from("staffs")
          .select("id, name, salon_id")
          .order("created_at", { ascending: true }),
      ]);

      if (salonsRes.error) {
        setErrorMessage("サロン一覧の取得に失敗しました");
        setSalons([]);
      } else {
        setSalons((salonsRes.data as Salon[]) || []);
      }

      if (customersRes.error) {
        setErrorMessage("顧客一覧の取得に失敗しました");
        setAllCustomers([]);
      } else {
        setAllCustomers((customersRes.data as Customer[]) || []);
      }

      if (staffsRes.error) {
        setErrorMessage("スタッフ一覧の取得に失敗しました");
        setAllStaffs([]);
      } else {
        setAllStaffs((staffsRes.data as Staff[]) || []);
      }

      setPageLoading(false);
    }

    fetchMasterData();
  }, []);

  const filteredCustomers = useMemo(() => {
    return allCustomers.filter((item) =>
      salonId ? item.salon_id === salonId : true
    );
  }, [allCustomers, salonId]);

  const filteredStaffs = useMemo(() => {
    return allStaffs.filter((item) =>
      salonId ? item.salon_id === salonId : true
    );
  }, [allStaffs, salonId]);

  const displayMenu = useMemo(() => {
    if (reservationMode === "external") {
      if (externalTitle.trim()) return externalTitle.trim();

      if (externalSource === "休憩") return "休憩";
      if (externalSource === "店休日") return "店休日";

      return `${externalSource}予約`;
    }

    return menu.trim();
  }, [reservationMode, menu, externalSource, externalTitle]);

  function handleSalonChange(nextSalonId: string) {
    setSalonId(nextSalonId);

    const nextCustomers = allCustomers.filter((item) =>
      nextSalonId ? item.salon_id === nextSalonId : true
    );
    const nextStaffs = allStaffs.filter((item) =>
      nextSalonId ? item.salon_id === nextSalonId : true
    );

    const customerExists = nextCustomers.some((item) => item.id === customerId);
    const staffExists = nextStaffs.some((item) => item.id === staffId);

    setCustomerId(customerExists ? customerId : nextCustomers[0]?.id ?? "");
    setStaffId(staffExists ? staffId : nextStaffs[0]?.id ?? "");
  }

  function handleCustomerChange(nextCustomerId: string) {
    setCustomerId(nextCustomerId);

    const selectedCustomer =
      allCustomers.find((item) => item.id === nextCustomerId) ?? null;

    if (!selectedCustomer?.salon_id) return;

    if (!salonId) {
      const nextSalonId = selectedCustomer.salon_id;
      setSalonId(nextSalonId);

      const nextStaffs = allStaffs.filter((item) => item.salon_id === nextSalonId);
      const staffExists = nextStaffs.some((item) => item.id === staffId);
      setStaffId(staffExists ? staffId : nextStaffs[0]?.id ?? "");
      return;
    }

    if (selectedCustomer.salon_id !== salonId) {
      const nextSalonId = selectedCustomer.salon_id;
      setSalonId(nextSalonId);

      const nextStaffs = allStaffs.filter((item) => item.salon_id === nextSalonId);
      const staffExists = nextStaffs.some((item) => item.id === staffId);
      setStaffId(staffExists ? staffId : nextStaffs[0]?.id ?? "");
    }
  }

  function handleModeChange(nextMode: ReservationMode) {
    setReservationMode(nextMode);
    setErrorMessage("");

    if (nextMode === "external") {
      setStatus("予約");
      setCustomerId("");
      if (!durationMinutes) {
        setDurationMinutes(90);
      }
    }
  }

  async function checkOverlap({
    startAt,
    endAt,
  }: {
    startAt: string;
    endAt: string;
  }) {
    let query = supabase
      .from("reservations")
      .select("id, status, menu, source, start_at, end_at")
      .lt("start_at", endAt)
      .gt("end_at", startAt);

    if (salonId) {
      query = query.eq("salon_id", salonId);
    }

    if (staffId) {
      query = query.eq("staff_id", staffId);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    const activeOverlaps = (data || []).filter(
      (item) => !isCancelledStatus(item.status)
    );

    return activeOverlaps;
  }

  async function handleSubmit() {
    setErrorMessage("");

    if (!salonId) {
      setErrorMessage("サロンを選択してください");
      return;
    }

    if (reservationMode === "normal" && !customerId) {
      setErrorMessage("顧客を選択してください");
      return;
    }

    if (!staffId) {
      setErrorMessage("担当スタッフを選択してください");
      return;
    }

    if (!date || !startTime) {
      setErrorMessage("日付と開始時間を入力してください");
      return;
    }

    if (!displayMenu) {
      setErrorMessage("メニューまたはブロック名を入力してください");
      return;
    }

    const startAt = buildUtcIsoFromJst(date, startTime);
    const endAt = addMinutesToUtcIso(date, startTime, durationMinutes);

    if (!startAt || !endAt) {
      setErrorMessage("日時の作成に失敗しました");
      return;
    }

    setLoading(true);

    try {
      const overlaps = await checkOverlap({
        startAt,
        endAt,
      });

      if (overlaps.length > 0) {
        setLoading(false);
        setErrorMessage(
          "この時間帯はすでに予約またはブロックがあります。カレンダーで確認してください。"
        );
        return;
      }

      const insertPayload: {
        salon_id: string;
        customer_id?: string;
        staff_id: string;
        menu: string;
        start_at: string;
        end_at: string;
        status: string;
        memo: string | null;
        source: string;
      } = {
        salon_id: salonId,
        staff_id: staffId,
        menu: displayMenu,
        start_at: startAt,
        end_at: endAt,
        status: reservationMode === "external" ? "予約確定" : status,
        memo: memo.trim() || null,
        source: reservationMode === "external" ? externalSource : "手入力",
      };

      if (reservationMode === "normal" && customerId) {
        insertPayload.customer_id = customerId;
      }

      const { error } = await supabase.from("reservations").insert([insertPayload]);

      setLoading(false);

      if (error) {
        setErrorMessage(`登録失敗: ${error.message}`);
        return;
      }

      router.push("/reservations/calendar");
    } catch (error) {
      setLoading(false);
      const message =
        error instanceof Error ? error.message : "登録中にエラーが発生しました";
      setErrorMessage(message);
    }
  }

  return (
    <main className="min-h-screen bg-rose-50/40" suppressHydrationWarning>
      <div className="mx-auto max-w-[760px] space-y-4 p-4 pb-24">
        <section className="overflow-hidden rounded-[28px] bg-gradient-to-br from-rose-400 via-pink-400 to-orange-300 p-5 text-white shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-bold tracking-[0.25em] text-white/80">
                NAILY AIDOL
              </p>
              <h1 className="mt-2 text-2xl font-bold">予約登録ページ</h1>
              <p className="mt-2 text-sm leading-6 text-white/90">
                通常予約・外部予約ブロックを登録できます。
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/reservations"
                className="rounded-2xl border border-white/40 bg-white/80 px-4 py-3 text-sm font-bold text-rose-600 backdrop-blur"
              >
                予約一覧へ
              </Link>

              <Link
                href="/reservations/calendar"
                className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-rose-500 shadow"
              >
                カレンダーへ
              </Link>
            </div>
          </div>
        </section>

        {pageLoading ? (
          <section className="rounded-[28px] border border-rose-100 bg-white p-6 shadow-sm">
            <p className="text-sm text-slate-500">読み込み中...</p>
          </section>
        ) : (
          <section className="space-y-4 rounded-[28px] border border-rose-100 bg-white p-4 shadow-sm sm:p-6">
            {errorMessage ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
                {errorMessage}
              </div>
            ) : null}

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                登録種別
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleModeChange("normal")}
                  className={`rounded-2xl border px-4 py-3 text-sm font-bold ${
                    reservationMode === "normal"
                      ? "border-rose-300 bg-rose-100 text-rose-700"
                      : "border-slate-200 bg-white text-slate-600"
                  }`}
                >
                  通常予約
                </button>

                <button
                  type="button"
                  onClick={() => handleModeChange("external")}
                  className={`rounded-2xl border px-4 py-3 text-sm font-bold ${
                    reservationMode === "external"
                      ? "border-purple-300 bg-purple-100 text-purple-700"
                      : "border-slate-200 bg-white text-slate-600"
                  }`}
                >
                  外部予約ブロック
                </button>
              </div>
            </div>

            <div className="rounded-3xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
              {reservationMode === "external"
                ? "ホットペッパー・ミニモ・電話予約・休憩などをブロックとして登録します。顧客マイページ予約との重複防止に使います。"
                : "店舗側で通常予約を手入力します。"}
            </div>

            <div className="grid gap-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  サロン
                </label>
                <select
                  value={salonId}
                  onChange={(e) => handleSalonChange(e.target.value)}
                  className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-4 py-3 text-sm"
                  suppressHydrationWarning
                >
                  <option value="">選択してください</option>
                  {salons.map((salon) => (
                    <option key={salon.id} value={salon.id}>
                      {salon.name || "名称未設定"}
                    </option>
                  ))}
                </select>
              </div>

              {reservationMode === "normal" ? (
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    顧客
                  </label>
                  <select
                    value={customerId}
                    onChange={(e) => handleCustomerChange(e.target.value)}
                    className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-4 py-3 text-sm"
                    suppressHydrationWarning
                  >
                    <option value="">選択してください</option>
                    {filteredCustomers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name || "名称未設定"}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  担当スタッフ
                </label>
                <select
                  value={staffId}
                  onChange={(e) => setStaffId(e.target.value)}
                  className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-4 py-3 text-sm"
                  suppressHydrationWarning
                >
                  <option value="">選択してください</option>
                  {filteredStaffs.map((staff) => (
                    <option key={staff.id} value={staff.id}>
                      {staff.name || "名称未設定"}
                    </option>
                  ))}
                </select>
              </div>

              {reservationMode === "external" ? (
                <>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      外部予約種別
                    </label>
                    <select
                      value={externalSource}
                      onChange={(e) =>
                        setExternalSource(
                          e.target.value as (typeof EXTERNAL_SOURCE_OPTIONS)[number]
                        )
                      }
                      className="w-full rounded-2xl border border-purple-200 bg-purple-50/50 px-4 py-3 text-sm"
                      suppressHydrationWarning
                    >
                      {EXTERNAL_SOURCE_OPTIONS.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      ブロック名
                    </label>
                    <input
                      type="text"
                      value={externalTitle}
                      onChange={(e) => setExternalTitle(e.target.value)}
                      placeholder="未入力なら ホットペッパー予約 / ミニモ予約 などで保存"
                      className="w-full rounded-2xl border border-purple-200 bg-purple-50/50 px-4 py-3 text-sm"
                      suppressHydrationWarning
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    メニュー
                  </label>
                  <input
                    type="text"
                    value={menu}
                    onChange={(e) => setMenu(e.target.value)}
                    placeholder="例: ワンカラー"
                    className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-4 py-3 text-sm"
                    suppressHydrationWarning
                  />
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    日付
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-4 py-3 text-sm"
                    suppressHydrationWarning
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    開始時間
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-4 py-3 text-sm"
                    suppressHydrationWarning
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    所要時間
                  </label>
                  <select
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value))}
                    className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-4 py-3 text-sm"
                    suppressHydrationWarning
                  >
                    {DURATION_OPTIONS.map((minutes) => (
                      <option key={minutes} value={minutes}>
                        {minutes}分
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  メモ
                </label>
                <textarea
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  rows={3}
                  placeholder={
                    reservationMode === "external"
                      ? "例: HPB管理画面より登録 / お客様名メモ / 休憩理由など"
                      : "補足メモ"
                  }
                  className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-4 py-3 text-sm"
                  suppressHydrationWarning
                />
              </div>

              {reservationMode === "normal" ? (
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    ステータス
                  </label>
                  <select
                    value={status}
                    onChange={(e) =>
                      setStatus(e.target.value as (typeof STATUS_OPTIONS)[number])
                    }
                    className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-4 py-3 text-sm"
                    suppressHydrationWarning
                  >
                    {STATUS_OPTIONS.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              <div className="rounded-3xl border border-slate-100 bg-white p-4">
                <div className="text-sm font-bold text-slate-900">登録内容確認</div>
                <div className="mt-3 grid gap-2 text-sm text-slate-600">
                  <div>種別：{reservationMode === "external" ? "外部予約ブロック" : "通常予約"}</div>
                  <div>メニュー/ブロック：{displayMenu || "未入力"}</div>
                  <div>日付：{date || "未選択"}</div>
                  <div>開始：{startTime}</div>
                  <div>所要時間：{durationMinutes}分</div>
                  <div>登録元：{reservationMode === "external" ? externalSource : "手入力"}</div>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className={`w-full rounded-2xl py-4 text-sm font-bold text-white disabled:opacity-60 ${
                reservationMode === "external" ? "bg-purple-700" : "bg-slate-900"
              }`}
              suppressHydrationWarning
            >
              {loading
                ? "登録中..."
                : reservationMode === "external"
                ? "外部予約ブロックを登録する"
                : "登録する"}
            </button>
          </section>
        )}
      </div>
    </main>
  );
}