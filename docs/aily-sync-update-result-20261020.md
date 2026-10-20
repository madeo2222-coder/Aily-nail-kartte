# 予約メール同期：更新0件を成功にしない

## 原因と変更

`lib/hpb-mail-sync.ts` の既存予約更新とキャンセル更新は、DBのerrorだけを確認し、実際に更新された行がなくても成功を返していた。検索後に対象が削除・移動された場合など、保存なしを成功件数へ加算し得る。実データでの発生原因を確定したものではない。

両UPDATEにサロンID条件と `select("id").maybeSingle()` を追加し、返されたIDが更新対象と一致する場合だけ成功を返す。0件・不一致・DBエラーは既存の失敗表示へ渡し、新規予約作成へフォールバックしない。前回の顧客不一致ガード、既存予約ID、メモ保存、予約番号の冪等性、通知処理は維持する。

これは保存結果の検出であり、同時更新の排他・更新後の永続的な存在を保証するものではない。すでにキャンセル済みかつメモが同じ場合の冪等な無更新応答は従来どおり。顧客照合・作成は予約UPDATE前に行われるため、失敗時に全処理がロールバックされるわけではない。

## 次の納品

| 項目 | 内容 |
| --- | --- |
| 利用者・目的 | スタッフがメール同期後、保存されていない予約を成功済みと誤認しない |
| 納品範囲 | HPB/minimo共通の既存予約更新・キャンセル更新の結果確認。DB/schema/依存変更なし |
| 受入条件 | 対象IDが返ると成功、0件・不一致・DBエラーは失敗。失敗後の新規予約作成なし。同一顧客の既存予約同期・メモ保存を維持 |
| 残件 | 単一Preview反映、許可されたテストデータの取込→保存→再表示による実接続受入 |
| 予定日 | 2026-10-20 20:00:36.931 JST以降の統合バッチ候補。直前の最新試行・並行差分を再確認。実接続受入日は未確認のDB前提解消後に確定 |
| 本人操作 | 今回の保存には不要。受領済み結果の再提出・Supabase接続切替は求めない |

## 検証

- 予約更新の修正前コードで、0件・別IDでも拒否せず成功することを実取込コード＋モックDBで再現。
- 修正後、更新/キャンセルの0件・別ID・DBエラー、キャンセル成功、顧客不一致拒否、同一顧客/未割当の手入力予約同期の10ケース成功。
- 全回帰669件成功・失敗0・skip 0（任意PGliteを含む）、全体lint、型検査、`git diff --check` 成功。
- 導入済みSupabaseクライアントを外部通信stubで実行し、PATCH・予約ID/サロンID条件・select=id・return=representation指定、およびnull/対象IDの2応答処理を確認。実PostgREST/RLS検証ではない。
- fixture環境変数によるNext production webpack build成功。実DBへの接続確認ではない。
- 実DB、実メール、実スタッフUI、実LINE送信は未実施。HPB fixtureで共通保存処理を検証しており、実minimoメールの通し検証ではない。

## 保存と公開

- 保存基点 `4d49c60d92852d73cb07a300dd9067f2d8510eb8` / 完全tree `994614dad87652528d7de98cf675d0ec2ef18686`。
- 2026-10-20 18:57 JST以降の読取照合で、main `459b1dde236c38fe06d642993960640f6304fa79`、統合 `07e5f7f04de56e9d9d6740dfff3a98303bafea57`、PR #19 head `bbeb14ed7d331ecf98e6edf047a47af271ec5ae1`、Actions実行0件。AGENTS.mdなし。
- 最新全環境試行 `dpl_8KLMH6qXBMcU96wUPUSJMUB4tKL7` / 統合SHA / READY / created 2026-10-20 14:00:36.931 JST。次回最短20:00:36.931 JST。
- 現行Preview https://aily-nail-kartte-g7g54vsdg-madeo2222-8816s-projects.vercel.app に今回差分は未反映。
- 今回はcommit object保存とPR引継ぎのみ。branch/ref・PR head・deployは更新しない。main・本番・DB・migration・env/secret・実送信は変更しない。

## 仕様照合

Supabaseスキルに従い2026-10-20に公式changelogとJavaScript UPDATE/maybeSingle仕様を照合。changelog.mdは検索取得側の形式非対応のためHTML版を参照した。既存バージョン・権限設定は変更しない。

- https://supabase.com/changelog
- https://supabase.com/docs/reference/javascript/update
- https://supabase.com/docs/reference/javascript/maybesingle
