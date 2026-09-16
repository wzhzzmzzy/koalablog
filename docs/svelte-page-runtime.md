# Markdown state for Svelte Files

Svelte Files import the Artifact virtual module `@koala/page-runtime`. Its helpers use the existing same-origin Actions and session cookies. They never embed an API token. Rebuild and deploy a Svelte File after changing its Source or adopting a new version of the inlined runtime.

## Read scopes

`db.markdown.byPrefix` accepts `{ prefix, scope?: 'owned' | 'public' }`. Both scopes return only immediate Files beneath the normalized Path Prefix, with literal path-segment matching.

- `owned` is the default. It requires login and preserves the Editor's existing Owner-scoped behavior. A File owned by the current user can be public or private.
- `public` permits anonymous reads. Its database query always requires `private = false` and `deletedAt IS NULL`, including when the visitor is logged in. Public responses clear `incoming_links` (which may originate in private Files) and `userId`, and add `canEdit`, true only for the authenticated File Owner.

Public results contain Source content. Use public visibility only for Files whose content is intended to be readable by every visitor. Public is a read scope, not a write permission.

## Runtime helpers

```js
import { readMarkdown, readOwnedMarkdown, saveOwnedMarkdown } from '@koala/page-runtime'

const file = await readMarkdown({
  prefix: '/data',
  path: '/data/desk-cable-planner-state',
  scope: 'public',
})

if (file.canEdit) {
  const saved = await saveOwnedMarkdown(file, nextMarkdown)
  // Retain saved as the new baseline, especially its revision.
}
```

`readMarkdown` defaults to `owned` if scope is omitted. It selects the exact active Markdown File at `path`; missing, deleted, or non-Markdown companions are `CompanionFileError`s. A public read also verifies that the returned File is public. Private state is not automatically exposed when a Svelte application becomes public.

`readOwnedMarkdown({ prefix, path })` remains supported and always uses the authenticated `owned` scope. It accepts owned public and private Markdown, and returns `canEdit: true`. Its ownership guarantee comes from the server Action; `private` is not used as a substitute for ownership.

`saveOwnedMarkdown(file, content)` preserves `file.private`, submits its latest revision, and adopts the canonical response. It rejects known read-only records locally. The server's unchanged `ownerGuard` is the actual authorization boundary, even if a caller changes `canEdit` in browser memory. Public visibility never grants anonymous or other-user writes. A successful Save returns `canEdit: true`.

The existing `ActionError`, `callAction`, and `isOwnerAccessError` exports remain available. The latter only recognizes explicit `UNAUTHORIZED` responses. Missing companions are not described as login failures.

## Public interactive pages

- Set both the Svelte application and shared Markdown state to public explicitly. Importing a Content Exchange ZIP still creates private Files; the ZIP cannot change visibility or overwrite an existing File.
- All visitors can manipulate the model locally. Only users receiving `canEdit: true` should initiate shared-state saves. Other visitors' changes can stay in component memory; these are not server persistence.
- Queue owner saves and update the revision baseline after every successful response. On `CONFLICT`, re-read the File and explain that stale local changes were discarded.
- If a session expires or saving is no longer authorized, stop auto-saving and keep the viewer interactive, with an explanation that adjustments are local.
- Preserve the neutral initial shell for opaque-origin Artifact Snapshots; public-page reads start on the real page origin.

The existing private interactive-page skill remains a private-workflow guide. This public read scope is an explicit extension of that earlier contract.
