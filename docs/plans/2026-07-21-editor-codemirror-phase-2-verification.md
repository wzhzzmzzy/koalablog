# Phase 2 CodeMirror 验证记录

日期：2026-07-21

分支：`codex/editor-codemirror-phase-2`

对比基线：`bcda604`

## 当前结论

Phase 2 的自动化门禁已通过。`/dashboard/edit` 的 File Source 已由 Markdown-only CodeMirror 6 实现，textarea adapter 与未使用的 Monaco 依赖已经删除。Template、Renderer Mode、Svelte Source、编译器、诊断、Build Worker、Render Artifact 和 Playground 均未纳入本阶段。

Phase 2 尚未正式关闭，也不得开始 Phase 3。还需要用户在真实设备上完成人工 gate：

- 原生中文 IME 候选交互；
- 物理触控选择与滚动。

## 已交付的编辑器边界

- FileEditor 继续拥有 File、Path、Edit Buffer、Save、revision/conflict 和 Preview；Text Editor 不接触 File revision，也没有 Save keymap。
- 当前编辑器实例只暴露 `focus()` 与 `insertImages(files)`；模块只暴露生命周期命令 `discardEditorState(fileId)`。
- 私有 `Map<FileId, EditorState>` 只缓存 selection、scroll、fold 和 undo 等交互状态，不进入 localStorage，也不成为第二份 Source 真相。
- Preview 只隐藏编辑表面，Text Editor 保持挂载；返回 Edit 后重新测量并聚焦 Source。
- paste、drop 与 toolbar multi-select 统一为 Markdown 图片事务。异步上传结算不进入 undo history，失败、提前删除、并发与 upload 中 undo/redo 均有浏览器验收。
- Save action 在 multipart 表单边界把 CRLF/CR 统一为 LF，避免相同 Source 因换行编码差异被误判为外部替换。rename 后 selection、scroll、fold 和 undo 因此保持不变。

## 浏览器验收

Playwright 使用两项 Chromium project：

- Desktop Chrome：22 条 `/dashboard/edit` 场景；
- Pixel 5 touch-capable Chromium：1 条原生 touch scroll gesture 场景。

覆盖范围包括：

- stable accessible label、readonly、File 切换、selection、scroll、fold、undo；
- same-ID clean replacement、dirty refresh、newer revision conflict；
- rename 后 selection、scroll、fold、undo 保持；purge 与 empty-trash fallback；
- Ctrl+S/Cmd+S exactly once、Save 保持焦点、普通 File 切换不抢焦点、新建聚焦 Path；
- Preview 保持挂载，返回 Edit 聚焦 Source；toolbar 图片完成后聚焦 Source；
- Markdown search/replace、bracket closing、indentation、multiple selections、line numbers、active line；
- paste、drop、toolbar multi-select、并发 placeholder、失败清理、提前删除、upload 中 undo/redo；
- 窄屏隐藏 gutter、键盘编辑、编辑器内部滚动，以及 touch-capable Chromium 的原生触控滚动。

自动化 touch gesture 不能替代真实设备上的选择手柄、软键盘和滚动物理体验，因此物理触控仍保留为人工 gate。

## Bundle 与公共页面

Cloudflare 生产构建生成：

```text
_astro/Page.LUIecm3L.js
raw:  607,966 bytes
gzip: 209,475 bytes
```

构建 manifest 把 `@/components/editor/Page.svelte` 映射到该 chunk，chunk 内包含 CodeMirror。编译后的 `dashboard/edit.astro.mjs` 明确 hydration 这个 Page island；公共动态页 `_---slug_.astro.mjs` 不引用 editor Page，因此公共 `/phase-two` 不进入 CodeMirror 客户端依赖图。

## 双轴审查修复

Standards 首轮 6 项均已处理：

- `createImageHistoryController` 拆为范围跟踪、上传结算、undo/redo 投影等小函数；
- CodeMirror 新样式从 `EditorView.theme` 迁到宿主静态 utility classes；
- `textareaValue` 更名为 `sourceValue`；
- E2E 删除 textarea 兼容分支；
- 删除无效 image batch ID/effect 参数；
- 抽取重复的 upload gate helper。

Spec 首轮 3 项的处理结果：

- 不恢复 textarea adapter。当前已通过自动化 parity，且本轮确认人工 IME/物理触控是最终 release sign-off，不再维持第二套生产实现；
- 增加 touch-capable mobile project 和浏览器原生 touch scroll gesture；
- 增加 dirty same-ID conflict 与 rename selection/scroll/fold/undo 浏览器验收。

## 验证结果

| 检查项 | 结果 |
| --- | --- |
| `pnpm install --frozen-lockfile --offline` | 通过；lockfile 可离线复现 |
| `pnpm test` | 通过：36 个文件，203 项测试 |
| `pnpm run test:d1` | 通过：3 个文件，10 项测试 |
| 完整 Playwright | 通过：23/23；Desktop Chrome 22，mobile Chromium 1 |
| Phase 2 变更 TypeScript ESLint | 通过 |
| `pnpm exec astro check` | 没有新增错误；仍只有 `drizzle.config.ts:22` 与 `src/pages/api/playground/compile.ts:7` 两个既有错误 |
| `pnpm run build:cf` | 通过；Wrangler 因沙箱无法写用户日志目录而输出 EPERM，但类型生成、服务端构建和客户端构建均完成，退出码为 0 |
| Bundle/public route | 通过：editor Page chunk 为 607,966 B / 209,475 B gzip；公共动态页无 editor Page 引用 |
| 原生中文 IME | 待人工 |
| 物理触控选择与滚动 | 待人工 |

## Gate 状态

自动化 gate：通过。

人工 gate：待完成。

Phase 2 总 gate：保持开放，禁止开始 Phase 3。
