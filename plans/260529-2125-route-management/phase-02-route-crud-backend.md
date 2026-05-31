---
phase: 2
title: "Route CRUD backend"
status: pending
effort: "2h"
dependencies: ["1"]
---

# Phase 2: Route CRUD backend

## Overview
Add a `RouteService` that validates and persists routes through `ProfileConfigStore`, plus Tauri commands that expose list/add/update/delete to the frontend.

## Requirements

**Functional:**
- List all routes, optionally filtered by `profile_id`.
- Add a route: validate hostname/target/profile, reject duplicate hostname per profile.
- Update a route: find by id, apply new hostname/target, validate.
- Delete a route: find by id, remove from config.
- Commands: `get_routes`, `add_route`, `update_route`, `delete_route`.

**Non-functional:**
- Mutations use the same mutex lock as profile operations (serialized writes).
- Invalid profile reference → error before touching disk.
- Duplicate hostname → clear error message.

## Architecture
```
commands/route.rs (Tauri commands)
  → services/route_service.rs (validation + config read/write)
  → store/profile_config_store.rs (existing atomic write)
```

Route service reuses `ProfileConfigStore`. Mutex guard is extracted into a shared `store/config_lock.rs` so both profile and route services share it.

## Related Code Files
- **Create:** `src-tauri/src/commands/route.rs`, `src-tauri/src/services/route_service.rs`, `src-tauri/src/store/config_lock.rs`
- **Modify:** `src-tauri/src/lib.rs`, `src-tauri/src/commands/mod.rs`, `src-tauri/src/services/validation_service.rs` (remove lock, import shared), `src-tauri/src/services/mod.rs`, `src-tauri/src/store/mod.rs`

## Implementation Steps
1. Extract `CONFIG_MUTATION_LOCK` + `config_mutation_guard()` into `src-tauri/src/store/config_lock.rs`. **Critical:** delete the original `static CONFIG_MUTATION_LOCK` (line 15) and `fn config_mutation_guard()` (line 180) from `validation_service.rs`. Update all 3 call sites in `ValidationService` (lines ~66, ~122, ~142) to import from the shared module.
2. Export `config_lock` in `src-tauri/src/store/mod.rs`.
3. Create `src-tauri/src/services/route_service.rs` — `RouteService` with `list(profile_id)`, `add`, `update`, `delete`. Constructor takes only `ProfileConfigStore`. Add `route_service(app: &AppHandle) -> Result<RouteService, UiError>` factory function. Enforce max 100 routes per profile.
4. Create `src-tauri/src/commands/route.rs` — 4 Tauri commands wrapping the service. `update_route` and `delete_route` must verify `route.profile_id == input.profile_id` (ownership check).
5. Register commands in `lib.rs` and `commands/mod.rs`.

## Success Criteria
- [ ] `get_routes` returns empty list on fresh config.
- [ ] `add_route` persists to JSON and returns the created route.
- [ ] `add_route` rejects when profile already has 100 routes (max limit).
- [ ] Duplicate hostname per same profile is rejected with `DuplicateHostname` error.
- [ ] Invalid profile ID is rejected with clear error.
- [ ] `update_route` mutates hostname/target; verifies ownership (profile_id match).
- [ ] `delete_route` removes route; verifies ownership; non-existent id returns `RouteNotFound`.
- [ ] Only ONE `CONFIG_MUTATION_LOCK` static exists (in `config_lock.rs`); old one removed from `validation_service.rs`.
- [ ] All existing profile commands still work correctly (no regression).
- [ ] `cargo test --lib` covers validation paths (unit tests in module).
