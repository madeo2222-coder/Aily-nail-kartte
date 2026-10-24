# Gmail予約本文のMIME種別正規化（2026-10-24）

## 利用者ができるようになること

HPB／ミニモの予約メール本文が `Text/Plain` や前後空白を含むMIME種別で届いても、Gmail同期が本文を取得し、既存の予約解析・保存処理へ渡せる。

## 変更内容

- MIME media typeをtrimし、小文字へ正規化してから `text/plain` / `text/html` / `message/rfc822` を判定する。
- 大文字小文字が異なる正当なMIME種別を「本文なし」と誤認して同期失敗にする経路を解消する。
- 添付メール本文を現在の予約本文へ混ぜない既存の除外処理は維持する。
- DB schema、migration、認証、環境変数、外部送信処理は変更しない。

## 検証

- 大文字小文字と前後空白を含む `Text/Plain` fixtureが、解析と予約同期処理まで到達することを確認。
- `tests/hpb-gmail-sync-auth.test.mjs`: 39件成功。
- 全回帰: 891件中889件成功、失敗0、任意PGlite 2件skip。
- `npx tsc --noEmit`、全体lint、`git diff --check`: 成功。
- 実資格情報を継承しないfixture設定のNext.js production webpack build: 93ページ生成、成功。

## 未検証範囲

- Aily本番Gmailの実メール取得、実DBへの予約保存、実LINE／メール送信は実施していない。
- Preview・本番には未反映。既存の6時間間隔に従い、次の検証済み統合バッチへ含める。
