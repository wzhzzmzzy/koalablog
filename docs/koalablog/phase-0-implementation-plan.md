# Phase 0: Bearer Token 认证支持 - 详细技术方案

## 1. 目标
实现一个简单、安全的 Bearer Token 认证系统，用于同步脚本与 Koalablog API 的通信。Token 存储在全局配置中，且仅支持单 Token 模式（简单优先）。

## 2. 核心变更点

### 2.1 认证逻辑 (已部分实现)
- **文件**: `src/lib/auth/index.ts`
- **逻辑**: `authInterceptor` 已支持解析 `Authorization: Bearer <token>`。
- **改进**: 确保 Bearer Token 验证失败时不会干扰现有的 Cookie 认证。

### 2.2 全局配置修复 (关键 Bug Fix)
- **文件**: `src/lib/kv/index.ts`
- **问题**: 在非 Cloudflare 环境下，`updateGlobalConfig` 函数错误地将整个配置对象替换为了补丁包内容。
- **修复**: 确保在调用 `storage.set` 时传入合并后的 `updatedConfig`。

### 2.3 验证端点 (新功能)
- **路径**: `/api/auth/verify`
- **文件**: `src/pages/api/auth/verify.ts`
- **功能**:
  - 仅支持 `GET` 请求。
  - 经过中间件认证。
  - 如果 `ctx.locals.session.role === 'admin'`，返回 `200 OK` 及用户信息/权限。
  - 否则返回 `401 Unauthorized`。
  - 用途：同步脚本在执行推送/拉取前验证 Token 是否有效。

### 2.4 Token 管理功能增强
- **后端 Actions (`src/actions/db/token.ts`)**:
  - `generateBearerToken`: (保持现有逻辑) 生成 UUID。
  - `revokeBearerToken`: (新增) 将 `auth.bearerToken` 置为空。
- **前端组件 (`src/components/settings/token-manager.svelte`)**:
  - 新增“撤销 (Revoke)”按钮，并增加二次确认弹窗。
  - 优化 Token 生成后的 UI 反馈（自动切换为可见模式）。

## 3. 实施步骤

1. **修正配置 Bug**: 修复 `src/lib/kv/index.ts` 中的 `updateGlobalConfig`。
2. **新增撤销 Action**: 在 `src/actions/db/token.ts` 中实现并导出 `revokeBearerToken`。
3. **实现验证 API**: 创建 `src/pages/api/auth/verify.ts`。
4. **增强 UI**: 更新 `token-manager.svelte`，添加撤销功能及交互优化。
5. **完善测试**:
  - 在 `src/tests/auth.spec.ts` 中增加 Bearer Token 认证的单元测试。
  - 新增配置热补丁逻辑的测试。

## 4. 验证指标
- [ ] 同步脚本可以通过 `curl -H "Authorization: Bearer <token>" /api/auth/verify` 获得 200 响应。
- [ ] 在 Settings 页面可以生成、查看、复制和撤销 Token。
- [ ] 撤销 Token 后，API 请求应立即返回 401。
- [ ] 现有网页版登录和操作不受影响。
