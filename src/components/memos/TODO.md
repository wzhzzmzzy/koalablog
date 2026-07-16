# Memos 与 File Reference

所有 File 都拥有唯一、绝对且无扩展名的 Path。Path 同时决定访问地址与 Source 分类：

- `/post/`：Post
- `/memo/`：Memo
- `/wiki/`：Wiki
- 其他绝对 Path：Page

Title 始终由 Path 的最后一段派生，不能独立修改。File 之间只通过绝对 `[[/path]]` 引用；`outgoing_links` 保存分析得到的绝对 Path 数组，重命名或移动目标 File 时不会改写引用方的 Source。
