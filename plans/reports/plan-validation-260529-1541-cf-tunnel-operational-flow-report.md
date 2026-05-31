# Plan Validation — CF Tunnel Operational Flow

Plan checked: `plans/260529-1446-cf-tunnel-operational-flow/`
Date: 2026-05-29
Result: **FAIL — not ready for implementation without plan edits**

## Scope Checked

- Plan file tree and markdown links.
- Required plan/phase sections from project rules.
- Alignment with product docs and acceptance criteria.
- Feasibility against current repository structure.
- Security and operational dependency risks.

## Summary

The plan is directionally strong and mostly aligned with product docs, especially one-tunnel-many-ingress, keyring-only tokens, drift consent, tray, autostart, and process isolation. It fails validation because the phase files do not match the required phase template, `plan.md` exceeds the overview limit, and the implementation assumes a Tauri/React app scaffold that does not exist in the current repo.

## Findings

### F1 — Required phase sections missing in every phase

Severity: High

Every phase currently has only these major sections: `Overview`, `Requirements`, `Architecture`, `Related Code Files`, `Implementation Steps`, `Success Criteria`, `Risk Assessment`. Required sections missing from all phase files: `Context Links`, `Key Insights`, `Todo List`, `Security Considerations`, `Next Steps`.

Evidence:

- `plans/260529-1446-cf-tunnel-operational-flow/phase-01-route-management.md:12` through `:99` shows the complete heading set ending at `Risk Assessment`.
- `plans/260529-1446-cf-tunnel-operational-flow/phase-02-cloudflare-reconciliation.md:12` through `:121` shows the complete heading set ending at `Risk Assessment`.
- `plans/260529-1446-cf-tunnel-operational-flow/phase-03-tunnel-lifecycle.md:12` through `:99` shows the complete heading set ending at `Risk Assessment`.
- `plans/260529-1446-cf-tunnel-operational-flow/phase-04-system-tray-single-instance.md:12` through `:89` shows the complete heading set ending at `Risk Assessment`.
- `plans/260529-1446-cf-tunnel-operational-flow/phase-05-autostart-restore.md:12` through `:100` shows the complete heading set ending at `Risk Assessment`.

Impact:

- Agents executing this plan will miss explicit context links, security checklist, next-step dependencies, and trackable todo state.

Recommendation:

- Add the missing sections to all phase files.
- Move current unchecked success criteria into a dedicated `Todo List` or duplicate a compact implementation checklist there.
- Add stable context links to product docs and any prior review reports.

### F2 — `plan.md` violates overview size rule

Severity: Medium

Project rules require the overview `plan.md` to stay generic and under 80 lines. Current file is 105 lines.

Evidence:

- `plans/260529-1446-cf-tunnel-operational-flow/plan.md:1` to `:105` spans 105 lines.

Impact:

- The overview carries too much detailed reference implementation material, making it harder to use as a compact access point.

Recommendation:

- Compress `plan.md` under 80 lines.
- Move the proxypal reference table and detailed dependency notes into phase files or a report link.

### F3 — Current repo has no Tauri/React implementation scaffold, but plan assumes it exists

Severity: Critical

The plan says this work builds on an already-designed onboarding slice and blocks on onboarding being implemented, but the current repository contains docs/scripts only; there is no `src-tauri/`, `src/`, `Cargo.toml`, or frontend package scaffold. Phase files list many `Modify:` targets that do not exist.

Evidence:

- `plans/260529-1446-cf-tunnel-operational-flow/plan.md:19` says this builds on the onboarding slice.
- `plans/260529-1446-cf-tunnel-operational-flow/plan.md:43` defines the inherited stack as Tauri v2 + React + TS + Vite.
- `plans/260529-1446-cf-tunnel-operational-flow/plan.md:104` says it blocks on epic 1 onboarding implemented.
- Missing assumed files include:
  - `plans/260529-1446-cf-tunnel-operational-flow/phase-01-route-management.md:73` → `src-tauri/src/config.rs`
  - `plans/260529-1446-cf-tunnel-operational-flow/phase-01-route-management.md:74` → `src-tauri/src/lib.rs`
  - `plans/260529-1446-cf-tunnel-operational-flow/phase-02-cloudflare-reconciliation.md:78` → `src-tauri/src/cloudflare_client.rs`
  - `plans/260529-1446-cf-tunnel-operational-flow/phase-03-tunnel-lifecycle.md:60` → `src-tauri/src/tunnel_manager.rs`
  - `plans/260529-1446-cf-tunnel-operational-flow/phase-04-system-tray-single-instance.md:59` → `src-tauri/src/lib.rs`
  - `plans/260529-1446-cf-tunnel-operational-flow/phase-05-autostart-restore.md:67` → `src-tauri/src/lib.rs`

Impact:

- Implementation cannot start from this plan in the current repo without first creating the app scaffold and onboarding foundation.

Recommendation:

