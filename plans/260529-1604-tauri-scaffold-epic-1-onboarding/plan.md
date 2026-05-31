---
title: "Tauri scaffold + Epic 1 onboarding unblock"
description: "Plan to add the desktop app scaffold and Cloudflare profile onboarding foundation that unblocks the operational flow plan."
status: pending
priority: P1
effort: 5d
branch: master
tags: [tauri, react, typescript, vite, cloudflare, onboarding]
created: 2026-05-29
---

# Tauri scaffold + Epic 1 onboarding unblock

## Overview

Current repo has product docs and plans but no app scaffold files; operational flow stays blocked until scaffold + Epic 1 exist (`plans/260529-1446-cf-tunnel-operational-flow/plan.md:21`, `:66-68`). Epic 1 scope is the onboarding slice: validate token/account/zone/permissions, store token only in keyring, persist only metadata, and never return raw token after submit (`docs/superpowers/specs/2026-05-23-cloudflare-profile-onboarding-design.md:12-18`, `:127-139`, `:176-193`).

## Locked implementation targets

- Stack: Tauri v2 + Rust backend + React + TypeScript + Vite (`plans/260529-1446-cf-tunnel-operational-flow/plan.md:32-35`).
- One profile in MVP UI, but keep stable `profileId` in storage (`docs/superpowers/specs/2026-05-23-cloudflare-profile-onboarding-design.md:20`, `:95-123`).
- Zero plain-text secrets in config; token only in keyring/keychain backend (`docs/product/security-and-secrets.md:3-10`).
- Config writes must be atomic; replacement must preserve prior working profile on commit failure (`docs/superpowers/specs/2026-05-23-cloudflare-profile-onboarding-design.md:195-210`).
- Onboarding preflight is non-mutating; route/tunnel writes stay out of scope (`docs/superpowers/specs/2026-05-23-cloudflare-profile-onboarding-design.md:139-161`).

## Phases

| Phase | File | Goal | Depends on |
|---|---|---|---|
| 1 | `phase-01-app-scaffold.md` | Create minimal desktop scaffold and toolchain contracts | none |
| 2 | `phase-02-profile-domain-and-persistence.md` | Add profile model, config store, secret store, save/rollback protocol | 1 |
| 3 | `phase-03-cloudflare-validation.md` | Add Cloudflare client, typed errors, validation service | 2 |
| 4 | `phase-04-onboarding-ui.md` | Add onboarding form and redacted saved-profile UX | 1, 2, 3 |
| 5 | `phase-05-tests-and-operational-flow-unblock.md` | Add tests, smoke validation, and unblock evidence | 1, 2, 3, 4 |

## Dependency graph

```text
1 scaffold
-> 2 persistence contracts
-> 3 Cloudflare validation service
-> 4 onboarding UI
-> 5 tests + smoke run + unblock evidence
```

No parallel implementation across phases that touch the same files; `src-tauri/src/lib.rs`, shared types, and package scripts stay single-owner by sequence.

## Repo impact

Implementation creates app roots now missing from repo: `package.json`, `src/`, `src-tauri/`, `Cargo.toml` [verified absent by `rg` search, 0 matches, 2026-05-29]. Existing docs/plans stay unchanged during implementation except later blocker-status update after verification.

## Backwards compatibility + rollback

- Empty-repo bootstrap: Phase 1 is additive.
- Config schema: default missing config to no profile; future reads must tolerate missing optional fields.
- Replacement safety: keep old secret/config active until new config commit succeeds.
- Rollback: revert scaffold files; delete temp config candidates; keep last known-good metadata/secret ref.

## Validation commands after implementation

- `npm install`
- `npm run tauri dev`
- `npm run test` or `npm test`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `npm run build`

## Done when

- Local Tauri app boots.
- `validate_and_save_profile` path satisfies success/failure/rollback contract.
- UI clears token after success and never receives it again.
- Rust + frontend tests pass.
- Operational-flow blockers can be updated with evidence, not assumption.
