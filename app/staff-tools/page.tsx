"use client";

import Link from "next/link";

type ToolItem = {
  title: string;
  description: string;
  href: string;
  badge: string;
};

type ToolSection = {
  title: string;
  description: string;
  tools: ToolItem[];
};

const toolSections: ToolSection[] = [
  {
    title: "予約・外部連携",
    description:
      "HPB・ミニモの予約同期や、外部予約枠の確認・登録を行います。",
    tools: [
      {
        title: "予約カレンダー",
        description:
          "スタッフ別・時間帯別に予約状況を確認し、必要に応じて予約を同期します。",
        href: "/reservations/calendar",
        badge: "日常運用",
      },
      {
        title: "予約一覧",
        description:
          "予約内容の確認、変更、確定、キャンセル状態の確認に使います。",
        href: "/reservations",
        badge: "予約管理",
      },
      {
        title: "予約同期センター",
        description:
          "GmailからHPB・ミニモの予約メールとキャンセルメールを今すぐ同期します。",
        href: "/hpb-mail-sync-test",
        badge: "外部予約",
      },
      {
        title: "外部予約ブロック",
        description:
          "電話予約や他媒体予約など、外部から入った予約枠を登録・管理します。",
        href: "/external-calendar-blocks",
        badge: "予約枠",
      },
      {
        title: "外部予約タスク",
        description:
          "外部予約に関連する確認作業や未処理タスクを確認します。",
        href: "/external-calendar-tasks",
        badge: "確認",
      },
      {
        title: "外部連携設定",
        description:
          "Gmailなど、予約同期に使用する外部サービスの接続状況を確認します。",
        href: "/settings/external-connections",
        badge: "連携",
      },
    ],
  },
  {
    title: "顧客・受付管理",
    description:
      "顧客カルテ、初回受付情報、重複カルテなどを確認・整理します。",
    tools: [
      {
        title: "顧客ページ",
        description:
          "顧客情報、初回カウンセリング、来店履歴、写真、次回提案を確認します。",
        href: "/customers",
        badge: "顧客管理",
      },
      {
        title: "顧客を追加",
        description:
          "新しい顧客を登録します。同名・同一電話番号の重複確認も行います。",
        href: "/customers/new",
        badge: "新規登録",
      },
      {
        title: "顧客統合",
        description:
          "重複して作成された顧客カルテを、予約・来店履歴ごと統合します。",
        href: "/customers/merge",
        badge: "重複整理",
      },
      {
        title: "初回来店入力一覧",
        description:
          "お客様がスマホから入力した初回受付情報と顧客への紐付けを確認します。",
        href: "/customer-intake/list",
        badge: "受付確認",
      },
      {
        title: "お客様入力ページ",
        description:
          "初回来店のお客様がスマホからカウンセリング情報を入力するページです。",
        href: "/customer-intake",
        badge: "お客様用",
      },
      {
        title: "休眠顧客",
        description:
          "一定期間来店がない顧客を確認し、再来店フォローに使います。",
        href: "/customers/inactive",
        badge: "再来促進",
      },
      {
        title: "失客顧客",
        description:
          "長期間来店がない顧客を確認し、失客状況を把握します。",
        href: "/lost-customers",
        badge: "失客管理",
      },
      {
        title: "無断キャンセル",
        description:
          "無断キャンセルや来店なしの顧客・予約を確認します。",
        href: "/no-show",
        badge: "注意管理",
      },
      {
        title: "LINEフォローログ",
        description:
          "口コミ依頼や予約案内など、顧客へのLINE送信履歴を確認します。",
        href: "/line-follow-logs",
        badge: "LINE",
      },
    ],
  },
  {
    title: "来店・施術記録",
    description:
      "来店履歴、施術記録、写真登録など、現場で使うページです。",
    tools: [
      {
        title: "来店一覧",
        description:
          "登録済みの来店履歴や施術内容を一覧で確認します。",
        href: "/visits",
        badge: "履歴",
      },
      {
        title: "来店登録",
        description:
          "施術内容、売上、次回提案、施術後写真をまとめて登録します。",
        href: "/visits/new",
        badge: "入力",
      },
      {
        title: "来店予定",
        description:
          "今後の来店予定や次回来店情報を確認します。",
        href: "/visits/upcoming",
        badge: "予定",
      },
    ],
  },
  {
    title: "ネイルチップ・通販",
    description:
      "ネイルチップの注文、見積、制作、発送、入金状況を確認します。",
    tools: [
      {
        title: "ネイルチップ注文一覧",
        description:
          "ネイルチップ注文の内容、制作、支払い、発送状況を確認します。",
        href: "/nail-tip-orders",
        badge: "注文管理",
      },
      {
        title: "インバウンド依頼一覧",
        description:
          "海外・インバウンドから届いたネイルチップ依頼を確認します。",
        href: "/inbound-nail-tip-requests",
        badge: "海外受付",
      },
    ],
  },
  {
    title: "スタッフ業務",
    description:
      "日常業務で使用するスタッフ向けページへ移動します。",
    tools: [
      {
        title: "スタッフホーム",
        description:
          "今日の予約、売上、来店予定を確認する通常のスタッフ画面です。",
        href: "/dashboard",
        badge: "ホーム",
      },
      {
        title: "スタッフ入口",
        description:
          "予約確認、顧客確認、来店登録などのショートカットを開きます。",
        href: "/staff",
        badge: "入口",
      },
    ],
  },
];

