import Link from "next/link";

export const dynamic = "force-dynamic";

type ConnectionStatus = {
  name: string;
  status: string;
  statusColor: string;
  apiStatus: string;
  lastSync: string;
  memo: string;
  nextAction: string;
};

const connections: ConnectionStatus[] = [
  {
    name: "ホットペッパー / SALON BOARD",
    status: "手動ブロック運用中",
    statusColor: "bg-orange-100 text-orange-700 border-orange-200",
    apiStatus: "公式API連携可否の確認待ち",
    lastSync: "未設定",
    memo: "現在はHPBで入った予約を、Naily AiDOLの外部予約ブロックとして登録して運用中です。",
    nextAction: "リクルート側または既存連携サービスに、SALON BOARD連携可否を確認する",
  },
  {
    name: "ミニモ",
    status: "手動ブロック運用中",
    statusColor: "bg-purple-100 text-purple-700 border-purple-200",
    apiStatus: "外部予約システム連携の申請確認待ち",
    lastSync: "未設定",
    memo: "現在はミニモで入った予約を、Naily AiDOLの外部予約ブロックとして登録して運用中です。",
    nextAction: "ミニモのサロンツール・外部予約システム連携の申請条件を確認する",
  },
  {
    name: "電話予約 / Instagram / LINE",
    status: "手動登録中",
    statusColor: "bg-pink-100 text-pink-700 border-pink-200",
    apiStatus: "API連携対象外",
    lastSync: "手動登録",
    memo: "電話・SNS経由の予約は、スタッフが外部予約ブロックまたは通常予約として登録します。",
    nextAction: "予約登録ページのショートカットで運用を統一する",
  },
];

const operationSteps = [
  "HPB・ミニモで予約が入る",
  "Naily AiDOLの予約登録ページで外部予約ブロックを登録",
  "カレンダー上でHPB・ミニモ・休憩・店休日を色分け表示",
  "顧客マイページ予約との重複を防止",
  "将来、APIまたは外部連携が可能になれば自動同期へ移行",
];

export default function ExternalConnectionsPage() {
  return (
    <main className="min-h-screen bg-rose-50/40">
      <div className="mx-auto max-w-4xl space-y-4 p-4 pb-24 sm:p-6">
        <section className="overflow-hidden rounded-[28px] bg-gradient-to-br from-slate-900 via-purple-800 to-rose-500 p-5 text-white shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-bold tracking-[0.25em] text-white/70">
                NAILY AIDOL
              </p>
              <h1 className="mt-2 text-2xl font-bold">外部連携管理</h1>
              <p className="mt-2 text-sm leading-6 text-white/90">
                ホットペッパー・ミニモなどの外部予約との連携状況を管理します。
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/reservations/new"
                className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-purple-700 shadow"
              >
                予約登録へ
              </Link>

              <Link
                href="/reservations/calendar"
                className="rounded-2xl border border-white/40 bg-white/15 px-4 py-3 text-sm font-bold text-white backdrop-blur"
              >
                カレンダーへ
              </Link>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-rose-100 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                現在の運用ステータス
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                現時点では、API自動連携前の安全運用として、外部予約ブロックで重複を防止しています。
              </p>
            </div>

            <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
              手動ブロック運用中
            </div>
          </div>
        </section>

        <section className="grid gap-4">
          {connections.map((connection) => (
            <div
              key={connection.name}
              className="rounded-[28px] border border-rose-100 bg-white p-4 shadow-sm sm:p-6"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    {connection.name}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    {connection.memo}
                  </p>
                </div>

                <div
                  className={`inline-flex w-fit rounded-full border px-4 py-2 text-xs font-bold ${connection.statusColor}`}
                >
                  {connection.status}
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-3xl bg-slate-50 p-4">
                  <div className="text-xs font-bold text-slate-400">
                    API連携
                  </div>
                  <div className="mt-2 text-sm font-bold text-slate-900">
                    {connection.apiStatus}
                  </div>
                </div>

                <div className="rounded-3xl bg-slate-50 p-4">
                  <div className="text-xs font-bold text-slate-400">
                    最終同期
                  </div>
                  <div className="mt-2 text-sm font-bold text-slate-900">
                    {connection.lastSync}
                  </div>
                </div>

                <div className="rounded-3xl bg-slate-50 p-4">
                  <div className="text-xs font-bold text-slate-400">
                    次の対応
                  </div>
                  <div className="mt-2 text-sm font-bold leading-5 text-slate-900">
                    {connection.nextAction}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </section>

        <section className="rounded-[28px] border border-rose-100 bg-white p-4 shadow-sm sm:p-6">
          <h2 className="text-lg font-bold text-slate-900">現在の運用フロー</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            API連携ができるまでは、この流れで現場運用します。
          </p>

          <div className="mt-4 space-y-3">
            {operationSteps.map((step, index) => (
              <div
                key={step}
                className="flex gap-3 rounded-3xl border border-rose-100 bg-rose-50/50 p-4"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-500 text-sm font-bold text-white">
                  {index + 1}
                </div>
                <div className="text-sm font-bold leading-7 text-slate-800">
                  {step}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[28px] border border-amber-100 bg-amber-50 p-4 shadow-sm sm:p-6">
          <h2 className="text-lg font-bold text-amber-900">
            次に確認すること
          </h2>
          <div className="mt-3 space-y-2 text-sm leading-6 text-amber-800">
            <p>・HPB / SALON BOARD が外部APIまたは連携サービス経由で接続可能か確認</p>
            <p>・ミニモの外部予約システム連携の申請条件を確認</p>
            <p>・認証情報やAPIキーが取得できる場合のみ、DB設計と同期処理へ進む</p>
            <p>・取得できない場合は、CSV取込またはメール通知取込を代替案として検討</p>
          </div>
        </section>
      </div>
    </main>
  );
}
