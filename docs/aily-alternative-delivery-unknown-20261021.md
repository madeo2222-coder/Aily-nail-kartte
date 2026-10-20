# 別日時LINE依頼：通信失敗の記録不成立を区別する

## 修正対象

LINEへのfetchが例外になった後、`complete_reservation_alternative_request` の戻り値を確認せず「再試行できます」と返していた。DB側がfalseやerrorを返し、失敗状態を記録できていない場合も同じ案内になっていた。実事故ではなく、既存APIの模擬応答で再現した。

この経路でもRPCのdataがtrueかつerrorなしを確認する。false/error/例外ではHTTP500、status=unknown、retryable=falseとし、「再送せず、通知状態とLINEの送信履歴を確認」と案内する。内部エラー詳細は返さない。既存画面はAPIのerrorを表示するため、画面変更は不要。

正常に失敗記録できた場合の502/failed/retryable=trueは維持。claim、LINE retry key、本人・店舗認証、通知内容、予約状態遷移は変更しない。追加のLINE再送やDB再試行は行わない。

## 次の納品

| 項目 | 内容 |
| --- | --- |
| 利用者・目的 | スタッフが通知状態を記録できない障害を通常の再試行可能な失敗と誤認しない |
| 範囲 | 既存別日時依頼APIの通信例外経路のみ |
| 受入条件 | 記録false/error/例外は結果不明の案内。記録成功は既存再試行経路を維持。各要求でLINE呼出しは1回 |
| 残件 | 次回単一Preview反映、通常の認証経路での画面・実接続受入 |
| 予定 | 2026-10-21 08:05:12.408 JST以降の統合候補。全環境の最新試行を直前に再確認 |
| 本人操作 | この修正のDB作業は不要。実DB受入・実通知は別途許可された対象に限定 |

## 検証・制限

- 修正前に追加ケースが失敗（記録falseでも502/retryable）。修正後関連12件成功。
- 全回帰679件成功、失敗0、skip0（PGlite含む）。
- 全ESLint・独立型検査（--noEmit --incremental false）・diff check成功。実資格情報を継承しないenv -i fixture Next webpack build成功（コンパイル85秒、93/93ページ、最終trace完了、exit0）。
- 実DB/LINEへは接続せず、ルート本体に模擬RPC/fetchを注入した検証。実送信結果を確認したものではない。
- sent=falseは今回APIが送信成功を確認していないことを表し、顧客未受信を保証しない。status=unknownのとき受信有無は未確定。
- retryable=falseは案内であり恒久的な再送禁止やボタン無効化ではない。既存claimの重複防止・再送キーを維持する。
- HTTP応答後の送信結果保存エラー処理、DB関数・権限・migrationは今回変更しない。

## 反映基点

GitHub統合281596bcb4f6c90746434514d9d213bff5dfd923、完全tree e1232cd55cd896ac8227048f53dcf09be2aafac6とローカルHEAD cad3b3eのtree一致を確認。main459b1dd、PR19 head bbeb14edは維持。AGENTS.mdなし、Actions0。前回checkpointはPR19コメント6296583224。

02:59 JST照合の最新全環境deploymentはdpl_Arbi2vamvF25wMiAD8fU6V659GQn / 281596b / READY / created2026-10-21 02:05:12.408 JST。次回最短08:05:12.408 JST。今回はbranch/ref/push/deploy/main/本番/DB/env/secret/実送信を変更しない。前回拒否された保護Preview取得の再試行・別経路回避も行わない。既受領のDB結果・スタッフ集計の再提出は求めない。
