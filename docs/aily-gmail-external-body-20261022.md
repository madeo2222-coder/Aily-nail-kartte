# Gmail外部本文の予約同期（2026-10-22）

## 利用者が新しくできること

Gmailが予約メールの本文をメッセージ本体へ直接返さず、`attachmentId` 経由で返した場合も、予約同期センターまたは予約カレンダーの同期操作で本文を読み取り、既存のHPB/minimo取込処理へ渡せる。

## 修正範囲

- Gmail APIの `MessagePartBody.attachmentId` を本文パート（`text/plain` / `text/html`）に限って取得する。
- 直接格納されたplain本文を優先し、存在する場合はHTML側の外部本文を追加取得しない。
- 外部本文の取得に失敗したメールは成功扱いにせず、既存の部分失敗・再試行導線へ流す。
- ファイル名付きの通常添付ファイルは従来どおり本文として読み込まない。
- 同一本文IDの取得はメッセージ内で1回に収束する。

## 検証

- Gmail同期の関連18テスト成功（外部plain本文、plain優先、取得失敗を追加）。
- 全回帰742件: 740成功、失敗0、任意PGlite 2件skip。
- `npx tsc --noEmit`、変更対象lint、全lint、`git diff --check` 成功。
- 実資格情報を継承しないfixture設定のNext.js production webpack build成功（93/93ページ、最終trace、exit 0）。

## 未検証範囲

- 実Gmail上で本文が外部化されたHPB/minimoメールの通し同期。
- 実DBへの保存、認証済みスタッフ画面での再表示、実LINE送信。
- 本記録作成時点では開発Preview未反映。本番・main・DB・env・secretは変更しない。
