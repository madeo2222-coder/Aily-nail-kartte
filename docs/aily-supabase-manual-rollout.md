# Aily：予約フローDBの確認・手動適用

この手順は `madeo2222-coder/Aily-nail-kartte` 専用です。Supabaseはオーナーが手動管理します。コネクタ接続は必要条件にしません。

## 今、実行できる確認

1. Supabase Dashboardで **Ailyのプロジェクト**を選びます。VercelのAilyに設定済みのSupabase URLに含まれるプロジェクトIDと照合してください。値や鍵をチャットに貼る必要はありません。他事業のプロジェクトでは実行しません。
2. SQL EditorでNew Queryを開き、次の2ファイルを別々のQueryとして順にRunします。どちらも読取専用で、テーブル定義・権限・関数の状態だけを確認します。顧客情報を読み出したりLINEを送ったりしません。
   - `scripts/sql/aily-alternative-request-preflight.sql`
   - `scripts/sql/aily-confirmation-delivery-preflight.sql`
3. 結果の `section / check_name / result / detail` を保存してください。

SQL Editorから2つの結果をそれぞれCSVまたはJSONで保存した場合は、次の読取専用コマンドで4件のmigrationを個別判定できます。結果が一部欠けている、`FAIL` / `REVIEW`がある、または依存順序と矛盾する場合は適用候補を出さず停止します。このコマンドはSupabaseへ接続せず、DB変更も行いません。

```bash
node scripts/analyze-aily-preflight.mjs \
  --alternative alternative-preflight.csv \
  --confirmation confirmation-preflight.csv
```

出力が`MISSING`の連続したmigrationだけを依存順の適用候補として扱います。`PRESENT`は再実行しません。`要確認`になった場合は既存オブジェクトを変更せず、表示された検査名を個別に照合します。

前提条件は別日時側33項目、確定通知側16項目の**検査名がすべて揃うこと**を確認します。1行でも欠ければ、残りがPASSでも適用候補は出しません。表示された不足は「結果ファイルにない」という意味であり、実DBのオブジェクトがないとは判定しません。まず既に受領した原本から欠けた行を回収し、同じSQLの再実行や再提出を一律に依頼しないでください。

| 結果 | 次の工程 |
| --- | --- |
| prerequisiteがすべてPASS、ledgerとfunctionがすべてMISSING | 新規migration適用候補。承認後に適用します。 |
| prerequisiteがすべてPASS、ledgerのtableがPRESENT、ほかがすべてPASS | 今回確認した定義・権限は一致。migrationを再実行せず、画面・API検証に進みます。 |
| 一部だけMISSING、REVIEW、FAIL | 結果を照合して個別修正を用意します。既存オブジェクトを削除・上書きしません。 |

この検査は適用履歴の証明や全スキーマの一致を保証するものではありません。確認対象は必須の元テーブル列・参照キー、台帳の存在・RLS・テーブル/列権限、通知RPC本文・`SECURITY INVOKER`・固定`search_path`・実行権限です。Aily実DBの適用状況は、結果が届くまで「未確認」と扱います。

## 承認後の新規適用

適用候補は次の順序です。読取確認で既に存在すると判明した対象は再実行しません。既存予約・顧客の一括更新はありません。

1. `supabase/migrations/20261003120111_reservation_alternative_requests.sql`
2. `supabase/migrations/20261004030707_prevent_customer_reservation_races.sql`
3. `supabase/migrations/20261004055916_prevent_staff_confirmation_races.sql`
4. `supabase/migrations/20261004070432_reservation_confirmation_deliveries.sql`

最後のmigrationは、予約確定LINEの送信状態と同じ再試行キーを保持する台帳・2つのRPCを追加します。送信失敗後の安全な再試行と、送信済み通知の重複防止に使います。

本番DB migrationの承認は、通常の開発承認とは別です。初回確認が新規適用候補になった場合に、実行対象・影響・検証結果を提示して承認を得てください。

1. 対象プロジェクトとバックアップ・復元手段を確認します。
2. 上記migration全体を新しいSQL Editorクエリで実行します。既存テーブルや関数がある場合はこの新規作成SQLを実行しません。`IF NOT EXISTS`や`CREATE OR REPLACE`に書き換えて差異を隠さないでください。
3. 読取確認SQLを再実行します。ledgerのtableがPRESENT、それ以外がすべてPASSであることを確認します。
4. SQL Editorでの実行とSupabase CLIのmigration履歴は別管理です。実行日時・対象プロジェクト・結果を記録し、将来CLIで同じmigrationを二重適用しないよう、履歴の扱いを確認します。

