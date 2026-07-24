# 04 — Consolidate article routes into the catch-all

Status: done

## What to build

Merge the three prefix article routes (`/post/*`, `/memo/*`, `/memos/*`) and the shared article-reading helper into the catch-all route, which already performs the same lookup by path. Preserve current behavior exactly: private files redirect to login (the guest-login flow until issue 07 replaces it), the big-article client-rendered path still applies, and posts use the Post Display Title for the browser/SEO title per the glossary. Delete the removed routes and the helper.

## Acceptance criteria

- [ ] `/post/x`, `/memo/x`, `/memos/x`, and any other file path render identically through the catch-all
- [ ] Posts keep Post Display Title in the browser/SEO title, covered by a regression test
- [ ] No references remain to the deleted routes or the deleted helper
- [ ] Private-file redirect behavior is unchanged (still guest-login until issue 07)

## Blocked by

None — can start immediately.
