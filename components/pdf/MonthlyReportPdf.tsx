"use client";

import PdfPage from "./PdfPage";

type Row = {
  month: string;
  sales: number;
  expenses: number;
  profit: number;
};

type CategoryRow = {
  category: string;
  amount: number;
  percent: number;
};

type PaymentMethodRow = {
  paymentMethod: string;
  amount: number;
  percent: number;
  type: "cash" | "cashless" | "point" | "other";
};

type MonthlySummary = {
  month?: string;
  totalSales?: number;
  totalExpenses?: number;
  profit?: number;
  visitCount?: number;
  avgUnitPrice?: number;
  expenseCount?: number;
  categoryRows?: CategoryRow[];
  cashSales?: number;
  cashlessSales?: number;
  pointSales?: number;
  paymentMethodRows?: PaymentMethodRow[];
};

function yen(value: number | undefined) {
  return `¥${Math.round(value ?? 0).toLocaleString("ja-JP")}`;
}

function getMonthLabel(value?: string) {
  if (!value) return "未設定";
  const [year, month] = value.split("/");
  if (!year || !month) return value;
  return `${year}年${Number(month)}月`;
}

function getDocumentNumber(month?: string) {
  if (!month) return "TX-0000-00";
  const [year, monthText] = month.split("/");
  return `TX-${year}-${String(monthText).padStart(2, "0")}`;
}

function getTodayLabel() {
  const now = new Date();
  return `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}`;
}

function getProfitColor(profit: number) {
  return profit < 0 ? "text-red-600" : "text-slate-900";
}

function calcRate(cur: number, prev: number) {
  if (prev === 0) {
    if (cur === 0) return 0;
    return 100;
  }
  return ((cur - prev) / prev) * 100;
}

function arrow(n: number) {
  if (n > 0) return "↑";
  if (n < 0) return "↓";
  return "→";
}

function rateColor(n: number, type: "sales" | "expenses" | "profit") {
  if (type === "expenses") {
    return n > 0 ? "text-red-600" : "text-green-600";
  }
  return n >= 0 ? "text-green-600" : "text-red-600";
}

function getTypeLabel(type: PaymentMethodRow["type"]) {
  if (type === "cash") return "現金";
  if (type === "cashless") return "キャッシュレス";
  if (type === "point") return "ポイント";
  return "その他";
}

