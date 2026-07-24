import type { Locator, Page } from '@playwright/test'
import type { RendererMode } from '../../src/lib/files/types'
import { Buffer } from 'node:buffer'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { markdown } from '../../src/db/schema'
import { calculateSourceHash } from '../../src/lib/files/source-hash'
import { expect, test } from './fixture'

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nJ8AAAAASUVORK5CYII=',
  'base64',
)

async function editorText(source: Locator) {
  return source.evaluate((element) => {
    // CodeMirror renders each logical line in a separate element.
    // eslint-disable-next-line unicorn/prefer-dom-node-text-content
    return (element as HTMLElement).innerText
  })
}

async function expectEditorText(source: Locator, expected: string) {
  await expect.poll(() => editorText(source)).toBe(expected)
}

async function dispatchImageTransfer(
  source: Locator,
  type: 'paste' | 'drop',
  name: string,
  coordinates?: { x: number, y: number },
) {
  await source.evaluate((element, options) => {
    const binary = atob(options.base64)
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
    const transfer = new DataTransfer()
    transfer.items.add(new File([bytes], options.name, { type: 'image/png' }))
    const event = options.type === 'paste'
      ? new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer })
      : new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        clientX: options.coordinates?.x,
        clientY: options.coordinates?.y,
        dataTransfer: transfer,
      })
    element.dispatchEvent(event)
  }, { type, name, coordinates, base64: onePixelPng.toString('base64') })
}

async function replaceServerRendererAndSourceState(id: number, content: string, renderer?: RendererMode) {
  const database = drizzle({ connection: { url: 'file:.playwright/local.db' } })
  const [current] = await database.select({ renderer: markdown.renderer })
    .from(markdown)
    .where(eq(markdown.id, id))
  if (!current) {
    database.$client.close()
    throw new Error(`Missing File ${id}`)
  }
  const nextRenderer = renderer ?? current.renderer
  const [updated] = await database.update(markdown).set({
    renderer: nextRenderer,
    content,
    sourceHash: await calculateSourceHash(nextRenderer, content),
    revision: sql`${markdown.revision} + 1`,
  }).where(eq(markdown.id, id)).returning({ revision: markdown.revision })
  database.$client.close()
  return updated.revision
}

async function storedEditBuffer(page: Page, fileId: number) {
  return page.evaluate(({ key, id }) => {
    const stored = localStorage.getItem(key)
    if (!stored)
      return null
    const value = JSON.parse(stored) as { buffers?: Array<{ fileId?: number }> }
    return value.buffers?.find(buffer => buffer.fileId === id) ?? null
  }, { key: 'koala-editor-edit-buffers', id: fileId })
}

async function gateUpload(page: Page) {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/_actions/oss.upload', async (route) => {
    await gate
    await route.continue()
  })
  return release
}

test('File Source exposes the stable editor contract', async ({ page }) => {
  await page.goto('/dashboard/edit?path=/phase-two')
  await page.waitForLoadState('networkidle')

  const source = page.getByRole('textbox', { name: 'File Source for /phase-two' })
  await expectEditorText(source, 'First line\nSecond line')
  await expect(source).toBeEditable()

  await source.focus()
  await source.fill('First line\nSecond line updated')

  await expectEditorText(source, 'First line\nSecond line updated')
})

test('Renderer Mode changes only the Edit Buffer and survives File switching and reload', async ({ page }) => {
  await page.goto('/dashboard/edit?path=/phase-two')
  await page.waitForLoadState('networkidle')

  const source = page.getByRole('textbox', { name: 'File Source for /phase-two' })
  const originalSource = await editorText(source)
  const markdown = page.getByRole('radio', { name: 'Markdown' })
  const svelte = page.getByRole('radio', { name: 'Svelte' })
  await expect(markdown).toBeChecked()

  await svelte.check()
  await expect(svelte).toBeChecked()
  await expectEditorText(source, originalSource)

  await page.getByRole('button', { name: 'second', exact: true }).click()
  await page.getByRole('button', { name: 'phase-two', exact: true }).click()
  await expect(svelte).toBeChecked()
  await expectEditorText(source, originalSource)

  await page.reload()
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('radio', { name: 'Svelte' })).toBeChecked()
  await expectEditorText(page.getByRole('textbox', { name: 'File Source for /phase-two' }), originalSource)
})

