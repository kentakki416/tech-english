---
name: create-pr
description: GitHub の Pull Request を作成する skill。本文は「背景 / 対応内容 / 補足・注意点 / test plan」の 4 セクション固定で、assignee には必ず自分（@me）を指定する。base ブランチはリポジトリの default branch（main / master / develop など）をデフォルトにし、stacked PR の場合のみ未マージの親ブランチを base にする（gh pr create 直前に base の state を確認し、MERGED/CLOSED・不存在のブランチは絶対に base にせず default branch にフォールバックする）。apps/web / apps/admin / apps/mobile（または同等の UI app）が diff に含まれる場合は before/after スクショを必ず本文に埋め込む。PR 作成後は CI/CD をバックグラウンドで監視し、PR 起因の失敗が検出されたら最大 3 回まで自動修正コミットを作成する。ユーザーが「PR 作って」「PR 出して」「pull request を作成」と依頼したとき、または機能実装が完了して PR 化するタイミングで必ずこの skill を呼び出す。`gh pr create` を直接叩いて assignee や本文構成を独自に決めてはいけない。
---

# create-pr

PR を作成するときに **必ず** 使う skill。目的:

1. **assignee に自分（`@me`）を必ず指定する**
2. **本文を「背景 / 対応内容 / 補足・注意点 / test plan」の 4 セクションに統一する**
3. **base ブランチはハードコードせず、リポジトリの default branch を検出して使う**（main / master / develop など）
4. stacked PR（前の PR を base にする）の場合は親ブランチを `--base` に指定
5. **UI app（web / admin / mobile）の diff が含まれる場合は before/after スクショを必ず本文に埋め込む**
6. **PR 作成後は CI/CD をバックグラウンドで監視し、PR 起因の失敗を自動修正する**

## 前提

- リポジトリは Git で初期化済み、`gh` CLI が認証済み（`gh auth status` で確認）
- コミット済みのブランチを push 済み（または push と同時に作成）
- PR 化したい変更はすでに 1 つのブランチに収まっている

## 手順

### 1. 状態確認

並列実行可能:

```bash
git status -s
git branch --show-current
gh auth status
```

- 未コミット変更がある → 先にコミット（または stash）するか確認
- すでに同じブランチで PR が開いている → `gh pr view` で既存 PR を確認、新規作成しない

### 2. base ブランチを決める

base はリポジトリの実態に合わせて柔軟に決める。`main` も default branch も **ハードコードしない**。

#### 最優先ルール（絶対・例外なし）

- **デフォルトは default branch（通常 `main`）を base にする。** 迷ったら必ず default branch。
- **すでに MERGED / CLOSED のブランチ、またはリモートに存在しないブランチを base にした PR は絶対に作らない。** stacked PR で非 default を base にしようとするときは、`--base` に渡す**直前に**必ず state を確認する:

  ```bash
  # 非 default を base にする前に必ず実行。OPEN でなければ採用しない
  BASE_STATE=$(gh pr view "<base-branch>" --json state --jq .state 2>/dev/null)
  git ls-remote --heads origin "<base-branch>" | grep -q "<base-branch>" && BASE_ON_REMOTE=1 || BASE_ON_REMOTE=0
  # BASE_STATE が MERGED / CLOSED、または BASE_ON_REMOTE=0 のときは default branch にフォールバックする
  ```

  - base 候補に PR があり `MERGED` / `CLOSED` → **その候補は捨てて default branch を base にする**（マージ済み親に積んでも main に届かない / 差分が壊れる）。
  - base 候補がリモートに存在しない → default branch にフォールバック。
  - これは下の判定アルゴリズムより優先する。判定の結果が MERGED/CLOSED/不存在のブランチになったら採用してはいけない。

#### 判定アルゴリズム（上から順に当てはまれば確定。ただし上の「最優先ルール」を必ず満たすこと）

1. **ユーザーから明示指定があれば、それを採用**
   - 例: 「develop に PR 出して」「base は release/1.2 で」
2. **stacked PR の場合は親ブランチを採用（ただし親が未マージのときだけ）**
   - 直前に自分が作った PR のブランチ**が未マージ（`gh pr view <親> --json state` が `OPEN`）なら**、そのブランチを `--base` にする
   - これを忘れて default branch を base にすると親 PR の差分まで diff に含まれる
   - **親 PR が `MERGED` / `CLOSED` になっている場合は stacked にしない。** 親はすでに default branch に入っているので、**default branch から新しいブランチを切り直して** default branch を base にする（マージ済み親を base にすると差分が壊れる / 変更が main に届かない）
