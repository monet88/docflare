---
phase: 4
title: "System Tray & Single-Instance"
status: blocked
priority: P2
effort: "2-3d"
dependencies: [3]
---

# Phase 4: System Tray & Single-Instance

## Context Links

- Product acceptance: [Measurable Acceptance Criteria](../../docs/product/acceptance-criteria.md)
- Product overview: [Overview](../../docs/product/overview.md)
- Product security: [Security & Secret Management](../../docs/product/security-and-secrets.md)
- Validation report: [Plan Validation](../reports/plan-validation-260529-1541-cf-tunnel-operational-flow-report.md)

## Overview

Adds desktop shell behavior: minimize/close to tray, tray menu with tunnel status and Start/Stop actions, and a single-instance lock so repeated launches focus the existing app instead of creating duplicate tunnel managers.

Status is blocked until the Phase 3 status event contract and tunnel manager API exist.

## Key Insights

- Single-instance protects process isolation before autostart.
- Tray Start/Stop must call the same tunnel manager path as the main UI.
- Close-to-tray and Quit are different user intents.
- Windows validation is required; cross-platform behavior should stay best-effort unless Tauri support is already simple.

## Requirements

- Functional:
  - Closing the window hides to tray when `closeToTray=true`.
  - Tray menu shows app name, current tunnel status, Start/Stop, Show, and Quit.
  - Show focuses and unminimizes the existing main window.
  - Quit stops the app-owned tunnel process cleanly, then exits.
  - Single-instance lock prevents multiple app instances.
  - Second launch focuses existing window.
- Non-functional:
  - Tray must not start/stop unrelated processes.
  - Quit path must notify `TunnelManager` cleanly.
  - Keep Windows-first behavior; avoid overbuilding platform quirks.

## Architecture

```text
Tauri setup
  -> plugin single-instance
  -> setup_tray(app)
     -> Tray menu events
        -> TunnelManager.start/stop
        -> window.show/focus
        -> graceful_quit

TunnelManager status -> tray label/icon update
```

Reuse proxypal patterns only for managed state setup, tray wiring, close-to-tray gate, and app-owned process cleanup.

## Related Code Files

- Create: `src-tauri/src/tray.rs` — tray menu setup and event handling.
- Create: `src-tauri/src/window_lifecycle.rs` — close-to-tray and focus helpers.
- Modify: `src-tauri/src/lib.rs` — add single-instance plugin, setup tray, graceful shutdown.
- Modify: config schema — add or confirm `closeToTray` default true.
- Create/modify: `src/components/settings/DesktopSettings.tsx` — close-to-tray toggle if settings screen exists.
- Create tests: settings default unit tests and manual Windows tray/single-instance checklist.

## Implementation Steps

1. Confirm Phase 3 status contract and tunnel manager entrypoints exist.
2. Add Tauri single-instance plugin configuration and focus handler.
3. Add `closeToTray` setting with default true.
4. Implement window close event: hide when `closeToTray=true`, otherwise follow quit path.
5. Implement tray menu: Show, Start/Stop Tunnel, Status, Quit.
6. Subscribe tray layer to tunnel status events/state.
7. Implement graceful quit through the tunnel manager.
8. Validate on Windows: close hides, tray show restores, second launch focuses, quit stops child process.

## Todo List

- [ ] Verify Phase 3 status contract and tunnel manager API.
- [ ] Add single-instance plugin and focus handler.
- [ ] Add close-to-tray setting/default.
- [ ] Add tray menu and status updates.
- [ ] Add graceful quit path through tunnel manager.
- [ ] Record manual Windows validation.

## Success Criteria

- [ ] Closing main window hides to tray by default.
- [ ] Tray Show restores and focuses the existing window.
- [ ] Tray Start/Stop controls the same single tunnel lifecycle as the UI.
- [ ] Tray Quit stops the app-owned tunnel child and exits.
- [ ] Launching a second instance focuses the existing instance.
- [ ] No duplicate tunnel process manager is created.
- [ ] Manual Windows validation recorded.

## Risk Assessment

- **Duplicate cloudflared from duplicate app instances:** autostart can launch twice. Mitigation: single-instance blocks Phase 5.
- **Async tray state access:** tray callbacks may need cloned `AppHandle`. Mitigation: thin handlers dispatch into existing services.
- **Quit vs close ambiguity:** users expect X to minimize, Quit to exit. Mitigation: explicit Quit item and settings toggle.

## Security Considerations

- Tray status must never display raw token, keyring values, or full command lines.
- Quit must stop only the app-owned child process.
- Second-instance arguments must not be logged if they could include OS launch metadata.

## Next Steps

- After Phase 4 passes, Phase 5 can safely add launch-at-login and boot restore without duplicate tunnel managers.
