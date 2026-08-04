import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import SetupPasswordForm from "./SetupPasswordForm";

export default async function StaffSetupPasswordPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/staff/auth-error?reason=session_missing");
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-orange-50">
      <div className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-10">
        <section className="w-full overflow-hidden rounded-[30px] border border-rose-100 bg-white shadow-xl shadow-rose-100/40">
          <div className="bg-gradient-to-br from-rose-400 via-pink-400 to-orange-300 p-6 text-white">
            <p className="text-xs font-bold tracking-[0.25em] text-white/80">
              NAILY AIDOL
            </p>
            <h1 className="mt-3 text-2xl font-bold">
              初回パスワード設定
            </h1>
            <p className="mt-2 text-sm leading-6 text-white/90">
              スタッフ個別ログインで使用するパスワードを設定してください。
            </p>
          </div>

          <div className="p-6">
            <SetupPasswordForm />
          </div>
        </section>
      </div>
    </main>
  );
}
