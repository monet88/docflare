# Test Matrix

This file maps product behavior to proof.

## Status Values

| Status | Meaning |
|--------|---------|
| planned | Accepted as intended behavior, not implemented |
| in_progress | Actively being built |
| implemented | Implemented and proof exists |
| changed | Contract changed after earlier implementation |
| retired | No longer part of the product contract |

## Matrix

| Story | Contract | Unit | Integration | E2E | Platform | Status | Evidence |
|-------|----------|------|-------------|-----|----------|--------|----------|
| E01 Profile Onboarding | Validate token + account + zone, store in keyring, multi-profile CRUD | yes | yes | no | no | implemented | `profile_validation_tests.rs` (5), `onboarding-form.test.tsx` (8), `client.rs` unit tests (5), `profile.rs` unit tests (3) |
| E01 Legacy Migration | Single-profile config reads as multi-profile | yes | yes | no | no | implemented | `profile_config_store.rs` unit test, `profile_validation_tests.rs::legacy_config_reads_as_single_active_profile` |
| E01 Secret Rollback | Failed config write preserves old profile + cleans candidate secret | no | yes | no | yes (unix) | implemented | `profile_validation_tests.rs::failed_replacement_preserves_previous_profile_and_removes_candidate_secret` |
| E02 Route CRUD | Add, update, delete routes per profile | yes | yes | no | no | implemented | `route_crud_tests.rs` (9), `route-management-page.test.tsx` (7), `route.rs` unit tests (12) |
| E02 Hostname Validation | RFC 1123 hostname, no scheme, ≤253 chars, labels ≤63 | yes | no | no | no | implemented | `route.rs::valid_hostnames`, `rejects_*` tests |
| E02 Target Validation | http(s):// only, non-empty host, ≤2048 chars | yes | no | no | no | implemented | `route.rs::valid_targets`, `rejects_*` tests |
| E02 Ownership Check | Routes scoped to profile; cross-profile access rejected | no | yes | no | no | implemented | `route_crud_tests.rs::update_route_with_ownership_check`, `delete_route_with_ownership_check` |
| E02 Cascade Delete | Profile deletion removes all owned routes | no | yes | no | no | implemented | `route_crud_tests.rs::cascade_delete_on_profile_removal` |
| E02 Route Limit | Max 100 routes per profile | no | yes | no | no | implemented | `route_crud_tests.rs::enforces_max_100_routes_per_profile` |
| E07 Sidecar Download | Cross-platform fetch + SHA256 verify for 4 targets | no | no | no | yes | implemented | `scripts/test/sidecar.test.mjs`, live-verified all 4 binaries |
| RELEASE-01 CI Pipeline | Lint + test + clippy + compile on 4 OS | no | no | no | yes | implemented | `.github/workflows/ci.yml`, v0.1.0-rc.1 dry-run |
| RELEASE-01 Release Build | 14 assets (8 installers + 5 .sig + latest.json) | no | no | no | yes | implemented | `.github/workflows/release.yml`, `scripts/test/release-assets.test.mjs` |
| RELEASE-01 Updater Manifest | Merged latest.json with 4 platform entries | no | no | no | no | implemented | `scripts/test/merge-updater.test.mjs` |
| E03 Cloudflare Reconciliation | Tunnel creation, ingress config, DNS CNAME | no | no | no | no | planned | none |
| E04 Tunnel Lifecycle | Spawn cloudflared, status events, retry | no | no | no | no | planned | none |
| E05 System Tray | Tray menu, close-to-tray, single-instance | no | no | no | no | planned | none |
| E06 Autostart + Restore | Boot launch, config reload, tunnel restart | no | no | no | no | planned | none |
| E08 Log Console | In-app log view, 1000 lines, secrets redacted | no | no | no | no | planned | none |

## Test Counts (current)

| Runner | Tests | Status |
|--------|-------|--------|
| Vitest (frontend) | 19 | all pass |
| cargo test (Rust unit + integration) | 38 | all pass |
| Node test runner (scripts) | 43 | all pass |
| **Total** | **100** | **all pass** |

## Evidence Rules

- Unit proof covers pure domain and application rules.
- Integration proof covers backend enforcement, data integrity, provider
  behavior, jobs, or service contracts.
- E2E proof covers user-visible browser flows.
- Platform proof covers only shell, deployment, mobile, desktop, or runtime
  behavior that cannot be proven in lower layers.
- A story can be implemented without every proof column if the story packet
  explains why.

## Gaps

- No E2E tests (Playwright/Cypress) — acceptable for MVP desktop app; revisit when tunnel lifecycle adds user-visible flows.
- No tests for `App` component tab routing logic.
- Cloudflare preflight tested only with fakes (no real HTTP integration test) — acceptable; real API tested via manual smoke.
- No performance/load tests — desktop app, single user, not needed yet.