3. **GitFlow 系のリポジトリかどうかを判定**

   default branch と `develop` ブランチの両方が存在するかを確認:

   ```bash
   DEFAULT_BRANCH=$(gh repo view --json defaultBranchRef --jq .defaultBranchRef.name)
   git ls-remote --heads origin develop | grep -q develop && HAS_DEVELOP=1 || HAS_DEVELOP=0
   ```

   - `HAS_DEVELOP=1` かつ `DEFAULT_BRANCH` が `main`/`master` の場合は **GitFlow 系の可能性が高い** → 後述の補助判定へ
   - `HAS_DEVELOP=0` の場合は default branch をそのまま採用
4. **GitFlow 系と判定された場合の補助判定**

   直近のマージ済み PR の base 分布を見て、開発系の PR が `develop` に集中していれば `develop` を採用する:

   ```bash
   gh pr list --state merged --limit 20 --json baseRefName --jq '.[].baseRefName' | sort | uniq -c | sort -rn
   # 例:
   #   15 develop
   #    3 main
   #    1 release/1.2
   ```

   - 上位（最頻）が `develop` → `develop` を base に採用
   - 上位が `main` だが `develop` も無視できない件数 → ユーザーに確認:
     > 「このリポジトリは default が `main` ですが `develop` ブランチもあります。base は `develop` / `main` のどちらにしますか？」
5. **どうしても判定できない場合はユーザーに確認**
   - 「base は何にしますか？候補: `<DEFAULT_BRANCH>` / `develop` / `<その他検出できた候補>`」

#### `release/*` や `hotfix/*` に対する PR

- ユーザーが「release/1.2 に対して」「hotfix/xxx に対して」と明示したときのみ採用
- スキル側で勝手に推測してはいけない

#### base が決まったら確認（gh pr create の直前に必ず実行）

```bash
# 1. base がマージ済み/クローズ済みでないこと（最優先ルールの最終ガード）
gh pr view "<base-branch>" --json state --jq .state   # MERGED / CLOSED なら採用しない → default branch に変える
# 2. PR に含まれるコミットの確認
git log --oneline origin/<base-branch>..HEAD
```

- base に対する PR が `MERGED` / `CLOSED` だったら **その base は使わない**。default branch に切り替える（必要なら default branch から自分のブランチを切り直す）。
- `git log` で意図しないコミット（親 PR の分など）が混ざっていたら base 選択が間違っているサイン。

### 3. push（必要なら）

```bash
git push -u origin <branch-name>
```

### 4. PR タイトルを決める

- **シンプルで分かりやすい日本語または英語の 1 行**（70 文字以内）
- 「何が」変わるかが一目で分かれば形式は自由
  - 例: 「GitHub OAuth サインインを追加」「ユーザー削除時の Refresh Token 失効バグを修正」「ランキングバッチの実行間隔を 1 時間に変更」
- `feat(api):` `fix(web):` のような Conventional Commits prefix は **強制しない**
  - プロジェクトの慣例で使われていれば合わせる、無ければ付けない
  - プロジェクトの慣例は `git log --oneline -20` で過去のタイトルを見て判断する
- 詳細はタイトルではなく本文の「対応内容」に書く

### 4.5. UI app の diff があれば before/after スクショを準備する

⚠️ **これは「ベストエフォート」ではなく必須手順。**「動作確認が複雑」「コードレビューで判断」「軽微な変更」「seed が重い」「環境準備に時間がかかる」「ローカルで再現条件を作るのが大変」等を理由にスキップしてはならない。スキップしていい条件は「UI 変更なし」と判定された場合のみで、それ以外は **何があっても画像を 1 枚以上 PR 本文に貼る**。後述「取得が困難に見えるときの突破手順」を必ず実行すること。

#### 検出

`git diff --name-only` で diff にユーザーから見える UI app が含まれているか確認する:

```bash
CHANGED_UI_APPS=$(git diff --name-only "$BASE"..HEAD \
  | grep -oE '^apps/(web|admin|mobile)/' \
  | sort -u)
```

- 出力が空 → スクショ不要（手順 5 へ）
- 出力に何か含まれる → スクショ必須（プロジェクトに `verify-web-page` 等の skill があればそれに従う。なければ下記の標準フローに従う）

#### スクショ対象の判定

含まれる app の種類で分岐:

