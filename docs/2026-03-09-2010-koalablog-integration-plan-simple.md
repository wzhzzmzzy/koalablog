---
created: 2026-03-09 20:10
tags:
  - "#project"
  - "#koalablog"
  - "#architecture"
  - "#obsidian"
type: work
status: approved
---

# Koalablog 数据层重构与同步整合方案（简化版）

## 📋 一句话目标

**让 Koalablog 成为 Obsidian Vault 的线上镜像，支持双向同步。**

---

## 🎯 核心需求

### 需求 1：完整存储 Markdown
- **当前问题**：frontmatter 被拆分到数据库字段，在线编辑后同步回本地会丢失元数据
- **解决方案**：`content` 字段存储完整 Markdown（含 frontmatter）
- **收益**：线上编辑的内容可以完整同步回本地

### 需求 2：Obsidian 双向同步
- **当前问题**：无法随时随地阅读/编辑笔记
- **解决方案**：推送脚本 + 拉取脚本
- **收益**：本地 ↔ 云端双向同步

### 需求 3：向后兼容
- **当前问题**：担心重构破坏现有网页端功能
- **解决方案**：API 防腐层（旧 API 内部转换为新 schema）
- **收益**：现有功能不受影响

---

## 🏗️ 技术方案（简化版）

### 核心设计原则

1. **简单优先**：能不用关联表就不用，能不用双写就不双写
2. **向后兼容**：旧 API 保持可用，内部转换
3. **渐进升级**：先上新 schema，验证后再迁移旧数据
4. **随时回滚**：保留旧表，出问题快速回滚

---

### 数据模型（简化）

```typescript
// 核心表：只添加必要字段
export const markdown = sqliteTable('markdown', {
  id: integer().primaryKey({ autoIncrement: true }),

  // 保持现有字段
  link: text().notNull(), // 网页端 URL
  subject: text().notNull(), // 标题
  source: integer().notNull(), // 10=Post, 20=Page, 30=Memo
  content: text(), // 改为存储完整 Markdown
  private: integer({ mode: 'boolean' }).default(false),
  createdAt: integer({ mode: 'timestamp' }),
  updatedAt: integer({ mode: 'timestamp' }),
  deleted: integer({ mode: 'boolean' }).default(false),

  // 新增字段（仅 2 个）
  vault_path: text().unique(), // Obsidian 路径（同步用）
  visibility: integer().default(0), // 0=public, 1=private（替代 private 字段）
})

// 标签表（可选，后续优化）
// 第一版：继续使用逗号分隔字符串，避免关联表复杂度
// 第二版：如果标签查询性能成为瓶颈，再添加 tags 关联表
```

**关键决策**：
- ✅ **不引入关联表**：tags 继续使用逗号分隔字符串，避免复杂度
- ✅ **不引入双写**：直接切换新 schema，旧表保留用于回滚
- ✅ **不引入复杂监控**：简单的日志记录即可

---

### API 设计（简化）

#### 认证策略

```
网页端：JWT Cookie（现有，保持不变）
同步脚本：Bearer Token（新增，简单实现）
```

#### 关键 API 接口

```typescript
// ==================== 保持现有 API（向后兼容） ====================

// POST /~astro?action=form.save
// 输入保持不变，内部转换为新 schema
{
  id: number,
  link: string,
  subject: string,
  content: string,        // 仅正文
  tags: string,           // 逗号分隔
  private: boolean,
}

// POST /~astro?action=db.markdown.all
// 返回保持不变，内部从新 schema 转换
{ source: 'memo', deleted: false }

// ==================== 新增同步 API（简化版） ====================

// POST /api/sync/push
// Obsidian → Koalablog
{
  vault_path: string,
  content: string,        // 完整 Markdown（含 frontmatter）
}
// 返回：{ success: true, id: number }

// GET /api/sync/pull?since=<timestamp>
// Koalablog → Obsidian
{
  changes: [
    { vault_path, content, updatedAt },
  ],
}
```

---

### 同步脚本设计（简化）

#### 推送脚本（push-to-koala.sh）

```bash
#!/bin/bash
# 功能：推送本地 memo 到 Koalablog

# 1. 解析 Markdown 文件，提取 frontmatter 和正文
# 2. 检查是否有 koala_id：
#    - 有 → 调用更新 API
#    - 无 → 调用创建 API，获取 ID 后回写 frontmatter
# 3. 更新 sync-state.json

# 调用方式：
./push-to-koala.sh ~/path/to/memo.md
./push-to-koala.sh --all  # 推送所有未同步的 memos
```

