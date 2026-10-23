# 予約確定メールの安全化（2026-10-23）

## 今回の納品単位

既存の `POST /api/send-reservation-confirmed-email` を、予約確定後のメール通知を安全に再試行できるAPIとして整理した。

- owner / staff 認証とサロンコンテキストを必須化
- 予約・顧客・担当スタッフを認証済みサロンへ限定
- 確定済み予約だけ送信可能
- 顧客・サロン情報を確認できない場合は送信せず停止
- 送信直前に予約を再取得し、日時・担当・状態などが変化していたら停止
- メールHTMLへ差し込む顧客名・サロン名・メニュー名・担当名をエスケープ
- 予約IDとメール内容から安定したResend idempotency keyを生成
- 応答喪失または一時的なResendエラーは、同じ予約内容なら24時間以内に安全に再試行できる旨を返す
- 顧客メール未登録時はResendクライアントを作らず送信をスキップ

## 変更していないもの

- Aily Supabaseのschema、RLS、権限、migration
- Vercel環境変数とResend設定
- 予約確定画面からこのメールAPIを呼ぶタイミング
- 予約確定LINEの既存送信台帳
- 実顧客へのメール送信
- main / production

LINE専用の `reservation_confirmation_deliveries` は、LINE再送キーとLINE本文を保持するためメールに流用していない。

## 検証

- `node --test tests/reservation-confirmation-email.test.mjs tests/notification-api-auth.test.mjs`
- `tsc --noEmit`
- 変更ファイルのESLint
- 全回帰テスト、全体lint、fixture環境でのNext.js production build

限定テストでは、入力不正、認証前の特権処理防止、サロン境界、確定状態、関連行の読取失敗、メール未登録、送信直前の予約変更、HTML無害化、安定した冪等キー、応答喪失、一時障害と恒久エラーの再試行判定を確認する。

## 検証限界と受入条件

- Resendの冪等キー保持期間は24時間であり、永続的な送信台帳ではない。
- 実DBの予約・顧客・スタッフ・サロン行では未確認。
- 実Resend送信、受信メール表示、迷惑メール判定は未確認。
- 現場試用では、許可されたテスト予約とテスト用メールアドレスを用い、確定済み予約の内容が受信メールへ一致すること、同内容の再試行が重複しないこと、予約変更後の古い内容が送信されないことを確認する。
