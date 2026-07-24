# Phase 2 CodeMirror 验证记录

日期：2026-07-21（补充复核：2026-07-22）

分支：`codex/editor-codemirror-phase-2`

对比基线：`bcda604`

## 当前结论

Phase 2 的自动化门禁已通过。`/dashboard/edit` 的 File Source 已由 Markdown-only CodeMirror 6 实现，textarea adapter 与未使用的 Monaco 依赖已经删除。Template、Renderer Mode、Svelte Source、编译器、诊断、Build Worker、Render Artifact 和 Playground 均未纳入本阶段。

用户已于 2026-07-22 确认在真实环境完成最终人工 gate，并确认当前版本已经上线：

- 原生中文 IME 候选交互；
- 物理触控选择与滚动。

因此 Phase 2 正式关闭。Phase 3 仍须等待工作树清理并从清理后的最新 `main` 建立独立分支，但不再受 Phase 2 gate 阻塞。

## 已交付的编辑器边界

- FileEditor 继续拥有 File、Path、Edit Buffer、Save、revision/conflict 和 Preview；Text Editor 不接触 File revision，也没有 Save keymap。
- 当前编辑器实例只暴露 `focus()` 与 `insertImages(files)`；模块只暴露生命周期命令 `discardEditorState(fileId)`。
- 私有 `Map<FileId, EditorState>` 只缓存 selection、scroll、fold 和 undo 等交互状态，不进入 localStorage，也不成为第二份 Source 真相。
- Preview 只隐藏编辑表面，Text Editor 保持挂载；返回 Edit 后重新测量并聚焦 Source。
- paste、drop 与 toolbar multi-select 统一为 Markdown 图片事务。异步上传结算不进入 undo history，失败、提前删除、并发与 upload 中 undo/redo 均有浏览器验收。
- Save action 在 multipart 表单边界把 CRLF/CR 统一为 LF，避免相同 Source 因换行编码差异被误判为外部替换。rename 后 selection、scroll、fold 和 undo 因此保持不变。

## 浏览器验收

Playwright 使用两项 Chromium project：

- Desktop Chrome：24 条 `/dashboard/edit` 场景；
- Pixel 5 touch-capable Chromium：2 条移动端场景。

覆盖范围包括：

- stable accessible label、readonly、File 切换、selection、scroll、fold、undo；
- same-ID clean replacement、dirty refresh、newer revision conflict；
- rename 后 selection、scroll、fold、undo 保持；purge 与 empty-trash fallback；
- Ctrl+S/Cmd+S exactly once、Save 保持焦点、普通 File 切换不抢焦点、新建聚焦 Path；
- Preview 保持挂载，返回 Edit 聚焦 Source；toolbar 图片完成后聚焦 Source；
- Markdown search/replace、bracket closing、indentation、multiple selections、line numbers、active line；
- paste、drop、toolbar multi-select、并发 placeholder、失败清理、提前删除、upload 中 undo/redo，以及新编辑分支丢弃旧图片 redo batch；
- Chromium `Input.imeSetComposition` 候选字符串更新、中文提交、焦点保持和单次 undo；
- 393px Pixel 5 与 320px 窄屏下 Path 和全部 File 操作可达、隐藏 gutter、键盘编辑、编辑器内部滚动，以及 touch-capable Chromium 的原生触控滚动。

自动化 composition 与 touch gesture 不能替代操作系统候选窗、真实设备选择手柄、软键盘和滚动物理体验，因此这两项保留为人工 gate，并已由用户完成最终确认。

## 独立 Chrome 运行时复核

2026-07-22 使用隔离 Chrome profile 和独立 SQLite fixture 直接验收 `/dashboard/edit`：

- 桌面端输入中文 Unicode 后 undo/redo 正常，Source 始终保持焦点；Cmd+S 只产生 1 个 `POST /_actions/form.save`，返回 200；
- Preview 时 CodeMirror 节点仍连接在 DOM 中且只有 1 个实例，返回 Edit 后恢复 Source 焦点和原文；
- 切换到 `/second` 不抢 Source 焦点，切回 `/phase-two` 后未保存文本和 undo 历史仍在；
- Pixel 5 UA 下复核 393px 与 320px 截图。首次复核发现 Path 被压到 4px、Preview 部分越界、回收站和复制链接完全不可达；现已改为移动端工具栏换行，并由浏览器回归覆盖；
- 桌面及移动复核期间浏览器控制台均为 0 error、0 warning。

