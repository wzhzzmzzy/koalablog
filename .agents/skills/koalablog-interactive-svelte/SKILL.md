---
name: koalablog-interactive-svelte
description: Build or revise a single-file Svelte File for Koalablog that has interactive, owner-persistent state without changing Koalablog interfaces. Use when a private Svelte page needs controls such as checklists, tabs, notes, filters, inline editing, or self-save backed by a human-editable companion Markdown File; also use when adapting such a page to the public Page Shell width or debugging its Action/Artifact lifecycle.
---

# Koalablog Interactive Svelte

Produce one Svelte Source file plus one private companion Markdown File. The Svelte File is the immutable application shell; the Markdown File is the human-editable state source.

Before implementing, read [references/platform-contract.md](references/platform-contract.md). Obey the repository AGENTS.md; when .codegraph exists, use it before tracing the code path.

## Confirm the state model

Use this skill only when these rules hold:

- The page and state file have the same owner and are both private.
- The owner may edit through the running Svelte page; non-owners cannot access either File.
- Existing db.markdown.byPrefix and form.save Actions may be reused unchanged.
- State changes must not update the page's own Svelte Source.

Use a sibling pair with extensionless online paths:

~~~text
/area/widget             Svelte application
/area/widget-state       Markdown state
~~~

If the user wants anonymous/shared editing, private state, or server persistence without the owner's session, stop: the existing Actions do not provide that contract. Do not embed a Bearer token or relax ownerGuard. If each browser may keep independent state, use localStorage instead and do not claim it is server persistence.

## Design the Markdown first

Keep the companion File ordinary Markdown. Prefer the user's native content syntax over JSON, YAML state blobs, or embedded script data.

~~~md
# List title

## Category

> Optional category description

- [x] Finished item https://example.com
  - [Reference](https://example.com/reference)
> Optional comment, hidden until the item opens
~~~

Define a deliberately small parser/serializer pair in the Svelte Source:

- ## starts a category.
- - [ ] / - [x] starts an item.
- An indented Markdown link is a reference.
- A blockquote immediately after an item is its comment; one before items is the category description.
- Preserve order and write the same format back. Treat unsupported Markdown as outside the page's editable subset rather than silently deleting it.

Use stable runtime item IDs derived from category/item position unless the Markdown format already supplies a durable identifier. Re-read the sidecar after a revision conflict; do not overwrite it blindly.

## Implement the private runtime

Do not import `astro:actions` in a user Svelte File. It is not part of the Svelte Artifact module contract. Use the built-in Artifact virtual module instead:

~~~ts
import {
  ActionError,
  callAction,
  isOwnerAccessError,
  readOwnedMarkdown,
  saveOwnedMarkdown,
} from '@koala/page-runtime'
~~~

`@koala/page-runtime` is resolved and inlined by the browser Artifact bundler. It is not a relative project file and it is not a runtime HTTPS dependency. It provides:

- `callAction(path, input)` for same-origin POST Actions using session cookies, form/JSON request bodies, bounded devalue success decoding, and normalized `ActionError` failures.
- `readOwnedMarkdown({ prefix, path })` to find exactly one active, private Markdown File owned by the current session.
- `saveOwnedMarkdown(file, content)` to save that File with its latest revision and forced private Markdown fields.
- `isOwnerAccessError(error)` only for owner-facing UI states. It is not authorization; the server remains authoritative.

The helpers intentionally reuse the existing Actions. A page should:

1. On mount, call `readOwnedMarkdown({ prefix, path })` and retain the returned id, path, private, and revision.
2. Update UI state optimistically.
3. Serialize all categories to Markdown and call `saveOwnedMarkdown(file, content)`.
4. Replace the local File baseline with the returned record, especially its new revision.

Astro Action success bodies are devalue-flattened JSON; `callAction` decodes the intentionally small File-record subset. Do not duplicate a decoder in each page and do not call the Bearer-token sync endpoints.

Queue rapid saves so a completion toggle cannot be lost while the prior request is in flight. On source_conflict, re-read the companion File, discard the stale baseline, and show a useful owner-facing message. Show load/save/error status without exposing server internals.

The Artifact Snapshot runs in an opaque preview iframe without same-origin credentials. Render a neutral loading shell there; defer private-state fetches until mounted in the actual page origin. Never make Snapshot correctness depend on an authenticated request.

## Build the compact interface

Assume the public Page Shell may constrain content to about 800px:

- Use a compact header with an overall count.
- Put categories in horizontally scrollable Tabs and display one category list at a time.
- Keep item rows short: independent status control first, title body, optional external-link action, edit action.
- Default comments/references to hidden. Clicking a row with notes expands them; rows without notes do not show an empty panel.
- Put title, link, comments, and references in an explicit inline form or dialog. Support add/remove only when the request needs them.
- Use semantic button, ol/li, tab roles, visible keyboard focus, and a reduced-motion fallback.

Use `onMount(() => import('https://…'))` for browser-loaded icon ESM when icons are needed. Do not use `@lucide/svelte`, Node builtins, filesystem APIs, non-literal dynamic imports, or `path.resolve`; the Artifact builder uses browser Rollup. `@koala/page-runtime` is the only additional bare module specifier available to user Svelte Files.

## Validate and hand off

Before delivery:

1. Run the project's Svelte compiler and resolver-policy checks on the exact single-file Source. Fix all diagnostics, including unused scoped CSS selectors.
2. Confirm the Source has no unsupported module specifier, @lucide/svelte, Node builtin, or filesystem access.
3. Verify the sidecar parses into expected category/item/reference/comment counts.
4. State that both Files must remain private, that the exact sidecar path is configurable in one constant, and that a Svelte Source update needs one Dashboard Build to attach a new Artifact.
5. Do not synchronize, attach an Artifact, or change visibility unless the user explicitly asks.

Report the two File paths, the persistence route used, conflict behavior, and verification result.
