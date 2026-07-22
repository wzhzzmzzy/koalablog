declare const absoluteFilePathBrand: unique symbol
declare const absolutePathPrefixBrand: unique symbol

export type AbsoluteFilePath = string & { readonly [absoluteFilePathBrand]: true }
export type AbsolutePathPrefix = string & { readonly [absolutePathPrefixBrand]: true }

export const RENDERER_MODE = {
  Markdown: 'markdown',
  Svelte: 'svelte',
} as const

export type RendererMode = typeof RENDERER_MODE[keyof typeof RENDERER_MODE]

export function isRendererMode(input: unknown): input is RendererMode {
  return input === RENDERER_MODE.Markdown || input === RENDERER_MODE.Svelte
}

export type Result<T, E> =
  | { ok: true, value: T }
  | { ok: false, error: E }

export type PathErrorCode =
  | 'not_absolute'
  | 'empty_file_path'
  | 'trailing_slash'
  | 'invalid_segment'
  | 'reserved_segment'
  | 'file_extension'
  | 'control_character'

export interface PathError {
  code: PathErrorCode
  input: string
}

export interface CreationTemplateV1 {
  id: string
  prefix: string
  titlePattern: string
  pathPattern: string
  content: string
}

export interface CreationTemplateV2 extends CreationTemplateV1 {
  renderer: RendererMode
}

export interface TemplateCatalogV1 {
  schemaVersion: 1
  revision: number
  templates: CreationTemplateV1[]
}

export interface TemplateCatalogV2 {
  schemaVersion: 2
  revision: number
  templates: CreationTemplateV2[]
}

export type TemplateField = 'template' | 'id' | 'prefix' | 'titlePattern' | 'pathPattern' | 'renderer' | 'content'

export type TemplateErrorCode =
  | 'invalid_template'
  | 'invalid_id'
  | 'invalid_prefix'
  | 'invalid_renderer'
  | 'invalid_title'
  | 'unknown_placeholder'
  | 'invalid_datetime_placeholder'
  | 'path_must_use_target_prefix'
  | 'path_must_end_with_title'
  | 'path_outside_target_prefix'
  | 'invalid_path'

export interface TemplateError {
  code: TemplateErrorCode
  field: TemplateField
  message: string
}

export interface TemplateContext {
  targetPrefix: AbsolutePathPrefix
  now: Date
  uniqueSuffix: string
}

export interface InstantiatedTemplateV1 {
  title: string
  path: AbsoluteFilePath
  content: string
}

export interface InstantiatedTemplateV2 extends InstantiatedTemplateV1 {
  renderer: RendererMode
}
