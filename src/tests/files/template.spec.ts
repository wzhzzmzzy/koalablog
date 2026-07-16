import type { CreationTemplateV1 } from '@/lib/files/types'
import { parseAbsolutePathPrefix } from '@/lib/files/path'
import {
  instantiateTemplateV1,
  selectTemplateV1,
  validateTemplateV1,
} from '@/lib/files/template'
import { describe, expect, it } from 'vitest'

const memoTemplate: CreationTemplateV1 = {
  id: 'memo-default',
  prefix: '/memo/',
  titlePattern: '{{datetime:yyyyMMddHHmm}}{{uniqueSuffix}}',
  pathPattern: '{{targetPrefix}}/{{title}}',
  content: '# {{title}}\n\nPath: {{path}}',
}

describe('creation Template v1', () => {
  it('validates the ordinary memo preset', () => {
    expect(validateTemplateV1(memoTemplate)).toEqual({
      ok: true,
      value: memoTemplate,
    })
  })

  it('rejects executable, unknown, and structurally unsafe patterns', () => {
    const result = validateTemplateV1({
      ...memoTemplate,
      titlePattern: '{{javascript:alert(1)}}',
      pathPattern: '/memo/{{title}}',
    })

    expect(result.ok).toBe(false)
    if (result.ok)
      return
    expect(result.error.map(error => error.code)).toEqual([
      'unknown_placeholder',
      'path_must_use_target_prefix',
    ])
  })

  it('rejects fields outside the Template v1 schema', () => {
    const result = validateTemplateV1({
      ...memoTemplate,
      renderer: 'svelte',
    })

    expect(result.ok).toBe(false)
    if (!result.ok)
      expect(result.error[0]?.code).toBe('invalid_template')
  })

  it('selects the longest matching Prefix on segment boundaries', () => {
    const target = parseAbsolutePathPrefix('/memo/project/deep/')
    expect(target.ok).toBe(true)
    if (!target.ok)
      return

    const selected = selectTemplateV1([
      memoTemplate,
      { ...memoTemplate, id: 'root', prefix: '/' },
      { ...memoTemplate, id: 'project', prefix: '/memo/project/' },
      { ...memoTemplate, id: 'lookalike', prefix: '/memo/projector/' },
    ], target.value)

    expect(selected?.id).toBe('project')
  })

  it('instantiates under the clicked Prefix exactly once', () => {
    const target = parseAbsolutePathPrefix('/memo/project/')
    expect(target.ok).toBe(true)
    if (!target.ok)
      return

    const result = instantiateTemplateV1(memoTemplate, {
      targetPrefix: target.value,
      now: new Date(2026, 6, 16, 6, 7),
      uniqueSuffix: '-2',
    })

    expect(result).toEqual({
      ok: true,
      value: {
        title: '202607160607-2',
        path: '/memo/project/202607160607-2',
        content: '# 202607160607-2\n\nPath: /memo/project/202607160607-2',
      },
    })
  })

  it('refuses a resolved Title containing a slash', () => {
    const target = parseAbsolutePathPrefix('/memo/')
    expect(target.ok).toBe(true)
    if (!target.ok)
      return

    const result = instantiateTemplateV1({
      ...memoTemplate,
      titlePattern: 'nested/title',
    }, {
      targetPrefix: target.value,
      now: new Date(2026, 6, 16),
      uniqueSuffix: '',
    })

    expect(result.ok).toBe(false)
    if (!result.ok)
      expect(result.error[0]?.code).toBe('invalid_title')
  })
})
