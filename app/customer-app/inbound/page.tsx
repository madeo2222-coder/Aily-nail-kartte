"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

const salonId = "e120ed90-fded-41b8-b3fe-f486e84f2418";
const uploadBucketName = "visit-photos";

const languageOptions = [
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" },
  { value: "ko", label: "한국어" },
  { value: "zh-CN", label: "简体中文" },
  { value: "zh-TW", label: "繁體中文" },
  { value: "th", label: "ไทย" },
  { value: "es", label: "Español" },
];

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
    () => addDaysText(todayText, 40),
    [todayText]
  );

  const [serviceType, setServiceType] = useState<"salon" | "tips">("salon");
  const [language, setLanguage] = useState("en");
  const [guestCount, setGuestCount] = useState(2);
  const [selectedMenuId, setSelectedMenuId] = useState(inboundMenus[0].id);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [country, setCountry] = useState("");
  const [instagramId, setInstagramId] = useState("");
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
        showMessage(error.message);
        setGoogleLoading(false);
      }
    } catch (error) {
      console.error(error);
      showMessage("Google login failed. Please try again.");
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
    if (!selectedDate) return showMessage("Please select a date.");
    if (!selectedTime) return showMessage("Please select a time.");
    if (!customerName.trim()) return showMessage("Please enter your name.");
    if (!customerEmail.trim()) return showMessage("Please enter your email.");

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
        showMessage(json.error || "Reservation failed.");
        setSending(false);
        return;
      }

      showMessage("Reservation request sent. We will contact you by email.");
      setSelectedTime("");
      setNote("");
    } catch (error) {
      console.error(error);
      showMessage("Network error. Please try again.");
    } finally {
      setSending(false);
    }
  }

  async function handleTipsSubmit() {
    if (!customerName.trim()) return showMessage("Please enter your name.");
    if (!customerEmail.trim()) return showMessage("Please enter your email.");
    if (!country.trim()) return showMessage("Please enter your country.");
    if (!recipientName.trim())
      return showMessage("Please enter the recipient name.");
    if (!shippingAddress.trim())
      return showMessage("Please enter your shipping address.");
    if (!shippingCity.trim()) return showMessage("Please enter your city.");
    if (!shippingPostalCode.trim())
      return showMessage("Please enter your postal code.");
    if (!shippingPhone.trim())
      return showMessage("Please enter your phone number.");
    if (!tipDesignRequest.trim())
      return showMessage("Please tell us your design request.");

    setSending(true);

    try {
      let imageUrls: string[] = [];

try {
  imageUrls = await uploadDesignImages();
} catch (uploadError) {
  console.error("Reference image upload failed:", uploadError);
  showMessage(
    "Reference image upload failed, but we will send your request without images."
  );
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
        showMessage(json.error || "Custom nail tips request failed.");
        setSending(false);
        return;
      }

      showMessage(
        "Custom nail tips request sent. We will contact you by email."
      );
      setTipDesignRequest("");
      setDesignFiles([]);
      setNote("");
    } catch (error) {
      console.error(error);
      showMessage(
        error instanceof Error
          ? error.message
          : "Network error. Please try again."
      );
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
            Anime Character Nail Tips
          </h1>
          <p className="mt-3 text-sm leading-6 text-white/90">
            Handmade anime nail tips from Fukuoka, Japan. Worldwide shipping
            available.
          </p>

          <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-bold">
            <div className="rounded-2xl bg-white/20 px-3 py-2">
              🇯🇵 Made in Japan
            </div>
            <div className="rounded-2xl bg-white/20 px-3 py-2">
              🌏 Worldwide Shipping
            </div>
            <div className="rounded-2xl bg-white/20 px-3 py-2">
              🎨 Custom Design
            </div>
            <div className="rounded-2xl bg-white/20 px-3 py-2">
              💅 Salon Visit OK
            </div>
          </div>
        </section>

        <section className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="text-base font-bold text-slate-900">Quick login</div>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Continue with Google to automatically fill your name and email.
          </p>

          {googleUserEmail ? (
            <div className="mt-3 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
              Logged in as {googleUserEmail}
            </div>
          ) : (
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={googleLoading}
              className="mt-4 w-full rounded-2xl border bg-white px-4 py-3 text-sm font-black text-slate-800 shadow-sm disabled:opacity-60"
            >
              {googleLoading ? "Connecting..." : "Continue with Google"}
            </button>
          )}
        </section>

        <section className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="text-lg font-black text-slate-900">
            Featured Anime Gallery
          </div>

          <p className="mt-2 text-sm text-slate-500">
            100% Hand Painted in Japan
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <img
                src="/inbound-gallery/one-piece1.jpg"
                alt="One Piece"
                className="h-40 w-full rounded-2xl object-cover"
              />
              <div className="mt-2 text-center text-xs font-bold">
                One Piece
              </div>
            </div>

            <div>
              <img
                src="/inbound-gallery/attack-on-titan.jpeg"
                alt="Attack on Titan"
                className="h-40 w-full rounded-2xl object-cover"
              />
              <div className="mt-2 text-center text-xs font-bold">
                Attack on Titan
              </div>
            </div>

            <div>
              <img
                src="/inbound-gallery/demon-slayer.jpeg"
                alt="Demon Slayer"
                className="h-40 w-full rounded-2xl object-cover"
              />
              <div className="mt-2 text-center text-xs font-bold">
                Demon Slayer
              </div>
            </div>

            <div>
              <img
                src="/inbound-gallery/jojo.jpeg"
                alt="JoJo"
                className="h-40 w-full rounded-2xl object-cover"
              />
              <div className="mt-2 text-center text-xs font-bold">JoJo</div>
            </div>

            <div className="col-span-2">
              <img
                src="/inbound-gallery/dragon-ball.jpeg"
                alt="Dragon Ball hand painted process"
                className="h-72 w-full rounded-2xl bg-white object-contain"
              />
              <div className="mt-2 text-center text-xs font-bold">
                Dragon Ball - Hand Painted Process
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl bg-pink-50 p-4 text-center">
            <div className="text-lg font-black text-pink-700">
              Starting from ¥15,000
            </div>
            <div className="mt-1 text-sm text-pink-600">
              Worldwide Shipping Available
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
          🎨 Request Custom Anime Nail Tips
        </button>

        <section className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="text-lg font-black text-slate-900">
            🌏 Worldwide Shipping Available
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            We create custom anime, character, idol, game, and original design
            nail tips. Send us your reference images and request. Our staff will
            reply with an estimate, production time, and DG/MAP payment URL.
          </p>

          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-2xl bg-pink-50 p-3 font-bold text-pink-700">
              Hand painted
            </div>
            <div className="rounded-2xl bg-purple-50 p-3 font-bold text-purple-700">
              Custom order
            </div>
            <div className="rounded-2xl bg-orange-50 p-3 font-bold text-orange-700">
              International shipping
            </div>
            <div className="rounded-2xl bg-blue-50 p-3 font-bold text-blue-700">
              Fukuoka salon
            </div>
          </div>

          <div className="mt-4 rounded-2xl bg-slate-50 p-4">
            <div className="text-xs font-bold tracking-[0.2em] text-slate-400">
              SHIPPING TO
            </div>
            <div className="mt-2 text-sm font-bold leading-6 text-slate-700">
              USA / Canada / France / Germany / Korea / Thailand / Singapore /
              Australia / and more
            </div>
          </div>

          <div className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-800">
            For anime or character nail tips, advance consultation and payment
            are required before production.
          </div>
        </section>

        <section className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="text-base font-bold text-slate-900">
            What would you like?
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3">
            <button
              type="button"
              onClick={() => setServiceType("tips")}
              className={`rounded-3xl border p-4 text-left ${
                serviceType === "tips"
                  ? "border-pink-300 bg-pink-50"
                  : "border-slate-200 bg-white"
              }`}
            >
              <div className="text-lg font-black text-slate-900">
                🌏 Custom Anime Nail Tips
              </div>
              <div className="mt-1 text-sm leading-6 text-slate-500">
                Custom character nail tips. Worldwide shipping available.
              </div>
            </button>

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
                💅 Salon Reservation in Fukuoka
              </div>
              <div className="mt-1 text-sm leading-6 text-slate-500">
                Visit our salon in Fukuoka. Available for 1 or 2 guests.
              </div>
            </button>
          </div>
        </section>

        <section className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="text-base font-bold text-slate-900">Language</div>
          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            className="mt-3 w-full rounded-2xl border bg-white px-3 py-3 text-sm"
          >
            {languageOptions.map((item) => (
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
                Number of guests
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
                    {count} {count === 1 ? "person" : "people"}
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border bg-white p-4 shadow-sm">
              <div className="text-base font-bold text-slate-900">Menu</div>

              <div className="mt-3 space-y-2">
                {inboundMenus.map((menu) => {
                  const selected = menu.id === selectedMenuId;

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
                            {menu.label}
                          </div>
                          <div className="mt-1 text-xs leading-5 text-slate-500">
                            {menu.description}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-black text-purple-700">
                            {formatYen(menu.price)}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {menu.minutes} min
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
                Date and time
              </div>

              <div className="mt-4 space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-bold text-slate-700">
                    Date
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
                    Time
                  </label>
                  <select
                    value={selectedTime}
                    onChange={(event) => setSelectedTime(event.target.value)}
                    className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
                  >
                    <option value="">Select time</option>
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
            Customer information
          </div>

          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-bold text-slate-700">
                Name
              </label>
              <input
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
                placeholder="Your name"
                className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-slate-700">
                Email
              </label>
              <input
                type="email"
                value={customerEmail}
                onChange={(event) => setCustomerEmail(event.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
              />
            </div>

            {serviceType === "tips" ? (
              <>
                <div>
                  <label className="mb-2 block text-sm font-bold text-slate-700">
                    Country
                  </label>
                  <input
                    value={country}
                    onChange={(event) => setCountry(event.target.value)}
                    placeholder="France / USA / Korea / Thailand..."
                    className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-bold text-slate-700">
                    Instagram ID
                  </label>
                  <input
                    value={instagramId}
                    onChange={(event) => setInstagramId(event.target.value)}
                    placeholder="@your_instagram"
                    className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
                  />
                </div>

                <div className="rounded-3xl border border-pink-100 bg-pink-50 p-4">
                  <div className="text-base font-black text-slate-900">
                    Shipping information
                  </div>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Please enter the shipping address for worldwide delivery.
                  </p>

                  <div className="mt-4 space-y-4">
                    <div>
                      <label className="mb-2 block text-sm font-bold text-slate-700">
                        Recipient Name
                      </label>
                      <input
                        value={recipientName}
                        onChange={(event) =>
                          setRecipientName(event.target.value)
                        }
                        placeholder="Full name for delivery"
                        className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-bold text-slate-700">
                        Shipping Address
                      </label>
                      <textarea
                        value={shippingAddress}
                        onChange={(event) =>
                          setShippingAddress(event.target.value)
                        }
                        rows={3}
                        placeholder="Street address, apartment, building"
                        className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-bold text-slate-700">
                        City
                      </label>
                      <input
                        value={shippingCity}
                        onChange={(event) =>
                          setShippingCity(event.target.value)
                        }
                        placeholder="City"
                        className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-bold text-slate-700">
                        State / Province
                      </label>
                      <input
                        value={shippingState}
                        onChange={(event) =>
                          setShippingState(event.target.value)
                        }
                        placeholder="State / Province"
                        className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-bold text-slate-700">
                        Postal Code
                      </label>
                      <input
                        value={shippingPostalCode}
                        onChange={(event) =>
                          setShippingPostalCode(event.target.value)
                        }
                        placeholder="Postal code"
                        className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-bold text-slate-700">
                        Phone Number
                      </label>
                      <input
                        value={shippingPhone}
                        onChange={(event) =>
                          setShippingPhone(event.target.value)
                        }
                        placeholder="+1 123 456 7890"
                        className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-bold text-slate-700">
                    Reference images
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
                    You can upload up to 3 reference images.
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
                    Anime character / Design request
                  </label>
                  <textarea
                    value={tipDesignRequest}
                    onChange={(event) =>
                      setTipDesignRequest(event.target.value)
                    }
                    rows={5}
                    placeholder="Please tell us the anime character, color, theme, and your design request."
                    className="w-full rounded-2xl border bg-white px-3 py-3 text-sm"
                  />
                </div>
              </>
            ) : (
              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  Request / Note
                </label>
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={4}
                  placeholder="Please tell us your design request."
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
                  Summary
                </div>
                <div className="mt-1 text-sm text-slate-500">
                  Estimated price and service time
                </div>
              </div>
              <div className="rounded-full bg-purple-100 px-3 py-1 text-xs font-black text-purple-700">
                {guestCount} guests
              </div>
            </div>

            <div className="mt-4 rounded-2xl bg-slate-50 p-4">
              <div className="text-sm font-black text-slate-900">
                {selectedMenu.label}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-white p-3">
                  <div className="text-xs text-slate-500">Total price</div>
                  <div className="mt-1 text-lg font-black text-slate-900">
                    {formatYen(totalPrice)}
                  </div>
                </div>
                <div className="rounded-2xl bg-white p-3">
                  <div className="text-xs text-slate-500">Time</div>
                  <div className="mt-1 text-lg font-black text-slate-900">
                    {durationMinutes} min
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-800">
              Please arrive on time. Late arrival may shorten the service time.
              No-show or same-day cancellation may be charged a cancellation
              fee.
            </div>

            <button
              type="button"
              onClick={handleSalonSubmit}
              disabled={sending}
              className="mt-4 w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
            >
              {sending ? "Sending..." : "Send reservation request"}
            </button>
          </section>
        ) : (
          <section className="rounded-3xl border bg-white p-4 shadow-sm">
            <div className="text-base font-bold text-slate-900">
              Custom Nail Tips Request
            </div>

            <div className="mt-3 rounded-2xl bg-pink-50 p-4 text-sm leading-6 text-pink-800">
              Worldwide shipping is available. After reviewing your design, our
              staff will send you an estimate, production time, and payment
              information.
            </div>

            <div className="mt-4 rounded-2xl border border-pink-100 bg-white p-4">
              <div className="text-sm font-black text-slate-900">
                How It Works
              </div>

              <div className="mt-3 space-y-2 text-sm text-slate-700">
                <div>1️⃣ Send your design request</div>
                <div>2️⃣ Receive quote & production schedule</div>
                <div>3️⃣ Pay via DG/MAP secure payment link</div>
                <div>4️⃣ We hand paint your nail tips</div>
                <div>5️⃣ Worldwide shipping from Japan</div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleTipsSubmit}
              disabled={sending}
              className="mt-4 w-full rounded-2xl bg-pink-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
            >
              {sending ? "Sending..." : "Send custom nail tips request"}
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