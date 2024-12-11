interface Env {
    KOALA: KVNamespace;
}

export const onRequest: PagesFunction<Env> = async (context) => {
    const obj = await context.env.KOALA.get("posts");
    if (obj === null) {
        return new Response("Not found", { status: 404 });
    }
    return new Response(obj);
};
