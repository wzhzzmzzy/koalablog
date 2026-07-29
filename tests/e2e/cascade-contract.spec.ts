import path from 'node:path'
import process from 'node:process'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { MarkdownSource } from '../../src/db'
import * as schema from '../../src/db/schema'
import { calculateSourceHash } from '../../src/lib/files/source-hash'
import { calculateArtifactHashes } from '../../src/lib/svelte/artifact-hash'
import { SVELTE_TOOLCHAIN_VERSIONS, UNOCSS_CONFIG_HASH } from '../../src/lib/svelte/toolchain'
import { expect, test } from './fixture'
import { buildSvelteSourceInBrowser } from './toolchain'

// Cascade contract regression guard (slice 01 of the static UnoCSS -> Tailwind
// migration). Locks the BEHAVIOR — that the Artifact Stylesheet wins over
// statically generated utilities for a shared class name — across both eras:
//   * pre-migration  — Artifact Stylesheet wins via source order (static styles
//     inlined in <head>, artifact <link> in <body>, both layer-free, equal
//     specificity).
//   * post-migration — Artifact Stylesheet wins via cascade layers (static
//     utilities wrapped in a named @layer, artifact deliberately layer-free).
// The test asserts the computed style, not the mechanism, so it stays green.

const PROBE_PATH = '/cascade-probe'

// The probe Svelte source. Markup carries `flex` — a class the root layout body
// (src/layouts/layout.astro) also carries, so the static engine ALWAYS emits a
// `.flex` utility. The component <style> overrides that same class through an
// EQUAL-SPECIFICITY `:global(.flex)` rule. `:global(.flex)` compiles to a plain
// `.flex` selector (Svelte attaches no scope class to global selectors), so its
// specificity (0,1,0) matches the static `.flex` utility exactly — a plain
// locally-scoped class is FORBIDDEN because Svelte's scope class would inflate
// specificity and mask a broken cascade. The `:global(.flex)` override has no
// artifact-root anchor, so it intentionally trips the non-blocking
// global_style_escape diagnostic.
const CASCADE_PROBE_SOURCE = `<div class="flex" data-cascade-probe>Cascade probe</div>
<style>
  :global(.flex) { display: grid; }
</style>`

// The no-JS snapshot for the probe. The SEO Snapshot renders without JavaScript,
// so the computed-style assertion is made against the `snapshot` render state —
// it depends only on the stylesheet cascade (static Site Stylesheet in <head> +
// Artifact Stylesheet <link> in <body>), never on a successful artifact mount.
// This isolates a cascade failure from a mount/runtime failure.
const CASCADE_PROBE_SNAPSHOT = '<div class="flex" data-cascade-probe>Cascade probe</div>'

interface BuiltArtifact {
  css: string
  javascript: string
}

// Seeds the cascade-probe File + Render Artifact directly into the e2e SQLite
// database (the same .playwright/local.db the dev server reads). Self-contained
// in the spec — does not touch scripts/test/setup-editor-e2e.ts. The artifact
// CSS/JS come from the real same-origin Worker build so the public page serves
// the exact payload the toolchain produces.
async function seedCascadeProbeArtifact(build: BuiltArtifact) {
  const databasePath = path.join(process.cwd(), '.playwright', 'local.db')
  const db = drizzle({ connection: { url: `file:${databasePath}` }, schema })
  try {
    const admin = await db.query.user.findFirst({ where: eq(schema.user.username, 'admin') })
    if (!admin)
      throw new Error('e2e fixture did not seed the admin user')

    const sourceHash = await calculateSourceHash('svelte', CASCADE_PROBE_SOURCE)
    const [file] = await db.insert(schema.markdown).values({
      source: MarkdownSource.Memo,
      userId: admin.id,
      path: PROBE_PATH,
      title: 'cascade-probe',
      renderer: 'svelte',
      content: CASCADE_PROBE_SOURCE,
      sourceHash,
      tags: '',
      incoming_links: '[]',
      outgoing_links: '[]',
    }).returning()
    if (!file)
      throw new Error('Failed to insert cascade-probe File')

    const artifact = {
      schemaVersion: 1 as const,
      renderer: 'svelte' as const,
      svelteVersion: SVELTE_TOOLCHAIN_VERSIONS.svelte,
      unocssVersion: SVELTE_TOOLCHAIN_VERSIONS.unocss,
      unocssConfigHash: UNOCSS_CONFIG_HASH,
      sourceHash,
      dependencies: [],
      javascript: build.javascript,
      css: build.css,
      snapshotHtml: CASCADE_PROBE_SNAPSHOT,
    }
    const hashes = await calculateArtifactHashes(artifact)
    await db.insert(schema.markdownRender).values({ fileId: file.id, ...artifact, ...hashes })
    return file
  }
  finally {
    db.$client.close()
  }
}

