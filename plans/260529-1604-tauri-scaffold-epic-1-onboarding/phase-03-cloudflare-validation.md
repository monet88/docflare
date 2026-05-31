---
phase: 3
title: "Cloudflare validation"
status: pending
priority: P1
effort: "1d"
dependencies: ["phase-02-profile-domain-and-persistence"]
---

# Phase 3: Cloudflare validation

## Context Links

- Validation flow: `docs/superpowers/specs/2026-05-23-cloudflare-profile-onboarding-design.md:125-139`
- Preflight contract: `docs/superpowers/specs/2026-05-23-cloudflare-profile-onboarding-design.md:141-173`
- Failure contract: `docs/superpowers/specs/2026-05-23-cloudflare-profile-onboarding-design.md:176-193`
- Operational dependency on shared Cloudflare client: `plans/260529-1446-cf-tunnel-operational-flow/plan.md:35`, `phase-02-cloudflare-reconciliation.md:23`, `:54-56`

## Overview

Implement the single shared `CloudflareClient` and wire real onboarding validation into `ValidationService` using only non-mutating probes.

## Key Insights

- Onboarding must prove token/account/zone/read-access, not perform write probes (`docs/superpowers/specs/2026-05-23-cloudflare-profile-onboarding-design.md:155-161`).
- Later operational phases explicitly depend on reusing this same client; parallel clients would create drift (`plans/260529-1446-cf-tunnel-operational-flow/plan.md:35`).
- Error mapping is part of the product contract, not just implementation detail (`docs/superpowers/specs/2026-05-23-cloudflare-profile-onboarding-design.md:163-173`).

## Requirements

- Functional:
  - Add Cloudflare HTTP client using bearer token header only.
  - Implement probes for token verify, account access, zone ownership, DNS read, tunnel read.
  - Map failures to typed domain errors: `InvalidToken`, `AccountNotAccessible`, `ZoneNotFoundOrMismatch`, `InsufficientPermissions`, `CloudflareRateLimited`, `CloudflareUnavailable`.
  - Integrate validation before any secret/config write.
- Non-functional:
  - No token in logs, error strings, or UI payloads.
  - Timeouts and non-JSON responses map to `CloudflareUnavailable`.
  - Keep one client boundary reusable by later route/tunnel phases.

## Architecture

```text
validate_and_save_profile(input)
  -> ValidationService
     -> CloudflareClient.preflight(input)
        -> GET /user/tokens/verify
        -> GET /accounts/{accountId} or account list fallback
        -> GET /zones/{zoneId}
        -> GET /zones/{zoneId}/dns_records?per_page=1
        -> GET /accounts/{accountId}/cfd_tunnel?per_page=1
     -> on success only: SecretStore + ProfileConfigStore commit
```

Data flow:
- Raw token enters client request headers only.
- Cloudflare responses become typed backend results.
- Validation service either aborts with safe error or proceeds to Phase 2 persistence path.

## Related Code Files

- Create: `src-tauri/src/cloudflare/client.rs`
- Create: `src-tauri/src/cloudflare/models.rs`
- Create: `src-tauri/src/cloudflare/mod.rs`
- Modify: `src-tauri/src/services/validation_service.rs`
- Modify: `src-tauri/src/error.rs`
- Modify: `src-tauri/src/commands/profile.rs`
- Create tests: `src-tauri/tests/cloudflare_validation_tests.rs` or module-level tests with fake HTTP fixtures

## Implementation Steps

1. Define a small Cloudflare client trait/interface used by `ValidationService`.
2. Implement request helpers with authorization header injection and redacted error logging.
3. Add probe methods matching the spec contract in fixed order.
4. Implement response parsing and typed failure mapping, including 401/403/404/429/network cases.
5. Wire real preflight into `validate_and_save_profile` before any persistence call.
6. Add fake client fixtures for each contract branch.
7. Add tests for all domain error mappings and success path handoff to persistence.

## Todo List

- [ ] Add shared Cloudflare client boundary.
- [ ] Implement non-mutating preflight probes.
- [ ] Map transport/provider failures to typed app errors.
- [ ] Block persistence when validation fails.
- [ ] Add contract tests for all major failure branches.

## Success Criteria

- [ ] Token/account/zone/permission validation runs in one backend operation.
- [ ] Validation failure writes no secret and no config.
- [ ] 401/403 token rejection maps to `InvalidToken`.
- [ ] Zone/account mismatch maps to `ZoneNotFoundOrMismatch`.
- [ ] DNS/tunnel 403 maps to `InsufficientPermissions`.
- [ ] Timeout/rate-limit/unusable responses map per spec.

## Risk Assessment

- High: Wrong error mapping causes misleading UX and bad retries. Mitigation: exhaustive contract tests from spec table.
- High: Leaking token through logs or debug formatting. Mitigation: central redaction helper and no header/body debug dumps.
- Medium: Cloudflare endpoint behavior may vary by token type. Mitigation: support account-list fallback where direct account lookup is unavailable.

## Security Considerations

- Never include bearer token in request logs, panic messages, or serialized errors.
- Reject any plan to use mutating validation probes; onboarding must not create DNS records or tunnels.
- Treat Cloudflare payload text as untrusted; sanitize before surfacing summaries.

## Next Steps

- Phase 4 can consume typed errors for user messaging.
- Later operational phases must reuse this client for write operations and drift handling.