| app | スクショ取得手段 | 配置先 |
|---|---|---|
| `apps/web` | `verify-web-page` skill（Playwright MCP） | `docs/screenshots/{feature}/{before,after}.png` |
| `apps/admin` | `verify-web-page` skill（同上、admin 認証は将来対応） | `docs/screenshots/{feature}/{before,after}.png` |
| `apps/mobile` | Expo の preview / シミュレータ / 実機。自動取得手段が無いことが多いのでユーザーに依頼 | `docs/screenshots/{feature}/{before,after}.png` |

#### before の扱い（重要）

- **既存 UI の修正 PR**: ブランチを切る前に main の状態で before を撮るのが本来の運用。撮り忘れた場合は `git stash` → `git checkout <default-branch>` → 撮影 → 元ブランチに戻して `git stash pop` で復元
- **新規ページ PR**: before は不要。PR 本文に「新規ページのため before なし」と明記
- **UI 変更なし**（リファクタ / 裏側変更 / docs のみ / 型変更のみ）: スクショ不要。**ただし PR 本文に「UI 変更なし」と必ず明記**して、レビュアーがスクショ漏れと混同しないようにする

判断に迷ったら **「画面のピクセルが変わるか？」** で問う。yes ならスクショ要、no ならスキップ可。

#### 取得が困難に見えるときの突破手順（必須）

「複雑だから」「再現条件が作りにくいから」省略する判断は禁止。以下の順に必ず手を打つ:

1. **環境ブロックを除去する**
   - dev サーバーが起動していない → `docker compose up -d` + `pnpm --filter <app> dev` を background で起動
   - **Playwright MCP のブラウザがロックされていて操作できない** / 前のセッションが残っている → `mcp__playwright__browser_close` で閉じる。それでも掴めない場合は OS 側で `lsof -i :3000 -i :8080` / `ps aux | grep playwright` で残プロセスを特定して `kill -9 <pid>` で終了する。**「ブラウザが取れないから諦めた」は禁止**
   - port が埋まっている → `lsof -i :<port>` でプロセスを特定して `kill` してから再起動
   - DB が空 / migration 未適用 → `pnpm --filter @repo/db db:migrate` + 必要なら seed を流す
2. **認証が必要な画面** は dev 用トークンを cookie に注入する（プロジェクトの dev-login スクリプト / `issue-test-token` 等）。`verify-web-page` skill があれば従う
3. **再現条件が複雑** な画面（例: 「TOP 10 入賞時にだけ出るポップアップ」「特定の DB 状態でだけ出るバナー」「複雑なゲームを完走しないと到達しないリザルト画面」）でも諦めない。次のいずれかで撮る:
   - **NODE_ENV !== "production" の debug page を一時的に作る**。例: `apps/web/src/app/debug/<feature>-preview/page.tsx` を作って、対象コンポーネントを mock data 付きで単独 render する。proxy / middleware が認証必須にしているなら public path にも追加する。スクショ取得後に削除して working tree をクリーンに戻す（コミットしない）
   - DB / Redis に最小限の seed を直接投入（`docker exec ... psql -c "INSERT ..."` 等）して条件を満たす
   - 時間制限のあるフロー（タイマー駆動など）は dev 用に短縮ハッチがあればそれを使う、無ければ debug page で対象だけ render する
4. **どうしても自分の手で取れない場合のみ**（= mobile 実機が必要 / 外部 SaaS の動作確認が必要 / プロダクション環境でしか出ない 等）、PR 本文の「補足・注意点」に **理由と試した手順** を具体的に明記してユーザーにスクショ提供を依頼する。「複雑だから」「軽微だから」「コードレビューで判断」は理由として認められない

省略の言い訳テンプレート（過去に使ってきた）— **これらは全て禁止**:

- ❌ 「動作確認スクリーンショット未取得: 入賞条件 (= 当該言語で score がサーバー側 boundary を超える) を満たす状況をローカルで作るには... が必要で本 PR の範囲を超えるためレビューでは UI コードレビューで判断いただきたい」
- ❌ 「軽微な変更なので省略」
- ❌ 「既存コンポーネントと同じスタイルパターンなので省略」
- ❌ 「テストでカバーされているので省略」

これらに該当しそうな状況になったら、3 の **debug page を作る** に進むこと。実コストは「ファイル 1 つ作って proxy に 1 行追加」程度で 30 秒〜数分で終わる。

#### スクショの commit + push

スクショは git にコミットして remote に push する必要がある（PR 本文に絶対 URL で埋め込むため）:

```bash
git add docs/screenshots/<feature>/
git commit -m "docs(screenshots): add before/after for <feature>"
git push
```

#### PR 本文への埋め込み

