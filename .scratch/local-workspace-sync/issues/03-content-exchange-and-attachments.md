# Content Exchange and Attachment lifecycle

Status: ready-for-agent
Type: task
Blocked by: 01, 02

## Goal

Unify Dashboard ZIP and CLI import/export around Source plus `attachments/`, and implement Attachment upload, download, delete, and rename semantics.

## Acceptance

- `.koala/`, credentials, IDs, revisions, recycle-bin history, and Artifacts never enter the exchange.
- Imports create private Files and skip/report same-path collisions without overwriting.
- Attachment mutations preserve path references exactly and never rewrite Source.
