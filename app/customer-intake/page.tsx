"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type NoticeKey =
  | "infection"
  | "allergyRisk"
  | "noRefund"
  | "healthCondition"
  | "photoConsent";

const NOTICE_ITEMS: { key: NoticeKey; label: string }[] = [
  {
    key: "infection",
    label:
      "体調不良・感染症の疑い・発熱・皮膚トラブルがある場合は施術をお断りすることがあります。",
  },
  {
    key: "allergyRisk",
    label:
      "ジェル・溶剤・消毒液・ダスト等により、かゆみ・赤み・腫れなどの反応が出る可能性があります。",
  },
  {
    key: "noRefund",
    label:
      "施術後の仕上がり確認後は、原則として返金対応はできません。必要に応じてお直し対応をご案内します。",
  },
  {
    key: "healthCondition",
    label:
      "持病・通院・妊娠中・服薬中など、施術に影響する事項がある場合は事前申告します。",
  },
  {
    key: "photoConsent",
    label:
      "施術記録のため手元写真を撮影する場合があります。公開可否はスタッフ確認時に申告できます。",
  },
];

type FormState = {
  name: string;
  phone: string;
  allergy: string;
  ngItems: string;
  signatureName: string;
  agreed: Record<NoticeKey, boolean>;
};

const STORAGE_KEY = "naily_customer_intake_draft_v3";

const initialFormState: FormState = {
  name: "",
  phone: "",
  allergy: "",
  ngItems: "",
  signatureName: "",
  agreed: {
    infection: false,
    allergyRisk: false,
    noRefund: false,
    healthCondition: false,
    photoConsent: false,
  },
};