PR 本文の末尾（test plan の前）に「スクリーンショット」セクションを追加する。**相対パスは PR 本文ではレンダリングされないため、必ず絶対 URL を使う**:

```markdown
## スクリーンショット

| Before | After |
|---|---|
| ![before](https://github.com/<owner>/<repo>/raw/<branch>/docs/screenshots/<feature>/before.png) | ![after](https://github.com/<owner>/<repo>/raw/<branch>/docs/screenshots/<feature>/after.png) |
```

新規ページのみの場合は after だけの 1 列にする。

`<branch>` の選び方 — **必ず head branch を使う**:

- ✅ **マージ前**（= PR 作成時）: **必ず** この PR の head branch 名（例: `chore/remove-hof-comments`）を使う。スクショ画像はその head branch にコミットされているので即座に GitHub 上で表示される
- ❌ **マージ前に `raw/main/...` を貼ってはいけない**: スクショは PR のコミットでしか追加されておらず main にはまだ無いため、PR レビュー中ずっと 404 になる
- ⚠️ **マージ後の永続化**: head branch を削除する運用なら、マージ後に PR 本文の URL を `raw/main/...` に書き換える（branch 削除で 404 になる前に）。または最初から「スクショだけ別 PR で main にコミット → 本体 PR からその main URL を参照」する 2 PR 構成にする

実装パターン:

| 状況 | 推奨 URL |
|---|---|
| 1 PR で完結（スクショもこの PR に含む） | `raw/<this-pr-head-branch>/...` |
| マージ前にスクショだけ別 PR で先に main へ流したい | スクショ用 PR の head branch → マージ → 本体 PR で `raw/main/...` |
| マージ済み PR にスクショを後追いで貼る | 別 PR (`docs/screenshots-...`) で main に追加 → 元 PR を `gh pr edit` して `raw/main/...` を貼る |

「補足・注意点」セクションに `[ ] [画像URL] スクショは head branch (<branch>) の raw を貼っているため、PR マージ + branch 削除でリンクが切れる` と必ず明記する（マージ後ユーザーが後から見るときの罠を避ける）。

### 5. PR 本文を組み立てる（必須 4 セクション + 条件付きスクショ）

以下のテンプレートを **そのまま** 使う。セクションの順番・見出しは変えない。

```markdown
## 背景

- なぜこの変更が必要か（ユーザー課題 / 仕様 / 上流 PR / 障害など）を 1〜3 行で
- 関連 issue / spec / 親 PR があれば必ずリンク

## 対応内容

- **必ず 3 階層構造で書く**（抽象 → 具体 → 補足）:
  - **第1階層（親項目）**: 機能 / 画面群 / API 群 / 領域 など **抽象的なカテゴリ単位** の概要を 1 行で（「ユーザー関連 API を追加 / テストを追加 / リポジトリを追加」のように **複数の具体要素をまとめた粒度**）
  - **第2階層（子項目）**: 親項目に属する **具体的な要素** を箇条書き（API なら個々のエンドポイント、テストなら種別と件数、画面なら個々のページなど）
  - **第3階層（孫項目）**: 子項目に対する補足・実装ディテール・注意事項を **`- [ ]` チェックボックス形式** で記載（`- ` の通常の bullet は使わない。レビュアーが確認すべき項目として明示する）
- ❌ ファイル単位の羅列（`apps/web/src/.../foo.tsx: ...` を 10 行並べる）は禁止
- ❌ 親項目に個別の API / ファイル名を書く（例: `GET /users を追加` を親項目にしない。「ユーザー関連 API を追加」のように束ねる）
- ✅ 親項目は「○○関連 API を追加」「テストを追加」「○○ Repository を追加」など、**複数の子項目を束ねられる抽象度** から始める
- 親項目は 3〜7 個程度に収める（長くなる場合は PR 自体を分割する）
- 第3階層の補足が無ければ第2階層までで OK（無理に補足を書かない）

例:

```markdown
- ユーザー関連 API を追加
  - GET /users（ユーザー一覧取得）
    - [ ] cursor ベースのページネーション対応
    - [ ] admin 権限が必要
  - POST /users（ユーザー作成）
    - [ ] email 重複チェックあり
    - [ ] パスワードは bcrypt でハッシュ化
  - DELETE /users/:id（論理削除）
- テストを追加
  - Service テスト: 8 件
    - [ ] UserService の各メソッドを網羅
  - Controller テスト: 5 件
- Repository を追加
  - UserRepository（Drizzle 経由で CRUD）
    - [ ] DI 対象として `src/index.ts` で組み立てる