test('Markdown startup lazy-loads the Svelte language only after Renderer switches', async ({ page }) => {
  const svelteLanguageRequests: string[] = []
  page.on('request', (request) => {
    if (/svelte-language|codemirror-lang-svelte/.test(request.url()))
      svelteLanguageRequests.push(request.url())
  })

  await page.goto('/dashboard/edit?path=/phase-two')
  await page.waitForLoadState('networkidle')
  const source = page.getByRole('textbox', { name: 'File Source for /phase-two' })
  await source.fill('ordinary Markdown edit')
  await expectEditorText(source, 'ordinary Markdown edit')
  expect(svelteLanguageRequests).toHaveLength(0)

  await page.getByRole('radio', { name: 'Svelte' }).check()
  await expect.poll(() => svelteLanguageRequests.length).toBeGreaterThan(0)
})

test('Svelte diagnostics are debounced, mapped, and cannot leak into a switched File', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/dashboard/edit?path=/phase-two')
  await page.waitForLoadState('networkidle')

  const source = page.getByRole('textbox', { name: 'File Source for /phase-two' })
  await page.getByRole('radio', { name: 'Svelte' }).check()
  await source.fill('<svelte:head><title>Unsupported</title></svelte:head>')
  await expect.poll(() => page.locator('.cm-lint-marker-error').count(), { timeout: 60_000 }).toBeGreaterThan(0)

  await source.fill('<svelte:head><title>stale</title></svelte:head>')
  await page.getByRole('button', { name: 'second', exact: true }).click()
  const secondSource = page.getByRole('textbox', { name: 'File Source for /second' })
  await expectEditorText(secondSource, 'Second file')
  await page.waitForTimeout(700)
  await expect(page.locator('.cm-lint-marker')).toHaveCount(0)
})

test('Blink IME composition commits once without replacing Source', async ({ page }) => {
  await page.goto('/dashboard/edit?path=/phase-two')
  await page.waitForLoadState('networkidle')

  const source = page.getByRole('textbox', { name: 'File Source for /phase-two' })
  await source.fill('IME: ')
  await source.press('ArrowLeft')
  await source.press('ArrowRight')

  const client = await page.context().newCDPSession(page)
  await client.send('Input.imeSetComposition', {
    text: 'zhongwen',
    selectionStart: 8,
    selectionEnd: 8,
  })
  await expectEditorText(source, 'IME: zhongwen')
  await client.send('Input.imeSetComposition', {
    text: '中文',
    selectionStart: 2,
    selectionEnd: 2,
  })
  await expectEditorText(source, 'IME: 中文')
  await client.send('Input.insertText', { text: '中文' })
  await client.detach()

  await expectEditorText(source, 'IME: 中文')
  await expect(source).toBeFocused()
  await source.press('Meta+z')
  await expectEditorText(source, 'IME: ')
})

test('FileEditor saves the selected Renderer exactly once while preserving focus', async ({ page }) => {
  const savePayloads: Array<string | null> = []
  const svelteWorkerRequests: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/_actions/form.save'))
      savePayloads.push(request.postData())
    if (/artifact\.worker/.test(request.url()))
      svelteWorkerRequests.push(request.url())
  })

  try {
    await page.goto('/dashboard/edit?path=/phase-two')
    await page.waitForLoadState('networkidle')
    const path = page.getByRole('textbox', { name: 'Absolute File Path' })
    const source = page.getByRole('textbox', { name: 'File Source for /phase-two' })

    await path.focus()
    await page.keyboard.press('Control+s')
    await expect(page.getByText('Saved Success')).toBeVisible()
    await expect(path).toBeFocused()
    expect(savePayloads).toHaveLength(1)

    await page.getByRole('radio', { name: 'Svelte' }).check()
    await source.focus()
    const saveResponse = page.waitForResponse(response => response.request().method() === 'POST' && response.url().includes('/_actions/form.save'))
    await page.keyboard.press('Meta+s')
    const saveResponseBody = await (await saveResponse).text()
    const flattenedSaveResponse = JSON.parse(saveResponseBody) as unknown[]
    const savedFileReference = flattenedSaveResponse[0] as { sourceHash: number }
    await expect.poll(() => savePayloads.length).toBe(2)
    await expect(source).toBeFocused()
    expect(savePayloads[1]).toMatch(/name="renderer"\r?\n\r?\nsvelte/)
    expect(savePayloads[1]).toMatch(/name="content"\r?\n\r?\nFirst line\r?\nSecond line/)
    expect(flattenedSaveResponse[savedFileReference.sourceHash]).toEqual(expect.stringMatching(/^[0-9a-f]{64}$/))
    await expect.poll(() => svelteWorkerRequests.length, { timeout: 20_000 }).toBeGreaterThan(0)
  }
  finally {
    await replaceServerRendererAndSourceState(1, 'First line\nSecond line', 'markdown')
  }
})

