import { RENDERER_MODE, type RendererMode } from '@/lib/files/types'

export interface SourceHashFixture {
  name: string
  renderer: RendererMode
  content: string
  expected: string
}

export const SOURCE_HASH_FIXTURES: SourceHashFixture[] = [
  {
    name: 'blank Markdown',
    renderer: RENDERER_MODE.Markdown,
    content: '',
    expected: 'c4a3e04fa78d47ace9853e81fcedcf84172449d37a72852120d3a41b14a6c1f5',
  },
  {
    name: 'blank Svelte',
    renderer: RENDERER_MODE.Svelte,
    content: '',
    expected: 'a7ad96aa2875bfe31c9171d90dfd20c08bbfcfa965c595a136a11f8fe0fceb5a',
  },
  {
    name: 'Unicode Markdown',
    renderer: RENDERER_MODE.Markdown,
    content: '你好，Koala 🐨',
    expected: 'f22a36807e299b6fba30270ddf4a78edc542b12146be91c0e639a3bbd7a4042d',
  },
  {
    name: 'whitespace-only Markdown',
    renderer: RENDERER_MODE.Markdown,
    content: ' \t\n',
    expected: 'b2208a8eb84386c4a755485c5141c4c984a4e20b3130e0bba8d6bc7a29cd512c',
  },
  {
    name: 'Markdown with LF',
    renderer: RENDERER_MODE.Markdown,
    content: 'line 1\nline 2',
    expected: '19665a4621f0d1ae4e91b58fd898554447831648cd14fbb79d728bef75bf3341',
  },
  {
    name: 'Markdown with CRLF',
    renderer: RENDERER_MODE.Markdown,
    content: 'line 1\r\nline 2',
    expected: '33ceb0beaeb6866a60c5f9c444a092b7efcb914dbad0ada7242362fdcd446a95',
  },
  {
    name: 'Svelte component',
    renderer: RENDERER_MODE.Svelte,
    content: '<script>let count = 0</script>\n<button>{count}</button>',
    expected: 'f013faecf0cd5ceeeb7b8f913aafb6243e639f21a9b07d0e8c5d8f76da9dbf6d',
  },
]