```

## 補足・注意点

- **`- [ ]` のチェックボックス形式で書く**（レビュアーが確認漏れを防ぐため）。`- ` の通常 bullet は使わない
- **各項目の先頭に `[カテゴリ]` を必ず付ける**（可読性向上のため）。カテゴリは内容に応じて自由に命名（例: `[認証]` `[互換性]` `[未対応]` `[運用]` `[既知の制約]` `[設計判断]` `[後続PR]`）
- レビュアーが見落としやすい意思決定 / トレードオフ
- 既知の制約・未対応スコープ・後続 PR でやる予定の項目
- マイグレーションの順序、デプロイ手順、環境変数追加など運用面の注意
- 特に書くことが無ければ「特になし」と明記する（セクション自体は削除しない）

例:

```markdown
- [ ] [認証] proxy.ts で振り分け済みのため、ページ側で `isAuthenticated()` は呼ばない
- [ ] [設計判断] Server Action 戻り値 → sessionStorage → 遷移先ページで復元 の経路は、Router 遷移で戻り値が失われる問題への対処
- [ ] [未対応] リザルト画面は本 step では placeholder。step5 で ResultScreen を本実装
- [ ] [後続PR] 神々モードボタンは step6 で `/challenge-gods` 実装時に有効化する
```

<!-- ↓ UI 変更を含む PR のみ。手順 4.5 で生成・push 済みのスクショへの絶対 URL を貼る。UI 変更が無いなら本セクションごと省略する。-->
## スクリーンショット

| Before | After |
|---|---|
| ![before](https://github.com/<owner>/<repo>/raw/<branch>/docs/screenshots/<feature>/before.png) | ![after](https://github.com/<owner>/<repo>/raw/<branch>/docs/screenshots/<feature>/after.png) |

## test plan

- レビュアー / 自分が PR をマージ可能と判断するためのチェックリスト
- `- [ ]` の checkbox 形式で 3〜6 個
- 「ローカルで X を実行して Y が返る」「CI の Z ジョブがパスする」など、具体的に検証可能な手順を書く
- UI 変更を含む PR は実画面確認（スクショ等）の項目も含める
```

例:

```markdown
## 背景

- ユーザーがログイン時に GitHub アカウントを使えるようにしたい
- spec: `docs/spec/github-auth/README.md`
- 親 PR: #2 (DB スキーマ変更)

## 対応内容

- 認証関連 API を追加
  - POST /api/auth/github（GitHub OAuth Authorization Code 検証）
    - [ ] `User` + `AuthAccount(provider="github")` を upsert
    - [ ] `display_name` は GitHub の `name` → `login` の順でフォールバック
- 環境変数を追加
  - `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`
    - [ ] dev は dummy 既定値あり

## 補足・注意点

- [ ] [セキュリティ] OAuth アクセストークンは DB / Redis のいずれにも保存しない方針
- [ ] [スコープ] `user:email` は MVP では要求しない（メール通知が必要になった時点で再検討）

## test plan

- [ ] `pnpm test` で新規 unit / integration テストがパスする
- [ ] dev 環境で実 GitHub OAuth フローが成功し httpOnly cookie に JWT が入る
- [ ] `name=null` のユーザーで `display_name = login` になる
```

### 6. `gh pr create` を実行する

必須フラグ:

- `--assignee @me`（**必ず付ける**。自分以外の assignee 指定はユーザーから明示的に依頼されたときのみ追加）
- `--base <base-branch>`（手順 2 で決めた base を明示。default branch でも明示するとレビュー時に意図が伝わる）
- `--title "<タイトル>"`
- `--body "$(cat <<'EOF' ... EOF)"`（HEREDOC で本文を渡す。改行・バッククォートが安全に通る）

末尾には自動生成のフッターを付ける:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

実行例（base を `gh repo view` で動的取得）:

```bash
BASE_BRANCH=$(gh repo view --json defaultBranchRef --jq .defaultBranchRef.name)

gh pr create \
  --base "$BASE_BRANCH" \
  --assignee @me \
  --title "GitHub OAuth サインインを追加" \
  --body "$(cat <<'EOF'
## 背景

- ...

## 対応内容

- ...

## 補足・注意点

- 特になし

## test plan

- [ ] ...

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

実行例（stacked PR、親ブランチを明示）:

```bash
gh pr create \
  --base feat/foo-step-1 \
  --assignee @me \
  --title "ユーザー削除時に Refresh Token を失効する" \
  --body "$(cat <<'EOF'
## 背景

- ...