export default function MonthlyReportPdf({
  summary,
  rows,
}: {
  summary: MonthlySummary | null;
  rows: Row[];
}) {
  const totalPages = 6;

  const month = summary?.month ?? "";
  const monthLabel = getMonthLabel(month);
  const documentNumber = getDocumentNumber(month);

  const totalSales = summary?.totalSales ?? 0;
  const totalExpenses = summary?.totalExpenses ?? 0;
  const profit = summary?.profit ?? 0;
  const visitCount = summary?.visitCount ?? 0;
  const expenseCount = summary?.expenseCount ?? 0;
  const avgUnitPrice = summary?.avgUnitPrice ?? 0;
  const categoryRows = summary?.categoryRows ?? [];
  const paymentMethodRows = summary?.paymentMethodRows ?? [];
  const cashSales = summary?.cashSales ?? 0;
  const cashlessSales = summary?.cashlessSales ?? 0;
  const pointSales = summary?.pointSales ?? 0;

  const topCategory = categoryRows[0];

  const current = rows.length >= 1 ? rows[rows.length - 1] : undefined;
  const prev = rows.length >= 2 ? rows[rows.length - 2] : undefined;

  const salesRate = current && prev ? calcRate(current.sales, prev.sales) : 0;
  const expensesRate =
    current && prev ? calcRate(current.expenses, prev.expenses) : 0;
  const profitRate = current && prev ? calcRate(current.profit, prev.profit) : 0;

  return (
    <div className="text-slate-900">
      <style jsx global>{`
        .pdf-sheet {
          width: 210mm;
          min-height: 297mm;
          margin: 0 auto 20px auto;
          background: #ffffff;
          box-sizing: border-box;
          page-break-after: always;
          break-after: page;
        }

        .pdf-sheet:last-child {
          page-break-after: auto;
          break-after: auto;
        }

        @media print {
          .pdf-sheet {
            width: 100%;
            min-height: auto;
            margin: 0;
            box-shadow: none !important;
          }
        }
      `}</style>

      <div className="pdf-sheet border border-slate-300 px-12 py-16">
        <div className="flex min-h-[260mm] flex-col items-center justify-center text-center">
          <div className="mb-4 text-lg tracking-[0.35em] text-slate-400">
            TAX ACCOUNTANT MONTHLY PACKAGE
          </div>

          <div className="mb-6 text-5xl font-bold leading-tight text-slate-900">
            税理士提出用
            <br />
            月次集計資料
          </div>

          <div className="mb-10 text-xl leading-9 text-slate-600">
            売上・経費・粗利・件数・経費分類・支払い手段を整理した
            <br />
            月次確認用の提出資料
          </div>

          <div className="mb-12 h-[3px] w-32 bg-slate-200" />

          <div className="space-y-5 text-2xl leading-10 text-slate-700">
            <div>
              <span className="font-bold text-slate-900">店舗名：</span>
              Aily Nail Studio
            </div>
            <div>
              <span className="font-bold text-slate-900">対象年月：</span>
              {monthLabel}
            </div>
            <div>
              <span className="font-bold text-slate-900">資料番号：</span>
              {documentNumber}
            </div>
            <div>
              <span className="font-bold text-slate-900">作成日：</span>
              {getTodayLabel()}
            </div>
          </div>

          <div className="mt-20 text-xl text-slate-400">
            page 1 / {totalPages}
          </div>
        </div>
      </div>

      <PdfPage page={2} total={totalPages}>
        <div>
          <div className="mb-8 flex items-start justify-between">
            <div>
              <div className="text-sm tracking-wide text-slate-500">
                Aily Nail Studio
              </div>
              <h2 className="mt-2 text-4xl font-bold text-slate-900">
                月次集計サマリー
              </h2>
            </div>
            <div className="text-right text-sm text-slate-500">
              {documentNumber}
            </div>
          </div>

          <div className="mb-8 text-lg text-slate-600">
            税理士提出用の月次主要数値
          </div>

          <div className="grid grid-cols-1 gap-5">
            <div className="rounded-[24px] border-2 border-slate-200 bg-white p-7">
              <div className="mb-3 text-lg text-slate-500">売上合計</div>
              <div className="text-5xl font-bold tracking-tight text-slate-900">
                {yen(totalSales)}
              </div>
            </div>

            <div className="rounded-[24px] border-2 border-slate-200 bg-white p-7">
              <div className="mb-3 text-lg text-slate-500">経費合計</div>
              <div className="text-5xl font-bold tracking-tight text-slate-900">
                {yen(totalExpenses)}
              </div>
            </div>

            <div className="rounded-[24px] border-2 border-slate-200 bg-white p-7">
              <div className="mb-3 text-lg text-slate-500">粗利</div>
              <div
                className={`text-5xl font-bold tracking-tight ${getProfitColor(
                  profit
                )}`}
              >
                {yen(profit)}
              </div>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-3">
            <div className="rounded-[24px] border-2 border-slate-200 bg-white p-6">
              <div className="mb-2 text-lg text-slate-500">来店件数</div>
              <div className="text-4xl font-bold text-slate-900">
                {visitCount.toLocaleString()}件
              </div>
            </div>

            <div className="rounded-[24px] border-2 border-slate-200 bg-white p-6">
              <div className="mb-2 text-lg text-slate-500">経費件数</div>
              <div className="text-4xl font-bold text-slate-900">
                {expenseCount.toLocaleString()}件
              </div>
            </div>

            <div className="rounded-[24px] border-2 border-slate-200 bg-white p-6">
              <div className="mb-2 text-lg text-slate-500">客単価</div>
              <div className="text-4xl font-bold text-slate-900">
                {yen(avgUnitPrice)}
              </div>
            </div>
          </div>

          <div className="mt-8 rounded-[24px] bg-slate-50 p-6">
            <div className="mb-3 text-2xl font-bold text-slate-900">
              提出補足
            </div>
            <div className="space-y-2 text-base leading-8 text-slate-700">
              <div>・本資料は対象月の売上・経費集計を整理した月次提出資料です。</div>
              <div>・売上は来店日基準、経費は expense_date 基準で集計しています。</div>
              <div>・粗利は 売上合計 - 経費合計 で算出しています。</div>
            </div>
          </div>
        </div>
      </PdfPage>

      <PdfPage page={3} total={totalPages}>
        <div>
          <div className="mb-8 flex items-start justify-between">
            <div>
              <div className="text-sm tracking-wide text-slate-500">
                Aily Nail Studio
              </div>
              <h2 className="mt-2 text-4xl font-bold text-slate-900">
                月次推移・前月比
              </h2>
            </div>
            <div className="text-right text-sm text-slate-500">
              {documentNumber}
            </div>
          </div>

          <div className="mb-8 text-lg text-slate-600">
            売上・経費・粗利の推移と前月比較
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <div className="rounded-[24px] border-2 border-slate-200 bg-white p-6">
              <div className="mb-2 text-lg text-slate-500">売上前月比</div>
              <div className={`text-4xl font-bold ${rateColor(salesRate, "sales")}`}>
                {arrow(salesRate)} {salesRate.toFixed(1)}%
              </div>
            </div>

            <div className="rounded-[24px] border-2 border-slate-200 bg-white p-6">
              <div className="mb-2 text-lg text-slate-500">経費前月比</div>
              <div
                className={`text-4xl font-bold ${rateColor(
                  expensesRate,
                  "expenses"
                )}`}
              >
                {arrow(expensesRate)} {expensesRate.toFixed(1)}%
              </div>
            </div>

            <div className="rounded-[24px] border-2 border-slate-200 bg-white p-6">
              <div className="mb-2 text-lg text-slate-500">粗利前月比</div>
              <div className={`text-4xl font-bold ${rateColor(profitRate, "profit")}`}>
                {arrow(profitRate)} {profitRate.toFixed(1)}%
              </div>
            </div>
          </div>

          <div className="mt-8 rounded-[24px] border-2 border-slate-200 bg-white p-6">
            <div className="mb-4 text-xl font-bold text-slate-900">月次推移</div>
            <div className="overflow-hidden rounded-xl border">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border px-3 py-2 text-left">月</th>
                    <th className="border px-3 py-2 text-right">売上</th>
                    <th className="border px-3 py-2 text-right">経費</th>
                    <th className="border px-3 py-2 text-right">粗利</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.month}>
                      <td className="border px-3 py-2">{getMonthLabel(row.month)}</td>
                      <td className="border px-3 py-2 text-right">{yen(row.sales)}</td>
                      <td className="border px-3 py-2 text-right">{yen(row.expenses)}</td>
                      <td className="border px-3 py-2 text-right">{yen(row.profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </PdfPage>

      <PdfPage page={4} total={totalPages}>
        <div>
          <div className="mb-8 flex items-start justify-between">
            <div>
              <div className="text-sm tracking-wide text-slate-500">
                Aily Nail Studio
              </div>
              <h2 className="mt-2 text-4xl font-bold text-slate-900">
                経費カテゴリ集計
              </h2>
            </div>
            <div className="text-right text-sm text-slate-500">
              {documentNumber}
            </div>
          </div>

          <div className="mb-8 text-lg text-slate-600">
            対象月の経費分類内訳
          </div>

          {categoryRows.length === 0 ? (
            <div className="rounded-[24px] bg-slate-50 p-6 text-base leading-8 text-slate-700">
              当月の経費カテゴリデータがありません。
            </div>
          ) : (
            <div className="space-y-6">
              <div className="rounded-[24px] border-2 border-slate-200 bg-white p-7">
                <div className="mb-2 text-lg text-slate-500">最大カテゴリ</div>
                <div className="text-4xl font-bold text-slate-900">
                  {topCategory?.category ?? "未分類"}
                </div>
                <div className="mt-3 text-2xl font-semibold text-slate-700">
                  {yen(topCategory?.amount ?? 0)} /{" "}
                  {(topCategory?.percent ?? 0).toFixed(1)}%
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="border px-3 py-2 text-left">勘定科目</th>
                      <th className="border px-3 py-2 text-right">金額</th>
                      <th className="border px-3 py-2 text-right">構成比</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categoryRows.map((row) => (
                      <tr key={row.category}>
                        <td className="border px-3 py-2">{row.category}</td>
                        <td className="border px-3 py-2 text-right">{yen(row.amount)}</td>
                        <td className="border px-3 py-2 text-right">
                          {row.percent.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="rounded-[24px] bg-slate-50 p-6 text-base leading-8 text-slate-700">
                <div>・経費は category を基準に集計しています。</div>
                <div>・未設定カテゴリは「未分類」として表示しています。</div>
              </div>
            </div>
          )}
        </div>
      </PdfPage>

      <PdfPage page={5} total={totalPages}>
        <div>
          <div className="mb-8 flex items-start justify-between">
            <div>
              <div className="text-sm tracking-wide text-slate-500">
                Aily Nail Studio
              </div>
              <h2 className="mt-2 text-4xl font-bold text-slate-900">
                支払い手段別集計
              </h2>
            </div>
            <div className="text-right text-sm text-slate-500">
              {documentNumber}
            </div>
          </div>

          <div className="mb-8 text-lg text-slate-600">
            対象月の支払い手段別内訳
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <div className="rounded-[24px] border-2 border-slate-200 bg-white p-6">
              <div className="mb-2 text-lg text-slate-500">現金</div>
              <div className="text-4xl font-bold text-slate-900">
                {yen(cashSales)}
              </div>
            </div>

            <div className="rounded-[24px] border-2 border-slate-200 bg-white p-6">
              <div className="mb-2 text-lg text-slate-500">キャッシュレス</div>
              <div className="text-4xl font-bold text-slate-900">
                {yen(cashlessSales)}
              </div>
            </div>

            <div className="rounded-[24px] border-2 border-slate-200 bg-white p-6">
              <div className="mb-2 text-lg text-slate-500">ポイント</div>
              <div className="text-4xl font-bold text-slate-900">
                {yen(pointSales)}
              </div>
            </div>
          </div>

          <div className="mt-8 overflow-hidden rounded-xl border">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border px-3 py-2 text-left">支払い手段</th>
                  <th className="border px-3 py-2 text-left">分類</th>
                  <th className="border px-3 py-2 text-right">金額</th>
                  <th className="border px-3 py-2 text-right">構成比</th>
                </tr>
              </thead>
              <tbody>
                {paymentMethodRows.length === 0 ? (
                  <tr>
                    <td className="border px-3 py-4 text-center text-slate-500" colSpan={4}>
                      当月の支払い手段別データはありません。
                    </td>
                  </tr>
                ) : (
                  paymentMethodRows.map((row) => (
                    <tr key={row.paymentMethod}>
                      <td className="border px-3 py-2">{row.paymentMethod}</td>
                      <td className="border px-3 py-2">{getTypeLabel(row.type)}</td>
                      <td className="border px-3 py-2 text-right">{yen(row.amount)}</td>
                      <td className="border px-3 py-2 text-right">
                        {row.percent.toFixed(1)}%
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </PdfPage>

      <PdfPage page={6} total={totalPages}>
        <div>
          <div className="mb-8 flex items-start justify-between">
            <div>
              <div className="text-sm tracking-wide text-slate-500">
                Aily Nail Studio
              </div>
              <h2 className="mt-2 text-4xl font-bold text-slate-900">
                提出補足・確認事項
              </h2>
            </div>
            <div className="text-right text-sm text-slate-500">
              {documentNumber}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-[24px] border-2 border-slate-200 bg-white p-7">
              <div className="mb-4 text-2xl font-bold text-slate-900">
                資料の前提
              </div>
              <div className="space-y-2 text-base leading-8 text-slate-700">
                <div>・対象月: {monthLabel}</div>
                <div>・売上は visits.price を来店日基準で集計</div>
                <div>・経費は expenses.amount を expense_date 基準で集計</div>
                <div>・粗利は 売上合計 - 経費合計</div>
              </div>
            </div>

            <div className="rounded-[24px] border-2 border-slate-200 bg-white p-7">
              <div className="mb-4 text-2xl font-bold text-slate-900">
                主な数値
              </div>
              <div className="space-y-2 text-base leading-8 text-slate-700">
                <div>・売上合計: {yen(totalSales)}</div>
                <div>・経費合計: {yen(totalExpenses)}</div>
                <div>・粗利: {yen(profit)}</div>
                <div>・来店件数: {visitCount.toLocaleString()}件</div>
                <div>・経費件数: {expenseCount.toLocaleString()}件</div>
                <div>・客単価: {yen(avgUnitPrice)}</div>
              </div>
            </div>

            <div className="rounded-[24px] bg-slate-50 p-6 text-base leading-8 text-slate-700">
              <div>・本資料は月次確認と税理士提出を想定した集計資料です。</div>
              <div>・明細ベースの売上CSV、経費CSVとあわせて提出する運用を推奨します。</div>
              <div>・必要に応じて原票、領収書、レシート画像と照合してください。</div>
            </div>
          </div>
        </div>
      </PdfPage>
    </div>
  );
}