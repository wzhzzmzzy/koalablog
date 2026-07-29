# Svelte 保存时格式化：纯客户端开源方案调研

日期：2026-07-28

## 结论

推荐 **Prettier 3.9.6 + `prettier-plugin-svelte` 4.1.1 的 browser entry**。它是可在浏览器
运行的开源方案，且与本项目锁定的 Svelte 5.33.0 兼容：插件 4.1.1 的 peer dependency 是
Prettier 3 与 Svelte 5，采用 MIT 许可证，并明确提供 `prettier-plugin-svelte/browser`
export。来源：[插件 package metadata](https://registry.npmjs.org/prettier-plugin-svelte/4.1.1)、
[插件许可证](https://github.com/sveltejs/prettier-plugin-svelte/blob/main/LICENSE)。

不要把它放进 dashboard 初始 bundle，也不要接入 CodeMirror transaction。首次保存 Svelte File
时才动态导入，最好在独立 module Worker 中格式化；保存流程 await 格式化成功后，将返回的 Source
作为同一次保存的 `content`。这符合 Prettier standalone 的浏览器/Worker 支持与 async API；它不
加载配置文件或自动加载 parser plugin，所以产品必须显式固定选项及 plugin 列表。来源：
[Prettier Browser 文档](https://prettier.io/docs/browser)。

## 已验证的精确依赖组合

`prettier-plugin-svelte@4.1.1` 的 browser build 不是 Node fallback：其入口直接依赖
`prettier/standalone`、`prettier/plugins/babel` 与 `svelte/compiler`；插件 README 说明 browser
entry 不使用 Node API，但需要 bundler 先将它们打成自包含包。来源：
[browser entry source](https://unpkg.com/prettier-plugin-svelte@4.1.1/browser.js)、
[plugin README](https://unpkg.com/prettier-plugin-svelte@4.1.1/README.md)。

保存时应懒加载并传入下列模块：

```ts
const [prettier, svelte, babel, estree, typescript, postcss] = await Promise.all([
  import('prettier/standalone'),
  import('prettier-plugin-svelte/browser'),
  import('prettier/plugins/babel'),
  import('prettier/plugins/estree'),
  import('prettier/plugins/typescript'),
  import('prettier/plugins/postcss'),
])

const formatted = await prettier.format(source, {
  parser: 'svelte',
  plugins: [svelte, babel, estree, typescript, postcss],
  // Product-owned, versioned choices; e.g. tabWidth: 2, singleQuote: true.
})
```

`svelte` 是该插件导出的 parser；其 embedded formatter 对 `<script lang="ts">` 选择
`typescript`、普通 script 选择 `babel-ts`，并对 `<style>` 选择 `css` / `scss` / `less`。因此不能
只传 Svelte plugin，也不能只传 `html` plugin。`babel`、`estree`、`typescript` 与 `postcss` 这组
覆盖当前单文件 Svelte 的 JS/TS/CSS 路径。来源：[browser entry 的 parser/embedded-code source](https://unpkg.com/prettier-plugin-svelte@4.1.1/browser.js)、
[Prettier Browser 文档的显式 plugins 要求](https://prettier.io/docs/browser)。

在隔离临时目录中，以该组合格式化了含 Svelte block、`lang="ts"` script 与 CSS style 的样例；三种
内容都成功被规范化。此为本次本地 smoke test，不替代上述一手包源码依据。

## 成本与本项目接入边界

这不是“小到可以常驻”的能力。当前版本、未计 bundler 公共 chunk 去重时，gzip 测量约为：standalone
27.2 KB、Svelte plugin 23.5 KB、babel 82.2 KB、estree 61.4 KB、typescript 213.0 KB、postcss
46.2 KB、`svelte/compiler` 202.0 KB。故应只为 Svelte renderer 的第一次 Save 载入；后续在同一
session/Worker 缓存模块与格式化配置。包的原始解包体积也印证它不是微型依赖：Prettier 3.9.6 为
9,954,439 bytes，Svelte plugin 4.1.1 为 444,099 bytes。来源：[Prettier metadata](https://registry.npmjs.org/prettier/3.9.6)、
[Svelte plugin metadata](https://registry.npmjs.org/prettier-plugin-svelte/4.1.1)。

Koalablog 当前已经保存 `renderer` 和 Source，并在 Svelte Source 保存成功后才触发 build；因此
formatter 的位置应是外层 Save 编排：

```text
Cmd/Ctrl+S -> 若 renderer=svelte 则 await format -> 成功：以 formatted Source 发起一次 save
                                          -> 失败：提示格式化已跳过，仍以原 Source 发起 save
             Markdown -> 现有 save
```

不可在服务器格式化、不可在保存成功后异步替换 Source，也不应把 formatter API 加入 `TextEditor` /
CodeMirror 的深接口。现有设计已规定 File editor 拥有唯一 Save shortcut，TextEditor 不注册 Save
keymap；当前实现的 `save` 在成功后才调度 Svelte build。格式化错误通常意味着用户仍在编辑不完整的
Svelte Source；不能因此阻止 Source 持久化，否则会破坏“Source 可保存、Artifact 另行失败”的边界。来源：
[CodeMirror 设计](../design/2026-07-16-codemirror-editor-integration.md)、
[当前 Save 实现](../../src/components/editor/index.svelte)。

## 其他候选

| 方案 | 浏览器纯客户端可行性 | Svelte/TS/CSS 完整性 | 结论 |
| --- | --- | --- | --- |
| Prettier standalone + Svelte browser plugin | 是；官方 Prettier standalone 无 Node 依赖且支持 Worker，Svelte plugin 有 browser entry。来源：[Prettier](https://prettier.io/docs/browser)、[plugin README](https://unpkg.com/prettier-plugin-svelte@4.1.1/README.md) | 单一组合覆盖 Svelte grammar，插件再委托 JS/TS/CSS parser。来源：[browser source](https://unpkg.com/prettier-plugin-svelte@4.1.1/browser.js) | **采用** |
| dprint JS formatter + `markup_fmt` WASM | 技术上可行：dprint host 直接使用 `WebAssembly`，有 `addPluginStreaming`。来源：[dprint JS formatter source](https://unpkg.com/@dprint/formatter@0.5.1/esm/mod.js) | `markup_fmt` 只格式 Svelte markup；script/style 还必须同时带 TypeScript 与 Malva plugins。来源：[markup_fmt README](https://github.com/g-plane/markup_fmt#dprint) | MIT，但至少三套 WASM plugin 与配置协调，不是这次最轻量的集成 |
| Oxfmt | 当前官方 npm 包是 Node 20+ 的 N-API 多平台绑定，不是浏览器/WASM 发布物。来源：[oxfmt metadata](https://registry.npmjs.org/oxfmt/latest) | 它现在能格式 Svelte，但该路径是 bundled Prettier，且 `.svelte` 还要求 Svelte package 与选项开启。来源：[Oxfmt language support](https://oxc.rs/docs/guide/usage/formatter/language-support) | 不适合纯客户端保存时格式化 |

## 建议的后续实现口径

1. 新增运行时依赖并锁定精确版本：`prettier@3.9.6`、`prettier-plugin-svelte@4.1.1`；两者和 Svelte
   5.33.0 的 peer range 相容。来源：[plugin metadata](https://registry.npmjs.org/prettier-plugin-svelte/4.1.1)。
2. 建一个私有 lazy formatter module（或与既有 Svelte Build Worker 并列的 formatter Worker）；只导出
   `formatSvelte(source): Promise<string>`，不泄漏 Prettier/CodeMirror 类型。
3. 先为格式成功、格式错误仍保存原文并提示、TS/CSS embedded code、以及 save 后 build 使用**格式后的**
   Source 写回归测试；再接入 Save。
