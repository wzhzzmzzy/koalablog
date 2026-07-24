# 08 — Enforce file ownership

Status: ready-for-agent

## What to build

Implement ADR-0012 visibility semantics. Every file creation stamps the current User as Owner; saving never reassigns ownership. Index and list queries show public files plus the current user's own private files (`public OR owner = current user`), for every visitor including the Admin. Article routes serve private files only to their Owner. Dashboard file lists and trash views are scoped to the current user. File mutations — save, trash, restore, visibility toggle — are restricted server-side to the Owner. Site-level sync/batch APIs (batch import, remote-truth) stay Admin-only.

## Acceptance criteria

- [ ] New files are stamped with the creating user; ownership never changes implicitly
- [ ] Visitors see public files only; no list, search, or direct URL leaks another user's private file
- [ ] Server rejects save/trash/restore/visibility changes on files the current user does not own (tested)
- [ ] Dashboard lists and trash show only the current user's files
- [ ] Batch and remote-truth APIs remain Admin-only

## Blocked by

- 06 (requires the current user's id in every request context)
