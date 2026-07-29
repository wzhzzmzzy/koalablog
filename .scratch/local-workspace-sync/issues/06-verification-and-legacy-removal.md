# Verify the new contract and remove legacy sync

Status: ready-for-agent
Type: task
Blocked by: 01, 02, 03, 04, 05

## Goal

Prove the new contract end to end, document external scheduling, then retire `sync-vault` and `remoteTruth` only after the replacement passes.

## Acceptance

- SQLite/D1 contract coverage, CLI tests, browser checks, and scheduler examples cover the PRD acceptance checks.
- Documentation gives `launchd` and `systemd` one-shot scheduling examples without adding a CLI daemon.
- The final diff has no active legacy synchronization writer or `remoteTruth` consumer.
