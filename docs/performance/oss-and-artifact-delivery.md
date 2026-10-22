# OSS access and Artifact delivery

## OSS boundaries

The legacy `/api/oss/<source>_<key>` download route serves only the established public namespaces: `article`, `post`, `page`, `oss`, and `attachments`. Nested paths and underscores remain supported. Unknown namespaces and traversal segments return an uncached `404` before object lookup or quota accounting, including for an Admin. Owner Attachments under `sync-attachments/<userId>/` are accessible only through the existing Owner-scoped sync routes; a global OSS URL is not an alternate access path. Legacy HEAD remains Admin-only and observes the same namespace restriction. The global OSS Dashboard checks the Admin role before listing keys or reserving operation quota, matching its existing Admin-only Actions.

The daily read and operation budgets use one conditional UPSERT with RETURNING per admitted or exhausted attempt, rather than row initialization, UPDATE and fallback SELECT. Exactly `floor(limit)` attempts may acquire a slot; zero disables access. The absence of a returned row means denial, not a stale count to compare against a different limit. Read and operation budgets are independent; raising a limit permits remaining slots, and lowering it does not erase usage. Legacy downloads and Admin list/upload operations keep their existing budget scopes. Authentication precedes Admin operation accounting. Missing objects still consume an admitted read attempt. These counters are not a comprehensive R2 billing meter or a new quota on Owner sync routes.

Existing daily counters are not rewritten, including earlier undercounting. The next day starts a fresh row as before. This fix intentionally makes previously ineffective configured limits enforceable.

Downloads map R2 metadata names to standard HTTP headers, preserve actual object ETags, and never fabricate a validator from the key. Workers use manual body encoding so stored compressed bytes are not compressed twice. Owner responses override stored public cache metadata with `private, no-store`, without ETags or Expires. R2 response bodies are streamed directly. Owner PUT passes the original request body to R2 without `arrayBuffer()`, preserving its known-length stream, and reports size from the storage receipt. A missing receipt is not reported as success.

The existing SQLite adapter still buffers binary data for its base64 database representation; accepting streams does not turn that local backend into streaming storage. Its returned ArrayBuffer now contains exactly the decoded object bytes, not the underlying pooled Buffer allocation. HEAD and list select metadata only, and PUT uses an UPSERT instead of reading an existing body first. Existing on-disk data remains compatible. Multipart Admin uploads and ZIP exchange are unchanged; this batch does not introduce multipart parsing infrastructure, range delivery, or whole-workspace streaming.

## Svelte delivery boundaries

The resource access query joins only File access/lifecycle metadata and Artifact hashes. Public JavaScript/CSS requests compare If-None-Match after this current authorization check. A matching validator returns `304` after one metadata query, with no Source, dependency JSON, JavaScript, CSS or Snapshot read or JavaScript serialization.

A cache miss reads only the requested JavaScript or CSS column. Page delivery reads only the Snapshot rather than both browser resources. The second query rechecks lifecycle, Owner access, visibility and the reviewed Artifact Hash, so a concurrent privacy change, replacement, trash or purge cannot pair new bytes with an old validator or public cache policy. If that checked representation is gone, the request fails closed without an ETag. Private resources retain their existing `200`, `private, no-store` behavior and never return `304`.

Source Save and Artifact deployment CAS are unchanged. Deployment Drift still serves the last explicitly deployed Artifact, not the newer saved Source. URL shape, serialization and representation hashes remain unchanged; Source Hash URLs are not promoted to immutable caching. There is still one stored Artifact and no old-resource retention window.

## Validation and rollout

No schema or data migration, new binding, framework or production service is required. The extra R2 binding in Vitest configuration is test-only. Deploy this code through the ordinary release process; do not run a data migration for it.

```sh
KOALA_PREVIEW_INTEGRATION=1 pnpm exec vitest run
pnpm run test:d1
pnpm exec playwright test
pnpm run build:cf
```

Regressions cover namespace isolation, real Session/Bearer and CSRF checks, exact concurrent quota boundaries on SQLite and D1, delayed stream consumption, workerd/R2 round trips, storage-confirmed uploads, header mapping, per-representation SQL projections, conditional responses and concurrent visibility/Artifact changes. Existing Source and deployment CAS suites remain enabled. These are local correctness and query-shape checks, not production CPU or memory benchmarks.

R2 stream and metadata behavior follows the [Workers API reference](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/); body encoding follows the [Workers Response reference](https://developers.cloudflare.com/workers/runtime-apis/response/) (checked 2026-10-22).
