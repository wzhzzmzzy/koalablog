# Koalablog private state contract

Read this before creating a stateful Svelte File.

## Source, Artifact, and private access

- A Svelte Source change changes its source hash and invalidates the Current Render Artifact. A missing or stale Artifact makes the page unavailable until Dashboard Build attaches a matching Artifact.
- Keep interactive state in a companion Markdown File. Saving that File does not change the Svelte Source hash or its Artifact.
- A private Page routes unauthenticated visitors to login. The logged-in owner runs trusted same-origin Svelte code and can make ordinary browser requests with the session cookie.
- The Artifact Snapshot is generated in an opaque srcdoc iframe. It has no same-origin credentials; show an initial loading shell and fetch private state only in the real mounted page.

## Existing Actions

db.markdown.byPrefix

~~~text
POST /_actions/db.markdown.byPrefix
Accept: application/json
Content-Type: application/json

{ "prefix": "/area" }
~~~

- Requires login.
- Returns owner-scoped immediate Files for the prefix, including their content, id, path, private, and revision.
- Locate the companion by exact path; do not assume the response contains only that File.

form.save

~~~text
POST /_actions/form.save
Accept: application/json
multipart/form-data

id=<positive File id>
path=/area/widget-state
renderer=markdown
content=<complete Markdown source>
private=true
baseRevision=<latest revision>
~~~

- Requires ownerGuard for the File ID.
- Updates the complete File Source and returns the saved File with incremented revision.
- A stale baseRevision returns CONFLICT with a source_conflict payload. Re-read before retrying.

Both Actions use the ordinary browser session. Never use /api/sync/* from page Source: those endpoints require a Bearer token that must remain outside Source.

## Calling Actions from a Svelte Artifact

Published Svelte Files cannot rely on `astro:actions` imports. Import the Artifact-provided runtime instead:

~~~ts
import {
  ActionError,
  isOwnerAccessError,
  readOwnedMarkdown,
  saveOwnedMarkdown,
} from '@koala/page-runtime'

const stateFile = await readOwnedMarkdown({
  path: '/area/widget-state',
  prefix: '/area',
})

const saved = await saveOwnedMarkdown(stateFile, nextMarkdown)
~~~

The virtual module is bundled into the Artifact. It makes same-origin `fetch()` calls with the existing session cookie, performs bounded devalue decoding for ordinary File records, and exposes `ActionError` with `code` and `status` for errors such as `CONFLICT` / `source_conflict`.

`readOwnedMarkdown` is the owner-facing capability check: it requires an exact active private Markdown sidecar returned by the owner-scoped Action. `isOwnerAccessError` may select a friendly UI state, but it is not the authorization boundary. The private route and `ownerGuard` remain the actual enforcement.

For reference, these are the calls encapsulated by the virtual runtime:

~~~ts
const response = await fetch('/_actions/db.markdown.byPrefix', {
  method: 'POST',
  credentials: 'same-origin',
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
  body: JSON.stringify({ prefix: '/area' }),
})
~~~

For `form.save`, the virtual runtime puts the fields in `FormData`; do not set the multipart `Content-Type` manually.

Successful Action responses use `application/json+devalue`. Their body is a flattened devalue graph, not ordinary JSON. The virtual runtime decodes only the needed subset:

- Integers reference entries in the flattened values array.
- Records have field values expressed as those references.
- Arrays contain references.
- Dates use ["Date", isoString].
- -1 is undefined.

It rejects unknown tagged values and `__proto__`; do not add a general-purpose evaluator or a second page-local decoder.

## Browser build restrictions

The Svelte compiler runs in a browser Worker and uses @rollup/browser.

- Static and literal dynamic module imports may only be built-in Svelte modules, `@koala/page-runtime`, or absolute HTTPS ESM URLs.
- Runtime fetch() is ordinary browser code and is not a Rollup dependency.
- Do not use Node imports, path.resolve, filesystem APIs, @lucide/svelte, or non-literal dynamic imports.
- For icons, use a literal dynamic HTTPS ESM import inside onMount, with simple text fallbacks.

## Sidecar Markdown subset

Use one simple canonical shape:

~~~md
# Optional list title

## Category

> Category description

- [ ] Item title https://example.com
  - [Reference](https://example.com/reference)
> Item comment
~~~

Serialise consistently: category description before items; references and then comments beneath their item. Preserve blank lines for direct editing. If arbitrary Markdown preservation is required, use a real Markdown AST and a source-range-preserving editor; do not pretend a regex serializer preserves arbitrary source.
