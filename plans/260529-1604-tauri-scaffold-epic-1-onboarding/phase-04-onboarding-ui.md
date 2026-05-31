---
phase: 4
title: "Onboarding UI"
status: pending
priority: P1
effort: "1d"
dependencies: ["phase-01-app-scaffold", "phase-02-profile-domain-and-persistence", "phase-03-cloudflare-validation"]
---

# Phase 4: Onboarding UI

## Context Links

- UX surface + field behavior: `docs/superpowers/specs/2026-05-23-cloudflare-profile-onboarding-design.md:44-69`
- Saved profile contract: `docs/superpowers/specs/2026-05-23-cloudflare-profile-onboarding-design.md:113-123`
- Acceptance criteria: `docs/superpowers/specs/2026-05-23-cloudflare-profile-onboarding-design.md:243-260`

## Overview

Build the single onboarding screen for API token, account ID, and zone ID entry; connect it to the backend; show loading/success/error states; render a redacted saved-profile summary.

## Key Insights

- Frontend validation is UX-only; backend remains source of truth (`plans/260529-1446-cf-tunnel-operational-flow/phase-01-route-management.md:27-29` shows same validation pattern expected in later phases).
- UI must never receive the token again after submit success (`docs/superpowers/specs/2026-05-23-cloudflare-profile-onboarding-design.md:58-69`, `:113-123`).
- Placeholder next-state is allowed, but no real dashboard/routes/tunnels should be added now (`docs/superpowers/specs/2026-05-23-cloudflare-profile-onboarding-design.md:66`).

## Requirements

- Functional:
  - Render API token, account ID, zone ID fields.
  - Block empty or whitespace-only submit.
  - Show loading state; disable duplicate submit while pending.
  - Call `validate_and_save_profile` through Tauri invoke.
  - On success: clear raw token from component state and show saved profile summary.
  - On typed backend error: render specific, safe user-facing message.
  - Show helper text for required token permissions and resource scope.
- Non-functional:
  - Token input uses password-style rendering and disables autocomplete.
  - No localStorage/sessionStorage/URL persistence for token.
  - Keep UI minimal, intentional, and limited to onboarding.

## Architecture

```text
OnboardingPage
  -> OnboardingForm state
     -> invoke(validate_and_save_profile)
        -> Rust ValidationService
     -> success => SavedProfileCard
     -> failure => InlineErrorBanner
```

Data flow:
- Token exists only in transient form state until submit completes.
- Backend returns `SavedProfile` with `tokenPresent: true`, never raw token.
- UI replaces form success state with redacted summary and optional next-step placeholder.

## Related Code Files

- Create: `src/features/onboarding/onboarding-page.tsx`
- Create: `src/features/onboarding/onboarding-form.tsx`
- Create: `src/features/onboarding/saved-profile-card.tsx`
- Create: `src/features/onboarding/onboarding-types.ts`
- Create: `src/features/onboarding/onboarding.css` or extend `src/styles.css`
- Modify: `src/app.tsx`
- Modify: `src/lib/tauri/profile.ts`
- Create tests: `src/features/onboarding/onboarding-form.test.tsx`

## Implementation Steps

1. Define frontend input/output types matching Rust command contracts.
2. Build onboarding form with controlled inputs and trimmed client-side validation.
3. Add permission helper copy from spec without over-explaining unsupported flows.
4. Implement submit state machine: idle, loading, success, error.
5. Clear token field/state immediately on success; preserve only when backend returns failure.
6. Render redacted saved-profile summary and minimal next-step placeholder.
7. Add tests for empty submit block, loading disable, success clear, and typed error rendering.

## Todo List

- [ ] Create onboarding form components.
- [ ] Wire Tauri profile command binding.
- [ ] Add loading/success/error states.
- [ ] Ensure token is cleared after success.
- [ ] Add frontend behavior tests.

## Success Criteria

- [ ] User can submit token, account ID, and zone ID.
- [ ] Empty fields do not submit.
- [ ] Duplicate submit is blocked during pending state.
- [ ] Success view shows account ID, zone ID, profile ID, last validated timestamp, token-present only.
- [ ] UI never displays or stores raw token after success.
- [ ] Typed backend errors render specific messages.

## Risk Assessment

- High: Accidental token persistence in browser state/storage. Mitigation: controlled component state only; no persistence hooks; explicit tests.
- Medium: UI/backend contract drift. Mitigation: shared TS bindings around command payload/response names.
- Medium: Overbuilding post-onboarding UI burns time and scope. Mitigation: placeholder-only next state.

## Security Considerations

- Set token input to password mode and disable autocomplete.
- Do not log form payloads in console/test debug output.
- Sanitize backend error display; show mapped messages, not raw provider payloads.

## Next Steps

- Phase 5 validates full slice with automated tests and a local smoke flow.
- Operational-flow blockers remain until this phase plus verification are complete.