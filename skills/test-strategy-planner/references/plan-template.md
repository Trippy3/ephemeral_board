# Plan Template

最終提示する計画書はこのセクション順を守る。セクション名は変えても良いが、
意味的に対応する内容を全て含むこと。

---

## 1. Context

なぜ今この変更が必要か。問題提起と狙い。1〜2 段落。

含める要素:
- 現状 (テストが何件あるか・どの種類が抜けているか・既存 CI の構成)
- 痛み (誰が、どんな場面で、何に困っているか)
- ゴール (このプランが達成された時の状態)

ゴールを書くときは「テストを足す」ではなく「壊れたら一番痛い X が回帰時に必ず
失敗する」のように **検証可能な形** で書く。

---

## 2. ガイドライン (記事から抽出した共通解)

参考記事があるならそれぞれから抽出した主張を、出典付きで 1 行ずつ並べる。
無い場合は `references/principles.md` の内蔵原則をそのまま引く。

例:
1. **Coverage 率は KPI にしない**。「壊れたら一番痛い動作」が必ず守られている
   状態を KPI にする (出典: t_wada savanna 2024)
2. **テストは usecase / セマンティクスに紐付ける**。実装内部 (private 関数 /
   DOM ノード並び順 / CSS class 細部) に紐付けると brittle になる (出典: coconala / freee)
3. **中段 (Integration / Medium) を最厚にする**。Unit だけでは結合バグ取り逃す、
   E2E だけでは遅く壊れやすい (出典: Testing Trophy 系)
4. **テストサイズは Small/Medium/Large で考える**。本プロジェクトでは Small + Medium
   が主戦場 (出典: t_wada savanna 2024)
5. **テストダブルは外部依存の接合点だけ**。state Map / Zod / DOMPurify 自体はモック
   しない (中身を信じる対象)

---

## 3. 4 層テスト戦略 (図 + 概要)

```
┌─────────────────────────────────────────────────┐
│ L4. E2E              ─ 3〜5 シナリオ    Large    │ ← 最小限
├─────────────────────────────────────────────────┤
│ L3. Integration      ─ ...             Medium   │ ← 厚め
├─────────────────────────────────────────────────┤
│ L2. Unit (Pure)      ─ 決定論的ロジック         │ ← 厚め
├─────────────────────────────────────────────────┤
│ L1. Static           ─ 型 / Linter              │ ← 既存
└─────────────────────────────────────────────────┘
```

層数は 3 でも 4 でも 5 でも良い。書くべきは「ここで何を取り、何を取らないか」。

---

## 4. 各層の詳細

層ごとに以下のサブセクションを必ず立てる:

### L?. <層の名前> (<ランナー / 環境>)

**狙い**: 1 行で書く。

**対象**:

| 対象 | テストファイル | ねらい (Why) |
|------|---------------|-------------|
| `module/file.ts` の `funcA` / `funcB` | `tests/unit/module.test.ts` | 何を担保するか・なぜ snapshot ではなく属性別 assertion か |

**書き方ルール**:

- snapshot 禁止 / モック範囲 / 非決定要素の扱い (FakeTimers etc.)
- ファイル粒度 (機能単位)
- セレクタ規則 (E2E のみ)

**コスト感**: 何 ms / 何 sec で完了するか。CI ゲートに乗せて良い長さか。

---

## 5. ツール構成

| 役割 | 採用 | 備考 |
|------|------|------|
| テストランナー | (例: Vitest) | (採用理由を 1 行) |
| DOM 環境 | (例: happy-dom) | (jsdom より速い / 何のテストで使う) |
| HTTP テスト | (例: supertest) | (なぜそれが妥当か) |
| Socket テスト | (例: socket.io-client) | (mock せず本物を使う方針) |
| E2E | (例: Playwright) | (CI 専用 / chromium のみ など) |

**新規 devDependencies (見込み)**: ランナー / DOM / HTTP / E2E パッケージを列挙。
このリストで人間が「導入コスト」を見積もれる。

---

## 6. ファイル / ディレクトリ構成

