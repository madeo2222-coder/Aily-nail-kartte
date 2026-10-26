# 顧客予約の旧申請中ステータスを保存RPCまで統一

## 解消する不具合

顧客予約APIが全角英字や空白入りの旧「申請中」を認識しても、最終保存を行う既存RPCは完全一致で判定していた。このため実DBでは、変更・取消が「予約状態が更新されています」として止まる可能性があった。

## 変更範囲

- `normalize_reservation_workflow_status(text)` を追加し、全角英数字、空白、英字大小を保存RPC内で正規化する。
- `create_customer_requested_reservation`、`update_customer_requested_reservation`、`cancel_customer_requested_reservation` の判定に同じ正規化を適用する。
- 全角・空白入りの取消状態は新規予約と予約変更の重複判定から除外する。
- 関数の実行権限は従来どおり `service_role` のみに限定する。
- 既存行の一括更新、権限の緩和、実データ書込み、実LINE送信は行わない。

## 適用前確認

対象はAily Supabase `shnkwaunrycqxgboqnam`。`scripts/sql/aily-customer-requested-status-preflight.sql` は読取専用で、既存の新規・更新・取消RPC、今回の補助関数、`service_role` 実行権限の有無だけを1行で返す。

既存3 RPCが揃っている場合のみ、書込みmigration `20261026200835_normalize_customer_requested_statuses.sql` を候補とする。既存RPCがない場合は、先に依存migration `20261004030707_prevent_customer_reservation_races.sql` の必要性を既受領結果と照合する。未確認のまま適用済みとは扱わない。

## 期待する結果

- 全角英字の `requested` を持つ本人予約が、競合のない別日時へ更新できる。
- 空白入りの「予約申請中」を持つ本人予約が取り消せる。
- 全角英字の取消済み予約は、新規予約・予約変更の空き枠を塞がない。
- 他顧客、古い日時、予約競合、無効スタッフは従来どおり拒否される。

## 未検証範囲

ローカルでは実資格情報を使わず、PGliteで既存migrationから今回のmigrationまでを実行した。全角英字の申請中予約の変更、空白入り日本語の申請中予約の取消、全角英字の取消済み予約を除外した新規・変更の重複判定、読取preflight、関数実行権限を確認した。

自動テストは976件中974件成功・失敗0・任意PGlite検査2件skip、型検査、lint、fixture設定のNext.js production build（93ページ）に成功した。Aily実DBへのmigration適用、実データによる入力→保存→再表示、実LINE通知、現場受入、本番反映は未実施。