test('a recycled File exposes a read-only Source editor', async ({ page }) => {
  await page.goto('/dashboard/edit?id=2')
  await page.waitForLoadState('networkidle')

  const source = page.getByRole('textbox', { name: 'File Source for /trashed' })
  await expectEditorText(source, 'Read-only Source')
  await expect(source).not.toBeEditable()
  const svelteRenderer = page.getByRole('radio', { name: 'Svelte' })
  await expect(svelteRenderer).toBeVisible()
  await expect(svelteRenderer).toBeDisabled()
  await expect(svelteRenderer).toHaveAttribute('title', 'Renderer cannot be changed for a recycled File')
  await source.pressSequentially(' changed')
  await expectEditorText(source, 'Read-only Source')
})

test('switching Files restores Source, selection, and undo by File ID', async ({ page }) => {
  await page.goto('/dashboard/edit?path=/phase-two')
  await page.waitForLoadState('networkidle')

  let source = page.getByRole('textbox', { name: 'File Source for /phase-two' })
  await source.fill('abc')
  await source.press('ArrowLeft')
  await source.press('ArrowLeft')
  await page.getByRole('radio', { name: 'Svelte' }).check()

  const secondButton = page.getByRole('button', { name: 'second', exact: true })
  await secondButton.click()
  await expect(secondButton).toBeFocused()
  await expect(page.getByRole('radio', { name: 'Markdown' })).toBeChecked()
  await expect(page.getByRole('textbox', { name: 'File Source for /second' })).toBeVisible()
  const phaseTwoButton = page.getByRole('button', { name: 'phase-two', exact: true })
  await phaseTwoButton.click()
  await expect(phaseTwoButton).toBeFocused()
  await expect(page.getByRole('radio', { name: 'Svelte' })).toBeChecked()

  source = page.getByRole('textbox', { name: 'File Source for /phase-two' })
  await page.getByRole('button', { name: 'Preview File' }).click()
  await expect(source).toBeHidden()
  await page.getByRole('button', { name: 'Edit Source' }).click()
  await expect(source).toBeFocused()
  await source.pressSequentially('X')
  await expectEditorText(source, 'aXbc')

  await source.press('Meta+z')
  await expectEditorText(source, 'abc')
})

test('toolbar inserts a multi-image batch as one undoable action', async ({ page }) => {
  await page.goto('/dashboard/edit?path=/phase-two')
  await page.waitForLoadState('networkidle')

  const source = page.getByRole('textbox', { name: 'File Source for /phase-two' })
  await source.fill('before')

  const chooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Upload image' }).click()
  const chooser = await chooserPromise
  expect(chooser.isMultiple()).toBe(true)
  await chooser.setFiles([
    { name: 'first.png', mimeType: 'image/png', buffer: onePixelPng },
    { name: 'second.png', mimeType: 'image/png', buffer: onePixelPng },
  ])

  await expect(source).toBeFocused()
  await expect.poll(async () => {
    const text = await editorText(source)
    return text.match(/!\[\]\(\/api\/oss\/[^)]+\)/g)?.length ?? 0
  }).toBe(2)
  expect(await editorText(source)).not.toContain('Uploading')
  const completedBatch = await editorText(source)

  await source.press('Meta+z')
  await expectEditorText(source, 'before')

  await source.press('Meta+Shift+z')
  await expectEditorText(source, completedBatch)
  expect(await editorText(source)).not.toContain('Uploading')
})

