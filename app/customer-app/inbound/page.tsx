"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  inboundLanguageOptions,
  inboundTranslations,
  isInboundLanguage,
  type InboundLanguage,
} from "./translations";

const salonId = "e120ed90-fded-41b8-b3fe-f486e84f2418";
const uploadBucketName = "visit-photos";

const inboundMenus = [
  {
    id: "japan_simple",
    label: "Japan Simple Nail",
    price: 8800,
    minutes: 60,
    description: "Simple one-color or clean Japanese style nail.",
  },
  {
    id: "japanese_design",
    label: "Japanese Design Nail",
    price: 12800,
    minutes: 90,
    description: "Popular Japanese nail art for travelers.",
  },
  {
    id: "fortune_stone",
    label: "Fortune Stone Nail",
    price: 15800,
    minutes: 90,
    description: "Lucky color and power-stone inspired nail.",
  },
  {
    id: "anime_character",
    label: "Anime / Character Inspired Nail",
    price: 18800,
    minutes: 120,
    description: "Anime-inspired custom design consultation.",
  },
  {
    id: "premium_diamond",
    label: "Premium Diamond Nail",
    price: 28000,
    minutes: 120,
    description: "Luxury nail with premium parts. Price starts from ¥28,000.",
  },
];

const orderTypeOptions = [
  {
    value: "anime_character",
    label: "Anime Character Nail Tips",
    title: "🎨 Anime Character",
    description: "Anime, game, idol, character, or original design.",
    requestLabel: "Character / Design Request",
    placeholder:
      "Please tell us the character name, scene, color, theme, and your design request.",
  },
  {
    value: "fortune_sanmeigaku",
    label: "Fortune / Sanmeigaku Nail Tips",
    title: "🔮 Fortune / Sanmeigaku",
    description: "Japanese fortune-based lucky color nail design.",
    requestLabel: "Fortune / Sanmeigaku Request",
    placeholder:
      "Please tell us your birthday, lucky color request, desired image, and design preference.",
  },
  {
    value: "power_stone",
    label: "Power Stone Nail Tips",
    title: "💎 Power Stone",
    description: "Power-stone inspired nail tips for love, money, beauty, or luck.",
    requestLabel: "Power Stone Request",
    placeholder:
      "Please tell us your birthdate, desired effect, stone preference, color, and design request.",
  },
  {
    value: "other",
    label: "Other Custom Design",
    title: "✨ Other Custom",
    description: "Luxury, bridal, event, or fully custom nail tips.",
    requestLabel: "Custom Design Request",
    placeholder:
      "Please tell us your theme, color, occasion, reference image, and design request.",
  },
];

