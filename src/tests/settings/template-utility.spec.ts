import type { CreationTemplateV1 } from '@/lib/files/types'
import { duplicateTemplatePrefixes, normalizedTemplatePrefix, previewTemplateCatalog } from '@/components/settings/template-utility-model'
import { describe, expect, it } from 'vitest'

const template: CreationTemplateV1 = {
  id: 'memo',
  prefix: '/memo/',
  titlePattern: 'note{{uniqueSuffix}}',
  pathPattern: '{{targetPrefix}}/{{title}}',
  content: '{{title}} at {{path}}',
}

describe('template Utility model', () => {
  it('detects duplicate normalized Prefixes', () => {
    expect(duplicateTemplatePrefixes([
      template,
      { ...template, id: 'duplicate', prefix: '/memo' },
      { ...template, id: 'post', prefix: '/post/' },
    ])).toEqual(new Set(['/memo/']))
    expect(normalizedTemplatePrefix('/memo//')).toBe('/memo/')
  })

  it('previews the longest Template under a normalized sample target Prefix', () => {
    expect(previewTemplateCatalog([
      { ...template, id: 'root', prefix: '/' },
      template,
    ], '/memo/project', new Date(2026, 6, 16, 6, 7))).toEqual({
      status: 'ready',
      templateId: 'memo',
      targetPrefix: '/memo/project/',
      title: 'note',
      path: '/memo/project/note',
      content: 'note at /memo/project/note',
    })
  })

  it('reports invalid sample Prefixes and unmatched catalogs explicitly', () => {
    expect(previewTemplateCatalog([template], 'relative', new Date())).toMatchObject({ status: 'invalid_target_prefix' })
    expect(previewTemplateCatalog([template], '/wiki/', new Date())).toEqual({
      status: 'no_template',
      targetPrefix: '/wiki/',
    })
  })
})