- Mark the plan as blocked in frontmatter (`blockedBy`) or add Phase 0 for app scaffold + onboarding foundation.
- If the intended implementation repo is different, add that repo path as an explicit dependency/context link.

### F4 — Pinned sidecar is treated as both out-of-scope and assumed available

Severity: High

Phase 3 requires a bundled pinned `cloudflared` sidecar and explicitly forbids PATH lookup, but the overview marks Epic 7 sidecar as out of scope and only a soft prerequisite.

Evidence:

- `plans/260529-1446-cf-tunnel-operational-flow/plan.md:63` says not to copy system PATH lookup.
- `plans/260529-1446-cf-tunnel-operational-flow/plan.md:97` says Epic 7 pinned sidecar is out of scope and phase 3 assumes the bundled binary exists.
- `plans/260529-1446-cf-tunnel-operational-flow/plan.md:105` calls Epic 7 only a soft prerequisite for phase 3 manual runs.
- `plans/260529-1446-cf-tunnel-operational-flow/phase-03-tunnel-lifecycle.md:29` requires bundled pinned sidecar path, not system PATH lookup.
- `plans/260529-1446-cf-tunnel-operational-flow/phase-03-tunnel-lifecycle.md:55` says the binary must come from the pinned sidecar path created by epic 7.
- `plans/260529-1446-cf-tunnel-operational-flow/phase-03-tunnel-lifecycle.md:91` requires user Start to reach `connected`.

Impact:

- Phase 3 cannot meet its success criteria in production unless Epic 7 is done first.
- Treating this as soft risks either failed validation or an unsafe fallback to system PATH.

Recommendation:

- Promote Epic 7 to a hard blocker for Phase 3, or add a test-only fake process runner and make live/manual success explicitly blocked until sidecar delivery.
- Keep the no-PATH rule.

### F5 — Product timing acceptance criteria are not represented in phase success criteria

Severity: Medium

Product docs require specific operational timings, but phase success criteria focus on behavior only.

Evidence:

- `docs/product/acceptance-criteria.md:7` requires expose route Cloudflare success in < 10 seconds.
- `docs/product/acceptance-criteria.md:10` requires disable route in < 5 seconds.
- `docs/product/acceptance-criteria.md:11` requires delete route in < 5 seconds.
- Phase 2 success criteria at `plans/260529-1446-cf-tunnel-operational-flow/phase-02-cloudflare-reconciliation.md:112` to `:119` cover route behavior but not timing validation.

Impact:

- A completed implementation could pass plan criteria but fail product acceptance.

Recommendation:

- Add measurable validation bullets to Phase 2 success criteria and testing steps for expose/disable/delete timing under stable network.

### F6 — Plan claims each phase is independently shippable, but some phases depend on missing earlier work or sidecar delivery

Severity: Medium

The overview says each phase is an independently shippable vertical slice. In practice, Phase 1 depends on onboarding storage existing, Phase 3 depends on Epic 7 sidecar for live validation, and Phase 5 depends on Windows autostart validation.

Evidence:

- `plans/260529-1446-cf-tunnel-operational-flow/plan.md:23` says five phases are independently shippable vertical slices.
- `plans/260529-1446-cf-tunnel-operational-flow/plan.md:104` says the whole plan blocks on onboarding implemented.
- `plans/260529-1446-cf-tunnel-operational-flow/phase-03-tunnel-lifecycle.md:102` says manual smoke may fail before sidecar hook lands.
- `plans/260529-1446-cf-tunnel-operational-flow/phase-05-autostart-restore.md:102` depends on manual Windows validation.

Impact:

- Shippability language overstates readiness and may mislead implementation sequencing.

Recommendation:

- Reword to “independently testable where prerequisites exist” or explicitly mark phase-specific blockers.

## Passing Checks

- Relative markdown links in the plan resolve.
- Product keyword coverage is good; no major doc-only concepts missing from the plan scan.
- Security posture is strong: raw token redaction, keyring-only storage, drift consent, and process isolation appear in the relevant phases.
- Phase dependency chain is mostly coherent for operational features: route management → reconciliation → tunnel lifecycle → tray/autostart.

## Recommended Patch Order

1. Decide whether this repo should first gain a Tauri/React scaffold + onboarding implementation, or whether this plan targets a different implementation repo.
2. Add/mark the missing hard dependency for Epic 7 sidecar before Phase 3 live validation.
3. Add required phase template sections to all five phase files.
4. Shrink `plan.md` under 80 lines.
5. Add timing acceptance criteria to Phase 2.
6. Update frontmatter `blockedBy`/status to reflect actual blockers.

## Unresolved Questions

1. Is `docflare` intended to become the implementation repo, or is this plan meant for another repo with the Tauri/React scaffold already present?
2. Should Epic 7 pinned sidecar become a hard blocker before Phase 3, or should Phase 3 be limited to fake-process tests until sidecar work lands?
3. Should the validation report patch the plan files directly, or only record findings for a planner follow-up?
