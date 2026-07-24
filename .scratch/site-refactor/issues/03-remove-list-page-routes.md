# 03 — Remove the /posts and /memos list pages

Status: ready-for-agent

## What to build

Delete the `/posts` and `/memos` list page routes so those paths resolve through the catch-all route like any other File Path: a file existing at that path renders, otherwise the request redirects to 404. No redirects are created for the old list URLs — the decided behavior is that the catch-all treats them as ordinary paths.

## Acceptance criteria

- [ ] `/posts` and `/memos` no longer serve list pages
- [ ] A file created at `/posts` or `/memos` renders through the catch-all route
- [ ] No 301/404 special-casing exists for the old list URLs
- [ ] No dead links to `/posts`/`/memos` remain in navigation, RSS, or components

## Blocked by

- 02 (the index must absorb the list functionality first)
