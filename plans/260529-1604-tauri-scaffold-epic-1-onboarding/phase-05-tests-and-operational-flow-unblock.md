---
phase: 5
title: "Tests and operational flow unblock"
status: pending
priority: P1
effort: "1d"
dependencies: ["phase-01-app-scaffold", "phase-02-profile-domain-and-persistence", "phase-03-cloudflare-validation", "phase-04-onboarding-ui"]
---

# Phase 5: Tests and operational flow unblock

## Context Links

- Onboarding testing strategy: `docs/superpowers/specs/2026-05-23-cloudflare-profile-onboarding-design.md:212-242`
- Onboarding acceptance/evidence: `docs/superpowers/specs/2026-05-23-cloudflare-profile-onboarding-design.md:243-260`
- Operational plan blockers: `plans/260529-1446-cf-tunnel-operational-flow/plan.md:21`, `:66-68`

## Overview

Add the minimum automated and manual verification needed to prove the onboarding slice works and to justify unblocking the operational flow plan after implementation.

## Key Insights

- This phase is evidence-oriented; blockers should change only after tests and smoke validation pass, not after code lands.
- Spec already enumerates the highest-value test matrix for this slice; do not invent broad coverage outside onboarding.
- Manual validation is still required for real keyring behavior and local config inspection.

## Requirements

- Functional:
  - Add Rust tests for success, failure, rollback, and typed error mapping.
  - Add frontend tests for field validation, loading state, success redaction, and error rendering.
  - Add one local desktop smoke path to prove Tauri boot and invoke flow.
  - Produce implementation-time evidence sufficient to update operational-flow blockers later.
- Non-functional:
  - Prefer fake Cloudflare and fake stores for automation.
  - Do not require live Cloudflare credentials in CI/unit tests.
  - Keep validation commands aligned with repo scripts.

## Architecture

```text
Frontend tests
  -> onboarding component behaviors
Rust tests
  -> ValidationService + CloudflareClient fakes + store fakes
Manual smoke
  -> npm run tauri dev
     -> submit real credentials on Windows
     -> inspect keyring + config artifacts
Blocker update
  -> only after all above evidence passes
```

Data flow checked here:
- Failed validation path leaves persistence untouched.
- Successful path writes secret + metadata and returns redacted UI payload.
- Replacement-failure path preserves prior working profile.

## Related Code Files

- Create/modify: frontend test config under repo root as needed by scaffold
- Create: `src/features/onboarding/onboarding-form.test.tsx`
- Create: `src-tauri/tests/profile_validation_tests.rs`
- Create: `src-tauri/tests/profile_persistence_tests.rs` if not colocated earlier
- Later modify after implementation verification only: `plans/260529-1446-cf-tunnel-operational-flow/plan.md` and relevant phase files to remove/blocker status text

## Implementation Steps

1. Add Rust tests covering validation failure no-write, success save, first-save rollback, replacement rollback, and redacted response.
2. Add fake Cloudflare contract cases for invalid token, account missing/forbidden, zone mismatch, DNS forbidden, tunnel forbidden, rate limit, and network failure.
3. Add frontend tests for empty fields, loading disable, success clear, password input/autocomplete off, and typed error rendering.
4. Run `cargo test --manifest-path src-tauri/Cargo.toml`.
5. Run `npm run test` or `npm test`.
6. Run `npm run build` and `npm run tauri dev` smoke check.
7. On Windows/manual pass, inspect config JSON and keyring behavior.
8. Only then update operational-flow plan blockers/status in a separate follow-up change.

## Todo List

- [ ] Add Rust service/client/store tests.
- [ ] Add frontend onboarding tests.
- [ ] Run build/test/smoke commands.
- [ ] Perform manual config/keyring validation.
- [ ] Update operational-flow blockers only after evidence exists.

## Success Criteria

- [ ] `cargo test --manifest-path src-tauri/Cargo.toml` passes.
- [ ] `npm run test` or `npm test` passes.
- [ ] `npm run build` passes.
- [ ] `npm run tauri dev` boots local desktop app.
- [ ] Failed validation stores nothing.
- [ ] Successful validation stores token only in keyring and only metadata in JSON.
- [ ] Replacement commit failure preserves old working profile.
- [ ] Operational-flow plan can be marked unblocked with verified evidence.

## Risk Assessment

- High: False confidence from unit tests without real keyring/manual checks. Mitigation: require manual Windows validation before blocker update.
- Medium: Test harness drift between npm and cargo commands. Mitigation: lock script names in Phase 1 and reference them here only.
- Medium: Premature blocker update. Mitigation: make status change a distinct step after verification artifacts.

## Security Considerations

- Test fixtures must use fake tokens only.
- Debug output from tests must avoid printing raw request headers or token-like strings.
- Manual validation notes should record presence/absence of secrets, not the secret values.

## Next Steps

- After this phase passes, operational flow Phase 1 can begin implementation against verified scaffold/onboarding contracts.
- Sidecar-dependent operational phases remain separately blocked by Epic 7 pinned `cloudflared` requirements.