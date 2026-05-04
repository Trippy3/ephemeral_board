# AGENTS.md

このファイルは Claude Code / Codex / Cursor / Zed などのコーディングエージェントが
本リポジトリで作業を始める際に、最短で文脈を掴むためのガイドです。

詳細は [`docs/README.md`](./docs/README.md)（ユーザー向け）と
[`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md)（開発者向け）を参照してください。
本ファイルは「最初に必ず守るべきこと」のみを簡潔に記述します。

---

## WHY — このプロジェクトは何のために存在するか

**Ephemeral Board** は、ローカルネットワーク + HTTP トンネルで動作する
リアルタイム共同付箋ボード (Miro / FigJam ライク) です。

設計上の重要な前提:

- **一時的なワークスペース**: ワークショップ・レトロ・ブレストなど、セッション単位で使う
- **永続化なし**: サーバー再起動 / 24h 無操作で全データが消えるのは**仕様**
- **永続化が必要ならエクスポート/インポート**: Markdown でラウンドトリップ復元できる
- **認証なし**: トンネル側 (Cloudflare Access 等) に委ねる
- **Vanilla TypeScript**: フレームワーク (React 等) 不使用。`esbuild` で 1 ファイルにバンドル

この前提を覆す変更 (DB 導入 / フレームワーク導入 / 認証実装) は
**必ず事前に人間に確認**してから着手してください。

---

## WHAT — リポジトリの構造

```
.
├── server.ts              # Express + Socket.IO エントリ
├── state.ts               # インメモリ状態管理 (notes / connectors / frames Map)
├── shared.ts              # クライアント/サーバー共通の型・定数
├── export.ts              # Markdown エクスポート (yaml フェンス + 人間可読サマリ)
├── import.ts              # Markdown インポート (Zod 検証 + サニタイズ)
├── sanitize-server.ts     # サーバー側 HTML サニタイズ (defense-in-depth)
├── public/
│   ├── index.html         # 単一 HTML ページ
│   ├── app.ts             # クライアントロジック (描画 / ソケット / ショートカット)
│   ├── interaction.ts     # ボード入力ディスパッチャ (pan / marquee / frame draw / edge anchor)
│   ├── sanitize.ts        # クライアント側 DOMPurify ラッパ
│   └── style.css
├── scripts/
│   └── share.ts           # `pnpm share` 用: サーバー + Cloudflare Quick Tunnel 起動
└── docs/
    ├── README.md          # ユーザー向けドキュメント
    └── DEVELOPMENT.md     # 開発者向けドキュメント
```

主要なドメイン型は `shared.ts` で定義:

- `StickyNote` — 付箋 1 枚 (位置・サイズ・色・書式・本文 HTML・作者など)
- `Connector` — 付箋 A → B を結ぶ矢印 / 線
- `Frame` — ボード上の囲み枠
- `BoardSnapshot` — 上記をまとめたエクスポート用構造
- `SCHEMA_VERSION` — エクスポート Markdown のスキーマ番号 (現在 `2`)

詳しい挙動・ショートカット一覧は `docs/README.md`、
設計判断・アーキテクチャ・コード定数の変更手順は `docs/DEVELOPMENT.md` を参照。

---

## HOW — どう動かして、どう検証するか

### ローカル起動

```bash
pnpm install
pnpm dev      # サーバー + クライアントの watch ビルド
# 動作確認は http://localhost:3000
```

ポート変更は `PORT=8080 pnpm dev`。

社内メンバーへ共有する一発コマンドは `pnpm share`
（本番ビルド + サーバー + Cloudflare Quick Tunnel を統合起動。詳細は `scripts/share.ts` 参照）。

### 検証コマンド

| 目的 | コマンド |
|------|----------|
| すべての CI ゲート (lint + 型 + テスト) | `pnpm check:ci` |
| Lint + Format 自動修正 | `pnpm check` |
| 型チェック単体 | `pnpm exec tsc --noEmit` |
| 自動テスト (watch) | `pnpm test` |
| 自動テスト (一発) | `pnpm test:run` |
| E2E (Playwright, ローカル/CI) | `pnpm test:e2e` |
| クライアント本番ビルド | `pnpm build` |
| サーバー単体起動 (watch なし) | `pnpm start` |

Linter / Formatter は **Biome** (`biome.json`) を使用。
`.claude/settings.local.json` の PostToolUse hook により、エージェントがファイルを編集すると自動で `biome check --write` が走ります。

**コードを変更したら、コミット前に必ず以下が通ることを確認してください:**

```bash
pnpm check:ci && pnpm build
```

`pnpm check:ci` は内部で `biome check . && tsc --noEmit && vitest run` を順に実行します。

### 動作確認のポイント

機能追加・変更時は次のいずれかを必ず実施してください。

1. **対応する自動テストを足す / 既存テストを更新する**
   - 純粋ロジック (`export.ts` / `import.ts` / `state.ts` / `sanitize-*.ts` / `interaction.ts` のジオメトリ) は `tests/unit/` に追加
   - state の振る舞い契約 / HTTP / Socket.IO / Markdown ラウンドトリップは `tests/integration/` に追加
   - テスト方針の詳細は `docs/DEVELOPMENT.md` の「テスト戦略」セクションを参照
2. UI に閉じる挙動 (ドラッグ / レンダリング / ホバー UI) は **ブラウザで触って**確認

特にテストと併せて目視確認すべき箇所:

- 複数タブを開いてリアルタイム同期が壊れていないか
- 付箋移動・コネクタ・フレーム・複数選択・コピペ・Undo (Ctrl+Z)
- Markdown のエクスポート → インポートのラウンドトリップ
- 黒色付箋で文字色が白に切り替わるか

ブラウザで触れない作業環境のときは、
「UI 検証は実施していない」旨を明示してください。

---

## このプロジェクトで踏みやすい落とし穴

エージェントが過去に間違えやすかったポイントを列挙します。

### 1. `note.text` はプレーンテキストではなく **HTML 文字列**

太字 / 整列 / フォントサイズの導入で `text` は `string` のまま **HTML を持ちます**。

- 表示時は必ず `sanitizeNoteHtml()` を通して `innerHTML` に書き込む (`textContent` で書くと書式が失われる)
- サーバーは `sanitize-server.ts` で防御線を張るが、**第一の防御はクライアント DOMPurify**

### 2. ID は変えない (Markdown ラウンドトリップが壊れる)

- 付箋・コネクタ・フレームの `id` はインポート時に**そのまま保持**される
- `restoreNote()` も ID を温存する
- 「複製のたびに新 ID」を避けたいケースは `duplicateNote()` を使う (新 ID を発行する正規ルート)

### 3. LWW (Last Write Wins) を覆さない

同期モデルは LWW を前提にしています。CRDT / 楽観ロック / 競合検出など
**整合性ロジックを足さないでください**。要件が出てきたら必ず人間と相談。

### 4. 削除イベントはコネクタ削除も同時に伝える

- `deleteNote()` の戻り値は `{ deleted, removedConnectorIds }`
- `note:deleted` ブロードキャストには `removedConnectorIds` が含まれる
- クライアントは付箋 DOM と SVG line の**両方**を消す責務がある

### 5. インポートは「置換」のみ。マージモードはない

`replaceBoard()` は既存 Map を全クリアしてから差し替えます。
途中で「マージ」「上書き」「ID 衝突解決」のような分岐を増やさない。

### 6. `console.log` を残さない

サーバー側のクリーンアップログ以外、コミット前に `console.log` を消してください。

### 7. 入力モデルには「コネクタモード」のような全画面トグルを増やさない

ボード操作の責務分担はこうなっています:

| 操作 | 入力 |
|------|------|
| パン | 右クリック+ドラッグ / 中クリック+ドラッグ / Space+左ドラッグ |
| 矩形選択 | 空白を左ドラッグ (Shift で追加選択) |
| 付箋移動 | 付箋を左ドラッグ (選択中のものは群移動) |
| コネクタ作成 | 付箋ホバー時の **edge anchor (●)** から左ドラッグ → ドラッグ中は全付箋の●が表示 → 別付箋の●にドロップ (アンカー同士で固定) |
| フレーム描画 | ⬜ ボタン (or `F`) でモード ON → 空白を左ドラッグ |

これらは `public/interaction.ts` の単一ディスパッチャに集約しています。
`boardContainer.pointerdown` のリスナーをむやみに増やすと再びコンフリクトが起きるので、
新しい操作を足したいときも `setupBoardInteractions()` を経由してください。

「コネクタを引くために専用モードに入る」のような全画面トグルは **追加しないでください** (要件がある場合は必ず人間に確認)。

タッチ端末対応も同じ方針で `pointerType === "touch"` による分岐に集約しています:

| 操作 | タッチ |
|------|--------|
| パン | 1 本指でドラッグ（空白） |
| ズーム | 2 本指ピンチ（`app.ts` の `activeTouches` / `pinchState`、capture phase） |
| 付箋作成 | 空白を長押し (~500ms) または **ダブルタップ** |
| 選択解除 | 空白を 1 回タップ |

タッチでは矩形選択を捨てて 1 本指 = pan に割り当てている点と、ホバーで出ていた UI（アクションボタン・edge anchor・リサイズハンドル）は CSS で `.sticky-note.selected` 時にも表示するよう `@media (hover: hover)` 退避済み。新規でホバーに依存した UI を増やす場合は同パターンで `.selected` フォールバックを必ず入れてください。

---

## コードを書くときのスタイル

詳細は [`~/.claude/rules/common/coding-style.md`](https://github.com/) などのグローバルルールに従ってください。
本リポジトリ固有のポイントだけ:

- **多くの小さなファイル** > 少数の巨大ファイル (現状 `app.ts` が肥大化気味なのは認識済み。
  さらに膨らむなら `connectors.ts` / `frames.ts` などへ分割を検討)
- **コメントはデフォルトで書かない**。書くのは「なぜ非自明な選択をしたか」だけ
- **不要な抽象化を入れない**。リクエストされていない汎用化・将来拡張は避ける
- **後方互換のための残置コード禁止**。不要なら消し切る

---

## 変更を加える前のチェックリスト

- [ ] その変更は `docs/README.md` の「設計判断」と矛盾しないか?
- [ ] 永続化 / 認証 / フレームワークの導入を伴わないか? (伴うなら人間に確認)
- [ ] `note.text` を HTML として扱っているか?
- [ ] LWW を前提に置いているか?
- [ ] `pnpm exec tsc --noEmit && pnpm build` が通るか?
- [ ] UI 変更ならブラウザで触ったか? (or 触れない理由を明示したか?)

---

## 参考

- ユーザー向け詳細: [`docs/README.md`](./docs/README.md)
- ライセンス: [`LICENSE`](./LICENSE)
