"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

const customMenuId = "custom";

const mainMenus = [
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
    minutes: 180,
  },
  {
    id: "length_10_free_120_parts",
    label: "10本長さだし 120分やり放題＆パーツ付け放題",
    price: 15500,
    minutes: 180,
  },
  {
    id: "one_color_point",
    label: "ワンカラー＋ポイントアート2本 or ストーン付け放題",
    price: 5500,
    minutes: 60,
  },
  { id: "simple_fixed", label: "定額シンプル", price: 6000, minutes: 90 },
  { id: "design_fixed", label: "定額デザイン", price: 7200, minutes: 100 },
  { id: "own_off_only", label: "【自店】オフのみ", price: 3300, minutes: 45 },
  { id: "other_off_only", label: "【他店】オフのみ", price: 3900, minutes: 60 },
  { id: customMenuId, label: "その他・自由入力", price: 0, minutes: 90 },
];

const offOptions = [
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

const addOnOptions = [
  {
    id: "length_1_3",
    label: "長さだし1〜3本",
    price: 550,
    priceSuffix: "〜",
    minutes: 30,
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

const reservationTimeOptions = [
  "10:00",
  "10:30",
  "11:00",
  "11:30",
  "12:00",
  "12:30",
  "13:00",
  "13:30",
  "14:00",
  "14:30",
  "15:00",
  "15:30",
  "16:00",
  "16:30",
  "17:00",
  "17:30",
  "18:00",
];

type MeResponse = {
  authenticated: boolean;
  customer?: {
    id?: string;
    salon_id?: string | null;
    name?: string | null;
  };
};

type StaffRow = {
  id: string;
  name: string | null;
};

type ReservationBlockRow = {
  id: string;
  staff_id: string | null;
  status: string | null;
  start_at: string | null;
  end_at: string | null;
};

type GalleryVisitRow = {
  id: string;
  menu_name: string | null;
  menu: string | null;
  color: string | null;
  visit_date: string | null;
};

type GalleryPhotoRow = {
  id: string;
  visit_id: string;
  image_url: string | null;
  created_at: string | null;
};

const signedInNavItems = [
  { key: "home", label: "ホーム", icon: "🏠", href: "/customer-app" },
  { key: "reserve", label: "予約", icon: "📅", href: "/customer-app/reserve" },
  { key: "gallery", label: "ギャラリー", icon: "💅", href: "/customer-app/gallery" },
  { key: "diagnosis", label: "診断", icon: "✨", href: "/customer-app/sanmeigaku" },
  { key: "mypage", label: "マイ", icon: "👤", href: "/customer-app/mypage" },
];

function getTodayText() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDaysText(dateText: string, days: number) {
  const date = new Date(`${dateText}T00:00:00+09:00`);
  date.setDate(date.getDate() + days);

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}

function getNominationFee(staffName: string) {
  if (staffName.includes("あかね") || staffName.includes("茜")) return 550;
  if (staffName.includes("まりな") || staffName.includes("マリナ")) return 330;
  return 0;
}

function formatYen(value: number) {
  return `¥${value.toLocaleString("ja-JP")}`;
}

function formatMinutes(minutes: number) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;

  if (hour <= 0) {
    return `${minute}分`;
  }

  if (minute === 0) {
    return `${hour}時間`;
  }

  return `${hour}時間${minute}分`;
}

function findInitialMenuId(menuFromQuery: string | null) {
  if (!menuFromQuery) return mainMenus[0].id;

  const matched = mainMenus.find((menu) => menu.label === menuFromQuery);

  return matched?.id || mainMenus[0].id;
}

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

function parseSupabaseTimestampAsUtc(value: string | null) {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (trimmed.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(trimmed)) {
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const normalized = trimmed.replace(" ", "T");
  const date = new Date(`${normalized}Z`);

  return Number.isNaN(date.getTime()) ? null : date;
}

function isCancelledStatus(status: string | null | undefined) {
  return status === "キャンセル" || status === "cancelled";
}

function hasReservationOverlap({
  targetDate,
  targetTime,
  minutes,
  reservations,
}: {
  targetDate: string;
  targetTime: string;
  minutes: number;
  reservations: ReservationBlockRow[];
}) {
  const startIso = buildUtcIsoFromJst(targetDate, targetTime);
  const endIso = addMinutesToUtcIso(targetDate, targetTime, minutes);

  if (!startIso || !endIso) return false;

  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return false;
  }

  return reservations.some((reservation) => {
    if (isCancelledStatus(reservation.status)) return false;

    const reservationStart = parseSupabaseTimestampAsUtc(
      reservation.start_at
    )?.getTime();
    const reservationEnd = parseSupabaseTimestampAsUtc(
      reservation.end_at
    )?.getTime();

    if (!reservationStart || !reservationEnd) return false;

    return start < reservationEnd && reservationStart < end;
  });
}

function isUsefulGalleryText(value: string | null | undefined) {
  const text = String(value || "").trim();

  if (!text) return false;

  if (/^\d+$/.test(text)) return false;

  if (/^\d+\s*分$/.test(text)) return false;

  return true;
}

function getGalleryMenuName(visit: GalleryVisitRow | null) {
  if (!visit) return "";

  if (isUsefulGalleryText(visit.menu_name)) {
    return String(visit.menu_name).trim();
  }

  if (isUsefulGalleryText(visit.menu)) {
    return String(visit.menu).trim();
  }

  return "";
}

function ReservePageContent() {
  const searchParams = useSearchParams();
  const menuFromQuery = searchParams.get("menu");
  const designId = searchParams.get("design");

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [staffs, setStaffs] = useState<StaffRow[]>([]);
  const [reservationBlocks, setReservationBlocks] = useState<
    ReservationBlockRow[]
  >([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);

  const [customerId, setCustomerId] = useState("");
  const [salonId, setSalonId] = useState("");

  const [galleryPhotoUrl, setGalleryPhotoUrl] = useState("");
  const [galleryMenuName, setGalleryMenuName] = useState("");
  const [galleryColor, setGalleryColor] = useState("");
  const [galleryLoading, setGalleryLoading] = useState(false);

  const [selectedMenuId, setSelectedMenuId] = useState(
    findInitialMenuId(menuFromQuery)
  );
  const [customMenu, setCustomMenu] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const [customMinutes, setCustomMinutes] = useState("90");

  const [selectedOffId, setSelectedOffId] = useState("none");
  const [selectedAddOnIds, setSelectedAddOnIds] = useState<string[]>([]);

  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [note, setNote] = useState("");

  const todayText = useMemo(() => getTodayText(), []);
  const maxReservationDate = useMemo(() => addDaysText(todayText, 40), [todayText]);

  useEffect(() => {
    async function checkAuthAndLoadStaffs() {
      try {
        const res = await fetch("/api/line-login/me", { cache: "no-store" });
        const json = (await res.json()) as MeResponse;

        setIsLoggedIn(!!json.authenticated);
        setCustomerId(json.customer?.id || "");
        setSalonId(json.customer?.salon_id || "");

        const { data, error } = await supabase
          .from("staffs")
          .select("id, name")
          .order("name", { ascending: true });

        if (error) {
          console.error("staffs fetch error:", error.message);
          setStaffs([]);
        } else {
          setStaffs((data as StaffRow[]) || []);
        }
      } catch {
        setIsLoggedIn(false);
        setCustomerId("");
        setSalonId("");
        setStaffs([]);
      } finally {
        setLoading(false);
      }
    }

    checkAuthAndLoadStaffs();
  }, []);

  useEffect(() => {
    async function fetchGalleryReference() {
      if (!designId) {
        setGalleryPhotoUrl("");
        setGalleryMenuName("");
        setGalleryColor("");
        return;
      }

      setGalleryLoading(true);

      try {
        const { data: photoData, error: photoError } = await supabase
          .from("visit_photos")
          .select("id, visit_id, image_url, created_at")
          .eq("visit_id", designId)
          .not("image_url", "is", null)
          .order("created_at", { ascending: true })
          .limit(1);

        if (photoError) {
          console.error("gallery photo fetch error:", photoError.message);
          setGalleryPhotoUrl("");
        } else {
          const firstPhoto = ((photoData || []) as GalleryPhotoRow[])[0] || null;
          setGalleryPhotoUrl(firstPhoto?.image_url || "");
        }

        const { data: visitData, error: visitError } = await supabase
          .from("visits")
          .select("id, menu_name, menu, color, visit_date")
          .eq("id", designId)
          .maybeSingle();

        if (visitError) {
          console.error("gallery visit fetch error:", visitError.message);
          setGalleryMenuName("");
          setGalleryColor("");
        } else {
          const visit = (visitData as GalleryVisitRow | null) || null;
          setGalleryMenuName(getGalleryMenuName(visit));
          setGalleryColor(visit?.color?.trim() || "");
        }
      } catch (error) {
        console.error("gallery reference fetch error:", error);
        setGalleryPhotoUrl("");
        setGalleryMenuName("");
        setGalleryColor("");
      } finally {
        setGalleryLoading(false);
      }
    }

    fetchGalleryReference();
  }, [designId]);

  const selectedMainMenu = useMemo(() => {
    return mainMenus.find((menu) => menu.id === selectedMenuId) || mainMenus[0];
  }, [selectedMenuId]);

  const selectedOff = useMemo(() => {
    return offOptions.find((item) => item.id === selectedOffId) || offOptions[0];
  }, [selectedOffId]);

  const selectedAddOns = useMemo(() => {
    return addOnOptions.filter((item) => selectedAddOnIds.includes(item.id));
  }, [selectedAddOnIds]);

  const selectedStaffName = useMemo(() => {
    if (!selectedStaffId) return "指名なし";
    return staffs.find((staff) => staff.id === selectedStaffId)?.name || "未設定";
  }, [selectedStaffId, staffs]);

  const selectedStaffFee = useMemo(() => {
    if (!selectedStaffId) return 0;
    return getNominationFee(selectedStaffName);
  }, [selectedStaffId, selectedStaffName]);

  const mainMenuName = useMemo(() => {
    if (selectedMenuId === customMenuId) {
      return customMenu.trim();
    }

    return selectedMainMenu.label;
  }, [selectedMenuId, selectedMainMenu.label, customMenu]);

  const mainMenuPrice = useMemo(() => {
    if (selectedMenuId === customMenuId) {
      const price = Number(customPrice || 0);
      return Number.isFinite(price) ? price : 0;
    }

    return selectedMainMenu.price;
  }, [selectedMenuId, customPrice, selectedMainMenu.price]);

  const mainMenuMinutes = useMemo(() => {
    if (selectedMenuId === customMenuId) {
      const minutes = Number(customMinutes || 90);

      if (!Number.isFinite(minutes) || minutes < 30) {
        return 90;
      }

      return minutes;
    }

    return selectedMainMenu.minutes;
  }, [selectedMenuId, customMinutes, selectedMainMenu.minutes]);

  const reservationMenu = useMemo(() => {
    const parts = [mainMenuName];

    if (selectedOff.id !== "none") {
      parts.push(`オフ：${selectedOff.label}`);
    }

    selectedAddOns.forEach((addOn) => {
      parts.push(`追加：${addOn.label}`);
    });

    return parts.filter(Boolean).join(" / ");
  }, [mainMenuName, selectedOff, selectedAddOns]);

  const totalPrice = useMemo(() => {
    const addOnPrice = selectedAddOns.reduce((sum, item) => sum + item.price, 0);

    return mainMenuPrice + selectedOff.price + addOnPrice + selectedStaffFee;
  }, [mainMenuPrice, selectedOff.price, selectedAddOns, selectedStaffFee]);

  const totalMinutes = useMemo(() => {
    const addOnMinutes = selectedAddOns.reduce(
      (sum, item) => sum + item.minutes,
      0
    );

    const result = mainMenuMinutes + selectedOff.minutes + addOnMinutes;

    if (!Number.isFinite(result) || result < 30) {
      return 90;
    }

    return result;
  }, [mainMenuMinutes, selectedOff.minutes, selectedAddOns]);

  useEffect(() => {
    async function fetchReservationBlocks() {
      if (!isLoggedIn || !selectedDate) {
        setReservationBlocks([]);
        return;
      }

      setAvailabilityLoading(true);

      const dayStart = buildUtcIsoFromJst(selectedDate, "00:00");
      const dayEnd = buildUtcIsoFromJst(selectedDate, "23:59");

      if (!dayStart || !dayEnd) {
        setReservationBlocks([]);
        setAvailabilityLoading(false);
        return;
      }

      try {
        let query = supabase
          .from("reservations")
          .select("id, staff_id, status, start_at, end_at")
          .lt("start_at", dayEnd)
          .gt("end_at", dayStart);

        if (salonId) {
          query = query.eq("salon_id", salonId);
        }

        if (selectedStaffId) {
          query = query.eq("staff_id", selectedStaffId);
        }

        const { data, error } = await query;

        if (error) {
          console.error("reservation blocks fetch error:", error.message);
          setReservationBlocks([]);
        } else {
          setReservationBlocks((data || []) as ReservationBlockRow[]);
        }
      } catch (error) {
        console.error("reservation blocks fetch error:", error);
        setReservationBlocks([]);
      } finally {
        setAvailabilityLoading(false);
      }
    }

    fetchReservationBlocks();
  }, [isLoggedIn, selectedDate, selectedStaffId, salonId]);

  const availableTimeOptions = useMemo(() => {
    if (!selectedDate) {
      return reservationTimeOptions;
    }

    return reservationTimeOptions.filter((time) => {
      return !hasReservationOverlap({
        targetDate: selectedDate,
        targetTime: time,
        minutes: totalMinutes,
        reservations: reservationBlocks,
      });
    });
  }, [selectedDate, totalMinutes, reservationBlocks]);

  useEffect(() => {
    if (!selectedTime) return;
    if (!selectedDate) return;
    if (availableTimeOptions.includes(selectedTime)) return;

    setSelectedTime("");
  }, [selectedTime, selectedDate, availableTimeOptions]);

  const timeBreakdown = useMemo(() => {
    const items = [
      {
        label: mainMenuName || "メインメニュー未入力",
        minutes: mainMenuMinutes,
      },
    ];

    if (selectedOff.id !== "none") {
      items.push({
        label: selectedOff.label,
        minutes: selectedOff.minutes,
      });
    }

    selectedAddOns.forEach((addOn) => {
      items.push({
        label: addOn.label,
        minutes: addOn.minutes,
      });
    });

    return items.filter((item) => item.minutes > 0);
  }, [mainMenuName, mainMenuMinutes, selectedOff, selectedAddOns]);

  const priceBreakdown = useMemo(() => {
    const items = [
      {
        label: mainMenuName || "メインメニュー未入力",
        price: mainMenuPrice,
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

    selectedAddOns.forEach((addOn) => {
      items.push({
        label: addOn.label,
        price: addOn.price,
        priceSuffix: addOn.priceSuffix,
      });
    });

    if (selectedStaffFee > 0) {
      items.push({
        label: `指名料：${selectedStaffName}`,
        price: selectedStaffFee,
        priceSuffix: "",
      });
    }

    return items;
  }, [
    mainMenuName,
    mainMenuPrice,
    selectedOff,
    selectedAddOns,
    selectedStaffFee,
    selectedStaffName,
  ]);

  const hasPriceSuffix = useMemo(() => {
    return priceBreakdown.some((item) => item.priceSuffix);
  }, [priceBreakdown]);

  const galleryReferenceText = useMemo(() => {
    if (!designId) return "";

    return [
      "Aily Gallery参考デザインあり",
      `参考デザインID：${designId}`,
      galleryPhotoUrl ? `参考写真URL：${galleryPhotoUrl}` : "",
      galleryMenuName ? `参考メニュー：${galleryMenuName}` : "",
      galleryColor ? `参考カラー：${galleryColor}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }, [designId, galleryPhotoUrl, galleryMenuName, galleryColor]);

  const summaryText = useMemo(() => {
    const dateText = selectedDate || "未選択";
    const timeText = selectedTime || "未選択";

    return `${dateText} ${timeText} / ${
      reservationMenu || "メニュー未入力"
    } / ${selectedStaffName}`;
  }, [selectedDate, selectedTime, reservationMenu, selectedStaffName]);

  function showMessage(text: string) {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 2500);
  }

  function toggleAddOn(addOnId: string) {
    setSelectedAddOnIds((current) => {
      if (current.includes(addOnId)) {
        return current.filter((id) => id !== addOnId);
      }

      const isLengthAddOn = addOnId.startsWith("length_");

      if (isLengthAddOn) {
        return [...current.filter((id) => !id.startsWith("length_")), addOnId];
      }

      return [...current, addOnId];
    });
  }

  async function handleReserveSubmit() {
    if (!selectedDate) {
      showMessage("希望日を選択してください");
      return;
    }

    if (selectedDate > maxReservationDate) {
      showMessage("予約は本日から40日先まで選択できます");
      return;
    }

    if (selectedDate < todayText) {
      showMessage("過去の日付は選択できません");
      return;
    }

    if (!selectedTime) {
      showMessage("希望時間を選択してください");
      return;
    }

    if (!availableTimeOptions.includes(selectedTime)) {
      showMessage("選択した時間は埋まりました。別の時間を選択してください");
      return;
    }

    if (!reservationMenu) {
      showMessage("メニューを選択してください");
      return;
    }

    setSending(true);

    try {
      const timeLines = timeBreakdown.map(
        (item) => `・${item.label}：${item.minutes}分`
      );

      const priceLines = priceBreakdown.map(
        (item) =>
          `・${item.label}：${formatYen(item.price)}${item.priceSuffix || ""}`
      );

      const memoLines = [
        galleryReferenceText,
        selectedStaffFee > 0
          ? `指名料：${selectedStaffName} ${formatYen(selectedStaffFee)}`
          : "指名料：なし",
        `合計金額目安：${formatYen(totalPrice)}${hasPriceSuffix ? "〜" : ""}`,
        `所要時間目安：${formatMinutes(totalMinutes)}（${totalMinutes}分）`,
        "時間内訳",
        ...timeLines,
        "金額内訳",
        ...priceLines,
        note.trim() ? `備考：${note.trim()}` : "",
      ].filter(Boolean);

      const response = await fetch("/api/reservations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          menu: reservationMenu,
          date: selectedDate,
          time: selectedTime,
          staffId: selectedStaffId,
          customerId,
          salonId,
          durationMinutes: totalMinutes,
          memo: memoLines.join("\n"),
        }),
      });

      const json = await response.json();

      if (!response.ok || !json.ok) {
        showMessage(json.error || "予約保存に失敗しました");
        setSending(false);
        return;
      }

      showMessage("予約希望を受け付けました");
      setNote("");
      setCustomMenu("");
      setCustomPrice("");
      setCustomMinutes("90");
      setSelectedOffId("none");
      setSelectedAddOnIds([]);
      setSelectedTime("");
    } catch (error) {
      console.error(error);
      showMessage("通信エラーが発生しました");
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 pb-24">
        <div className="mx-auto max-w-md px-4 pb-6 pt-4">
          <div className="rounded-3xl border bg-white p-6 shadow-sm">
            <div className="text-base font-bold text-slate-900">予約ページ</div>
            <div className="mt-3 text-sm text-slate-600">読み込み中...</div>
          </div>
        </div>
      </main>
    );
  }

  if (!isLoggedIn) {
    return (
      <main className="min-h-screen bg-slate-50 pb-24">
        <div className="mx-auto max-w-md space-y-4 px-4 pb-6 pt-4">
          <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-rose-500 via-pink-500 to-orange-400 p-5 text-white shadow">
            <div className="text-xs font-bold tracking-wide opacity-90">
              AILY MY PAGE
            </div>
            <h1 className="mt-2 text-2xl font-bold leading-tight">予約する</h1>
            <p className="mt-3 text-sm leading-6 text-white/90">
              会員のお客様はLINEログイン後にご予約へ、初めてのお客様は初回入力後にご案内いたします。
            </p>

            <div className="mt-4 grid grid-cols-1 gap-2">
              <Link
                href="/customer-app/login"
                className="rounded-xl bg-white px-4 py-3 text-center text-sm font-bold text-rose-500"
              >
                LINEでログイン
              </Link>
              <Link
                href="/customer-intake"
                className="rounded-xl border border-white/30 px-4 py-3 text-center text-sm font-bold text-white"
              >
                初めての方はこちら
              </Link>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 pb-24">
      <div className="mx-auto max-w-md space-y-4 px-4 pb-6 pt-4">
        <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-rose-500 via-pink-500 to-orange-400 p-5 text-white shadow">
          <div className="text-xs font-bold tracking-wide opacity-90">
            AILY MY PAGE
          </div>
          <h1 className="mt-2 text-2xl font-bold leading-tight">予約する</h1>
          <p className="mt-3 text-sm leading-6 text-white/90">
            メニュー・オフ・追加メニューから、目安時間を自動計算します。
          </p>
        </section>

        {designId ? (
          <section className="rounded-3xl border border-rose-100 bg-rose-50 p-4 shadow-sm">
            <div className="text-sm font-bold text-rose-700">
              Aily Galleryから選択したデザインがあります
            </div>
            <p className="mt-2 text-sm leading-6 text-rose-700">
              この予約には、ギャラリーで選んだ参考デザインを自動で残します。
              当日スタッフが写真を確認できます。
            </p>

            {galleryLoading ? (
              <div className="mt-3 rounded-2xl bg-white px-4 py-3 text-xs font-bold text-slate-500">
                参考写真を読み込み中...
              </div>
            ) : galleryPhotoUrl ? (
              <a
                href={galleryPhotoUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 block overflow-hidden rounded-3xl border border-rose-100 bg-white shadow-sm"
              >
                <img
                  src={galleryPhotoUrl}
                  alt="Aily Gallery参考デザイン"
                  className="h-64 w-full object-cover"
                />
              </a>
            ) : (
              <div className="mt-3 rounded-2xl bg-white px-4 py-3 text-xs font-bold text-slate-500">
                参考写真が見つかりませんでした。
              </div>
            )}

            <div className="mt-3 rounded-2xl bg-white px-4 py-3 text-xs font-bold leading-5 text-slate-600">
              参考デザインID：{designId}
              {galleryMenuName ? (
                <>
                  <br />
                  参考メニュー：{galleryMenuName}
                </>
              ) : null}
              {galleryColor ? (
                <>
                  <br />
                  参考カラー：{galleryColor}
                </>
              ) : null}
            </div>
          </section>
        ) : null}

        <section className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="text-base font-bold text-slate-900">予約内容</div>

          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                希望日
              </label>

              <div className="w-full overflow-hidden rounded-2xl border border-slate-300 bg-white">
                <input
                  type="date"
                  value={selectedDate}
                  min={todayText}
                  max={maxReservationDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="block w-full border-0 bg-transparent px-4 py-3 text-sm outline-none"
                  style={{
                    minHeight: "52px",
                  }}
                />
              </div>

              <p className="mt-2 text-xs leading-5 text-slate-500">
                予約可能期間：本日から40日先まで
              </p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                希望時間
              </label>
              <select
                value={selectedTime}
                onChange={(e) => setSelectedTime(e.target.value)}
                className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
                disabled={availabilityLoading || !selectedDate}
              >
                <option value="">
                  {!selectedDate
                    ? "先に希望日を選択してください"
                    : availabilityLoading
                    ? "空き時間を確認中..."
                    : "選択してください"}
                </option>
                {availableTimeOptions.map((time) => (
                  <option key={time} value={time}>
                    {time}
                  </option>
                ))}
              </select>

              {selectedDate && !availabilityLoading ? (
                availableTimeOptions.length > 0 ? (
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    選択中のメニュー所要時間で空いている時間だけ表示しています。
                  </p>
                ) : (
                  <p className="mt-2 rounded-2xl bg-rose-50 px-4 py-3 text-xs font-bold leading-5 text-rose-700">
                    この日は選択中のメニュー時間で空きがありません。
                    別の日付・担当者・メニューを選択してください。
                  </p>
                )
              ) : null}
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                メインメニュー
              </label>
              <select
                value={selectedMenuId}
                onChange={(e) => setSelectedMenuId(e.target.value)}
                className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
              >
                {mainMenus.map((menu) => (
                  <option key={menu.id} value={menu.id}>
                    {menu.label} / {formatYen(menu.price)} /{" "}
                    {formatMinutes(menu.minutes)}
                  </option>
                ))}
              </select>

              {selectedMenuId === customMenuId ? (
                <div className="mt-3 space-y-3 rounded-2xl bg-slate-50 p-3">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      メニュー自由入力
                    </label>
                    <input
                      type="text"
                      value={customMenu}
                      onChange={(e) => setCustomMenu(e.target.value)}
                      placeholder="例：持ち込みデザイン、長さ出し相談等"
                      className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">
                        金額目安
                      </label>
                      <input
                        type="number"
                        value={customPrice}
                        onChange={(e) => setCustomPrice(e.target.value)}
                        placeholder="例：7700"
                        className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
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
                        className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
                      />
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                オフメニュー
              </label>
              <select
                value={selectedOffId}
                onChange={(e) => setSelectedOffId(e.target.value)}
                className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
              >
                {offOptions.map((off) => (
                  <option key={off.id} value={off.id}>
                    {off.label} / +{formatYen(off.price)} / +{off.minutes}分
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="mb-2 text-sm font-medium text-slate-700">
                追加メニュー
              </div>

              <div className="space-y-2">
                {addOnOptions.map((addOn) => {
                  const checked = selectedAddOnIds.includes(addOn.id);

                  return (
                    <button
                      key={addOn.id}
                      type="button"
                      onClick={() => toggleAddOn(addOn.id)}
                      className={`w-full rounded-2xl border px-3 py-3 text-left text-sm ${
                        checked
                          ? "border-purple-300 bg-purple-50 text-purple-800"
                          : "border-slate-200 bg-white text-slate-700"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-bold">{addOn.label}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            +{formatYen(addOn.price)}
                            {addOn.priceSuffix} / +{addOn.minutes}分
                          </div>
                        </div>
                        <div className="text-lg">{checked ? "☑" : "□"}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                担当者
              </label>
              <select
                value={selectedStaffId}
                onChange={(e) => setSelectedStaffId(e.target.value)}
                className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
              >
                <option value="">指名なし / 指名料なし</option>
                {staffs.map((staff) => {
                  const name = staff.name || "名前未設定";
                  const fee = getNominationFee(name);

                  return (
                    <option key={staff.id} value={staff.id}>
                      {name}
                      {fee > 0 ? ` / 指名料 ${formatYen(fee)}` : ""}
                    </option>
                  );
                })}
              </select>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                担当者を選ぶと、そのスタッフの空き時間だけ表示します。
                指名なしの場合は店舗全体の空き時間で確認します。
              </p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                ご要望・備考
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={4}
                placeholder={
                  designId
                    ? "例：ギャラリーの雰囲気に近づけたい、色味を変えたい等"
                    : "例：爪が薄い、オフィス向けにしたい、色味相談したい等"
                }
                className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
              />
            </div>
          </div>
        </section>

        <section className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-base font-bold text-slate-900">予約確認</div>
            <div className="rounded-full bg-purple-100 px-3 py-1 text-xs font-bold text-purple-600">
              自動計算
            </div>
          </div>

          <div className="mt-4 rounded-2xl bg-slate-50 p-4">
            <div className="text-xs text-slate-500">現在の選択内容</div>
            <div className="mt-2 text-sm font-bold leading-6 text-slate-900">
              {summaryText}
            </div>

            {selectedStaffFee > 0 ? (
              <div className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-xs font-bold leading-5 text-amber-800">
                指名料：{selectedStaffName} {formatYen(selectedStaffFee)}
              </div>
            ) : null}

            {designId ? (
              <div className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-xs font-bold leading-5 text-rose-700">
                Aily Gallery参考デザインあり
                <br />
                参考デザインID：{designId}
                {galleryPhotoUrl ? (
                  <>
                    <br />
                    参考写真URL：予約メモに保存されます
                  </>
                ) : null}
              </div>
            ) : null}

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white p-3">
                <div className="text-xs text-slate-500">合計金額目安</div>
                <div className="mt-1 text-lg font-black text-slate-900">
                  {formatYen(totalPrice)}
                  {hasPriceSuffix ? "〜" : ""}
                </div>
              </div>

              <div className="rounded-2xl bg-white p-3">
                <div className="text-xs text-slate-500">所要時間目安</div>
                <div className="mt-1 text-lg font-black text-slate-900">
                  {formatMinutes(totalMinutes)}
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-2xl bg-white p-3">
              <div className="text-sm font-bold text-slate-900">時間内訳</div>
              <div className="mt-2 space-y-1 text-sm text-slate-600">
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

            <div className="mt-3 rounded-2xl bg-rose-50/70 p-3">
              <div className="text-sm font-bold text-slate-900">金額内訳</div>
              <div className="mt-2 space-y-1 text-sm text-slate-600">
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
              <div className="mt-3 flex justify-between border-t border-rose-100 pt-3 text-sm font-bold text-slate-900">
                <span>合計金額目安</span>
                <span>
                  {formatYen(totalPrice)}
                  {hasPriceSuffix ? "〜" : ""}
                </span>
              </div>
            </div>

            <div className="mt-3 text-xs leading-5 text-slate-500">
              カレンダーには、この所要時間で予約枠が反映されます。
            </div>

            {note.trim() ? (
              <div className="mt-3 text-sm leading-6 text-slate-600">
                {note}
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={handleReserveSubmit}
            disabled={sending || availabilityLoading || !selectedTime}
            className="mt-4 w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
          >
            {sending ? "送信中..." : "この内容で予約希望を送る"}
          </button>

          <div className="mt-3 rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-800">
            予約内容はスタッフ側予約一覧に反映されます。確定連絡は店舗からのご案内をお待ちください。
          </div>
        </section>
      </div>

      {message ? (
        <div className="fixed left-1/2 top-4 z-50 w-[calc(100%-24px)] max-w-md -translate-x-1/2">
          <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <div className="text-sm font-bold text-blue-700">{message}</div>
              <button
                type="button"
                onClick={() => setMessage("")}
                className="rounded-lg border border-blue-200 bg-white px-2 py-1 text-xs font-bold text-blue-700"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t bg-white/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto grid max-w-md grid-cols-5">
          {signedInNavItems.map((item) => {
            const isActive = item.key === "reserve";

            return (
              <Link
                key={item.key}
                href={item.href}
                className={`flex min-h-[64px] flex-col items-center justify-center px-1 text-[11px] font-medium transition ${
                  isActive
                    ? "bg-rose-50 text-rose-500"
                    : "text-gray-500 hover:text-gray-800"
                }`}
              >
                <span className="text-lg leading-none">{item.icon}</span>
                <span className="mt-1 leading-none">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </main>
  );
}

export default function CustomerAppReservePage() {
  return (
    <Suspense fallback={null}>
      <ReservePageContent />
    </Suspense>
  );
}