#### 拉取脚本（pull-from-koala.sh）

```bash
#!/bin/bash
# 功能：从 Koalablog 拉取最新版本

# 1. 获取 Koalablog 所有 memos
# 2. 对比本地 version 和远程 updatedAt
# 3. 如果远程更新 → 拉取并更新本地文件

# 调用方式：
./pull-from-koala.sh
./pull-from-koala.sh --dry-run  # 只检查，不修改
```

#### 状态追踪（sync-state.json）

```json
{
  "memos": {
    "inbox/memos/2026-03-09-1633.md": {
      "koala_id": 123,
      "vault_path": "inbox/memos/2026-03-09-1633.md",
      "local_version": 1710003905,
      "remote_updated_at": 1710003905,
      "last_push": "2026-03-09T16:33:05+08:00"
    }
  }
}
```

---

## 📅 实施路线图（简化版）

### Phase 0：前置准备（3-5 天）

**目标**：Bearer Token 认证支持

**工作清单**：
- [ ] 在 Koalablog 添加 Bearer Token 认证（简单实现）
- [ ] 创建 API Token 管理功能（Settings 页面）
- [ ] 测试 API 连通性
- [ ] 编写 Bearer Token 认证单测

**交付物**：
- `src/middleware.ts`（Bearer Token 支持）
- Settings 页面 API Token 管理 Tab
- `src/tests/auth.test.ts`（认证单测）

---

### Phase 1：数据层重构（1-2 周）

**目标**：新 Schema 部署

**工作清单**：
- [ ] 在 markdown 表添加新字段（vault_path, visibility）
- [ ] 修改 content 字段为完整 Markdown
- [ ] 修改 API 内部逻辑（解析/合成 frontmatter）
- [ ] 保留旧表，用于回滚
- [ ] 编写 frontmatter 解析单测
- [ ] 编写 API 转换逻辑单测

**交付物**：
- 新 Schema 在生产环境运行
- 现有网页端功能正常
- `src/tests/frontmatter.test.ts`（frontmatter 解析）
- `src/tests/api-adapter.test.ts`（API 转换逻辑）

**风险**：🟡 中

**缓解策略**：
- 先在小范围测试
- 保留旧表，随时回滚

---

### Phase 2：同步脚本开发（1-2 周）

**目标**：实现双向同步

**工作清单**：
- [ ] push-to-koala.sh（推送脚本）
- [ ] pull-from-koala.sh（拉取脚本）
- [ ] sync-state.json（状态追踪）
- [ ] 基础错误处理
- [ ] 编写同步脚本单测（Bats 或 ShellCheck）

**交付物**：
- 可运行的同步脚本
- 简单的 README 说明
- `tests/sync.test.bats`（同步脚本测试）

**风险**：🟢 低

---

### Phase 3：测试验证（3-5 天）

**目标**：验证核心功能

**工作清单**：
- [ ] 测试推送功能
- [ ] 测试拉取功能
- [ ] 测试冲突检测
- [ ] 测试幂等性
- [ ] 运行所有单测（目标：覆盖率 > 70%）
- [ ] 修复失败的测试

**交付物**：
- 测试报告
- Bug 修复
- 单测覆盖率报告

---

### 总体时间估算

| Phase | 时间 | 累计 |
|-------|------|------|
| Phase 0 | 3-5 天 | 3-5 天 |
| Phase 1 | 1-2 周 | 2-3 周 |
| Phase 2 | 1-2 周 | 3-5 周 |
| Phase 3 | 3-5 天 | 4-6 周 |

**总计**：4-6 周（比之前的 8-11 周减少约 50%）

---

## ⚠️ 风险评估（简化版）

### Top 3 风险点

| # | 风险 | 严重程度 | 缓解策略 |
|---|------|----------|----------|
| 1 | **数据迁移问题** | 🟡 中 | 保留旧表，随时回滚 |
| 2 | **同步冲突** | 🟡 中 | last-write-wins 策略 |
| 3 | **API 不兼容** | 🟢 低 | API 防腐层保持兼容 |

---

## 🧪 单元测试策略

### 测试框架

