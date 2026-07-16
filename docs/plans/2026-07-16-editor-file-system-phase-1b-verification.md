# Gate 1B 验证记录

日期：2026-07-16
分支：`codex/editor-files-phase-1a`
Gate 基线：`6b34459df69c98f343a6b435a51f95de737574f8`

## 已交付的接口边界

- 新增专用于迁移的旧 Path 归一化函数：它只为迁移输入补充 `/`，随后交给 Gate 1A 的规范 Path 解析器处理。
- 新增针对旧 `markdown` 数据行的确定性只读审计。
- 支持归档机器可读的 JSON 报告和人类可读的文本报告。
- SQLite 数据库与 Wrangler D1 快照使用相同的数据行结构和审计引擎。
- 新增经过验证的 SQLite `VACUUM INTO` 备份及恢复演练清单。
- 为 Gate 1C 的迁移工作提供阻断型和成功型测试夹具。
- 提供 SQLite/D1 恢复操作手册，明确维护边界、数据库身份、Time Travel 和恢复检查。

Gate 1B 不会修改 `markdown` 的 schema、数据行、索引、生产调用方、Save 流程、Renderer 字段或 Svelte 依赖。

## 审计覆盖范围

报告会记录：

- active 数据行在 Path 归一化后的冲突组；
- active 和 recycled 状态下的非法 Path；
- 旧 `subject` 与 `basename(normalizedPath)` 的差异；
- active/recycled 重复组，以及仅包含 recycled 数据的重复组；
- 不构成阻断的派生 Title 重复；
- 已存储 Source 分类与派生 Source 分类之间的差异；
- ID、Path、派生 Title 和回收站状态的稳定数据行投影；
- 数据行数量，以及 ID、内容、时间戳、隐私状态、remote truth、分类、标签、引用和回收站元数据的 SHA-256 保全清单。

只有 active Path 归一化冲突和非法 active Path 会将 `status` 设置为 `blocked`，并使 CLI 以状态码 `2` 退出。recycled 重复项只会被报告，并继续作为独立的数据行投影保留。

## 测试夹具证据

测试夹具包含：

- `memo/note` 和 `/memo//note` 在归一化后发生冲突；
- 旧 subject 与派生 Title 不一致；
- 一个 active 数据行和两个 recycled 数据行共同使用 `/post/hello`；
- 一个带扩展名的非法 active Path；
- 私有 Unicode memo、根级 page、remote-truth post、标签和绝对引用；
- 一个 active File 和两个满足旧索引约束的 recycled File：不同 Path、相同 Title 的 File 仍允许恢复，相同 Path 的 File 仍会冲突；
- 用于保全检查和备份检查的显式稳定 ID 与时间戳。

## 恢复能力证据

- SQLite 集成测试通过 Drizzle 创建真实的临时旧数据库、运行 CLI，并证明源数据行没有发生变化。
- 备份演练会创建一致性备份，将其复制到独立的恢复目标，对三个数据库运行 `PRAGMA integrity_check`，并比较数据行数量和保全清单。
- 未显式确认维护边界，或源数据库审计结果为 blocked 时，备份 API 会拒绝执行。
- 已根据仓库安装的 Wrangler 4.11.0 帮助信息核对 D1 身份、快照、Time Travel 信息及恢复命令的参数形式。没有执行远程数据库操作。

## 验证结果

| 检查项 | 结果 |
| --- | --- |
| 审计/备份/Path/回收站/树专项测试套件 | 通过：5 个文件，35 项测试 |
| 完整 `pnpm test` | 通过：19 个文件，146 项测试 |
| 变更文件 ESLint | 通过 |
| `pnpm exec astro check` | 没有新增诊断；仍被 `drizzle.config.ts` 和 `src/pages/api/playground/compile.ts` 中的两个既有错误阻断 |
| `pnpm run build:cf` | 通过 |
| SQLite dry-run CLI 集成测试 | 通过；成功生成 JSON/文本归档，源数据行保持不变 |
| 不安全快照 CLI 集成测试 | 通过；成功报告阻断项，并以状态码 `2` 退出 |
| SQLite 备份/恢复演练 | 通过；完整性、数据行数量、保全清单，以及备份/演练文件哈希均验证成功 |
| D1 操作手册命令校验 | 通过；已根据安装的 Wrangler 4.11.0 帮助信息核对，未执行远程操作 |

现有 `markdown-parser` 测试仍会在通过测试的同时输出既有的不完整 DOM mock 错误信息。Gate 1B 没有修改该解析器。

## 复审闭环

已针对 `6b34459...HEAD` 执行所需的 Standards 与 Spec 复审。根据复审意见完成了以下修复：

- 拆分两个过大的测试套件回调，确保每个函数均低于仓库规定的 100 行上限；
- 统一审计命令与备份命令的 CLI 标志/参数值解析逻辑；
- 将无法满足旧 schema 的“双 active、相同 subject”夹具替换为真实的旧 schema 恢复夹具；
- 证明不同 Path、相同 Title 的 recycled File 仍可恢复，而相同 Path 的 recycled File 仍会冲突；
- 拒绝处理失败的 Wrangler D1 结果包装，避免把它误判为空的 ready 快照；
- 恢复结果只在夹具中声明一次，并由集成测试直接消费。

最终 Standards 复审没有硬性问题，也没有遗留的代码异味判断项。最终 Spec 复审没有 Gate 1B 问题或范围扩张。

如果本记录中存在失败的实现检查或尚未解决的 Gate 1B 复审问题，则不得开始 Gate 1C。
