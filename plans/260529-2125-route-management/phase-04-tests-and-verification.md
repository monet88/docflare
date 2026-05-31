---
phase: 4
title: "Tests and verification"
status: pending
effort: "1h"
dependencies: ["3"]
---

# Phase 4: Tests and verification

## Overview
Add Rust integration tests for route CRUD, frontend component tests for the route table/form, and run the full verification gates.

## Requirements
- Rust tests: route creation, duplicate rejection, invalid profile reference, update, delete, config round-trip.
- Frontend tests: table rendering, add form validation, edit flow, delete confirmation, filtering by active profile.
- All existing tests must still pass (no regression on profile onboarding).

## Related Code Files
- **Create:** `src-tauri/tests/route_crud_tests.rs`
- **Modify:** `src/features/routes/route-management-page.test.tsx`

## Implementation Steps
1. Create `src-tauri/tests/route_crud_tests.rs` — integration tests using real `ProfileConfigStore` with temp file (no FakeSecretStore needed — RouteService has no secret dependency). Test: add, duplicate rejection, update with ownership check, delete with ownership check, cascade on profile delete, max 100 limit.
2. Create `src/features/routes/route-management-page.test.tsx` — RTL tests for table, add/edit/delete, error code handling (`DuplicateHostname`, `RouteNotFound`, `InvalidHostname`, `InvalidTarget`).
3. Run `cargo fmt && cargo clippy --all-targets -- -D warnings && cargo test` (covers both `--lib` unit tests and `--test route_crud_tests` integration tests).
4. Run `npm run build && npm run test && npm run lint`.
5. Browser smoke: verify route management page loads, add route, edit, delete, form validates bad input, tab bar works.

## Success Criteria
- [ ] `cargo test` all pass (existing + new route tests).
- [ ] `cargo clippy` clean.
- [ ] `npm run test` all pass (existing + new route UI tests).
- [ ] `npm run build` and `npm run lint` clean.
- [ ] Browser: route table shows active profile's routes, add/edit/delete works, form validates bad input.
