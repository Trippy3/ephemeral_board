# Ephemeral Board — 開発者向けドキュメント

本ドキュメントは Ephemeral Board のコードに変更を加える、または内部構造を理解したい開発者向けの詳細資料です。
利用方法・操作方法については [README.md](./README.md) を参照してください。

---

## 目次

- [プロジェクト構成](#プロジェクト構成)
- [Markdown 出力フォーマット仕様](#markdown-出力フォーマット仕様)
- [設定・カスタマイズ](#設定カスタマイズ)
- [アーキテクチャ概要](#アーキテクチャ概要)
- [技術的意思決定の背景](#技術的意思決定の背景)
- [拡張の候補](#拡張の候補)

---

## プロジェクト構成

```
ephemeral_board/
  package.json          # 依存関係・pnpm scripts
  pnpm-lock.yaml        # pnpm ロックファイル
  tsconfig.json         # TypeScript 設定
  server.ts             # Express + Socket.IO サーバー、API routes
  state.ts              # インメモリ状態管理（CRUD, TTL cleanup）
  shared.ts             # クライアント/サーバー共通の型定義・定数
  export.ts             # Markdown エクスポートロジック
  import.ts             # Markdown インポートロジック (Zod 検証)
  sanitize-server.ts    # サーバー側 HTML サニタイズ (defense-in-depth)
  scripts/
    share.ts            # `pnpm share` 用: サーバー起動 + Cloudflare Tunnel 起動
  docs/
    README.md           # ユーザー向けドキュメント
    DEVELOPMENT.md      # このドキュメント
  public/
    index.html          # 単一 HTML ページ
    app.ts              # クライアント TypeScript ソース（描画 / ソケット / ショートカット）
    interaction.ts      # ボード入力ディスパッチャ（pan / marquee / frame draw / edge anchor）
    app.js              # esbuild によるバンドル済み JS
    sanitize.ts         # クライアント側サニタイザ (DOMPurify ラッパ)
    style.css           # 全スタイル定義
```

### pnpm scripts

| コマンド | 動作 |
|---------|------|
| `pnpm dev` | サーバー（tsx watch）+ クライアントビルド（esbuild watch）を同時起動 |
| `pnpm build` | クライアント JS を minify ビルド |
| `pnpm start` | サーバーのみ起動（ウォッチなし） |
| `pnpm share` | `pnpm build` 後にサーバー + Cloudflare Tunnel を起動し公開 URL を表示 |
| `pnpm lint` | Biome で Lint チェック |
| `pnpm format` | Biome で Format 自動修正 |
| `pnpm check` | Biome で Lint + Format を自動修正 |
| `pnpm check:ci` | Biome で Lint + Format をチェックのみ（CI 用、書き換えなし） |
| `pnpm exec tsc --noEmit` | TypeScript の型チェック |

### コミット前のチェックフロー

ローカルで以下の順に実行して問題がないことを確認する:

```bash
pnpm check       # Lint / Format を自動修正
pnpm exec tsc --noEmit   # 型エラーがないか確認
pnpm build       # クライアントが本番ビルドできるか確認
```

CI 相当のチェックだけ走らせたい場合は `pnpm check:ci` を使う（自動書き換えなし）。
Biome の設定は `biome.json`、TypeScript の設定は `tsconfig.json` を参照。

### 主な依存パッケージ

| パッケージ | 用途 |
|-----------|------|
| `express`, `socket.io` | HTTP サーバー + WebSocket リアルタイム通信 |
| `nanoid` | 付箋・コネクタ・フレームの ID 生成 |
| `dompurify` | クライアント側 HTML サニタイズ |
| `js-yaml` | Markdown 内 YAML フェンスのシリアライズ / パース |
| `zod` | インポート時のスキーマ検証 |
| `cloudflared` (devDep) | `pnpm share` の Quick Tunnel 起動・バイナリ管理 |
| `qrcode-terminal` (devDep) | `pnpm share` 起動時にトンネル URL の QR コードをターミナル描画 |

---

## Markdown 出力フォーマット仕様

エクスポートされる Markdown は、ファイル先頭に YAML front-matter、続いて人間可読のサマリ、最後に再インポート用の YAML フェンスブロックが並ぶ構造を持ちます。

```markdown
---
schemaVersion: 2
board: default
exported: 2026-05-02T10:00:00.000Z
notes: 12
connectors: 4
frames: 2
---
## Data

_Do not hand-edit blocks below if you intend to re-import._

```yaml note
id: abc123
type: note
x: 120
y: 80
width: 200
height: 160
color: '#fef08a'
fontSize: 14
align: left
createdBy: Alice
createdAt: '2026-05-02T09:00:00.000Z'
updatedAt: '2026-05-02T09:30:00.000Z'
zIndex: 5
text: 'アイデア: オンボーディングフロー改善'
\```

\```yaml connector
id: conn1
type: connector
from: abc123
to: def456
style: arrow
color: '#475569'
createdAt: '2026-05-02T09:10:00.000Z'
updatedAt: '2026-05-02T09:10:00.000Z'
\```

\```yaml frame
id: frm1
type: frame
x: 50
y: 50
width: 600
height: 400
color: '#475569'
title: スプリント計画
createdAt: '2026-05-02T09:00:00.000Z'
updatedAt: '2026-05-02T09:00:00.000Z'
\```
```

- **Data セクション**: 全付箋・コネクタ・フレームを `\`\`\`yaml note|connector|frame` フェンスで機械読取可能な形で出力。位置・サイズ・色・書式・作成者・タイムスタンプを精密に保持。MD は「インポートでのボード復元」と「AI 等による解析」のみを目的とし、人間向けの要約は持たない。

エクスポート / インポートの実装は `export.ts` と `import.ts` を参照。スキーマ検証は Zod、HTML サニタイズはサーバー側で `sanitize-server.ts` を経由する二段防御。

---

## 設定・カスタマイズ

### ポート番号の変更

```bash
PORT=8080 pnpm dev
```

環境変数 `PORT` でサーバーのリッスンポートを変更できる（デフォルト: 3000）。

### 自動クリーンアップの挙動

`state.ts` 内の定数で制御:

| 定数 | デフォルト | 説明 |
|------|-----------|------|
| `CLEANUP_INTERVAL` | 10 分 | クリーンアップチェックの実行間隔 |
| `BOARD_TTL` | 24 時間 | ボードの最終操作からの保持期間 |

### 付箋の初期サイズ

`state.ts` の `createNote` 関数内:

| プロパティ | デフォルト |
|-----------|-----------|
| `width` | 200px |
| `height` | 160px |
| `fontSize` | 14px |
| `align` | left |

### 付箋の色の追加/変更

以下の 2 箇所を同時に変更する:

1. `shared.ts` — `NOTE_COLORS` 配列にエントリ追加（暗色なら `dark: true`）
2. `public/index.html` — ツールバーのカラーパレットボタンを追加

`public/app.ts` の付箋単体カラーピッカーは `NOTE_COLORS` から自動生成されるため変更不要。

### フォントサイズの選択肢

`shared.ts` の `FONT_SIZES` を変更（現在は 12 / 14 / 18 / 24 px）。

### ユーザーカーソルの色

`state.ts` の `USER_COLORS` 配列で定義（8 色ローテーション）。

---

## アーキテクチャ概要

```
┌─────────────────────────────────────────────────────┐
│                    Browser (Client)                  │
│                                                     │
│  index.html + app.js + style.css                    │
│  ├── DOM 操作で付箋を描画 (div + contenteditable)   │
│  ├── SVG レイヤーでコネクタを描画                   │
│  ├── div レイヤーでフレームを描画                   │
│  ├── Pointer Events API でドラッグ/リサイズ/選択    │
│  ├── Socket.IO Client で双方向通信                  │
│  ├── DOMPurify で書式付きテキストをサニタイズ       │
│  └── オプティミスティック更新                       │
└────────────────────┬────────────────────────────────┘
                     │ WebSocket (Socket.IO)
                     │ HTTP (export / import)
┌────────────────────┴────────────────────────────────┐
│               Node.js Server (server.ts)            │
│                                                     │
│  Express                                            │
│  ├── 静的ファイル配信 (public/)                     │
│  ├── GET  /api/boards/:id/export.md                 │
│  └── POST /api/boards/:id/import (replace)          │
│                                                     │
│  Socket.IO                                          │
│  ├── board:join → 全状態同期 (board:sync)           │
│  ├── note:* → CRUD → ブロードキャスト               │
│  ├── note:format → fontSize / align 同期            │
│  ├── note:duplicate → 付箋複製                      │
│  ├── note:restore → Undo 復元                       │
│  ├── connector:* → 矢印 CRUD                        │
│  ├── frame:* → 枠線 CRUD                            │
│  ├── cursor:move → 他ユーザーへ転送                 │
│  └── disconnect → ユーザー退出通知                  │
│                                                     │
│  state.ts (インメモリ Map)                          │
│  ├── boards: Map<boardId, BoardState>               │
│  │     ├── notes: Map<id, StickyNote>               │
│  │     ├── connectors: Map<id, Connector>           │
│  │     └── frames: Map<id, Frame>                   │
│  └── 10 分ごとに TTL チェック、24h 経過で自動削除   │
└─────────────────────────────────────────────────────┘
```

### リアルタイム同期の流れ

1. ユーザー A が付箋を操作 → クライアントがオプティミスティックに UI を即時更新
2. Socket.IO でサーバーにイベント送信（例: `note:move`）
3. サーバーがインメモリ状態を更新
4. サーバーが他の全クライアントにブロードキャスト（例: `note:moved`）
5. ユーザー B のクライアントが受信して DOM を更新

### テキスト編集の同期と書式

- 編集はクライアント側で 300ms デバウンス後にサーバーへ送信
- 送信前にクライアント側で DOMPurify によるサニタイズ
- サーバー側でも `sanitize-server.ts` の二重防御（script/iframe/event handler などを除去）
- 受信側は、そのテキストエリアにフォーカスしていなければ `innerHTML` を上書き
- フォーカス中なら上書きしない → 自分の入力が消えない

### コネクタ更新の流れ

- 付箋移動・リサイズ時、`refreshConnectorsForNote(id)` が SVG `<line>` の x1/y1/x2/y2 属性を再計算
- 付箋削除時、サーバーが `note:deleted.removedConnectorIds` を含めてブロードキャスト → クライアントは SVG line を除去

### 入力モデル（マウスとタッチの分岐）

ボードの入力は `interaction.ts` の `setupBoardInteractions()` に集約され、マウス/タッチ両方が PointerEvent ベースで処理される。`PointerEvent.pointerType` で挙動を分岐する設計のため、新たな全画面トグル（コネクタモード等）は追加しない。

| ジェスチャ / 入力 | マウス | タッチ |
|------------------|--------|--------|
| パン | 右クリック+ドラッグ / 中クリック+ドラッグ / Space+左ドラッグ | **1 本指で空白をドラッグ** |
| ズーム | wheel（カーソル中心） | **2 本指ピンチ**（中点中心、`app.ts` で実装） |
| 矩形選択 | 左ドラッグ（空白） | （非対応：1 本指は pan 専用） |
| 付箋作成 | dblclick（空白） | **空白を長押し** (~500ms) または **ダブルタップ** |
| 単タップ on 空白 | （0 サイズ marquee → 選択解除） | 選択解除 + 次タップ用に時刻記録 |
| 付箋選択 | クリック / Shift+クリック | タップ |
| コネクタ作成 | edge anchor (●) からドラッグ | 同左（選択中の付箋に表示） |
| フレーム描画 | F キー / ⬜ → 空白を左ドラッグ | ⬜ → 空白を 1 本指ドラッグ |

ピンチハンドラは `app.ts` 末尾（`activeTouches` Map と `pinchState`）にあり、`pointerdown` を**capture phase**で受けて `activeTouches` に追加する。2 本目が触れたら `cancelActiveDrag(boardContainer)` で `interaction.ts` 側の進行中ドラッグを破棄してから `pinchState` を初期化する。

タッチでの長押し / ダブルタップ判定は `interaction.ts` の `pointerdown` → `pointermove` → `finish` を貫く `tap: TouchPanMeta` 構造体で管理:

- `pointerdown`: pan を開始しつつ `setTimeout(LONG_PRESS_MS)` を仕込む
- `pointermove`: `TAP_MOVE_THRESHOLD` (8px) を超えたら `tap.moved = true` にして long-press timer を解除
- `pointerup`（`finish`）: 動かず短時間で離されたら、モジュールレベルの `tapHistory` を見て直近タップとの距離・時間で**ダブルタップ判定** → `deps.createNote()`、そうでなければ `deps.clearNoteSelection()` で単タップ扱い

CSS 側は `@media (hover: hover)` で hover 系スタイルを退避し、ホバー UI（アクションボタン / リサイズハンドル / edge anchor）は `.sticky-note.selected` でも表示されるようフォールバック化。`@media (pointer: coarse)` でタッチターゲット（anchor / 各ボタン / 色パレット）を拡大している。`#board-container` には `touch-action: none` を付与してブラウザのデフォルトジェスチャを抑制している。

---

## 技術的意思決定の背景

### なぜ Vanilla TypeScript か

付箋ボードは本質的に単一画面のアプリケーションで、ルーティングや複雑なコンポーネントツリーが不要。`position: absolute` の `div` と `contenteditable` でブラウザのネイティブ機能をそのまま活用できる。esbuild で単一バンドルすれば十分。

### なぜ書式付きテキストを HTML で持つか

- 太字 (`<b>`) は HTML の最も自然な表現
- contenteditable + `document.execCommand("bold")` でブラウザネイティブの操作と互換
- 構造化データ (Tiptap 等) を入れると Vanilla TS の設計思想と矛盾し、バンドルが肥大化
- セキュリティはクライアント DOMPurify + サーバー軽量フィルタの二段構え

### なぜ Markdown ラウンドトリップに YAML フェンスか

- 人間可読のサマリと機械読取可能なメタデータを **同じファイル** に同居させたい
- 既存の `\`\`\`yaml` フェンスは多くの Markdown レンダラーがハイライト対応
- フェンス内なら任意の構造化データを置けるため、将来エンティティ種別を増やしても拡張容易
- JSON front-matter 添付方式と異なり、ブロック単位での部分編集も可能

### なぜ LWW か

付箋テキストは短く、同一付箋を 2 人が同時に編集するケースは稀。CRDT は規模に対し過剰、ロック方式は UX が硬い。300ms デバウンスで細かい打鍵競合は実質抑制される。

### なぜ Undo を「自分の削除のみ」に絞ったか

- 移動 / 編集の Undo は連続イベントの粒度判定や、他ユーザーが同時編集した場合の整合性管理が複雑
- 「うっかり削除」は最も復元価値が高い操作
- 後から拡張可能なよう `undoStack` の構造は汎用化済み

### なぜ DB を使わないか（インメモリのみ）

- 「一時的なワークスペース」として設計されている
- 必要な成果物は Markdown エクスポートで保存 → インポートで再現
- DB を入れるとセットアップが増え、`pnpm dev` で即起動の手軽さが失われる
- サーバー再起動や 24 時間経過でデータが消えるのは意図的な仕様

### なぜモノリス構成か

- 起動コマンドが 1 つ (`pnpm dev`)
- CORS 設定が不要（Express が静的ファイルも配信）
- HTTP トンネルで公開するポートが 1 つで済む

### なぜ esbuild か

- クライアント側は単一ファイル → 単一バンドルのシンプルな構成
- ゼロコンフィグ、極めて高速 (~10ms)
- Vite の開発サーバーは Express との共存に追加設定が必要

### なぜ cloudflared か

- 無料で安定して利用可能
- Cloudflare Access と連携すればトンネルに認証をかけられる
- アプリ自体はトンネルツールに依存しないので ngrok 等でも動作する
- `cloudflared` npm パッケージ経由でバイナリの DL からトンネル起動までを `scripts/share.ts` に統合できる（ユーザー側は `pnpm share` 一発）

---

## 拡張の候補

| 拡張 | 実装の方針 |
|------|-----------|
| 画像の貼り付け | `note:create` にファイルアップロードを追加、Base64 でインメモリ保持 |
| Undo を移動 / 編集にも拡張 | 連続イベントの粒度判定、コラボ時の整合性ハンドリング |
| インポート時のマージ | 既存 ID と衝突した場合のリネーム / スキップ選択 UI |
| テンプレートボード | 初期状態の付箋配置を JSON で定義、`/template/retro` 等で起動 |
| 投票機能 | 付箋に投票カウンターを追加、Socket.IO イベントで同期 |
| コネクタのスタイル拡張 | 太さ・破線・曲線・ラベル付与 |
