# 通販・店舗予約の同時リリースに向けた実装記録（2026-10-18 JST）

## 確認した基点

- 対象: `madeo2222-coder/Aily-nail-kartte`。
- 本番 `main`: `459b1dde236c38fe06d642993960640f6304fa79`。
- 開発統合ブランチ `dev/preview-batch-20260927`: `746744e4c100e3ff19ad0c8e4e55fd569c60a669`。
- 本作業は開発統合ブランチを基に本番 main を取り込んだ独立ブランチで実施。他の作業ディレクトリは変更していない。
- 日別売上コンポーネントは本番版と開発統合版で同一。統合時は既存の開発版ダッシュボードの読取エラー対策を維持した。
- 確認済み最新本番 deployment: `dpl_DuEEbbseojHuqEv533d73abWcNPt`、SHA `459b1dd...`、READY。
- 作成時刻: 2026-10-18 06:53:08.877 JST。既存の Aily 全体の6時間間隔を維持する場合、次のビルドを誘発する操作は最短12:53:08.877 JST以降。他の試行があれば再計算する。

## 今回実装したこと

### 決済結果の確定と再試行

- 国内・インバウンドのカード決済で、通信切断、結果不明、注文ID不一致、未知の応答、決済結果のDB保存失敗を成功・確定失敗として扱わない。
- 不確定な決済は `pending` / `processing` の排他状態を維持し、同じ注文への新規決済開始を止める。
- 注文ID等が一致した、明示的なカード拒否応答だけを再試行可能な `failed` とする。不明なコードは保留する。
- ブラウザ側も送信を同期的にロックし、応答喪失や結果確認中では再送しない。再読込後の重複は既存DBの排他処理で止める。
- カード情報のDB保存や本番決済の有効化は行っていない。既存の `VERITRANS_DUMMY === '1'` 制限を維持。
- 保留を解消する DGFT Search / 管理画面照合・運用手順は残件。

### 注文の制作・発送

- 汎用ステータス変更から決済状態を書き換えない。決済完了をサーバーで確認できる注文だけ制作・発送・完了へ進める。
- 発送は配送情報登録の経路を使う。完了には発送済み状態を必要とする。
- 認証済みスタッフのサロン範囲を検査し、読取後に別操作で状態が変わった場合は409を返す。
- 発送通知は注文IDをLINE再送キーとして固定し、応答喪失時の再試行で重複送信を防ぐ。配送情報が一致する発送済み注文だけ24時間以内の再試行を許可する。
- 返金・キャンセル後の決済精算、発送通知結果をDB台帳へ永続記録する運用は未完成。

### 注文相談の保存・再表示

- 注文相談の作成先を、署名済みLINE顧客と安全に解決できた店舗から決める。ブラウザから顧客ID・店舗IDを指定させない。
- 送信中・応答喪失・受付済みを区別し、結果不明時は再送を止めてマイページの履歴確認へ案内する。
- マイページの注文履歴は匿名ブラウザからDBを直接読む経路を使わず、署名済みLINEセッションで顧客IDを固定する専用APIから再表示する。
- DB制約による注文作成の完全な冪等性は未完成。現在の画面ガードを越える別端末・別セッション間の重複防止は残件。

### 予約の空き枠

- DBの日時表記が `Z`、`+00:00`、`+09:00` で異なっても同じ瞬間として重複判定する。
- 当日の経過済み時刻、不正な日付、壊れた予約時間区間を空き枠として案内しない。
- 日付加算をホストOSのタイムゾーンや夏時間に依存させない。
- 既存の予約作成・確定・別日時提案・通知台帳とDBの排他処理を再利用する。

### 診断履歴

- 保存先顧客・サロンは検証済みLINEセッションから決める。
- 保存入力の型、長さ、実在する生年月日、診断種別を検査する。
- 未ログインでも無料診断は利用できる。履歴保存にはLINEログインが必要であることを表示する。
- PNG保存の既存実装は維持。iPhone実機での保存動作は今回未検証。

## 検証結果

| 検証 | 実施結果 | 範囲・限界 |
| --- | --- | --- |
| `node --test tests/*.test.mjs` | 522件成功、失敗0、任意PGlite検査1件スキップ | 署名済み注文履歴API、送信ガード、発送通知再試行、ルート・画面ハンドラー・既存業務機能のローカル検証 |
| TypeScript・変更TS/TSXのESLint・差分検査 | 成功 | 本番DB接続の成功を意味しない |
| `next build --webpack` | 完了 | ダミー設定のみ。初回は既定のNodeヒープ上限で中断、6GiB指定で再実行して静的生成・最適化・ルート一覧まで完了 |
| `verify-payment-pending-sql.mjs` | 成功 | PGlite上で既存決済migrationを実行。保留中の再課金防止、成功の冪等性、匿名実行拒否を検証 |
| `verify-customer-reservation-write-sql.mjs` | 成功 | PGlite上の予約競合・原子性等。Aily実DBの適用状況は未確認 |
| `verify-staff-reservation-confirmation-sql.mjs` | 成功 | PGlite上の確定・権限・競合・通知再試行等 |
| 実加盟店のカード・PayPay | 未実施 | 実課金、加盟店設定変更、返金は実行していない |
| 本番のテスト注文・予約・LINE通知 | 未実施 | 管理接続・認証・DBアクセス制御・適用migrationの確認が必要 |
| iPhone・Android実機 | 未実施 | 画面ハンドラーの自動テストと実機検証を区別する |

