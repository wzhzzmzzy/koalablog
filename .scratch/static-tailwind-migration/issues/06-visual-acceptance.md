# 06 — Full visual acceptance and close-out

Status: ready-for-agent

## What to build

Final acceptance for the static migration. Retrieve the durable baseline archive delivered by slice 02 (manifest, calibrated thresholds, browser version, content hashes — verify them), re-capture the full page matrix post-migration under the same pinned conditions, and diff against the baseline.

Every above-threshold difference gets a verdict: explained-and-accepted (with the reason recorded) or fixed. Coverage explicitly includes the mobile viewports and the dark-theme public page. No unexplained pixel change ships.

On pass, flip ADR 0013 from `proposed` to `accepted`.

## Acceptance criteria

- [ ] Baseline archive retrieved independently; manifest, thresholds, and hashes verified before diffing
- [ ] Full matrix re-captured under the pinned conditions (desktop + mobile viewports, dark-theme coverage)
- [ ] No unexplained pixel differences remain
- [ ] Handoff acceptance criteria 1–6 all satisfied (static build free of UnoCSS integration and wrapper; visual/responsive parity incl. font semantics; no global preflight; artifact cascade contract proven with regression coverage; Worker contracts unchanged in meaning; `pnpm build:cf` + focused tests + browser checks pass)
- [ ] ADR 0013 status flipped to `accepted`; this slice's verdict log appended under `## Comments`

## Blocked by

- 05-remove-static-unocss
- Requires the durable baseline archive from 02-visual-baseline-harness
