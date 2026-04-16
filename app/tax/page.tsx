"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

function getCurrentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}/${now.getMonth() + 1}`;
}

function getMonthLabel(value: string) {
  const [year, month] = value.split("/");
  if (!year || !month) return value;
  return `${year}年${Number(month)}月`;
}

function toMonthInputValue(value: string) {
  const [year, month] = value.split("/");
  if (!year || !month) return "";
  return `${year}-${String(Number(month)).padStart(2, "0")}`;
}

async function copyText(text: string) {
  if (typeof window === "undefined") {
    return { ok: false, mode: "unavailable" as const };
  }

  const safeText = text ?? "";

  try {
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === "function"
    ) {
      await navigator.clipboard.writeText(safeText);
      return { ok: true, mode: "clipboard" as const };
    }
  } catch {
    // fallbackへ進む
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = safeText;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "20px";
    textarea.style.left = "20px";
    textarea.style.width = "1px";
    textarea.style.height = "1px";
    textarea.style.opacity = "0.01";
    textarea.style.zIndex = "9999";

    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);

    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);

    if (copied) {
      return { ok: true, mode: "execCommand" as const };
    }
  } catch {
    // prompt fallbackへ進む
  }

  try {
    window.prompt("下の文字を長押ししてコピーしてください", safeText);
    return { ok: true, mode: "prompt" as const };
  } catch {
    return { ok: false, mode: "failed" as const };
  }
}

export default function TaxPage() {
  const [mounted, setMounted] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [accountantEmail, setAccountantEmail] = useState("");
  const [savedAccountantEmail, setSavedAccountantEmail] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [copyMessage, setCopyMessage] = useState("");

  const [checkPdfReady, setCheckPdfReady] = useState(false);
  const [checkMonthlyCsvReady, setCheckMonthlyCsvReady] = useState(false);
  const [checkSalesCsvReady, setCheckSalesCsvReady] = useState(false);
  const [checkExpenseCsvReady, setCheckExpenseCsvReady] = useState(false);
  const [checkEvidenceReady, setCheckEvidenceReady] = useState(false);
  const [checkBankReady, setCheckBankReady] = useState(false);

  const saveTimerRef = useRef<number | null>(null);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setMounted(true);

    const currentMonth = getCurrentMonthValue();
    const storedMonth = localStorage.getItem("tax_selected_month") ?? currentMonth;
    const storedEmail = localStorage.getItem("tax_accountant_email") ?? "";
    const storedPdfReady = localStorage.getItem("tax_check_pdf_ready") === "1";
    const storedMonthlyCsvReady =
      localStorage.getItem("tax_check_monthly_csv_ready") === "1";
    const storedSalesCsvReady =
      localStorage.getItem("tax_check_sales_csv_ready") === "1";
    const storedExpenseCsvReady =
      localStorage.getItem("tax_check_expense_csv_ready") === "1";
    const storedEvidenceReady =
      localStorage.getItem("tax_check_evidence_ready") === "1";
    const storedBankReady =
      localStorage.getItem("tax_check_bank_ready") === "1";

    setSelectedMonth(storedMonth);
    setAccountantEmail(storedEmail);
    setSavedAccountantEmail(storedEmail);
    setCheckPdfReady(storedPdfReady);
    setCheckMonthlyCsvReady(storedMonthlyCsvReady);
    setCheckSalesCsvReady(storedSalesCsvReady);
    setCheckExpenseCsvReady(storedExpenseCsvReady);
    setCheckEvidenceReady(storedEvidenceReady);
    setCheckBankReady(storedBankReady);
  }, []);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
      if (copyTimerRef.current) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  function showSaveMessage(message: string, timeout = 5000) {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }
    setSaveMessage(message);
    saveTimerRef.current = window.setTimeout(() => {
      setSaveMessage("");
      saveTimerRef.current = null;
    }, timeout);
  }

  function showCopyMessage(message: string, timeout = 5000) {
    if (copyTimerRef.current) {
      window.clearTimeout(copyTimerRef.current);
    }
    setCopyMessage(message);
    copyTimerRef.current = window.setTimeout(() => {
      setCopyMessage("");
      copyTimerRef.current = null;
    }, timeout);
  }

  async function handleCopy(targetText: string, successMessage: string) {
    const result = await copyText(targetText);

    if (!result.ok) {
      alert("コピーに失敗しました。必要な文面を手動で選択してコピーしてください。");
      return;
    }

    if (result.mode === "prompt") {
      showCopyMessage(
        "コピー画面を開きました。表示された文字を長押ししてコピーしてください。"
      );
      return;
    }

    showCopyMessage(successMessage);
  }

  function handleSaveAccountantEmail() {
    const value = accountantEmail.trim();
    localStorage.setItem("tax_accountant_email", value);
    setSavedAccountantEmail(value);
    showSaveMessage(
      value ? "税理士メールを保存しました" : "税理士メールを空にしました"
    );
  }

  function handleMonthChange(value: string) {
    setSelectedMonth(value);
    localStorage.setItem("tax_selected_month", value);
  }

  function handleToggleCheck(
    key:
      | "pdf"
      | "monthly_csv"
      | "sales_csv"
      | "expense_csv"
      | "evidence"
      | "bank"
  ) {
    if (key === "pdf") {
      const next = !checkPdfReady;
      setCheckPdfReady(next);
      localStorage.setItem("tax_check_pdf_ready", next ? "1" : "0");
      return;
    }

    if (key === "monthly_csv") {
      const next = !checkMonthlyCsvReady;
      setCheckMonthlyCsvReady(next);
      localStorage.setItem("tax_check_monthly_csv_ready", next ? "1" : "0");
      return;
    }

    if (key === "sales_csv") {
      const next = !checkSalesCsvReady;
      setCheckSalesCsvReady(next);
      localStorage.setItem("tax_check_sales_csv_ready", next ? "1" : "0");
      return;
    }

    if (key === "expense_csv") {
      const next = !checkExpenseCsvReady;
      setCheckExpenseCsvReady(next);
      localStorage.setItem("tax_check_expense_csv_ready", next ? "1" : "0");
      return;
    }

    if (key === "evidence") {
      const next = !checkEvidenceReady;
      setCheckEvidenceReady(next);
      localStorage.setItem("tax_check_evidence_ready", next ? "1" : "0");
      return;
    }

    const next = !checkBankReady;
    setCheckBankReady(next);
    localStorage.setItem("tax_check_bank_ready", next ? "1" : "0");
  }

  const allSubmissionChecksReady =
    checkPdfReady &&
    checkMonthlyCsvReady &&
    checkSalesCsvReady &&
    checkExpenseCsvReady &&
    checkEvidenceReady &&
    checkBankReady;

  const selectedMonthLabel = selectedMonth ? getMonthLabel(selectedMonth) : "未選択";

  const ownerAnnouncementText = useMemo(() => {
    return [
      `【月次締めのご案内】`,
      `${selectedMonthLabel}分の税理士提出資料を準備してください。`,
      ``,
      `準備するもの`,
      `・月次PDF`,
      `・月次総合CSV`,
      `・売上明細CSV`,
      `・経費明細CSV`,
      `・領収書 / レシート / 請求書`,
      `・通帳コピー or ネットバンキング明細`,
      ``,
      `Naily AiDOLの「税理士提出」ページから順番に確認してください。`,
    ].join("\n");
  }, [selectedMonthLabel]);

  const accountantMailDraft = useMemo(() => {
    return [
      `件名: ${selectedMonthLabel} 税理士提出資料のご共有`,
      ``,
      `${savedAccountantEmail ? `送付先: ${savedAccountantEmail}` : "送付先: （未登録）"}`,
      ``,
      `お疲れさまです。`,
      `${selectedMonthLabel}分の資料をお送りします。`,
      ``,
      `添付予定資料`,
      `・月次PDF`,
      `・月次総合CSV`,
      `・売上明細CSV`,
      `・経費明細CSV`,
      ``,
      `別途共有資料`,
      `・領収書 / レシート / 請求書`,
      `・通帳コピー or ネットバンキング明細`,
      ``,
      `ご確認よろしくお願いいたします。`,
    ].join("\n");
  }, [savedAccountantEmail, selectedMonthLabel]);

  if (!mounted) {
    return (
      <main className="mx-auto max-w-6xl space-y-5 p-4 pb-24 md:space-y-6">
        <div className="overflow-hidden rounded-3xl border bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-5 text-white shadow md:p-6">
          <div className="max-w-3xl">
            <div className="mb-3 inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-bold tracking-wide">
              Naily AiDOL 税理士提出
            </div>
            <h1 className="text-3xl font-bold leading-tight md:text-4xl">
              月次締めと税理士提出を、
              <br />
              ここでまとめて確認。
            </h1>
            <p className="mt-3 text-sm leading-7 text-slate-200 md:text-base">
              読み込み中...
            </p>
          </div>
        </div>

        <div className="rounded-3xl border bg-white p-5 shadow">
          <div className="text-sm text-slate-500">税理士提出ページを読み込み中です...</div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl space-y-5 p-4 pb-24 md:space-y-6">
      {copyMessage ? (
        <div className="fixed left-1/2 top-4 z-[100] w-[calc(100%-24px)] max-w-md -translate-x-1/2">
          <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <div className="text-sm font-bold text-blue-700">{copyMessage}</div>
              <button
                type="button"
                onClick={() => setCopyMessage("")}
                className="shrink-0 rounded-lg border border-blue-200 bg-white px-2 py-1 text-xs font-bold text-blue-700"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {saveMessage ? (
        <div className="fixed left-1/2 top-20 z-[100] w-[calc(100%-24px)] max-w-md -translate-x-1/2">
          <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <div className="text-sm font-bold text-green-700">{saveMessage}</div>
              <button
                type="button"
                onClick={() => setSaveMessage("")}
                className="shrink-0 rounded-lg border border-green-200 bg-white px-2 py-1 text-xs font-bold text-green-700"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-3xl border bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-5 text-white shadow md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-3 inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-bold tracking-wide">
              Naily AiDOL 税理士提出
            </div>
            <h1 className="text-3xl font-bold leading-tight md:text-4xl">
              月次締めと税理士提出を、
              <br />
              ここでまとめて確認。
            </h1>
            <p className="mt-3 text-sm leading-7 text-slate-200 md:text-base">
              月次PDF・月次総合CSV・売上明細CSV・経費明細CSVの準備状況を確認し、
              税理士へ渡す前のチェックと文面作成までここで行えます。
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/dashboard"
              className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/20"
            >
              ダッシュボードへ戻る
            </Link>
            <Link
              href="/visits"
              className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/20"
            >
              来店一覧へ
            </Link>
            <Link
              href="/expenses"
              className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/20"
            >
              経費一覧へ
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-3xl border bg-white p-5 shadow">
          <div className="mb-4">
            <div className="text-lg font-bold text-slate-900">対象月</div>
            <div className="mt-1 text-sm text-slate-500">
              税理士へ渡す月をここで管理します。
            </div>
          </div>

          <div className="space-y-3">
            <input
              type="month"
              value={toMonthInputValue(selectedMonth)}
              onChange={(e) => {
                const [year, month] = e.target.value.split("-");
                if (year && month) {
                  handleMonthChange(`${year}/${Number(month)}`);
                }
              }}
              className="w-full rounded-xl border px-3 py-3"
            />

            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-sm text-slate-500">現在の選択</div>
              <div className="mt-2 text-2xl font-bold text-slate-900">
                {selectedMonthLabel}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border bg-white p-5 shadow">
          <div className="mb-4">
            <div className="text-lg font-bold text-slate-900">提出物一覧</div>
            <div className="mt-1 text-sm text-slate-500">
              毎月この4点を出力して、税理士提出の土台を作ります。
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-2xl border bg-slate-50 p-4">
              <div className="text-sm text-slate-500">① 月次PDF</div>
              <div className="mt-2 text-base font-bold text-slate-900">
                ダッシュボードで生成
              </div>
            </div>

            <div className="rounded-2xl border bg-slate-50 p-4">
              <div className="text-sm text-slate-500">② 月次総合CSV</div>
              <div className="mt-2 text-base font-bold text-slate-900">
                ダッシュボードで出力
              </div>
            </div>

            <div className="rounded-2xl border bg-slate-50 p-4">
              <div className="text-sm text-slate-500">③ 売上明細CSV</div>
              <div className="mt-2 text-base font-bold text-slate-900">
                来店一覧で出力
              </div>
            </div>

            <div className="rounded-2xl border bg-slate-50 p-4">
              <div className="text-sm text-slate-500">④ 経費明細CSV</div>
              <div className="mt-2 text-base font-bold text-slate-900">
                経費一覧で出力
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm leading-7 text-amber-800">
            別途、領収書 / レシート / 請求書 と 通帳コピー or ネットバンキング明細も準備してください。
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr]">
        <div className="rounded-3xl border bg-white p-5 shadow">
          <div className="mb-4">
            <div className="text-lg font-bold text-slate-900">税理士メール</div>
            <div className="mt-1 text-sm text-slate-500">
              いまはブラウザ保存です。次段階で正式保存と送信機能につなげられます。
            </div>
          </div>

          <div className="space-y-3">
            <input
              type="email"
              value={accountantEmail}
              onChange={(e) => setAccountantEmail(e.target.value)}
              placeholder="tax@example.com"
              className="w-full rounded-xl border px-3 py-3 text-sm"
            />

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSaveAccountantEmail}
                className="rounded-xl border bg-white px-4 py-2 text-sm font-bold text-slate-700"
              >
                税理士メールを保存
              </button>

              <button
                type="button"
                onClick={() =>
                  handleCopy(
                    savedAccountantEmail || accountantEmail,
                    "メールアドレスをコピーしました"
                  )
                }
                className="rounded-xl border bg-white px-4 py-2 text-sm font-bold text-slate-700"
              >
                メールアドレスをコピー
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border bg-white p-5 shadow">
          <div className="mb-4">
            <div className="text-lg font-bold text-slate-900">送付前チェック</div>
            <div className="mt-1 text-sm text-slate-500">
              すべて揃ったら、送付準備OKになります。
            </div>
          </div>

          <div className="space-y-2 text-sm text-slate-700">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={checkPdfReady}
                onChange={() => handleToggleCheck("pdf")}
              />
              月次PDFを確認した
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={checkMonthlyCsvReady}
                onChange={() => handleToggleCheck("monthly_csv")}
              />
              月次総合CSVを出力した
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={checkSalesCsvReady}
                onChange={() => handleToggleCheck("sales_csv")}
              />
              売上明細CSVを出力した
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={checkExpenseCsvReady}
                onChange={() => handleToggleCheck("expense_csv")}
              />
              経費明細CSVを出力した
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={checkEvidenceReady}
                onChange={() => handleToggleCheck("evidence")}
              />
              領収書 / レシート / 請求書をまとめた
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={checkBankReady}
                onChange={() => handleToggleCheck("bank")}
              />
              通帳コピー or ネットバンキング明細を準備した
            </label>
          </div>

          <div
            className={`mt-4 rounded-xl px-3 py-3 text-sm font-bold ${
              allSubmissionChecksReady
                ? "bg-green-50 text-green-700"
                : "bg-amber-50 text-amber-700"
            }`}
          >
            {allSubmissionChecksReady
              ? "送付準備OK：税理士へ渡す準備がそろっています"
              : "未完了：提出前チェックをすべて確認してください"}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr]">
        <div className="rounded-3xl border bg-white p-5 shadow">
          <div className="mb-4">
            <div className="text-lg font-bold text-slate-900">月初アナウンス文</div>
            <div className="mt-1 text-sm text-slate-500">
              オーナーやスタッフへの案内文として使えます。
            </div>
          </div>

          <div className="rounded-2xl bg-slate-50 p-4 text-sm leading-7 text-slate-700 whitespace-pre-wrap">
            {ownerAnnouncementText}
          </div>

          <div className="mt-3">
            <button
              type="button"
              onClick={() =>
                handleCopy(ownerAnnouncementText, "月初アナウンス文をコピーしました")
              }
              className="rounded-xl border bg-white px-4 py-2 text-sm font-bold text-slate-700"
            >
              アナウンス文をコピー
            </button>
          </div>
        </div>

        <div className="rounded-3xl border bg-white p-5 shadow">
          <div className="mb-4">
            <div className="text-lg font-bold text-slate-900">税理士送付用メール文</div>
            <div className="mt-1 text-sm text-slate-500">
              いまは下書きコピー用です。次段階で自動送信につなげられます。
            </div>
          </div>

          <div className="rounded-2xl bg-slate-50 p-4 text-sm leading-7 text-slate-700 whitespace-pre-wrap">
            {accountantMailDraft}
          </div>

          <div className="mt-3">
            <button
              type="button"
              onClick={() =>
                handleCopy(
                  accountantMailDraft,
                  "税理士送付用メール文をコピーしました"
                )
              }
              className="rounded-xl border bg-white px-4 py-2 text-sm font-bold text-slate-700"
            >
              メール文をコピー
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border bg-white p-5 shadow">
        <div className="mb-4">
          <div className="text-lg font-bold text-slate-900">作業導線</div>
          <div className="mt-1 text-sm text-slate-500">
            毎月はこの順で進めるとズレにくいです。
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="rounded-2xl border bg-slate-50 p-4">
            <div className="text-sm text-slate-500">STEP 1</div>
            <div className="mt-2 text-base font-bold text-slate-900">
              ダッシュボード
            </div>
            <div className="mt-2 text-sm text-slate-600">
              月次PDF / 月次総合CSV
            </div>
          </div>

          <div className="rounded-2xl border bg-slate-50 p-4">
            <div className="text-sm text-slate-500">STEP 2</div>
            <div className="mt-2 text-base font-bold text-slate-900">
              来店一覧
            </div>
            <div className="mt-2 text-sm text-slate-600">
              売上明細CSV
            </div>
          </div>

          <div className="rounded-2xl border bg-slate-50 p-4">
            <div className="text-sm text-slate-500">STEP 3</div>
            <div className="mt-2 text-base font-bold text-slate-900">
              経費一覧
            </div>
            <div className="mt-2 text-sm text-slate-600">
              経費明細CSV
            </div>
          </div>

          <div className="rounded-2xl border bg-slate-50 p-4">
            <div className="text-sm text-slate-500">STEP 4</div>
            <div className="mt-2 text-base font-bold text-slate-900">
              このページ
            </div>
            <div className="mt-2 text-sm text-slate-600">
              チェック / 文面 / 提出準備
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}