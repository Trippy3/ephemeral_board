# Inventory Checklist

Phase 2 (コードベース棚卸し) で漏れを防ぐためのチェック表。
SKILL.md の Phase 2 と組み合わせて使う。

---

## 探すべき関数 / モジュールのカテゴリ

### 1. 純粋ロジック (Pure)

入力 → 出力が決定論的、副作用なし。最もテストしやすい。

候補となる場所:
- `parse*` / `serialize*` / `format*` / `convert*` / `to*Json` / `from*` 系関数
- バリデーション (Zod / Joi / Yup スキーマ)
- 計算 / 集計 / フォーマット (sum / average / formatDate)
- サニタイズ / エスケープ
- ジオメトリ (距離計算 / 当たり判定 / 座標変換)
- ID 生成 / 文字列正規化

抽出方法:
```bash
grep -rn "^export function\|^export const.*= (" --include="*.ts" --include="*.js"
```

### 2. 状態 + 副作用ありロジック (Stateful)

内部の Map / Set / WeakMap に依存するが、依存性は注入可能 (DI)。中粒度。

候補:
- `state.ts` / `store.ts` / `cache.ts` / 各種 manager
- CRUD ヘルパ (createX / updateX / deleteX)
- `replaceX` / `bulk*` 系の置換操作
- TTL / Cleanup / Eviction (`startCleanup` 等)
- カウンタ / シーケンス (`bringToFront`, zIndex 等)

落とし穴:
- module-level 変数を持つと test 間で state が漏れる → unique ID で分離

### 3. IO バウンダリ

完全なテストには実物 or in-memory 代替が必要。

候補:
- HTTP エンドポイント (Express / Fastify / Hono / Next.js handlers)
- WebSocket / Socket.IO ハンドラ
- DOM 操作 (drag / pointer / keyboard event)
- ファイル IO / 子プロセス / 外部バイナリ
- Database (SQL / NoSQL / Redis)
- Message Queue (SQS / Kafka / NATS)
- 時刻依存ロジック (cron / setInterval / setTimeout)

抽出方法:
```bash
grep -rn "app\.\(get\|post\|put\|delete\|patch\|use\)(" --include="*.ts"
grep -rn "socket\.on(\|io\.on(" --include="*.ts"
grep -rn "addEventListener\|onclick\|ondblclick" --include="*.ts"
grep -rn "spawn\|exec\|fork\|child_process" --include="*.ts"
```

### 4. 「壊れたら一番痛い」コア機能 (Critical Invariants)

これが Phase 3 の核。SKILL.md と principles.md (Section H) の見つけ方を参照。

このセクションでやること:
- ドキュメントの「落とし穴」「注意」セクションを必ず読む (`docs/`・`AGENTS.md`・`CLAUDE.md`)
- WARNING / IMPORTANT / DO NOT を grep で全部出す:
```bash
grep -rn "WARNING\|IMPORTANT\|DO NOT\|落とし穴\|注意\|TODO.*fragile" --include="*.md"
```
- git log で `fix:` / `revert:` のメッセージを最近 50 件読む

### 5. テストしづらい領域 (Pain Points)

ROI 低・コスト高なのでスコープアウト or 別途扱う領域。

典型例:
- Cloudflared / ngrok などの外部トンネル子プロセス
- ブラウザ拡張 / Service Worker
- Push 通知
- 決済プロバイダの sandbox 連携 (たまに本物 sandbox を呼ぶ程度)
- パフォーマンス・負荷試験
- アクセシビリティ自動チェック (axe 系) は別軸の話なので戦略レイヤーでは含めない

これらは Phase 5 (アンチパターン) で「テストしない」と明示する。

---

## レポート形式 (ユーザーへ返す)

各カテゴリで見つけたものを以下のように 1500 字程度で構造化する:

```markdown
### 1. 純粋ロジック (テストしやすい)

**module/file.ts**
- `funcA()` (line N) - 何をする関数か (1 行)
- `funcB()` (line M) - ...
```

行番号付きで引用 (`module/file.ts:42` 形式)。あとで計画書から逆引きできるように。

最後に「**推奨テスト優先度**」を 1 行で並べる:
> 推奨テスト優先度: pure-A → pure-B → state-contract → IO-X → DOM-Y

これをそのまま Phase 4 (層設計) と Phase 5 (PR 分割) に流し込む。

---

## ChecK list (Phase 2 完了条件)

棚卸しが完了した、と判断する基準:

- [ ] 全 `.ts` / `.js` ソースファイルに目を通した
- [ ] `tests/` (or 該当ディレクトリ) の既存テストの有無を確認した
- [ ] CI 設定 (`.github/workflows/`・`.gitlab-ci.yml` etc.) を読んだ
- [ ] `package.json` の scripts と dev/runtime deps を読んだ
- [ ] ドキュメント (`docs/`・README) の「落とし穴」「注意」セクションを読んだ
- [ ] 5 カテゴリそれぞれに関数/モジュールが (該当があれば) 列挙されている
- [ ] 各候補に **行番号付きの引用** が付いている
- [ ] 「推奨テスト優先度」が 1 行で書ける状態になっている

これが揃ってから Phase 3 (壊れたら一番痛い) に進む。