## 対応内容

- ...

## 補足・注意点

- ...

## test plan

- [ ] ...

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

### 7. PR URL をユーザーに返す

`gh pr create` の標準出力に PR URL が出る。それをそのままユーザーに伝える。

同時に「CI をバックグラウンドで監視中」と一言添える（手順 8 をこれから走らせるため）。

### 8. CI/CD をバックグラウンドで監視する

PR を作ったらそのまま `gh pr checks --watch` で CI の完了を **バックグラウンドで** 待つ。`Bash` ツールの `run_in_background: true` を使う。

```bash
PR_NUMBER=<新しく作った PR 番号>
gh pr checks "$PR_NUMBER" --watch --interval 30
```

- `--watch` は全 check が完了するまでブロック、失敗があれば非ゼロで exit
- `--interval 30` で 30 秒ごとにポーリング（負荷とレイテンシのバランス）
- 完了したら harness から自動通知が来るので、ポーリングや sleep ループは禁止
- 監視中は他のユーザータスクを受け付けて良い（ユーザーが「待たないで進めて」と言ったらそのまま別作業へ）

監視結果の解釈:

| 出力 | 意味 | 次のアクション |
|---|---|---|
| 全 check が `pass` | CI 成功 | ユーザーに「CI 全て通った」と報告して終了 |
| 1 つ以上 `fail` | CI 失敗 | 手順 9 へ（自動修正フロー） |
| `pending` / `queued` のまま長時間 | キューが詰まっている等 | ユーザーに状況を報告して指示を仰ぐ |
| API レート制限 / 認証エラー | gh CLI 側のエラー | ユーザーに伝えて停止 |

### 9. CI 失敗時の自動修正フロー

**前提**: 自動修正は「PR の変更が原因で確実に直せる」failure に限る。インフラ起因・flaky test・PR と無関係な失敗は **修正せずユーザーに報告して止まる**。

#### 9-1. 失敗した check の特定

```bash
gh pr checks "$PR_NUMBER" --json name,state,link
# fail している check の name と link を控える
```

ログを取得:

```bash
# check に紐づく run-id を取得
RUN_ID=$(gh run list --branch "$(git branch --show-current)" --limit 5 --json databaseId,status,conclusion --jq '.[] | select(.conclusion == "failure") | .databaseId' | head -1)

# 失敗した job のログだけを取得（長すぎる場合は `--log` で全量）
gh run view "$RUN_ID" --log-failed | tail -200
```

#### 9-2. 失敗種別の判定

ログを読んで、以下のどれに該当するか判定する:

**自動修正の対象**:

| 種別 | 検出方法 | 修正方法 |
|---|---|---|
| Lint エラー | `eslint` / `ruff` / `golangci-lint` 等の出力 | `pnpm lint:fix` 相当を実行、残差を手で修正 |
| Format エラー | `prettier --check` / `gofmt` 等 | `pnpm format` 相当を実行 |
| 型エラー（明らかなもの） | `tsc` / `mypy` のエラーで原因が import 漏れ・型注釈漏れ等 | 該当箇所を最小修正 |
| import 順序 / 未使用 import | eslint-plugin-import 等の出力 | autofix |
| 軽微なテスト失敗（PR の変更が原因と特定可能） | 期待値の更新漏れ、固定 fixture の path 違い等 | テストか実装の どちらが正しいかを判定して直す |

**自動修正の対象外**（ユーザーに報告して停止）:

- インフラ / CI 設定の失敗（workflow yml の構文エラー、secret 不足、runner の disk full 等）
- 外部サービス起因（パッケージレジストリ 5xx、Docker Hub レート制限、テスト用 DB の起動失敗等）
- Flaky test（同じテストが再実行で通ったり落ちたりする兆候）
- PR と無関係なファイルで起きている失敗
- 修正方針が複数考えられる / 仕様判断を要するテスト失敗
- セキュリティスキャンの警告（人間判断が必要）

判定に迷ったらユーザーに聞く。**「とりあえず修正してみる」は禁止**。誤った自動修正は本来のバグを隠す危険がある。

#### 9-3. 修正と push

修正可能と判断したら:

1. 変更を加える（Edit / Write）
2. **ローカルで該当のチェックを再実行して通ることを確認**（CI 待ちで時間を浪費しないため）
   - 例: `pnpm lint`、`pnpm typecheck`、`pnpm test` の落ちていたものだけ
