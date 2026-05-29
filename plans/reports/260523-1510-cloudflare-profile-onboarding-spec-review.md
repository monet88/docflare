---
title: Cloudflare Profile Onboarding Spec Review
date: 2026-05-23
source: docs/superpowers/specs/2026-05-23-cloudflare-profile-onboarding-design.md
status: done
---

# Cloudflare Profile Onboarding Spec Review

## Summary

The spec is coherent and scoped well for a first vertical slice. It matches the PDR direction for Tauri v2 + React + Rust, local JSON metadata, Windows Credential Manager/keyring secret storage, and redacted profile reads.

Main gap: Cloudflare permission validation is specified as intent, not an implementable contract. Tighten permission probes and persistence rollback before implementation planning.

## Evidence Reviewed

- Target spec: summary and flow at `docs/superpowers/specs/2026-05-23-cloudflare-profile-onboarding-design.md:9`, scope at `:21`, backend boundaries at `:63`, data model at `:86`, validation flow at `:118`, rollback at `:136`, tests at `:157`, acceptance criteria at `:183`.
- PDR: stack at `project-overview-pdr.md:34`, secret handling at `project-overview-pdr.md:89`, measurable secret-storage acceptance at `project-overview-pdr.md:197`.
- Cloudflare API docs via Context7: token verify endpoints return token status fields such as `id`, `status`, `expires_on`, and `not_before`; they do not provide enough permission-policy detail to prove DNS/tunnel write ability by inspection alone.

## Findings

| Severity | Finding | Recommendation |
|---|---|---|
| High | Permission validation is too broad to implement safely. The spec says to confirm required MVP permissions are present or practically usable at `docs/superpowers/specs/2026-05-23-cloudflare-profile-onboarding-design.md:127`, then requires saved profiles to avoid later permission surprises at `:134`, but it does not define exact Cloudflare endpoints/probes. | Define a concrete preflight contract: token verify, account access probe, zone ownership probe, DNS access probe, tunnel access probe. If write permission cannot be verified without a mutating operation, state that explicitly and decide whether onboarding performs a harmless write/delete probe or defers write failure to the route workflow. |
| High | Rollback is safe for first-time save, but ambiguous for replacing an existing profile. The flow writes secret then config at `docs/superpowers/specs/2026-05-23-cloudflare-profile-onboarding-design.md:130`, and tests rollback on config write failure at `:163`. If an old profile exists, deleting the secret after a failed metadata write could destroy the previous working profile. | Specify first-run-only behavior, or use a candidate secret key: write candidate secret, commit config to candidate ref, then delete old secret after config success. Preserve old profile if commit fails. |
| Medium | Onboarding UX lacks API-token creation guidance. The form fields are listed at `docs/superpowers/specs/2026-05-23-cloudflare-profile-onboarding-design.md:47`, but users are not told which Cloudflare token scopes/resources to create. | Add inline copy for required token scopes/resources and a short troubleshooting message for insufficient permissions. Keep OAuth out of scope as already planned. |
| Medium | Secret handling is strong in data model, but frontend handling is not explicit. The spec bans raw tokens in config at `docs/superpowers/specs/2026-05-23-cloudflare-profile-onboarding-design.md:100` and says raw tokens are never logged/returned at `:155`; it does not say whether the token field is `password`, cleared after submit, or excluded from autocomplete/persistence. | Add frontend constraints: password-style input, no token echo after submit, clear field on success, avoid autocomplete/persistent form state, do not include token in error details or telemetry. |
| Medium | Test strategy covers unit and manual paths, but not API error mapping as a contract. Error codes are defined at `docs/superpowers/specs/2026-05-23-cloudflare-profile-onboarding-design.md:146`, and tests are listed at `:159`, but Cloudflare HTTP statuses/error payloads are not mapped to these domain errors. | Add fake Cloudflare contract cases: 401/403 token rejection, account forbidden, zone missing, zone-account mismatch, DNS forbidden, tunnel forbidden, rate limit/network failure. |
| Low | Acceptance criteria are good but not evidence-oriented. The criteria at `docs/superpowers/specs/2026-05-23-cloudflare-profile-onboarding-design.md:185` do not name commands or artifacts proving the slice works. | Add expected evidence: Rust test command, frontend test command, Tauri dev smoke run, and manual Windows keyring/config check. |

## Recommended Spec Edits Before Planning

1. Add a `Cloudflare Permission Preflight Contract` section with exact probes and expected error mapping.
2. Add a `Persistence Commit Protocol` section for new profile vs existing profile replacement.
3. Add UX helper text for required API token permissions and failure recovery.
4. Add frontend token-field constraints to the security/secret-handling language.
5. Expand tests with fake Cloudflare API responses and evidence commands.

## Overall Readiness

Ready for implementation planning after the two high-severity clarifications. Do not start code from this spec until permission preflight and replace-profile rollback semantics are settled.

## Unresolved Questions

1. Should onboarding verify write permissions with a harmless mutating probe, or only verify read access and handle write failures in the later route/tunnel workflow?
2. Is replacing an existing `default` profile in scope for this first slice, or should the flow explicitly be first-run-only?
3. Should non-Windows development support a fake/in-memory keyring only, or a real cross-platform keyring backend during local dev?

---

## Follow-up (2026-05-23 post-intake)
The original monolithic source (`project-overview-pdr.md`) has been formally decomposed per the harness model (see decision 0006 and the new living contracts under `docs/product/`). The high-level direction, security model, and acceptance criteria cited in this review remain valid. Future slices should reference the decomposed product contracts as current truth instead of the historical seed.
