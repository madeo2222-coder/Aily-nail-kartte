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
      "HPB・ミニモ同期や、外部予約枠、外部サービスとの接続設定を管理します。",
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
        badge: "設定",
      },
    ],
  },
  {
    title: "顧客・受付管理",
    description:
      "顧客カルテ、初回来店情報、重複顧客、休眠顧客などを管理します。",
    tools: [
      {
        title: "顧客ページ",
        description:
          "顧客情報、アレルギー、来店履歴、写真、次回提案などを確認します。",
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
          "重複して作成された顧客カルテを、予約・来店・売上履歴ごと統合します。",
        href: "/customers/merge",
        badge: "重複整理",
      },
      {
        title: "初回情報クイック確認",
        description:
          "名前や電話番号で、初回来店時に入力された情報をすぐ確認します。",
        href: "/intake-lookup",
        badge: "最優先",
      },
      {
        title: "初回来店入力一覧",
        description:
          "お客様スマホから送信された初回受付情報を一覧で確認します。",
        href: "/customer-intake/list",
        badge: "受付確認",
      },
      {
        title: "お客様入力ページ",
        description:
          "お客様本人がスマホから初回情報を入力するページです。",
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
          "口コミ依頼や予約案内など、LINE送信履歴を確認します。",
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
        title: "来店ページ",
        description:
          "登録済みの来店履歴を一覧で確認します。",
        href: "/visits",
        badge: "履歴",
      },
      {
        title: "来店登録",
        description:
          "施術内容、次回提案、写真、来店情報などを登録します。",
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
    title: "売上・会計",
    description:
      "売上、入金、未収金、月次締め、税理士連携などを管理します。",
    tools: [
      {
        title: "売上ダッシュボード",
        description:
          "売上状況や集計をダッシュボード形式で確認します。",
        href: "/sales-dashboard",
        badge: "売上",
      },
      {
        title: "売上登録",
        description:
          "施術売上や商品売上を登録・確認します。",
        href: "/sales",
        badge: "登録",
      },
      {
        title: "入金管理",
        description:
          "売上に対する入金状況を登録・確認します。",
        href: "/sales-payments",
        badge: "入金",
      },
      {
        title: "未入金一覧",
        description:
          "未払い・未入金の売上を一覧で確認します。",
        href: "/sales-payments/unpaid",
        badge: "未入金",
      },
      {
        title: "未収金管理",
        description:
          "回収前の売上や未収金を確認します。",
        href: "/receivables",
        badge: "未収金",
      },
      {
        title: "入金リマインド",
        description:
          "未入金案件の確認や督促対象を管理します。",
        href: "/reminders",
        badge: "督促",
      },
      {
        title: "月次締め",
        description:
          "月単位の売上・入金・経費を締めて確認します。",
        href: "/monthly-closing",
        badge: "月次",
      },
      {
        title: "経費管理",
        description:
          "経費の登録、一覧、領収書確認などを行います。",
        href: "/expenses",
        badge: "経費",
      },
      {
        title: "資金管理",
        description:
          "店舗の資金状況や会計関連情報を確認します。",
        href: "/finance",
        badge: "資金",
      },
      {
        title: "税理士ページ",
        description:
          "税理士共有用の集計や確認ページへ移動します。",
        href: "/tax",
        badge: "税理士",
      },
    ],
  },
  {
    title: "分析・レポート",
    description:
      "売上、顧客、予約、KPIなどの集計を確認します。",
    tools: [
      {
        title: "分析ページ",
        description:
          "店舗全体のデータ分析や傾向を確認します。",
        href: "/analytics",
        badge: "分析",
      },
      {
        title: "失客分析",
        description:
          "来店が途絶えた顧客や失客傾向を分析します。",
        href: "/analytics/lost-customers",
        badge: "失客分析",
      },
      {
        title: "日次レポート",
        description:
          "日ごとの売上・来店・予約状況を確認します。",
        href: "/reports/daily",
        badge: "日次",
      },
      {
        title: "月次レポート",
        description:
          "月ごとの売上・来店・予約状況を確認します。",
        href: "/reports/monthly",
        badge: "月次",
      },
      {
        title: "KPIレポート",
        description:
          "再来率、客単価、来店数など主要指標を確認します。",
        href: "/reports/kpi",
        badge: "KPI",
      },
      {
        title: "顧客レポート",
        description:
          "顧客別の利用状況や来店傾向を確認します。",
        href: "/reports/customers",
        badge: "顧客分析",
      },
    ],
  },
  {
    title: "ネイルチップ・注文",
    description:
      "ネイルチップの注文、見積、制作、発送、入金を管理します。",
    tools: [
      {
        title: "ネイルチップ注文一覧",
        description:
          "ネイルチップ注文の一覧、進捗、支払い、発送状況を確認します。",
        href: "/nail-tip-orders",
        badge: "注文管理",
      },
      {
        title: "ネイルチップ依頼一覧",
        description:
          "お客様から届いたネイルチップ依頼を確認し、見積や制作対応を行います。",
        href: "/inbound-nail-tip-requests",
        badge: "依頼受付",
      },
    ],
  },
  {
    title: "店舗・スタッフ設定",
    description:
      "店舗情報、口コミURL、スタッフ、権限などを管理します。",
    tools: [
      {
        title: "店舗設定",
        description:
          "店舗名、Google口コミ、Instagram、HPB、ミニモ、LINEのURLを設定します。",
        href: "/settings/salon",
        badge: "店舗設定",
      },
      {
        title: "スタッフページ",
        description:
          "スタッフ向けの通常業務ページへ移動します。",
        href: "/staff",
        badge: "スタッフ",
      },
      {
        title: "スタッフ管理",
        description:
          "スタッフ情報や登録内容を管理します。",
        href: "/staff/manage",
        badge: "管理者",
      },
      {
        title: "オーナーダッシュボード",
        description:
          "オーナー向けの経営状況や管理情報を確認します。",
        href: "/owner-dashboard",
        badge: "オーナー",
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
            管理・便利ツール
          </h1>

          <p className="mt-2 text-sm leading-6 text-white/90">
            普段の下部メニューに表示していない管理ページや、設定・分析ページをまとめています。
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/staff"
              className="rounded-2xl border border-white/40 bg-white/80 px-4 py-3 text-sm font-bold text-rose-600 backdrop-blur"
            >
              スタッフページへ
            </Link>

            <Link
              href="/dashboard"
              className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-rose-500 shadow"
            >
              ホームへ
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