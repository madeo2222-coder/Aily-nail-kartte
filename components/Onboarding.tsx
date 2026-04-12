"use client";

export default function Onboarding({
  onClose,
}: {
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 overflow-y-auto overscroll-contain">
      <div className="min-h-full p-4 sm:flex sm:items-center sm:justify-center">
        <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-xl my-6 sm:my-8">
          <div className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-bold tracking-wide text-slate-700">
            Naily AiDOL
          </div>

          <h2 className="mt-4 text-2xl font-bold text-slate-900">
            今月の利益と課題が、すぐわかる。
          </h2>

          <p className="mt-3 text-sm leading-7 text-slate-600">
            Naily AiDOL は、サロンの売上・経費・粗利を自動で整理し、
            オーナーがすぐ判断できる形で見える化する経営ダッシュボードです。
          </p>

          <div className="mt-5 grid grid-cols-1 gap-3">
            <div className="rounded-2xl border bg-slate-50 p-4">
              <div className="text-sm font-bold text-slate-900">
                売上・経費・粗利を自動で整理
              </div>
              <div className="mt-1 text-sm leading-6 text-slate-600">
                今月の数字を、感覚ではなく数字で確認できます。
              </div>
            </div>

            <div className="rounded-2xl border bg-slate-50 p-4">
              <div className="text-sm font-bold text-slate-900">
                前月比で変化を見える化
              </div>
              <div className="mt-1 text-sm leading-6 text-slate-600">
                売上・経費・粗利の増減から、今どこを見直すべきかが分かります。
              </div>
            </div>

            <div className="rounded-2xl border bg-slate-50 p-4">
              <div className="text-sm font-bold text-slate-900">
                月次レポートをそのまま保存・共有
              </div>
              <div className="mt-1 text-sm leading-6 text-slate-600">
                PDFで確認できるので、自分用にも共有用にも使えます。
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-2xl bg-blue-50 p-4">
            <div className="text-sm font-bold text-blue-900">最初に見るポイント</div>
            <div className="mt-2 space-y-1 text-sm leading-6 text-blue-900">
              <div>・今月の利益が残っているか</div>
              <div>・前月より悪化していないか</div>
              <div>・経費の偏りが大きくないか</div>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl bg-black py-3 text-sm font-bold text-white sm:w-auto sm:px-6"
            >
              ダッシュボードを見る
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}