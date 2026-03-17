"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type FormState = {
  visitDate: string;
  name: string;
  furigana: string;
  phone: string;
  birthday: string;
  instagramId: string;
  lineId: string;
  referral: string;
  concernNote: string;

  noRashFromGel: boolean;
  notSensitiveSkin: boolean;
  noMetalAllergy: boolean;
  noAcetoneIssue: boolean;
  noNailOrSkinDisease: boolean;
  notPregnantOrUnderTreatment: boolean;
  noOtherHealthProblems: boolean;

  agreeNoRefund: boolean;
  agreeNoGuarantee: boolean;

  signatureName: string;
};

const initialForm: FormState = {
  visitDate: new Date().toISOString().slice(0, 10),
  name: "",
  furigana: "",
  phone: "",
  birthday: "",
  instagramId: "",
  lineId: "",
  referral: "",
  concernNote: "",

  noRashFromGel: false,
  notSensitiveSkin: false,
  noMetalAllergy: false,
  noAcetoneIssue: false,
  noNailOrSkinDisease: false,
  notPregnantOrUnderTreatment: false,
  noOtherHealthProblems: false,

  agreeNoRefund: false,
  agreeNoGuarantee: false,

  signatureName: "",
};

function normalizePhone(value: string) {
  return value.replace(/[^\d-]/g, "").slice(0, 20);
}

function buildMemo(form: FormState) {
  const lines = [
    "【初回登録情報】",
    `ご来店日: ${form.visitDate || "-"}`,
    `ふりがな: ${form.furigana || "-"}`,
    `生年月日: ${form.birthday || "-"}`,
    `Instagram ID: ${form.instagramId || "-"}`,
    `LINE名/ID: ${form.lineId || "-"}`,
    `ご紹介者: ${form.referral || "-"}`,
    "",
    "【健康・施術確認】",
    `ジェル・アクリル・接着剤でかぶれたことがない: ${form.noRashFromGel ? "はい" : "いいえ"}`,
    `皮膚が弱くない / 敏感肌ではない: ${form.notSensitiveSkin ? "はい" : "いいえ"}`,
    `金属アレルギーがない: ${form.noMetalAllergy ? "はい" : "いいえ"}`,
    `アセトンで気分が悪くなったことがない: ${form.noAcetoneIssue ? "はい" : "いいえ"}`,
    `爪や皮膚に疾患がない: ${form.noNailOrSkinDisease ? "はい" : "いいえ"}`,
    `妊娠していない・通院中ではない: ${form.notPregnantOrUnderTreatment ? "はい" : "いいえ"}`,
    `その他、施術に影響する健康上の問題がない: ${form.noOtherHealthProblems ? "はい" : "いいえ"}`,
    "",
    "【気になる点・事前申告】",
    form.concernNote || "なし",
    "",
    "【同意事項】",
    `返金対応を行わないことに同意: ${form.agreeNoRefund ? "同意する" : "未同意"}`,
    `お客様都合による保証対応を行わないことに同意: ${form.agreeNoGuarantee ? "同意する" : "未同意"}`,
    "",
    "【署名】",
    form.signatureName || "-",
  ];

  return lines.join("\n");
}

function getCandidatePayloads(form: FormState, memo: string) {
  const trimmedName = form.name.trim();
  const trimmedFurigana = form.furigana.trim();
  const trimmedPhone = form.phone.trim();
  const trimmedBirthday = form.birthday.trim();
  const trimmedInstagram = form.instagramId.trim();
  const trimmedLine = form.lineId.trim();
  const trimmedReferral = form.referral.trim();

  return [
    {
      name: trimmedName,
      furigana: trimmedFurigana,
      phone: trimmedPhone,
      birthday: trimmedBirthday || null,
      instagram_id: trimmedInstagram || null,
      line_id: trimmedLine || null,
      referral: trimmedReferral || null,
      memo,
    },
    {
      name: trimmedName,
      kana: trimmedFurigana,
      phone: trimmedPhone,
      birthday: trimmedBirthday || null,
      instagram_id: trimmedInstagram || null,
      line_id: trimmedLine || null,
      referral: trimmedReferral || null,
      memo,
    },
    {
      name: trimmedName,
      phone: trimmedPhone,
      birthday: trimmedBirthday || null,
      memo,
    },
    {
      customer_name: trimmedName,
      phone: trimmedPhone,
      memo,
    },
    {
      full_name: trimmedName,
      phone: trimmedPhone,
      memo,
    },
    {
      name: trimmedName,
      phone_number: trimmedPhone,
      memo,
    },
    {
      name: trimmedName,
      tel: trimmedPhone,
      memo,
    },
    {
      name: trimmedName,
      phone: trimmedPhone,
    },
    {
      customer_name: trimmedName,
      phone_number: trimmedPhone,
    },
    {
      full_name: trimmedName,
      tel: trimmedPhone,
    },
  ];
}

