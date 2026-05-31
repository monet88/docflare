---
phase: 1
title: "Docs and ADR"
status: complete
priority: P1
effort: "0.5d"
dependencies: []
---

# Phase 1: Docs and ADR

## Overview

Update product contract to drop Windows-only language and ship ADR `0007` recording cross-platform release decisions. No code changes; produces reviewable contract that the next phases implement against.

## Requirements

- Functional:
  - ADR `0007-cross-platform-release-pipeline.md` exists with required template sections (Context, Decision, Consequences, Status, Date).
  - `docs/product/overview.md` no longer contains "for Windows" or `Target OS: Windows 10/11 x64`.
  - `docs/product/non-functional-requirements.md` carries 4-target manifest block; PowerShell reference removed.
  - `plans/260529-1446-cf-tunnel-operational-flow/phase-03-tunnel-lifecycle.md` carries a one-paragraph note about `cfg(target_os)` gates and Tauri sidecar target convention.
  - `README.md` gets a "Releases" section + macOS Gatekeeper note + Linux Secret Service note.
- Non-functional:
  - All edited markdown passes existing markdown lint (project may not have one yet — keep markdown well-formed).
  - No broken internal links (`docs/...` and `plans/...` references stay valid).

## Architecture

Documentation only. ADR follows `docs/templates/decision.md` template. Source of truth for downstream phases is the ADR + design spec.

## Related Code Files

- Create: `docs/decisions/0007-cross-platform-release-pipeline.md`
- Modify: `docs/product/overview.md`
- Modify: `docs/product/non-functional-requirements.md`
- Modify: `plans/260529-1446-cf-tunnel-operational-flow/phase-03-tunnel-lifecycle.md`
- Modify: `README.md`

## Implementation Steps (TDD)

### Red

1. Add a markdown structure check (`scripts/test/docs.test.mjs` — Node test runner) asserting:
   - `docs/decisions/0007-*.md` exists.
   - ADR contains headings `## Status`, `## Context`, `## Decision`, `## Consequences`.
   - `docs/product/overview.md` does NOT contain regex `Target OS: Windows`.
   - `docs/product/non-functional-requirements.md` does NOT contain regex `download-sidecar\.ps1`.
   - `README.md` contains `## Releases` (or equivalent) + `xattr -cr` snippet.
2. Run `node --test scripts/test/docs.test.mjs` — must fail.

### Green

3. Read existing `docs/templates/decision.md` for structure.
4. Write ADR `0007` covering: 4-platform target, no signing, updater via GH Releases minisign, RPM dropped, Linux secret hard-require, **and repo-is-public** as a consequence of choosing the auto-updater (private repos 401/404 the updater's release-asset endpoint). <!-- Updated: Validation Session 1 -->
5. Edit `docs/product/overview.md`:
   - Title: "CF Tunnel Desktop — Cross-platform" (drop "for Windows").
   - Remove `Target OS: Windows 10/11 x64`; add macOS + Linux to In-Scope.
   - Keep historical seed reference intact.
6. Edit `docs/product/non-functional-requirements.md`:
   - Replace single `windowsX64Sha256` JSON example with 4-target manifest block.
   - Replace `download-sidecar.ps1` reference with `download-sidecar.mjs`.
   - Expand performance targets header to "Per-OS performance targets" (RSS budgets stay numeric, no per-OS variance for MVP).
7. Edit `plans/260529-1446-cf-tunnel-operational-flow/phase-03-tunnel-lifecycle.md`:
   - Add a "Cross-platform note" paragraph: `SidecarResolver` resolves via Tauri target triple, no PATH lookup; Windows-only `CREATE_NO_WINDOW` flag goes behind `#[cfg(target_os = "windows")]`.
8. Edit `README.md`:
   - Add `## Releases` section with download table (Win exe, Win portable zip, macOS Intel/Apple Silicon dmg, Linux deb, Linux AppImage).
   - Add `xattr -cr /Applications/Docflare.app` macOS Gatekeeper note.
   - Add Linux Secret Service requirement note + how to install on Ubuntu/Fedora/Arch.
9. Run `node --test scripts/test/docs.test.mjs` — must pass.

### Refactor

10. Cross-link ADR `0007` from each edited doc footer (small `> See: ADR 0007`).
11. Verify all relative paths still resolve (`grep -nE '\]\(\.\./|\]\(\./'` audit).

### Verify

12. `node --test scripts/test/docs.test.mjs` — green.
13. `git diff --stat` — only the 5 expected files touched.

## Success Criteria

- [ ] `docs/decisions/0007-cross-platform-release-pipeline.md` exists, follows template
- [ ] `docs/product/overview.md` drops Windows-only language; mentions all 3 OS in MVP scope
- [ ] `docs/product/non-functional-requirements.md` ships full 4-target manifest block; no `.ps1` reference
- [ ] Phase-03 of operational-flow plan carries `cfg(target_os)` note
- [ ] `README.md` has Releases section + Gatekeeper note + Linux Secret Service note
- [ ] `node --test scripts/test/docs.test.mjs` passes

## Risk Assessment

- **Risk:** Editing `phase-03-tunnel-lifecycle.md` risks contradicting the operational-flow plan owner's intent. **Mitigation:** add note only, no behaviour change to existing requirements list; keep "blocked" status.
- **Risk:** ADR drifts from design spec wording. **Mitigation:** ADR cites design spec explicitly; mismatch = fail review.
- **Risk:** `node --test` not yet configured. **Mitigation:** Phase 2 hardens script test infra; for Phase 1 just run the single test file directly with vanilla `node --test` (Node 20+ ships it).
