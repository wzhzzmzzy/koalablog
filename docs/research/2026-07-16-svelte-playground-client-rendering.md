# Svelte Playground 客户端编译与 Koalablog 在线渲染方案

日期：2026-07-16

## 结论

当前官方 Playground 的实现不在旧的 `svelte-repl` 仓库，而在
[`sveltejs/svelte.dev`](https://github.com/sveltejs/svelte.dev) monorepo 的
[`packages/repl`](https://github.com/sveltejs/svelte.dev/tree/14a2bbd838df2457b5f327c2576ea762d39d79c6/packages/repl)。
本次核对的是 `main` 上 2026-07-14 的 commit
[`14a2bbd838df2457b5f327c2576ea762d39d79c6`](https://github.com/sveltejs/svelte.dev/commit/14a2bbd838df2457b5f327c2576ea762d39d79c6)；
该 package 的 README 也明确说明它就是 `https://svelte.dev/playground` 使用的 REPL 组件
（[`packages/repl/README.md`](https://github.com/sveltejs/svelte.dev/blob/14a2bbd838df2457b5f327c2576ea762d39d79c6/packages/repl/README.md)）。

对 Koalablog 最重要的结论是：**沿用官方 Playground 的“客户端 Worker 编译和打包，iframe
执行产物”架构，但不照搬完整 REPL。** 服务端只保存 Source File、校验 `sourceHash` 并持久化
客户端提交的 Render Artifact，不运行 `svelte/compiler`。

官方 Playground 目前没有生成 HTML Snapshot。其 bundler 中 server bundle 被硬编码关闭，并留有
“how can we do SSR?” TODO
（[`workers/bundler/index.ts#L629-L650`](https://github.com/sveltejs/svelte.dev/blob/14a2bbd838df2457b5f327c2576ea762d39d79c6/packages/repl/src/lib/workers/bundler/index.ts#L629-L650)）。
因此 Koalablog 的 SEO Snapshot 是基于官方 iframe RPC 结构增加的产品能力，不是 Playground 已有能力。

## 官方实现

### 1. 编译和打包都在客户端 Worker

Playground 有两个独立的 module Worker：

- `Compiler` worker 为每个 `.svelte` / `.svelte.js` 文件调用 compiler，给编辑器提供 JS、CSS、AST、
  warnings 和 errors
  （[`Compiler.ts#L6-L61`](https://github.com/sveltejs/svelte.dev/blob/14a2bbd838df2457b5f327c2576ea762d39d79c6/packages/repl/src/lib/Compiler.ts#L6-L61)、
  [`workers/compiler/index.ts#L15-L137`](https://github.com/sveltejs/svelte.dev/blob/14a2bbd838df2457b5f327c2576ea762d39d79c6/packages/repl/src/lib/workers/compiler/index.ts#L15-L137)）。
- `Bundler` worker 接收完整文件数组，在 worker 内运行 `@rollup/browser`，产出可执行 bundle
  （[`Bundler.svelte.ts#L7-L58`](https://github.com/sveltejs/svelte.dev/blob/14a2bbd838df2457b5f327c2576ea762d39d79c6/packages/repl/src/lib/Bundler.svelte.ts#L7-L58)、
  [`workers/bundler/index.ts#L1-L33`](https://github.com/sveltejs/svelte.dev/blob/14a2bbd838df2457b5f327c2576ea762d39d79c6/packages/repl/src/lib/workers/bundler/index.ts#L1-L33)）。

Bundler 给每次请求递增 `uid`，只发布当前最新请求的结果，并在若干检查点把旧请求标记为 aborted；同时复用
Rollup cache，避免连续编辑时每次完全重打包。这个控制流足以抑制陈旧结果，但不能据此假定浏览器会立即
取消已经开始的 compiler/Rollup CPU 工作
（[`workers/bundler/index.ts#L45-L80`](https://github.com/sveltejs/svelte.dev/blob/14a2bbd838df2457b5f327c2576ea762d39d79c6/packages/repl/src/lib/workers/bundler/index.ts#L45-L80)、
[`workers/bundler/index.ts#L114-L121`](https://github.com/sveltejs/svelte.dev/blob/14a2bbd838df2457b5f327c2576ea762d39d79c6/packages/repl/src/lib/workers/bundler/index.ts#L114-L121)）。

### 2. `svelte/compiler` 的加载和版本固定

官方实现不是把某个 compiler 永久写死在主页面 bundle 中。worker 中的 `load_svelte(version)`：

1. 通过 jsDelivr resolution API 将 `latest`、range 或精确版本解析成精确版本。
2. 从 npm registry 下载该 `svelte` 版本的 tarball。
3. 在浏览器中解包，读取 Svelte 5 的 `compiler/index.js`。
4. 在 worker 内间接 `eval` compiler，并读取它暴露的 `VERSION`/能力。

对应代码见
[`workers/npm.ts#L22-L69`](https://github.com/sveltejs/svelte.dev/blob/14a2bbd838df2457b5f327c2576ea762d39d79c6/packages/repl/src/lib/workers/npm.ts#L22-L69)、
[`workers/npm.ts#L72-L129`](https://github.com/sveltejs/svelte.dev/blob/14a2bbd838df2457b5f327c2576ea762d39d79c6/packages/repl/src/lib/workers/npm.ts#L72-L129)。
加载成功后 worker 把**解析后的精确版本**发回主线程
（[`workers/bundler/index.ts#L94-L111`](https://github.com/sveltejs/svelte.dev/blob/14a2bbd838df2457b5f327c2576ea762d39d79c6/packages/repl/src/lib/workers/bundler/index.ts#L94-L111)）。

Playground 页面默认请求 `latest`，解析后把精确版本写回 URL；这是交互式 Playground 的行为，
不适合作为持久化 Artifact 的版本语义
（[`playground/[id]/+page.svelte#L25-L31`](https://github.com/sveltejs/svelte.dev/blob/14a2bbd838df2457b5f327c2576ea762d39d79c6/apps/svelte.dev/src/routes/%28authed%29/playground/%5Bid%5D/+page.svelte#L25-L31)、
[`playground/[id]/+page.svelte#L221-L238`](https://github.com/sveltejs/svelte.dev/blob/14a2bbd838df2457b5f327c2576ea762d39d79c6/apps/svelte.dev/src/routes/%28authed%29/playground/%5Bid%5D/+page.svelte#L221-L238)）。

### 3. 虚拟文件、模块解析和打包

Playground 将用户文件放进 `Map<string, File>`，并增加四个内部虚拟模块：entry、wrapper、styles、
`esm-env`。
entry 导出 `mount`、`unmount` 和 `App`；wrapper 导入用户的 `App.svelte`
（[`workers/bundler/index.ts#L521-L607`](https://github.com/sveltejs/svelte.dev/blob/14a2bbd838df2457b5f327c2576ea762d39d79c6/packages/repl/src/lib/workers/bundler/index.ts#L521-L607)）。

Rollup plugin 的 resolution 规则是：

- 相对 import 在虚拟文件 Map 中解析。
- 裸包名解析成 npm package/subpath，尊重 package `exports`、`imports` 和 browser 条件。
- npm tarball 也在浏览器中获取并解包；依赖包的相对 import 继续在 tarball 内解析。
- URL import 直接 fetch，再进入 Rollup 图。
- alias 在独立 plugin 中先映射到虚拟路径。

主实现见
[`workers/bundler/index.ts#L198-L306`](https://github.com/sveltejs/svelte.dev/blob/14a2bbd838df2457b5f327c2576ea762d39d79c6/packages/repl/src/lib/workers/bundler/index.ts#L198-L306)，
虚拟相对路径和 alias 的后缀解析见
[`plugins/alias.ts#L1-L76`](https://github.com/sveltejs/svelte.dev/blob/14a2bbd838df2457b5f327c2576ea762d39d79c6/packages/repl/src/lib/workers/bundler/plugins/alias.ts#L1-L76)，
package `exports` 解析见
[`workers/npm.ts#L132-L167`](https://github.com/sveltejs/svelte.dev/blob/14a2bbd838df2457b5f327c2576ea762d39d79c6/packages/repl/src/lib/workers/npm.ts#L132-L167)。

每个 `.svelte` 文件在 Rollup transform 阶段以 `generate: 'client'` 编译。compiler warnings 被转换为
可 `postMessage` 的 plain data
（[`workers/bundler/index.ts#L307-L342`](https://github.com/sveltejs/svelte.dev/blob/14a2bbd838df2457b5f327c2576ea762d39d79c6/packages/repl/src/lib/workers/bundler/index.ts#L307-L342)、
[`workers/bundler/index.ts#L411-L426`](https://github.com/sveltejs/svelte.dev/blob/14a2bbd838df2457b5f327c2576ea762d39d79c6/packages/repl/src/lib/workers/bundler/index.ts#L411-L426)）。
最终使用 `format: 'iife'`、named exports 和 `inlineDynamicImports: true` 生成单个 client chunk
（[`workers/bundler/index.ts#L609-L627`](https://github.com/sveltejs/svelte.dev/blob/14a2bbd838df2457b5f327c2576ea762d39d79c6/packages/repl/src/lib/workers/bundler/index.ts#L609-L627)）。
因此 Svelte runtime 已经进入产物；预览端不需要 import map，也不需要再次加载 runtime。

### 4. CSS

Playground 在编译每个 Svelte component 后，把 compiler 返回的 CSS 转成运行时创建 `<style>` 的代码，
追加进该 component 的 JS；独立 `.css` 文件则由另一个 Rollup plugin 收集
（[`workers/bundler/index.ts#L362-L390`](https://github.com/sveltejs/svelte.dev/blob/14a2bbd838df2457b5f327c2576ea762d39d79c6/packages/repl/src/lib/workers/bundler/index.ts#L362-L390)、
[`workers/bundler/index.ts#L430-L466`](https://github.com/sveltejs/svelte.dev/blob/14a2bbd838df2457b5f327c2576ea762d39d79c6/packages/repl/src/lib/workers/bundler/index.ts#L430-L466)）。

这是为热重载方便做的选择，不等于 Koalablog 必须照搬。Svelte compiler 官方接口明确支持
`css: 'external'`，将 CSS 放进 compile result，以便生成更小且可独立缓存的资源
（[官方 `svelte/compiler` 文档](https://svelte.dev/docs/svelte/svelte-compiler#CompileOptions-css)、
[`CompileOptions` source](https://github.com/sveltejs/svelte/blob/602a873b6b82bba4e6edc91b039e2f6defbe3fc4/packages/svelte/src/compiler/types/index.d.ts#L98-L109)）。

### 5. iframe 执行与消息协议

官方 Viewer 使用 `srcdoc` iframe。默认 sandbox 允许 scripts、popups、forms、pointer lock 和 modals，
只有 `relaxed` 时才加 `allow-same-origin`
（[`Viewer.svelte#L356-L372`](https://github.com/sveltejs/svelte.dev/blob/14a2bbd838df2457b5f327c2576ea762d39d79c6/packages/repl/src/lib/Output/Viewer.svelte#L356-L372)）。

父页面通过 `ReplProxy` 为每条命令分配 `cmd_id`，用 `postMessage` 发送并用 `cmd_ok` / `cmd_error`
完成 Promise
（[`ReplProxy.ts#L5-L96`](https://github.com/sveltejs/svelte.dev/blob/14a2bbd838df2457b5f327c2576ea762d39d79c6/packages/repl/src/lib/Output/ReplProxy.ts#L5-L96)）。
iframe 的 `srcdoc` 监听命令，将样式放入固定 `<style>`，然后间接 `eval` bundle
（[`srcdoc/index.html#L30-L55`](https://github.com/sveltejs/svelte.dev/blob/14a2bbd838df2457b5f327c2576ea762d39d79c6/packages/repl/src/lib/Output/srcdoc/index.html#L30-L55)）。

每次应用新 bundle 前，Viewer 会卸载旧 component、移除旧 style、清空 body；之后执行 IIFE，取得
`mount/unmount/App` 并将 `App` mount 到 iframe body
（[`Viewer.svelte#L162-L179`](https://github.com/sveltejs/svelte.dev/blob/14a2bbd838df2457b5f327c2576ea762d39d79c6/packages/repl/src/lib/Output/Viewer.svelte#L162-L179)、
[`Viewer.svelte#L234-L269`](https://github.com/sveltejs/svelte.dev/blob/14a2bbd838df2457b5f327c2576ea762d39d79c6/packages/repl/src/lib/Output/Viewer.svelte#L234-L269)）。
iframe 还把 console、`window.onerror` 和 unhandled rejection 通过同一消息通道发回 editor
（[`srcdoc/index.html#L95-L100`](https://github.com/sveltejs/svelte.dev/blob/14a2bbd838df2457b5f327c2576ea762d39d79c6/packages/repl/src/lib/Output/srcdoc/index.html#L95-L100)）。

### 6. 编译和运行错误

compiler worker 捕获 exception 后保留 `message`、`position`、`loc` 等可克隆字段；warnings 同样去掉
不可克隆的 `toString`
（[`workers/compiler/index.ts#L99-L137`](https://github.com/sveltejs/svelte.dev/blob/14a2bbd838df2457b5f327c2576ea762d39d79c6/packages/repl/src/lib/workers/compiler/index.ts#L99-L137)）。
Workspace 将这些位置转换成 CodeMirror diagnostics
（[`Workspace.svelte.ts#L138-L190`](https://github.com/sveltejs/svelte.dev/blob/14a2bbd838df2457b5f327c2576ea762d39d79c6/packages/repl/src/lib/Workspace.svelte.ts#L138-L190)）。
运行时 error 则利用 Rollup source map 尝试还原到源文件位置
（[`Viewer.svelte#L304-L315`](https://github.com/sveltejs/svelte.dev/blob/14a2bbd838df2457b5f327c2576ea762d39d79c6/packages/repl/src/lib/Output/Viewer.svelte#L304-L315)）。

## Koalablog 推荐实现

### 总体链路

```text
CodeMirror Edit Buffer
  -> 保存 Source File，服务端返回 sourceHash
  -> 浏览器懒加载 Svelte Build Worker
  -> Worker 以精确 svelteVersion 编译 + Rollup 打包
  -> 返回 IIFE JS、external CSS、warnings、临时 source map
  -> Editor Preview iframe 执行 IIFE
  -> iframe 返回初始正文 HTML Snapshot
  -> 浏览器提交 Render Artifact
  -> 服务端重新核对当前 sourceHash 后写入；不做任何编译
```

Source 保存和 Artifact 构建仍然分离：Source File 无论编译成功与否都能保存。Phase 3 把
`renderer + content` 的规范化 `sourceHash` 持久化在 Source File 行，并在同一次 Source Save 中原子更新；
因此旧 Artifact 在新 build 完成前就已经不是 Current Artifact。Artifact 上传接口只接受
`fileId + sourceHash + schemaVersion + svelteVersion + javascript + css + snapshotHtml`；服务端重读当前 File，
仅在 `renderer = svelte` 且 hash 相等时写入，否则返回 `409`。这防止慢编译覆盖更新后的 Source，但不把
服务端变成编译器。

### 1. 使用一个精简的 Build Worker

Koalablog 不需要完整复制 Playground 的两个 worker。推荐一个懒加载 module Worker 同时返回：

```ts
type BuildResult =
  | {
    ok: true
    requestId: number
    svelteVersion: string
    javascript: string
    css: string
    warnings: Diagnostic[]
    sourceMap?: string // 只用于当前 editor session，不进入 artifact v1
  }
  | {
    ok: false
    requestId: number
    error: Diagnostic
    warnings: Diagnostic[]
  }
```

沿用官方 `uid/current_id` 的陈旧结果抑制方式。Koalablog 用 `requestId` 丢弃过期 diagnose/build 结果；
可以用 `AbortController` 停止尚未完成的依赖 fetch，但除非实现并验证真正的 Worker/CPU 中断，否则不宣称
取消 compiler/Rollup 工作。Worker 只在打开 Renderer Mode 为 `svelte` 的 File、点击 Preview 或 Save 时
加载；Markdown editor 不承担 compiler/Rollup 下载成本。

`svelteVersion` 必须来自应用支持的精确版本常量，不能使用 `latest`。worker 可沿用官方
`load_svelte()` 下载精确 npm tarball的机制，并以 compiler 实际报告的 `VERSION` 写入 Artifact。
这满足“Artifact 编辑保存时升级”的既定规则。compiler 和依赖 tarball 至少在 worker 生命周期内缓存；
是否进一步使用 Cache Storage 属于性能优化，不影响协议。

### 2. 单文件 VFS，仍使用 Rollup

首版只暴露一个用户文件 `App.svelte`，外加内部 `__entry.js`：

```js
import { flushSync, mount, tick, unmount } from 'svelte'
import App from './App.svelte'

export { App, flushSync, mount, tick, unmount }
```

用户 Source 可以原样作为 `App.svelte`，不需要插入 Koalablog 专用指令。Rollup resolver 规则收紧到
既定产品边界：

- 允许内部 virtual modules。
- 允许精确版本的 `svelte` / `svelte/*` 及其 package 内部依赖。
- 允许完整 `https://` import，并由 worker fetch 后打进 bundle。
- 拒绝用户相对 import、alias 和其他裸 npm package。

HTTPS import 不是无限制网络入口。首版必须同时限制：最多 3 次且全程保持 HTTPS 的 redirect、允许的
JavaScript MIME、最多 8 层/64 个 URL module、单资源 512,000 UTF-8 bytes、总 fetched Source
4,000,000 UTF-8 bytes、单 fetch 10 秒和整次依赖解析/build 20 秒。opaque/CORS-blocked response、MIME
不匹配或任何限额超出都生成结构化诊断，不上传 Artifact，也不回滚已经成功的 Source Save。

即使是单文件也保留 Rollup，因为 `svelte.compile()` 的 JS 仍会 import Svelte runtime。采用官方的
`format: 'iife' + exports: 'named' + inlineDynamicImports` 后，Artifact JS 包含对应版本 runtime；公开页面
不需要 CDN import map，也不会因 Koalablog 以后升级自身 Svelte dependency 而改变历史 Artifact 行为。

### 3. 独立 CSS Artifact

和官方热重载实现不同，Koalablog 的 compile plugin 使用 `css: 'external'`，按稳定 module order 收集每个
component 的 CSS，最后合并成 Artifact 的 `css`。不要再把创建 `<style>` 的代码追加到 component JS，
否则 CSS 会同时存在于 JS 和 Artifact CSS 中。

Preview iframe 在执行 JS 前把 CSS 写入固定 `<style data-koala-artifact>`；公开 Astro Page Shell 则直接把
同一份 CSS 输出到 `<style>` 或独立缓存资源。这样 Snapshot 与 live component 使用完全相同的 CSS。

### 4. 在 iframe 内捕获 SEO Snapshot

官方 iframe 默认不带 `allow-same-origin`，父页面不能可靠地直接读取 `contentDocument`；但是现有 RPC
已经允许 iframe 返回 structured-clone 数据。因此增加一个 `render` 命令，不需要改变同源权限：

1. iframe 清理并 unmount 上一次实例。
2. 写入 compiled CSS。
3. 在这个 preview-only iframe 中执行 IIFE 并 `mount(App, { target: root })`。
4. 立即调用 `flushSync()`，确保 mount 排队的 effects/action 执行。官方文档明确指出 `mount` 自身不会
   运行这些 effects，需要 `flushSync()` 强制完成
   （[Imperative component API](https://svelte.dev/docs/svelte/imperative-component-api#mount)）。
5. `await tick()`，等待 pending state changes 应用；官方定义见
   [Lifecycle hooks / tick](https://svelte.dev/docs/svelte/lifecycle-hooks#tick)。
6. 再等待两个 `requestAnimationFrame`，作为图片/layout 和嵌套微任务的工程缓冲；它是 Koalablog 的
   Snapshot contract，不是 Svelte 官方保证。
7. 返回 `root.innerHTML`，同时保留 iframe 中的 live preview。

整个 render command 应设明确超时，例如 5 秒。Snapshot 定义为“保存时初始状态”，不等待任意
`onMount` 网络请求最终完成，也不承诺捕获持续动画。Svelte 5.36+ 可评估以 `settled()` 替代部分等待，
但当前 Koalablog lockfile 固定为 5.19.2，首版不能依赖该 API。

这个 Snapshot 是已挂载 client DOM 的序列化结果，不含 Svelte SSR hydration markers。因此公开页面不能
对它调用 `hydrate()`；它只用于 SEO 和静态降级。

Preview iframe 继续不授予 `allow-same-origin`，只开放实际需要的 sandbox 能力。它可以在明确的 preview
CSP 下允许内联 bootstrap 和执行 IIFE 所需的 `unsafe-eval`；这是 editor containment surface 的实现细节，
不延伸到公开页面。公开页面不得以 `eval` 或 `new Function` 执行 Artifact。

### 5. 公开页面执行 Artifact

Astro Page Shell 仍服务端输出：

- Document title/description。
- Artifact CSS。
- 可见的 `snapshotHtml`。
- 一个空的 live root。
- 指向当前 `sourceHash` Artifact ES module wrapper 的 module script。

Artifact endpoint 把已保存的 IIFE expression 作为普通 module code 嵌入一层 ES module wrapper，并导出
`mountKoalaArtifact(target)`。Page Shell 选择明确的正文 live root 并作为参数传入；成功时标记
`data-koala-render-state="mounted"`、发出 `koala:artifact-mounted` 并切换 Snapshot，失败时标记 `failed`、
发出 `koala:artifact-error` 并保留 Snapshot。wrapper 不通过全局 selector 猜 target，也不使用 runtime
`eval`/`new Function`。这里按已确认的信任模型直接挂载到普通 DOM，不使用 Shadow DOM；Preview iframe
只是为了避免构建过程破坏 editor UI，不承担发布页安全边界。

由于 Snapshot 不是 SSR hydration output，公开页采用“新 root mount 成功后切换”，而不是 hydrate。
每次 Page/Artifact 请求都必须重查当前 File 的访问权限、回收状态、Renderer Mode 和 `sourceHash`。公开
Artifact 使用 `Cache-Control: public, no-cache` 和由服务端计算的 Artifact payload hash 构成的强 `ETag`；只有完成上述检查后
才能返回 `304`。已授权的私密 Artifact 使用 `private, no-store`，未授权私密、回收站和已 purge File 返回
`404`。不使用 immutable cache，确保 public→private、trash、restore 和 purge 在下一次请求生效。

### 6. 错误和状态

- Compiler/Rollup error：转换为 `{ message, code, filename, start, end, loc }`，直接成为 CodeMirror 6
  diagnostics；Source 已保存，但不上传新 Artifact。
- Warnings：不阻止 Artifact 生成，在 editor 中展示。
- Preview runtime error：由 iframe 的 `window.onerror` / `unhandledrejection` 回传；当前 session 可以用
  Rollup source map 映射到 Source，source map 不必进入 Artifact v1。
- Artifact upload `409`：说明编译期间 Source 已变化，丢弃结果并重新构建。
- Artifact 超过任一字段或 1,800,000 UTF-8 bytes 合计预算：返回 `413 artifact_too_large`，Source 保持已保存。
- 没有匹配 `sourceHash` 的 Artifact：按既定规则显示“无法渲染”，不执行旧 Artifact，不展示源码。

## 不应照搬的部分

- 不复制完整 `@sveltejs/repl` UI、教程、多文件目录、npm 裸包、Tailwind、alias、console viewer 和迁移能力。
- 不使用 Playground 的 `latest` 版本语义；Artifact 必须记录 compiler 实际精确版本。
- 不使用官方为热更新而做的 CSS-in-JS 注入；Koalablog 已明确需要独立 CSS Artifact。
- 不假定 Playground 已经解决 SEO/SSR。官方当前只生成 client IIFE，server bundle 分支明确关闭。
- 不在公开访问时再次编译。公开页面只执行已保存、自包含的 Artifact。
- 不复制 Playground 的无限依赖图假设、preview `eval` 到公开页面，也不使用 immutable Artifact cache。
- 在 client Worker 和 preview iframe 通过 Phase-3 gate 前，保留现有 `/api/playground/compile`；只在 Phase 3
  末尾删除或迁移。

## 建议的 Artifact v1

```ts
interface SvelteRenderArtifactV1 {
  schemaVersion: 1
  renderer: 'svelte'
  svelteVersion: string // compiler 实际 VERSION；runtime 已打入 javascript
  sourceHash: string
  artifactHash: string // 服务端根据完整 payload 计算，用于 ETag
  javascript: string // Rollup IIFE，包含 Svelte runtime
  css: string // external CSS
  snapshotHtml: string // Preview iframe 返回的初始 DOM
}
```

这里不再需要单独的 runtime URL 或 import map。`svelteVersion` 仍然必须显式保存，因为它描述了生成
Artifact 的 compiler/runtime 版本，支持诊断、重建和未来 schema migration。

D1 的 [string/BLOB/row 上限](https://developers.cloudflare.com/d1/platform/limits/) 要求在写入前按 UTF-8
bytes 限制 Artifact：`javascript <= 1,400,000`、
`css <= 200,000`、`snapshotHtml <= 150,000`、序列化 metadata `<= 50,000`，并以完整 Artifact payload
`<= 1,800,000` 为最终门槛。组合门槛给 2,000,000 bytes 上限留出余量；超限只使 Artifact build 失败，
不能影响 Source Save。需要在 local SQLite 和 D1 上做接近上限的实际写入测试。
