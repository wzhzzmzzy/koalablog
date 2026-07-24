# 01 — Decouple Source from path, migrate Pages and Wikis to Memo

Status: done

## What to build

Per ADR-0010: make Source persisted metadata that is assigned from the Path Prefix at creation only — `/post/` becomes Post, everything else becomes Memo — and is never recomputed from the File Path on save. Simplify path classification to that single two-category rule, dropping the Wiki branch and the legacy `/memos/` special case. Remove the Page, Wiki, and Unknown source categories and all of their usages. Write a data migration that remaps every existing Page or Wiki file to Memo without touching any path, so all existing URLs keep working; files already living under legacy `/memos/` paths are Memos and stay put.

## Acceptance criteria

- [ ] Saving a file never changes its Source; Source is written only at creation from the two-category prefix rule
- [ ] Page, Wiki, and Unknown source categories and their usages are gone from code
- [ ] Migration remaps all existing Page/Wiki files to Memo with paths untouched
- [ ] Migrated public files appear in the public memos list and render at their original URLs
- [ ] Migration is covered by a fixture-data test; existing file-save tests updated

## Blocked by

None — can start immediately.
