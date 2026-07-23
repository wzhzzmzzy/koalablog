import { expect, test } from '@playwright/test'

test('mobile toolbar keeps every File control fully reachable', async ({ page }) => {
  await page.goto('/dashboard/edit?path=/phase-two')
  await page.waitForLoadState('networkidle')

  for (const viewport of [{ width: 393, height: 727 }, { width: 320, height: 640 }]) {
    await page.setViewportSize(viewport)
    const path = page.getByRole('textbox', { name: 'Absolute File Path' })
    await expect(path).toBeInViewport({ ratio: 1 })
    expect((await path.boundingBox())?.width).toBeGreaterThan(viewport.width / 2)
    const markdown = page.getByRole('radio', { name: 'Markdown' })
    const svelte = page.getByRole('radio', { name: 'Svelte' })
    await expect(markdown.locator('..')).toBeInViewport({ ratio: 1 })
    await expect(svelte.locator('..')).toBeInViewport({ ratio: 1 })
    await svelte.check()
    await expect(svelte).toBeChecked()
    await markdown.check()
    await expect(markdown).toBeChecked()
    for (const name of ['Make private', 'Save File', 'Upload image', 'Preview File', 'Move to recycle bin', 'Copy File link'])
      await expect(page.getByRole('button', { name })).toBeInViewport({ ratio: 1 })
  }
})

test('touch scrolling stays inside the Source editor on a narrow screen', async ({ page }) => {
  await page.goto('/dashboard/edit?path=/phase-two')
  await page.waitForLoadState('networkidle')

  const source = page.getByRole('textbox', { name: 'File Source for /phase-two' })
  const scroller = page.locator('.cm-scroller')
  const longSource = Array.from({ length: 100 }, (_, index) => `line ${index + 1}`).join('\n')
  await source.fill(longSource)
  await scroller.evaluate((element) => {
    element.scrollTop = 0
  })

  const box = await scroller.boundingBox()
  if (!box)
    throw new Error('File Source has no bounding box')
  const client = await page.context().newCDPSession(page)
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await client.send('Input.synthesizeScrollGesture', {
    x,
    y,
    yDistance: -400,
    gestureSourceType: 'touch',
    speed: 800,
  })
  await client.detach()

  await expect.poll(() => scroller.evaluate(element => element.scrollTop)).toBeGreaterThan(0)
  await expect(page.locator('.cm-gutters')).toBeHidden()
})