3. コミット（メッセージは内容に応じて自然な日本語/英語で、prefix は強制しない。例: 「CI の lint エラーを修正」「型エラーで落ちていた箇所を修正」）
4. `git push`（`--force` 禁止、`--no-verify` 禁止）
5. 手順 8 に戻って再度 `gh pr checks --watch` で監視

#### 9-4. リトライ回数の上限

- **最大 3 回まで** 自動修正を試みる
- 3 回試しても通らない、または同じ失敗が繰り返される場合は停止してユーザーに報告
- 各試行で「何を直したか」「次の失敗は何か」を必ずユーザーに 1〜2 行で伝える（黙って繰り返さない）

#### 9-5. 停止してユーザーに報告するときのフォーマット

```
CI 失敗を検出しました (PR #<番号>)

失敗 check: <name>
原因の要約: <ログから抽出した 1〜2 行>
試行履歴:
  1. <最初の修正内容> → <次の失敗>
  2. <2 回目の修正内容> → <次の失敗>
  3. <3 回目の修正内容> → <最終的な失敗>
ログ: <run の URL>

自動修正の対象外と判断したため、ユーザーの判断を仰ぎます。
```

## やってはいけないこと

- ❌ `--assignee @me` を付け忘れる
- ❌ 本文を独自テンプレートで書く（「Summary」「Changes」など別見出しに変更しない）
- ❌ 4 セクションのうちどれかを削る（「補足・注意点」に書くことが無くても「特になし」と明記）
- ❌ 対応内容をファイル単位で羅列する（`apps/web/src/.../foo.tsx: ...` を並べない。**抽象カテゴリ → 具体要素 → `[ ]` 補足** の 3 階層で書く）
- ❌ 対応内容の親項目に個別 API / ファイル名を書く（例: `GET /users を追加` を親項目にしない。「ユーザー関連 API を追加」のように **複数を束ねられる抽象度** で始める）
- ❌ 対応内容の第3階層の補足を `- ` 通常 bullet で書く（必ず `- [ ]` チェックボックス形式）
- ❌ 補足・注意点を `- ` 通常 bullet で書く（必ず `- [ ]` チェックボックス形式）
- ❌ 補足・注意点を `[カテゴリ]` プレフィックス無しで書く（`[認証]` `[未対応]` `[後続PR]` のように先頭にラベルを付ける）
- ❌ base ブランチを `main` 決め打ちにする（`develop` 運用や rename された default branch を取りこぼす）
- ❌ `develop` ブランチがあるのに無条件で default branch（main/master）を base にする（GitFlow 系の取りこぼし。手順 2 の判定アルゴリズムに従う）
- ❌ stacked PR で base を default branch にする（親 PR の差分まで含まれてレビュー困難になる）
- ❌ **すでに MERGED / CLOSED のブランチを base に指定する**（`gh pr create --base <merged-branch>`）。`gh pr create` の直前に必ず `gh pr view <base> --json state` で state を確認し、MERGED/CLOSED または不存在なら default branch（通常 main）にフォールバックする。何度もやらかしている事故なので必ずチェックする
- ❌ stacked PR のつもりで **マージ済みの親ブランチ** を base にする（親はもう default branch に入っているので、default branch から切り直して default branch を base にする）
- ❌ base 候補を state 未確認のまま `--base` に渡す（main をデフォルトにし、非 default を使うときだけ OPEN を確認）
- ❌ プロジェクトの慣例を確認せず `feat(scope):` のような prefix を勝手に付ける
- ❌ 本文の末尾に複数行の英語サマリーや内部メモを書く
- ❌ UI app（web / admin / mobile）の diff があるのにスクショ無しで PR を作る（手順 4.5 を必ず実行する）
- ❌ 「動作確認が複雑」「再現条件を作るのが大変」「軽微な変更」「コードレビューで判断」を理由にスクショを省略する（手順 4.5「取得が困難に見えるときの突破手順」を必ず実行。debug page を一時的に作るだけで大抵 30 秒で取れる）
- ❌ Playwright MCP のブラウザがロックされている / 既存プロセスが掴んでいるからとスクショ取得を諦める（必ず `browser_close` / `kill -9` で解放してから再取得する）
- ❌ dev サーバー / DB / 認証 cookie の準備が面倒だからスクショを省略する（`docker compose up -d` / dev-login スクリプト / `issue-test-token` で必ず立ち上げる）
- ❌ スクショ無し PR を「UI 変更なし」と本文に明記せず誤魔化す（リファクタ / 裏側変更だけの場合も明示する）
- ❌ スクショを相対パスで PR 本文に貼る（PR 本文ではレンダリングされない。必ず `https://github.com/<owner>/<repo>/raw/<branch>/...` の絶対 URL）
- ❌ **マージ前の PR 本文で `raw/main/...` の URL を貼る**（スクショは PR のコミットでしか main に来ていないので、レビュー中ずっと 404 になる。必ず **head branch** の raw URL を使う。マージ後の永続化が必要なら別 PR で main にスクショを流すか、マージ直後に `gh pr edit` で main URL に書き換える）
- ❌ スクショを git にコミットせずローカルだけに置く（remote から fetch できないとレビュアーに見えない）
- ❌ PR 作成後の CI 監視を省略する（必ず手順 8 を実行する）
- ❌ CI 失敗を確認せずに「PR 作成完了」とだけ報告して終了する
- ❌ 失敗種別が判定できないのに「とりあえず修正してみる」commit を作る
- ❌ 自動修正の際に `--force` push や `--no-verify` を使う
- ❌ 自動修正を 3 回を超えてリトライする（同じ失敗を繰り返す場合は停止する）
- ❌ インフラ / flaky / セキュリティ警告 を自動修正で潰す（必ずユーザー判断を仰ぐ）
- ❌ CI 監視中に `sleep` でポーリングする（`gh pr checks --watch` を `run_in_background: true` で起動して通知を待つ）

