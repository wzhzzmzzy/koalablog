import { decodeFileSaveConflict, formatFileSaveError, sourceConflictFromActionError } from '@/components/editor/utils'
import { initFileRecord } from '@/db/types'
import { describe, expect, it } from 'vitest'

describe('editor File Save error decoding', () => {
  it('decodes one source-conflict payload for all consumers', () => {
    const current = { ...initFileRecord(), id: 7, path: '/post/example', title: 'example', revision: 4 }
    const error = {
      code: 'CONFLICT',
      message: JSON.stringify({ code: 'source_conflict', current }),
    }

    expect(decodeFileSaveConflict(error)).toEqual({ code: 'source_conflict', current })
    expect(sourceConflictFromActionError(error)).toEqual(current)
  })

  it('formats path conflicts and safely ignores malformed conflict payloads', () => {
    expect(formatFileSaveError({
      code: 'CONFLICT',
      message: JSON.stringify({ code: 'path_conflict', path: '/wiki/taken' }),
    })).toBe('Another active File already uses /wiki/taken.')
    expect(decodeFileSaveConflict({ code: 'CONFLICT', message: 'not-json' })).toBeNull()
  })
})
