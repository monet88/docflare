---
title: "Route Management — Phase 1 Operational Flow"
description: "Local route CRUD: define hostname+target pairs per profile, store in JSON config, expose via Tauri commands and React UI. Cloudflare reconciliation (tunnel creation, DNS CNAME) stays in a follow-up phase."
status: pending
priority: P1
effort: 8h
branch: "master"
tags: [tauri, react, typescript, rust, route-management]
blockedBy: []
blocks: ["project:260529-1446-cf-tunnel-operational-flow"]
created: "2026-05-29T14:25:51.453Z"
createdBy: "ck:plan"
source: skill
---

# Route Management

## Overview

Adds local route CRUD so users can define which `localhost` service to expose on which hostname. Routes are stored in JSON config alongside profiles. Cloudflare tunnel creation and DNS CNAME reconciliation are scoped to a follow-up phase (this phase only reads/writes local state). Each route belongs to one profile.

### Scope boundaries

- **In:** Route model, local config persistence, list/add/edit/delete commands, React table + form UI.
- **Out:** Cloudflare tunnel creation, DNS record provisioning, `cloudflared` lifecycle, tray/autostart.

### API research (verified against current Cloudflare docs)

- **Tunnel lifecycle** (future phase): `POST /accounts/{id}/cfd_tunnel` → `PUT /accounts/{id}/cfd_tunnel/{tid}/configurations` (ingress rules) → DNS `POST /zones/{zid}/dns_records` (CNAME to `<tid>.cfargotunnel.com`).
- **Ingress shape:** array of `{hostname, service}` with mandatory catch-all `{service: "http_status:404"}`.
- **Permissions needed** (future): `Cloudflare Tunnel Write` + `Zone DNS Edit`.

## Route data model

```typescript
interface Route {
  id: string;            // UUID
  profileId: string;     // Which profile owns this route
  hostname: string;      // app.example.com
  target: string;        // http://localhost:3000
  createdAt: string;     // ISO timestamp
}
```

Rust equivalent in `src-tauri/src/domain/route.rs`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Route {
    pub id: String,
    pub profile_id: String,
    pub hostname: String,
    pub target: String,
    pub created_at: String,
}
```

## Phases

| Phase | File | Status | Depends on |
|---|---|---|---|
| 1 | [Route domain and storage](./phase-01-route-domain-and-storage.md) | Pending | none |
| 2 | [Route CRUD backend](./phase-02-route-crud-backend.md) | Pending | Phase 1 |
| 3 | [Route management UI](./phase-03-route-management-ui.md) | Pending | Phase 2 |
| 4 | [Tests and verification](./phase-04-tests-and-verification.md) | Pending | Phase 3 |

## Dependencies

- **blockedBy:** none (onboarding + multi-profile already done).
- **blocks:** `project:260529-1446-cf-tunnel-operational-flow` — this plan delivers Phase 1 of the operational flow (local route CRUD), unblocking Phase 2 (Cloudflare reconciliation).

## Config extension

`AppConfig` gains `routes: Vec<Route>`; routes are stored in the same `profile.json` and use the same atomic write path.

## Validation

- `hostname` — non-empty, RFC 1123 (`[a-zA-Z0-9.-]` only, labels 1-63 chars, no leading/trailing hyphens), no scheme, ≤253 chars.
- `target` — must start with `http://` or `https://`, must include host + optional port, max 2048 chars.
- `profileId` — must reference an existing profile in config.
- Duplicate hostname within the same profile is rejected.
- Max 100 routes per profile.

## Verification gates

- `cargo fmt`, `cargo clippy --all-targets -- -D warnings`, `cargo test` (Rust)
- `npm run build`, `npm run test`, `npm run lint` (frontend)
- Browser smoke: route table renders, add/edit/delete works, form validation catches bad input

## Validation Log

### Verification Results
- Claims checked: 12
- Verified: 12 | Failed: 0 | Unverified: 0
- Tier: Standard (Fact Checker + Contract Verifier)
- All file paths, struct names, module declarations, and API patterns confirmed against live codebase.

### Validation Session 1 (2026-05-29)

