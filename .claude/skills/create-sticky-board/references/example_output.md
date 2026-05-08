# 出力サンプル

これは **create-sticky-board スキルが生成すべき完成形** の例です。
入力として「新サービスのアイデア出しブレストメモ」を想定しています。

入力例:

```
新サービスのアイデア出し
- ターゲットは社内エンジニア
- ペインポイント: ドキュメントが散らばっている / 検索しても古い情報が出る
- アイデア: 社内専用の Q&A bot を Slack に常駐させる
- アイデア: ドキュメント鮮度をスコア化して可視化
- 課題: メンテナンスコスト / 情報のソースをどう信頼するか
- アクション: PoC を 2 週間で / 利用者ヒアリング 5 名
```

これに対して生成すべき出力ファイル全体:

````markdown
---
schemaVersion: 2
board: 新サービスブレスト
exported: 2026-05-08T12:00:00.000Z
notes: 11
connectors: 4
frames: 4
---

## Data

_Do not hand-edit blocks below if you intend to re-import._

```yaml note
id: n_legend_title
type: note
x: 20
y: 20
width: 240
height: 60
color: "#1f2937"
fontSize: 18
align: center
createdBy: AI
createdAt: 2026-05-08T12:00:00.000Z
updatedAt: 2026-05-08T12:00:00.000Z
zIndex: 1
text: "<strong>凡例 / Legend</strong>"
```

```yaml note
id: n_legend_problem
type: note
x: 20
y: 100
width: 110
height: 60
color: "#fca5a5"
fontSize: 12
align: center
createdBy: AI
createdAt: 2026-05-08T12:00:00.000Z
updatedAt: 2026-05-08T12:00:00.000Z
zIndex: 2
text: "課題"
```

```yaml note
id: n_legend_idea
type: note
x: 150
y: 100
width: 110
height: 60
color: "#c4b5fd"
fontSize: 12
align: center
createdBy: AI
createdAt: 2026-05-08T12:00:00.000Z
updatedAt: 2026-05-08T12:00:00.000Z
zIndex: 3
text: "アイデア"
```

```yaml note
id: n_legend_action
type: note
x: 20
y: 180
width: 110
height: 60
color: "#fdba74"
fontSize: 12
align: center
createdBy: AI
createdAt: 2026-05-08T12:00:00.000Z
updatedAt: 2026-05-08T12:00:00.000Z
zIndex: 4
text: "アクション"
```

```yaml note
id: n_legend_target
type: note
x: 150
y: 180
width: 110
height: 60
color: "#93c5fd"
fontSize: 12
align: center
createdBy: AI
createdAt: 2026-05-08T12:00:00.000Z
updatedAt: 2026-05-08T12:00:00.000Z
zIndex: 5
text: "前提 / 事実"
```

```yaml note
id: n_target_user
type: note
x: 360
y: 40
width: 200
height: 160
color: "#93c5fd"
fontSize: 14
align: left
createdBy: AI
createdAt: 2026-05-08T12:00:00.000Z
updatedAt: 2026-05-08T12:00:00.000Z
zIndex: 6
text: "<strong>ターゲット</strong><br>社内エンジニア"
```

```yaml note
id: n_pain_scattered
type: note
x: 600
y: 40
width: 200
height: 160
color: "#fca5a5"
fontSize: 14
align: left
createdBy: AI
createdAt: 2026-05-08T12:00:00.000Z
updatedAt: 2026-05-08T12:00:00.000Z
zIndex: 7
text: "ドキュメントが散らばっている"
```

```yaml note
id: n_pain_stale
type: note
x: 840
y: 40
width: 200
height: 160
color: "#fca5a5"
fontSize: 14
align: left
createdBy: AI
createdAt: 2026-05-08T12:00:00.000Z
updatedAt: 2026-05-08T12:00:00.000Z
zIndex: 8
text: "検索しても古い情報が出る"
```

```yaml note
id: n_idea_qabot
type: note
x: 600
y: 280
width: 200
height: 160
color: "#c4b5fd"
fontSize: 14
align: left
createdBy: AI
createdAt: 2026-05-08T12:00:00.000Z
updatedAt: 2026-05-08T12:00:00.000Z
zIndex: 9
text: "<strong>Slack 常駐 Q&amp;A bot</strong><br>社内ドキュメントを横断回答"
```

