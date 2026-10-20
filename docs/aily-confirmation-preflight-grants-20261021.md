# 予約確定通知の読取 preflight: 必須権限の判定修正

## 範囲

- 2026-10-21、保存済み `7995db55535fa31559dc4680e944be12d3406e84` を起点とする導入準備の修正。
- `aily-confirmation-delivery-preflight.sql` の通知台帳に対する `service_role` の判定のみ変更する。読取SQLのままで、実DB・権限・migration・アプリ画面を変更しない。
- 以前の `has_table_privilege(..., 'SELECT,INSERT,UPDATE')` はいずれか1権限で真になるため、SELECTだけでもPASSになった。3つを個別に検査し、ANDで全権限を要求する。
- anon/authenticated/PUBLICについては「どれか1権限でもあればFAIL」が正しいため、既存の検査を維持する。
- 仕様根拠: [PostgreSQL access privilege inquiry functions](https://www.postgresql.org/docs/current/functions-info.html#FUNCTIONS-INFO-ACCESS-TABLE)。公式説明とローカル実行の両方で確認。

## 検証

- 既存の `verify-staff-reservation-confirmation-sql.mjs` に、実際の読取SQLを使う全8通りのSELECT/INSERT/UPDATE組合せを追加。
- 修正前はSELECTだけでPASSとなり、期待するFAILとの不一致を再現。修正後は全権限ありの1通りのみPASS、残り7通りはFAIL。
- 同じPGlite検証で、空schema、36項目の導入済みcatalog検査、危険な列権限/SECURITY DEFINER/関数本文差分、予約確定と通知台帳の既存動作検証も成功。
- 自動回帰679件成功、失敗0、skip0。実DB・実LINE送信・認証済み画面の受入は含まない。
- 全ESLint、独立型検査、diff check、env -iのfixture設定によるNext webpack buildも成功（93ページ生成・最終traceまでexit 0）。

## 導入と残件

- GitHub commit objectとして保存する段階。branch更新・Preview再build・main反映はこの修正の保存では行わない。
- 最新照合済みPreviewは `281596bcb4f6c90746434514d9d213bff5dfd923` / `dpl_Arbi2vamvF25wMiAD8fU6V659GQn` / READY。作成2026-10-21 02:05:12.408 JST、次のbuild誘発操作は最短08:05:12.408 JST以降。実行直前に全環境で再計算する。
- このSQL修正自体の利用にはデプロイは不要。ユーザー手動確認が必要になった際は、この修正版を使う。
- 既受領の表権限/RLS/スタッフ集計は再利用し、同じ結果の再提出を求めない。今回の修正を理由に同じSQLの再実行を一律に依頼しない。
- 以前の通知台帳preflight結果を将来受領/復元した場合、旧版のservice_role PASSだけでは3権限を保証しない。既存の個別権限結果があれば先に照合し、不足時だけ最小の読取確認を用意する。
- 未確認の実DB導入・実接続受入・本番公開の完了とは扱わない。DB作業はユーザー手動、重大な権限変更と本番公開の承認条件を維持する。
