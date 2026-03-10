# GEMINI.md

此文件为 Gemini（及其他智能体）在处理本仓库代码时提供指导。

## 架构概览

### 技术栈

- **框架**: Astro 5 配合 Svelte 5 组件
- **数据库**: 双模式 (Cloudflare D1 或 SQLite)，使用 Drizzle ORM
- **样式**: UnoCSS + Sass，支持 Catppuccin 主题
- **部署**: Cloudflare Pages 或独立部署

### 项目结构

#### 核心目录

- `src/actions/` - Astro actions (API 端点)，按领域组织 (db, form, oss)
- `src/components/` - Svelte 5 组件，使用响应式状态 (`$state`, `$props`)
- `src/db/` - 数据库 schema、模型和操作 (基于 Drizzle)
- `src/lib/` - 按领域组织的可复用工具
- `src/pages/` - Astro 页面和 API 路由
- `src/styles/` - 包含 Catppuccin 支持的主题系统

#### 关键子系统

**Markdown 处理** (`src/lib/markdown/`)

- 自定义 markdown-it 插件，支持 meta frontmatter
- `meta-plugin.ts` - 解析 `key: value` frontmatter
- `markdown-parser.ts` - 统一的内容、链接、标签解析工具
- `double-link-plugin.ts` - 处理双向链接的 `[[link]]` 语法

**数据库层** (`src/db/`)

- 通过环境配置支持多后端 (D1/SQLite)
- `schema.ts` - Drizzle schema 定义
- `markdown.ts` - 核心内容操作及链接解析。包含支持分页的 `readAll`。
- 用于导入/导出功能的批量操作
- **Memos 支持**: 对 `MarkdownSource.Memo` (30) 的专门支持，包含自动生成的主题 (`YYYYMMDDHHmm`)。

**认证** (`src/lib/auth/`)

- 基于 JWT 的认证系统
- 在 `src/middleware.ts` 集成中间件

**主题** (`src/styles/`)

- `catppuccin.scss` - 主要主题实现
- `_theme-utils.scss` - 可复用的主题 mixin 和函数
- 用于动态主题的 CSS 自定义属性

**编辑器系统** (`src/components/editor/`)

- **统一编辑器**: `Page.svelte` 结合了 `Sidebar.svelte` (文件列表) 和 `index.svelte` (编辑器)。
- **侧边栏**: 列出文件，支持分页 ("加载更多") 和按来源筛选。
- **路由**: `/dashboard/edit` 统一处理所有类型 (Post, Page, Memo) 的创建和编辑。
  - 参数: `id` (现有 ID 或 'new'), `source` (枚举值), `link` (可选查找)。

**导入/导出系统**

- **文件选择器导入**: 浏览器原生文件选择，带 Markdown 解析
- **批量处理**: 带进度状态（加载/解析/保存）的多文件导入
- **Frontmatter 处理**: 提取元字段 (`createdAt`, `updatedAt`, `link`) 并从内容中剥离
- **链接解析**: 导入期间针对现有文章解析 `[[links]]`
- **错误显示**: 直接向用户显示导入/保存错误
- **ZIP 导出**: 保留元数据的批量导出

## 开发指南

### API 设计原则

- **客户端接口**: 为客户端提供接口时使用 Astro Actions 而非 API 端点
- **服务端数据访问**: 在服务端直接使用 `src/db` 函数，不要调用 actions
- **Source Keys**: 使用 `@src/db/index.ts` 中的 `getMarkdownSourceKey(source)` 将 `MarkdownSource` 枚举转换为 'posts'/'pages'/'memos' 字符串。不要硬编码这些字符串。

### 组件架构

- Svelte 5 及其现代响应式特性 (`$state`, `$derived`, `$effect`)
- 全程使用 TypeScript 且类型严格
- 组件作用域的 SCSS 配合主题工具

### 代码质量标准

#### 通用原则

- 编写代码前，考虑是否有更简单、清晰的实现方式
- 实现复杂逻辑前，检查项目中是否存在类似实现并考虑复用
- 如果组件超过 400 行或函数超过 100 行，进行拆分

#### TypeScript 模式

- 使用带有 `as const` 的 `const` 对象代替枚举以获得更好的兼容性
- 使用 `typeof Object[keyof typeof Object]` 获取类型联合以保证类型安全
- **Astro Actions**: 不要使用 `await-to-js` 或 try-catch 块 - actions 会自动返回 `{error, data}` 对象，其中 `error` 包含抛出的异常，`data` 包含成功结果

#### 样式指南

**UnoCSS 用于布局和工具类**

- 使用 UnoCSS 类进行布局、间距、响应式设计和工具样式
- 组件样式首选 utility-first 方法

**新组件使用 Tailwind CSS**

- **所有新样式必须使用 Tailwind CSS 类**，而不是自定义 CSS 或 SCSS
- **颜色必须使用 CSS 自定义属性**，源自 `@src/styles/_theme-utils.scss` 主题系统
- 示例: `style="color: var(--koala-text); background-color: var(--koala-surface-0)"`
- 当有 Tailwind 工具类可用时，避免编写新的 SCSS mixin 或自定义样式

**Markdown 渲染使用纯 CSS**

