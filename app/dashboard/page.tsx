"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { supabase } from "@/lib/supabase";

/* ===========================
  Utils
=========================== */

function formatYen(value: number) {
  return `¥${new Intl.NumberFormat("ja-JP").format(value)}`;
}

function calcChangePercent(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / previous) * 100;
}

/* ===========================
  Main
=========================== */

export default function DashboardPage() {
  const reportRef = useRef<HTMLDivElement | null>(null);

  const [visits, setVisits] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [prevVisits, setPrevVisits] = useState<any[]>([]);
  const [prevExpenses, setPrevExpenses] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const v = await supabase.from("visits").select("*");
      const e = await supabase.from("expenses").select("*");

      setVisits(v.data || []);
      setExpenses(e.data || []);
      setPrevVisits(v.data || []);
      setPrevExpenses(e.data || []);
    })();
  }, []);

  /* ===== 集計 ===== */

  const monthlySales = useMemo(
    () => visits.reduce((s, v) => s + (v.price || 0), 0),
    [visits]
  );

  const monthlyExpenses = useMemo(
    () => expenses.reduce((s, e) => s + (e.amount || 0), 0),
    [expenses]
  );

  const monthlyProfit = monthlySales - monthlyExpenses;

  const previousSales = useMemo(
    () => prevVisits.reduce((s, v) => s + (v.price || 0), 0),
    [prevVisits]
  );

  const previousExpensesTotal = useMemo(
    () => prevExpenses.reduce((s, e) => s + (e.amount || 0), 0),
    [prevExpenses]
  );

  const previousProfit = previousSales - previousExpensesTotal;

  const salesChange = calcChangePercent(monthlySales, previousSales);
  const expensesChange = calcChangePercent(
    monthlyExpenses,
    previousExpensesTotal
  );
  const profitChange = calcChangePercent(monthlyProfit, previousProfit);

  const profitRate =
    monthlySales === 0 ? 0 : (monthlyProfit / monthlySales) * 100;

  /* ===== 予測 ===== */

  const predictedSales = monthlySales * (1 + salesChange / 100);
  const predictedExpenses = monthlyExpenses * (1 + expensesChange / 100);
  const predictedProfit = predictedSales - predictedExpenses;
  const predictedProfitRate =
    predictedSales === 0 ? 0 : (predictedProfit / predictedSales) * 100;

  function buildForecastComment() {
    if (predictedProfitRate >= 70)
      return "非常に高収益。現状維持でOK";
    if (predictedProfitRate >= 50)
      return "安定収益。良い状態";
    if (predictedProfitRate > 0)
      return "改善余地あり。コスト見直し推奨";
    return "赤字リスク。即改善が必要";
  }

  /* ===== 自動コメント ===== */

  function buildComment() {
    return `売上 ${formatYen(monthlySales)} / 粗利率 ${profitRate.toFixed(
      1
    )}%。前月比 ${salesChange.toFixed(1)}%。`;
  }

  /* ===== PDF ===== */

  const downloadPDF = async () => {
    if (!reportRef.current) return;
    const canvas = await html2canvas(reportRef.current, { scale: 2 });
    const img = canvas.toDataURL("image/png");
    const pdf = new jsPDF();
    pdf.addImage(img, "PNG", 10, 10, 190, 0);
    pdf.save("report.pdf");
  };

  /* ===========================
    UI
  =========================== */

  return (
    <main className="p-4 max-w-5xl mx-auto">

      {/* タイトル */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">📊 経営ダッシュボード</h1>
        <p className="text-sm text-gray-500">
          Naily AiDOL 月次レポート
        </p>
      </div>

      {/* ボタン */}
      <button
        onClick={downloadPDF}
        className="mb-6 border px-4 py-2 rounded-xl"
      >
        PDF出力
      </button>

      <div ref={reportRef} className="space-y-6">

        {/* 🔥 自動コメント */}
        <div className="bg-gray-100 p-4 rounded-2xl">
          <p className="text-sm text-gray-700">
            👉 {buildComment()}
          </p>
        </div>

        {/* 🔥 KPI */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

          <div className="bg-white shadow rounded-2xl p-4">
            <p className="text-xs text-gray-500">売上</p>
            <p className="text-xl font-bold">{formatYen(monthlySales)}</p>
          </div>

          <div className="bg-white shadow rounded-2xl p-4">
            <p className="text-xs text-gray-500">経費</p>
            <p className="text-xl font-bold">{formatYen(monthlyExpenses)}</p>
          </div>

          <div className="bg-white shadow rounded-2xl p-4">
            <p className="text-xs text-gray-500">粗利</p>
            <p className="text-xl font-bold">{formatYen(monthlyProfit)}</p>
          </div>

          <div className="bg-white shadow rounded-2xl p-4">
            <p className="text-xs text-gray-500">粗利率</p>
            <p className="text-xl font-bold">{profitRate.toFixed(1)}%</p>
          </div>

        </div>

        {/* 🔥 予測 */}
        <div className="bg-blue-50 border border-blue-200 p-5 rounded-2xl">
          <h2 className="font-bold mb-2">📈 来月予測</h2>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <p>売上: {formatYen(predictedSales)}</p>
            <p>経費: {formatYen(predictedExpenses)}</p>
            <p>粗利: {formatYen(predictedProfit)}</p>
            <p>粗利率: {predictedProfitRate.toFixed(1)}%</p>
          </div>

          <p className="mt-3 text-sm text-blue-700">
            👉 {buildForecastComment()}
          </p>
        </div>

      </div>
    </main>
  );
}