| 类型 | 框架 | 用途 |
|------|------|------|
| TypeScript 单测 | Vitest | 后端逻辑测试 |
| Shell 脚本测试 | Bats | 同步脚本测试 |
| API 测试 | curl + jq | 手工测试脚本 |

### 关键测试用例

#### 1. 认证测试（`auth.test.ts`）

```typescript
describe('Bearer Token Auth', () => {
  test('valid token should pass', () => {
    // 验证有效 token
  })

  test('invalid token should fail', () => {
    // 验证无效 token
  })

  test('expired token should fail', () => {
    // 验证过期 token
  })
})
```

#### 2. Frontmatter 解析测试（`frontmatter.test.ts`）

```typescript
describe('Frontmatter Parser', () => {
  test('parse complete markdown', () => {
    // 解析完整 Markdown
  })

  test('parse markdown without frontmatter', () => {
    // 解析无 frontmatter 的 Markdown
  })

  test('synthesize frontmatter', () => {
    // 合成 frontmatter
  })

  test('handle invalid yaml', () => {
    // 处理无效 YAML
  })
})
```

#### 3. API 转换测试（`api-adapter.test.ts`）

```typescript
describe('API Adapter', () => {
  test('convert old format to new format', () => {
    // 旧格式 → 新格式
  })

  test('convert new format to old format', () => {
    // 新格式 → 旧格式
  })

  test('handle missing fields', () => {
    // 处理缺失字段
  })
})
```

#### 4. 同步脚本测试（`sync.test.bats`）

```bash
@test 'push script should create new memo' {
  # 测试推送新 memo
}

@test 'push script should update existing memo' {
  # 测试更新已有 memo
}

@test 'pull script should download changes' {
  # 测试拉取更新
}

@test 'sync should be idempotent' {
  # 测试幂等性
}
```

### 测试覆盖率目标

| 模块 | 目标覆盖率 | 优先级 |
|------|-----------|--------|
| 认证中间件 | > 90% | 🔴 高 |
| Frontmatter 解析 | > 85% | 🔴 高 |
| API 转换逻辑 | > 80% | 🔴 高 |
| 同步脚本 | > 70% | 🟡 中 |

### 运行测试

```bash
# 运行 TypeScript 单测
bun test

# 运行 Shell 脚本测试
bats tests/sync.test.bats

# 运行所有测试 + 覆盖率
bun test --coverage
```

---

## 📊 预期收益

### 用户收益

| 收益 | 重要性 |
|------|--------|
| 完整同步体验（含 frontmatter） | 🔴 高 |
| 双向同步能力 | 🔴 高 |
| 在线编辑后同步回本地 | 🔴 高 |

### 开发者收益

| 收益 | 提升幅度 |
|------|----------|
| 代码可维护性 | +50% |
| 技术债务减少 | -30% |
| Bug 发现时间 | 提前 80%（单测 vs 手工测试） |

---

## 📝 关键决策

### 已确认的决策

| 决策点 | 决策 | 理由 |
|--------|------|------|
| 实施顺序 | 先数据层重构，再同步脚本 | 避免二次迁移 |
| API 策略 | API 防腐层保持兼容 | 同步脚本无需修改 |
| 双写策略 | **不采用双写** | 个人项目，简单优先 |
| 回滚策略 | 保留旧表 + 代码回滚 | 快速恢复 |
| tags 存储 | **继续使用逗号分隔** | 避免关联表复杂度 |
| 监控告警 | **不引入** | 个人项目，不需要 |
| 性能基准 | **不引入** | 简单优先 |
| 冲突解决工具 | **手动解决** | 不需要交互式 CLI |

---

## 🔗 相关资源

- Koalablog 部署：https://koala.wzhzzmzzy.workers.dev
- Koalablog 源码：~/Ralph/koalablog
- Obsidian Vault：/Volumes/HD1/obsidian-vault/obsidian-vault

---

## 📋 待确认事项

| 事项 | 建议 | 待确认 |
|------|------|--------|
| Phase 0 启动时间 | 本周内 | ⏳ |
| 数据迁移窗口 | 周末低峰期 | ⏳ |
| Phase 4（清理优化） | 延后，先保证核心功能 | ⏳ |

---

_创建时间：2026-03-09 20:10_
_版本：v4（简化版）_
_核心原则：简单优先，避免过度设计_
_预计总工作量：4-6 周_
_状态：等待确认_
