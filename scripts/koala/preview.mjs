import { access, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

async function loadVite() {
  try {
    return await import('vite')
  }
  catch {
    throw new Error('Local Svelte Preview requires the vite package installed with Koalablog')
  }
}

async function loadSveltePlugin() {
  try {
    return await import('@sveltejs/vite-plugin-svelte')
  }
  catch {
    throw new Error('Local Svelte Preview requires @sveltejs/vite-plugin-svelte')
  }
}

/** Start a disposable localhost-only Vite server. The caller owns closing it. */
export async function startSveltePreview(sourcePath, options = {}) {
  const source = resolve(sourcePath)
  if (!source.endsWith('.svelte'))
    throw new Error('Preview source must be a .svelte file')
  await access(source)
  const previewRoot = await mkdtemp(join(tmpdir(), 'koala-preview-'))
  const html = `<!doctype html><html><body><div id="app"></div><script type="module" src="/main.js"></script></body></html>`
  const main = `import App from ${JSON.stringify(source)};\nimport { mount } from 'svelte';\nmount(App, { target: document.getElementById('app') });\n`
  await Promise.all([writeFile(join(previewRoot, 'index.html'), html), writeFile(join(previewRoot, 'main.js'), main)])
  try {
    const [{ createServer }, { svelte }] = await Promise.all([loadVite(), loadSveltePlugin()])
    const server = await createServer({
      root: previewRoot,
      configFile: false,
      appType: 'spa',
      plugins: [svelte()],
      resolve: { dedupe: ['svelte'] },
      optimizeDeps: { exclude: ['svelte'], noDiscovery: true },
      server: {
        host: '127.0.0.1',
        port: options.port ?? 5173,
        strictPort: options.strictPort ?? false,
        fs: { allow: [previewRoot, dirname(source)] },
      },
    })
    await server.listen()
    const address = server.resolvedUrls?.local?.[0] ?? 'http://127.0.0.1:5173/'
    return {
      url: address,
      source,
      async close() {
        await server.close()
        await rm(previewRoot, { recursive: true, force: true })
      },
    }
  }
  catch (error) {
    await rm(previewRoot, { recursive: true, force: true })
    throw error
  }
}
