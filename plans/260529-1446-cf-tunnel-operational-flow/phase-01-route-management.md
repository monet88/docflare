---
phase: 1
title: "Route Management"
status: blocked
priority: P1
effort: "2-3d"
dependencies: ["implementation-app-scaffold", "epic-1-onboarding-implementation"]
---

# Phase 1: Route Management

## Context Links

- Product data model: [Data Models & Route Reconciliation](../../docs/product/data-models-and-routes.md)
- Product security: [Security & Secret Management](../../docs/product/security-and-secrets.md)
- Product acceptance: [Measurable Acceptance Criteria](../../docs/product/acceptance-criteria.md)
- Validation report: [Plan Validation](../reports/plan-validation-260529-1541-cf-tunnel-operational-flow-report.md)

## Overview

Local CRUD for routes (`hostname` + `targetUrl` + `enabled`), persisted in the local JSON desired-state file. No Cloudflare calls yet; this phase is local state, validation, UI, and tests.

Current status is blocked until the implementation repo has the Tauri/React scaffold and Epic 1 onboarding store contracts.

## Key Insights

- `RouteService` extends the onboarding `ProfileConfigStore`; no parallel store.
- Rust validation is authoritative; frontend checks are UX-only.
- Route metadata is non-secret and safe to persist in local JSON.
- Phase 2 owns `dnsRecordId` population after Cloudflare DNS operations.

## Requirements

- Functional:
  - List routes, add route, edit route, toggle `enabled`, delete route.
  - Each route: `id` (uuid), `hostname`, `targetUrl`, `enabled`, optional `dnsRecordId`.
  - Allow `http://`/`https://` loopback targets: `localhost`, `127.0.0.1`, `[::1]`.
  - Warn, not block, on private LAN IP targets.
  - Block `file://`, `ftp://`, and other non-http schemes.
  - Warn when hostname is not under the active profile domain.
  - Attach routes to the single active `profileId`.
- Non-functional:
  - Reuse atomic config write with temp file + same-directory rename and Windows lock retry.
  - Default old configs to `routes: []`.
  - Do not store secrets in route objects.

## Architecture

```text
React RouteList/RouteForm
  -> Tauri commands: list_routes, save_route, delete_route, set_route_enabled
     -> RouteService
        -> ProfileConfigStore
```

Data model:

```typescript
interface Route {
  id: string;
  hostname: string;
  targetUrl: string;
  enabled: boolean;
  dnsRecordId?: string;
}
```

Typed UI-safe validation errors: `InvalidHostname`, `InvalidTargetScheme`, `TargetNotLoopback`, `DuplicateHostname`, `ConfigWriteFailed`.

## Related Code Files

- Create: `src-tauri/src/types/route.rs` — `Route` struct with camelCase serde.
- Create: `src-tauri/src/services/route_service.rs` — CRUD and validation logic.
- Create: `src-tauri/src/commands/route.rs` — Tauri route commands.
- Create: `src-tauri/src/validation/target_url.rs` — URL scheme and target classifier.
- Modify: `src-tauri/src/config.rs` or onboarding `ProfileConfigStore` — add `routes` and reuse atomic write.
- Modify: `src-tauri/src/lib.rs` — register route commands.
- Create: `src/lib/tauri/routes.ts` — TypeScript binding and `Route` interface.
- Create: `src/components/routes/RouteList.tsx`, `RouteForm.tsx` — route list and form.
- Create tests: Rust service/classifier tests and frontend form tests.

## Implementation Steps

1. Confirm scaffold and onboarding contracts exist.
2. Define Rust and TypeScript route types.
3. Implement `target_url` classifier with loopback, LAN, and blocked-scheme branches.
4. Implement `RouteService` list/save/delete/set-enabled with duplicate hostname rejection.
5. Extend config schema with `routes` defaulting to `[]`.
6. Wire Tauri commands and frontend binding.
7. Build route form/list UI with inline errors and LAN warning banner.
8. Add tests for service, classifier, persistence, and form behavior.

## Todo List

- [ ] Verify app scaffold exists before implementation.
- [ ] Verify Epic 1 `ProfileConfigStore` contract exists.
- [ ] Add route types and config default migration.
- [ ] Add authoritative Rust target/hostname validation.
- [ ] Add Tauri commands and frontend binding.
- [ ] Add route UI and tests.

## Success Criteria

- [ ] User can add, view, edit, toggle, and delete a route.
- [ ] Loopback target accepted; LAN target accepted with warning; `file://` blocked with typed error.
- [ ] Duplicate hostname rejected.
- [ ] Routes persist across app restart via atomic local JSON write.
- [ ] Config JSON contains no route secrets.
- [ ] Rust and frontend tests pass.

## Risk Assessment

- **Schema migration:** Existing onboarding JSON may not contain routes. Mitigation: serde default plus old-file load test.
- **Validation drift:** Frontend and backend checks can diverge. Mitigation: backend is source of truth; frontend is advisory.
- **Hostname scope:** Non-subdomain hostnames may be valid for advanced users. Mitigation: warn only.

## Security Considerations

- Route objects must never contain API tokens, tunnel tokens, or secret refs beyond app-owned metadata.
- Validation errors returned to UI must not include local file paths or raw config payloads.
- Target URL parsing must reject non-http schemes to avoid accidental local file exposure.

## Next Steps

- Unblock by implementing or locating the Tauri/React app scaffold and onboarding store.
- After this phase passes, Phase 2 can reconcile routes to Cloudflare and populate `dnsRecordId`.
