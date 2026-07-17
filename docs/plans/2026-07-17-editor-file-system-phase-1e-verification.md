# Gate 1E 验证记录

日期：2026-07-17
分支：`codex/editor-files-phase-1a`
Gate 基线：`78392025e0c738cf74fe1b358bb6780ec3924177`

## 已交付的接口边界

- 客户端恢复状态从按 Path 存储的 `drafts` 迁移为按稳定 File ID 存储的 Edit Buffer；Buffer 保存 Path、Source、private、`baseRevision`、dirty 和冲突时的服务端值。
- `koala-editor-drafts` 只作为一次性只读迁移入口。只有唯一匹配一个 active File 且 ID 不冲突的旧记录会迁移；歧义、已删除、缺失、损坏或 ID 不匹配的记录会安全丢弃。
- 服务端 File 列表与 Edit Buffer 不再混为同一份 `editorStore.items`。Sidebar dirty 状态按 File ID 查询，rename/move 后切换 File 仍可恢复同一 Buffer。
- 同 ID 服务端刷新遵守 revision 规则：同 revision 保留本地值；新 revision 保留本地值并标记冲突；根级全量缺失确认 purge 后清理 Buffer；子 Prefix 缺失不会把可能的跨 Prefix move 误判成 purge。
- 普通 Save 使用 `baseRevision` CAS。冲突时自动 Save 被禁用，用户可以显式选择服务端版本，或保留本地版本并把 base revision 更新到当前服务端 revision 后再次 Save。
- trash、purge 和 empty-trash 会清理对应的 Edit Buffer 与当前私有编辑状态；远端刷新返回同 ID recycled File 时也会清理 Buffer。

Gate 1E 没有引入 CodeMirror、Renderer Mode、Svelte Source、编译器或 Render Artifact，也没有引入 draft/document/publication 生命周期。

## 生命周期、Path 与引用

- File Path 继续使用绝对、无扩展名、active 唯一的身份；Title 仍只由 Path basename 派生。
- Prefix 刷新现在校验绝对 Path Prefix，并使用保留前导 `/` 的字面段边界查询。`/project/` 不再错误查询为 `project/%`，也不会命中 `/projected/`；Path 中的 `_`、`%` 不会被 SQL 当成通配符，emoji 等非 BMP Unicode Prefix 也不受 JavaScript 与 SQLite 字符长度差异影响。
- scoped refresh 只替换该 Prefix 的服务端 File 投影；只有根 `/` 全量刷新才把缺失 ID 当作 purge 证据。
- 双链插件仍只解析绝对 `[[/path]]`，相对/Title shorthand 不解析；rename/move 不改写其他 File 的 Source。
- recycle-bin restore 仍只按规范化后的 active Path 判断冲突；普通 restore 会写回 canonical Path 并派生 Title，接受 rename restore 也由最终 Path 派生 Title，重复 recycled File 行为保持不变。

## Edit Buffer 存储与响应式修复

新持久化键为：

```text
koala-editor-edit-buffers
```

持久化数据带 `schemaVersion: 1`，无效 schema 或 malformed Buffer 不会进入运行状态。初始化先恢复新格式；只有新格式不可用时才尝试旧 key。迁移会先成功写入新格式，再删除旧 key；若浏览器存储写入失败，旧数据会保留。

真实浏览器 red→green 验证发现并修复了一个 Svelte effect 顺序问题：切换 File 时，持久化 effect 可能先把旧 File 的 Path/Source 写到新 File ID，再由初始化 effect 读回。现在使用 pre-effect 在普通持久化 effect 前完成新 File/Buffer hydration；切换后会加载目标 File 自己的值，切回后恢复原 ID 的本地值。

为遵守仓库的组件大小限制，文件工具栏从 `index.svelte` 拆为 `EditorToolbar.svelte`；编辑、Save、上传、Preview、回收站和冲突行为不变。

## Markdown-only 磁盘交换

Phase 1 的磁盘表示固定为：

```text
/memo/project/note <-> memo/project/note.md
```

- ZIP 只写 File Source，不生成或注入 Path、Title、时间、标签、private、deletedAt 等 metadata，也不导出 recycle-bin File。
- 导出保留绝对 File Path 对应的目录结构；两个不同 Prefix 下的同名 File 会得到不同 ZIP 路径。
- 导入只剥最后一个 `.md`，保留用户 Source 和用户自己的 frontmatter 字节；不会把 frontmatter 当成 Koalablog 控制字段。
- `.svelte`、`.markdown`、`.mdx` 等非 `.md` 文件会拒绝整次目录导入；`note.svelte.md` 在剥离 `.md` 后仍因 File Path 带扩展名而拒绝。
- 目录导入能力探测与实际调用统一使用 `showDirectoryPicker`，避免错误启用只支持 `showOpenFilePicker` 的浏览器。
- import Action 只接受严格的 `{ path, content }`；Path 必须绝对且无扩展名。服务端先规范化 Path，再根据 `/memo/` Visibility Default 推导 private，拒绝客户端注入 Title、private、时间或 deletedAt。

