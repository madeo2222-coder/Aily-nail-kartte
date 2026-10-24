# Gmail予約同期: 壊れた件名エンコードの安全停止

## 利用者に変わること

HPB／minimo予約メールの件名に、途中で切れたRFC 2047 encoded-wordや非canonicalなBase64が含まれる場合、件名を未復号のまま予約解析へ渡さず、DB書込み前に安全停止する。

件名だけにある「キャンセル」を見落として予約登録・更新として扱うことを防ぐ。取得失敗は既存のスレッド単位保留へ渡し、無関係な予約スレッドは同期を続ける。

## 検証範囲

- 閉じられていないRFC 2047 encoded-wordを拒否
- 未対応のencoding記号を含むencoded-wordを拒否
- 復号できてもcanonicalでないBase64を拒否
- 正常なUTF-8 Base64、Q encoding、連続encoded-wordは従来どおり復号
- 同一Gmailスレッドの古いメールだけを保留し、別スレッドは継続

## 検証結果

- 対象Gmail同期テスト: 34件成功、失敗0
- HPB／minimo関連回帰: 126件成功、失敗0
- 全回帰: 876件中874件成功、失敗0、任意PGlite 2件skip
- TypeScript、変更範囲ESLint、全体ESLint、diff check: 成功
- 実資格情報を継承しないfixture設定のNext.js production webpack build: 93ページ、最終trace、exit 0

## 未確認・変更していない範囲

- Aily実GmailのHPB／minimoメール
- Aily実DBへの保存と予約カレンダー再表示
- DB migration、RLS、環境変数、OAuth設定、実LINE／メール送信
- 統合ブランチ、Preview、main、本番環境

この変更はアプリ側のメール件名読取処理だけで、Supabase変更は不要。
