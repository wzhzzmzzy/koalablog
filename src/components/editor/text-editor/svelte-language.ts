import type { Extension } from '@codemirror/state'
import { svelte } from '@replit/codemirror-lang-svelte'

export function svelteLanguageExtension(): Extension {
  return svelte()
}
