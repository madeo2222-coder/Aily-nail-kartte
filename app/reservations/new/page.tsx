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

type ExternalShortcut = {
  label: string;
  source: (typeof EXTERNAL_SOURCE_OPTIONS)[number];
  title: string;
  minutes: number;
};

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

const DURATION_OPTIONS = [30, 45, 60, 75, 90, 120, 150, 180, 210, 240];

const EXTERNAL_SHORTCUTS: ExternalShortcut[] = [
  {
    label: "ホットペッパー",
    source: "ホットペッパー",
    title: "ホットペッパー予約",
    minutes: 90,
  },
  {
    label: "ミニモ",
    source: "ミニモ",
    title: "ミニモ予約",
    minutes: 90,
  },
  {
    label: "電話予約",
    source: "電話予約",
    title: "電話予約",
    minutes: 90,
  },
  {
    label: "Instagram",
    source: "Instagram DM",
    title: "Instagram予約",
    minutes: 90,
  },
  {
    label: "休憩60分",
    source: "休憩",
    title: "休憩",
    minutes: 60,
  },
  {
    label: "店休日",
    source: "店休日",
    title: "店休日",
    minutes: 240,
  },
];

const CUSTOM_MENU_ID = "custom";

const MAIN_MENU_OPTIONS = [
  { id: "one_color", label: "ワンカラー", price: 4500, minutes: 55 },
  { id: "color_gradation", label: "カラーグラデーション", price: 5000, minutes: 60 },
  { id: "french", label: "フレンチネイル", price: 6000, minutes: 90 },
  { id: "magnet_one_color", label: "マグネットワンカラー", price: 5000, minutes: 60 },
  { id: "free_90", label: "90分やり放題", price: 7700, minutes: 90 },
  { id: "free_120", label: "120分やり放題", price: 9500, minutes: 120 },
  {
    id: "free_120_parts",
    label: "120分やり放題 パーツ付け放題",
    price: 11000,
    minutes: 120,
  },
  {
    id: "length_10_free_120",
    label: "10本長さだし 120分やり放題",
    price: 14000,
    minutes: 150,
  },
  {
    id: "length_10_free_120_parts",
    label: "10本長さだし 120分やり放題＆パーツ付け放題",
    price: 15500,
    minutes: 150,
  },
  {
    id: "one_color_point",
    label: "ワンカラー＋ポイントアート2本 or ストーン付け放題",
    price: 5500,
    minutes: 60,
  },
  { id: "simple_fixed", label: "定額シンプル", price: 6000, minutes: 60 },
  { id: "design_fixed", label: "定額デザイン", price: 7200, minutes: 90 },
  { id: "own_off_only", label: "【自店】オフのみ", price: 3300, minutes: 60 },
  { id: "other_off_only", label: "【他店】オフのみ", price: 3900, minutes: 60 },
  { id: CUSTOM_MENU_ID, label: "その他・自由入力", price: 0, minutes: 90 },
];

const OFF_OPTIONS = [
  { id: "none", label: "オフしない", price: 0, minutes: 0 },
  {
    id: "soft_free",
    label: "【新規＆再来】ソフトジェル☆オフ無料",
    price: 0,
    minutes: 30,
  },
  {
    id: "soft_other",
    label: "【再来】他店ソフトジェルオフ",
    price: 1100,
    minutes: 30,
  },
  {
    id: "scalp",
    label: "【新規】スカルプオフ",
    price: 1100,
    minutes: 30,
  },
];

const ADD_ON_OPTIONS = [
  { id: "none", label: "追加なし", price: 0, priceSuffix: "", minutes: 0 },
  {
    id: "length_1_3",
    label: "長さだし1〜3本",
    price: 550,
    priceSuffix: "〜",
    minutes: 0,
  },
  {
    id: "length_4_7",
    label: "長さだし4〜7本",
    price: 2200,
    priceSuffix: "〜",
    minutes: 30,
  },
  {
    id: "length_8_10",
    label: "長さだし8〜10本",
    price: 4400,
    priceSuffix: "〜",
    minutes: 30,
  },
];

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

function formatYen(value: number) {
  return `¥${value.toLocaleString("ja-JP")}`;
}

