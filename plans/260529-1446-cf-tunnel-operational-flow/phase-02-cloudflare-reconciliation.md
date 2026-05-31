---
phase: 2
title: "Cloudflare Reconciliation"
status: blocked
priority: P1
effort: "3-5d"
dependencies: [1, "epic-1-cloudflare-client", "epic-1-secret-store"]
---

# Phase 2: Cloudflare Reconciliation

## Context Links

- Product data model: [Data Models & Route Reconciliation](../../docs/product/data-models-and-routes.md)
- Product security: [Security & Secret Management](../../docs/product/security-and-secrets.md)
- Product acceptance: [Measurable Acceptance Criteria](../../docs/product/acceptance-criteria.md)
- Validation report: [Plan Validation](../reports/plan-validation-260529-1541-cf-tunnel-operational-flow-report.md)

## Overview

Applies local desired routes to Cloudflare actual state. This phase creates or reuses the single named tunnel for the active profile, stores the tunnel token in keyring, updates tunnel ingress rules, manages app-owned DNS CNAME records, and detects drift before destructive remote overwrite.

Status is blocked until Phase 1, onboarding `SecretStore`, and onboarding `CloudflareClient` exist.

## Key Insights

- Local JSON is desired state; Cloudflare is reconciled state.
- `preview_reconcile` must be read-only when drift requires consent.
- Only app-owned DNS records with matching `dnsRecordId` may be deleted.
- Product timing criteria require expose route < 10s and disable/delete route < 5s under stable network.

## Requirements

- Functional:
  - Ensure one named tunnel exists for the active profile.
  - Store only `tunnelId`, `tunnelName`, and `tunnelTokenRef` in local JSON.
  - Store raw tunnel token only in keyring through `SecretStore`.
  - Ensure each enabled route has a CNAME pointing to `<tunnelId>.cfargotunnel.com`.
  - Update tunnel ingress config from enabled routes.
  - Disable route removes ingress rule but keeps DNS CNAME.
  - Delete route removes ingress rule and deletes only matching app-owned `dnsRecordId`.
  - Detect drift and require explicit user consent before overwriting remote state.
- Non-functional:
  - No raw API token or tunnel token in config, logs, UI command strings, or errors.
  - Remote operations must be idempotent.
  - Reconcile must converge without duplicate tunnels, DNS records, or ingress rules.

## Architecture

```text
React Route screen
  -> Tauri commands: preview_reconcile, apply_reconcile
     -> ReconciliationService
        -> ProfileConfigStore
        -> SecretStore
        -> CloudflareClient
```

Locked model:

```text
Profile
└─ TunnelConfig
   ├─ tunnelId
   ├─ tunnelName
   └─ tunnelTokenRef

Routes[] -> enabled routes -> ingress rules + app-owned DNS CNAMEs
```

Recommended reconcile order:

1. Load profile, routes, and API token ref.
2. Ensure named tunnel exists.
3. Store new tunnel token to candidate keyring ref and atomically persist `TunnelConfig`.
4. Fetch remote ingress config and DNS records.
5. Diff local desired vs remote actual.
6. Return `DriftDetected` without mutation when consent is missing.
7. Ensure CNAME lifecycle.
8. PUT tunnel ingress config with enabled routes and final 404 catch-all.
9. Persist new `dnsRecordId` values atomically.

## Related Code Files

- Create: `src-tauri/src/types/tunnel.rs` — `TunnelConfig`, `IngressRule`, drift summary types.
- Create: `src-tauri/src/services/reconciliation_service.rs` — idempotent reconcile orchestration.
- Create/modify: `src-tauri/src/services/tunnel_config_store.rs` or profile config store extension.
- Modify: `src-tauri/src/cloudflare_client.rs` — tunnel, ingress, and DNS APIs.
- Create: `src-tauri/src/commands/reconcile.rs` — `preview_reconcile`, `apply_reconcile`.
- Modify: `src-tauri/src/lib.rs` — register reconcile commands.
- Create: `src/lib/tauri/reconcile.ts` — TypeScript binding.
- Modify: route UI — Sync/Start prep state, drift banner, consent action.
- Create tests: fake Cloudflare contract tests, fake keyring tests, reconcile idempotency tests.

## Implementation Steps

1. Confirm Phase 1 routes and onboarding services exist.
2. Extend config schema with optional `tunnelConfig` and route `dnsRecordId` defaults.
3. Add Cloudflare client methods for tunnel list/create, config get/put, DNS list/create/update/delete.
4. Implement tunnel-token commit protocol: candidate keyring write, atomic config update, previous-token cleanup, candidate cleanup on failure.
5. Implement desired ingress builder with enabled routes and catch-all 404.
6. Implement drift diff for tunnel, ingress, CNAME, missing `dnsRecordId`, and non-app-owned hostname conflicts.
7. Implement read-only preview and consented apply paths.
8. Persist `dnsRecordId` only after confirmed DNS success.
9. Add drift UI banner and action flow.
10. Add success, permission, rate-limit, drift, rollback, idempotency, and timing tests/manual checks.

## Todo List

- [ ] Verify Phase 1 and onboarding dependencies exist.
- [ ] Add tunnel config schema and token commit protocol.
- [ ] Add Cloudflare tunnel, ingress, and DNS client methods.
- [ ] Add read-only drift preview and consented apply.
- [ ] Add route lifecycle reconciliation for enabled/disabled/deleted routes.
- [ ] Add fake Cloudflare/keyring tests and timing validation.

## Success Criteria

- [ ] First reconcile creates one named tunnel and stores tunnel token only in keyring.
- [ ] Enabled routes create/update ingress rules and CNAMEs to `<tunnelId>.cfargotunnel.com`.
- [ ] Expose route succeeds in < 10 seconds under stable network.
- [ ] Disabled route removes ingress rule but keeps DNS CNAME in < 5 seconds under stable network.
- [ ] Deleted route removes ingress rule and only matching app-owned `dnsRecordId` in < 5 seconds under stable network.
- [ ] Drift returns safe summary and does not mutate until user consents.
- [ ] Re-running reconcile creates no duplicate tunnels, DNS records, or ingress rules.
- [ ] Config JSON contains `tunnelTokenRef`, never raw tunnel token.
- [ ] Fake Cloudflare tests cover success, permission errors, rate limit, drift, rollback, and idempotent re-run.

## Risk Assessment

- **Cloudflare API contract changes:** tunnel token and ingress endpoints can shift. Mitigation: isolate APIs in `CloudflareClient` and keep fake contract tests.
- **Partial remote failure:** DNS succeeds but ingress fails. Mitigation: persist only after confirmed success; next reconcile is idempotent.
- **Destructive drift overwrite:** user edited dashboard manually. Mitigation: preview-first, explicit consent before apply.
- **Timing variance:** Cloudflare latency can exceed acceptance targets. Mitigation: measure under stable network and report typed timeout/slow states.

## Security Considerations

- Raw API token and tunnel token must never enter config JSON, frontend payloads, logs, or displayable errors.
- Keyring writes must follow candidate/commit cleanup to avoid dangling active refs after config failure.
- Delete operations must be scoped to app-owned DNS records by `dnsRecordId`.
- Drift summaries must avoid leaking raw tokens or full Cloudflare response bodies.

## Next Steps

- After this phase passes, Phase 3 can run the single reconciled tunnel.
- Phase 3 live/manual validation remains blocked until the pinned sidecar from Epic 7 exists.