test('an image upload keeps its originating Svelte Renderer through a later toggle and redo', async ({ page }) => {
  const releaseUpload = await gateUpload(page)
  await page.goto('/dashboard/edit?path=/phase-two')
  await page.waitForLoadState('networkidle')

  const source = page.getByRole('textbox', { name: 'File Source for /phase-two' })
  await source.fill('before')
  await page.getByRole('radio', { name: 'Svelte' }).check()
  const responsePromise = page.waitForResponse(response => response.url().includes('/_actions/oss.upload'))
  const chooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Upload image' }).click()
  await (await chooserPromise).setFiles({ name: 'svelte.png', mimeType: 'image/png', buffer: onePixelPng })

  await expect.poll(() => editorText(source))
    .toContain('<img src="koala-upload:')
  await expect.poll(() => editorText(source))
    .toContain('alt="Uploading svelte.png…" />')
  await page.getByRole('radio', { name: 'Markdown' }).check()

  releaseUpload()
  await responsePromise
  await expect(page.getByText('Uploaded Successfully')).toBeVisible()
  await expect.poll(() => editorText(source))
    .toMatch(/^before<img src="\/api\/oss\/[^"]+" alt="" \/>$/)
  expect(await editorText(source)).not.toContain('![](')
  const completed = await editorText(source)

  await source.press('Meta+z')
  await expectEditorText(source, 'before')
  await source.press('Meta+Shift+z')
  await expectEditorText(source, completed)
})

test('undo during upload discards the late result', async ({ page }) => {
  const releaseUpload = await gateUpload(page)
  await page.goto('/dashboard/edit?path=/phase-two')
  await page.waitForLoadState('networkidle')

  const source = page.getByRole('textbox', { name: 'File Source for /phase-two' })
  await source.fill('before')
  const responsePromise = page.waitForResponse(response => response.url().includes('/_actions/oss.upload'))
  const chooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Upload image' }).click()
  await (await chooserPromise).setFiles({ name: 'late.png', mimeType: 'image/png', buffer: onePixelPng })

  await expect.poll(() => editorText(source)).toContain('Uploading late.png')
  await source.press('Meta+z')
  await expectEditorText(source, 'before')

  releaseUpload()
  await responsePromise
  await expect(page.getByText('Uploaded Successfully')).toBeVisible()
  await expectEditorText(source, 'before')
})

test('redo during upload waits for final Markdown without restoring a placeholder', async ({ page }) => {
  const releaseUpload = await gateUpload(page)
  await page.goto('/dashboard/edit?path=/phase-two')
  await page.waitForLoadState('networkidle')

  const source = page.getByRole('textbox', { name: 'File Source for /phase-two' })
  await source.fill('before')
  const responsePromise = page.waitForResponse(response => response.url().includes('/_actions/oss.upload'))
  const chooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Upload image' }).click()
  await (await chooserPromise).setFiles({ name: 'redo-pending.png', mimeType: 'image/png', buffer: onePixelPng })

  await expect.poll(() => editorText(source)).toContain('Uploading redo-pending.png')
  await source.press('Meta+z')
  await expectEditorText(source, 'before')
  await source.press('Meta+Shift+z')
  await expectEditorText(source, 'before')
  expect(await editorText(source)).not.toContain('Uploading')

  releaseUpload()
  await responsePromise
  await expect(page.getByText('Uploaded Successfully')).toBeVisible()
  await expect.poll(async () => (await editorText(source)).match(/!\[\]\(\/api\/oss\/[^)]+\)/g)?.length ?? 0).toBe(1)
  expect(await editorText(source)).not.toContain('Uploading')
})

test('a new edit branch discards the previous image redo batch', async ({ page }) => {
  await page.goto('/dashboard/edit?path=/phase-two')
  await page.waitForLoadState('networkidle')

  const source = page.getByRole('textbox', { name: 'File Source for /phase-two' })
  await source.fill('base')

  let chooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Upload image' }).click()
  await (await chooserPromise).setFiles({ name: 'first-branch.png', mimeType: 'image/png', buffer: onePixelPng })
  await expect.poll(async () => (await editorText(source)).includes('![](/api/oss/')).toBe(true)
  await source.press('Meta+z')
  await expectEditorText(source, 'base')

  await source.pressSequentially(' branch')
  chooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Upload image' }).click()
  await (await chooserPromise).setFiles({ name: 'second-branch.png', mimeType: 'image/png', buffer: onePixelPng })
  await expect.poll(async () => (await editorText(source)).includes('![](/api/oss/')).toBe(true)
  const secondBranch = await editorText(source)

  await source.press('Meta+z')
  await expectEditorText(source, 'base branch')
  await source.press('Meta+Shift+z')
  await expectEditorText(source, secondBranch)
})

