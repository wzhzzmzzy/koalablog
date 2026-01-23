import type { APIRoute } from 'astro'
import { compile } from 'svelte/compiler'

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json() as { code: string }
    const code = body.code

    if (!code) {
      return new Response(JSON.stringify({ error: 'No code provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 在服务端使用本地安装的 svelte/compiler 进行编译
    // 这比浏览器下载整个编译器要快得多，且稳定
    const compiled = compile(code, {
      dev: false,
      discloseVersion: false,
      css: 'injected', // CSS 注入到 JS 中
      filename: 'PlaygroundComponent.svelte',
    })

    return new Response(JSON.stringify({ js: compiled.js.code }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  catch (e: any) {
    console.error('Compilation error:', e)
    return new Response(JSON.stringify({ error: e.message || 'Compilation failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
