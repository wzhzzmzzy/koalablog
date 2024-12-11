import type { APIContext } from "astro";

export async function GET({ locals }: APIContext) {
    // the type KVNamespace comes from the @cloudflare/workers-types package
    const { KOALA } = locals.runtime.env;

    return new Response(await KOALA.get('posts'));
}