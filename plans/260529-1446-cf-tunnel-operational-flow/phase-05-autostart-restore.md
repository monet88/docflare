---
phase: 5
title: "Autostart & Restore"
status: blocked
priority: P2
effort: "2-3d"
dependencies: [3, 4]
---

# Phase 5: Autostart & Restore

## Context Links

- Product acceptance: [Measurable Acceptance Criteria](../../docs/product/acceptance-criteria.md)
- Product security: [Security & Secret Management](../../docs/product/security-and-secrets.md)
- Product overview: [Overview](../../docs/product/overview.md)
- Validation report: [Plan Validation](../reports/plan-validation-260529-1541-cf-tunnel-operational-flow-report.md)

## Overview

Completes the target operational flow: on Windows login, the app launches minimized to tray, loads local desired state, and restores the single tunnel if any route is enabled and the last user intent was running.

Status is blocked until Phase 3 tunnel manager and Phase 4 single-instance/tray are complete.

## Key Insights

- `route.enabled` and `tunnelRunningIntent` are different state.
- Restore must reuse the same tunnel manager start path as manual Start and tray Start.
- Startup should not mutate Cloudflare when drift or missing token requires user consent.
- Autostart behavior requires manual Windows validation.

## Requirements

- Functional:
  - User can enable/disable launch at login.
  - App starts minimized/hidden to tray on boot when autostart is enabled.
  - On startup, app reads profile, routes, and tunnel metadata.
  - If routes are enabled and tunnel was previously running, app starts the tunnel without user action.
  - If reconcile is required before restore, app shows a safe warning instead of mutating Cloudflare.
  - Restore path emits the same status events as manual Start.
- Non-functional:
  - Restore reuses Phase 3 `TunnelManager`; no duplicate start logic.
  - Restore respects Phase 4 single-instance.
  - No blocking network calls on UI thread during startup.
  - Visible shell target remains < 2 seconds; tunnel connects asynchronously.

## Architecture

```text
Tauri setup
  -> configure autostart plugin
  -> setup tray/window
  -> spawn async restore task
       -> load config
       -> if should_restore: TunnelManager.start(profile)
       -> emit status events
```

Restore predicate:

```text
should_restore =
  launchAtLogin enabled
  AND tunnelRunningIntent == running
  AND at least one route.enabled == true
  AND tunnelConfig.tunnelTokenRef exists
  AND no drift state requiring consent
```

Persist runtime intent separately:

- `route.enabled`: route should exist in ingress after reconcile.
- `tunnelRunningIntent`: user wants the local tunnel process running across restarts.

## Related Code Files

- Create: `src-tauri/src/startup_restore.rs` — restore predicate and async restore runner.
- Modify: config schema — `launchAtLogin`, `startMinimized`, `tunnelRunningIntent` defaults.
- Modify: `src-tauri/src/lib.rs` — configure autostart plugin and spawn restore task after tray setup.
- Modify: `src-tauri/src/tunnel_manager.rs` — expose reusable start API for startup path.
- Create/modify: settings UI — launch-at-login and start-minimized toggles.
- Create tests: restore predicate tests, config default/migration tests, manual Windows autostart checklist.

## Implementation Steps

1. Confirm Phase 3 and Phase 4 are complete.
2. Add config fields: `launchAtLogin`, `startMinimized`, `tunnelRunningIntent`.
3. Update manual Start/Stop to persist `tunnelRunningIntent`.
4. Wire Tauri autostart plugin for Windows login startup.
5. Detect startup mode if plugin exposes it; otherwise use `startMinimized` for launch-at-login behavior.
6. In setup, initialize tray/window first, then spawn async restore task.
7. Restore task loads config, evaluates predicate, emits idle/no-op when false, or calls `TunnelManager.start` when true.
8. Emit typed warnings for missing token or drift requiring consent.
9. Validate Windows restart/session login behavior.

## Todo List

- [ ] Verify Phase 3 tunnel manager and Phase 4 single-instance/tray.
- [ ] Add autostart and startup config fields.
- [ ] Persist `tunnelRunningIntent` from manual Start/Stop.
- [ ] Add async restore task and predicate tests.
- [ ] Add settings UI toggles.
- [ ] Record manual Windows autostart validation.

## Success Criteria

- [ ] User can toggle launch at login.
- [ ] App starts minimized/hidden to tray on boot when enabled.
- [ ] Visible shell/tray is ready in < 2 seconds while tunnel connects asynchronously.
- [ ] If user left tunnel running, restart restores the tunnel automatically.
- [ ] If user stopped tunnel manually, restart does not start it just because routes are enabled.
- [ ] Restore reuses the same status events and process management as manual Start.
- [ ] Missing token or drift state produces warning, not silent mutation or crash.
- [ ] Single-instance prevents duplicate app/tunnel on repeated login launches.

## Risk Assessment

- **Autostart platform behavior:** Windows login startup can differ from dev runs. Mitigation: manual Windows validation.
- **Unexpected auto-exposure:** enabled routes alone should not start tunnel. Mitigation: require `tunnelRunningIntent`.
- **Startup race:** tray/window may not be ready before status events. Mitigation: setup tray first, then async restore.
- **Duplicate login launch:** OS startup can trigger repeated launches. Mitigation: Phase 4 single-instance prerequisite.

## Security Considerations

- Restore must not mutate Cloudflare when drift requires consent.
- Startup warnings must not include raw tokens, full command lines, or config payloads.
- Autostart config must not store secrets.
- Restore path must use keyring refs and Phase 3 redaction rules.

## Next Steps

- After this phase passes, run full MVP operational validation on Windows: add route, reconcile, start, minimize, restart, restore, stop, disable, delete.
