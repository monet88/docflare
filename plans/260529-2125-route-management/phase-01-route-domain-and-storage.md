---
phase: 1
title: "Route domain and storage"
status: pending
effort: "2h"
dependencies: []
---

# Phase 1: Route domain and storage

## Overview
Define Rust route model, add it to `AppConfig`, implement validation, and extend the config store so routes persist alongside profiles.

## Requirements

**Functional:**
- `Route` struct with `id`, `profile_id`, `hostname`, `target`, `created_at`.
- `AppConfig` gains `routes: Vec<Route>` (serde default empty vec).
- Validate hostname and target format.
- Read/write routes through existing `ProfileConfigStore`.

**Non-functional:**
- Existing profile config reads must still work (backward-compat — missing `routes` key in JSON defaults to `[]`).
- Atomic write path via `tempfile` stays unchanged.

## Architecture
Extend the existing `src-tauri/src/domain/` module with a new `route.rs`. Keep `AppConfig` in `profile_config_store.rs` — add the `routes` field to the struct. No new store files; routes share the same JSON file.

## Related Code Files
- **Create:** `src-tauri/src/domain/route.rs`
- **Modify:** `src-tauri/src/domain/mod.rs`, `src-tauri/src/store/profile_config_store.rs`, `src-tauri/src/services/validation_service.rs`, `src-tauri/src/error.rs`

## Implementation Steps
1. Create `src-tauri/src/domain/route.rs` — `Route` struct + `CreateRouteInput` + validation helpers (`is_valid_hostname`, `is_valid_target`).
   - `is_valid_hostname`: non-empty, ≤253 chars, RFC 1123 char class only (`[a-zA-Z0-9.-]`), each label 1-63 chars, no leading/trailing hyphens, no scheme prefix.
   - `is_valid_target`: must match `http(s)://host:port` pattern, max 2048 chars.
   - `is_unique_hostname_in_profile(hostname, profile_id, existing_routes)`: reject duplicate hostname per profile.
2. Register `mod route;` in `src-tauri/src/domain/mod.rs`.
3. Add `routes: Vec<Route>` to both `AppConfig` AND `RawAppConfig` in `profile_config_store.rs` with `#[serde(default)]`. Update BOTH branches of `From<RawAppConfig> for AppConfig` (line ~39 early-return AND line ~50 match arm) to include `routes: raw.routes`.
4. Update ALL existing `AppConfig` construction sites in `validation_service.rs` to carry `routes` through from the previously-read config:
   - `upsert_profile` (~line 206): read current routes before constructing new AppConfig, pass them through.
   - `delete_profile` (~line 165): carry routes (filtered — remove routes for deleted profile) into next_config.
5. Add route-specific error variants to `src-tauri/src/error.rs`: `DuplicateHostname`, `RouteNotFound`, `InvalidHostname`, `InvalidTarget` with appropriate user messages.
6. Add unit tests for validation (invalid hostnames per RFC 1123, invalid targets, valid inputs, duplicate hostname per-profile rejection, target length >2048 rejected).

## Success Criteria
- [ ] `AppConfig` reads existing JSON without `routes` key → defaults to `[]`.
- [ ] `RawAppConfig` → `AppConfig` conversion carries routes through (BOTH branches).
- [ ] `AppConfig` with routes serializes/deserializes round-trip.
- [ ] `is_valid_hostname` enforces RFC 1123: rejects empty, scheme-containing, >253-char, non-`[a-zA-Z0-9.-]`, labels >63 chars, leading/trailing hyphens.
- [ ] `is_valid_target` rejects non-http/https schemes, empty values, >2048 chars; accepts `http://host:port` and `https://host:port`.
- [ ] Duplicate hostname within same profile is rejected by validation helper.
- [ ] Profile save (`upsert_profile`) preserves existing routes.
- [ ] Profile delete (`delete_profile`) cascade-removes routes for deleted profile.
- [ ] Route-specific error variants (`DuplicateHostname`, `RouteNotFound`, `InvalidHostname`, `InvalidTarget`) exist with correct user messages.
- [ ] `cargo test --lib` passes.
