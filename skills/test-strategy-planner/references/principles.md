# Test Strategy Principles (Built-in fallback)

参考記事が与えられないときの土台。これらは複数のテスト方法論記事
(freee アーキ起点 / Testing Trophy 系 / t_wada savanna 2024 など) から
共通して導かれる原則。

---

## A. KPI に置くもの・置かないもの

**置く**:
- 「壊れたら一番痛い動作」(プロジェクト固有の不変条件) が 1 つでも回帰したら
  CI が落ちる、という状態
- テストの実行時間が CI ゲートに乗る範囲内に収まっていること
  (Unit + Integration で 1〜30 秒)

**置かない**:
- カバレッジ率 (% で語ると無意味なテストを書きがち)
- テスト件数
- テスト書いた人の数

カバレッジは計測はする。ただし閾値で fail させない。低い数字を見て「あの領域は
意図的に未カバー」と判断するためのものにとどめる。

---

## B. テストサイズ (t_wada savanna)

3 階層で考える:

| サイズ | 実行時間 | 並行性 | 例 |
|-------|---------|--------|-----|
| Small | 数 100ms 以下 | 完全並行可 | 純粋関数・Zod 検証・DOMPurify ラッパ |
| Medium | 数秒以下 | 同一プロセス内で並行可 | in-memory DB / in-memory socket / 同一プロセス HTTP |
| Large | 数十秒〜分 | 並行性低い・I/O 多い | Playwright / 実 DB を立てる / 実外部サービス呼ぶ |

**Small を厚く・Large を最小限に** が ROI 最良。
Pyramid (古典) の Unit / Integration / E2E と必ずしも対応しない。Integration テスト
でも in-memory なら Medium、リアル DB なら Large になりうる。

---

## C. Testing Pyramid vs Testing Trophy

- **Pyramid** (古典): Unit を最厚に。E2E を最少に。Integration が中間。
- **Trophy** (Kent C. Dodds 系): Static + Unit + **Integration** + E2E。Integration を最厚に。
- **アイスクリームコーン (アンチパターン)**: E2E が最厚。Unit が少ない。フレーク多発・遅い。

このスキルが推す形は **Trophy 寄り** だが、プロジェクト性質で調整する:
- ロジック多い系 (パーサ / 計算 / state machine) は Pyramid 寄り
- IO 多い系 (Web app / API gateway) は Trophy 寄り
- 副作用ほぼ全て (CLI / batch / migration) は Pyramid + 1 本の E2E

---

## D. 壊れにくく書くコツ

1. **usecase / セマンティクスに紐付ける**
   - ✓ "deleteNote returns removedConnectorIds for ALL attached connectors"
   - ✗ "deleteNote の内部 forEach が 3 回呼ばれる"

2. **Public API 越しに検証する**
   - private 関数は export しない・テストしない
   - 振る舞い (戻り値 / 観測可能な状態) で検証する

3. **テストダブルは外部依存の境界線だけ**
   - in-process なライブラリ (Zod / DOMPurify / Map / Set) は本物を使う
   - ファイル IO / ネットワーク / 子プロセス / 時刻 はモック / Fake

4. **Snapshot を避ける** (例外: スナップショットしか書けない構造的な対象)
   - DOM / HTML / YAML / JSON 文字列のスナップショットは brittle
   - 代わりに parse して属性別 assertion

5. **セレクタは意味で指す** (E2E)
   - ✓ `getByRole('button', { name: 'Submit' })`
   - ✗ `.btn.btn-primary:nth-child(2)`

6. **テスト間の状態漏れを避ける**
   - 各テストで一意な ID (`newBoardId()` 等)
   - global state を持つ場合は `beforeEach` で reset、または unique key で分離

---

## E. アンチパターン (絶対にやらないこと)

1. **自作自演テスト** (t_wada): 実装を見ながらそれが通るテストを書く。設計と実装の
   ズレが見えなくなる
2. **Brittle / Fragile**: フォント差・OS 差・タイミング差で fail する。CI で flake の
   原因になる
3. **過剰モック**: 何もかもモックすると「モックの仕様」を検証する形になる。本物を
   通せる箇所は通す
4. **1 関数 1 ファイル原則**: 機能単位で 1 ファイル。`createNote.test.ts` ではなく
   `state-pure.test.ts`
5. **将来のための柔軟設計**: 半年後の機能のためにテストヘルパを抽象化する。テスト
   は今のコードに密着させる
6. **MUSTs の乱発**: 「ALWAYS X」「NEVER Y」と並べると brittle になる。why を書く

---

## F. 静的解析・型システムの位置づけ

L1 (静的検査) は「テスト戦略の土台」であって省けない。

- TypeScript の型チェック / Linter (Biome / ESLint) / Formatter
- これらはテストではないが、これらが落ちている状態でテスト戦略を語っても無駄
- L1 の不在 / 不足を見つけたら、まずそこを整えてから L2 以上を提案する

具体的に:
- `tsc --noEmit` が通っていないなら、「テスト書く前に型を直そう」と言う
- Linter / Formatter が無いなら導入を提案する

---

## G. 書く順序 (ROI 順)

このスキルの推奨順:

1. **L1 整備** (型 / Linter / Formatter)
2. **L2 Unit (Pure)** — 純粋ロジック層。実装速度が速く、コア機能の 4〜5 割を
   一気にカバーできる
3. **L3 Integration** — 残るコア機能を網羅。一番 ROI 高いゾーン
4. **L4 E2E** — ブラウザ実機でしか取れないバグ用 (シナリオ 3〜5 個に固定)

L4 を先に書こうとすると Playwright 設定・CI 統合で時間が溶けて L2/L3 が薄くなる。
順序を逆転しないこと。

---

## H. 「壊れたら一番痛い」を見つけるヒント

ヒアリング材料:
- `docs/`・`README.md`・`CONTRIBUTING.md`・`AGENTS.md`・`CLAUDE.md` の「落とし穴」「注意」セクション
- git log で「fix:」「revert:」が付いたコミットの理由
- インシデント履歴 (Slack / Linear / GitHub Issues)
- コードコメントで `WARNING` `IMPORTANT` `DO NOT` がある場所
- 「なぜこの ID は保持しないといけないのか」「なぜこの順序で消すのか」のような why

候補が出たら以下の問いで絞る:
1. これが壊れたら、ユーザーは即気づくか? データを失うか?
2. 内部リファクタで壊れがちか?
3. 一行で契約を書けるか?

3 つともイエスなら採用。1 つでもノーなら格下げ or 除外。
