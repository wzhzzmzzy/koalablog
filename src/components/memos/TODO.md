# Memos 和文档双链化

目前除了 preset 之外，所有文档都有 link，可以将文档分成四类：

- `pages`: link 没有特殊前缀
- `posts`: link 前缀为 `posts/`
- `memos`: link 前缀为 `memos/`
- `preset`: link 前缀为 `presets/`

通过这种方式可以轻松区分所有文档，不再需要通过 source 字段区分。source 可以作为索引使用，减少每次全量拉取时读取的行数。

除了 preset 之外，其他所有文档都可以通过双链相互引用，拥有 incoming_links 和 outgoing_links 两个字段，通过 `[[subject]]`。
