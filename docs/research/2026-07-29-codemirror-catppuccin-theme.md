# CodeMirror 6 的官方 Catppuccin 主题调研

日期：2026-07-29

## 结论

可以做到与**已发布的官方 CodeMirror 6 Catppuccin 主题逐项一致**，但实现方式必须是直接安装并装配官方
扩展 `@catppuccin/codemirror@1.0.3`，而不是把它的颜色表手工翻译成一套本项目 CSS 变量。后者即使颜色相同，
也会漏掉主题包所拥有的 CodeMirror UI selector、透明度、`dark` facet 与 highlight tag 规则，不能称为 100%
一致。

官方当前 npm 最新发布版为 **1.0.3**（2026-02-21）；包名、仓库和发布版元数据均由包自身/registry 给出。
本次还直接解包核对了该版本的 `dist/index.js`。注意：上游 `main` 在 2026-04-10 已有一项未发布的 panel
border 修复（黑色 2px 改为 `overlay0` 1px），所以“100% 一样”必须明确比较对象：

- **建议锁定的对象：** npm 已发布的 `@catppuccin/codemirror@1.0.3`；安装它并使用其导出值即可字节语义一致。
- **不要声称：** 与 Git `main` 完全一致。该分支当前比 1.0.3 多出未发布改动。

来源：[npm registry metadata](https://registry.npmjs.org/@catppuccin/codemirror/1.0.3)、
[官方仓库 package manifest](https://github.com/catppuccin/codemirror/blob/v1.0.3/package.json)、
[已发布 1.0.3 compiled entry](https://unpkg.com/@catppuccin/codemirror@1.0.3/dist/index.js)、
[上游 main 的后续 border 改动](https://github.com/catppuccin/codemirror/commit/96a620d108e2de5dda4f3ada3d2b6488b92d73cb)。

## 官方 API 与四种风味

包导出四个已经组装好的 `Extension`：

```ts
import {
  catppuccinLatte,
  catppuccinFrappe,
  catppuccinMacchiato,
  catppuccinMocha,
} from '@catppuccin/codemirror'
```

每一个导出都是 `[EditorView.theme(..., { dark }), syntaxHighlighting(HighlightStyle.define(...))]`。
因此它同时覆盖编辑器 chrome 和 Lezer syntax tags；调用方不需要、也不应复制其 `HighlightStyle`。
官方 README 将这四个导出列为唯一使用方式；源码以 `flavors.latte`、`frappe`、`macchiato`、`mocha` 创建它们。
来源：[官方 README](https://github.com/catppuccin/codemirror/blob/v1.0.3/README.md#usage)、
[官方源代码](https://github.com/catppuccin/codemirror/blob/v1.0.3/src/catppuccin.ts#L7-L161)。

风味不是一个运行时字符串参数。要让现有 editor 跟随用户切换 Latte/Frappé/Macchiato/Mocha，应把 theme
放入独立 `Compartment`，在风味变化时 `reconfigure` 为相应的**官方导出 Extension**。它生成的是含具体色值的
CodeMirror style module，而非读取本项目 CSS custom property；只改 `--koala-catppuccin-*` 不会切换它。

## 已发布 1.0.3 的精确映射

官方包取色于 `@catppuccin/palette`，依赖范围为 `^1.7.1`。当前项目四个 palette 的 26 个命名颜色与
Catppuccin 标准值相同，故可继续用它们驱动页面其他区域；但编辑器本身应由上游 extension 驱动。
来源：[官方包依赖](https://unpkg.com/@catppuccin/codemirror@1.0.3/package.json)、
[本项目 palette 定义](../../src/styles/theme.ts)。

| 范畴 | 官方 1.0.3 规则 |
| --- | --- |
| 根/内容 | foreground `text`、background/gutter `base`；caret 与 cursor `rosewater`；gutter text `subtext0`。 |
| selection/active | selection `overlay2` + `40` alpha；active line/gutter `surface0`；match `surface2` + `4d` alpha；match bracket `surface2` + `47` alpha。 |
| panels/search/tooltip | panel `mantle`；search `blue` + `59`/`2f` alpha；tooltip `surface0`；autocomplete selected `surface1`。1.0.3 的 panel border 是 `2px solid black`。 |
| Markdown emphasis | strong bold、emphasis italic、strikethrough line-through；heading/link 都是 `blue`（link additionally underline）。 |
| token colors | keyword `mauve`；普通 name/definition/deleted/character/macro `text`；function/property/label `blue`；constant/color/standard/bool/number `peach`；self/atom/invalid `red`；type/class/changed/annotation/namespace `yellow`；operator `sky`；URL `teal`；escape/regexp `pink`；comment/meta/punctuation/separator `overlay2`；special variable `lavender`；string/processing-instruction/inserted `green`。 |

这些规则来自已发布 entry 的 `EditorView.theme` 与 `HighlightStyle.define`，而非截图或二手主题文章：
[chrome 规则](https://unpkg.com/@catppuccin/codemirror@1.0.3/dist/index.js)、
[highlight 规则](https://unpkg.com/@catppuccin/codemirror@1.0.3/dist/index.js)。

## 对 Koalablog 的接入影响

当前 `textEditorExtensions()` 统一加入 `syntaxHighlighting(defaultHighlightStyle, { fallback: true })`，而
Markdown 和 Svelte language extension 分开加载。官方 extension 与 language extension 可共存；官方
`syntaxHighlighting(...)` 是非 fallback 的实际样式，现有 default 仅在官方未定义 tag 时兜底。若需求严格
要求“所有 syntax token 仅用官方规则”，可在接入时移除该 default fallback；这会使官方未覆盖的 tag 保持
未着色，而不是退回 CodeMirror 默认色。来源：[本项目 CodeMirror extensions](../../src/components/editor/text-editor/markdown-language.ts)、
[官方 highlight extension](https://unpkg.com/@catppuccin/codemirror@1.0.3/dist/index.js)。

因此推荐的实施口径是：

1. 新增并锁定 `@catppuccin/codemirror@1.0.3`，不手写复刻 `HighlightStyle`。
2. 以 `Compartment` 仅装载上述四个官方 extension 之一；保持 Markdown/Svelte grammar 的现有动态加载职责不变。
3. 将当前应用已生效的 light/dark flavor 传到 editor 的 reconfigure 流程；CSS variables 仍服务 dashboard，
   CodeMirror 主题则改用同一 flavor 的上游 Extension。
4. 清理或精确限定任何现有 `.cm-*` 覆盖，避免 CSS specificity 覆盖官方 style module；以四种 flavor、
   Markdown 与 Svelte 各一例作视觉/DOM 回归。只有满足这点，才能把“100% 一致”限定为官方 1.0.3 extension
   的 UI 与其已定义 highlight tags。

## 维护状态与边界

这是 Catppuccin 组织发布的 MIT 包，README 仍标注“Current Maintainer(s): this repository currently has no
maintainers”。它不是 CodeMirror 官方主题，也没有自动按风味字符串热切换的 API；项目负责 selection 与
`Compartment` 重配。最新发布 1.0.3 近期修过 selection 和 placeholder，故不要 vendoring 代码，直接依赖
发布包可在未来升级时明确 review diff。来源：[官方 README 的维护声明](https://github.com/catppuccin/codemirror/blob/v1.0.3/README.md#thanks)、
[官方 changelog](https://github.com/catppuccin/codemirror/blob/v1.0.3/CHANGELOG.md)。
