# Markdown Tag 上线后迁移方案

本功能不要求上线前执行 DDL 或全量数据改写。`markdown.tags` 继续使用 text 列，新保存的 Markdown File 写入 JSON 数组；未再次保存的旧记录仍可保持 CSV，并由读取兼容层和精确查询共同支持。

## 上线顺序

1. 同一个版本发布服务端 canonical Source 持久化、Dashboard Editor 回写、Sync API content 返回及 Local Workspace 本地回写。禁止只发布服务端 Source 改写。
2. 发布后先验证新建和更新 Markdown File：数据库 content 必须等于响应 content，Source Hash 必须基于该 content，tags 必须是 JSON 数组。
3. 验证同一 Local Workspace 连续运行两次 Sync，第二次不得产生 upload、pull 或 conflict。
4. 观察一个完整发布窗口后，再决定是否需要清理长期未保存的旧 CSV 行。兼容读取没有截止时间，因此清理不是上线依赖。

## 只读兼容性审计

只对导出的生产 SQLite 快照运行，不要把线上写连接交给脚本。审计脚本只接受无 query 参数的 `file:` URL，且不执行 UPDATE、INSERT、DELETE 或 DDL。审计至少输出：

```bash
SQLITE_URL='file:/absolute/path/to/production-snapshot.sqlite' \
  fnm exec --using v22.18.0 pnpm audit:markdown-tags
```

Cloudflare D1 先导出快照，再对快照审计；不要向该脚本提供远程 D1 写凭据。脚本只读取 `markdown` 表并向标准输出写 JSON 报告；建议将报告保存到受控的发布证据目录，不要提交包含生产 File ID 的原始报告。

- stored tags 为 JSON array、CSV、null/empty、malformed structured value 的行数；
- leading frontmatter 为 absent、valid、invalid、ambiguous 的 File 数；
- 不支持的 frontmatter `tags` 类型；
- Effective Tags 中包含空白、`#`、逗号或仅大小写不同的情况；
- stored derived tags 与当前 Source preparation 结果不一致的行数和脱敏样例 ID。

审计结果只能证明兼容状态，不能被描述成生产数据已经迁移。若没有生产只读快照，则明确记录“缺少生产证据”，不得从代码或测试 fixture 推断线上分布。

## 渐进收敛

默认采用自然收敛：File 下次成功保存时，canonical Source 和 JSON Effective Tags 同时写入，并通过 revision CAS 防止覆盖并发修改。

如果审计显示大量长期不再编辑的 CSV 行，并且确实需要统一存储格式，优先使用仓库提供的保守迁移 SQL：

```bash
# SQLite 快照验证
sqlite3 /absolute/path/to/snapshot.sqlite \
  < scripts/db/migrate-markdown-tags-to-json.sql

# 兼容应用发布并建立 D1 Time Travel 回滚点后执行
fnm exec --using v22.18.0 pnpm exec wrangler d1 execute DB --remote \
  --file scripts/db/migrate-markdown-tags-to-json.sql
```

该 SQL 不执行 DDL，只转换能够明确识别的旧 CSV `tags`。JSON、空值和 malformed structured value 保持不变；UPDATE 同时匹配原始 `tags`，并发 Save 无论先后执行都不会被旧快照覆盖。保存执行前后的分类统计与 `converted_rows`，并要求迁移后 `convertible_csv_rows = 0`。

如果需要根据 Source 重建 derived index、处理 malformed 行或分批限流，另行审批一个 revision-guarded maintenance job：

1. 按 ID 小批量读取 `id, renderer, content, tags, revision`；
2. 只转换 `tags` derived index，不为此单独改写 Source；
3. UPDATE 必须包含 `WHERE id = ? AND revision = ? AND tags = ?`；
4. 每批记录 scanned、converted、skipped、conflicted、malformed 数量；
5. malformed structured value 和无效/歧义 frontmatter 只报告，不猜测修复；
6. 支持 dry-run，并先在生产快照验证。

## 回滚

- 应用回滚：回退到发布前版本不会丢失 Source；JSON 数组仍是 text，但旧代码会把 JSON 内容当 CSV 错读，因此应用版本回滚前必须同时关闭依赖 tag 展示/过滤的入口，或发布一个仅包含 JSON/CSV 双读 codec 的兼容补丁。
- 数据回滚：不要把 canonical Source 自动还原为提交前 Source。Tag Reconciliation 是用户保存时可见且可撤销的 Source 编辑，成功保存后 canonical Source 就是新的事实。
- Sync 回滚：如果客户端版本不能采用响应 content，暂停该版本的上传能力；不要继续写入 server hash 形成错误基线。
- maintenance job 回滚：因为只改 derived index，可由 Source preparation 重新构建；保留审计输出和批次 ID，不回滚 revision 或 Source。

## 上线验收

- public tag 过滤对 `java` 与 `javascript` 精确区分；
- RSS 和 Editor Instant Search 同时读取 JSON 与旧 CSV；
- invalid/ambiguous frontmatter 保存成功、Source 字节不变并显示非阻塞 warning；
- Dashboard Save 后不产生虚假 dirty，保存期间输入不丢失；
- Tag completion 与 File Reference completion 均可使用 Enter/Tab/Escape；
- 1440×900、393×727、320×640 下 completion popup 和 active option 完整位于视口内；
- Cloudflare build、SQLite tests、D1 tests 和完整 E2E 回归通过，或对环境阻塞给出可复现证据。
