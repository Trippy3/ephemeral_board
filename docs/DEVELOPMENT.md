# Ephemeral Board — 開発者向けドキュメント

本ドキュメントは Ephemeral Board のコードに変更を加える、または内部構造を理解したい開発者向けの詳細資料です。
利用方法・操作方法については [README.md](./README.md) を参照してください。

---

## 目次

- [プロジェクト構成](#プロジェクト構成)
  - [pnpm scripts](#pnpm-scripts)
  - [`pnpm share` の CLI フラグ仕様](#pnpm-share-の-cli-フラグ仕様)
  - [E2E (Playwright) のセットアップ](#e2e-playwright-のセットアップ)
  - [テスト戦略](#テスト戦略)
- [Markdown 出力フォーマット仕様](#markdown-出力フォーマット仕様)
  - [スキーマを変更したときの追従先](#スキーマを変更したときの追従先)
- [設定・カスタマイズ](#設定カスタマイズ)
- [アーキテクチャ概要](#アーキテクチャ概要)
  - [入力モデル（マウスとタッチの分岐）](#入力モデルマウスとタッチの分岐)
- [スケーラビリティの想定範囲](#スケーラビリティの想定範囲)
- [技術的意思決定の背景](#技術的意思決定の背景)
  - [Quick Tunnel の利用規約上の制約 (TryCloudflare)](#quick-tunnel-の利用規約上の制約-trycloudflare)
  - [Quick Tunnel の不安定さと既定 verbose の理由](#quick-tunnel-の不安定さと既定-verbose-の理由)
  - [cloudflared 診断ログの読み方](#cloudflared-診断ログの読み方)
  - [自前 cloudflared バイナリで起動する](#自前-cloudflared-バイナリで起動する)
  - [本番風起動（Quick Tunnel + プロセスマネージャ）](#本番風起動quick-tunnel--プロセスマネージャ)
  - [Named Tunnel への移行（認証 / 固定 URL が必要なとき）](#named-tunnel-への移行認証--固定-url-が必要なとき)
- [拡張の候補](#拡張の候補)

---

## プロジェクト構成

```
ephemeral_board/
  package.json              # 依存関係・pnpm scripts
  pnpm-lock.yaml            # pnpm ロックファイル
  tsconfig.json             # TypeScript 設定
  biome.json                # Biome (Lint / Format) 設定
  vitest.config.ts          # Vitest (unit / integration) 設定
  playwright.config.ts      # Playwright (E2E) 設定
  server.ts                 # Express + Socket.IO サーバー、API routes
  state.ts                  # インメモリ状態管理（CRUD, TTL cleanup）
  shared.ts                 # クライアント/サーバー共通の型定義・定数
  export.ts                 # Markdown エクスポートロジック
  import.ts                 # Markdown インポートロジック (Zod 検証)
  sanitize-server.ts        # サーバー側 HTML サニタイズ (defense-in-depth)
  scripts/
    share.ts                # `pnpm share` 用: サーバー起動 + Cloudflare Tunnel 起動
  docs/
    README.md               # ユーザー向けドキュメント
    DEVELOPMENT.md          # このドキュメント
  public/
    index.html              # 単一 HTML ページ
    app.ts                  # クライアント TypeScript ソース（描画 / ソケット / ショートカット）
    interaction.ts          # ボード入力ディスパッチャ（pan / marquee / frame draw / edge anchor）
    app.js                  # esbuild によるバンドル済み JS
    sanitize.ts             # クライアント側サニタイザ (DOMPurify ラッパ)
    style.css               # 全スタイル定義
  tests/
    unit/                   # 純粋ロジック / ジオメトリ / サニタイザの単体テスト
    integration/            # state 振る舞い契約 / HTTP / Socket.IO / Markdown ラウンドトリップ
    e2e/                    # Playwright によるエンドツーエンド (xss / 同期 / 黒付箋反転)
  .claude/
    settings.local.json     # PostToolUse hook (`biome check --write`) 等
    skills/
      create-sticky-board/  # 議事録などを Ephemeral Board 用 .md に変換する Claude Code スキル
        SKILL.md            # レイアウト規則・色の使い分け・ID 発行ルール
        references/
          example_output.md # 完全な出力サンプル
          format_spec.md    # フィールド・バリデーション仕様
```

### pnpm scripts

| コマンド | 動作 |
|---------|------|
| `pnpm dev` | サーバー（tsx watch）+ クライアントビルド（esbuild watch）を同時起動 |
| `pnpm build` | クライアント JS を minify ビルド |
| `pnpm start` | サーバーのみ起動（ウォッチなし） |
| `pnpm share` | `pnpm build` 後にサーバー + Cloudflare Quick Tunnel を起動し公開 URL を表示。CLI フラグの一覧は [`pnpm share` の CLI フラグ仕様](#pnpm-share-の-cli-フラグ仕様) を参照 |
| `pnpm lint` | Biome で Lint チェック |
| `pnpm format` | Biome で Format 自動修正 |
| `pnpm check` | Biome で Lint + Format を自動修正 |
| `pnpm check:ci` | CI ゲート: `biome check . && tsc --noEmit && vitest run` を順に実行 |
| `pnpm test` | Vitest を watch モードで起動 |
| `pnpm test:run` | Vitest を一発実行（unit + integration） |
| `pnpm test:e2e` | Playwright で E2E を実行（chromium のみ。初回は `pnpm exec playwright install chromium` でブラウザを取得） |
| `pnpm exec tsc --noEmit` | TypeScript の型チェック単体 |

#### `pnpm share` の CLI フラグ仕様

`scripts/share.ts` の `parseFlags()` が以下のフラグを解釈する。`startServer()` でローカル起動 → `Tunnel.quick(localUrl)` で TryCloudflare へ接続 → URL を表示する流れに作用する。

| フラグ | 既定 | 動作 |
|--------|------|------|
| `--qr` / `-q` | OFF | URL 取得後に `qrcode-terminal` で QR コードを stdout に描画 |
| `--quiet` / `-s` | OFF | cloudflared 診断ログ（connected / disconnected / stderr / error / exit）を抑止し、URL バナーのみ表示 |
| `--verbose` / `-v` | (既定 ON 相当) | 診断ログを明示的に有効化 |

優先順位: `--quiet` と `--verbose` が同時に渡されると `--verbose` が勝つ（`explicitVerbose || !quiet` という式のため）。何も指定しない場合は **既定で verbose** が有効になる。これは Quick Tunnel が混雑時のエッジ切断・`*.trycloudflare.com` の不可達など外部要因で落ちやすく、運用者が状況を把握できる必要があるため (`scripts/share.ts:151-161` 参照)。

ターミナルが TTY のときは raw mode に入り、以下のキーを受け付ける:

| キー | 動作 |
|------|------|
| `b` | 既定ブラウザでトンネル URL を開く |
| `c` | クリップボードへコピー（mac: `pbcopy` / win: `clip` / linux Wayland: `wl-copy` / linux X11: `xclip`） |
| `q` / `Ctrl+C` | `tunnel.stop()` → `close()` の順でクリーンシャットダウン |

#### E2E (Playwright) のセットアップ

`pnpm test:e2e` は chromium のみで実行される（`playwright.config.ts`）。CI / 新規環境では初回のみブラウザバイナリのダウンロードが必要:

```bash
pnpm exec playwright install chromium
```

ブラウザバイナリは Playwright の管理ディレクトリにキャッシュされるためリポジトリには含めない。CI ではキャッシュキーを `pnpm-lock.yaml` ハッシュで切るのが定石。失敗時は `pnpm exec playwright install --force chromium` で再取得する。

### コミット前のチェックフロー

ローカルで以下の順に実行して問題がないことを確認する:

```bash
pnpm check       # Lint / Format を自動修正
pnpm check:ci    # biome + tsc + vitest を順に実行
pnpm build       # クライアントが本番ビルドできるか確認
```

`pnpm check:ci` は自動書き換えなしで `biome check . && tsc --noEmit && vitest run` を直列実行する。
Biome の設定は `biome.json`、TypeScript の設定は `tsconfig.json`、テストランナーは `vitest.config.ts` を参照。

### テスト戦略

自動テストは 3 層構成で、カバレッジ率は KPI にせず「壊れたら一番痛い動作」が回帰した時に必ず失敗することを目的にしている。

| 層 | 場所 | ねらい |
|----|------|--------|
| Unit (Pure) | `tests/unit/` | `export.ts` / `import.ts` / `sanitize-*.ts` / `state.ts` の純粋ロジック・`anchorPoint` などジオメトリ |
| Integration (Medium) | `tests/integration/` | `state.ts` の振る舞い契約 (cascade / replaceBoard / LWW)、Markdown ラウンドトリップ、HTTP API、Socket.IO 同期 |
| E2E | `tests/e2e/` (任意) | 2 タブ同期 / MD 往復の UI 統合 / XSS 防御 / 黒付箋の文字色反転 |

書くときの方針:

- **Snapshot テストは禁止**。DOM・YAML 文字列の細部に依存して壊れる
- **Socket.IO の transport をモックしない**。本物の `httpServer.listen(0)` でポートを開いて 2 クライアントを接続する (`tests/integration/socket-sync.test.ts` 参照)
- **state.ts の private な Map を直接覗かない**。`getBoardSnapshot()` の戻り値で振る舞いを検証する
- **同一テストファイル内の状態漏れを避ける**。各テストで `newBoardId()` のように一意なボード ID を使う
- **DOMPurify を happy-dom 上でテストするときは `<script>` タグ入力を避ける**。happy-dom が script element を実行しようとして unhandled error になる。`<script>` 除去は `sanitize-server.ts` 側の regex テストで担保する

「壊れたら一番痛い」項目とそれを担保するテストの対応:

| 不変条件 | 担保するテスト |
|---------|--------------|
| Markdown ラウンドトリップ (ID 保持) | `tests/integration/markdown-roundtrip.test.ts` |
| 付箋削除時のコネクタ cascade (`removedConnectorIds`) | `tests/integration/state-contract.test.ts` + `tests/integration/socket-sync.test.ts` |
| LWW 同期 | `tests/integration/state-contract.test.ts` |
| HTML サニタイズ (XSS) | `tests/unit/sanitize-server.test.ts` + `tests/unit/sanitize-client.test.ts` |
| コネクタ edge anchor の幾何 | `tests/unit/connector-geometry.test.ts` |
| HTTP エンドポイント (export / import) | `tests/integration/http.test.ts` |

### 主な依存パッケージ

| パッケージ | 用途 |
|-----------|------|
| `express`, `socket.io` | HTTP サーバー + WebSocket リアルタイム通信 |
| `nanoid` | 付箋・コネクタ・フレームの ID 生成 |
| `dompurify` | クライアント側 HTML サニタイズ |
| `js-yaml` | Markdown 内 YAML フェンスのシリアライズ / パース |
| `zod` | インポート時のスキーマ検証 |
| `cloudflared` (devDep) | `pnpm share` の Quick Tunnel 起動・バイナリ管理 |
| `qrcode-terminal` (devDep) | `pnpm share --qr` 指定時にトンネル URL の QR コードをターミナル描画 |

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

#### スキーマを変更したときの追従先

`shared.ts` の `SCHEMA_VERSION` / 各エンティティ型・`import.ts` の Zod スキーマを変更したら、以下も同時に追従させる必要がある:

| 追従先 | 役割 |
|--------|------|
| `tests/integration/markdown-roundtrip.test.ts` | export → import の往復で ID / フィールドが保持されることを担保 |
| `tests/unit/export.test.ts` / `tests/unit/import.test.ts` | フェンス出力 / Zod バリデーションの単体検証 |
| `.claude/skills/create-sticky-board/references/format_spec.md` | Claude Code スキルが参照するフィールド・バリデーション仕様 |
| `.claude/skills/create-sticky-board/references/example_output.md` | スキルが模倣する完全な出力サンプル |
| `.claude/skills/create-sticky-board/SKILL.md` | レイアウト規則・ID 発行ルール（`SCHEMA_VERSION` を直接固定している場合は要更新） |

`create-sticky-board` スキルは Claude Code 起動時にプロジェクトから自動ロードされ、生成 MD は本リポジトリの `import.ts` にそのまま流せる前提で組まれている。スキル側のサンプル / 仕様が古いまま放置されると Claude が古いスキーマで生成し、インポート時に Zod で弾かれる。

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

ボードの入力は `interaction.ts` の `setupBoardInteractions()` に集約され、マウス / タッチ両方が PointerEvent ベースで処理される。`PointerEvent.pointerType` で挙動を分岐する設計のため、新たな全画面トグル（コネクタモード等）は追加しない。**ジェスチャ一覧表は [AGENTS.md](../AGENTS.md) の「踏みやすい落とし穴 #7」を参照**。本節は各レイヤの**実装ポイント**だけを残す。

#### dispatcher の責務分担

- `interaction.ts` の `setupBoardInteractions()` が `boardContainer.pointerdown` を**唯一の入口**として持つ。pan / marquee / frame draw / edge anchor から伸びるドラッグはここで分岐する
- `boardContainer` に `pointerdown` リスナーを直接足さない。新しい操作を増やしたいときも `setupBoardInteractions()` の `deps` 経由で組み込む（コンフリクトの再発防止）

#### ピンチズーム（`app.ts` 末尾）

`activeTouches: Map` と `pinchState` で 2 本指の状態を保持する。実装上の要点:

- `pointerdown` を **capture phase** で受けて `activeTouches` に追加する（dispatcher より先に拾うため）
- 2 本目のタッチが入った瞬間に `cancelActiveDrag(boardContainer)` で `interaction.ts` 側の進行中ドラッグを破棄してから `pinchState` を初期化する
- ズームの中心は 2 本指の中点。スケール倍率はピンチ開始時の距離との比

#### 長押し / ダブルタップ判定

`interaction.ts` の `pointerdown` → `pointermove` → `finish` を貫く `tap: TouchPanMeta` 構造体で管理:

- `pointerdown`: pan を開始しつつ `setTimeout(LONG_PRESS_MS)` を仕込む
- `pointermove`: `TAP_MOVE_THRESHOLD` (8px) を超えたら `tap.moved = true` にして long-press timer を解除
- `pointerup` (`finish`): 動かず短時間で離されたら、モジュールレベルの `tapHistory` を見て直近タップとの距離・時間で**ダブルタップ判定** → `deps.createNote()`、そうでなければ `deps.clearNoteSelection()` で単タップ扱い

#### CSS 側のフォールバック

- `@media (hover: hover)` で hover 系スタイルを退避し、ホバー UI（アクションボタン / リサイズハンドル / edge anchor）は `.sticky-note.selected` でも表示されるようフォールバック化
- `@media (pointer: coarse)` でタッチターゲット（anchor / 各ボタン / 色パレット）を拡大
- `#board-container` には `touch-action: none` を付与してブラウザのデフォルトジェスチャを抑制

新規でホバー依存の UI を追加する場合は、必ず同パターンで `.selected` フォールバックを入れる。

---

## スケーラビリティの想定範囲

Ephemeral Board は **ワークショップ・レトロ・ブレストなど少人数（〜10 名程度）の同時利用** を想定して設計されている。
大量ユーザー（数十人〜）の同時アクセスは想定外で、以下の理由で表示・体感が劣化する。新機能を入れるときは「人数が増える方向の負荷」を増やしていないか確認すること。

### 想定外領域で起きる現象

| 箇所 | 現象 | 根拠 |
|------|------|------|
| ツールバーのユーザーバッジ列 | 人数が多いと右側ボタン群（Import / Export / Zoom 等）を押し出して画面外に切れる | `#users-list` は `flex` 横並び・`flex-wrap` なし・`overflow` なし。`body { overflow: hidden }` のためスクロールでも逃げられない |
| リモートカーソルラベル | 同じ領域にカーソルが集まると名前ラベル（`white-space: nowrap`、幅制限なし）が重なって判読不能 | `.cursor-label` は省略やマージ機構を持たない |
| Socket.IO トラフィック | カーソル放送が **約 N² × 33 msg/sec** 規模に増える（30ms スロットル × 全員ブロードキャスト） | `public/app.ts` の `throttledCursorEmit` と `server.ts` の `socket.to(currentBoard).emit("cursor:moved", ...)` |
| クライアント DOM 負荷 | 各リモートカーソルに `transition: left/top 0.1s linear` が掛かっているため、大量カーソルが常時アニメーションする | `public/style.css` の `.remote-cursor` |

### 緩和済みの箇所

- **ユーザーバッジの折りたたみ**: `MAX_VISIBLE_USER_BADGES` (現在 8) を超えると、超過分は「+N」バッジに集約され、`title` 属性に名前一覧が入る (`public/app.ts` の `renderUserBadges()`)。これによりツールバーが押し出される問題は緩和されるが、**カーソル / トラフィック側の劣化は残る**。

### 大量ユーザーが要件になった場合の検討事項

要件として現実化したときの拡張ポイント。**事前に人間と相談した上で**着手すること（プロジェクトの設計前提を覆す変更になりうる）。

- カーソル放送のレート制限・距離ベース間引き（同一画面内のみ転送、移動量が小さいときは送らない、など）
- カーソルラベルの省略 / 重なり時のグルーピング表示
- ボード単位の最大同時接続数の上限化と上限超過時の入室拒否
- Socket.IO の Redis adapter 等によるサーバー水平スケール（インメモリ前提を崩すため、本リポジトリの設計判断と矛盾する点に注意）

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

- npm パッケージ (`cloudflared`) からバイナリ DL → 起動まで `scripts/share.ts` に統合でき、ユーザー側は `pnpm share` 一発で済む
- **Quick Tunnel** は Cloudflare アカウント不要で、社内の即席共有用途に十分（ただし認証なし・uptime 保証なし）
- 認証や安定性が必要になったら **Named Tunnel** に移行すれば Cloudflare Access 連携が可能になる（後述）
- アプリ自体はトンネルツールに依存しないので ngrok 等でも動作する

#### Quick Tunnel の利用規約上の制約 (TryCloudflare)

`Tunnel.quick()` が立てる接続は Cloudflare の **TryCloudflare**（無料の Quick Tunnel）で、[公式ドキュメント](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/) が明示する以下の制約がある。本リポジトリの設計判断と運用方針はすべてこれを前提に組まれているため、新機能を入れる際もこの枠内で考える。

| 項目 | 制約 | 本リポジトリでの含意 |
|------|------|---------------------|
| 用途 | "intended for testing and development only" / "not for deploying a production website" | 「ワークショップ・レトロ・ブレストなどセッション単位で使う」という設計前提 (`AGENTS.md` 冒頭参照) と整合する。常時稼働の業務サイトとして使うのは想定外 |
| SLA / uptime | 保証なし。予告なく仕様変更・エッジ切断が起きうる | 既定 verbose で診断ログを stderr に出している直接の理由（次節）。長時間運用が必要なら Named Tunnel に移行する |
| 同時 in-flight リクエスト | 200 まで。超過は `429` | 少人数ワークショップでは通常届かないが、Socket.IO が long-poll fallback に落ちる経路では一気に消費される可能性がある |
| Server-Sent Events | 非対応 | 本アプリは Socket.IO の WebSocket トランスポートで動いているため実害なし。今後 SSE 系の機能（例えば export ストリーミング等）を足す場合は Quick Tunnel 経路では動かないことを前提に設計する |

ライセンス面のメモ:

- **cloudflared 本体**は Apache-2.0、npm の **`cloudflared` パッケージ**（`scripts/share.ts` から利用）は MIT
- npm パッケージはバイナリを同梱せず、初回起動時に Cloudflare 公式 GitHub Releases から DL する方式 → 本リポジトリは cloudflared バイナリを再配布していない
- README / CLI 出力で「Cloudflare Tunnel を使う」旨を事実説明として記載するのは Cloudflare 商標ポリシー上問題なし。逆にプロダクト名・ロゴ付き派生物の作成や「Cloudflare 公式パートナー」を匂わせる表現はしないこと

#### Quick Tunnel の不安定さと既定 verbose の理由

`scripts/share.ts` は `Tunnel.quick()` 経由で **TryCloudflare（アカウント無し版 = Quick Tunnel）** を立てている。これは Cloudflare 自身が「uptime 保証なし・利用規約遵守の前提でしか使うな」と明言しているもので、混雑時のエッジ切断や `*.trycloudflare.com` のホスト不可達など、アプリ側からは打つ手がない不安定要因がある。

そのため `pnpm share` は **既定で診断ログを stderr に出す**。何も指定しなければ verbose 扱いになり、ノイズを抑えたいときだけ `pnpm share --quiet` を使う、という設計。

**Quick Tunnel に Cloudflare Access は被せられない**（Access の前提となる Cloudflare アカウント / ゾーン管理がないため）。認証付きで運用したい場合は Named Tunnel への移行が必要。

#### cloudflared 診断ログの読み方

`pnpm share` が既定で出すログは `attachVerboseTunnelLogging()` (`scripts/share.ts:169-200`) が tunnel イベントを stderr に流したもの。`\x1b[2m[cloudflared:<label>]\x1b[0m` 形式で薄字表示される。

| ラベル | 意味 | 観点 |
|--------|------|------|
| `bin` / `version` | 使用バイナリのパスと期待バージョン | 自前バイナリで動いているか確認 |
| `connected` | エッジへの接続成功 (`id`/`ip`/`location`) | location が地理的に近いか、複数 connection が張れているか |
| `disconnected` | エッジ切断（自動再接続される） | 連続発生していたら経路品質を疑う |
| `stderr` | cloudflared バイナリ自身の生 stderr 行 | 警告 / リトライ / DNS 解決エラー等の生情報 |
| `error` | tunnel オブジェクトの error イベント | 致命的に近い障害 |
| `exit` | プロセス終了 (`code` / `signal`) | code !== 0 や予期せぬ signal を要調査 |

URL バナーが出ない場合は `connected` ログの有無で「DNS / 接続フェーズで詰まった」のか「URL 配布フェーズで詰まった」のかを切り分けられる。

#### 自前 cloudflared バイナリで起動する

npm パッケージ同梱のバイナリを使わず、システムにインストールした `cloudflared` で同じ振る舞いを再現するなら以下:

```bash
# 1) サーバーのみ起動 (PORT 既定 3000)
pnpm start &

# 2) 別シェルでトンネルだけ立てる
cloudflared tunnel --url http://localhost:3000
```

この構成は `scripts/share.ts` のインタラクティブキー（`b` / `c` / `q`）と QR 描画は失うが、**バイナリのバージョン不整合**（`CLOUDFLARED_VERSION` と乖離した OS パッケージ版）を切り分けたいときに有効。

#### 本番風起動（Quick Tunnel + プロセスマネージャ）

`pnpm share` は前面プロセスでの起動が前提。長時間運用するなら以下のいずれかを検討する:

- `tmux` / `screen` セッションで `pnpm share --quiet` を放置する（診断ログの抑止と組み合わせると見やすい）
- systemd の user unit で `ExecStart=/usr/bin/pnpm share` を `Restart=on-failure` で回す
- PM2 等のプロセスマネージャに `pnpm start` + `cloudflared` を別エントリで登録する（前項の自前バイナリ構成と相性が良い）

ただし Quick Tunnel の URL は **再起動のたびに変わる**点に注意。固定 URL が必要なら Named Tunnel に切り替える。

#### Named Tunnel への移行（認証 / 固定 URL が必要なとき）

Quick Tunnel の制約（uptime 保証なし・URL ランダム・Access 不可）を外したいケースの恒久対策。本リポジトリのアプリケーションコードに変更は不要で、トンネル運用だけ別レーンに乗せ替える形になる。

最小手順の概要:

1. Cloudflare アカウントを用意し、自分のドメインを Cloudflare に乗せる（DNS をネームサーバーごと委任）
2. `cloudflared tunnel login` で認証 → `cloudflared tunnel create <name>` で Named Tunnel 作成
3. `~/.cloudflared/config.yml` に `tunnel: <name>` / `ingress: [{ hostname: board.example.com, service: http://localhost:3000 }, ...]` を記述
4. `cloudflared tunnel route dns <name> board.example.com` で DNS レコードを発行
5. `cloudflared tunnel run <name>`（または systemd service として登録）で常駐

認証をかける場合はさらに Cloudflare Zero Trust ダッシュボードで **Access Application** を作成し、Identity Provider（Google Workspace / Okta / one-time PIN 等）と Access Policy を設定する。

公式ドキュメント:

- [Create a remotely-managed tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/create-remote-tunnel/) — Named Tunnel 作成手順
- [Cloudflare Zero Trust — Add a self-hosted application](https://developers.cloudflare.com/cloudflare-one/applications/configure-apps/self-hosted-apps/) — Access の設定

> **アプリ側に変更は不要**: `state.ts` も `server.ts` もトンネル経由かどうかを判別していない。Named Tunnel 化は完全に運用レイヤの差し替えで完結する。

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
