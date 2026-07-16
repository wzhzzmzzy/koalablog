# Gate 1D 验证记录

日期：2026-07-16
分支：`codex/editor-files-phase-1a`
Gate 基线：`9458b8a0bff3ff3ee9b378a488d5f927dfc99d2f`

## 已交付的接口边界

- 新建 File 只通过认证后的 `actions.db.markdown.create` 完成；编辑器的 `+` 不再构造 `id=0` 的客户端临时对象，普通 Save 也明确拒绝 `id=0`。
- 创建请求只接收完整的绝对 `targetPrefix`。服务端读取真实 Template Catalog，执行最长段边界 Prefix 匹配，并在数据库 active Path 唯一约束下立即插入。
- 创建成功返回带稳定 `id` 和 `revision` 的 `FileRecord`；客户端随后更新 Store、选中 File、更新 URL，并把焦点移到 Path 输入框。
- Settings 的 Utility 区新增懒加载 `TemplateUtility`，Template Catalog 的读取、revision CAS 保存和冲突提示完全独立于主 Settings 保存。
- Sidebar 合并 active File Path 和非根 Template Prefix；尚无 File 的 Template Prefix 也可显示并直接创建，删除 Template 后仅由现有 File 支撑的目录仍会保留。
- `/memo/` 预设只是初始化时写入的普通 Template，可以编辑或删除；已存储空 Catalog 时不应用任何 Template。

Gate 1D 没有迁移旧 `drafts` 持久化键或按 Path 的 Edit Buffer，没有引入 CodeMirror、Renderer Mode、Svelte 编译器或 Render Artifact；这些仍分别属于 Gate 1E、Phase 2 和 Phase 3。

## Template Catalog 与 Utility

Template v1 仍只包含以下字段：

```text
id
prefix
titlePattern
pathPattern
content
```

Catalog 使用独立的 `schemaVersion` 和单调递增 `revision`。读取不存在的 Catalog 会返回 `absent`，不会在运行时合成默认配置；初始化迁移才会写入 `/memo/` preset。已存储的空数组保持为空。

Utility 支持列表、增加、编辑、删除，以及 Prefix、Title pattern、绝对 Path pattern和 Content 编辑。界面会：

- 对 sample target Prefix 实时展示命中的 Template、解析后 Title、Path 和 Content；
- 在保存前阻止重复的规范化 Prefix、重复 ID 和无效 Template；
- 显示 `Unsaved changes`，并只通过独立的 `Save Templates` Action 保存；
- 在 revision 已过期时保留本地编辑内容，并显示服务端当前 revision；
- 明确展示空 Catalog 使用 Blank Creation。

SQLite 与 D1 共用的契约测试覆盖不存在/初始化、已存储空 Catalog、过期 revision、重复 Prefix、重复 ID、损坏 JSON、100 KB Content，以及主 Settings 更新不影响 Template Catalog。

## 服务端创建与冲突规则

服务端创建遵守以下顺序：

1. 校验并规范化完整 `targetPrefix`；
2. 读取已存储 Template Catalog；
3. 按最长段边界 Prefix 选择最多一个 Template；
4. 解析 Title、绝对 Path 和 Content；
5. 应用 Visibility Default：`/memo/` 下为 private，其他 Path 为 public；
6. 依赖数据库 active Path 唯一约束立即插入；
7. 返回已持久化的 File。

Blank Creation 从 `unnamed` 开始，并依次尝试 `unnamed-1`、`unnamed-2`。含 `{{uniqueSuffix}}` 的 Template 会在唯一约束竞争失败后使用下一后缀重试；固定 Template 只尝试一次，并返回 `path_conflict` 和解析后的绝对 Path。两类可重试创建共用 100 次上限，重试判断不依赖客户端 File 列表快照。

点击嵌套目录的 `+` 会把该目录完整 Prefix 传入服务端。例如 `/memo/` Template 命中 `/memo/project/` 时，最终 Path 仍是 `/memo/project/<title>`，不会退回 `/memo/<title>`。

## 真实浏览器与落盘验证

在隔离的临时 SQLite 数据库和配置下完成了真实浏览器验收：

- 零 File 时，初始化 `/memo/` Template 已作为 template-only 节点显示；
- 点击 memo `+` 后立即进入 `/memo/202607162145`，返回的 File 为 `id=1`、`revision=1`、private；
- 修改 Template Content 后出现 `Unsaved changes`，独立保存成功后按钮恢复为 disabled；
- 新增并保存 `/project/` Template 后，编辑器出现 template-only `project` 节点；点击其 `+` 后立即进入 `/project/project`，Title 为 `project`，File 为 `id=2`、`revision=1`、public；
- 删除全部 Template 并保存空 Catalog 后，根级 `New file...` 创建 `/unnamed`，Title 为 `unnamed`，File 为 `id=3`、`revision=1`、public；
- 三个 File 均直接存在于 SQLite `markdown` 表，`remoteTruth=1`，不存在 `id=0` 中间态。

浏览器控制台唯一错误来自隔离复制目录与原仓库依赖路径不一致导致的 Astro dev-toolbar Vite allow-list `403`；所有应用 Action 均返回成功，不属于 Gate 1D 产品路径错误。

## 验证结果

| 检查项 | 结果 |
| --- | --- |
| Gate 1D 聚焦 Vitest | 通过：8 个文件，29 项测试 |
| 完整 `pnpm test` | 通过：27 个文件，165 项测试 |
| `pnpm test:d1` | 通过：3 个文件，10 项测试 |
| Gate 1D 变更文件 ESLint | 通过；Svelte 文件不在当前 ESLint 配置内 |
| `pnpm exec astro check` | 没有新增错误；仍被 `drizzle.config.ts` 和 `src/pages/api/playground/compile.ts` 中两个既有错误阻断 |
| `pnpm run build:cf` | 通过；服务端和客户端产物均成功生成 |
| `pnpm run build` | 受仓库既有的本地 server adapter 未配置问题阻断 |
| 真实浏览器创建链 | 通过：Template 编辑/保存、template-only Prefix、memo private、普通 public、空 Catalog Blank Creation 均已验证 |
| Gate 1E / CodeMirror / Svelte 范围检查 | 通过：没有提前改变 Edit Buffer 身份模型，也没有新增后续阶段依赖或运行路径 |

## 复审状态

Gate 1D 已针对 `9458b8a...HEAD` 完成 Standards/Spec 双轴复审。Spec 轴未发现缺失、错误行为或范围扩张；Standards 轴初审只发现 File Tree 把已验证 Path Prefix 降级为 `fullPath: string` 的领域类型问题。

复审修复已将 `FileTreeNode.prefix`、`Page`、`Sidebar` 和 `buildFileTree` 的 Template Prefix 链路统一为 `AbsolutePathPrefix`，在 SSR 存储边界显式解析，并使非法存储/树 Prefix 明确抛错，不再静默跳过。最终 Standards 与 Spec 复审均通过，没有未关闭发现。

修复后的 Gate 1D 聚焦测试、完整测试、D1、变更文件 ESLint、Astro 检查和 Cloudflare 构建均已重新执行；Gate 1E 可以开始。