test('removing a placeholder discards its late upload result', async ({ page }) => {
  const releaseUpload = await gateUpload(page)
  await page.goto('/dashboard/edit?path=/phase-two')
  await page.waitForLoadState('networkidle')

  const source = page.getByRole('textbox', { name: 'File Source for /phase-two' })
  const responsePromise = page.waitForResponse(response => response.url().includes('/_actions/oss.upload'))
  const chooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Upload image' }).click()
  await (await chooserPromise).setFiles({ name: 'removed.png', mimeType: 'image/png', buffer: onePixelPng })

  await expect.poll(() => editorText(source)).toContain('Uploading removed.png')
  await source.fill('user kept this text')
  releaseUpload()
  await responsePromise
  await expect(page.getByText('Uploaded Successfully')).toBeVisible()

  await expectEditorText(source, 'user kept this text')
})

test('failed image upload removes only its placeholder', async ({ page }) => {
  await page.route('**/_actions/oss.upload', route => route.abort('failed'))
  await page.goto('/dashboard/edit?path=/phase-two')
  await page.waitForLoadState('networkidle')

  const source = page.getByRole('textbox', { name: 'File Source for /phase-two' })
  await source.fill('before')
  const chooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Upload image' }).click()
  await (await chooserPromise).setFiles({ name: 'failed.png', mimeType: 'image/png', buffer: onePixelPng })

  await expectEditorText(source, 'before')
})

test('pasting an image inserts Markdown at the Source selection', async ({ page }) => {
  await page.goto('/dashboard/edit?path=/phase-two')
  await page.waitForLoadState('networkidle')

  const source = page.getByRole('textbox', { name: 'File Source for /phase-two' })
  await source.fill('before')
  await source.press('End')
  await dispatchImageTransfer(source, 'paste', 'pasted.png')

  await expect.poll(async () => (await editorText(source)).match(/!\[\]\(\/api\/oss\/[^)]+\)/g)?.length ?? 0).toBe(1)
  expect(await editorText(source)).toMatch(/^before!\[\]\(\/api\/oss\//)
  await expect(source).toBeFocused()
})

test('dropping an image uses the drop coordinates instead of the stale selection', async ({ page }) => {
  await page.goto('/dashboard/edit?path=/phase-two')
  await page.waitForLoadState('networkidle')

  const source = page.getByRole('textbox', { name: 'File Source for /phase-two' })
  await source.fill('first\nsecond')
  await source.press('Control+Home')
  const box = await source.boundingBox()
  if (!box)
    throw new Error('File Source has no bounding box')
  await dispatchImageTransfer(source, 'drop', 'dropped.png', {
    x: box.x + 100,
    y: box.y + 34,
  })

  await expect.poll(async () => (await editorText(source)).match(/!\[\]\(\/api\/oss\/[^)]+\)/g)?.length ?? 0).toBe(1)
  const text = await editorText(source)
  expect(text.indexOf('![](')).toBeGreaterThan(text.indexOf('second'))
  await expect(source).toBeFocused()
})

test('Markdown search replaces every match', async ({ page }) => {
  await page.goto('/dashboard/edit?path=/phase-two')
  await page.waitForLoadState('networkidle')

  const source = page.getByRole('textbox', { name: 'File Source for /phase-two' })
  await source.fill('alpha alpha')
  await source.press('Meta+f')
  const find = page.getByRole('textbox', { name: 'Find' })
  await find.fill('alpha')
  await page.getByRole('button', { name: 'replace', exact: true }).click()
  await page.getByRole('textbox', { name: 'Replace' }).fill('beta')
  await page.getByRole('button', { name: 'replace all', exact: true }).click()

  await expectEditorText(source, 'beta beta')
})

