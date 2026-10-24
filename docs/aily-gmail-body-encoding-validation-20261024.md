# Gmail予約同期: 本文Base64URLの厳格検証

## 利用者に変わること

Gmail APIから返るHPB／minimo予約メール本文のBase64URLが壊れている場合、部分的に復号した本文で予約を保存・更新せず、安全に再試行対象として保留する。

壊れたメールと同じGmailスレッドの古い予約メールも保留し、無関係な予約スレッドは従来どおり同期を続ける。

## 対象範囲

- MIME本文に直接入るBase64URL
- Gmail attachment APIから取得する外部本文
- URL-safe文字、末尾padding、長さ、復号後のcanonical表現
- UTF-8、ISO-2022-JPなど既存のMIME charset復号

不正な文字、途中のpadding、不正な長さ、非canonicalな符号化はDB書込み前に拒否する。

## 検証

- 壊れた直接本文を拒否し、同じスレッドの古いメールも保留する
- 無関係な予約スレッドは同期を継続する
- attachment APIから返る不正paddingを拒否する
- 正常なpadding有無のBase64URLと既存のMIME本文復号を維持する

## 未確認・変更していない範囲

- Aily実GmailのHPB／minimoメール
- Aily実DBへの保存と予約カレンダー再表示
- DB migration、RLS、環境変数、OAuth設定、実LINE／メール送信
- main、本番環境

この変更はアプリ側のメール読取処理だけで、Supabase変更は不要。
