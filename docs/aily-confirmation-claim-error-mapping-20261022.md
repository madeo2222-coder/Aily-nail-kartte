# 予約確定LINEの競合・権限エラー表示修正（2026-10-22）

## 目的と範囲

| 項目 | 内容 |
| --- | --- |
| 利用者・目的 | スタッフが予約確定LINEを送る直前に予約状態や権限が変わっても、原因不明の500ではなく次の操作を判断できるようにする |
| 納品範囲 | 既存の予約確定LINE APIが、送信権確保RPCから返る既知エラーを安全なスタッフ向け応答へ変換する処理 |
| 受入条件 | 権限・店舗不一致はHTTP 403、予約状態や送信文面の競合はHTTP 409と適切な案内を返し、LINEを送らない。内部エラー詳細を応答へ含めない |
| 残件 | 認証済み実データでの予約確定→保存→再表示→LINE通知状態の通し確認 |
| 予定日 | 次のPreview候補は2026-10-22 20:08:17 JST以降。反映直前に全環境の最新試行から再計算する |
| 必要な本人操作 | 現時点ではなし。実DB・実LINEの確認は、許可されたテスト予約と送信先が確定した後に行う |

## 修正内容

- `CONFIRMATION_DELIVERY_INVALID_STAFF` と `CONFIRMATION_DELIVERY_SCOPE_MISMATCH` を、権限案内付きHTTP 403へ変換する。
- `CONFIRMATION_DELIVERY_INVALID_RESERVATION` を、最新状態の再読込を案内するHTTP 409へ変換する。
- 既存の `CONFIRMATION_DELIVERY_MESSAGE_CHANGED` を同じ変換処理へ統合し、LINE送信履歴の確認を案内するHTTP 409を維持する。
- 既知エラーの内部コードやDB詳細をブラウザへ返さず、LINE APIと送信完了記録を呼び出さない。
- 未知のエラーを一般化500にする既存保護、スタッフ認証、店舗制限、再送キー、送信台帳、再試行条件は維持する。
- DB、migration、env/secret、実LINE送信は変更しない。

## 再現と検証

- 修正前は権限不一致の模擬RPCエラーがHTTP 500となることを追加テストで確認した。
- 修正後は既知の4種類を403/409へ分け、全ケースで内部コード非表示、LINE呼出し0件、完了記録0件を確認した。
- 対象テスト11件は成功。
- 全回帰753件中751件成功、失敗0、任意PGlite 2件skip。
- `npx tsc --noEmit --incremental false`、全体lint、`git diff --check` に成功。
- 実資格情報を継承しないfixture設定のNext.js production webpack buildに成功（93画面）。

## 検証限界

ローカルの実Routeと模擬DB・LINE応答で検証した。Preview、Aily実DB、スタッフ実認証、実LINE送信、本番環境の動作確認ではない。
