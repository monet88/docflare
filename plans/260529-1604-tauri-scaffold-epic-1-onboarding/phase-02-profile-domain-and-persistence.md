---
phase: 2
title: "Profile domain and persistence"
status: pending
priority: P1
effort: "1d"
dependencies: ["phase-01-app-scaffold"]
---

# Phase 2: Profile domain and persistence

## Context Links

- Product data model: `docs/product/data-models-and-routes.md:5-13`
- Product secret rules: `docs/product/security-and-secrets.md:3-10`
- Onboarding backend boundaries: `docs/superpowers/specs/2026-05-23-cloudflare-profile-onboarding-design.md:70-92`
- Commit protocol: `docs/superpowers/specs/2026-05-23-cloudflare-profile-onboarding-design.md:195-210`

## Overview

Implement the onboarding domain model and persistence boundaries: profile metadata, config store, secret store trait, keyring-backed production store, fake test stores, and atomic commit/rollback behavior.

## Key Insights

- Spec already fixes the core boundaries: `ProfileCommand`, `ValidationService`, `CloudflareClient`, `ProfileConfigStore`, `SecretStore` (`docs/superpowers/specs/2026-05-23-cloudflare-profile-onboarding-design.md:72-89`).
- Only one profile is exposed in MVP UI, but persistence must keep stable `profileId` so later multi-profile support does not reshape files (`docs/superpowers/specs/2026-05-23-cloudflare-profile-onboarding-design.md:20`, `:95-123`).
- Replacement failure semantics matter more than first-save semantics because operational phases depend on not losing a working profile.

## Requirements

- Functional:
  - Define `CloudflareProfileMetadata`, `SavedProfile`, `ValidateAndSaveProfileInput`.
  - Add `ProfileConfigStore` for read/write of non-secret JSON metadata only.
  - Add `SecretStore` trait plus `KeyringSecretStore` and fake/in-memory test implementation.
  - Implement atomic config write with temp file + same-directory replace and Windows retry policy.
  - Implement candidate-secret commit protocol so failed config write stores nothing new and preserves old working profile.
- Non-functional:
  - No plain-text token in JSON at rest.
  - No parallel config stores or secret clients.
  - Config schema must tolerate missing file / empty bootstrap state.

## Architecture

```text
validate_and_save_profile(input)
  -> ValidationService
     -> SecretStore.put(candidateRef, rawToken)
     -> ProfileConfigStore.write(candidateMetadata)
        -> temp file in same directory
        -> atomic replace with retry on Windows lock
     -> SecretStore.delete(oldRef) after commit only
```

Data flow:
- Input enters Rust as raw token + account/zone IDs.
- Candidate secret ref generated in service layer.
- Secret written first to candidate ref.
- Config writes only metadata with secret ref.
- Output back to UI is redacted `SavedProfile` only.

## Related Code Files

- Create: `src-tauri/src/domain/profile.rs`
- Create: `src-tauri/src/error.rs`
- Create: `src-tauri/src/services/validation_service.rs`
- Create: `src-tauri/src/store/profile_config_store.rs`
- Create: `src-tauri/src/store/secret_store.rs`
- Create: `src-tauri/src/store/keyring_secret_store.rs`
- Create: `src-tauri/src/store/fake_secret_store.rs`
- Create: `src-tauri/src/commands/profile.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`
- Create: `src/lib/tauri/profile.ts`
- Create tests: `src-tauri/tests/profile_persistence_tests.rs` or unit tests beside service/store modules

## Implementation Steps

1. Define Rust domain structs and serde contracts for input, persisted metadata, and UI-safe saved profile.
2. Add typed error enum covering secret/config failures and UI-safe validation failures.
3. Implement `SecretStore` trait and production keyring adapter.
4. Implement `ProfileConfigStore` with bootstrap read, JSON serialization, temp-file write, same-dir replace, and retry wrapper.
5. Implement `ValidationService` commit/rollback path without Cloudflare validation yet; injectable fake validator can stand in until Phase 3.
6. Add Tauri commands `get_profile` and internal command wiring for later `validate_and_save_profile`.
7. Add tests for first save, failed config write cleanup, replacement rollback, and redacted response shape.

## Todo List

- [ ] Define profile and response types.
- [ ] Add config store with atomic write.
- [ ] Add secret store trait + keyring implementation.
- [ ] Add candidate-secret commit protocol.
- [ ] Add persistence/rollback tests.

## Success Criteria

- [ ] Metadata JSON stores `profileId`, `accountId`, `zoneId`, `tokenSecretRef`, `lastValidatedAt` only.
- [ ] Raw token is never returned in `SavedProfile`.
- [ ] Failed first save leaves no config and no secret.
- [ ] Failed replacement preserves previous config + previous secret.
- [ ] Production store boundary is single-source for token persistence.

## Risk Assessment

- High: Non-atomic config writes can corrupt profile state. Mitigation: temp write + same-directory replace + retry coverage tests.
- High: Secret/config ordering bug can orphan or lose working credentials. Mitigation: explicit candidate-secret protocol and failure injection tests.
- Medium: Keyring crate behavior differs across OS/backends. Mitigation: isolate behind trait; automate with fake store and reserve real backend check for manual validation.

## Security Considerations

- SecretStore logs must redact refs if they could reveal sensitive naming patterns; never log raw token.
- UI-facing errors must not expose filesystem paths or backend stack traces.
- Temporary config files must live next to target file for atomicity and be cleaned on failure.

## Next Steps

- Phase 3 plugs real Cloudflare validation into `ValidationService`.
- Phase 4 consumes only `SavedProfile` and never reads secret refs directly.