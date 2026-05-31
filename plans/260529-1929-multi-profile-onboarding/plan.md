---
title: "Multi-profile Cloudflare onboarding (lightweight)"
description: "Migrate single-profile config/service/UI to multi-profile with active selection and safe secret lifecycle."
status: completed
priority: P2
effort: 11h
branch: master
tags: [tauri, react, typescript, rust, onboarding, cloudflare]
created: 2026-05-29
---

## Scope lock
In: multi-profile storage + active profile + onboarding list/add/set-active/delete, keep current non-mutating preflight. Out: route CRUD, tunnel lifecycle, tray/autostart, sidecar, mutating Cloudflare probes.

## Verified current baseline (trace)
- Backend save/get path: command -> service -> config+secret store (`src-tauri/src/commands/profile.rs:10-26` -> `src-tauri/src/services/validation_service.rs:33-88` -> `src-tauri/src/store/profile_config_store.rs:30-54`).
- Config schema is single optional profile (`src-tauri/src/store/profile_config_store.rs:15-18`).
- IDs are masked before crossing backend boundary (`src-tauri/src/domain/profile.rs:55-81`).
- Frontend currently fetches single profile once and renders single card (`src/features/onboarding/onboarding-page.tsx:21-57`, `src/features/onboarding/saved-profile-card.tsx:7-39`).
- Existing tests already enforce “no token in config” + rollback-on-config-write-failure (`src-tauri/tests/profile_validation_tests.rs:43-68`, `:72-109`).

## Target data model + migration
- `AppConfig` move from `profile?: CloudflareProfileMetadata` to:
  - `profiles: CloudflareProfileMetadata[]`
  - `activeProfileId: string | null`
- Back-compat read strategy in store layer:
  1) Parse new shape first.
  2) If legacy `profile` exists, map to `profiles=[legacy]`, `activeProfileId=legacy.profile_id` (default stays `default` from current service behavior, `src-tauri/src/services/validation_service.rs:11`).
  3) Write back only new shape on next successful save/delete/set-active.
- Data flow: UI input(token/account/zone) -> service validation -> secret store put -> metadata-only JSON write -> masked DTO back to UI.

## Phases (sequential, no shared-file parallel edits)
1) **Phase A: Domain + store migration (3h)**
   - Files: `src-tauri/src/domain/profile.rs`, `src-tauri/src/store/profile_config_store.rs`, `src-tauri/tests/profile_validation_tests.rs`.
   - Add list response DTOs as needed (`SavedProfile` list + active id wrapper) while preserving masking invariant.
   - Implement tolerant deserialization for legacy+new config; serialize only new format.
   - Success: legacy fixture reads; write outputs only `profiles/activeProfileId`.

2) **Phase B: Validation service multi-profile semantics (3h)**
   - File: `src-tauri/src/services/validation_service.rs` (+ tests above).
   - Replace single `get_profile`/save behavior with list/get-active aware methods.
   - Save flow: preflight passes -> candidate secret put -> upsert profile by `profileId` -> set active to saved profile -> atomic config write -> delete superseded secret only after successful write.
   - Delete flow: remove profile metadata, best-effort secret delete, reselect active (`first remaining` else null).
   - Success: failed validation/config write leaves prior config+secret intact.

3) **Phase C: Command surface + invoke wiring (1h)**
   - Files: `src-tauri/src/commands/profile.rs`, `src-tauri/src/lib.rs`.
   - Add minimal commands: list/get-active, validate+save, set-active, delete.
   - Keep UiError mapping consistent with existing pattern (`src-tauri/src/commands/profile.rs:11-26`).
   - Success: frontend can perform required list/add/activate/delete only.

4) **Phase D: Frontend API + onboarding UI update (3h)**
   - Files: `src/lib/tauri/profile.ts`, `src/features/onboarding/onboarding-page.tsx`, `src/features/onboarding/onboarding-form.tsx`, `src/features/onboarding/saved-profile-card.tsx`, `src/features/onboarding/onboarding.css`, `src/features/onboarding/onboarding-types.ts`.
   - Extend `ProfileApi` to list/setActive/delete while reusing current form submit path (`src/lib/tauri/profile.ts:22-37`, `onboarding-form.tsx:45-75`).
   - Replace single card panel with saved-profile list + active badge + actions.
   - Do not render raw token/account/zone/profile ids; render masked values from backend only.
   - Success: add profile, set active, delete profile UX works without exposing secrets.

5) **Phase E: Test matrix + validation gates (1h)**
   - Backend integration: extend `src-tauri/tests/profile_validation_tests.rs` for migration, upsert overwrite rollback, delete-active reselection, failed preflight no writes.
   - Frontend tests: extend `src/features/onboarding/onboarding-form.test.tsx` for list rendering, set active, delete active/non-active, masking assertions.
   - Run gates: Rust tests + frontend tests + lint/build.

## Dependency graph
- B blocked by A (new config shape).
- C blocked by B (stable service methods).
- D blocked by C (invoke contracts).
- E blocked by A-D.

## Risks (LxI) + mitigation
- **High**: migration parse drift corrupts existing configs. Mitigate with explicit legacy fixture tests + one-way writer.
- **High**: secret orphan/deletion race on overwrite/delete failure. Mitigate with candidate ref pattern and “delete old only after commit” (current safety pattern at `validation_service.rs:76-85`).
- **Medium**: UI accidentally displays unmasked identifiers. Mitigate by returning masked DTO only (`domain/profile.rs:55-81`) + UI tests forbidding raw IDs.
- **Medium**: active profile null edge after delete. Mitigate deterministic reselection rule + tests.

## Rollback plan
- If regression in A/B: revert to prior single-profile schema+service commit; legacy file still readable by old code (`profile` field).
- If regression in D: keep backend multi-profile, temporarily show only active profile card using existing UI path.
- For partial deploy rollback, preserve user secrets: never bulk-delete keyring refs in rollback scripts.

## Measurable done criteria
- AC1-AC6 satisfied with passing tests.
- Config produced by new saves contains no raw token and uses `profiles` + `activeProfileId` only.
- Overwrite failure test proves previous profile remains usable.
- Delete-active test proves active reselection/null behavior.

## Resolution notes
- Profile identity uses generated UUID `profileKey` internally, while display uses backend-masked `profileId` plus optional `displayName`.
- Deleting all profiles is allowed and returns the onboarding UI to the empty baseline.
- Verification completed: Rust tests 18/18, frontend tests 10/10, `cargo build`, `cargo clippy --all-targets -- -D warnings`, `npm run build`, `npm run lint`, browser smoke at 127.0.0.1:5173 with 0 console errors.