function formatMinutes(minutes: number) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;

  if (hour <= 0) return `${minute}分`;
  if (minute === 0) return `${hour}時間`;

  return `${hour}時間${minute}分`;
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

  const [selectedMenuId, setSelectedMenuId] = useState("one_color");
  const [customMenu, setCustomMenu] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const [customMinutes, setCustomMinutes] = useState("90");
  const [selectedOffId, setSelectedOffId] = useState("none");
  const [selectedAddOnId, setSelectedAddOnId] = useState("none");

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
        const salonRows = (salonsRes.data as Salon[]) || [];
        setSalons(salonRows);

        if (salonRows.length === 1) {
          setSalonId(salonRows[0].id);
        }
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

  const isSingleSalonMode = salons.length <= 1;

  const filteredCustomers = useMemo(() => {
    if (isSingleSalonMode) {
      return allCustomers;
    }

    if (!salonId) {
      return [];
    }

    return allCustomers.filter((item) => item.salon_id === salonId);
  }, [allCustomers, salonId, isSingleSalonMode]);

  const filteredStaffs = useMemo(() => {
    if (isSingleSalonMode) {
      return allStaffs;
    }

    if (!salonId) {
      return [];
    }

    return allStaffs.filter((item) => item.salon_id === salonId);
  }, [allStaffs, salonId, isSingleSalonMode]);

  const selectedMainMenu = useMemo(() => {
    return (
      MAIN_MENU_OPTIONS.find((item) => item.id === selectedMenuId) ||
      MAIN_MENU_OPTIONS[0]
    );
  }, [selectedMenuId]);

  const selectedOff = useMemo(() => {
    return OFF_OPTIONS.find((item) => item.id === selectedOffId) || OFF_OPTIONS[0];
  }, [selectedOffId]);

  const selectedAddOn = useMemo(() => {
    return (
      ADD_ON_OPTIONS.find((item) => item.id === selectedAddOnId) ||
      ADD_ON_OPTIONS[0]
    );
  }, [selectedAddOnId]);

  const normalMenuName = useMemo(() => {
    if (selectedMenuId === CUSTOM_MENU_ID) {
      return customMenu.trim();
    }

    return selectedMainMenu.label;
  }, [selectedMenuId, selectedMainMenu.label, customMenu]);

  const normalMenuPrice = useMemo(() => {
    if (selectedMenuId === CUSTOM_MENU_ID) {
      const price = Number(customPrice || 0);
      return Number.isFinite(price) ? price : 0;
    }

    return selectedMainMenu.price;
  }, [selectedMenuId, selectedMainMenu.price, customPrice]);

  const normalMenuMinutes = useMemo(() => {
    if (selectedMenuId === CUSTOM_MENU_ID) {
      const minutes = Number(customMinutes || 90);

      if (!Number.isFinite(minutes) || minutes < 30) {
        return 90;
      }

      return minutes;
    }

    return selectedMainMenu.minutes;
  }, [selectedMenuId, selectedMainMenu.minutes, customMinutes]);

  const calculatedPrice = useMemo(() => {
    return normalMenuPrice + selectedOff.price + selectedAddOn.price;
  }, [normalMenuPrice, selectedOff.price, selectedAddOn.price]);

  const calculatedMinutes = useMemo(() => {
    const total =
      normalMenuMinutes + selectedOff.minutes + selectedAddOn.minutes;

    if (!Number.isFinite(total) || total < 30) {
      return 90;
    }

    return total;
  }, [normalMenuMinutes, selectedOff.minutes, selectedAddOn.minutes]);

  const timeBreakdown = useMemo(() => {
    const mainLabel =
      selectedMenuId === CUSTOM_MENU_ID
        ? customMenu.trim() || "その他・自由入力"
        : selectedMainMenu.label;

    const items = [
      {
        label: mainLabel,
        minutes: normalMenuMinutes,
      },
    ];

    if (selectedOff.id !== "none") {
      items.push({
        label: selectedOff.label,
        minutes: selectedOff.minutes,
      });
    }

    if (selectedAddOn.id !== "none") {
      items.push({
        label: selectedAddOn.label,
        minutes: selectedAddOn.minutes,
      });
    }

    return items.filter((item) => item.minutes > 0);
  }, [
    selectedMenuId,
    customMenu,
    selectedMainMenu.label,
    normalMenuMinutes,
    selectedOff,
    selectedAddOn,
  ]);

  const priceBreakdown = useMemo(() => {
    const mainLabel =
      selectedMenuId === CUSTOM_MENU_ID
        ? customMenu.trim() || "その他・自由入力"
        : selectedMainMenu.label;

    const items = [
      {
        label: mainLabel,
        price: normalMenuPrice,
        priceSuffix: "",
      },
    ];

    if (selectedOff.id !== "none") {
      items.push({
        label: selectedOff.label,
        price: selectedOff.price,
        priceSuffix: "",
      });
    }

    if (selectedAddOn.id !== "none") {
      items.push({
        label: selectedAddOn.label,
        price: selectedAddOn.price,
        priceSuffix: selectedAddOn.priceSuffix,
      });
    }

    return items;
  }, [
    selectedMenuId,
    customMenu,
    selectedMainMenu.label,
    normalMenuPrice,
    selectedOff,
    selectedAddOn,
  ]);

  useEffect(() => {
    if (reservationMode === "normal") {
      setDurationMinutes(calculatedMinutes);
    }
  }, [reservationMode, calculatedMinutes]);

  const displayMenu = useMemo(() => {
    if (reservationMode === "external") {
      if (externalTitle.trim()) return externalTitle.trim();

      if (externalSource === "休憩") return "休憩";
      if (externalSource === "店休日") return "店休日";

      return `${externalSource}予約`;
    }

    const parts = [normalMenuName];

    if (selectedOff.id !== "none") {
      parts.push(`オフ：${selectedOff.label}`);
    }

    if (selectedAddOn.id !== "none") {
      parts.push(`追加：${selectedAddOn.label}`);
    }

    return parts.filter(Boolean).join(" / ");
  }, [
    reservationMode,
    externalTitle,
    externalSource,
    normalMenuName,
    selectedOff,
    selectedAddOn,
  ]);

  const combinedMemo = useMemo(() => {
    if (reservationMode === "external") {
      return memo.trim() || null;
    }

    const timeLines = timeBreakdown.map(
      (item) => `・${item.label}：${item.minutes}分`
    );

    const priceLines = priceBreakdown.map(
      (item) =>
        `・${item.label}：${formatYen(item.price)}${item.priceSuffix || ""}`
    );

    const lines = [
      `合計金額目安：${formatYen(calculatedPrice)}${
        selectedAddOn.priceSuffix ? selectedAddOn.priceSuffix : ""
      }`,
      `所要時間目安：${formatMinutes(calculatedMinutes)}（${calculatedMinutes}分）`,
      "時間内訳",
      ...timeLines,
      "金額内訳",
      ...priceLines,
      memo.trim() ? `補足メモ：${memo.trim()}` : "",
    ].filter(Boolean);

    return lines.join("\n");
  }, [
    reservationMode,
    memo,
    calculatedPrice,
    calculatedMinutes,
    selectedAddOn.priceSuffix,
    timeBreakdown,
    priceBreakdown,
  ]);

  function handleSalonChange(nextSalonId: string) {
    setSalonId(nextSalonId);
    setCustomerId("");
    setStaffId("");
  }

  function handleCustomerChange(nextCustomerId: string) {
    setCustomerId(nextCustomerId);

    if (isSingleSalonMode) {
      return;
    }

    const selectedCustomer =
      allCustomers.find((item) => item.id === nextCustomerId) ?? null;

    if (!selectedCustomer?.salon_id) return;

    if (!salonId) {
      setSalonId(selectedCustomer.salon_id);
      setStaffId("");
      return;
    }

    if (selectedCustomer.salon_id !== salonId) {
      setSalonId(selectedCustomer.salon_id);
      setStaffId("");
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

    if (nextMode === "normal") {
      setDurationMinutes(calculatedMinutes);
    }
  }

  function handleExternalShortcut(shortcut: ExternalShortcut) {
    setReservationMode("external");
    setErrorMessage("");
    setStatus("予約");
    setCustomerId("");
    setExternalSource(shortcut.source);
    setExternalTitle(shortcut.title);
    setDurationMinutes(shortcut.minutes);
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
      .select("id, status, menu, start_at, end_at")
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
      } = {
        salon_id: salonId,
        staff_id: staffId,
        menu: displayMenu,
        start_at: startAt,
        end_at: endAt,
        status: reservationMode === "external" ? "予約確定" : status,
        memo: combinedMemo,
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
                : "店舗側で通常予約を手入力します。メニュー・オフ・追加内容から所要時間を自動計算します。"}
            </div>

            <div className="rounded-3xl border border-purple-100 bg-purple-50/40 p-4">
              <div className="text-sm font-bold text-slate-900">
                外部予約ショートカット
              </div>
              <div className="mt-2 text-xs leading-5 text-slate-500">
                HPB・ミニモ・休憩などをワンタップで外部予約ブロックに切り替えます。
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {EXTERNAL_SHORTCUTS.map((shortcut) => (
                  <button
                    key={shortcut.label}
                    type="button"
                    onClick={() => handleExternalShortcut(shortcut)}
                    className="rounded-2xl border border-purple-200 bg-white px-3 py-3 text-sm font-bold text-purple-700 shadow-sm"
                    suppressHydrationWarning
                  >
                    {shortcut.label}
                  </button>
                ))}
              </div>
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
                {isSingleSalonMode ? (
                  <p className="mt-2 text-xs text-slate-500">
                    1店舗運用のため、顧客・スタッフは全件表示します。
                  </p>
                ) : null}
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
                <>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      メインメニュー
                    </label>
                    <select
                      value={selectedMenuId}
                      onChange={(e) => setSelectedMenuId(e.target.value)}
                      className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-4 py-3 text-sm"
                      suppressHydrationWarning
                    >
                      {MAIN_MENU_OPTIONS.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label} / {formatYen(item.price)} /{" "}
                          {formatMinutes(item.minutes)}
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedMenuId === CUSTOM_MENU_ID ? (
                    <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
                      <div className="grid gap-4">
                        <div>
                          <label className="mb-2 block text-sm font-medium text-slate-700">
                            自由入力メニュー名
                          </label>
                          <input
                            type="text"
                            value={customMenu}
                            onChange={(e) => setCustomMenu(e.target.value)}
                            placeholder="例：持ち込みデザイン"
                            className="w-full rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm"
                            suppressHydrationWarning
                          />
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <div>
                            <label className="mb-2 block text-sm font-medium text-slate-700">
                              金額目安
                            </label>
                            <input
                              type="number"
                              value={customPrice}
                              onChange={(e) => setCustomPrice(e.target.value)}
                              placeholder="例：7700"
                              className="w-full rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm"
                              suppressHydrationWarning
                            />
                          </div>

                          <div>
                            <label className="mb-2 block text-sm font-medium text-slate-700">
                              時間目安
                            </label>
                            <input
                              type="number"
                              value={customMinutes}
                              onChange={(e) => setCustomMinutes(e.target.value)}
                              placeholder="例：90"
                              className="w-full rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm"
                              suppressHydrationWarning
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      オフメニュー
                    </label>
                    <select
                      value={selectedOffId}
                      onChange={(e) => setSelectedOffId(e.target.value)}
                      className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-4 py-3 text-sm"
                      suppressHydrationWarning
                    >
                      {OFF_OPTIONS.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label} / +{formatYen(item.price)} / +{item.minutes}分
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      追加メニュー
                    </label>
                    <select
                      value={selectedAddOnId}
                      onChange={(e) => setSelectedAddOnId(e.target.value)}
                      className="w-full rounded-2xl border border-rose-200 bg-rose-50/40 px-4 py-3 text-sm"
                      suppressHydrationWarning
                    >
                      {ADD_ON_OPTIONS.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label} / +{formatYen(item.price)}
                          {item.priceSuffix} / +{item.minutes}分
                        </option>
                      ))}
                    </select>
                  </div>
                </>
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
                  {reservationMode === "external" ? (
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
                  ) : (
                    <div className="rounded-2xl border border-rose-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900">
                      {formatMinutes(durationMinutes)}（{durationMinutes}分）
                    </div>
                  )}
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
                  <div>
                    種別：
                    {reservationMode === "external" ? "外部予約ブロック" : "通常予約"}
                  </div>
                  <div>メニュー/ブロック：{displayMenu || "未入力"}</div>
                  <div>日付：{date || "未選択"}</div>
                  <div>開始：{startTime}</div>
                  <div>
                    所要時間：{formatMinutes(durationMinutes)}（
                    {durationMinutes}分）
                  </div>

                  {reservationMode === "normal" ? (
                    <>
                      <div className="mt-3 rounded-2xl bg-slate-50 p-3">
                        <div className="font-bold text-slate-900">時間内訳</div>
                        <div className="mt-2 space-y-1">
                          {timeBreakdown.map((item) => (
                            <div
                              key={`${item.label}-${item.minutes}`}
                              className="flex justify-between gap-3"
                            >
                              <span>{item.label}</span>
                              <span className="font-bold text-slate-900">
                                {item.minutes}分
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="mt-2 rounded-2xl bg-rose-50/60 p-3">
                        <div className="font-bold text-slate-900">金額内訳</div>
                        <div className="mt-2 space-y-1">
                          {priceBreakdown.map((item) => (
                            <div
                              key={`${item.label}-${item.price}`}
                              className="flex justify-between gap-3"
                            >
                              <span>{item.label}</span>
                              <span className="font-bold text-slate-900">
                                {formatYen(item.price)}
                                {item.priceSuffix}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="mt-3 flex justify-between border-t border-rose-100 pt-3 font-bold text-slate-900">
                          <span>合計金額目安</span>
                          <span>
                            {formatYen(calculatedPrice)}
                            {selectedAddOn.priceSuffix}
                          </span>
                        </div>
                      </div>
                    </>
                  ) : null}

                  <div>
                    登録元：
                    {reservationMode === "external" ? externalSource : "手入力"}
                  </div>
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