test('Markdown brackets, indentation, and multiple selections remain editable', async ({ page }) => {
  await page.goto('/dashboard/edit?path=/phase-two')
  await page.waitForLoadState('networkidle')

  const source = page.getByRole('textbox', { name: 'File Source for /phase-two' })
  await source.fill('')
  await source.pressSequentially('(')
  await source.pressSequentially('x')
  await expectEditorText(source, '(x)')

  await source.fill('- item')
  await source.press('Home')
  await source.press('Tab')
  await expectEditorText(source, '  - item')
  await source.press('Shift+Tab')
  await expectEditorText(source, '- item')

  await source.fill('word word')
  await source.press('Home')
  for (let index = 0; index < 4; index++) await source.press('Shift+ArrowRight')
  await source.press('Meta+d')
  await source.pressSequentially('X')
  await expectEditorText(source, 'X X')
})

test('folds, line numbers, and the active line restore by File ID', async ({ page }) => {
  await page.goto('/dashboard/edit?path=/phase-two')
  await page.waitForLoadState('networkidle')

  const source = page.getByRole('textbox', { name: 'File Source for /phase-two' })
  await source.fill('# Heading\nbody\n\n# Next\nend')
  await expect(page.locator('.cm-lineNumbers')).toBeVisible()
  await expect(page.locator('.cm-lineNumbers .cm-activeLineGutter')).toBeVisible()
  await page.locator('[title="Fold line"]').first().click()
  await expect(page.locator('[title="Unfold line"]:visible').first()).toBeVisible()

  await page.getByRole('button', { name: 'second', exact: true }).click()
  await page.getByRole('radio', { name: 'Svelte' }).check()
  await page.getByRole('button', { name: 'phase-two', exact: true }).click()

  await expect(page.getByRole('radio', { name: 'Markdown' })).toBeChecked()
  await expect(page.locator('[title="Unfold line"]:visible').first()).toBeVisible()
  await page.locator('[title="Unfold line"]:visible').first().click()
  await expect.poll(async () => (await editorText(source)).replace(/\n{2,}/g, '\n'))
    .toBe('# Heading\nbody\n# Next\nend')
})

test('selection remains visible inside the active CodeMirror line', async ({ page }) => {
  await page.goto('/dashboard/edit?path=/phase-two')
  await page.waitForLoadState('networkidle')

  const source = page.getByRole('textbox', { name: 'File Source for /phase-two' })
  await source.focus()
  await source.press('Control+Home')
  await source.press('End')
  for (let index = 0; index < 4; index++) await source.press('Shift+ArrowLeft')

  const feedback = await page.locator('.cm-editor').evaluate((editor) => {
    const activeLine = editor.querySelector<HTMLElement>('.cm-activeLine')
    const selection = editor.querySelector<HTMLElement>('.cm-selectionBackground')
    if (!activeLine || !selection)
      throw new Error('Expected an active line and selection layer')

    const activeRect = activeLine.getBoundingClientRect()
    const selectionRect = selection.getBoundingClientRect()
    const background = getComputedStyle(activeLine).backgroundColor
    const alphaMatch = background.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)|\/\s*([\d.]+)/)
    const alpha = Number(
      alphaMatch?.[1]
      ?? alphaMatch?.[2]
      ?? 1,
    )

    return {
      activeLine: activeLine.textContent,
      alpha,
      selectionOverlapsActiveLine: selectionRect.top < activeRect.bottom && selectionRect.bottom > activeRect.top,
    }
  })

  expect(feedback.activeLine).toBe('First line')
  expect(feedback.selectionOverlapsActiveLine).toBe(true)
  expect(feedback.alpha).toBeLessThan(1)
})

test('narrow screens hide gutters while keeping Source scrolling and editing', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 640 })
  await page.goto('/dashboard/edit?path=/phase-two')
  await page.waitForLoadState('networkidle')

  const source = page.getByRole('textbox', { name: 'File Source for /phase-two' })
  const longSource = Array.from({ length: 80 }, (_, index) => `line ${index + 1}`).join('\n')
  await source.fill(longSource)
  await expect(page.locator('.cm-gutters')).toBeHidden()
  await source.press('Control+End')
  await expect.poll(() => page.locator('.cm-scroller').evaluate(element => element.scrollTop)).toBeGreaterThan(0)
  await source.pressSequentially(' mobile')
  await expect.poll(() => editorText(source)).toContain('line 80 mobile')
})

