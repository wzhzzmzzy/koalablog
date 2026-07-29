# Repository-local AI workspace skill

Status: ready-for-agent
Type: task
Blocked by: 02, 03

## Goal

Finalize and validate the repository-local `koalablog-workspace` skill so AI works through the filesystem and CLI contract rather than remote APIs.

## Acceptance

- `SKILL.md` stays procedural and concise; detailed examples and recovery branches are in `references/`.
- The skill permits search, read, create/update, Attachment addition, and explicit sync while requiring current-task permission for deletion.
- A forward test exercises a search/update/sync request without leaking credentials or inventing API calls.
