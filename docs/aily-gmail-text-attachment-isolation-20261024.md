# Gmail予約同期: テキスト添付の本文混入防止

## 利用者に変わること

HPB／minimoメールにテキスト形式の添付ファイルが含まれていても、添付内容を予約本文へ連結せず、メール本体だけを同期対象として扱う。

Gmailではファイル名が空でも `Content-Disposition: attachment` として添付を表すことがある。従来はこの形式を本文として取得する可能性があり、保存済みメール本文の比較や予約解析へ添付内容が混入し得た。

## 維持する挙動

- Gmailが大きな本文をattachment API経由で返す場合は、引き続き本文として取得する
- `text/plain` 本文を優先し、解析できる場合はHTML本文を取得しない
- 本文取得・解析失敗時のスレッド単位保留と重複防止を維持する

## 検証結果

- HPB／Gmail関連: 128件成功、失敗0
- 全回帰: 878件中876件成功、失敗0、任意PGlite 2件skip
- TypeScript型検査: 成功
- 変更ファイルlint／全体lint: 成功
- fixture環境のNext.js production webpack build: 成功（93ページ生成）

## 未確認・変更していない範囲

- Aily実GmailのHPB／minimoメール
- Aily実DBへの保存と予約カレンダー再表示
- DB migration、RLS、環境変数、OAuth設定、実LINE／メール送信
- 統合ブランチ、Preview、main、本番環境

この変更はMIME本文選択処理だけで、Supabase変更は不要。