test('desktop Source scroll restores independently from selection by File ID', async ({ page }) => {
  await page.goto('/dashboard/edit?path=/phase-two')
  await page.waitForLoadState('networkidle')

  const source = page.getByRole('textbox', { name: 'File Source for /phase-two' })
  const scroller = page.locator('.cm-scroller')
  const longSource = Array.from({ length: 120 }, (_, index) => `line ${index + 1}`).join('\n')
  await source.fill(longSource)
  await source.press('Control+Home')
  await scroller.hover()
  await page.mouse.wheel(0, 2400)
  await expect.poll(() => scroller.evaluate(element => element.scrollTop)).toBeGreaterThan(0)
  const savedScrollTop = await scroller.evaluate(element => element.scrollTop)

  await page.getByRole('button', { name: 'second', exact: true }).click()
  await page.getByRole('radio', { name: 'Svelte' }).check()
  await page.getByRole('button', { name: 'phase-two', exact: true }).click()

  await expect(page.getByRole('radio', { name: 'Markdown' })).toBeChecked()
  await expect.poll(() => scroller.evaluate(element => element.scrollTop)).toBeGreaterThan(savedScrollTop / 2)
})

test('same-ID accepted Source replacement clears stale undo history', async ({ page }) => {
  await page.goto('/dashboard/edit?path=/phase-two')
  await page.waitForLoadState('networkidle')

  const source = page.getByRole('textbox', { name: 'File Source for /phase-two' })
  await source.fill('locally saved Source')
  await page.getByRole('button', { name: 'Save File' }).click()
  await expect(page.getByText('Saved Success')).toBeVisible()

  await replaceServerRendererAndSourceState(1, 'accepted server Source')
  await page.getByRole('button', { name: 'phase-two', exact: true }).click()
  await expectEditorText(source, 'accepted server Source')

  await source.focus()
  await source.press('Meta+z')
  await expectEditorText(source, 'accepted server Source')
})

test('dirty same-ID refresh retains Source and exposes the newer server conflict', async ({ page }) => {
  await page.goto('/dashboard/edit?path=/phase-two')
  await page.waitForLoadState('networkidle')

  const source = page.getByRole('textbox', { name: 'File Source for /phase-two' })
  await source.fill('local unsaved Source')
  await replaceServerRendererAndSourceState(1, 'newer server Source')
  await page.getByRole('button', { name: 'phase-two', exact: true }).click()

  await expectEditorText(source, 'local unsaved Source')
  await expect(page.getByText(/Server revision \d+ differs from the Edit Buffer base revision \d+\./)).toBeVisible()
  await expect(page.getByText('The local Source is still intact.', { exact: false })).toBeVisible()
})

test('rebasing a conflict keeps the local Renderer and Source', async ({ page }) => {
  await page.goto('/dashboard/edit?path=/phase-two')
  await page.waitForLoadState('networkidle')

  const source = page.getByRole('textbox', { name: 'File Source for /phase-two' })
  await source.fill('local Source kept during rebase')
  const serverRevision = await replaceServerRendererAndSourceState(1, 'newer Svelte server Source', 'svelte')
  await page.getByRole('button', { name: 'phase-two', exact: true }).click()

  await expect.poll(() => storedEditBuffer(page, 1)).toMatchObject({
    renderer: 'markdown',
    content: 'local Source kept during rebase',
    conflict: { server: { renderer: 'svelte', content: 'newer Svelte server Source' } },
  })

  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Keep local and rebase' }).click()

  await expectEditorText(source, 'local Source kept during rebase')
  await expect.poll(() => storedEditBuffer(page, 1)).toMatchObject({
    renderer: 'markdown',
    content: 'local Source kept during rebase',
    baseRevision: serverRevision,
    conflict: null,
  })
})

