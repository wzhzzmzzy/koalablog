# Workflows and Examples

## Find and update a note

```text
$ koala search "sync policy" --json
{"matches":[{"path":"/notes/sync","snippet":"...sync policy..."}]}

$ $EDITOR notes/sync.md
$ koala sync --once
updated: /notes/sync
attachments: 0
rebuild_required: 0
```

Search first, modify only the requested Source, then synchronize only when the user asked for an online update. Do not add `.koala` data to frontmatter.

## Add an Attachment

```text
$ cp diagram.png attachments/sync/diagram.png
$ $EDITOR notes/sync.md
$ koala sync --once --json
{"files":{"updated":["/notes/sync"]},"attachments":{"uploaded":["/attachments/sync/diagram.png"]}}
```

Update the Source reference explicitly, for example `![](/attachments/sync/diagram.png)`. The Attachment is binary transport only; Instant Search can find the filename and its references but not image content.

## Work on Svelte Source

```text
$ koala preview widgets/counter.svelte
Preview: http://127.0.0.1:5173/

$ koala sync --once
updated: /widgets/counter
rebuild_required: /widgets/counter
```

Use the local preview only to inspect Source. Open Dashboard and run Build to attach an online Render Artifact after synchronization.

## Recover a partial cycle

```text
$ koala sync --once --json
{"files":{"updated":["/notes/sync"]},"attachments":{"failed":["/attachments/report.pdf"]}}
$ echo $?
1
```

Keep successful changes. Fix the failed path or remote connectivity, then rerun the same command. Do not roll back successful items or build a local history database.

## Handle import collisions

```text
$ koala exchange import archive.zip
created: /notes/new-note
skipped_existing: /notes/sync
```

An archive never overwrites an existing same-path File. Resolve the collision deliberately in the workspace or Dashboard before importing a renamed Source.

## Explicit deletion

Only do this after the user explicitly asks to remove the item:

```text
$ rm notes/obsolete.md
$ koala sync --once
trashed: /notes/obsolete
```

Removing an Attachment deletes its remote counterpart directly. Removing a Source sends it to the online recycle bin. Neither action rewrites other Source files.
