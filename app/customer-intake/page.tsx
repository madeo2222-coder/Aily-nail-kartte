"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function CustomerIntakePage() {
  const [mounted, setMounted] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [allergy, setAllergy] = useState("");
  const [skinTrouble, setSkinTrouble] = useState("");
  const [constitution, setConstitution] = useState("");
  const [avoidItems, setAvoidItems] = useState("");
  const [signerName, setSignerName] = useState("");

  const [checks, setChecks] = useState({
    health: false,
    reaction: false,
    refund: false,
    condition: false,
    photo: false,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const isDrawingRef = useRef(false);
  const hasDrawnRef = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    setupCanvas();
    window.addEventListener("resize", setupCanvas);

    return () => {
      window.removeEventListener("resize", setupCanvas);
    };
  }, [mounted]);

  function setupCanvas() {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;

    const rect = wrapper.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const displayWidth = Math.max(rect.width, 280);
    const displayHeight = 220;

    const previousImage = hasDrawnRef.current ? canvas.toDataURL("image/png") : null;

    canvas.width = displayWidth * ratio;
    canvas.height = displayHeight * ratio;
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(ratio, ratio);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#111827";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, displayWidth, displayHeight);

    if (previousImage) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, displayWidth, displayHeight);
      };
      img.src = previousImage;
    }
  }

  function getPointFromEvent(
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();

    if ("touches" in e) {
      const touch = e.touches[0] || e.changedTouches[0];
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
      };
    }

    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  function startDrawing(
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    isDrawingRef.current = true;
    hasDrawnRef.current = true;

    const point = getPointFromEvent(e);
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
  }

  function draw(
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) {
    if (!isDrawingRef.current) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if ("touches" in e) {
      e.preventDefault();
    }

    const point = getPointFromEvent(e);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  }

  function stopDrawing() {
    isDrawingRef.current = false;
  }

  function clearSignature() {
    hasDrawnRef.current = false;
    setupCanvas();
  }

  function getSignatureDataUrl() {
    const canvas = canvasRef.current;
    if (!canvas || !hasDrawnRef.current) return "";
    return canvas.toDataURL("image/png");
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");

    if (!name.trim()) {
      setMessage("お名前を入力してください");
      return;
    }

    if (!phone.trim()) {
      setMessage("電話番号を入力してください");
      return;
    }

    if (!signerName.trim()) {
      setMessage("署名者名を入力してください");
      return;
    }

    if (!Object.values(checks).every(Boolean)) {
      setMessage("注意事項をすべて確認してください");
      return;
    }

    const signatureDataUrl = getSignatureDataUrl();
    if (!signatureDataUrl) {
      setMessage("ご署名をお願いします");
      return;
    }

    setIsSubmitting(true);

    try {
      const { data: customer, error: customerError } = await supabase
        .from("customers")
        .insert([
          {
            name: name.trim(),
            phone: phone.trim(),
          },
        ])
        .select("id")
        .single();

      if (customerError || !customer) {
        console.error("customers insert error:", customerError);
        setMessage("顧客情報の登録に失敗しました");
        setIsSubmitting(false);
        return;
      }

      const { error: intakeError } = await supabase
        .from("customer_intakes")
        .insert([
          {
            customer_id: customer.id,
            name: name.trim(),
            phone: phone.trim(),
            birth_date: birthDate || null,
            allergy: allergy.trim() || null,
            skin_trouble: skinTrouble.trim() || null,
            constitution: constitution.trim() || null,
            avoid_items: avoidItems.trim() || null,
            signer_name: signerName.trim(),
            signature_data_url: signatureDataUrl,
            check_health: checks.health,
            check_reaction: checks.reaction,
            check_refund: checks.refund,
            check_condition: checks.condition,
            check_photo: checks.photo,
          },
        ]);

      if (intakeError) {
        console.error("customer_intakes insert error:", intakeError);
        setMessage(`初回カウンセリング登録に失敗しました: ${intakeError.message}`);
        setIsSubmitting(false);
        return;
      }

      setMessage("送信が完了しました。ありがとうございました。");

      setName("");
      setPhone("");
      setBirthDate("");
      setAllergy("");
      setSkinTrouble("");
      setConstitution("");
      setAvoidItems("");
      setSignerName("");
      setChecks({
        health: false,
        reaction: false,
        refund: false,
        condition: false,
        photo: false,
      });
      clearSignature();
    } catch (error) {
      console.error("submit error:", error);
      setMessage("送信に失敗しました。通信状況をご確認のうえ、もう一度お試しください。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-rose-50/40">
      <div className="mx-auto max-w-xl space-y-6 p-4 pb-24">
        <section className="overflow-hidden rounded-[28px] bg-gradient-to-br from-rose-400 via-pink-400 to-orange-300 p-6 text-white shadow-sm">
          <p className="text-xs font-bold tracking-[0.25em] text-white/80">
            AILY NAIL STUDIO
          </p>
          <h1 className="mt-3 text-3xl font-bold">初回来店受付フォーム</h1>
          <p className="mt-4 text-base leading-8 text-white/90">
            LINEからご来店ありがとうございます。初めてのお客様は、施術を安全に行うため必要事項の入力とご署名をお願いします。
          </p>

          <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Link
              href="/customer-app"
              className="rounded-2xl bg-white px-4 py-3 text-center text-sm font-bold text-rose-500"
            >
              入口ページへ戻る
            </Link>
            <Link
              href="/customer-app/login"
              className="rounded-2xl border border-white/30 px-4 py-3 text-center text-sm font-bold text-white"
            >
              会員の方はこちら
            </Link>
          </div>
        </section>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="rounded-[24px] border bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-bold text-slate-900">お客様情報</h2>

            <div className="mt-6 space-y-5">
              <div>
                <label className="mb-2 block text-lg font-semibold text-slate-700">
                  お名前 カナ<span className="text-red-500">*</span>
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="山田 花子　ヤマダ　ハナコ"
                  className="w-full rounded-[20px] border px-5 py-5 text-xl outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-lg font-semibold text-slate-700">
                  電話番号 <span className="text-red-500">*</span>
                </label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  inputMode="tel"
                  placeholder="090-1234-5678"
                  className="w-full rounded-[20px] border px-5 py-5 text-xl outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-lg font-semibold text-slate-700">
                  生年月日
                </label>
                <input
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  className="w-full rounded-[20px] border px-5 py-5 text-xl outline-none"
                />
              </div>
            </div>
          </div>

          <div className="rounded-[24px] border bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-bold text-slate-900">事前確認</h2>

            <div className="mt-6 space-y-5">
              <div>
                <label className="mb-2 block text-lg font-semibold text-slate-700">
                  アレルギー・皮膚トラブル・体質について
                </label>
                <textarea
                  value={allergy}
                  onChange={(e) => setAllergy(e.target.value)}
                  rows={4}
                  placeholder="例：アセトンで赤くなりやすい／金属アレルギーあり／特になし"
                  className="w-full rounded-[20px] border px-5 py-5 text-xl outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-lg font-semibold text-slate-700">
                  皮膚トラブル
                </label>
                <textarea
                  value={skinTrouble}
                  onChange={(e) => setSkinTrouble(e.target.value)}
                  rows={3}
                  placeholder="例：手荒れしやすい／爪まわりが敏感"
                  className="w-full rounded-[20px] border px-5 py-5 text-xl outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-lg font-semibold text-slate-700">
                  体質
                </label>
                <textarea
                  value={constitution}
                  onChange={(e) => setConstitution(e.target.value)}
                  rows={3}
                  placeholder="例：乾燥しやすい／汗をかきやすい"
                  className="w-full rounded-[20px] border px-5 py-5 text-xl outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-lg font-semibold text-slate-700">
                  施術NG項目・避けてほしいこと
                </label>
                <textarea
                  value={avoidItems}
                  onChange={(e) => setAvoidItems(e.target.value)}
                  rows={4}
                  placeholder="例：強い摩擦が苦手／オフ時に痛みが出やすい／長時間同じ姿勢がつらい"
                  className="w-full rounded-[20px] border px-5 py-5 text-xl outline-none"
                />
              </div>
            </div>
          </div>

          <div className="rounded-[24px] border bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-bold text-slate-900">注意事項確認</h2>
            <p className="mt-3 text-lg leading-8 text-slate-600">
              内容をご確認のうえ、すべてチェックをお願いします。
            </p>

            <div className="mt-6 space-y-4">
              <label className="flex gap-4 rounded-[20px] border p-5 text-lg leading-8 text-slate-700">
                <input
                  type="checkbox"
                  checked={checks.health}
                  onChange={(e) =>
                    setChecks({ ...checks, health: e.target.checked })
                  }
                  className="mt-1 h-7 w-7"
                />
                <span>
                  体調不良・感染症の疑い・発熱・皮膚トラブルがある場合は施術をお断りすることがあります。
                </span>
              </label>

              <label className="flex gap-4 rounded-[20px] border p-5 text-lg leading-8 text-slate-700">
                <input
                  type="checkbox"
                  checked={checks.reaction}
                  onChange={(e) =>
                    setChecks({ ...checks, reaction: e.target.checked })
                  }
                  className="mt-1 h-7 w-7"
                />
                <span>
                  ジェル・溶剤・消毒液・ダスト等により、かゆみ・赤み・腫れなどの反応が出る可能性があります。
                </span>
              </label>

              <label className="flex gap-4 rounded-[20px] border p-5 text-lg leading-8 text-slate-700">
                <input
                  type="checkbox"
                  checked={checks.refund}
                  onChange={(e) =>
                    setChecks({ ...checks, refund: e.target.checked })
                  }
                  className="mt-1 h-7 w-7"
                />
                <span>
                  施術後の仕上がり確認後は、原則として返金対応はできません。必要に応じてお直し対応をご案内します。
                </span>
              </label>

              <label className="flex gap-4 rounded-[20px] border p-5 text-lg leading-8 text-slate-700">
                <input
                  type="checkbox"
                  checked={checks.condition}
                  onChange={(e) =>
                    setChecks({ ...checks, condition: e.target.checked })
                  }
                  className="mt-1 h-7 w-7"
                />
                <span>
                  持病・通院・妊娠中・服薬中など、施術に影響する事項がある場合は事前申告します。
                </span>
              </label>

              <label className="flex gap-4 rounded-[20px] border p-5 text-lg leading-8 text-slate-700">
                <input
                  type="checkbox"
                  checked={checks.photo}
                  onChange={(e) =>
                    setChecks({ ...checks, photo: e.target.checked })
                  }
                  className="mt-1 h-7 w-7"
                />
                <span>
                  施術記録のため手元写真を撮影する場合があります。公開可否はスタッフ確認時に申告できます。
                </span>
              </label>
            </div>
          </div>

          <div className="rounded-[24px] border bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-bold text-slate-900">ご署名</h2>
            <p className="mt-3 text-lg leading-8 text-slate-600">
              指またはタッチペンでサインしてください。
            </p>

            <div className="mt-6">
              <label className="mb-2 block text-lg font-semibold text-slate-700">
                署名者名 <span className="text-red-500">*</span>
              </label>
              <input
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder="山田 花子"
                className="w-full rounded-[20px] border px-5 py-5 text-xl outline-none"
              />
            </div>

            <div
              ref={wrapperRef}
              className="mt-6 overflow-hidden rounded-[20px] border border-dashed bg-slate-50"
            >
              {mounted ? (
                <canvas
                  ref={canvasRef}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                  className="block touch-none bg-white"
                />
              ) : (
                <div className="h-[220px] bg-white" />
              )}
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={clearSignature}
                className="rounded-[20px] border px-6 py-4 text-lg"
              >
                署名を消去
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-[24px] bg-orange-500 px-6 py-5 text-2xl font-bold text-white disabled:opacity-50"
          >
            {isSubmitting ? "送信中..." : "内容を送信する"}
          </button>

          {message ? (
            <div
              className={`rounded-[20px] p-5 text-lg ${
                message.includes("完了")
                  ? "bg-green-50 text-green-700"
                  : "bg-red-50 text-red-700"
              }`}
            >
              {message}
            </div>
          ) : null}
        </form>
      </div>
    </main>
  );
}