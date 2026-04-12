"use client";

export default function PdfPage({
  children,
  page,
  total,
}: {
  children: React.ReactNode;
  page: number;
  total: number;
}) {
  return (
    <div className="pdf-sheet bg-white px-10 py-8">

      <div className="flex min-h-[260mm] flex-col">

        {/* ヘッダー */}
        <div className="mb-6 flex items-start justify-between text-sm text-slate-500">
          <div>{page} / {total}　Naily AiDOL</div>
          <div>NR-2026-04</div>
        </div>

        {/* 本文 */}
        <div className="flex-1">
          {children}
        </div>

        {/* フッター */}
        <div className="mt-8 border-t pt-3 text-center text-xs text-slate-400">
          page {page} / {total}
        </div>

      </div>
    </div>
  );
}