test.describe.configure({ timeout: 90_000 })

test('Artifact Stylesheet wins over static utilities for the shared flex class (cascade contract)', async ({ page, browser }) => {
  // --- 1. Build the probe source through the same-origin Worker toolchain ---
  // The first Worker creation in a dev-server session can trigger one or more
  // Vite HMR full reloads (compiling the Worker entry + its toolchain
  // dependencies), which abort in-flight navigations with ERR_ABORTED — a
  // single catch-and-renavigate can itself be aborted by a follow-up reload.
  // Retry the (goto + warm-up build) pair a bounded number of times so the
  // real build below runs against a stable, warm page.
  let warmedUp = false
  for (let attempt = 0; attempt < 3 && !warmedUp; attempt++) {
    await page.goto('/dashboard/edit?path=/phase-two')
    await page.waitForLoadState('networkidle')
    try {
      await buildSvelteSourceInBrowser(page, '<div class="warmup">warmup</div>')
      warmedUp = true
    }
    catch {
      // HMR reload aborted the warm-up — retry the whole pair.
    }
  }

  const result = await buildSvelteSourceInBrowser(page, CASCADE_PROBE_SOURCE)
  expect(result.type).toBe('build-success')
  if (result.type !== 'build-success')
    throw new Error(result.error.message)

  // The unanchored :global(.flex) selector trips the non-blocking global-style
  // diagnostic. Assert it surfaces as expected rather than passing unnoticed.
  expect(result.warnings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ code: 'global_style_escape', severity: 'warning' }),
    ]),
  )

  const { css, javascript } = result

  // --- 2. Verify the built CSS carries the equal-specificity contract ---
  // Root-scoped UnoCSS utility for .flex (specificity 0,1,0 — :where() adds 0).
  expect(css).toMatch(/:where\(\[data-koala-artifact-root\]\)\s*\.flex\b/)
  // Plain .flex override carrying display:grid (equal specificity 0,1,0).
  const overridePattern = /\.flex\s*\{[^}]*display:\s*grid/
  expect(css).toMatch(overridePattern)
  // Svelte must NOT have attached a scope class to the override — that would
  // inflate specificity (.flex.svelte-xxx = 0,2,0) and mask a broken cascade.
  expect(css).not.toMatch(/\.flex\.svelte-/)
  // Source order: generateUnoCss joins generated UnoCSS before the transformed
  // component CSS, so the utility precedes the override within the artifact.
  const utilityMatch = css.match(/:where\(\[data-koala-artifact-root\]\)\s*\.flex/)
  const overrideMatch = css.match(overridePattern)
  expect(utilityMatch?.index).toBeGreaterThanOrEqual(0)
  expect(overrideMatch?.index).toBeGreaterThanOrEqual(0)
  expect(utilityMatch!.index!).toBeLessThan(overrideMatch!.index!)

  // --- 3. Seed the built artifact so the public page serves the real payload ---
  await seedCascadeProbeArtifact({ css, javascript })

  // --- 4. Visit the public page WITHOUT JavaScript (snapshot render state) ---
  const noJavascript = await browser.newContext({ javaScriptEnabled: false })
  const staticPage = await noJavascript.newPage()
  try {
    const response = await staticPage.goto(PROBE_PATH, { waitUntil: 'load' })
    // Distinguish "page did not load / 404" from a cascade failure.
    expect(response?.status(), 'cascade-probe public page should respond 200, got a non-200 so the computed-style assertion cannot run').toBe(200)

    const root = staticPage.locator('[data-koala-artifact-root]')
    await expect(root, 'artifact root must be present in the DOM — a 503/artifact-unavailable response means the fixture did not seed correctly').toBeVisible()
    // Assert the snapshot render state explicitly. The computed-style check
    // depends on the stylesheet cascade only, not on a successful JS mount.
    await expect(root).toHaveAttribute('data-koala-render-state', 'snapshot')

    const probe = root.locator('[data-cascade-probe]')
    await expect(probe, 'cascade probe element must be present in the snapshot — if missing the fixture snapshotHtml is wrong').toBeVisible()
    await expect(probe).toContainText('Cascade probe')

    // The core cascade contract: the Artifact Stylesheet's `.flex { display: grid }`
    // (equal specificity, later source order pre-migration / layer-free
    // post-migration) must beat the static `.flex { display: flex }` utility.
    const display = await probe.evaluate(el => getComputedStyle(el).display)
    expect(
      display,
      'static utility beat the Artifact Stylesheet — cascade contract broken (expected grid, the Artifact Stylesheet override did not win)',
    ).toBe('grid')
  }
  finally {
    await noJavascript.close()
  }
})

