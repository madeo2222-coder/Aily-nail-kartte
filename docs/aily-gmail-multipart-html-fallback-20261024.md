# Gmail予約同期: multipart HTML予約本文への限定フォールバック

## 利用者に変わること

HPB／minimoメールのテキスト版が案内文だけで予約番号・氏名・来店日時を解析できず、HTML版に予約詳細がある場合、HTML版を使って同期できるようにした。

通常は従来どおりテキスト版を優先する。テキスト版の解析が成功した場合はHTML版を取得しないため、本文の重複や不要なattachment API呼出しは発生しない。

## 検証範囲

- テキスト版の解析失敗後にだけHTML版を取得する
- HTML版から予約番号・氏名・来店日時を復元して1回だけ同期する
- 正常なテキスト版がある場合はHTML attachmentを取得しない
- HTML版も解析できない場合は既存のスレッド単位保留を維持する

## 検証結果

- HPB／Gmail関連: 127件成功、失敗0
- 全回帰: 877件中875件成功、失敗0、任意PGlite 2件skip
- TypeScript型検査: 成功
- 変更ファイルlint／全体lint: 成功
- fixture環境のNext.js production webpack build: 成功（93ページ生成）

## 未確認・変更していない範囲

- Aily実GmailのHPB／minimoメール
- Aily実DBへの保存と予約カレンダー再表示
- DB migration、RLS、環境変数、OAuth設定、実LINE／メール送信
- 統合ブランチ、Preview、main、本番環境

この変更はアプリ側のMIME本文選択処理だけで、Supabase変更は不要。
