# Dashboard Svelte rebuild state and local preview

Status: ready-for-agent
Type: task
Blocked by: 01, 02

## Goal

Surface synchronized Svelte Source that needs a Dashboard Build and provide an isolated local single-file preview command.

## Acceptance

- A successful Source sync/import reports `rebuild_required` without compiling or attaching an Artifact.
- Dashboard presents the required Build path using the existing client-side artifact architecture.
- `koala preview` is temporary, localhost-only, and cannot write remote state or generate a stored Artifact.