## トラブルシューティング

| 症状 | 対処 |
|---|---|
| `gh auth status` で未認証 | ユーザーに `gh auth login` を促す。自分で実行はしない |
| `gh pr create` で `pull request already exists` | `gh pr view` で既存 PR の URL を返し、新規作成しない |
| `gh repo view --json defaultBranchRef` がエラー | `git symbolic-ref refs/remotes/origin/HEAD` でフォールバック、それでも不明ならユーザーに確認 |
| 親ブランチが見つからない | `git fetch origin` 後に再試行、それでも無ければ stacked 構成を再確認 |
| 本文がうまくレンダリングされない | HEREDOC を `<<'EOF'`（クォート付き）にして変数展開を抑制する |
| スクショが PR 本文で表示されない | 相対パスを使っていないか確認。`docs/screenshots/...` をそのまま貼ってもダメで `https://github.com/<owner>/<repo>/raw/<branch>/docs/screenshots/...` の絶対 URL が必要 |
| マージ前 PR のスクショが 404 | `<branch>` 部分に `main` を入れていないか確認。マージされるまで main にスクショが存在しないので、必ず **head branch 名** (例: `chore/foo-bar`) を入れる。修正は `gh pr edit <pr-number> --body ...` で本文を書き換える |
| before スクショを撮り忘れた | `git stash` → `git checkout <default-branch>` → 撮影 → 元ブランチに戻して `git stash pop` で復元 |
| Playwright MCP のブラウザが既に開いている / 操作を受け付けない | まず `mcp__playwright__browser_close` を試す。それでも掴めない場合は OS 側で `ps aux \| grep -i 'playwright\\|chromium\\|chrome' \| grep -v grep` から PID を特定して `kill -9 <pid>` で終了し、再度 `browser_navigate` から始める |
| dev サーバーが port を掴んでいて起動できない | `lsof -i :3000` `lsof -i :8080` でプロセスを特定し、不要なら `kill -9 <pid>`、必要なものなら活かして既存プロセスを使う |
| 認証必須ページに到達できず login にリダイレクトされる | プロジェクトの dev-login (`/api/dev/login?as=alice` 等) を踏むか、`pnpm --filter api issue-test-token <userId>` で JWT を発行して cookie に注入する |
| 再現条件が複雑で UI が出ない | NODE_ENV !== "production" 限定の debug page (`apps/web/src/app/debug/<name>-preview/page.tsx`) を一時的に作り、対象コンポーネントを mock data 付きで単独 render する。proxy に dev-only public path を追加。撮影後にファイルと proxy 追加を削除（コミットしない） |
| mobile のスクショが自動取得できない | Expo の preview / iOS Simulator / Android Emulator / 実機いずれかで撮影する必要があるので、ユーザーにスクショ提供を依頼する |
| `gh pr checks --watch` がすぐ終わる（run が無い） | CI 未設定 or workflow が trigger されていない可能性。`gh workflow list` と `.github/workflows/` を確認 |
| 同じ失敗が修正後も再発する | 修正が問題に対応していない可能性大。3 回ループに入る前に停止してユーザーに報告 |
| ログが取得できない / `gh run view` が空 | run が削除済み or 別 branch の run を見ている。`--branch` フィルタで対象 PR の branch を絞る |
