# Gate 1C 验证记录

日期：2026-07-16
分支：`codex/editor-files-phase-1a`
Gate 基线：`a4fe02bbab38b1ca8f364f3c126bfdce455a3fe5`

## 已交付的接口边界

- `markdown` 表保留原表名，但以绝对 `path`、派生 `title` 和单调递增的 `revision` 替换旧 `link`、独立 `subject` 模型。
- `FileRecord` 成为生产 TypeScript 模型；旧 `Markdown`、`initMarkdown` 和 `getSourceFromLink` 兼容别名已移除。
- Source Save 只接收 `id`、`path`、`content`、`private` 和 `baseRevision`；Title、Source 分类、标签与 outgoing Paths 均由服务端派生。
- 同一 `baseRevision` 的并发 Save 只允许一个成功；失败方收到 HTTP `409 source_conflict` 及当前服务端 File。
- active Path 占用返回 HTTP `409 path_conflict`，不会覆盖任一 File。
- 编辑器不再读取 Preview DOM 生成标签/引用，也不再在移动或重命名后改写其他 File 的 Source。
- 公开路由、编辑器 Store/树、回收站、RSS、Bearer batch、remote truth、导入与同步脚本均改用绝对 Path 和派生 Title，同时保持现有 Markdown 渲染。

Gate 1C 没有加入 Renderer Mode、`sourceHash`、Svelte 依赖、Template Utility 或服务端 `+` 创建；这些仍分别属于后续 Gate 1D、1E 与 Phase 3。

## Source schema

迁移 `0002_file_source_schema.sql` 使用 replacement-table 方式生成：

```text
markdown
  id
  source
  path
  title
  content
  tags
  incoming_links
  outgoing_links
  private
  remoteTruth
  revision
  createdAt
  updatedAt
  deletedAt
```

约束如下：

- `markdown_active_path_unique` 只约束 active File 的 Path；
- 不存在 active Title 唯一索引，因此不同 Path 可以拥有相同派生 Title；
- recycled File 可以保留重复 Path；
- 旧 outgoing reference 只有在自身携带明确 Path/`link` 时才归一化为绝对 Path，只有 Title 的旧条目不会被猜测；
- 所有迁移行的初始 `revision` 为 `1`；
- schema 中不存在 `renderer` 或 `sourceHash`。

## SQLite 迁移与恢复证据

新增 `pnpm migration:files:sqlite` 作为 Gate 1C 的 SQLite 操作入口。它会：

1. 通过 Gate 1B 审计读取旧表；
2. 在 `blocked` 时以状态码 `2` 退出并保持旧 schema 不变；
3. 在 `ready` 时于单一事务内执行 replacement-table SQL；
4. 在提交前验证行数、ID、Path/Title 投影、Source、内容、标签、incoming references、隐私状态、remote truth、时间戳、回收站元数据、初始 revision 和 `PRAGMA integrity_check`。

测试夹具还证明不同 Path、相同 Title 的 active File 可以共存；相同 active Path 会被阻断；相同 recycled Path 会被保留。

## D1 兼容证据

Cloudflare workerd 测试会从真实旧 D1 schema 创建 active/recycled 数据行、执行同一份 `0002_file_source_schema.sql`，并核对列、索引、Path/Title 投影、outgoing Path 归一化和保全字段。生产执行通过 Wrangler migration 记录只应用尚未执行的前向迁移；回滚仍使用 Gate 1B 记录的 D1 Time Travel bookmark。

## Save 与客户端冲突证据

- Save 成功时服务端从绝对 Path 派生 Title 与 Source，并通过 `src/lib/files/analysis.ts` 直接分析 Markdown Source。
- 更新仅在 `id`、active 状态和 `baseRevision` 同时匹配时执行，并在同一语句中将 revision 加一。
- revision 冲突不会修改服务端数据；编辑器保留本地 Edit Buffer、展示服务端 revision/Path，并阻止再次 Save，直到用户显式选择服务端版本或把本地缓冲 rebase 到当前 revision。
- Path 冲突不会覆盖目标 File，也不会修改发起 Save 的 File。
- 独立 `title`、旧 `subject`、客户端 `source`、`tags` 或 `outgoingLinks` 输入会在 Action/API 边界被拒绝。

## 验证结果

| 检查项 | 结果 |
| --- | --- |
| 完整 `pnpm test` | 通过：22 个文件，132 项测试 |
| `pnpm test:d1` | 通过：2 个文件，7 项测试 |
| Gate 1C 变更文件 ESLint | 通过；Svelte 文件不在当前 ESLint 配置内 |
| 同步脚本语法检查 | `node --check scripts/sync-vault/index.js` 通过；该旧脚本仍有既有全文件 lint 债务 |
| `pnpm exec astro check` | 没有新增错误；仍被 `drizzle.config.ts` 和 `src/pages/api/playground/compile.ts` 中两个既有错误阻断 |
| `pnpm run build` | 受仓库既有的本地 server adapter 未配置问题阻断 |
| `pnpm run build:cf` | 通过；服务端和客户端产物均成功生成 |
| 公开路由 Path ingress | 通过：`/post/*`、`/memo/*` 与旧 `/memos/*` 参数均映射到规范绝对 Path |
| Renderer/Svelte 范围检查 | 通过：没有新增字段、依赖、切换 UI 或运行路径 |

## 复审状态

Standards 与 Spec 双轴复审将在此实现提交后针对 `a4fe02b...HEAD` 执行；复审发现及修复会追加到本记录。
