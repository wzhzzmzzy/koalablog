import type { Extension } from '@codemirror/state'
import { acceptCompletion, autocompletion } from '@codemirror/autocomplete'
import { Prec } from '@codemirror/state'
import { keymap } from '@codemirror/view'
import { type FileReferenceCandidate, fileReferenceCompletionSource } from './file-reference-completion'
import { type TagCompletionCandidate, tagCompletionSource } from './tag-completion'

export function markdownCompletion(options: {
  references: readonly FileReferenceCandidate[]
  tags: readonly TagCompletionCandidate[]
  excludeFileId?: number
}): Extension {
  return [
    autocompletion({
      override: [
        fileReferenceCompletionSource({ candidates: options.references, excludeId: options.excludeFileId }),
        tagCompletionSource(options.tags),
      ],
    }),
    Prec.high(keymap.of([{ key: 'Tab', run: acceptCompletion }])),
  ]
}
