# 02 — Parameterize the index lists

Status: ready-for-agent

## What to build

The index page renders the posts list by default and switches to the memos list through query parameters: `?s=post|memo` selects the list, `?y=<year>` restricts it to one year, `?tag=<tag>` filters by tag, and all three compose. The existing "..." link beside each year header (already pointing at `/?s=memo&y=<year>`) starts working, and the memos view gains a symmetric link back to the posts list. Tag filtering previously served by the /posts and /memos pages moves onto the index. Visibility filtering stays as-is for now (public-only for visitors, private included when logged in); issue 08 replaces it with owner semantics.

## Acceptance criteria

- [ ] `/` shows posts grouped by year; `/?s=memo` shows memos; `?y=YYYY` restricts either list to that year; `?tag=t` composes with both
- [ ] The "..." link per year and a back-to-posts link in the memos view both work
- [ ] Missing/unknown parameters fall back to the default posts view
- [ ] Tag-filtered URLs formerly served by /posts and /memos behave identically on the index

## Blocked by

None — can start immediately.
