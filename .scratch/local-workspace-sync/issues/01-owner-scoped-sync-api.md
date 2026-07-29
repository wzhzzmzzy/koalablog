# Owner-scoped sync API and legacy retirement

Status: ready-for-agent
Type: task

## Goal

Replace `remoteTruth` and fixed-directory batch synchronization with Bearer-authenticated owner-scoped manifest, Source, File lifecycle, and Attachment API operations.

## Acceptance

- Every endpoint authenticates with the token Owner and rejects cross-Owner access.
- The manifest provides enough metadata to avoid downloading unchanged Source or Attachment bytes.
- Local Source creation is private; saved Files retain server-owned Source and Visibility semantics.
- Removal, Source rename, and Attachment path operations follow the PRD rules.
- Remove `remoteTruth` after consumers migrate; do not retain dual synchronization writers.
