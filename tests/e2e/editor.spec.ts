import { Buffer } from 'node:buffer'
import { expect, type Locator, test } from '@playwright/test'

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nJ8AAAAASUVORK5CYII=',
  'base64',
)

async function editorText(source: Locator) {
  return source.evaluate((element) => {
    if (element instanceof HTMLTextAreaElement)
      return element.value
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

test('FileEditor saves exactly once from Path and Source while preserving focus', async ({ page }) => {
  const saveRequests: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/_actions/form.save'))
      saveRequests.push(request.url())
  })

  await page.goto('/dashboard/edit?path=/phase-two')
  await page.waitForLoadState('networkidle')
  const path = page.getByRole('textbox', { name: 'Absolute File Path' })
  const source = page.getByRole('textbox', { name: 'File Source for /phase-two' })

  await path.focus()
  await page.keyboard.press('Control+s')
  await expect(page.getByText('Saved Success')).toBeVisible()
  await expect(path).toBeFocused()
  expect(saveRequests).toHaveLength(1)

  await source.focus()
  await page.keyboard.press('Meta+s')
  await expect.poll(() => saveRequests.length).toBe(2)
  await expect(source).toBeFocused()
})

test('a recycled File exposes a read-only Source editor', async ({ page }) => {
  await page.goto('/dashboard/edit?id=2')
  await page.waitForLoadState('networkidle')

  const source = page.getByRole('textbox', { name: 'File Source for /trashed' })
  await expectEditorText(source, 'Read-only Source')
  await expect(source).not.toBeEditable()
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

  await page.getByRole('button', { name: 'second', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'File Source for /second' })).toBeVisible()
  await page.getByRole('button', { name: 'phase-two', exact: true }).click()

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

test('undo during upload discards the late result', async ({ page }) => {
  let releaseUpload!: () => void
  const uploadGate = new Promise<void>((resolve) => {
    releaseUpload = resolve
  })
  await page.route('**/_actions/oss.upload', async (route) => {
    await uploadGate
    await route.continue()
  })
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
  let releaseUpload!: () => void
  const uploadGate = new Promise<void>((resolve) => {
    releaseUpload = resolve
  })
  await page.route('**/_actions/oss.upload', async (route) => {
    await uploadGate
    await route.continue()
  })
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

test('removing a placeholder discards its late upload result', async ({ page }) => {
  let releaseUpload!: () => void
  const uploadGate = new Promise<void>((resolve) => {
    releaseUpload = resolve
  })
  await page.route('**/_actions/oss.upload', async (route) => {
    await uploadGate
    await route.continue()
  })
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
