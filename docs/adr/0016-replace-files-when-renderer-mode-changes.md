---
status: accepted
---

# Replace Files when Renderer Mode changes

Changing between Markdown and Svelte is a Renderer Replacement, not an in-place Source Save: Koalablog atomically moves the active predecessor to the recycle bin and creates a new active File at the requested Path with a new identity and revision `1`. The replacement preserves the requested Source, Owner, and Visibility but inherits no Render Artifact; the recycled predecessor retains its original Source and any Artifact for recovery. Local Workspace synchronization applies the same rule to `.md`/`.svelte` replacement and removes the obsolete disk representation only after the online replacement succeeds. This supersedes ADR-0005 only where it described Renderer Mode as editable in place.
