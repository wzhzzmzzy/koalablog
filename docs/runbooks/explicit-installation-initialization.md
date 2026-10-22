# Initialize an existing installation explicitly

HTTP middleware no longer initializes the Template Catalog or migrates legacy Users. This includes the first request in a new Worker isolate: GET, HEAD, and read-only Action requests do not perform these installation writes. New sites still use onboarding, which initializes the Catalog before marking the site ready.

Existing installations that already have a Template Catalog and Users need no data changes. For an older installation, apply its required schema migrations and run the explicit initializer during a maintenance window **before serving the new release**. Stop concurrent initialization/administration while upgrading and keep a database/KV backup. Do not use `db:clean`, `sqlite:init`, or onboarding to upgrade an existing site; those development/reset workflows are not data-preserving migration commands.

The initializer creates only an absent default Catalog, preserves an existing or intentionally empty Catalog, and invokes the existing legacy first-User migration. It does not deploy the application, apply schema migrations, reset Files, rehash Source, change File revisions, or publish Render Artifacts. Legacy Files without an Owner are assigned by the existing User migration. Fresh/unready sites are rejected and must use onboarding; a ready site without any User or a legacy admin key reports an error rather than pretending initialization succeeded. Existing migration failures must be investigated before retrying; the legacy multi-step User migration is not made transactional by this command.

## SQLite

Select both the existing database and its configuration explicitly. The command does not infer a default installation or load `.env` for these paths:

```sh
SQLITE_URL=file:/absolute/path/to/existing.db \
KOALA_CONFIG_PATH=/absolute/path/to/koala.config.json \
pnpm run installation:initialize --sqlite
```

The two paths must name the same installation. Do not replace an existing configuration with an empty file. Check that the command exits successfully, the original login/API Token works, and the Catalog and Files remain intact before starting the updated server.

## Cloudflare D1 and KV

Use a dedicated Wrangler configuration selecting the intended `DB` and `KOALA` bindings. Apply the appropriate D1 schema migrations first. The command uses Wrangler's binding proxy from a local Node process, not a public administrative HTTP endpoint.

For local emulated bindings:

```sh
pnpm run installation:initialize --d1 --config /absolute/path/to/wrangler.toml
```

Remote bindings are disabled unless `--remote` is supplied. For a remote installation, explicitly mark **both** the D1 and KV bindings `remote = true` in the dedicated configuration, authenticate Wrangler with access to those resources, and use:

```toml
compatibility_date = "2025-04-01"

[[d1_databases]]
binding = "DB"
database_name = "YOUR_DATABASE_NAME"
database_id = "YOUR_DATABASE_ID"
remote = true

[[kv_namespaces]]
binding = "KOALA"
id = "YOUR_KV_NAMESPACE_ID"
remote = true
```

```sh
pnpm run installation:initialize --d1 --config /absolute/path/to/upgrade.toml --remote
```

`--remote` enables configured remote bindings; it does not convert unmarked bindings to remote resources. Verify both resource IDs and both flags before running, and never mix a remote DB with a local KV or vice versa. Credentials stay in Wrangler/environment configuration, not in source control. Confirm the resulting Users and Catalog against the same remote resources before deploying. No remote initialization or deployment is performed as part of the test suite.

## Authentication and write safety

Authentication lookups are reused only within the same Request and environment. Bearer verification and Session lookup remain separate: an API-only guard never accepts a cached Cookie identity after a missing or invalid API Token. A new Request revalidates credentials, so revocation is not hidden by a process-wide user/token cache. Owner restrictions, same-origin Cookie checks, and File revision CAS are unchanged.

Warm authorized File GETs now need one API Token lookup, one User lookup, and one File lookup instead of two Token/User pairs. A fresh isolate uses the same three D1 reads; it no longer adds a Template Catalog UPSERT and user-count query. Site configuration KV reads remain unchanged in this patch.
