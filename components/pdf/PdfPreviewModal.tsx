"use client";

import { useMemo, useState } from "react";

export default function PdfPreviewModal({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const isMobile =
    typeof window !== "undefined" ? window.innerWidth < 768 : false;

  const previewScaleClass = useMemo(() => {
    return isMobile ? "scale-[0.62] origin-top" : "scale-100 origin-top";
  }, [isMobile]);

  function handlePrint() {
    window.print();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-black px-4 py-2 text-sm font-bold text-white shadow hover:bg-black/90"
      >
        PDFプレビュー
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/50 p-2 sm:p-4 print:bg-white print:p-0">
          <style jsx global>{`
            @media print {
              body * {
                visibility: hidden !important;
              }

              .print-modal-root,
              .print-modal-root * {
                visibility: visible !important;
              }

              .print-modal-root {
                position: static !important;
                inset: auto !important;
                width: 100% !important;
                max-width: none !important;
                margin: 0 !important;
                padding: 0 !important;
                background: white !important;
                box-shadow: none !important;
                border-radius: 0 !important;
                overflow: visible !important;
              }

              .print-modal-header {
                display: none !important;
              }

              .print-modal-content {
                padding: 0 !important;
                overflow: visible !important;
                max-height: none !important;
              }

              .preview-scale-wrap {
                transform: none !important;
                width: 100% !important;
              }

              @page {
                size: A4 portrait;
                margin: 10mm;
              }
            }
          `}</style>

          <div className="flex min-h-full items-start justify-center overflow-auto print:block">
            <div className="print-modal-root w-full max-w-[98vw] overflow-hidden rounded-2xl bg-white shadow-2xl sm:max-w-6xl">
              <div className="print-modal-header flex items-start justify-between gap-3 border-b p-4">
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-slate-900">PDFプレビュー</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    内容確認用です。iPhoneでは印刷プレビューが見えにくい場合があります。
                  </p>
                  <p className="text-sm text-slate-500">
                    PDF保存や印刷はPCブラウザの方が安定します。
                  </p>
                </div>

                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={handlePrint}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800"
                  >
                    印刷 / PDF保存
                  </button>

                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-lg border px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                  >
                    閉じる
                  </button>
                </div>
              </div>

              <div className="print-modal-content max-h-[85vh] overflow-auto bg-slate-100 p-3 sm:p-6 print:max-h-none print:overflow-visible print:bg-white print:p-0">
                <div
                  className={`preview-scale-wrap mx-auto w-[210mm] ${previewScaleClass} print:w-full`}
                >
                  {children}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}