test('using the server version removes the local buffer and restores server Source', async ({ page }) => {
  await page.goto('/dashboard/edit?path=/second')
  await page.waitForLoadState('networkidle')

  const source = page.getByRole('textbox', { name: 'File Source for /second' })
  await source.fill('local Source to discard')
  await replaceServerRendererAndSourceState(3, 'server Svelte Source', 'svelte')
  await page.getByRole('button', { name: 'second', exact: true }).click()

  await expect.poll(() => storedEditBuffer(page, 3)).toMatchObject({
    renderer: 'markdown',
    content: 'local Source to discard',
    conflict: { server: { renderer: 'svelte', content: 'server Svelte Source' } },
  })

  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Use server version' }).click()

  await expectEditorText(source, 'server Svelte Source')
  await expect.poll(() => storedEditBuffer(page, 3)).toBeNull()
})

test('renaming a File preserves Source selection, scroll, folds, and undo', async ({ page }) => {
  await page.goto('/dashboard/edit?path=/phase-two')
  await page.waitForLoadState('networkidle')

  const source = page.getByRole('textbox', { name: 'File Source for /phase-two' })
  await page.getByRole('radio', { name: 'Markdown' }).check()
  const originalSource = await editorText(source)
  const lines = ['# Folded', 'hidden', '', '# Long section', ...Array.from({ length: 100 }, (_, index) => `line ${index + 1}`)]
  await source.fill(lines.join('\n'))
  await page.locator('[title="Fold line"]').first().click()
  await expect(page.locator('[title="Unfold line"]:visible').first()).toBeVisible()

  await source.press('Control+End')
  await source.press('Shift+Home')
  const scroller = page.locator('.cm-scroller')
  const savedScrollTop = await scroller.evaluate(element => element.scrollTop)
  expect(savedScrollTop).toBeGreaterThan(0)

  const path = page.getByRole('textbox', { name: 'Absolute File Path' })
  await path.fill('/phase-two-renamed')
  await page.getByRole('button', { name: 'Save File' }).click()
  await expect(page.getByText('Saved Success')).toBeVisible()

  const renamedSource = page.getByRole('textbox', { name: 'File Source for /phase-two-renamed' })
  await expect.poll(() => scroller.evaluate(element => element.scrollTop)).toBeGreaterThan(savedScrollTop / 2)
  await scroller.evaluate((element) => {
    element.scrollTop = 0
  })
  await expect(page.locator('[title="Unfold line"]:visible').first()).toBeVisible()
  await renamedSource.focus()
  await renamedSource.pressSequentially('renamed tail')
  await expect.poll(() => editorText(renamedSource)).toContain('line 99\nrenamed tail')
  await renamedSource.press('Meta+z')
  await expect.poll(() => editorText(renamedSource)).toContain('line 100')
  expect(await editorText(renamedSource)).not.toContain('renamed tail')
  await renamedSource.press('Meta+z')
  await expectEditorText(renamedSource, originalSource)
})

test('permanently deleting the current File selects an active fallback', async ({ page }) => {
  await page.goto('/dashboard/edit?id=2')
  await page.waitForLoadState('networkidle')

  await page.getByRole('button', { name: 'Permanently delete' }).click()
  const dialog = page.getByRole('dialog', { name: 'Permanently delete?' })
  await dialog.getByRole('button', { name: 'Permanently delete' }).click()

  await expect(page.getByRole('textbox', { name: 'File Source for /phase-two' })).toBeVisible()
  await expect(page.getByText('Permanently deleted', { exact: true })).toBeVisible()
})

test('emptying the recycle bin discards every trashed File and selects a fallback', async ({ page }) => {
  await page.goto('/dashboard/edit?id=4')
  await page.waitForLoadState('networkidle')
  page.once('dialog', dialog => dialog.accept())

  await page.getByRole('button', { name: 'Empty recycle bin' }).click()

  await expect(page.getByRole('textbox', { name: 'File Source for /phase-two' })).toBeVisible()
  await expect(page.getByText('Permanently deleted 2 File(s)', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Empty recycle bin' })).toHaveCount(0)
})

test('creating a File focuses its Path without focusing Source', async ({ page }) => {
  await page.goto('/dashboard/edit?path=/phase-two')
  await page.waitForLoadState('networkidle')

  await page.getByRole('button', { name: 'Create new file in memo' }).click()

  const path = page.getByRole('textbox', { name: 'Absolute File Path' })
  await expect(path).toBeFocused()
  await expect(path).toHaveValue(/^\/memo\//)
  await expect(page.getByRole('textbox', { name: /^File Source for \/memo\// })).not.toBeFocused()
})
