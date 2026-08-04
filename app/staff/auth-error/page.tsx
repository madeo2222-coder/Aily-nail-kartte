type AuthErrorReason =
  | "invalid_or_expired"
  | "session_missing"
  | "unknown";

type StaffAuthErrorPageProps = {
  searchParams: Promise<{
    reason?: string | string[];
  }>;
};

function resolveReason(value: string | string[] | undefined): AuthErrorReason {
  if (value === "invalid_or_expired") return "invalid_or_expired";
  if (value === "session_missing") return "session_missing";
  return "unknown";
}

const messages: Record<
  AuthErrorReason,
  { title: string; description: string }
> = {
  invalid_or_expired: {
    title: "招待リンクを確認できませんでした",
    description:
      "招待リンクが無効、期限切れ、またはすでに使用済みである可能性があります。管理者へ招待メールの再送を依頼してください。",
  },
  session_missing: {
    title: "認証セッションを確認できませんでした",
    description:
      "招待メールのリンクを、最初に開いたものと同じブラウザでもう一度開いてください。解決しない場合は管理者へ連絡してください。",
  },
  unknown: {
    title: "認証処理を完了できませんでした",
    description:
      "認証処理を完了できませんでした。時間をおいて再度お試しいただくか、管理者へ連絡してください。",
  },
};

export default async function StaffAuthErrorPage({
  searchParams,
}: StaffAuthErrorPageProps) {
  const params = await searchParams;
  const message = messages[resolveReason(params.reason)];

  return (
    <main className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-orange-50">
      <div className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-10">
        <section className="w-full overflow-hidden rounded-[30px] border border-rose-100 bg-white shadow-xl shadow-rose-100/40">
          <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-6 text-white">
            <p className="text-xs font-bold tracking-[0.25em] text-white/70">
              NAILY AIDOL
            </p>
            <h1 className="mt-3 text-2xl font-bold">{message.title}</h1>
          </div>

          <div className="p-6">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-7 text-amber-900">
              {message.description}
            </div>
            <p className="mt-4 text-xs leading-5 text-slate-500">
              この画面には認証情報や招待コードは表示されません。
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