## Bundle 与公共页面

Cloudflare 生产构建生成：

```text
_astro/Page.DTJBeAlv.js
raw:  608,184 bytes
gzip: 208,120 bytes
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

最终复审补充项也已处理：

- 新 history 分支会丢弃当前 File 的 inactive 图片 batch，防止 redo 用深度相同但已失效的旧 batch 投影图片；
- rename 验收增加第二次 undo，明确证明 rename 前的 Source 历史仍然存在；
- 删除只转发 `imageHistory.settle()` 的 `applySettledUpload()` 中间层。
- Phase 2 新增的 SQLite 测试 fixture 与 server refresh helper 统一改由 Drizzle migrator/ORM 访问，不再直接调用 libsql DDL/DML。

上线前浏览器补充复核又关闭 1 个移动端缺陷：

- `EditorToolbar` 在窄屏允许换行，Path 独占一行，全部 File 操作在 393px 与 320px 视口内完整可达；桌面断点仍保持原单行布局。

## 验证结果

| 检查项 | 结果 |
| --- | --- |
| `pnpm install --frozen-lockfile --offline` | 通过；lockfile 可离线复现 |
| `pnpm test` | 通过：36 个文件，203 项测试 |
| `pnpm run test:d1` | 通过：3 个文件，10 项测试 |
| 完整 Playwright | 通过：26/26；Desktop Chrome 24，mobile Chromium 2 |
| Phase 2 变更 TypeScript ESLint | 通过 |
| `pnpm exec astro check` | 没有新增错误；仍只有 `drizzle.config.ts:22` 与 `src/pages/api/playground/compile.ts:7` 两个既有错误 |
| `pnpm run build:cf` | 通过；Wrangler 因沙箱无法写用户日志目录而输出 EPERM，但类型生成、服务端构建和客户端构建均完成，退出码为 0 |
| Bundle/public route | 通过：editor Page chunk 为 608,184 B / 208,120 B gzip；公共动态页无 editor Page 引用 |
| 原生中文 IME | 通过；用户于 2026-07-22 确认完成真实环境人工 gate |
| 物理触控选择与滚动 | 通过；用户于 2026-07-22 确认完成真实设备人工 gate |

## 最终人工 gate 清单

原生中文 IME（macOS 拼音或实际主要输入法）：

1. 在 Source 中输入拼音，候选窗出现时连续修改未提交拼音；候选期间 Source 不闪烁、不失焦、不重建。
2. 用数字键和鼠标各选择一次中文候选；提交结果只出现一次，光标紧跟提交文字。
3. 组合期间按 Escape 取消，再重新输入并提交；取消内容不残留。
4. 提交后执行一次 undo/redo，再 Cmd+S；中文完整恢复且只保存一次。

物理触控（实际手机或平板，不使用桌面鼠标模拟）：

1. 在竖屏打开 `/dashboard/edit`，确认 Path、隐私、保存、图片、Preview、回收站和复制链接均可直接点击。
2. 点击 Source 中部定位光标，长按出现选择手柄并拖动跨行选择；页面不误触侧栏或工具栏。
3. 在长 Source 内上下滑动，滚动留在编辑器内；到达边界后页面行为自然，无卡死或跳动。
4. 打开软键盘输入、换行、删除并 undo/redo；关闭键盘后 Source 尺寸和滚动位置合理。
5. 切换 Preview 再返回 Edit；Source 自动聚焦，原选择、undo 与滚动状态仍在。

两项执行结果均由用户确认为通过；具体设备、OS 和浏览器版本未提供给本文，因此不在此补写推测值。

## Gate 状态

自动化 gate：通过。

人工 gate：通过（用户于 2026-07-22 确认）。

Phase 2 总 gate：关闭，可以在工作树清理并从最新 `main` 建立独立分支后开始 Phase 3。
