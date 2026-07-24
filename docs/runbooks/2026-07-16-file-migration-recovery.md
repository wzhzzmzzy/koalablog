# File 迁移恢复操作手册

> **归档（2026-07-24）**：生产迁移已完成，仓库现在保留面向新建数据库的 `0000_init.sql` 基线，以及后续独立的 `0006_memo_source_remap.sql`。本文件中提到的 `migration:audit`、`migration:backup:sqlite`、`migration:files:sqlite` 与 `0002_file_source_schema.sql` 均已删除；不得将本文件作为当前环境的操作步骤执行。

日期：2026-07-16
适用范围：Gate 1B 为 `markdown` 替换式迁移所做的准备工作

## 安全边界

Koalablog 当前没有应用级维护模式。在执行任何备份、迁移或恢复前，必须停止部署，或通过应用外部手段阻断所有写入路径。`--maintenance-confirmed` 标志只记录操作人员的确认，不会自动停止流量。

Gate 1B 对 `markdown` 只执行只读操作。审计命令不会修改 schema 或数据行。出现 `status: blocked`、active Path 归一化冲突或非法 active Path 时，必须停止迁移。不得自动修复这些数据行。

每次演练或迁移都必须创建新的产物目录。不得复用报告、备份、演练文件或清单路径；相关命令采用排他写入。

## 审计所需的数据结构

SQLite 与 D1 审计都会按稳定的 ID 顺序读取以下旧字段：

```sql
SELECT id, source, link, subject, content, tags,
       incoming_links, outgoing_links, private, remoteTruth,
       createdAt, updatedAt, deletedAt
FROM markdown
ORDER BY id;
```

JSON 报告和文本报告必须一起归档。源数据库或 D1 快照也必须保存在同一组归档证据中。

## SQLite 操作流程

1. 在应用外部停止写入，并记录具体采用的停止方式。
2. 记录操作人员、UTC 时间戳、应用提交、迁移版本和数据库绝对路径。
3. 运行只读审计：

```sh
pnpm migration:audit -- \
  --sqlite /absolute/path/local.db \
  --output /absolute/path/migration-artifacts/audit
```

4. 同时检查 `file-migration-audit.v1.json` 和 `file-migration-audit.v1.txt`。只有状态为 `ready`，且报告中的数据行数量与预期数据库一致时，才可以继续。
5. 创建一致性备份和独立的恢复演练文件：

```sh
pnpm migration:backup:sqlite -- \
  --source /absolute/path/local.db \
  --backup /absolute/path/migration-artifacts/pre-migration.backup.db \
  --rehearsal /absolute/path/migration-artifacts/restore-rehearsal.db \
  --manifest /absolute/path/migration-artifacts/sqlite-backup-manifest.v1.json \
  --commit <application-commit> \
  --migration <migration-version> \
  --operator <operator-name> \
  --timestamp <operator-utc-iso-timestamp> \
  --maintenance-confirmed
```

该命令使用 SQLite `VACUUM INTO`，通过 Drizzle 对源数据库、备份数据库和演练数据库运行 `PRAGMA integrity_check`，并要求三者的数据行数量与保全清单相同。备份文件和演练文件的哈希也必须一致。

6. 运行替换式 SQL 前，归档源审计报告、备份数据库、演练数据库和清单。
7. 通过 Gate 1C 迁移入口执行替换与事务内验证：

```sh
pnpm migration:files:sqlite -- \
  --sqlite /absolute/path/local.db \
  --maintenance-confirmed
```

该命令会再次运行 Gate 1B 审计。审计为 `blocked` 时，它会以状态码 `2` 退出且不修改 schema；审计为 `ready` 时，它会在同一事务内执行 `0002_file_source_schema.sql`，并核对数据行数量、稳定 ID、Path/Title 投影、Source 分类、内容、标签、隐私状态、remote truth、时间戳、回收站元数据与 `PRAGMA integrity_check`。只有命令输出 `Gate 1C File Source migration completed` 时才可以继续。

### SQLite 恢复

保持停止写入。先使用新名称保存失败的数据库，再把已验证的备份复制回配置的数据库路径，随后重新运行旧数据审计。不得覆盖唯一的失败数据库或唯一的备份。

