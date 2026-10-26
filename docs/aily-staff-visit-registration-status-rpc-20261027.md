# 旧予約確定状態からの来店登録をDB保存まで統一

## 解消する不具合

予約一覧と来店登録画面は、全角英字や空白入りの旧「予約確定」を確定済みとして扱う。一方、個別スタッフ認証が使う `register_staff_visit` RPCは状態を完全一致で判定していたため、画面から登録を開始できても、来店・支払の保存直前で拒否される可能性があった。

同RPCの予約完了更新にも完全一致判定があり、来店保存後に予約だけ完了へ進められず、transaction全体が失敗する可能性があった。

## 変更範囲

- `normalize_reservation_workflow_status(text)` で全角英数字、空白、英字大小を統一する。
- `register_staff_visit` の確定済み・完了済み判定と、保存後の予約完了更新へ同じ正規化を適用する。
- 来店、支払内訳、クーポン、予約完了を1 transactionで保存する既存処理は維持する。
- 申請中、取消済み、別サロン、別顧客、重複来店、支払不一致は従来どおり拒否する。
- `register_staff_visit` と正規化関数は従来どおり `service_role` だけ実行できる。
- 既存行の一括変更、権限緩和、実データ書込み、実LINE送信は行わない。

## 適用前確認

対象はAily Supabase `shnkwaunrycqxgboqnam`。`scripts/sql/aily-staff-visit-registration-status-preflight.sql` は読取専用で、既存 `register_staff_visit` RPC、正規化関数、`service_role`・`anon`・`authenticated` の実行権限だけを1行で返す。

既存RPCがあり、`service_role_can_register_visit=true`、`anon_can_register_visit=false`、`authenticated_can_register_visit=false` の場合のみ、書込みmigration `20261027080000_normalize_staff_visit_reservation_status.sql` を候補とする。RPCがない場合は、依存migration `20260822204243_create_staff_visit_registration_rpc.sql` の必要性を既受領結果と照合する。未確認のまま適用済みとは扱わない。

## ローカル確認

PGliteで実migrationとRPCを実行し、次を確認した。

- 全角英字の確定予約から、来店と現金支払を1件保存し、予約を「完了」へ更新できる。
- 空白入り日本語の確定予約でも同じ処理が完了する。
- 全角英字の完了済み予約は `VISIT_RESERVATION_ALREADY_COMPLETED` で拒否する。
- 申請中予約は `VISIT_INVALID_RESERVATION` で拒否する。
- `anon` と `authenticated` はRPCを実行できない。

回帰テストは980件中978件成功、失敗0件、任意PGlite 2件skip。型検査、変更ファイルのlint、fixture環境でのNext.js本番webpack build（93ページ）も成功した。

Aily実DBへのmigration適用、通常のスタッフ認証による実データの入力→保存→再表示、現場受入、Preview・本番反映は未実施。