PGliteは検証用の一時環境にのみ導入した。アプリの依存関係は変更していない。ローカルSQL検証は `AILY_PGLITE_MODULE` に検証環境のPGliteエントリを指定して実行する。

## リリース判定と不足機能

**通販・予約の同時リリースは未完了。本変更の本番反映も未実施。**

| 項目 | 確認できた実装 | 完了までの残件 |
| --- | --- | --- |
| 認証・顧客情報保護 | 開発版に署名付きLINEセッション、所有者確認等 | 本番DB管理接続の復旧、アクセス制御の是正と顧客間・サロン間の実接続検証を最優先。詳細な運用検証結果は公開リポジトリへ掲載しない |
| ネイルチップ注文 | 見積依頼、スタッフ金額設定、カード決済リンク、注文履歴 | 商品・サイズ・オプションの確定価格、送料、構造化配送先、注文登録の冪等性、購入確認までの接続 |
| クレジットカード | DGFT/VeriTransのダミー決済に限定した処理 | Ailyへの加盟店適用条件、実環境分離、3Dセキュア等の契約方式、照会・通知・返金の仕様確認と実装・結合試験 |
| PayPay | 利用方針は確認済み | 決済開始・結果照会・結果通知・返金の接続実装と結合試験 |
| 注文管理 | 制作・発送の決済ガードを今回修正 | 実注文の保存→再表示→決済→制作→発送→通知→完了の通し確認 |
| 店舗予約 | 開発版に申請・確定・代替提案・通知台帳の実装 | 実DBの既存4 migrationの適用状態を確認し、必要分だけ適用。予約1件と競合予約を通して確認 |
| 通知 | 予約の通知台帳・再試行処理等 | 許可されたテスト宛先でLINE確認。実顧客への試験送信は行わない |
| 販売条件等 | 対象アプリ内で専用規約ページの所在を確認できていない | 販売主体・送料・納期・返品・特商法表記・利用規約・プライバシーポリシーの確認と整備 |

本番DBへの現在の接続権限では管理確認を実行できない。別事業のDBへ代替して変更しない。実際の権限・認証方式を確認せずに設定を推測して適用すると既存スタッフ業務を止める可能性があるため、まず読取専用の `scripts/sql/aily-commerce-access-preflight.sql` と既存 `docs/aily-supabase-manual-rollout.md` の確認を行う。

StarRevenue `madeo2222-coder/v0-star-revenue` の確認時点の最新SHAは `b51423dcd8e28b23851d97888e3fb5a88bbf789a`。確認できた実装は主に決済結果ファイル照合とプロバイダー接続の土台で、Ailyにそのまま接続できる本番カード・PayPay APIは確認できなかった。StarRevenue側のコード・DB・設定は変更していない。

## 変更ファイル

- `lib/veritrans/payment-result.ts`
- `app/api/nail-tip-orders/[id]/pay/route.ts`
- `app/api/inbound-nail-tip-requests/[id]/pay/route.ts`
- `app/nail-tip-order-pay/[id]/PaymentPageClient.tsx`
- `app/inbound-nail-tip-pay/[id]/PaymentPageClient.tsx`
- `app/api/nail-tip-orders/[id]/status/route.ts`
- `app/api/nail-tip-orders/[id]/shipping/route.ts`
- `app/api/nail-tip-orders/route.ts`
- `app/api/customer-app/nail-tip-orders/route.ts`
- `app/customer-app/nail-tip-order/page.tsx`
- `app/customer-app/mypage/page.tsx`
- `lib/server/customerReservationAvailability.ts`
- `app/api/sanmeigaku-diagnoses/route.ts`
- `app/customer-app/sanmeigaku/page.tsx`
- `scripts/sql/aily-commerce-access-preflight.sql`（読取専用、実DBでは未実行）
- `scripts/verify-payment-pending-sql.mjs`
- `tests/payment-ambiguity.test.mjs`
- `tests/payment-client-retry.test.mjs`
- `tests/order-fulfilment-payment.test.mjs`
- `tests/customer-availability-time.test.mjs`
- `tests/diagnosis-ownership.test.mjs`
- 本記録。加えて main の `docs/aily-daily-sales-production-20261018.md` を統合。

## 再開手順

1. GitHubの最新main・統合ブランチ・Vercel全環境の最終試行を再取得する。同時作業と未反映commitを照合し、force更新や別の自動デプロイを重複起動しない。
2. Ailyを管理できるSupabase接続で読取preflightを実行し、既存スタッフ認証・実際の権限・RLS・migrationを確認する。具体的な是正案を作り、重大な権限変更は既存承認と照合する。
3. 顧客データの保護を実接続で確認したうえで、既存4 migrationの必要分を確定し、予約の申請→スタッフ確認→確定→顧客再表示→通知をテスト用顧客で通す。
4. 注文の価格・送料・配送先・サイズ・冪等性を接続し、DGFTのAily加盟店条件と決済方式を確認してカード・PayPayをテスト環境で通す。
5. 公開条件と6時間間隔を満たした成果を1つの統合バッチで反映する。READYだけで完了とせず、本番で入力・保存・管理・完了を確認する。
6. 実機、販売条件、注文・予約の通し検証を満たした後に集客を開始する。広告出稿やSNS投稿は今回実行していない。

この記録は実施済みのローカル検証と未実施の実接続検証を区別するためのもの。次回作業で残件を解消したら、実際の証拠とともに更新する。