Bearer batch API 继续使用绝对 Path、稳定 ID 和 `baseRevision`，并在冲突时返回当前服务端 File。sync-vault 只监听最终 `.md` 文件，构造绝对 Path，并使用同一 revision precondition；未新增 `.svelte` 分支。

## 真实浏览器验证

在独立的临时 SQLite 数据库与本地测试配置下完成：

- 编辑 File A 后切到 File B，B 加载自己的 Path/Source；切回 A 后按 ID 恢复未保存 Source。
- File A 的未保存 Path 改名在切换后仍恢复，Title 实时等于新 Path basename。
- 同 revision Prefix refresh 保留本地 Buffer，Save 仍可用；新 revision 初始化/刷新保留本地值、显示服务端 Path 和 revision，并禁用 Save。
- `Keep local and rebase` 保留本地 Path/Source，以服务端 revision 重放后 Save 成功，数据库 revision 从 2 更新到 3。
- 同 ID 服务端 Path 移动到 `/memo/server-path-v4` 后仍能找到原 ID Buffer；`Use server version` 清除本地值并加载服务端 Path/Source。
- 带未保存 Buffer 的 File 移入 recycle bin 后显示服务端 Source；永久删除后选中 fallback File，Buffer 不再出现。
- 展开 `/project/` 会稳定保留并显示 `/project/project`，不再因丢失前导 `/` 而清空节点。
- 工具栏拆分后 Path、Source、Save、Preview、隐私、回收站和链接按钮均正常渲染，控制台没有新增编辑器错误。
- 干净重启 dev server 后，Settings 的 Template、Import、Export 岛组件均完成 hydration。当前浏览器运行时无法捕获临时 `<a download>` 触发的下载事件，也不能自动操作原生目录选择器；ZIP 内容和目录导入因此由磁盘纯函数、目录适配器和 Action 测试覆盖。

## 验证结果

| 检查项 | 结果 |
| --- | --- |
| Gate 1E 聚焦 Vitest | 通过：Edit Buffer、File Tree、Prefix DB、disk、directory picker、import Action、Save、recycle bin、batch API、remote truth、absolute references 和 public route 均通过 |
| 完整 `pnpm test` | 通过：32 个文件，186 项测试 |
| `pnpm test:d1` | 通过：3 个文件，10 项测试；沙箱内 Workers pool 无诊断退出，沙箱外本地运行通过 |
| Gate 1E 变更文件 ESLint | 通过；Svelte 文件不在当前 ESLint 配置内 |
| 完整 `pnpm run lint` | 被 467 个既有历史诊断阻断，集中在旧文档、sync-vault、playground、生成类型和未改动页面；没有 Gate 1E 变更文件诊断 |
| `pnpm exec astro check` | 没有新增错误；仍被 `drizzle.config.ts` 和 `src/pages/api/playground/compile.ts` 两个既有错误阻断 |
| `pnpm run build:cf` | 通过；服务端、客户端与静态路由产物均成功生成 |
| `pnpm run build` | 仍被仓库既有的 standalone server adapter 未配置问题阻断 |
| 真实浏览器 Edit Buffer/lifecycle | 通过：切换、rename Buffer、same/new revision、rebase、use-server、trash 和 purge 均已验证；复审结构拆分后重新确认编辑器与 Import Settings hydration，当前页面无控制台错误 |
| Phase 2/3 范围检查 | 通过：没有 CodeMirror、Renderer Mode、Svelte 编译或 Artifact 运行路径 |

## 复审入口

初始 Gate 1E 提交完成后，以 `7839202...HEAD` 为范围执行 Standards/Spec 双轴复审。首轮发现已修复：Edit Buffer 拆为独立模块，服务端列表刷新统一 reconciliation，Source Key 不再硬编码，Path 输入补充无障碍名称；同时补齐 Prefix 字面匹配、普通 restore Title 派生和 import 规范化后 Visibility Default。第二轮继续收口 Unicode Prefix、restore canonical Path、全部 File 集合的 Source Key 推导、File 命名、共享冲突错误处理和共享服务端快照 projector，并把 `index.svelte` 控制在 400 行以内。

所有修复完成后已重跑聚焦测试、完整测试、D1、变更文件 ESLint、Astro 检查、Cloudflare 构建和真实浏览器 smoke。最终双轴复审结果为 Standards 0 项、Spec 0 项；Gate 1E 正式关闭，可以进入 Phase 2。
