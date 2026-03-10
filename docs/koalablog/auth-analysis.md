# Koalablog 认证结构分析

## 现有认证流程 (JWT Cookie)

### 1. 认证文件结构
- `src/middleware.ts` - 中间件，调用 authInterceptor
- `src/lib/auth/index.ts` - 认证核心逻辑
- `src/actions/form/login.ts` - 登录动作

### 2. Token 机制
- **Access Token**:
  - Cookie 名称：`koala-access-token`
  - 有效期：1 小时 (admin) / 3 天 (guest)
  - 算法：HS256
  - 密钥：adminKey

- **Refresh Token**:
  - Cookie 名称：`koala-refresh-token`
  - 有效期：7 天
  - 存储：Cookie + KV 存储
  - 用途：Access Token 过期后刷新

### 3. 认证流程
1. 用户登录时提交 adminKey/guestKey
2. 验证通过后生成 JWT Access Token 和 Refresh Token
3. Token 通过 HttpOnly Cookie 存储
4. 每次请求通过 `authInterceptor` 验证 Cookie
5. Access Token 过期时，用 Refresh Token 刷新

### 4. Bearer Token 集成点

**修改位置**: `src/middleware.ts` 和 `src/lib/auth/index.ts`

**集成方案**:
1. 在 `authInterceptor` 中优先检查 `Authorization: Bearer <token>` header
2. 如果存在 Bearer Token，验证其有效性
3. 验证通过后设置 `ctx.locals.session.role`
4. 保持 Cookie 认证向后兼容

**API Token 存储**:
- 使用 SQLite 数据库 (Drizzle ORM)
- 存储字段：token, name, created_at, expires_at, revoked
- 支持生成、列出、撤销操作

## Phase 0 实现计划

### Task 2: Bearer Token 中间件
- 检测 Authorization header
- 验证 API Token 有效性
- 错误处理

### Task 3: API Token 管理
- 生成新 Token
- 列出有效 Token
- 撤销 Token
- 数据库存储

### Task 4: 单元测试
- Bearer Token 认证测试
- Token 管理功能测试

### Task 5: 文档
- API 认证使用示例
- Token 生成步骤
- 常见问题