```yaml note
id: n_idea_freshness
type: note
x: 840
y: 280
width: 200
height: 160
color: "#c4b5fd"
fontSize: 14
align: left
createdBy: AI
createdAt: 2026-05-08T12:00:00.000Z
updatedAt: 2026-05-08T12:00:00.000Z
zIndex: 10
text: "<strong>鮮度スコア可視化</strong><br>ドキュメントごとに古さをスコア化"
```

```yaml note
id: n_action_poc
type: note
x: 600
y: 520
width: 200
height: 160
color: "#fdba74"
fontSize: 14
align: left
createdBy: AI
createdAt: 2026-05-08T12:00:00.000Z
updatedAt: 2026-05-08T12:00:00.000Z
zIndex: 11
text: "<strong>PoC 2 週間</strong><br>利用者ヒアリング 5 名"
```

```yaml frame
id: f_legend
type: frame
x: 0
y: 0
width: 290
height: 270
color: "#475569"
title: "凡例"
createdAt: 2026-05-08T12:00:00.000Z
updatedAt: 2026-05-08T12:00:00.000Z
```

```yaml frame
id: f_premise
type: frame
x: 340
y: 0
width: 720
height: 230
color: "#3b82f6"
title: "ターゲット & ペインポイント"
createdAt: 2026-05-08T12:00:00.000Z
updatedAt: 2026-05-08T12:00:00.000Z
```

```yaml frame
id: f_ideas
type: frame
x: 580
y: 240
width: 480
height: 230
color: "#8b5cf6"
title: "アイデア"
createdAt: 2026-05-08T12:00:00.000Z
updatedAt: 2026-05-08T12:00:00.000Z
```

```yaml frame
id: f_action
type: frame
x: 580
y: 480
width: 240
height: 230
color: "#f97316"
title: "次のアクション"
createdAt: 2026-05-08T12:00:00.000Z
updatedAt: 2026-05-08T12:00:00.000Z
```

```yaml connector
id: c_pain1_idea1
type: connector
from: n_pain_scattered
to: n_idea_qabot
fromSide: bottom
toSide: top
shape: elbow
style: arrow
color: "#475569"
createdAt: 2026-05-08T12:00:00.000Z
updatedAt: 2026-05-08T12:00:00.000Z
```

```yaml connector
id: c_pain2_idea2
type: connector
from: n_pain_stale
to: n_idea_freshness
fromSide: bottom
toSide: top
shape: elbow
style: arrow
color: "#475569"
createdAt: 2026-05-08T12:00:00.000Z
updatedAt: 2026-05-08T12:00:00.000Z
```

```yaml connector
id: c_idea1_action
type: connector
from: n_idea_qabot
to: n_action_poc
fromSide: bottom
toSide: top
shape: straight
style: arrow
color: "#ef4444"
createdAt: 2026-05-08T12:00:00.000Z
updatedAt: 2026-05-08T12:00:00.000Z
```

```yaml connector
id: c_target_pain1
type: connector
from: n_target_user
to: n_pain_scattered
fromSide: right
toSide: left
shape: straight
style: line
color: "#475569"
createdAt: 2026-05-08T12:00:00.000Z
updatedAt: 2026-05-08T12:00:00.000Z
```
````

## このサンプルが満たしている要件

- 凡例フレームが左上にある（`f_legend`、x=0, y=0）
- 前提・アイデア・アクションがそれぞれ別フレームに分かれている
- 色がカテゴリと対応している（青=前提, 赤=課題, 紫=アイデア, 橙=アクション）
- 矢印で「ペイン → アイデア → アクション」の流れが見える
- 重要なクリティカルパス（`c_idea1_action`）だけ赤色
- 全付箋が 240px グリッドで配置されており重ならない
- フロントマターの `notes: 11`, `connectors: 4`, `frames: 4` が実数と一致

新規生成時はこのサンプルを **構造のテンプレートとして真似してください**（情報の中身は当然、入力に合わせて作ります）。
