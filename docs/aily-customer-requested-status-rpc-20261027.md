# 予約の旧申請中ステータスを保存・確定・別日時提案RPCまで統一

## 解消する不具合

顧客予約APIが全角英字や空白入りの旧「申請中」を認識しても、最終保存を行う既存RPCは完全一致で判定していた。このため実DBでは、変更・取消が「予約状態が更新されています」として止まる可能性があった。

同じ完全一致判定がスタッフの予約確定RPC、別日時提案の通知取得RPC、確定通知の取得RPCにも残っていた。画面上では申請中または確定済みに見えても、保存やLINE通知の直前で処理が止まる可能性があった。

## 変更範囲

- `normalize_reservation_workflow_status(text)` を追加し、全角英数字、空白、英字大小を保存RPC内で正規化する。
- `create_customer_requested_reservation`、`update_customer_requested_reservation`、`cancel_customer_requested_reservation` の判定に同じ正規化を適用する。
- `confirm_staff_reservation`、`claim_reservation_alternative_request`、`claim_reservation_confirmation_delivery` にも同じ正規化を適用する。
- 全角・空白入りの確定済み状態は再確定せず、従来どおり `already_confirmed` として扱う。
- 全角・空白入りの取消状態は新規予約と予約変更の重複判定から除外する。
- 関数の実行権限は従来どおり `service_role` のみに限定する。
- 既存行の一括更新、権限の緩和、実データ書込み、実LINE送信は行わない。

## 適用前確認

対象はAily Supabase `shnkwaunrycqxgboqnam`。`scripts/sql/aily-customer-requested-status-preflight.sql` は読取専用で、既存の新規・更新・取消・スタッフ確定・別日時提案取得・確定通知取得RPC、今回の補助関数、`service_role` 実行権限の有無だけを1行で返す。

既存6 RPCが揃っている場合のみ、書込みmigration `20261026200835_normalize_customer_requested_statuses.sql` を候補とする。既存RPCがない場合は、依存migration `20261003120111_reservation_alternative_requests.sql`、`20261004030707_prevent_customer_reservation_races.sql`、`20261004055916_prevent_staff_confirmation_races.sql`、`20261004070432_reservation_confirmation_deliveries.sql` の必要性を既受領結果と照合する。未確認のまま適用済みとは扱わない。

## 期待する結果

- 全角英字の `requested` を持つ本人予約が、競合のない別日時へ更新できる。
- 空白入りの「予約申請中」を持つ本人予約が取り消せる。
- 全角英字の取消済み予約は、新規予約・予約変更の空き枠を塞がない。
- 全角英字または空白入りの申請中予約をスタッフが確定でき、既存の競合検査と通知台帳更新が維持される。
- 全角英字または空白入りの申請中予約から別日時提案の通知処理を開始でき、再送キーと二重送信防止が維持される。
- 全角英字または空白入りの確定済み予約から確定通知を取得でき、再送キーと二重送信防止が維持される。
- 他顧客、古い日時、予約競合、無効スタッフは従来どおり拒否される。

## 未検証範囲

ローカルでは実資格情報を使わず、PGliteで既存migrationから今回のmigrationまでを実行した。全角英字の申請中予約の変更、空白入り日本語の申請中予約の取消、全角英字の取消済み予約を除外した新規・変更の重複判定に加え、スタッフ確定、確定済み再実行、別日時提案の取得、通知再試行、読取preflight、関数実行権限を確認した。

自動テストは977件中975件成功・失敗0・任意PGlite検査2件skip、型検査、lint、fixture設定のNext.js production build（93ページ）に成功した。Aily実DBへのmigration適用、実データによる入力→保存→再表示、実LINE通知、現場受入、本番反映は未実施。