- 在 `global.css` 中使用纯 CSS 进行 Markdown 内容渲染
- 避免对需要移植的内容使用特定于框架的样式

**Sass 配合 CSS 变量**

- 仅当 CSS 变量和 mixin 能提供明显优势时使用 Sass
- 所有颜色必须使用遵循 Catppuccin 主题系统的 CSS 自定义属性
- 主题工具应在组件间可复用

#### 图标使用

**Lucide Icons (必须)**

- **Svelte 组件**: 必须使用 `@lucide/svelte` 包 - **不要**使用 `lucide-svelte`
- **Astro 组件**: 使用 `@lucide/astro` 包进行服务端渲染
- **尺寸一致**: 使用 `size={20}` 作为 UI 图标的标准尺寸
- **语义化选择**: 选择能清晰表达其功能的图标

**导入模式**

```typescript
// ✅ 正确 - Svelte 组件
import { Save, Upload, Eye, Edit, Trash2 } from '@lucide/svelte';

// ❌ 错误 - 不要使用
import { Save } from 'lucide-svelte';

// ✅ 正确 - Astro 组件
import { Save } from '@lucide/astro';
```

**使用示例**

```svelte
<!-- Svelte 组件 -->
<button class="icon" onclick={save}>
  <Save size={20} />
</button>

<!-- 带条件逻辑 -->
<button class="icon" onclick={togglePreview}>
  {#if showPreview}
    <Edit size={20} />
  {:else}
    <Eye size={20} />
  {/if}
</button>
```

**样式指南**

- 使用 `class="icon"` 保持按钮样式一致
- 图标继承父元素颜色 - 使用主题颜色保持一致性
- 确保无障碍性的对比度足够
- 为仅包含图标的按钮添加 `aria-label` 属性

#### 无障碍标准

**语义化 HTML**

- 使用正确的语义元素：`<button>` 用于操作，`<nav>` 用于导航，`<main>` 用于主要内容
- 避免滥用 `<div>` 和 `<span>` - 优先使用语义化替代方案

**ARIA 属性**

- 为交互元素添加适当的 `aria-label`, `aria-describedby`, `role` 属性
- 模态框使用 `aria-modal="true"`，对话框使用 `role="dialog"`
- 实现正确的焦点管理和键盘导航

### 数据库操作

- 所有 DB 操作通过 Drizzle ORM 进行
- 面向客户端的服务端操作使用 Astro actions
- 服务端数据访问直接调用 `src/db` 函数
- 为了性能使用批量操作 (导入/导出)

### Astro Actions 最佳实践

- **返回格式**: Actions 自动返回 `{error, data}` 对象
- **错误处理**: 检查 `result.error` 获取异常，`result.data` 获取成功数据
- **无需包装**: 不要在 action 调用周围使用 `await-to-js` 或 try-catch
- **Schema 预处理**: 使用 `z.preprocess()` 进行类型转换 (例如，字符串日期转 Date 对象)
- **示例**: `const result = await actions.db.markdown.all(); if (result.error) { ... } else { use result.data }`

### Markdown 生态

- **YAML Frontmatter**: 标准的 `---` 分隔块用于元数据
- **元数据提取**: 解析 frontmatter 获取 `createdAt`, `updatedAt`, `link`, `tags` 等
- **内容剥离**: 使用 `stripMetaBlock()` 从保存的内容中移除 frontmatter
- **双向链接**: 用于互连笔记的 `[[link]]` 语法
- **标签提取**: 从内容 (#tag) 和 frontmatter 中提取
- **统一解析**: `parseMarkdownContent()` 和 `batchParseMarkdown()` 工具

## 环境配置

必需的 `.env` 变量:

- `DATA_SOURCE`: 'sqlite' | 'd1'
- `DEPLOY_MODE`: 'cloudflare' | 'standalone'
- Cloudflare 专属: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_DATABASE_ID`, `CLOUDFLARE_D1_TOKEN`
- SQLite 专属: `SQLITE_URL`

## 关键命令

### 开发

- **Cloudflare Pages 模式**: `pnpm run dev:d1` (需要 CF D1 设置)
- **独立模式**: `pnpm run dev:sqlite` (本地 SQLite)
- **标准开发**: `pnpm run dev`

### 数据库操作

- **初始化 D1**: `pnpm run d1:init`
- **初始化 SQLite**: `pnpm run sqlite:init`
- **清理 DB**: `pnpm run db:clean`
- **生成迁移**: `pnpm run migration:generate`
- **应用 D1 迁移**: `pnpm run migration:d1:local` (本地) 或 `pnpm run migration:d1:remote` (远程)

### 构建与部署

- **构建 Cloudflare 版本**: `pnpm run build:cf`
- **预览 Cloudflare**: `pnpm run preview` 或 `pnpm run preview:pages`
- **标准构建**: `pnpm run build`

### 代码质量

- **Lint**: `pnpm run lint` 或 `pnpm run lint:fix`
- **测试**: `pnpm test` (使用 Vitest)
- **单个测试**: `pnpm test <filename>`

## 测试

- 单元测试使用 Vitest
- 工具类的组件测试
- 使用模拟环境的数据库操作测试