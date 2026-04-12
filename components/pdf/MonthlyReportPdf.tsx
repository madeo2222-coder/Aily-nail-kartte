"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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

type MonthlySummary = {
  month?: string;
  totalSales?: number;
  totalExpenses?: number;
  profit?: number;
  visitCount?: number;
  avgUnitPrice?: number;
  categoryRows?: CategoryRow[];
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
  if (!month) return "NR-0000-00";
  const [year, monthText] = month.split("/");
  return `NR-${year}-${String(monthText).padStart(2, "0")}`;
}

function getTodayLabel() {
  const now = new Date();
  return `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}`;
}

function getProfitColor(profit: number) {
  return profit < 0 ? "text-red-600" : "text-slate-900";
}

function calcRate(cur: number, prev: number) {
  if (prev === 0) return 0;
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

export default function MonthlyReportPdf({
  summary,
  rows,
}: {
  summary: MonthlySummary | null;
  rows: Row[];
}) {
  const total = 6;

  const month = summary?.month ?? "";
  const monthLabel = getMonthLabel(month);
  const documentNumber = getDocumentNumber(month);

  const totalSales = summary?.totalSales ?? 0;
  const totalExpenses = summary?.totalExpenses ?? 0;
  const profit = summary?.profit ?? 0;
  const visitCount = summary?.visitCount ?? 0;
  const avgUnitPrice = summary?.avgUnitPrice ?? 0;
  const categoryRows = summary?.categoryRows ?? [];
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
            NAILY AIDOL MANAGEMENT REPORT
          </div>

          <div className="mb-6 text-6xl font-bold leading-tight text-slate-900">
            今月の利益と課題が、
            <br />
            すぐわかる。
          </div>

          <div className="mb-10 text-xl leading-9 text-slate-600">
            売上・経費・粗利・前月比・経費カテゴリを整理した
            <br />
            オーナー向け月次レポート
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

          <div className="mt-20 text-xl text-slate-400">page 1 / {total}</div>
        </div>
      </div>

      <PdfPage page={2} total={total}>
        <div>
          <div className="mb-8 flex items-start justify-between">
            <div>
              <div className="text-sm tracking-wide text-slate-500">
                Aily Nail Studio
              </div>
              <h2 className="mt-2 text-4xl font-bold text-slate-900">
                今月の経営サマリー
              </h2>
            </div>
            <div className="text-right text-sm text-slate-500">
              {documentNumber}
            </div>
          </div>

          <div className="mb-8 text-lg text-slate-600">
            今月の売上・経費・粗利をまとめて確認
          </div>

          <div className="grid grid-cols-1 gap-5">
            <div className="rounded-[24px] border-2 border-slate-200 bg-white p-7">
              <div className="mb-3 text-lg text-slate-500">当月売上</div>
              <div className="text-5xl font-bold tracking-tight text-slate-900">
                {yen(totalSales)}
              </div>
            </div>

            <div className="rounded-[24px] border-2 border-slate-200 bg-white p-7">
              <div className="mb-3 text-lg text-slate-500">当月経費</div>
              <div className="text-5xl font-bold tracking-tight text-slate-900">
                {yen(totalExpenses)}
              </div>
            </div>

            <div className="rounded-[24px] border-2 border-slate-200 bg-white p-7">
              <div className="mb-3 text-lg text-slate-500">当月粗利</div>
              <div
                className={`text-5xl font-bold tracking-tight ${getProfitColor(
                  profit
                )}`}
              >
                {yen(profit)}
              </div>
            </div>
          </div>

          <div className="mt-8 rounded-[24px] bg-slate-50 p-6">
            {profit < 0 ? (
              <>
                <div className="mb-3 text-2xl font-bold text-red-600">
                  🚨 赤字：即改善が必要
                </div>
                <div className="space-y-2 text-base leading-8 text-slate-700">
                  <div>・売上低下か経費増加かを最優先で切り分ける</div>
                  <div>・広告費、材料費、外注費の増加有無を確認する</div>
                  <div>・来店数減少か客単価低下かをチェックする</div>
                  <div>・不要コストは即削減対象として洗い出す</div>
                </div>
              </>
            ) : (
              <>
                <div className="mb-3 text-2xl font-bold text-slate-900">
                  ✅ 黒字：維持と強化フェーズ
                </div>
                <div className="space-y-2 text-base leading-8 text-slate-700">
                  <div>・利益を維持しつつ売上拡大余地を確認する</div>
                  <div>・客単価アップ施策を検討する</div>
                  <div>・次回予約導線で再来率を最大化する</div>
                  <div>・利益が出ている今こそ無駄コストを点検する</div>
                </div>
              </>
            )}
          </div>
        </div>
      </PdfPage>

      <PdfPage page={3} total={total}>
        <div>
          <div className="mb-8 flex items-start justify-between">
            <div>
              <div className="text-sm tracking-wide text-slate-500">
                Aily Nail Studio
              </div>
              <h2 className="mt-2 text-4xl font-bold text-slate-900">
                来店数と客単価
              </h2>
            </div>
            <div className="text-right text-sm text-slate-500">
              {documentNumber}
            </div>
          </div>

          <div className="mb-8 text-lg text-slate-600">
            今月の売上をつくっている基本指標
          </div>

          <div className="grid grid-cols-1 gap-5">
            <div className="rounded-[24px] border-2 border-slate-200 bg-white p-7">
              <div className="mb-3 text-lg text-slate-500">来店数</div>
              <div className="text-5xl font-bold tracking-tight text-slate-900">
                {visitCount}件
              </div>
            </div>

            <div className="rounded-[24px] border-2 border-slate-200 bg-white p-7">
              <div className="mb-3 text-lg text-slate-500">客単価</div>
              <div className="text-5xl font-bold tracking-tight text-slate-900">
                {yen(avgUnitPrice)}
              </div>
            </div>
          </div>

          <div className="mt-8 rounded-[24px] bg-slate-50 p-6">
            {visitCount === 0 ? (
              <div className="text-base leading-8 text-red-600">
                ⚠ 来店データなし：集客停止状態です
              </div>
            ) : (
              <div className="space-y-2 text-base leading-8 text-slate-700">
                <div>・来店数 × 客単価 = 売上の基本構造</div>
                <div>・来店数が弱い場合は集客導線を見直す</div>
                <div>・客単価が弱い場合はメニュー設計を見直す</div>
                <div>・両方弱い場合は運用全体の再設計が必要</div>
              </div>
            )}
          </div>
        </div>
      </PdfPage>

      <PdfPage page={4} total={total}>
        <div>
          <div className="mb-8 flex items-start justify-between">
            <div>
              <div className="text-sm tracking-wide text-slate-500">
                Aily Nail Studio
              </div>
              <h2 className="mt-2 text-4xl font-bold text-slate-900">
                月次推移グラフ
              </h2>
            </div>
            <div className="text-right text-sm text-slate-500">
              {documentNumber}
            </div>
          </div>

          <div className="mb-8 text-lg text-slate-600">
            売上・経費・粗利の流れを一目で確認
          </div>

          <div className="rounded-[24px] border-2 border-slate-200 bg-white p-6">
            <div className="h-[420px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rows}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip
                    formatter={(value) => [yen(Number(value)), ""]}
                    labelFormatter={(label) => `月: ${String(label)}`}
                  />
                  <Line
                    type="monotone"
                    dataKey="sales"
                    name="売上"
                    stroke="#2563eb"
                    strokeWidth={3}
                    dot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="expenses"
                    name="経費"
                    stroke="#ef4444"
                    strokeWidth={3}
                    dot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="profit"
                    name="粗利"
                    stroke="#16a34a"
                    strokeWidth={3}
                    dot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </PdfPage>

      <PdfPage page={5} total={total}>
        <div>
          <div className="mb-8 flex items-start justify-between">
            <div>
              <div className="text-sm tracking-wide text-slate-500">
                Aily Nail Studio
              </div>
              <h2 className="mt-2 text-4xl font-bold text-slate-900">
                前月比で見る変化
              </h2>
            </div>
            <div className="text-right text-sm text-slate-500">
              {documentNumber}
            </div>
          </div>

          <div className="mb-8 text-lg text-slate-600">
            前月と比べて、今月どこが変わったかを確認
          </div>

          {!current || !prev ? (
            <div className="text-slate-600">
              前月比較に必要なデータが不足しています
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-5">
                <div className="rounded-[24px] border-2 border-slate-200 bg-white p-7">
                  <div className="mb-2 text-lg text-slate-500">売上</div>
                  <div className={`text-4xl font-bold ${rateColor(salesRate, "sales")}`}>
                    {arrow(salesRate)} {salesRate.toFixed(1)}%
                  </div>
                </div>

                <div className="rounded-[24px] border-2 border-slate-200 bg-white p-7">
                  <div className="mb-2 text-lg text-slate-500">経費</div>
                  <div
                    className={`text-4xl font-bold ${rateColor(
                      expensesRate,
                      "expenses"
                    )}`}
                  >
                    {arrow(expensesRate)} {expensesRate.toFixed(1)}%
                  </div>
                </div>

                <div className="rounded-[24px] border-2 border-slate-200 bg-white p-7">
                  <div className="mb-2 text-lg text-slate-500">粗利</div>
                  <div
                    className={`text-4xl font-bold ${rateColor(profitRate, "profit")}`}
                  >
                    {arrow(profitRate)} {profitRate.toFixed(1)}%
                  </div>
                </div>
              </div>

              <div className="rounded-[24px] bg-slate-50 p-6 text-base leading-8 text-slate-700">
                {profitRate < 0 ? (
                  <div className="space-y-2">
                    <div>・利益が前月より悪化している</div>
                    <div>・売上減少か経費増加の主因を特定する</div>
                    <div>・広告費、固定費、材料費の増加を優先確認する</div>
                    <div>・改善しない場合は構造見直しを検討する</div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div>・利益は前月より改善している</div>
                    <div>・改善が単発要因か再現性ある施策かを確認する</div>
                    <div>・利益が出た導線へ再投資を検討する</div>
                    <div>・拡大前に無駄コストがないか再点検する</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </PdfPage>

      <PdfPage page={6} total={total}>
        <div>
          <div className="mb-8 flex items-start justify-between">
            <div>
              <div className="text-sm tracking-wide text-slate-500">
                Aily Nail Studio
              </div>
              <h2 className="mt-2 text-4xl font-bold text-slate-900">
                経費カテゴリ分析
              </h2>
            </div>
            <div className="text-right text-sm text-slate-500">
              {documentNumber}
            </div>
          </div>

          <div className="mb-8 text-lg text-slate-600">
            今月、どの経費が大きいかを確認
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

              <div className="space-y-4">
                {categoryRows.map((row) => (
                  <div
                    key={row.category}
                    className="rounded-[24px] border-2 border-slate-200 bg-white p-6"
                  >
                    <div className="mb-3 flex items-center justify-between gap-4">
                      <div className="text-2xl font-bold text-slate-900">
                        {row.category}
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-slate-900">
                          {yen(row.amount)}
                        </div>
                        <div className="text-sm text-slate-500">
                          {row.percent.toFixed(1)}%
                        </div>
                      </div>
                    </div>

                    <div className="h-4 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-slate-900"
                        style={{ width: `${Math.min(row.percent, 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-[24px] bg-slate-50 p-6 text-base leading-8 text-slate-700">
                {topCategory ? (
                  <div className="space-y-2">
                    <div>・最大コストは「{topCategory.category}」</div>
                    <div>
                      ・全体の {(topCategory.percent ?? 0).toFixed(1)}% を占める
                    </div>
                    <div>・必要経費か投資かを区別して判断する</div>
                    <div>・固定費化していないかを確認する</div>
                  </div>
                ) : (
                  <>カテゴリ分析データがありません</>
                )}
              </div>
            </div>
          )}
        </div>
      </PdfPage>
    </div>
  );
}