// CSSOM probe (slice 04) — asserts the Site Stylesheet's statically generated
// utilities now live inside a named `utilities` cascade layer, the layering
// half of the cascade contract. Resilient to dev-vs-build inlining differences:
// it walks document.styleSheets, finds the `utilities` CSSLayerBlockRule, and
// asserts it carries at least one rule (does not hard-code a count). The
// pre-migration (layer-free) and post-migration (layered) mechanic both
// satisfy the computed-style test above; this probe pins the post-migration
// mechanism specifically, so slice 05's removal can rely on it.
test('Site Stylesheet utilities are wrapped in a named `utilities` cascade layer (CSSOM probe)', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' })

  const layerInfo = await page.evaluate(() => {
    const sheets = Array.from(document.styleSheets)
    const layers: Array<{ name: string, ruleCount: number, sampleSelector: string | null }> = []
    for (const sheet of sheets) {
      let rules: CSSRuleList
      try {
        rules = sheet.cssRules
      }
      catch {
        // Cross-origin stylesheet without CORS-accessible rules — skip.
        continue
      }
      const walk = (ruleList: CSSRuleList) => {
        for (const rule of Array.from(ruleList)) {
          if (rule instanceof CSSLayerBlockRule) {
            const inner = Array.from(rule.cssRules)
            const sample = inner.find(r => r instanceof CSSStyleRule)?.cssText?.split('{')[0]?.trim() ?? null
            layers.push({
              name: rule.name,
              ruleCount: inner.length,
              sampleSelector: sample,
            })
          }
          if (rule instanceof CSSMediaRule) {
            walk(rule.cssRules)
          }
        }
      }
      walk(rules)
    }
    return layers
  })

  const utilitiesLayer = layerInfo.find(l => l.name === 'utilities')
  expect(
    utilitiesLayer,
    'no CSSLayerBlockRule named `utilities` found in any stylesheet — site.css is not generating layered utilities (was the dashboardTailwindPlugins gate widened to let site.css through?)',
  ).toBeDefined()
  expect(
    utilitiesLayer!.ruleCount,
    '`utilities` layer exists but contains zero rules — Tailwind generated no utilities from the site.css @source scan',
  ).toBeGreaterThan(0)
})