## 動作検証

ダミー環境のローカルbuildやPreview READYだけでは実DBの成功を確認できません。オーナーが用意したテスト顧客・テスト予約で、送信範囲を承認してから確認します。

- 申請中の予約から別日時入力の通知を実行し、テストLINEに届くこと。
- 通知を再操作しても同一依頼が二重に届かないこと。
- 予約確定LINEを送信済みの状態で「確定LINEを再試行」を押しても二重に届かないこと。
- 予約確定LINEの一時的な送信失敗後、同じ再試行キーで再試行できること。
- URLからLINE本人認証を経て対象予約へ戻れ、別顧客の予約を変更できないこと。
- 希望日時を更新すると申請中として保存され、重複枠は拒否されること。
- 送信失敗の表示・再試行はローカルのLINE応答モックで検証します。実環境のtoken・secretを故意に変更して失敗を起こしません。

## 戻し方

- 適用中にSQLエラーになった場合、migrationはBEGIN/COMMITで囲まれています。ROLLBACKしてから読取SQLで状態を確認します。途中まで適用されたと決めつけず確認します。
- 適用後に機能を止める場合は、先に対応するアプリ変更を元の検証済み版に戻します。Vercelでの本番変更は別途承認が必要です。
- 台帳に送信履歴が残った後は削除しません。削除すると同じLINEの再送防止情報を失います。DBを戻す必要がある場合は、台帳と関数を保持したまま停止・復旧案を作ります。

参考：[Supabase SQL Editorと関数](https://supabase.com/docs/guides/database/functions)、[PostgreSQL権限検査関数](https://www.postgresql.org/docs/current/functions-info.html)。

## 開発側のローカルSQL検証

`scripts/verify-alternative-request-sql.mjs` と `scripts/verify-staff-reservation-confirmation-sql.mjs` はPGlite 0.5.8のメモリ内PostgreSQLを使い、実際のmigration・確認SQL・RPCを実行します。Ailyの実DBには接続しません。権限不足、予約競合、古い更新、送信失敗後の同一キー再試行、送信済み通知の重複防止を検証します。SupabaseのData API・RLS設定全体や実LINE送信の検証とは区別します。

PGliteはアプリの依存関係に追加せず、任意の一時フォルダへ `@electric-sql/pglite@0.5.8` をインストールしてください。`AILY_PGLITE_MODULE` にその `dist/index.js` の絶対パスを指定して `node scripts/verify-alternative-request-sql.mjs` を実行できます。

## 2026-10-21 前提条件の部分結果による誤判定を修正

- 利用者・目的: DB導入を案内する担当者が、欠けた確認結果から適用候補を出さないようにする。
- 範囲: `analyze-aily-preflight.mjs` のオフライン判定。SQL・migration・実DB・アプリ画面は変更しない。保存済み `52a70de53a5389ef0766ef588e7441eee6ee22e0` の必須権限修正を維持する。
- 受入条件: 上記コマンドへ不完全なCSV/JSONを渡した場合、要確認と不足項目を表示し、適用候補を出さない。完全な結果では従来の依存順判定を維持する。
- 回帰: 修正前は両結果の前提条件がreservations.idのPASSだけでも全4件を適用候補にした。修正後は拒否。49項目の各1行欠落を、migration全件PRESENT/全件MISSINGの双方で検査する。期待項目は実際の2本の読取SQLのPGlite出力と照合する。
- 検証結果: 関連9件、全回帰682件成功（失敗0・skip0、PGlite 0.5.10を外部検証フォルダに使用）。全lint・独立型検査・diff check・fixture設定のNext webpack build（93ページ生成、最終trace、exit 0）成功。依存lockfileと本番設定は変更なし。
- 残件: 実DBの未確認migration/権限、許可されたテスト予約の保存→再表示・通知の実接続受入、本番公開承認。オフライン検査成功は実DBの導入成功を意味しない。
- 予定: 判定修正は保存後に利用でき、デプロイ不要。アプリ側の保存済み修正と合わせる次回統合Previewは2026-10-21 08:05:12.408 JST以降が候補（直前に全環境の最終試行を再確認）。現場受入・本番日は実接続確認と承認待ちのため未確定。
- 本人操作: 今回の判定修正のために新たな操作は不要。既受領の表権限/RLS/スタッフ集計は再利用する。実DBの手動作業が必要な時だけ、未確認項目の読取SQLを一つずつ具体化する。