```
tests/
├── unit/...
├── integration/...
└── e2e/...
vitest.config.ts        # 設定ファイル一覧
playwright.config.ts
```

既存ファイルを **どう変更するか** も書く (リファクタが必要なら)。
例: `server.ts` の副作用 listen を factory に分離。**互換性のあるリファクタ**で
挙動は変わらない、と明示する (人間がレビューしやすい)。

---

## 7. 「壊れたら一番痛い」N 項目 → カバー先 traceability

| 不変条件 | 担保するテスト |
|---------|---------------|
| 1. (一行で書ける契約) | L3 xxx.test.ts + L4 #2 |
| 2. ... | L3 yyy.test.ts |

担保しない項目があれば、その項目を **明示的に書く** (なぜ落としたか含めて)。
例: 「項目 N は app.ts 内部の private state に閉じており単体抽出コストが高い。
ROI 低のため当面除外。app.ts 分割時に <undoStack.ts> を切り出してから unit 化する」

---

## 8. 書かない / 書いてはいけないテスト (アンチパターン)

このプロジェクト固有のアンチパターンを列挙する。共通アンチパターンは SKILL.md
に内蔵されているので、ここはプロジェクト固有のものを選ぶ。

例:
- DOM の snapshot test: app.ts は CSS/フォント・Pointer API に依存しすぎてフレーク源
- socket.io 内部のモック: 自作自演になる
- `scripts/share.ts` のテスト: 外部バイナリ起動だけで ROI ゼロ
- `state.ts` の private な Map を直接覗く: 振る舞い契約で検証する

---

## 9. CI / コミット前ゲート

`package.json` (or 該当する build manifest) の scripts をどう拡張するか。
コミット前ゲートと CI ゲートの粒度を分けるかどうか。

例:
```json
"test": "vitest",
"test:run": "vitest run",
"test:e2e": "playwright test",
"check:ci": "biome check . && tsc --noEmit && vitest run"
```

E2E はローカル必須にしない / CI 専用ジョブにするなどの方針を明示。

---

## 10. 段階的ロールアウト (PR 分割)

ROI 順に 3〜5 PR に分割。各 PR は前 PR の上に乗る。

1. **PR-1: 足回り** — ランナー導入 / 設定 / smoke test (空でも CI を通す状態にする)
2. **PR-2: L2 Unit (Pure)** — 純粋ロジック層
3. **PR-3: L3 Integration** — state contract / round-trip / HTTP / Socket
4. **PR-4: L4 E2E** — Playwright / 4〜5 シナリオ

各 PR の **完了条件** を明記。`pnpm check:ci` (or 該当 CI コマンド) を必ず単独で
通る状態を維持する、と書く。

---

## 11. 変更が必要な既存ファイル

| ファイル | 変更概要 |
|---------|---------|
| `package.json` | scripts と devDeps |
| `server.ts` (or 該当エントリ) | 副作用を factory に切り出すリファクタ |
| `AGENTS.md` / `CLAUDE.md` / `CONTRIBUTING.md` | 検証コマンド表に test 系を追記 |
| `docs/...` | テスト方針セクションを追記 |

新規追加ファイルもリスト化する (config / tests/**)。

---

## 12. 検証 (このプランが「効いた」ことの確認方法)

PR-N 完了時点で成立しているはずの状態を **検証可能な形** で書く。

例:
1. `pnpm test:run` が 30 秒以内 (Small + Medium のみ) で完了する
2. 「壊れたら一番痛い」表の項目 1〜N について、対応する `*.test.ts` を grep で
   1:1 に辿れる (上記 traceability 表で担保)
3. 試しに `state.ts` の `deleteNote` から `removedConnectorIds` の cascade ロジック
   を 1 行壊す → `state-contract.test.ts` と `socket-sync.test.ts` が両方 fail する

「テストが破壊検証で fail することを確認する」という mutation testing 的な
検証項目を入れると、テストが本当に意味あるかを評価できる。

これらを「Done の条件」とし、coverage 数値は計測はするが gate にしない、と明記する。
