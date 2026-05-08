# 詳細フォーマット仕様

`SKILL.md` 本文だけでも生成できるようになっていますが、迷ったときの **正解の根拠** をここにまとめます。
ソースは `import.ts` / `export.ts` / `shared.ts`。

## バリデーション規則 (Zod スキーマより)

### 共通

- ファイル全体は **1 MB 以下**、要素数は **1000 個以下**
- `id` フィールドは **1〜64 文字** の文字列、空文字 NG
- `color` は **`/^#[0-9a-fA-F]{3,8}$/`** にマッチする hex 表記必須
- タイムスタンプは ISO 8601 文字列 (`2026-05-08T12:00:00.000Z` 形式) を推奨
  - 数値（ミリ秒）も受理されるが、出力は ISO 文字列で揃える

### note

| key | 型 | 必須 | 制約 |
|---|---|---|---|
| `id` | string | ✅ | 1〜64 文字 |
| `type` | string | ✅ | 文字列 `"note"` 固定 |
| `x` / `y` | number | ✅ | finite |
| `width` / `height` | number | ✅ | 正数, 10000 以下 |
| `color` | string | ✅ | hex |
| `fontSize` | int | -- | 8〜72 (デフォルト 14) |
| `align` | enum | -- | `left` / `center` / `right` (デフォルト `left`) |
| `createdBy` | string | -- | 64 文字以下 (デフォルト `Imported`) |
| `createdAt` / `updatedAt` | timestamp | -- | 省略時は now |
| `zIndex` | int | -- | 省略可 |
| `text` | string | -- | 16000 文字以下、空可、HTML 可 |

### connector

| key | 型 | 必須 | 制約 |
|---|---|---|---|
| `id` | string | ✅ | 1〜64 文字 |
| `type` | string | ✅ | 文字列 `"connector"` 固定 |
| `from` / `to` | string | ✅ | 既存 note の id |
| `fromSide` / `toSide` | enum | -- | `top` / `right` / `bottom` / `left` (省略時は最寄り辺を自動計算) |
| `shape` | enum | -- | `straight` / `elbow` / `curved` (デフォルト `straight`) |
| `style` | enum | ✅ | `arrow` / `line` |
| `color` | string | ✅ | hex |

snake_case (`from_side` / `to_side`) も受理されるが、出力では camelCase を使うこと。

### frame

| key | 型 | 必須 | 制約 |
|---|---|---|---|
| `id` | string | ✅ | 1〜64 文字 |
| `type` | string | ✅ | 文字列 `"frame"` 固定 |
| `x` / `y` | number | ✅ | finite |
| `width` / `height` | number | ✅ | 正数, 10000 以下 |
| `color` | string | ✅ | hex |
| `title` | string | -- | 200 文字以下 (デフォルト空) |

## YAML フェンスのパースルール

正規表現は `import.ts` の以下:

```js
/```yaml\s+(note|connector|frame)\s*\n([\s\S]*?)\n```/g
```

つまり:

- 開始フェンスは `` ```yaml note `` / `` ```yaml connector `` / `` ```yaml frame ``
- 終了フェンスは `` ``` ``
- 開始フェンスの `yaml` と種別の間は **空白 1 つ以上** (タブも可)
- 種別の後に **改行**
- 終了フェンスの直前にも **改行**

破損して困りやすいパターン:

- ` ```yml note` (yml と書く) → マッチしない
- ` ```yaml: note ` (コロン入り) → マッチしない
- ` ```yaml note ` の直後に空白がない / コメントがついている → 場合により失敗
- 終了フェンスを ` ```` ` (4 つ) や 5 つにしている → マッチしない

## サニタイザによる削除パターン

サーバー (`sanitize-server.ts`) がこれらのトークンを **問答無用で削除** します。
入れても無意味なので、出力で使わないでください:

- `<script>` 要素全部
- `<iframe>` / `<object>` / `<embed>` / `<link>` / `<meta>` / `<style>` 要素
- `on*=` 属性 (例: `onclick`, `onerror`)
- `javascript:` URL
- `data:text/html` URL
- 16000 文字を超える `text` は切り詰め

## 既知の挙動 (落とし穴)

1. **存在しない note を指す connector は黙って捨てられる** — エラーにならない
2. **fromSide / toSide が無いコネクタは自動補完される** — でも出力では明示すべき
3. **同 ID の付箋を 2 つ書いた場合の挙動は未保証** — 必ず重複させない
4. **`schemaVersion` フィールドはフロントマターには書くが、import 時は実は不要** — でも書いた方が安全
5. **`board` フィールドの値も import 時は無視される** — 識別ラベル目的で書いて OK

## 推奨デフォルト値

`SKILL.md` から再掲しますが、迷ったら以下:

- 付箋サイズ: width 200, height 160
- 凡例の見出し付箋サイズ: width 240, height 60, fontSize 18
- 凡例のカテゴリ付箋サイズ: width 110, height 60, fontSize 12
- 付箋グリッド: x ステップ 240, y ステップ 200
- フレーム枠の余白: 上 50px (タイトル分), 左右下 30px
- フレーム間スペース: 80px 以上
- コネクタのデフォルト色: `#475569`
- フレームのデフォルト色: `#475569` (例: アプリの初期値もこの色)
- `createdBy`: `"AI"`
- 付箋の `zIndex`: 1 から連番