export default function StaffToolsPage() {
  return (
    <main className="min-h-screen bg-rose-50/40">
      <div className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:px-6 sm:py-10">
        <section className="mb-6 overflow-hidden rounded-[28px] bg-gradient-to-br from-rose-400 via-pink-400 to-orange-300 p-5 text-white shadow-sm">
          <p className="text-xs font-bold tracking-[0.25em] text-white/80">
            NAILY AIDOL
          </p>

          <h1 className="mt-2 text-2xl font-bold">
            スタッフ用 管理・便利ツール
          </h1>

          <p className="mt-2 text-sm leading-6 text-white/90">
            予約同期、顧客整理、来店記録、ネイルチップなど、現場で使う補助機能をまとめています。
          </p>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Link
              href="/dashboard"
              className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-white px-3 py-3 text-center text-sm font-bold text-rose-500 shadow"
            >
              スタッフホーム
            </Link>

            <Link
              href="/reservations/calendar"
              className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/40 bg-white/80 px-3 py-3 text-center text-sm font-bold text-rose-600 backdrop-blur"
            >
              予約カレンダー
            </Link>
          </div>
        </section>

        <div className="space-y-6">
          {toolSections.map((section) => (
            <section
              key={section.title}
              className="rounded-[28px] border border-rose-100 bg-white p-4 shadow-sm sm:p-5"
            >
              <div className="mb-4">
                <h2 className="text-xl font-bold text-slate-900">
                  {section.title}
                </h2>

                <p className="mt-1 text-sm leading-6 text-slate-500">
                  {section.description}
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {section.tools.map((tool) => (
                  <Link
                    key={tool.href}
                    href={tool.href}
                    className="group rounded-[24px] border border-rose-100 bg-rose-50/30 p-4 transition hover:-translate-y-0.5 hover:bg-rose-50"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-rose-700 shadow-sm">
                        {tool.badge}
                      </span>

                      <span className="text-sm text-slate-400 transition group-hover:text-rose-500">
                        →
                      </span>
                    </div>

                    <h3 className="mt-4 text-base font-bold text-slate-900">
                      {tool.title}
                    </h3>

                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {tool.description}
                    </p>

                    <div className="mt-4 inline-flex rounded-2xl bg-white px-4 py-2 text-sm font-bold text-rose-700 shadow-sm">
                      開く
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}