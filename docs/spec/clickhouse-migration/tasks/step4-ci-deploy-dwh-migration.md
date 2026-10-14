# step4-ci-deploy-dwh-migration

3 環境の deploy workflow（`deploy-aws-{dev,min,prd}.yml`）に ClickHouse の migration（`migrate-dwh` job）を組み込む。`enable_data_warehouse = true` の環境（= ClickHouse の接続情報の secret がある環境）でだけ実行し、無ければ skip する。あわせて、ClickHouse の migration だけを手動で流す workflow を足し、AWS 上で一通り動作確認する。

設計: [`../README.md`](../README.md#deploy-への組み込み) / [deploy での判定](../README.md#deploy-での判定)

前提: [step3-infra-cdc](./step3-infra-cdc.md)（dwh-migration のタスク定義は step2 で、CDC は step3 で作られている）

## 対応内容

### workflow の全体

```mermaid
flowchart LR
    B[build] --> M[migrate<br/>Drizzle]
    D[detect<br/>接続情報の<br/>secret の有無] --> MD
    M --> MD[migrate-dwh<br/>dwh_enabled のときだけ]
    M --> A[deploy-api]
    M --> W[deploy-worker]
    MD --> W
    D --> W
    M --> C[deploy-cron]
```

- detect は build と並べて走らせ、build は待たない（ClickHouse の判定の失敗で api の deploy を止めない）。dev / prd は `detect` を新設し、min は既存の detect job（worker の有無。build が待つ）とは別に `detect-dwh` を足す
- build は変えない（migration イメージは step1 で ClickHouse のコマンドを同梱済み）

### detect

```bash
if OUTPUT=$(aws secretsmanager describe-secret --secret-id "${DATA_WAREHOUSE_SECRET_ID}" --query Name --output text 2>&1); then
  echo "dwh_enabled=true" >> "$GITHUB_OUTPUT"
elif grep -q ResourceNotFoundException <<< "${OUTPUT}"; then
  echo "dwh_enabled=false" >> "$GITHUB_OUTPUT"
else
  echo "${OUTPUT}" >&2
  exit 1
fi
```

- `DATA_WAREHOUSE_SECRET_ID: /tech-english-<env>/data-warehouse` を各 workflow 先頭の `env:` に足す
- **dwh-migration のタスク定義の有無では判定しない。** deploy が register した revision は Terraform の管理外で、フラグを `false` にして apply しても `ACTIVE` のまま残る。`describe-task-definition` に family 名を渡すと最新の `ACTIVE` な revision が返るので、判定が `true` のままになり、消えた secret を参照するタスクの起動に失敗して deploy-worker まで止まる
- secret は `recovery_window_in_days = 0` なので、フラグを `false` にした apply で即座に消える（削除待ちの secret は `describe-secret` が成功してしまう）
- secret が無い以外のエラー（権限不足など）で `false` にすると、migration が黙って飛ばされる。そのため job を失敗させる
- min の `push_only=true`（初回）では調べない（既存の worker の判定と同じ）

### deploy 用の IAM ロールの権限（`account/github_oidc.tf`）

`ecs_deploy` の policy document に足す。dev / prd のロールは AdministratorAccess も持っているが、min の deploy 用ロール（Environment `min`）は持っていないため、policy 側に書く。

| sid | actions | resources | 使うところ |
| --- | --- | --- | --- |
| `DescribeDataWarehouseSecret`（新設） | `secretsmanager:DescribeSecret` | `arn:aws:secretsmanager:*:<account>:secret:/${var.project_name}-*/data-warehouse*` | detect。値は読めない |
| `EcsDeploy`（既存） | `ecs:ListTaskDefinitions` を足す | `*`（既存のまま） | ClickHouse の migration だけを流す workflow が、最後に deploy したイメージを探す |

- resource は末尾を `data-warehouse*` にする（`-*` にしない）。secret が無いときの認可が、末尾の 6 文字の付かない ARN で評価される可能性があるため。合わなければ AccessDenied になり、ClickHouse の無い環境（既定の min）の deploy が全部止まる。min（admin を持たないロール）で、フラグが `false` のまま deploy して detect が `dwh_enabled=false` になることを動作確認で確かめる
- `account/.terraform.lock.hcl` に linux の hash を足す（`terraform providers lock -platform=linux_amd64 -platform=darwin_arm64`）。無いと CI の apply が `-lockfile=readonly` の init で落ちる
- **account の apply を、deploy workflow の変更より先に行う。** 権限が無いまま deploy すると detect が失敗する（上記のとおり、黙って skip はしない）
- account の apply は `terraform-aws-account-apply.yml`（role 自身の trust policy は変えないので CI から流せる）

### composite action `.github/actions/run-one-shot-task`

`migrate` と `migrate-dwh`、手動実行の workflow の 3 箇所で同じ処理になるため切り出す。

| input | 内容 |
| --- | --- |
| `cluster` | ECS cluster 名 |
| `task-definition` | タスク定義の family |
| `image` | 省略可。指定したら、最新のタスク定義の image をこれに差し替えて新しい revision を register してから起動する。省略したら最新の revision をそのまま起動する |
| `subnets` / `security-group` | run-task の network 設定 |
| `assign-public-ip` | `ENABLED`（min）/ `DISABLED`（dev / prd） |

処理（既存の migrate job の step を移す）:

1. `image` があれば register（`jq` で image を差し替え、メタ情報を消して `register-task-definition`）
2. `run-task`（起動できなければ `failures` を出して失敗する）→ `aws ecs wait tasks-stopped`
3. `describe-tasks` で停止理由と終了コードを出す
4. **成否にかかわらずタスクのログを 1 行ずつ出す**（`--query 'events[].[message]'`）（migrate-dwh で view を skip した警告などを Actions のログで見るため）。**ログはそのタスクのログストリーム（`ecs/<コンテナ名>/<タスク ID>`）に絞る**。`filter-log-events` に `--log-stream-names` を付ければ既存の `logs:FilterLogEvents` で足りる（既存の呼び方はロググループ全体の古い順で、前回以前の実行のログが出ることがあった）
5. 終了コードが 0 以外なら失敗する

composite action を使う job は `actions/checkout` が要る（既存の migrate job にも足す）。

network 設定の解決（タグから VPC / subnet / SG を引く step）は環境ごとに違う（dev / prd は private subnet、min は public subnet）ので、各 workflow に残す。

### migrate（既存）

composite action を使う形に書き換える。挙動は変えない。

### migrate-dwh（新設）

```yaml
migrate-dwh:
  name: Run ClickHouse Migration
  needs: [detect, build, migrate]
  if: ${{ needs.detect.outputs.dwh_enabled == 'true' }}
  runs-on: ubuntu-latest
  environment: <env>
  steps:
    - uses: actions/checkout@v4   # composite action を使うため
    - name: Configure AWS credentials with OIDC
      ...
    - name: Resolve network configuration from tags
      ...                         # migrate と同じ
    - uses: ./.github/actions/run-one-shot-task
      with:
        cluster: ${{ env.ECS_CLUSTER }}
        task-definition: ${{ env.ECS_DWH_MIGRATION_TASK_DEF }}
        image: ${{ needs.build.outputs.registry }}/${{ env.ECR_MIGRATION_REPO }}:${{ needs.build.outputs.image_tag }}
        ...
```

- **Drizzle の migrate の後に流す。** ケース 1 で、view の元テーブルが Postgres に先にできている必要があるため
- min は `if` に `!inputs.push_only` も入れる

### deploy-worker

```yaml
deploy-worker:
  needs: [detect, build, migrate, migrate-dwh]
  if: >-
    ${{ !cancelled()
      && needs.detect.result == 'success'
      && needs.migrate.result == 'success'
      && (needs.migrate-dwh.result == 'success' || needs.migrate-dwh.result == 'skipped') }}
```

- **`needs.detect.result == 'success'` も見る。** detect が失敗すると migrate-dwh は skip になるので、skip を許すだけだと ClickHouse の migration を飛ばして worker を deploy してしまう

- `needs` の中に skipped の job があると、既定では後続も skip されるため、`!cancelled()` と各 job の結果で条件を書く
- min は既存の `worker_enabled` の条件も残す
- **deploy-api / deploy-cron は `migrate-dwh` を待たない。** ClickHouse は分析用で、その失敗で api を止めない

### ClickHouse の migration だけを流す workflow（`clickhouse-migrate.yml`、新設）

ケース 1（ClickPipe の初回の取り込み後に view を作る）とケース 4（再同期の後）で、deploy をやり直さずに ClickHouse の migration だけを流すために使う。

- `on: workflow_dispatch`、input は `environment`（`dev` / `min` / `prd`）
- **最後に deploy したイメージで、最新のタスク定義の設定を使って起動する。** 最新の revision をそのまま起動しないのは、Terraform の apply（`enable_cdc` の切り替え等）でできた revision の image が `:latest` の placeholder で、ECR に存在しないため
  - 一覧の取得（`list-task-definitions`）は変数に入れてからループする（`for` の中のコマンド置換は失敗しても止まらず、権限不足を「deploy していない」と取り違えるため）
  - **Drizzle の migration のタスク定義**の revision を新しい順に見て、image のタグが `:latest` でない最初のものを「最後に deploy したイメージ」とする（`aws ecs list-task-definitions --family-prefix <prefix>-migration --sort DESC`）。ClickHouse の migration も同じイメージで、Drizzle の migration は deploy のたびに必ず register されるため（dwh-migration の family だと、フラグを有効にしてからまだ deploy していない環境で見つからない）
  - それを composite action の `image` に渡す（dwh-migration の最新の revision の設定に image だけ差し替えて register してから起動する）
- 接続情報の secret が無い（`enable_data_warehouse = false`）環境を選んだら、何もせずにその旨を出して失敗する（判定は detect と同じ）
- `concurrency: deploy-aws-<env>` にして、同じ環境の deploy と同時に走らないようにする
- network 設定は environment ごとに違う（dev / prd は private subnet、min は public subnet と public IP）ので、input の environment から subnet の名前と `assign-public-ip` を決める

### ドキュメント

- 各 deploy workflow 先頭の「Job 構成」のコメントに detect / migrate-dwh を足す
- `docs/deploy/*.md` のデプロイ手順に、ClickHouse の migration が自動で流れることと、手動実行の workflow の使いどころ（ケース 1・4）を書く

### 有効化・無効化の手順

**dev で ClickHouse を有効にする**

1. `env/dev/variables.tf` の `enable_data_warehouse` の既定値を `true` にして PR → マージ
2. Terraform AWS Env Apply（dev）を実行（サービス・secret・タスク定義ができる）
3. Deploy to AWS dev を実行（detect が `dwh_enabled=true` になり、migrate-dwh が `events` を作る。worker が ClickHouse に書き始める）

**無効にする**

1. 既定値を `false` にして PR → マージ → apply → **すぐに deploy する**。apply で接続情報の secret とタスクの実行ロールの読み取り権限が消えるが、動いている worker の Service は deploy するまで、消えた secret を参照するタスク定義のまま残る（`ignore_changes`）。その間に worker のタスクが入れ替わる（min の Fargate Spot の中断やクラッシュ）と、起動に失敗してすべての queue が止まる。ClickHouse Cloud の API キーはこの apply が終わるまで消さない
2. **ClickHouse Cloud のサービスは削除され、データも消える。** 残したい場合は先にバックアップを取る（prd では `false` にしない）
3. deploy が register した dwh-migration の revision は `ACTIVE` のまま残るが、判定は secret で行うので害は無い（不要なら deregister してよい）

## 動作確認

dev で `enable_data_warehouse` / `enable_cdc` を切り替えて確認する。

### フラグが `false`（現状）

- deploy で detect が `dwh_enabled=false`、migrate-dwh が skipped、deploy-worker が実行される
- worker の環境変数が `DATA_WAREHOUSE_TYPE=none`

### `enable_data_warehouse = true`、`enable_cdc = false`

- migrate-dwh が成功し、ログに「CDC が無いので view を作らない」旨が出る
- ClickHouse Cloud のコンソールで `tech_english.events` と `_migrations` がある
- web でメモを操作し、`events` に行が入る（worker → ClickHouse Cloud）
- deploy をもう一度実行しても migrate-dwh が成功する（未適用が無く、何もしない）
- migrate-dwh をわざと失敗させる（存在しない列を参照する migration を一時的に足す）と、deploy-worker は実行されず、deploy-api は成功する

### `enable_cdc = true`

- migrate-dwh で `v_users` / `v_memos` ができる。`SELECT count() FROM tech_english.v_users` が RDS の件数と一致する
- RDS で users を更新・削除すると、ClickPipes の同期間隔のうちに view に反映される
- **ケース 3**: users に列を足す migration を deploy → users に 1 行書き込む → `clickhouse-migrate.yml` を実行 → view に列が出る
- **ケース 1**: 新しいテーブルを CDC 対象に足して deploy → migrate-dwh のログに skip の警告 → apply → 初回の取り込み後に `clickhouse-migrate.yml` → view ができる
- migration を流しながら別のセッションで view を読み続け、エラーにならない（`CREATE OR REPLACE VIEW` が Cloud でも原子的か）

### min / prd

- min（`enable_data_warehouse = false` のまま）: detect が false、worker の deploy は今までどおり
- prd: 本番の運用開始時に、dev と同じ確認を行う
