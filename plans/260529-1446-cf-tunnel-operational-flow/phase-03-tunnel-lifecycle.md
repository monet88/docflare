---
phase: 3
title: "Tunnel Lifecycle"
status: blocked
priority: P1
effort: "3-4d"
dependencies: [2, "epic-7-pinned-sidecar"]
---

# Phase 3: Tunnel Lifecycle

## Context Links

- Product security: [Security & Secret Management](../../docs/product/security-and-secrets.md)
- Product acceptance: [Measurable Acceptance Criteria](../../docs/product/acceptance-criteria.md)
- Product NFRs: [Non-Functional Requirements](../../docs/product/non-functional-requirements.md)
- Validation report: [Plan Validation](../reports/plan-validation-260529-1541-cf-tunnel-operational-flow-report.md)

## Overview

Runs the reconciled Cloudflare tunnel locally. This phase starts/stops the pinned bundled `cloudflared` sidecar from Rust, reads output to derive status, emits structured status events to React, and reconnects after unexpected disconnect.

Live/manual validation is blocked until Epic 7 provides the pinned, SHA256-verified sidecar path. Unit tests may use a fake process runner.

## Key Insights

- Production must not search system PATH for `cloudflared`.
- `cloudflared tunnel run --token <token>` can expose token in OS process args; the MVP accepts this risk only with strict redaction and keyring storage.
- The app manages one child process for the one-tunnel-many-ingress model.
- Process isolation is product acceptance: unrelated `cloudflared` processes must remain untouched.

## Cross-platform note

Per ADR [0007](../../docs/decisions/0007-cross-platform-release-pipeline.md), the
app ships for Windows, macOS, and Linux. `SidecarResolver` MUST resolve the
bundled binary via the Tauri target triple (`cloudflared-<triple>(.exe)`) — never
a PATH lookup — so it works identically across the three OSes. The Windows-only
`CREATE_NO_WINDOW` process-creation flag (no-console behaviour) must be gated
behind `#[cfg(target_os = "windows")]`; macOS and Linux spawn the sidecar without
it. No behaviour change to the requirements below — this only constrains how the
resolver and process spawn are written so they compile and run on all targets.

## Requirements

- Functional:
  - Start tunnel for active profile using `tunnelTokenRef` from keyring.
  - Stop only the app-owned child process.
  - Emit `idle`, `connecting`, `connected`, `reconnecting`, `error`, `disconnected`.
  - Include safe message text; never include raw token or full command line.
  - Retry failed startup up to 3 times with short delay.
  - Reconnect after unexpected disconnect while user intent remains running.
  - Support one running process for the profile tunnel.
- Non-functional:
  - Use bundled pinned sidecar path only.
  - Use `kill_on_drop(true)` or equivalent cleanup.
  - Do not kill unrelated `cloudflared` processes.
  - Keep one sidecar process to preserve product footprint targets.

## Architecture

```text
React UI
  -> Tauri command: set_tunnel_running(enable)
     -> TunnelManager
        -> SecretStore.get(tunnelTokenRef)
        -> SidecarResolver
        -> process runner: cloudflared tunnel run --token <token>
        -> status parser
        -> app.emit("tunnel-status-changed", TunnelStatusUpdate)
```

Port operational patterns from proxypal only: managed process state, stop signal, stderr reader task, status detection, retry/reconnect loop, and Windows no-console process creation. Do not port PATH lookup.

## Related Code Files

- Create: `src-tauri/src/tunnel_manager.rs` — running process state and start/stop loop.
- Create: `src-tauri/src/services/sidecar_resolver.rs` — resolve bundled sidecar path.
- Create: `src-tauri/src/types/tunnel_status.rs` — status payload.
- Create: `src-tauri/src/commands/tunnel.rs` — `set_tunnel_running`, `get_tunnel_status`.
- Modify: `src-tauri/src/lib.rs` — manage `TunnelManager` and register commands.
- Create: `src/lib/tauri/tunnel.ts` — invoke helpers and event listener.
- Modify: route screen — Start/Stop button, status dot, status message.
- Create tests: status parser tests, fake process runner tests, process isolation checks.

## Implementation Steps

1. Confirm Phase 2 tunnel metadata and Epic 7 sidecar path exist.
2. Define `TunnelStatusUpdate`: `profileId`, `status`, `message?`, `lastChangedAt`.
3. Implement tolerant log parser for connected, error, and disconnected states.
4. Implement `SidecarResolver`; production resolves only bundled sidecar, dev/test may use explicit override.
5. Implement `TunnelManager` with one active app-owned child process keyed by profile/tunnel id.
6. On start, load config, read keyring token, spawn sidecar, pipe output, suppress Windows console, and redact args.
7. On stop, notify and kill only the managed child process, then emit `disconnected`.
8. On unexpected exit, emit `reconnecting` and retry up to limit while running intent remains true.
9. Add UI Start/Stop and reconcile-first guidance.
10. Add parser, state transition, fake process, and manual sidecar smoke tests.

## Todo List

- [ ] Verify Phase 2 and Epic 7 prerequisites.
- [ ] Add tunnel status type and parser.
- [ ] Add sidecar resolver with no production PATH lookup.
- [ ] Add tunnel manager with app-owned child tracking.
- [ ] Add Tauri command and frontend event binding.
- [ ] Add fake process tests and live sidecar manual validation.

## Success Criteria

- [ ] User can click Start and the single tunnel reaches `connected` when Epic 7 sidecar exists.
- [ ] User can click Stop and only the app-owned child process stops.
- [ ] Unrelated `cloudflared` processes remain unaffected.
- [ ] UI receives real-time status events and shows dot/message.
- [ ] Unexpected process exit emits `reconnecting` and retries up to limit.
- [ ] Raw tunnel token never appears in logs, UI payloads, errors, or config.
- [ ] Production code does not search system PATH for `cloudflared`.
- [ ] Parser and manager tests cover connected, quick failure, auth failure, stop, and reconnect paths.

## Risk Assessment

- **Token visible in OS process list:** command args can expose token. Mitigation: keyring only, no logs/full command display, security review before release.
- **Sidecar unavailable:** live start cannot pass until Epic 7 lands. Mitigation: hard blocker plus fake process tests.
- **Flaky log parsing:** output wording can change. Mitigation: tolerant parser and process-alive fallback.
- **Process ownership confusion:** broad process kill could affect user workloads. Mitigation: track only spawned child handle.

## Security Considerations

- Never log raw args, token values, keyring refs with enough context to retrieve secrets, or full Cloudflare responses.
- UI status messages must be sanitized and token-free.
- Dev/test sidecar override must be unavailable in production builds.
- Stop/quit paths must operate only on the managed child process.

## Next Steps

- Phase 4 can use the frozen status event contract for tray state.
- If Epic 7 is not ready, limit implementation validation to parser and fake process tests, not live tunnel claims.