const timeOptions = [
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

function formatYen(value: number) {
  return `¥${value.toLocaleString("ja-JP")}`;
}

function getFileExtension(fileName: string) {
  const extension = fileName.split(".").pop();
  return extension ? extension.toLowerCase() : "jpg";
}

export default function InboundReservePage() {
  const todayText = useMemo(() => getTodayText(), []);
  const maxReservationDate = useMemo(
    () => addDaysText(todayText, 30),
    [todayText]
  );

  const [serviceType, setServiceType] = useState<"salon" | "tips">("tips");
  const [language, setLanguage] = useState<InboundLanguage>("en");
  const [guestCount, setGuestCount] = useState(2);
  const [selectedMenuId, setSelectedMenuId] = useState(inboundMenus[0].id);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [country, setCountry] = useState("");
  const [instagramId, setInstagramId] = useState("");
  const [orderType, setOrderType] = useState("anime_character");
  const [tipDesignRequest, setTipDesignRequest] = useState("");
  const [designFiles, setDesignFiles] = useState<File[]>([]);
  const [recipientName, setRecipientName] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  const [shippingCity, setShippingCity] = useState("");
  const [shippingState, setShippingState] = useState("");
  const [shippingPostalCode, setShippingPostalCode] = useState("");
  const [shippingPhone, setShippingPhone] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleUserEmail, setGoogleUserEmail] = useState("");

  const selectedMenu = useMemo(() => {
    return (
      inboundMenus.find((menu) => menu.id === selectedMenuId) ||
      inboundMenus[0]
    );
  }, [selectedMenuId]);

  const copy = inboundTranslations[language];

  const selectedOrderType = useMemo(() => {
    return (
      copy.orderTypes[orderType as keyof typeof copy.orderTypes] ||
      copy.orderTypes.anime_character
    );
  }, [copy, orderType]);

  const totalPrice = selectedMenu.price * guestCount;
  const durationMinutes = selectedMenu.minutes;

  useEffect(() => {
    async function loadGoogleUser() {
      const { data } = await supabase.auth.getUser();
      const user = data.user;

      if (!user) return;

      const email = user.email || "";
      const name =
        typeof user.user_metadata?.full_name === "string"
          ? user.user_metadata.full_name
          : "";

      if (email) {
        setGoogleUserEmail(email);
        setCustomerEmail((current) => current || email);
      }

      if (name) {
        setCustomerName((current) => current || name);
        setRecipientName((current) => current || name);
      }
    }

    loadGoogleUser();
  }, []);

  async function handleGoogleLogin() {
    setGoogleLoading(true);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/customer-app/inbound`,
        },
      });

      if (error) {
        showMessage(copy.messages.googleFailed);
        setGoogleLoading(false);
      }
    } catch (error) {
      console.error(error);
      showMessage(copy.messages.googleFailed);
      setGoogleLoading(false);
    }
  }

  function showMessage(text: string) {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 3000);
  }

  function handleDesignFilesChange(files: FileList | null) {
    if (!files) {
      setDesignFiles([]);
      return;
    }

    const selectedFiles = Array.from(files).slice(0, 3);
    setDesignFiles(selectedFiles);
  }

  async function uploadDesignImages() {
    const uploadedUrls: string[] = [];

    for (const file of designFiles) {
      const extension = getFileExtension(file.name);
      const filePath = `inbound-nail-tips/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}.${extension}`;

      const { error } = await supabase.storage
        .from(uploadBucketName)
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (error) throw new Error(error.message);

      const { data } = supabase.storage
        .from(uploadBucketName)
        .getPublicUrl(filePath);

      if (data.publicUrl) uploadedUrls.push(data.publicUrl);
    }

    return uploadedUrls;
  }

  async function handleSalonSubmit() {
    if (!selectedDate) return showMessage(copy.messages.dateRequired);
    if (!selectedTime) return showMessage(copy.messages.timeRequired);
    if (!customerName.trim()) return showMessage(copy.messages.nameRequired);
    if (!customerEmail.trim()) return showMessage(copy.messages.emailRequired);

    setSending(true);

    try {
      const memo = [
        "Inbound reservation",
        `Language: ${language}`,
        `Guests: ${guestCount}`,
        `Customer name: ${customerName.trim()}`,
        `Customer email: ${customerEmail.trim()}`,
        `Menu: ${selectedMenu.label}`,
        `Price per person: ${formatYen(selectedMenu.price)}`,
        `Total price estimate: ${formatYen(totalPrice)}`,
        `Duration estimate: ${durationMinutes} minutes`,
        "",
        "Cancellation policy:",
        "Please arrive on time. Late arrival may shorten the service time.",
        "No-show or same-day cancellation may be charged a cancellation fee.",
        "",
        note.trim() ? `Note: ${note.trim()}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      const response = await fetch("/api/inbound-reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          menu: `[Inbound] ${selectedMenu.label} / ${guestCount} guests`,
          date: selectedDate,
          time: selectedTime,
          salonId,
          durationMinutes,
          memo,
          guestCount,
          customerName: customerName.trim(),
          customerEmail: customerEmail.trim(),
        }),
      });

      const json = await response.json();

      if (!response.ok || !json.ok) {
        showMessage(copy.messages.reservationFailed);
        setSending(false);
        return;
      }

      showMessage(copy.messages.reservationSuccess);
      setSelectedTime("");
      setNote("");
    } catch (error) {
      console.error(error);
      showMessage(copy.messages.networkError);
    } finally {
      setSending(false);
    }
  }

  async function handleTipsSubmit() {
    if (!customerName.trim()) return showMessage(copy.messages.nameRequired);
    if (!customerEmail.trim()) return showMessage(copy.messages.emailRequired);
    if (!country.trim()) return showMessage(copy.messages.countryRequired);
    if (!recipientName.trim())
      return showMessage(copy.messages.recipientRequired);
    if (!shippingAddress.trim())
      return showMessage(copy.messages.addressRequired);
    if (!shippingCity.trim()) return showMessage(copy.messages.cityRequired);
    if (!shippingPostalCode.trim())
      return showMessage(copy.messages.postalRequired);
    if (!shippingPhone.trim())
      return showMessage(copy.messages.phoneRequired);
    if (!tipDesignRequest.trim())
      return showMessage(copy.messages.designRequired);

    setSending(true);

    try {
      let imageUrls: string[] = [];

      try {
        imageUrls = await uploadDesignImages();
      } catch (uploadError) {
        console.error("Reference image upload failed:", uploadError);
        showMessage(copy.messages.uploadFailed);
      }

      const response = await fetch("/api/inbound-nail-tip-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: customerName.trim(),
          customerEmail: customerEmail.trim(),
          country: country.trim(),
          instagramId: instagramId.trim(),
          language,
          orderType,
          designRequest: tipDesignRequest.trim(),
          imageUrls,
          recipientName: recipientName.trim(),
          shippingAddress: shippingAddress.trim(),
          shippingCity: shippingCity.trim(),
          shippingState: shippingState.trim(),
          shippingPostalCode: shippingPostalCode.trim(),
          shippingPhone: shippingPhone.trim(),
        }),
      });

      const json = await response.json();

      if (!response.ok || !json.ok) {
        showMessage(copy.messages.requestFailed);
        setSending(false);
        return;
      }

      showMessage(copy.messages.requestSuccess);
      setTipDesignRequest("");
      setDesignFiles([]);
      setNote("");
    } catch (error) {
      console.error(error);
      showMessage(copy.messages.networkError);
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 pb-10">
      <div className="mx-auto max-w-md space-y-4 px-4 pb-6 pt-4">
        <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400 p-5 text-white shadow">
          <div className="text-xs font-bold tracking-[0.25em] text-white/80">
            AILY NAIL STUDIO
          </div>
          <h1 className="mt-3 text-2xl font-black leading-tight">
            {copy.heroTitle}
          </h1>
          <p className="mt-3 text-sm leading-6 text-white/90">
            {copy.heroDescription}
          </p>

          <div className="mt-4 rounded-2xl bg-white/15 p-4 text-sm leading-6 text-white/95 backdrop-blur-sm">
            <p>{copy.paymentNotice}</p>
            <div className="mt-3 border-t border-white/20 pt-3 text-xs leading-5 text-white/85">
              {copy.localNote}
            </div>
          </div>

          <Link
            href="/customer-app/nail-tip-order"
            className="mt-4 block rounded-2xl border border-white/30 px-4 py-3 text-center text-sm font-bold text-white"
          >
            {copy.japanLink}
          </Link>

          <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-bold">
            {copy.badges.map((badge) => (
              <div key={badge} className="rounded-2xl bg-white/20 px-3 py-2">
                {badge}
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="text-base font-bold text-slate-900">{copy.quickLogin}</div>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {copy.quickLoginDescription}
          </p>

          {googleUserEmail ? (
            <div className="mt-3 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
              {copy.loggedInAs} {googleUserEmail}
            </div>
          ) : (
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={googleLoading}
              className="mt-4 w-full rounded-2xl border bg-white px-4 py-3 text-sm font-black text-slate-800 shadow-sm disabled:opacity-60"
            >
              {googleLoading ? copy.connecting : copy.continueGoogle}
            </button>
          )}
        </section>

        <section className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="text-lg font-black text-slate-900">
            {copy.portfolioTitle}
          </div>

          <p className="mt-2 text-sm text-slate-500">
            {copy.portfolioDescription}
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <img
                src="/inbound-gallery/one-piece1.jpg"
                alt={copy.portfolioCaptions[0]}
                className="h-40 w-full rounded-2xl object-cover"
              />
              <div className="mt-2 text-center text-xs font-bold">
                {copy.portfolioCaptions[0]}
              </div>
            </div>

            <div>
              <img
                src="/inbound-gallery/attack-on-titan.jpeg"
                alt={copy.portfolioCaptions[1]}
                className="h-40 w-full rounded-2xl object-cover"
              />
              <div className="mt-2 text-center text-xs font-bold">
                {copy.portfolioCaptions[1]}
              </div>
            </div>

            <div>
              <img
                src="/inbound-gallery/demon-slayer.jpeg"
                alt={copy.portfolioCaptions[2]}
                className="h-40 w-full rounded-2xl object-cover"
              />
              <div className="mt-2 text-center text-xs font-bold">
                {copy.portfolioCaptions[2]}
              </div>
            </div>

            <div>
              <img
                src="/inbound-gallery/jojo.jpeg"
                alt={copy.portfolioCaptions[3]}
                className="h-40 w-full rounded-2xl object-cover"
              />
              <div className="mt-2 text-center text-xs font-bold">
                {copy.portfolioCaptions[3]}
              </div>
            </div>

            <div className="col-span-2">
              <img
                src="/inbound-gallery/dragon-ball.jpeg"
                alt={copy.portfolioCaptions[4]}
                className="h-72 w-full rounded-2xl bg-white object-contain"
              />
              <div className="mt-2 text-center text-xs font-bold">
                {copy.portfolioCaptions[4]}
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl bg-pink-50 p-4 text-center">
            <div className="text-lg font-black text-pink-700">
              {copy.startingPrice}
            </div>
            <div className="mt-1 text-sm text-pink-600">
              {copy.worldwideAvailable}
            </div>
          </div>
        </section>

        <button
          type="button"
          onClick={() => {
            setServiceType("tips");
            window.setTimeout(() => {
              window.scrollTo({
                top: document.body.scrollHeight,
                behavior: "smooth",
              });
            }, 100);
          }}
          className="mt-4 w-full rounded-2xl bg-pink-600 px-4 py-4 text-sm font-black text-white shadow-sm"
        >
          {copy.requestCta}
        </button>

        <section className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="text-lg font-black text-slate-900">
            {copy.shippingTitle}
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {copy.shippingDescription}
          </p>

          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            {copy.categories.map((category, index) => (
              <div
                key={category}
                className={`rounded-2xl p-3 font-bold ${[
                  "bg-pink-50 text-pink-700",
                  "bg-purple-50 text-purple-700",
                  "bg-orange-50 text-orange-700",
                  "bg-blue-50 text-blue-700",
                ][index]}`}
              >
                {category}
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-2xl bg-slate-50 p-4">
            <div className="text-xs font-bold tracking-[0.2em] text-slate-400">
              {copy.shippingTo}
            </div>
            <div className="mt-2 text-sm font-bold leading-6 text-slate-700">
              {copy.countries}
            </div>
          </div>

          <div className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-800">
            {copy.paymentShort}
          </div>
        </section>

        <section className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="text-base font-bold text-slate-900">
            {copy.whatWouldYouLike}
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3">
            {orderTypeOptions.map((item) => {
              const translated =
                copy.orderTypes[item.value as keyof typeof copy.orderTypes];

              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => {
                    setServiceType("tips");
                    setOrderType(item.value);
                  }}
                  className={`rounded-3xl border p-4 text-left ${
                    serviceType === "tips" && orderType === item.value
                      ? "border-pink-300 bg-pink-50"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="text-lg font-black text-slate-900">
                    {translated[1]}
                  </div>
                  <div className="mt-1 text-sm leading-6 text-slate-500">
                    {translated[2]}
                  </div>
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => setServiceType("salon")}
              className={`rounded-3xl border p-4 text-left ${
                serviceType === "salon"
                  ? "border-purple-300 bg-purple-50"
                  : "border-slate-200 bg-white"
              }`}
            >
              <div className="text-lg font-black text-slate-900">
                {copy.salonTitle}
              </div>
              <div className="mt-1 text-sm leading-6 text-slate-500">
                {copy.salonDescription}
              </div>
            </button>
          </div>
        </section>

        <section className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="text-base font-bold text-slate-900">{copy.language}</div>
          <select
            value={language}
            onChange={(event) => {
              if (isInboundLanguage(event.target.value)) {
                setLanguage(event.target.value);
              }
            }}
            className="mt-3 w-full rounded-2xl border bg-white px-3 py-3 text-sm"
          >
            {inboundLanguageOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </section>

        {serviceType === "salon" ? (
          <>
            <section className="rounded-3xl border bg-white p-4 shadow-sm">
              <div className="text-base font-bold text-slate-900">
                {copy.guests}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                {[1, 2].map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setGuestCount(count)}
                    className={`rounded-2xl border px-3 py-4 text-sm font-black ${
                      guestCount === count
                        ? "border-purple-300 bg-purple-50 text-purple-700"
                        : "border-slate-200 bg-white text-slate-700"
                    }`}
                  >
                    {count} {count === 1 ? copy.person : copy.people}
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border bg-white p-4 shadow-sm">
              <div className="text-base font-bold text-slate-900">{copy.menu}</div>

              <div className="mt-3 space-y-2">
                {inboundMenus.map((menu) => {
                  const selected = menu.id === selectedMenuId;
                  const translatedMenu =
                    copy.menus[menu.id as keyof typeof copy.menus];

                  return (
                    <button
                      key={menu.id}
                      type="button"
                      onClick={() => setSelectedMenuId(menu.id)}
                      className={`w-full rounded-2xl border p-4 text-left ${
                        selected
                          ? "border-purple-300 bg-purple-50"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-black text-slate-900">
                            {translatedMenu[0]}
                          </div>
                          <div className="mt-1 text-xs leading-5 text-slate-500">
                            {translatedMenu[1]}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-black text-purple-700">
                            {formatYen(menu.price)}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {menu.minutes} {copy.minutes}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="rounded-3xl border bg-white p-4 shadow-sm">
              <div className="text-base font-bold text-slate-900">
                {copy.dateAndTime}
              </div>

              <div className="mt-4 space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-bold text-slate-700">
                    {copy.date}
                  </label>
                  <input
                    type="date"
                    value={selectedDate}
                    min={todayText}
                    max={maxReservationDate}
                    onChange={(event) => setSelectedDate(event.target.value)}
                    className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-bold text-slate-700">
                    {copy.time}
                  </label>
                  <select
                    value={selectedTime}
                    onChange={(event) => setSelectedTime(event.target.value)}
                    className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
                  >
                    <option value="">{copy.selectTime}</option>
                    {timeOptions.map((time) => (
                      <option key={time} value={time}>
                        {time}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>
          </>
        ) : null}

        <section className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="text-base font-bold text-slate-900">
            {copy.customerInformation}
          </div>

          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-bold text-slate-700">
                {copy.name}
              </label>
              <input
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
                placeholder={copy.placeholders.name}
                className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-slate-700">
                {copy.email}
              </label>
              <input
                type="email"
                value={customerEmail}
                onChange={(event) => setCustomerEmail(event.target.value)}
                placeholder={copy.placeholders.email}
                className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
              />
            </div>

            {serviceType === "tips" ? (
              <>
                <div>
                  <label className="mb-2 block text-sm font-bold text-slate-700">
                    {copy.country}
                  </label>
                  <input
                    value={country}
                    onChange={(event) => setCountry(event.target.value)}
                    placeholder={copy.placeholders.country}
                    className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-bold text-slate-700">
                    {copy.instagram}
                  </label>
                  <input
                    value={instagramId}
                    onChange={(event) => setInstagramId(event.target.value)}
                    placeholder={copy.placeholders.instagram}
                    className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-bold text-slate-700">
                    {copy.orderType}
                  </label>

                  <select
                    value={orderType}
                    onChange={(event) => setOrderType(event.target.value)}
                    className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
                  >
                    {orderTypeOptions.map((item) => (
                      <option key={item.value} value={item.value}>
                        {
                          copy.orderTypes[
                            item.value as keyof typeof copy.orderTypes
                          ][0]
                        }
                      </option>
                    ))}
                  </select>

                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    {selectedOrderType[2]}
                  </p>
                </div>

                <div className="rounded-3xl border border-pink-100 bg-pink-50 p-4">
                  <div className="text-base font-black text-slate-900">
                    {copy.shippingInformation}
                  </div>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    {copy.shippingInformationDescription}
                  </p>

                  <div className="mt-4 space-y-4">
                    <div>
                      <label className="mb-2 block text-sm font-bold text-slate-700">
                        {copy.recipientName}
                      </label>
                      <input
                        value={recipientName}
                        onChange={(event) =>
                          setRecipientName(event.target.value)
                        }
                        placeholder={copy.placeholders.recipient}
                        className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-bold text-slate-700">
                        {copy.address}
                      </label>
                      <textarea
                        value={shippingAddress}
                        onChange={(event) =>
                          setShippingAddress(event.target.value)
                        }
                        rows={3}
                        placeholder={copy.placeholders.address}
                        className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-bold text-slate-700">
                        {copy.city}
                      </label>
                      <input
                        value={shippingCity}
                        onChange={(event) =>
                          setShippingCity(event.target.value)
                        }
                        placeholder={copy.placeholders.city}
                        className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-bold text-slate-700">
                        {copy.state}
                      </label>
                      <input
                        value={shippingState}
                        onChange={(event) =>
                          setShippingState(event.target.value)
                        }
                        placeholder={copy.placeholders.state}
                        className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-bold text-slate-700">
                        {copy.postalCode}
                      </label>
                      <input
                        value={shippingPostalCode}
                        onChange={(event) =>
                          setShippingPostalCode(event.target.value)
                        }
                        placeholder={copy.placeholders.postal}
                        className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-bold text-slate-700">
                        {copy.phone}
                      </label>
                      <input
                        value={shippingPhone}
                        onChange={(event) =>
                          setShippingPhone(event.target.value)
                        }
                        placeholder={copy.placeholders.phone}
                        className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-bold text-slate-700">
                    {copy.referenceImages}
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(event) =>
                      handleDesignFilesChange(event.target.files)
                    }
                    className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
                  />
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    {copy.referenceImagesHelp}
                  </p>

                  {designFiles.length > 0 ? (
                    <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                      {designFiles.map((file) => (
                        <div key={file.name}>・{file.name}</div>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div>
                  <label className="mb-2 block text-sm font-bold text-slate-700">
                    {selectedOrderType[3]}
                  </label>
                  <textarea
                    value={tipDesignRequest}
                    onChange={(event) =>
                      setTipDesignRequest(event.target.value)
                    }
                    rows={5}
                    placeholder={selectedOrderType[4]}
                    className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
                  />
                </div>
              </>
            ) : (
              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  {copy.requestNote}
                </label>
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={4}
                  placeholder={copy.placeholders.note}
                  className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
                />
              </div>
            )}
          </div>
        </section>

        {serviceType === "salon" ? (
          <section className="rounded-3xl border bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-base font-bold text-slate-900">
                  {copy.summary}
                </div>
                <div className="mt-1 text-sm text-slate-500">
                  {copy.summaryDescription}
                </div>
              </div>
              <div className="rounded-full bg-purple-100 px-3 py-1 text-xs font-black text-purple-700">
                {guestCount} {copy.people}
              </div>
            </div>

            <div className="mt-4 rounded-2xl bg-slate-50 p-4">
              <div className="text-sm font-black text-slate-900">
                {
                  copy.menus[selectedMenu.id as keyof typeof copy.menus][0]
                }
              </div>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-white p-3">
                  <div className="text-xs text-slate-500">{copy.totalPrice}</div>
                  <div className="mt-1 text-lg font-black text-slate-900">
                    {formatYen(totalPrice)}
                  </div>
                </div>
                <div className="rounded-2xl bg-white p-3">
                  <div className="text-xs text-slate-500">{copy.time}</div>
                  <div className="mt-1 text-lg font-black text-slate-900">
                    {durationMinutes} {copy.minutes}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-800">
              {copy.cancellation}
            </div>

            <button
              type="button"
              onClick={handleSalonSubmit}
              disabled={sending}
              className="mt-4 w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
            >
              {sending ? copy.sending : copy.sendReservation}
            </button>
          </section>
        ) : (
          <section className="rounded-3xl border bg-white p-4 shadow-sm">
            <div className="text-base font-bold text-slate-900">
              {copy.customRequest}
            </div>

            <div className="mt-3 rounded-2xl bg-pink-50 p-4 text-sm leading-6 text-pink-800">
              {copy.customRequestNotice}
            </div>

            <div className="mt-4 rounded-2xl border border-pink-100 bg-white p-4">
              <div className="text-sm font-black text-slate-900">
                {copy.howItWorks}
              </div>

              <div className="mt-3 space-y-2 text-sm text-slate-700">
                {copy.steps.map((step) => (
                  <div key={step}>{step}</div>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={handleTipsSubmit}
              disabled={sending}
              className="mt-4 w-full rounded-2xl bg-pink-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
            >
              {sending ? copy.uploadingAndSending : copy.sendCustom}
            </button>
          </section>
        )}
      </div>

      {message ? (
        <div className="fixed left-1/2 top-4 z-50 w-[calc(100%-24px)] max-w-md -translate-x-1/2">
          <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 shadow-lg">
            <div className="text-sm font-bold text-blue-700">{message}</div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