```sh
cp -- /absolute/path/migration-artifacts/pre-migration.backup.db /absolute/path/local.db
pnpm migration:audit -- \
  --sqlite /absolute/path/local.db \
  --output /absolute/path/migration-artifacts/post-restore-audit
```

恢复后的 JSON 保全清单必须与迁移前清单完全一致。

## Cloudflare D1 操作流程

以下命令已根据仓库安装的 Wrangler 4.11.0 CLI 进行核对。这些命令会操作远程资源；只有在确认选中了正确的 Cloudflare 账号和数据库后才能运行。

1. 在应用外部停止写入。
2. 根据 `wrangler.toml` 确认数据库 binding、名称和不可变数据库 ID，然后归档在线数据库身份：

```sh
WRANGLER_LOG_PATH=/absolute/path/migration-artifacts/wrangler.log \
pnpm exec wrangler d1 info DB --json \
  > /absolute/path/migration-artifacts/d1-identity.json
```

3. 导出审计所需的精确快照，并运行同一套审计引擎：

```sh
WRANGLER_LOG_PATH=/absolute/path/migration-artifacts/wrangler.log \
pnpm exec wrangler d1 execute DB --remote --json \
  --command 'SELECT id, source, link, subject, content, tags, incoming_links, outgoing_links, private, remoteTruth, createdAt, updatedAt, deletedAt FROM markdown ORDER BY id' \
  > /absolute/path/migration-artifacts/d1-legacy-snapshot.json

pnpm migration:audit -- \
  --snapshot /absolute/path/migration-artifacts/d1-legacy-snapshot.json \
  --output /absolute/path/migration-artifacts/d1-audit
```

4. 只有报告状态为 `ready` 时才可以继续。即使审计被阻断，也必须归档快照。
5. 根据操作时间戳记录 Time Travel bookmark：

```sh
WRANGLER_LOG_PATH=/absolute/path/migration-artifacts/wrangler.log \
pnpm exec wrangler d1 time-travel info DB \
  --timestamp <operator-utc-iso-timestamp> \
  --json \
  > /absolute/path/migration-artifacts/d1-time-travel.json
```

6. 确认 `d1-identity.json` 指向预期数据库，并确认 `d1-time-travel.json` 包含可用 bookmark。在迁移工单或操作日志中记录应用提交、迁移版本、数据行数量、操作人员、时间戳、数据库名称、数据库 ID 和 bookmark。
7. 使用 Wrangler 的 migration 记录执行仅向前的 D1 迁移：

```sh
WRANGLER_LOG_PATH=/absolute/path/migration-artifacts/wrangler.log \
pnpm exec wrangler d1 migrations apply DB --remote
```

8. 导出迁移后的 `markdown` schema 与数据快照，确认字段为 `path`、`title` 和 `revision`，不存在 `renderer` 或 `sourceHash`，并将数据行数量、保全字段与迁移前审计报告逐项比较。D1 migration 记录保证 `0002_file_source_schema.sql` 只向前应用一次；Time Travel 记录是回滚点。不得尝试自动修复冲突。

### D1 恢复

恢复操作具有破坏性。运行以下命令前，必须再次确认数据库身份并保持停止写入：

```sh
WRANGLER_LOG_PATH=/absolute/path/migration-artifacts/wrangler.log \
pnpm exec wrangler d1 time-travel restore DB \
  --bookmark <recorded-bookmark> \
  --json
```

恢复完成后，导出新的旧数据快照，并重新运行 `pnpm migration:audit`。重新开放写入前，必须将其数据行数量和保全清单与已归档的迁移前报告进行比较。

## 必须归档的证据

- 应用提交和迁移版本；
- 操作人员和 UTC 时间戳；
- 停止写入的具体方式；
- 数据库路径，或 Cloudflare 数据库名称和 ID；
- 源快照及 JSON/文本审计报告；
- 数据行数量、阻断项、subject 差异、重复组和保全哈希；
- SQLite 备份/演练文件及其清单，或 D1 Time Travel bookmark；
- 迁移后验证结果或恢复后审计结果。