async function tryInsertCustomer(form: FormState) {
  const memo = buildMemo(form);
  const payloads = getCandidatePayloads(form, memo);

  let lastErrorMessage = "customers への保存に失敗しました。";

  for (const payload of payloads) {
    const { data, error } = await supabase
      .from("customers")
      .insert(payload)
      .select()
      .single();

    if (!error && data) {
      return { success: true as const, data };
    }

    if (error?.message) {
      lastErrorMessage = error.message;
    }
  }

  return {
    success: false as const,
    errorMessage: lastErrorMessage,
  };
}

export default function CustomerIntakePage() {
  const router = useRouter();

  const [form, setForm] = useState<FormState>(initialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const canSubmit = useMemo(() => {
    return (
      form.name.trim() !== "" &&
      form.furigana.trim() !== "" &&
      form.phone.trim() !== "" &&
      form.agreeNoRefund &&
      form.agreeNoGuarantee &&
      form.signatureName.trim() !== "" &&
      !isSubmitting
    );
  }, [form, isSubmitting]);

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setErrorMessage("");
    setSuccessMessage("");

    if (!form.name.trim()) {
      setErrorMessage("お名前を入力してください。");
      return;
    }

    if (!form.furigana.trim()) {
      setErrorMessage("ふりがなを入力してください。");
      return;
    }

    if (!form.phone.trim()) {
      setErrorMessage("電話番号を入力してください。");
      return;
    }

    if (!form.agreeNoRefund || !form.agreeNoGuarantee) {
      setErrorMessage("ご確認事項への同意が必要です。");
      return;
    }

    if (!form.signatureName.trim()) {
      setErrorMessage("ご署名を入力してください。");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await tryInsertCustomer(form);

      if (!result.success) {
        throw new Error(result.errorMessage || "保存に失敗しました。");
      }

      setSuccessMessage("送信が完了しました。ご協力ありがとうございます。");
      setForm({
        ...initialForm,
        visitDate: new Date().toISOString().slice(0, 10),
      });

      setTimeout(() => {
        router.refresh();
      }, 800);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "登録中にエラーが発生しました。時間をおいて再度お試しください。";

      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#fffaf7] text-[#222]">
      <div className="mx-auto w-full max-w-xl px-4 py-6 sm:px-6">
        <div className="mb-6 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5">
          <p className="mb-2 text-xs font-medium tracking-[0.18em] text-[#c67b5c] uppercase">
            Aily Nail Studio
          </p>
          <h1 className="text-2xl font-bold leading-tight">
            初回ご登録フォーム
          </h1>
          <p className="mt-2 text-sm leading-6 text-gray-600">
            初めてご来店いただくお客様向けの登録フォームです。<br />
            ご入力内容は、施術前の確認とカルテ作成のために使用します。
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5">
            <h2 className="text-lg font-semibold">基本情報</h2>
            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium">
                  ご来店日
                </label>
                <input
                  type="date"
                  value={form.visitDate}
                  onChange={(e) => updateField("visitDate", e.target.value)}
                  className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-base outline-none transition focus:border-[#c67b5c]"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  お名前 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  placeholder="例）山田 花子"
                  className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-base outline-none transition focus:border-[#c67b5c]"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  ふりがな <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.furigana}
                  onChange={(e) => updateField("furigana", e.target.value)}
                  placeholder="例）やまだ はなこ"
                  className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-base outline-none transition focus:border-[#c67b5c]"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  電話番号 <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  inputMode="tel"
                  value={form.phone}
                  onChange={(e) => updateField("phone", normalizePhone(e.target.value))}
                  placeholder="例）090-1234-5678"
                  className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-base outline-none transition focus:border-[#c67b5c]"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  生年月日
                </label>
                <input
                  type="date"
                  value={form.birthday}
                  onChange={(e) => updateField("birthday", e.target.value)}
                  className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-base outline-none transition focus:border-[#c67b5c]"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  Instagram ID
                </label>
                <input
                  type="text"
                  value={form.instagramId}
                  onChange={(e) => updateField("instagramId", e.target.value)}
                  placeholder="例）@aily_nail"
                  className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-base outline-none transition focus:border-[#c67b5c]"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  LINE名 / LINE ID
                </label>
                <input
                  type="text"
                  value={form.lineId}
                  onChange={(e) => updateField("lineId", e.target.value)}
                  placeholder="例）hanako123"
                  className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-base outline-none transition focus:border-[#c67b5c]"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">
                  ご紹介者
                </label>
                <input
                  type="text"
                  value={form.referral}
                  onChange={(e) => updateField("referral", e.target.value)}
                  placeholder="例）友人紹介 / Instagram / ホットペッパー"
                  className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-base outline-none transition focus:border-[#c67b5c]"
                />
              </div>
            </div>
          </section>

          <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5">
            <h2 className="text-lg font-semibold">健康・施術前確認</h2>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              以下について、問題がない場合はチェックしてください。
            </p>

            <div className="mt-4 space-y-3">
              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-gray-200 p-4">
                <input
                  type="checkbox"
                  checked={form.noRashFromGel}
                  onChange={(e) => updateField("noRashFromGel", e.target.checked)}
                  className="mt-1 h-5 w-5 rounded"
                />
                <span className="text-sm leading-6">
                  ジェル・アクリル・接着剤でかぶれたことがありません
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-gray-200 p-4">
                <input
                  type="checkbox"
                  checked={form.notSensitiveSkin}
                  onChange={(e) => updateField("notSensitiveSkin", e.target.checked)}
                  className="mt-1 h-5 w-5 rounded"
                />
                <span className="text-sm leading-6">
                  皮膚が弱くありません / 敏感肌ではありません
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-gray-200 p-4">
                <input
                  type="checkbox"
                  checked={form.noMetalAllergy}
                  onChange={(e) => updateField("noMetalAllergy", e.target.checked)}
                  className="mt-1 h-5 w-5 rounded"
                />
                <span className="text-sm leading-6">
                  金属アレルギーはありません
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-gray-200 p-4">
                <input
                  type="checkbox"
                  checked={form.noAcetoneIssue}
                  onChange={(e) => updateField("noAcetoneIssue", e.target.checked)}
                  className="mt-1 h-5 w-5 rounded"
                />
                <span className="text-sm leading-6">
                  アセトンで気分が悪くなったことはありません
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-gray-200 p-4">
                <input
                  type="checkbox"
                  checked={form.noNailOrSkinDisease}
                  onChange={(e) => updateField("noNailOrSkinDisease", e.target.checked)}
                  className="mt-1 h-5 w-5 rounded"
                />
                <span className="text-sm leading-6">
                  爪や皮膚に疾患はありません（グリーンネイル等）
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-gray-200 p-4">
                <input
                  type="checkbox"
                  checked={form.notPregnantOrUnderTreatment}
                  onChange={(e) =>
                    updateField("notPregnantOrUnderTreatment", e.target.checked)
                  }
                  className="mt-1 h-5 w-5 rounded"
                />
                <span className="text-sm leading-6">
                  妊娠していません・通院中ではありません
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-gray-200 p-4">
                <input
                  type="checkbox"
                  checked={form.noOtherHealthProblems}
                  onChange={(e) => updateField("noOtherHealthProblems", e.target.checked)}
                  className="mt-1 h-5 w-5 rounded"
                />
                <span className="text-sm leading-6">
                  その他、施術に影響する健康上の問題はありません
                </span>
              </label>
            </div>

            <div className="mt-4">
              <label className="mb-2 block text-sm font-medium">
                気になる点・事前に伝えたいこと
              </label>
              <textarea
                value={form.concernNote}
                onChange={(e) => updateField("concernNote", e.target.value)}
                rows={5}
                placeholder="気になることや、スタッフへ事前に伝えたい内容があればご入力ください。"
                className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-base outline-none transition focus:border-[#c67b5c]"
              />
            </div>
          </section>

          <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5">
            <h2 className="text-lg font-semibold">ご確認事項</h2>
            <div className="mt-4 space-y-3">
              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-gray-200 p-4">
                <input
                  type="checkbox"
                  checked={form.agreeNoRefund}
                  onChange={(e) => updateField("agreeNoRefund", e.target.checked)}
                  className="mt-1 h-5 w-5 rounded"
                />
                <span className="text-sm leading-6">
                  施術後のデザインや仕上がりに関するご返金対応は行わないことに同意します
                  <span className="ml-1 text-red-500">*</span>
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-gray-200 p-4">
                <input
                  type="checkbox"
                  checked={form.agreeNoGuarantee}
                  onChange={(e) => updateField("agreeNoGuarantee", e.target.checked)}
                  className="mt-1 h-5 w-5 rounded"
                />
                <span className="text-sm leading-6">
                  お客様都合による保証対応は行わないことに同意します
                  <span className="ml-1 text-red-500">*</span>
                </span>
              </label>
            </div>

            <div className="mt-4">
              <label className="mb-2 block text-sm font-medium">
                ご署名（氏名をご入力ください） <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.signatureName}
                onChange={(e) => updateField("signatureName", e.target.value)}
                placeholder="例）山田 花子"
                className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-base outline-none transition focus:border-[#c67b5c]"
              />
            </div>
          </section>

          {errorMessage ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          ) : null}

          {successMessage ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {successMessage}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-2xl bg-[#c67b5c] px-4 py-4 text-base font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? "送信中です..." : "登録内容を送信する"}
          </button>

          <p className="pb-6 text-center text-xs leading-5 text-gray-500">
            ご入力ありがとうございます。内容確認後、スタッフがご案内いたします。
          </p>
        </form>
      </div>
    </main>
  );
}