| # | Topic | Decision | Rationale |
|---|-------|----------|-----------|
| 1 | Storage location | Routes in same AppConfig JSON | Simple, atomic write shared with profiles, sufficient for MVP scale |
| 2 | Concurrency lock | Shared CONFIG_MUTATION_LOCK for both profile and route mutations | Desktop app, no throughput concern; avoids race on same file |
| 3 | Hostname uniqueness | Unique per profile (reject duplicates) | Matches Cloudflare ingress constraint (1 hostname = 1 rule) |
| 4 | Navigation pattern | Simple tab bar (Profiles \| Routes) | Minimal for 2 pages; Routes tab visible only when profile exists |
| 5 | Target format | Strict http(s)://host:port only | Matches primary use case; unix sockets deferred to future |
| 6 | RawAppConfig handling | Extend RawAppConfig with routes field + carry through From impl | Required for correct deserialization through legacy migration layer |
| 7 | Error UX | Inline per-field errors (same as onboarding form) | Consistent UX pattern across app |

### Phase Propagation
- Phase 1: Added RawAppConfig step, duplicate hostname validation, expanded success criteria.
- Phase 3: Specified tab bar navigation, inline per-field error pattern, http(s)://host:port target format.

### Whole-Plan Consistency Sweep
- plan.md Validation section already states "Duplicate hostname within the same profile is rejected" — consistent with decision #3.
- plan.md target validation says "must start with http:// or https://, must include host + optional port" — consistent with decision #5.
- Phase 2 references shared lock extraction — consistent with decision #2.
- Phase 3 references `ProfileApi` extension — consistent with existing `profile.ts` contract pattern.
- No stale terms, no contradictions found across all 4 phase files and plan.md.
- Result: **0 unresolved contradictions**.

## Red Team Review

### Session — 2026-05-29
**Findings:** 14 raw (deduplicated to 11 accepted, 3 rejected)
**Severity breakdown:** 2 Critical, 4 High, 5 Medium (accepted); 3 Medium (rejected)

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Profile mutations wipe routes (AppConfig constructed without routes field) | Critical | Accept | Phase 1 |
| 2 | Orphaned routes on profile deletion (no cascade-delete) | Critical | Accept | Phase 1 |
| 3 | Lock extraction dual-mutex risk (old static not removed) | High | Accept | Phase 2 |
| 4 | Separate RouteApi instead of extending ProfileApi | High | Accept | Phase 3 |
| 5 | No route-specific error variants in AppError | High | Accept | Phase 1 |
| 6 | Hostname validation too weak (no RFC 1123 char class) | High | Accept | Phase 1 |
| 7 | RawAppConfig From impl has 2 branches needing routes | Medium | Accept | Phase 1 |
| 8 | RouteService constructor pattern not specified | Medium | Accept | Phase 2 |
| 9 | Target URL restricted to localhost only | Medium | Reject | — |
| 10 | Max routes-per-profile limit (100) | Medium | Accept | Phase 2 |
| 11 | std::sync::Mutex vs tokio for future async | Medium | Reject | — |
| 12 | Cross-profile hostname collision warning | Medium | Reject | — |
| 13 | Phase 4 FakeSecretStore reference incorrect | Low | Accept | Phase 4 |
| 14 | Phase 2 cargo test --lib vs Phase 4 integration tests | Low | Accept | Phase 4 |

**Rejected rationale:**
- #9: YAGNI — user may proxy to LAN services; added max length (2048) instead.
- #11: Current ops are sync; tokio::Mutex is premature. Documented as tech debt for reconciliation phase.
- #12: Out of scope per plan boundaries; reconciliation phase will handle.

### Whole-Plan Consistency Sweep
- Phase 1 now lists `validation_service.rs` and `error.rs` in Related Code Files — consistent with new steps 4-5.
- Phase 2 lock extraction step explicitly states "delete old static" — no dual-mutex risk.
- Phase 3 uses separate `RouteApi` in `src/lib/tauri/route.ts` — `ProfileApi` untouched, no mock breakage.
- Phase 3 Related Code Files no longer references `onboarding-types.ts` — decoupled.
- Phase 4 removes FakeSecretStore reference — consistent with RouteService having no secret dependency.
- Phase 4 clarifies unit tests (Phase 2, in-module) vs integration tests (Phase 4, `tests/` dir).
- plan.md Validation section hostname rule matches Phase 1 RFC 1123 enforcement.
- plan.md target validation "host + optional port" + Phase 1 "max 2048 chars" — consistent.
- Result: **0 unresolved contradictions**.
