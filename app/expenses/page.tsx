"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { supabase } from "@/lib/supabase";

type ExpenseRow = {
  id: string;
  expense_date: string | null;
  category: string | null;
  amount: number | null;
  memo: string | null;
};

const pdfBoxStyle: React.CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: "12px",
  padding: "16px",
  marginBottom: "12px",
  backgroundColor: "#ffffff",
};

export default function ExpensesPage() {
  const pdfRef = useRef<HTMLDivElement | null>(null);

  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const fetchExpenses = async () => {
    setIsLoading(true);

    const { data, error } = await supabase
      .from("expenses")
      .select("id, expense_date, category, amount, memo")
      .order("expense_date", { ascending: false })
      .order("id", { ascending: false });

    if (error) {
      console.error("経費一覧取得エラー:", error);
      alert(`経費一覧の取得に失敗しました: ${error.message}`);
      setIsLoading(false);
      return;
    }

    setRows((data ?? []) as ExpenseRow[]);
    setIsLoading(false);
  };

  useEffect(() => {
    void fetchExpenses();
  }, []);

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return rows;

    return rows.filter((row) => {
      const target = [
        row.expense_date ?? "",
        row.category ?? "",
        String(row.amount ?? ""),
        row.memo ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return target.includes(keyword);
    });
  }, [rows, search]);

  const totalAmount = useMemo(() => {
    return filteredRows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  }, [filteredRows]);

  const handleDownloadCSV = () => {
    if (filteredRows.length === 0) {
      alert("出力するデータがありません");
      return;
    }

    const header = ["日付", "カテゴリ", "金額", "内容"];

    const body = filteredRows.map((row) => [
      row.expense_date ?? "",
      row.category ?? "",
      row.amount ?? 0,
      row.memo ?? "",
    ]);

    const csvContent = [header, ...body]
      .map((row) =>
        row
          .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `経費一覧_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();

    URL.revokeObjectURL(url);
  };

  const handleDownloadPDF = async () => {
    if (!pdfRef.current) {
      alert("PDF化する対象が見つかりません。");
      return;
    }

    if (filteredRows.length === 0) {
      alert("出力するデータがありません");
      return;
    }

    try {
      setPdfLoading(true);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const canvas = await html2canvas(pdfRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;

      const imgWidth = pageWidth - margin * 2;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = margin;

      pdf.addImage(imgData, "PNG", margin, position, imgWidth, imgHeight);
      heightLeft -= pageHeight - margin * 2;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight + margin;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", margin, position, imgWidth, imgHeight);
        heightLeft -= pageHeight - margin * 2;
      }

      pdf.save(`経費一覧_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (error) {
      console.error("経費PDF出力エラー:", error);
      alert(error instanceof Error ? error.message : "PDF出力に失敗しました");
    } finally {
      setPdfLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    const ok = window.confirm(
      "この経費を削除しますか？\nCSV由来の確定データなら review に戻します。"
    );
    if (!ok) return;

    setDeletingId(id);

    try {
      const res = await fetch("/api/expenses/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ expenseId: id }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "削除に失敗しました");
      }

      setRows((prev) => prev.filter((row) => row.id !== id));
    } catch (error) {
      console.error("経費削除エラー:", error);
      alert(error instanceof Error ? error.message : "削除に失敗しました");
    } finally {
      setDeletingId(null);
    }
  };

  const formatAmount = (amount: number | null) => {
    return new Intl.NumberFormat("ja-JP").format(Number(amount ?? 0));
  };

  return (
    <main className="p-4 pb-24 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">経費一覧</h1>
        <p className="text-sm text-gray-500 mt-1">
          登録済みの経費を確認・編集・削除できます。
        </p>
      </div>

      <div className="mb-4 rounded-2xl border p-4 space-y-3">
        <div>
          <label className="block text-sm font-medium mb-2">検索</label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="カテゴリ、メモ、金額、日付で検索"
            className="w-full rounded-xl border px-3 py-2"
          />
        </div>

        <div className="text-sm text-gray-700">
          表示件数: {filteredRows.length}件 / 合計: ¥{formatAmount(totalAmount)}
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/expenses/new"
            className="rounded-xl border px-4 py-2 text-sm font-medium"
          >
            新規登録
          </Link>

          <button
            type="button"
            onClick={handleDownloadCSV}
            className="rounded-xl border px-4 py-2 text-sm font-medium"
          >
            CSVダウンロード
          </button>

          <button
            type="button"
            onClick={handleDownloadPDF}
            disabled={isLoading || pdfLoading}
            className="rounded-xl border px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {pdfLoading ? "PDF作成中..." : "PDFダウンロード"}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-2xl border p-6">読み込み中...</div>
      ) : filteredRows.length === 0 ? (
        <div className="rounded-2xl border p-6 text-gray-600">
          経費がありません
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {filteredRows.map((row) => (
              <div key={row.id} className="rounded-2xl border p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-lg font-bold">
                        ¥{formatAmount(row.amount)}
                      </span>
                      <span className="rounded-full border px-2 py-1 text-xs">
                        {row.category || "未分類"}
                      </span>
                    </div>

                    <div className="text-sm text-gray-700 space-y-1">
                      <div>
                        <span className="font-medium">日付:</span>{" "}
                        {row.expense_date || "-"}
                      </div>
                      <div>
                        <span className="font-medium">内容:</span>{" "}
                        {row.memo || "-"}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 md:w-[220px]">
                    <Link
                      href={`/expenses/${row.id}`}
                      className="rounded-xl border px-3 py-2 text-sm text-center"
                    >
                      編集
                    </Link>

                    <button
                      type="button"
                      disabled={deletingId === row.id}
                      onClick={() => handleDelete(row.id)}
                      className="rounded-xl border px-3 py-2 text-sm"
                    >
                      {deletingId === row.id ? "削除中..." : "削除"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div
            ref={pdfRef}
            style={{
              position: "absolute",
              left: "-99999px",
              top: 0,
              width: "1000px",
              backgroundColor: "#ffffff",
              color: "#000000",
              padding: "24px",
            }}
          >
            <div
              style={{
                marginBottom: "24px",
                paddingBottom: "16px",
                borderBottom: "1px solid #d1d5db",
              }}
            >
              <h2
                style={{
                  fontSize: "32px",
                  fontWeight: 700,
                  margin: 0,
                  marginBottom: "12px",
                }}
              >
                Naily AiDOL 経費一覧
              </h2>
              <p style={{ margin: "4px 0", color: "#555", fontSize: "16px" }}>
                出力日: {new Date().toLocaleDateString("ja-JP")}
              </p>
              <p style={{ margin: "4px 0", color: "#555", fontSize: "16px" }}>
                件数: {filteredRows.length}件
              </p>
              <p style={{ margin: "4px 0", color: "#555", fontSize: "16px" }}>
                合計: ¥{formatAmount(totalAmount)}
              </p>
            </div>

            {filteredRows.map((row) => (
              <div key={row.id} style={pdfBoxStyle}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: "12px",
                    gap: "12px",
                  }}
                >
                  <div style={{ fontSize: "28px", fontWeight: 700 }}>
                    ¥{formatAmount(row.amount)}
                  </div>
                  <div
                    style={{
                      border: "1px solid #d1d5db",
                      borderRadius: "9999px",
                      padding: "4px 10px",
                      fontSize: "12px",
                    }}
                  >
                    {row.category || "未分類"}
                  </div>
                </div>

                <div style={{ fontSize: "14px", color: "#333", lineHeight: 1.8 }}>
                  <div>
                    <span style={{ fontWeight: 700 }}>日付:</span>{" "}
                    {row.expense_date || "-"}
                  </div>
                  <div>
                    <span style={{ fontWeight: 700 }}>内容:</span>{" "}
                    {row.memo || "-"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}