export default function CustomerIntakePage() {
    const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);
  const [form, setForm] = useState<FormState>(initialFormState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [message, setMessage] = useState("");
  const [canvasReady, setCanvasReady] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const allChecked = useMemo(() => {
    return NOTICE_ITEMS.every((item) => form.agreed[item.key]);
  }, [form.agreed]);

    useEffect(() => {
    if (!mounted) return;

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as FormState;
        setForm(parsed);
      }
    } catch {
      // no-op
    }
  }, [mounted]);

    useEffect(() => {
    if (!mounted) return;

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
    } catch {
      // no-op
    }
  }, [form, mounted]);

    useEffect(() => {
    if (!mounted) return;

    setupCanvas();
    const onResize = () => setupCanvas();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [mounted]);

  const setupCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const parent = canvas.parentElement;
    const width = parent ? Math.max(parent.clientWidth, 280) : 320;
    const height = 180;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);

    const existing = canvas.toDataURL("image/png");

    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(ratio, ratio);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2;

    if (existing && existing !== "data:,") {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, width, height);
      };
      img.src = existing;
    }

    setCanvasReady(true);
  };

  const getCanvasPoint = (
    clientX: number,
    clientY: number
  ): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const beginDraw = (x: number, y: number) => {
    drawingRef.current = true;
    lastPointRef.current = { x, y };
  };

  const drawTo = (x: number, y: number) => {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const last = lastPointRef.current;
    if (!last) {
      lastPointRef.current = { x, y };
      return;
    }

    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(x, y);
    ctx.stroke();

    lastPointRef.current = { x, y };
  };

  const endDraw = () => {
    drawingRef.current = false;
    lastPointRef.current = null;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const point = getCanvasPoint(e.clientX, e.clientY);
    if (!point) return;
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    beginDraw(point.x, point.y);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const point = getCanvasPoint(e.clientX, e.clientY);
    if (!point) return;
    drawTo(point.x, point.y);
  };

  const handlePointerUp = () => {
    endDraw();
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = parseFloat(canvas.style.width || "320");
    const height = parseFloat(canvas.style.height || "180");

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  };

  const isSignatureEmpty = (): boolean => {
    const canvas = canvasRef.current;
    if (!canvas) return true;
    const ctx = canvas.getContext("2d");
    if (!ctx) return true;

    const width = canvas.width;
    const height = canvas.height;
    const data = ctx.getImageData(0, 0, width, height).data;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (!(r === 255 && g === 255 && b === 255 && a === 255)) {
        return false;
      }
    }
    return true;
  };

  const updateField = (key: keyof Omit<FormState, "agreed">, value: string) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const updateAgreement = (key: NoticeKey, checked: boolean) => {
    setForm((prev) => ({
      ...prev,
      agreed: {
        ...prev.agreed,
        [key]: checked,
      },
    }));
  };

  const validate = () => {
    if (!form.name.trim()) {
      setMessage("お名前を入力してください。");
      return false;
    }

    if (!form.phone.trim()) {
      setMessage("電話番号を入力してください。");
      return false;
    }

    if (!allChecked) {
      setMessage("注意事項の確認チェックをすべてお願いします。");
      return false;
    }

    if (!form.signatureName.trim()) {
      setMessage("署名者名を入力してください。");
      return false;
    }

    if (isSignatureEmpty()) {
      setMessage("署名欄にサインを入力してください。");
      return false;
    }

    return true;
  };

  const handleSubmit = async () => {
    setMessage("");

    if (!validate()) return;

    setIsSubmitting(true);

    try {
      const phoneNormalized = form.phone.replace(/[^\d\-+]/g, "").trim();

      const { data: existingCustomers, error: existingCustomersError } =
        await supabase
          .from("customers")
          .select("id,name,phone")
          .eq("phone", phoneNormalized)
          .limit(1);

      if (existingCustomersError) {
        throw existingCustomersError;
      }

      let customerId: number | null = null;

      if (existingCustomers && existingCustomers.length > 0) {
        const target = existingCustomers[0];

        const { error: updateCustomerError } = await supabase
          .from("customers")
          .update({
            name: form.name.trim(),
            phone: phoneNormalized,
          })
          .eq("id", target.id);

        if (updateCustomerError) {
          throw updateCustomerError;
        }

        customerId = Number(target.id);
      } else {
        const { data: insertedCustomer, error: insertCustomerError } =
          await supabase
            .from("customers")
            .insert({
              name: form.name.trim(),
              phone: phoneNormalized,
            })
            .select("id")
            .single();

        if (insertCustomerError) {
          throw insertCustomerError;
        }

        customerId = insertedCustomer?.id ? Number(insertedCustomer.id) : null;
      }

      const signatureDataUrl = canvasRef.current?.toDataURL("image/png") || "";

      const { error: intakeInsertError } = await supabase
        .from("customer_intakes")
        .insert({
          customer_id: customerId,
          name: form.name.trim(),
          phone: phoneNormalized,
          allergy: form.allergy.trim(),
          ng_items: form.ngItems.trim(),
          agreed: form.agreed,
          signature_name: form.signatureName.trim(),
          signature_data_url: signatureDataUrl,
        });

      if (intakeInsertError) {
        throw intakeInsertError;
      }

      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // no-op
      }

      setIsSubmitted(true);
      setMessage(
        "受付情報を送信しました。ありがとうございます。スタッフが内容を確認します。"
      );
    } catch (error) {
      console.error(error);
      setMessage("登録に失敗しました。通信状況を確認してもう一度お試しください。");
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setForm(initialFormState);
    clearSignature();
    setIsSubmitted(false);
    setMessage("");
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // no-op
    }
  };

    if (!mounted) {
    return null;
  }

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="mb-6 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5">
          <p className="text-xs font-semibold tracking-[0.2em] text-orange-500">
            AILY NAIL STUDIO
          </p>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">
            初回来店受付フォーム
          </h1>
          <p className="mt-2 text-sm leading-6 text-gray-600">
            ご来店ありがとうございます。施術を安全に行うため、
            必要事項の入力とご署名をお願いします。
          </p>
        </div>

        <div className="space-y-5">
          <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5">
            <h2 className="text-base font-bold text-gray-900">お客様情報</h2>

            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  お名前 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  placeholder="山田 花子"
                  className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-base outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  電話番号 <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => updateField("phone", e.target.value)}
                  placeholder="090-1234-5678"
                  className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-base outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
                />
              </div>
            </div>
          </section>

          <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5">
            <h2 className="text-base font-bold text-gray-900">事前確認</h2>

            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  アレルギー・皮膚トラブル・体質について
                </label>
                <textarea
                  value={form.allergy}
                  onChange={(e) => updateField("allergy", e.target.value)}
                  rows={4}
                  placeholder="例：アセトンで赤くなりやすい／金属アレルギーあり／特になし"
                  className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-base outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  施術NG項目・避けてほしいこと
                </label>
                <textarea
                  value={form.ngItems}
                  onChange={(e) => updateField("ngItems", e.target.value)}
                  rows={4}
                  placeholder="例：強い摩擦が苦手／オフ時に痛みが出やすい／長時間同じ姿勢がつらい"
                  className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-base outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
                />
              </div>
            </div>
          </section>

          <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5">
            <h2 className="text-base font-bold text-gray-900">注意事項確認</h2>
            <p className="mt-2 text-sm text-gray-600">
              内容をご確認のうえ、すべてチェックをお願いします。
            </p>

            <div className="mt-4 space-y-3">
              {NOTICE_ITEMS.map((item) => (
                <label
                  key={item.key}
                  className="flex items-start gap-3 rounded-2xl border border-gray-200 p-4"
                >
                  <input
                    type="checkbox"
                    checked={form.agreed[item.key]}
                    onChange={(e) =>
                      updateAgreement(item.key, e.target.checked)
                    }
                    className="mt-1 h-5 w-5 rounded border-gray-300 text-orange-500 focus:ring-orange-400"
                  />
                  <span className="text-sm leading-6 text-gray-700">
                    {item.label}
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5">
            <h2 className="text-base font-bold text-gray-900">ご署名</h2>
            <p className="mt-2 text-sm text-gray-600">
              指またはタッチペンでサインしてください。
            </p>

            <div className="mt-4">
              <label className="mb-2 block text-sm font-medium text-gray-700">
                署名者名 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.signatureName}
                onChange={(e) => updateField("signatureName", e.target.value)}
                placeholder="山田 花子"
                className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-base outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
              />
            </div>

            <div className="mt-4 rounded-2xl border border-dashed border-gray-300 bg-white p-3">
              <canvas
                ref={canvasRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                className="block touch-none rounded-xl bg-white"
              />
            </div>

            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={clearSignature}
                className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
                署名を消去
              </button>
            </div>

            {!canvasReady && (
              <p className="mt-3 text-sm text-gray-500">
                署名欄を読み込み中です...
              </p>
            )}
          </section>

          <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="w-full rounded-2xl bg-orange-500 px-4 py-4 text-base font-bold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "送信中..." : "内容を送信する"}
            </button>

            {isSubmitted && (
              <button
                type="button"
                onClick={resetForm}
                className="mt-3 w-full rounded-2xl border border-gray-300 px-4 py-4 text-base font-bold text-gray-700 transition hover:bg-gray-50"
              >
                新しく入力し直す
              </button>
            )}

            {message && (
              <div
                className={`mt-4 rounded-2xl px-4 py-3 text-sm leading-6 ${
                  isSubmitted
                    ? "bg-green-50 text-green-700"
                    : "bg-red-50 text-red-700"
                }`}
              >
                {message}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}